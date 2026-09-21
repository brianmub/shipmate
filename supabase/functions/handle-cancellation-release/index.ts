// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PLATFORM_MASKED_PROXY = '+2638677000123';

interface CancellationReleasePayload {
    order_id: string;
    event_type: 'cancellation' | 'release' | 'arrival_timer';
    actor_role: 'customer' | 'driver' | 'system';
    reason?: string;
    fee?: number;
    penalty?: number;
    distance_km?: number;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const body: CancellationReleasePayload = await req.json();
        const { order_id, event_type, actor_role, reason, fee, penalty, distance_km } = body;

        if (!order_id || !event_type) {
            return new Response(
                JSON.stringify({ error: 'order_id and event_type are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 1. Fetch Order Details
        const { data: order, error: orderErr } = await supabase
            .from('orders')
            .select(`
                id,
                order_number,
                status,
                customer_id,
                driver_id,
                service_type,
                pickup_address,
                dropoff_address,
                cumulative_distance_km
            `)
            .eq('id', order_id)
            .single();

        if (orderErr || !order) {
            return new Response(
                JSON.stringify({ error: 'Order not found', details: orderErr?.message }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 2. Fetch Customer info
        const { data: customer } = await supabase
            .from('users')
            .select('id, full_name, phone, expo_push_token')
            .eq('id', order.customer_id)
            .single();

        // 3. Fetch Driver info
        let driver: any = null;
        const driverId = order.driver_id || body.actor_role === 'driver' ? order.driver_id : null;
        if (driverId) {
            const { data: dData } = await supabase
                .from('users')
                .select('id, full_name, phone, expo_push_token')
                .eq('id', driverId)
                .single();
            driver = dData;
        }

        let pushTargetToken: string | null = null;
        let pushTitle = '';
        let pushBody = '';
        let callRecipientId: string | null = null;
        let callRecipientPhone: string | null = null;
        let callTriggerEvent = '';

        const distanceText = (distance_km || order.cumulative_distance_km || 0).toFixed(1);

        // 4. Handle Event Branches
        if (event_type === 'arrival_timer') {
            // USER DIRECTIVE: "Countdown timer must a push only no sms no whatsapp alert"
            pushTargetToken = customer?.expo_push_token || null;
            pushTitle = '🔔 Mate Outside at the Gate!';
            pushBody = 'Your courier is outside at your gate. A 5-minute arrival waiting timer has started. Please meet your courier to collect your delivery.';
            console.log(`[Arrival Timer] Pushing 5-minute arrival countdown alert to customer ${customer?.id}. (No SMS/WhatsApp sent)`);

        } else if (event_type === 'cancellation') {
            // Customer cancelled -> Counterparty is Driver
            pushTargetToken = driver?.expo_push_token || null;
            pushTitle = '❌ Order Cancelled by Customer';
            if (fee && fee > 0) {
                pushBody = `The customer cancelled this delivery. You have been credited $${fee.toFixed(2)} USD compensation for ${distanceText} km traveled.`;
            } else {
                pushBody = 'The customer cancelled this delivery request before departure.';
            }

            callRecipientId = driver?.id || null;
            callRecipientPhone = driver?.phone || order.driver_phone || null;
            callTriggerEvent = 'auto_cancellation';

        } else if (event_type === 'release') {
            // Driver released -> Counterparty is Customer
            pushTargetToken = customer?.expo_push_token || null;
            pushTitle = '⚡ Re-opening your job for bids';
            
            let formattedReason = 'unforeseen courier issue';
            if (reason === 'mechanical_issue') formattedReason = 'vehicle / mechanical issue';
            if (reason === 'store_closed') formattedReason = 'store or pickup location was closed';
            if (reason === 'customer_no_show') formattedReason = 'recipient not reachable after waiting';

            pushBody = `Your previous Mate had to release this delivery (${formattedReason}). We have automatically prioritized your delivery and reopened it for nearby Mates to bid.`;

            callRecipientId = customer?.id || null;
            callRecipientPhone = customer?.phone || order.customer_phone || order.payment_phone || order.recipient_phone || null;
            callTriggerEvent = 'auto_release';
        }

        // 5. Send Free Push Notification if token exists
        let pushSent = false;
        if (pushTargetToken && pushTargetToken.startsWith('ExponentPushToken')) {
            try {
                const pushResponse = await fetch(EXPO_PUSH_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: pushTargetToken,
                        title: pushTitle,
                        body: pushBody,
                        sound: 'default',
                        priority: 'high',
                        data: {
                            orderId: order_id,
                            eventType: event_type,
                            reason: reason || null
                        }
                    })
                });
                pushSent = pushResponse.ok;
                console.log(`[Push Notification] Dispatched to ${pushTargetToken}: ${pushTitle}`);
            } catch (pErr: any) {
                console.warn('[Push Notification Warning]:', pErr?.message);
            }
        }

        // 6. Auto-Initiated Call (For cancellation and release only; NEVER for arrival timer)
        let callLogRecorded = false;
        if (callTriggerEvent && callRecipientId) {
            console.log(`[Auto-Initiated Call] Initiating masked call to recipient ${callRecipientId} for event ${callTriggerEvent}...`);
            
            // Check for Twilio Voice / Africa's Talking Voice in environment
            const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
            const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
            const twilioVoiceNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

            let callStatus = 'simulated';
            if (twilioSid && twilioToken && twilioVoiceNumber && callRecipientPhone) {
                try {
                    const twilioVoiceUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`;
                    const formData = new URLSearchParams();
                    formData.append('To', callRecipientPhone);
                    formData.append('From', twilioVoiceNumber);
                    formData.append('Twiml', `<Response><Say voice="alice">ShipMate automated alert: Your delivery status has been updated. Please check the ShipMate app for details.</Say></Response>`);

                    const callRes = await fetch(twilioVoiceUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioToken}`),
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: formData.toString()
                    });
                    callStatus = callRes.ok ? 'completed' : 'failed';
                } catch (vErr: any) {
                    console.error('[Telephony Voice Warning]:', vErr?.message);
                    callStatus = 'failed';
                }
            } else {
                console.log(`[SIMULATED MASKED AUTO-CALL] Destination: ${callRecipientPhone || 'Proxy'} | Trigger: ${callTriggerEvent}`);
                callStatus = 'simulated';
            }

            // Single unified logging path into masked_call_logs
            const callerPhone = actor_role === 'driver' 
                ? (order.driver_phone || driver?.phone) 
                : (order.customer_phone || customer?.phone || order.payment_phone);

            const { error: logErr } = await supabase.from('masked_call_logs').insert([{
                order_id: order_id,
                caller_id: actor_role === 'driver' ? driver?.id : customer?.id,
                caller_phone: callerPhone || null,
                caller_role: 'system',
                recipient_id: callRecipientId,
                recipient_phone: callRecipientPhone,
                masked_proxy_number: PLATFORM_MASKED_PROXY,
                status: callStatus,
                duration_seconds: callStatus === 'completed' ? 15 : 0,
                trigger_event: callTriggerEvent
            }]);

            if (logErr) {
                console.error('Error recording masked call log:', logErr);
            } else {
                callLogRecorded = true;
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                order_id,
                event_type,
                push_sent: pushSent,
                call_logged: callLogRecorded
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (err: any) {
        console.error('handle-cancellation-release error:', err);
        return new Response(
            JSON.stringify({ error: err.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
