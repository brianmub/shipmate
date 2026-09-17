// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const expoPushURL = 'https://exp.host/--/api/v2/push/send'
const recentDispatches = new Map<string, number>();

interface DispatchNotification {
    to: string;
    sound: string;
    priority: string;
    channelId: string;
    title: string;
    body: string;
    data: Record<string, any>;
}

/**
 * Send an array of notifications to the Expo Push API in chunks of 100
 */
async function sendExpoNotifications(notifications: DispatchNotification[]) {
    if (!notifications || notifications.length === 0) return null;

    const chunkSize = 100;
    const results = [];

    for (let i = 0; i < notifications.length; i += chunkSize) {
        const chunk = notifications.slice(i, i + chunkSize);
        try {
            const response = await fetch(expoPushURL, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(chunk),
            });
            const result = await response.json();
            results.push(result);
        } catch (err) {
            console.error("Error sending Expo push chunk:", err);
        }
    }

    return results;
}

/**
 * Query eligible active couriers from Supabase.
 * Tries the database RPC helper first, then falls back to relational queries.
 */
async function fetchEligibleCouriers(
    supabaseClient: any,
    tierFilter: string | null = null,
    excludeIds: string[] = []
): Promise<Array<{ driver_id: string; expo_push_token: string; tier: string; full_name?: string }>> {
    try {
        const { data, error } = await supabaseClient.rpc('get_eligible_couriers_for_dispatch', {
            p_tier_filter: tierFilter,
            p_exclude_ids: excludeIds
        });

        if (!error && Array.isArray(data)) {
            return data;
        }

        if (error) {
            console.warn("RPC get_eligible_couriers_for_dispatch unavailable, using fallback query:", error.message);
        }
    } catch (rpcErr) {
        console.warn("RPC invocation caught error, falling back:", rpcErr);
    }

    // Fallback: Query users table joined with drivers
    try {
        let query = supabaseClient
            .from('users')
            .select(`
                id,
                expo_push_token,
                full_name,
                drivers!inner (
                    id,
                    tier,
                    is_online
                )
            `)
            .eq('role', 'driver')
            .not('expo_push_token', 'is', null)
            .eq('drivers.is_online', true);

        if (tierFilter) {
            query = query.eq('drivers.tier', tierFilter);
        }

        const { data: drivers, error } = await query;
        if (error) throw error;

        const excludeSet = new Set(excludeIds);
        return (drivers || [])
            .filter((d: any) => !excludeSet.has(d.id))
            .map((d: any) => ({
                driver_id: d.id,
                expo_push_token: d.expo_push_token,
                tier: d.drivers?.tier || 'standard',
                full_name: d.full_name
            }));
    } catch (fallbackErr: any) {
        console.error("Fallback courier query failed:", fallbackErr.message);
        return [];
    }
}

/**
 * Phase 2 background task: Wait 30 seconds, re-check order status,
 * and if still unassigned, broadcast to all remaining online couriers.
 */
async function handlePhase2SecondaryBroadcast(
    supabaseClient: any,
    orderId: string,
    notifiedDriverIds: string[]
) {
    console.log(`Phase 2: Started 30s priority timer for order ${orderId}...`);
    await new Promise((resolve) => setTimeout(resolve, 30000));

    try {
        // Re-check order status from DB
        const { data: latestOrder, error } = await supabaseClient
            .from('orders')
            .select('id, status, driver_id, service_type, estimated_cost, pickup_address')
            .eq('id', orderId)
            .single();

        if (error) {
            console.error(`Phase 2: Failed to fetch order ${orderId}:`, error.message);
            return;
        }

        // Abort if order was already accepted, assigned, or cancelled
        if (latestOrder.status !== 'pending' || latestOrder.driver_id !== null) {
            console.log(`Phase 2: Order ${orderId} already claimed by driver ${latestOrder.driver_id} (status: ${latestOrder.status}). Secondary broadcast cancelled.`);
            return;
        }

        console.log(`Phase 2: Order ${orderId} remains unassigned after 30s. Triggering secondary broadcast...`);

        // Fetch all remaining eligible couriers (excluding those who got Phase 1)
        const secondaryCouriers = await fetchEligibleCouriers(supabaseClient, null, notifiedDriverIds);

        if (!secondaryCouriers || secondaryCouriers.length === 0) {
            console.log("Phase 2: No additional active couriers found for broadcast.");
            return;
        }

        const notifications: DispatchNotification[] = secondaryCouriers.map((c) => ({
            to: c.expo_push_token,
            sound: 'default',
            priority: 'high',
            channelId: 'default',
            title: 'New Delivery Request! 🚚',
            body: `A new ${latestOrder.service_type || 'Delivery'} is now available. Earn $${latestOrder.estimated_cost || 0}.`,
            data: {
                orderId: latestOrder.id,
                phase: 'general_broadcast',
                isPlatinumPriority: false,
                serviceType: latestOrder.service_type,
                estimatedCost: latestOrder.estimated_cost
            }
        }));

        const expoResult = await sendExpoNotifications(notifications);
        console.log(`Phase 2: Dispatched secondary broadcast to ${notifications.length} couriers:`, expoResult);
    } catch (err: any) {
        console.error(`Phase 2: Error executing secondary broadcast for order ${orderId}:`, err.message);
    }
}

serve(async (req: any) => {
    try {
        const payload = await req.json();
        console.log("notify-drivers payload received:", JSON.stringify(payload));

        // Ignore webhooks not targeting orders insert
        if (payload.type && (payload.type !== 'INSERT' || payload.table !== 'orders')) {
            return new Response(JSON.stringify({ message: 'Ignored: Not a new order insert' }), { status: 200 });
        }

        let newOrder = payload.record || payload.order;
        const orderId = newOrder?.id || payload.order_id;

        // Setup Supabase admin client
        const supabaseClient = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Fetch full order if missing essential fields
        if (!newOrder && orderId) {
            const { data: fetchedOrder, error } = await supabaseClient
                .from('orders')
                .select('*')
                .eq('id', orderId)
                .single();
            if (error || !fetchedOrder) {
                return new Response(JSON.stringify({ error: `Order ${orderId} not found` }), { status: 404 });
            }
            newOrder = fetchedOrder;
        }

        if (!newOrder || !newOrder.id) {
            return new Response(JSON.stringify({ error: 'Missing valid order payload' }), { status: 400 });
        }

        // Debounce duplicate dispatches within 10 seconds
        const lastSent = recentDispatches.get(newOrder.id);
        if (lastSent && Date.now() - lastSent < 10000) {
            console.log(`Order ${newOrder.id} dispatch debounced: already triggered ${Date.now() - lastSent}ms ago.`);
            return new Response(JSON.stringify({ message: 'Debounced: duplicate dispatch within 10s', orderId: newOrder.id }), {
                headers: { "Content-Type": "application/json" },
                status: 200,
            });
        }
        recentDispatches.set(newOrder.id, Date.now());

        // -------------------------------------------------------------
        // PHASE 1: Platinum Early Access (Immediate, T = 0s)
        // -------------------------------------------------------------
        const platinumCouriers = await fetchEligibleCouriers(supabaseClient, 'platinum', []);
        const notifiedDriverIds: string[] = [];

        if (platinumCouriers.length > 0) {
            const priorityNotifications: DispatchNotification[] = platinumCouriers.map((courier) => {
                notifiedDriverIds.push(courier.driver_id);
                return {
                    to: courier.expo_push_token,
                    sound: 'default',
                    priority: 'high',
                    channelId: 'default',
                    title: '⚡ Platinum Early Access: New delivery request near you!',
                    body: `Exclusive 30s priority window: ${newOrder.service_type || 'Delivery'} ($${newOrder.estimated_cost || 0}) from ${newOrder.pickup_address || 'Pickup'}. Tap to accept now!`,
                    data: {
                        orderId: newOrder.id,
                        phase: 'platinum_priority',
                        isPlatinumPriority: true,
                        serviceType: newOrder.service_type,
                        estimatedCost: newOrder.estimated_cost,
                        priorityWindowEndsAt: newOrder.priority_window_ends_at
                    }
                };
            });

            await sendExpoNotifications(priorityNotifications);
            console.log(`Phase 1: Dispatched Platinum priority push to ${priorityNotifications.length} couriers.`);
        } else {
            console.log("Phase 1: No active Platinum couriers online with push tokens. Awaiting Phase 2 broadcast.");
        }

        // -------------------------------------------------------------
        // PHASE 2: 30-Second Priority Window & Secondary Broadcast
        // -------------------------------------------------------------
        const phase2Promise = handlePhase2SecondaryBroadcast(supabaseClient, newOrder.id, notifiedDriverIds);

        // Schedule background execution in Deno/EdgeRuntime if available
        // @ts-ignore
        if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
            // @ts-ignore
            EdgeRuntime.waitUntil(phase2Promise);
        } else {
            // Non-blocking promise handling in local/standard environments
            phase2Promise.catch((err) => console.error("Unhandled phase 2 error:", err));
        }

        return new Response(JSON.stringify({
            success: true,
            phase1CouriersNotified: notifiedDriverIds.length,
            priorityWindowDurationSeconds: 30,
            secondaryBroadcastScheduled: true
        }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
        });

    } catch (err) {
        const error = err as Error;
        console.error("Error in notify-drivers function:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { "Content-Type": "application/json" },
            status: 400,
        });
    }
});
