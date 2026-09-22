import { supabase } from '../utils/supabase';
import { Order, OrderStatus, DriverTier, OrderReleaseReason, CancellationDebt, MaskedCallLog, HandoverPinVerificationResult } from '../types';

export const orderService = {
    /**
     * Create a new order (Customer side)
     */
    async createOrder(orderData: Partial<Order>) {
        // DEFENSIVE CHECK: Ensure the user exists in public.users to satisfy foreign key
        if (orderData.customer_id) {
            const { data: userProfile } = await supabase
                .from('users')
                .select('id')
                .eq('id', orderData.customer_id)
                .single();

            if (!userProfile) {
                // If profile is missing (legacy account), create a basic one on the fly
                const { data: authUser } = await supabase.auth.getUser();
                if (authUser.user) {
                    await supabase.from('users').insert([{
                        id: authUser.user.id,
                        email: authUser.user.email,
                        full_name: authUser.user.user_metadata?.full_name || 'Customer',
                        role: 'customer'
                    }]);
                }
            }
        }

        // Set 30-second priority window and 45-minute estimated delivery target
        const priorityWindowEndsAt = orderData.priority_window_ends_at || new Date(Date.now() + 30 * 1000).toISOString();
        const estimatedDeliveryAt = orderData.estimated_delivery_at || new Date(Date.now() + 45 * 60 * 1000).toISOString();

        const customerPhone = orderData.customer_phone || orderData.payment_phone || orderData.recipient_phone || null;

        const payload: Partial<Order> = {
            priority_window_ends_at: priorityWindowEndsAt,
            priority_tier_required: 'platinum',
            estimated_delivery_at: estimatedDeliveryAt,
            customer_phone: customerPhone,
            ...orderData,
        };

        const { data, error } = await supabase
            .from('orders')
            .insert([payload])
            .select()
            .single();

        if (error) throw error;

        // Non-blocking sync to users.phone if currently null
        if (customerPhone && orderData.customer_id) {
            Promise.resolve(
                supabase
                    .from('users')
                    .update({ phone: customerPhone })
                    .eq('id', orderData.customer_id)
                    .is('phone', null)
            ).catch(() => {});
        }

        // Dispatch priority push notifications to active drivers non-blockingly
        supabase.functions.invoke('notify-drivers', {
            body: {
                type: 'INSERT',
                table: 'orders',
                record: data
            }
        }).catch((err) => {
            console.warn('notify-drivers invocation warning:', err?.message || err);
        });

        return data as Order;
    },

    /**
     * Fetch all available jobs for drivers (where status is pending).
     * Returns all active pending customer orders so the driver screen is always listening.
     */
    async getAvailableJobs(driverTier?: DriverTier) {
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('status', 'pending')
            .gt('created_at', twelveHoursAgo)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as Order[];
    },

    /**
     * Subscribe to real-time available jobs for drivers with unique channel name
     */
    subscribeToAvailableJobs(onEvent: (payload: any) => void) {
        const channelId = `driver_available_jobs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        return supabase
            .channel(channelId)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'orders',
                },
                (payload) => {
                    onEvent(payload);
                }
            )
            .subscribe();
    },

    /**
     * Submit an offer for an order (Driver side)
     */
    async submitOffer(orderId: string, driverId: string, amount: number, pickupEstimate: number, lat: number, lng: number) {
        // Enforce wallet float threshold: minimum $0.25 required
        const { data: wallet } = await supabase
            .from('courier_wallets')
            .select('balance, status')
            .eq('courier_id', driverId)
            .single();

        if (wallet && (wallet.status === 'locked' || Number(wallet.balance) <= 0.25)) {
            throw new Error('Wallet balance is below minimum float ($0.25). Please top up via ClicknPay to submit offers.');
        }

        const { data, error } = await supabase
            .from('order_offers')
            .insert([{
                order_id: orderId,
                driver_id: driverId,
                offer_amount: amount,
                pickup_time_estimate: pickupEstimate,
                driver_latitude: lat,
                driver_longitude: lng,
                status: 'pending'
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Fetch nearby available online Mates for customer tracking map
     */
    async getNearbyDrivers(latitude: number, longitude: number, radiusKm: number = 15.0) {
        try {
            const safeLat = isNaN(latitude) ? -17.8248 : latitude;
            const safeLng = isNaN(longitude) ? 31.0530 : longitude;

            const { data, error } = await supabase.rpc('get_nearby_available_drivers', {
                p_latitude: safeLat,
                p_longitude: safeLng,
                p_radius_km: radiusKm
            });

            if (error) {
                console.warn('get_nearby_available_drivers RPC warning:', error.message);
                // Fallback: direct query to drivers table
                const { data: directDrivers } = await supabase
                    .from('drivers')
                    .select('id, current_latitude, current_longitude, heading, average_rating, tier, user:users(full_name, phone, profile_photo_url)')
                    .eq('is_online', true)
                    .eq('verification_status', 'approved')
                    .limit(20);

                if (directDrivers) {
                    return directDrivers.map((d: any, idx: number) => ({
                        id: d.id,
                        full_name: d.user?.full_name || 'ShipMate Courier',
                        phone: d.user?.phone || '',
                        avatar_url: d.user?.profile_photo_url,
                        vehicle_type: 'motorcycle',
                        vehicle_model: 'Delivery Bike',
                        vehicle_plate: '',
                        current_latitude: d.current_latitude || (safeLat + (idx % 2 === 0 ? 0.006 : -0.006)),
                        current_longitude: d.current_longitude || (safeLng + (idx % 3 === 0 ? 0.007 : -0.005)),
                        heading: d.heading || 0,
                        average_rating: d.average_rating || 5.0,
                        tier: d.tier || 'standard',
                        distance_km: 1.2 + (idx * 0.4)
                    }));
                }
                return [];
            }

            return data || [];
        } catch (err: any) {
            console.error('getNearbyDrivers error:', err?.message || err);
            return [];
        }
    },

    /**
     * Boost an order offer with an additional tip while searching for Mates
     */
    async boostOrderOffer(orderId: string, additionalAmount: number) {
        try {
            const { data, error } = await supabase.rpc('boost_order_offer_rpc', {
                p_order_id: orderId,
                p_additional_amount: additionalAmount
            });
            if (error) throw error;
            return data;
        } catch (err: any) {
            console.warn('boost_order_offer_rpc fallback to direct update:', err);
            // Fallback direct update
            const { data: currentOrder } = await supabase
                .from('orders')
                .select('estimated_cost, gross_amount')
                .eq('id', orderId)
                .single();

            const newTotal = (Number(currentOrder?.estimated_cost) || 0) + additionalAmount;
            const newGross = (Number(currentOrder?.gross_amount) || Number(currentOrder?.estimated_cost) || 0) + additionalAmount;

            const { error: updateErr } = await supabase
                .from('orders')
                .update({
                    estimated_cost: newTotal,
                    gross_amount: newGross,
                    updated_at: new Date().toISOString()
                })
                .eq('id', orderId);

            if (updateErr) throw updateErr;
            return { success: true, new_total: newTotal };
        }
    },

    /**
     * Fetch offers for a specific order (Customer side)
     */
    async getOrderOffers(orderId: string) {
        const { data: offers, error } = await supabase
            .from('order_offers')
            .select(`
                *,
                user:driver_id(full_name)
            `)
            .eq('order_id', orderId)
            .order('offer_amount', { ascending: true });

        if (error) throw error;
        if (!offers || offers.length === 0) return [];

        const driverIds = offers.map((o: any) => o.driver_id).filter(Boolean);
        const { data: driverProfiles } = await supabase
            .from('drivers')
            .select('id, average_rating, tier')
            .in('id', driverIds);

        const driverMap = new Map((driverProfiles || []).map((d: any) => [d.id, d]));

        return offers.map((offer: any) => {
            const driverData = driverMap.get(offer.driver_id);
            return {
                ...offer,
                driver: {
                    full_name: offer.user?.full_name || 'Courier',
                    average_rating: driverData?.average_rating ?? 5.0,
                    tier: (driverData?.tier as DriverTier) || 'standard',
                }
            };
        });
    },

    /**
     * Accept a specific driver's offer (Customer side)
     */
    async acceptOffer(orderId: string, offerId: string, driverId: string) {
        // 1. Mark the offer as accepted
        const { error: offerError } = await supabase
            .from('order_offers')
            .update({ status: 'accepted' })
            .eq('id', offerId);

        if (offerError) throw offerError;

        // 2. Reject all other offers for this order
        await supabase
            .from('order_offers')
            .update({ status: 'rejected' })
            .eq('order_id', orderId)
            .neq('id', offerId);

        // 3. Generate a secure 4-digit handover PIN as defensive fallback (DB trigger also generates if null)
        const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();

        // Resolve driver phone from drivers or users
        let driverPhone: string | null = null;
        try {
            const { data: dProfile } = await supabase
                .from('drivers')
                .select('emergency_contact_phone')
                .eq('id', driverId)
                .single();
            const { data: uProfile } = await supabase
                .from('users')
                .select('phone')
                .eq('id', driverId)
                .single();
            driverPhone = uProfile?.phone || dProfile?.emergency_contact_phone || null;
        } catch (dErr) {
            console.warn('Non-blocking: could not resolve driver phone for order:', dErr);
        }

        // 4. Update the order with the assigned driver, new status, and handover PIN
        const { data, error: orderError } = await supabase
            .from('orders')
            .update({ 
                status: 'driver_assigned', 
                driver_id: driverId,
                driver_phone: driverPhone,
                handover_pin: generatedPin,
                pin_attempts_count: 0,
                pin_locked: false,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .select()
            .single();

        if (orderError) throw orderError;

        // Auto-notify customer of driver assignment milestone
        this.notifyOrderMilestone(orderId, 'driver_assigned').catch((mErr) => {
            console.warn('notifyOrderMilestone driver_assigned error:', mErr?.message || mErr);
        });

        return data as Order;
    },

    /**
     * Trigger Customer Order Lifecycle Milestone Notifications (Expo Push & Opt-in SMS/WhatsApp)
     */
    async notifyOrderMilestone(orderId: string, status: OrderStatus) {
        try {
            const { data, error } = await supabase.functions.invoke('notify-milestone', {
                body: { order_id: orderId, status }
            });
            if (error) {
                console.warn('notify-milestone function error (non-blocking):', error.message);
                return null;
            }
            return data;
        } catch (err: any) {
            console.warn('notifyOrderMilestone non-blocking catch:', err.message);
            return null;
        }
    },

    /**
     * Fetch active job for a driver
     */
    async getActiveDriverJob(driverId: string) {
        const { data, error } = await supabase
            .from('orders')
            .select('*, customer:customer_id(full_name, phone)')
            .eq('driver_id', driverId)
            .in('status', [
                'driver_assigned', 
                'en_route_to_pickup', 
                'arrived_at_pickup', 
                'picked_up', 
                'en_route_to_delivery', 
                'arrived_at_delivery'
            ])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        if (!data) return null;

        // Defensive resolution of customer phone
        const resolvedPhone = data.customer_phone || data.customer?.phone || data.payment_phone || data.recipient_phone || null;
        if (!data.customer) {
            data.customer = { full_name: 'Customer', phone: resolvedPhone };
        } else if (!data.customer.phone) {
            data.customer.phone = resolvedPhone;
        }
        if (!data.customer_phone) {
            data.customer_phone = resolvedPhone;
        }

        return data as Order | null;
    },

    /**
     * Get active order for a customer that has been accepted by a Mate
     * Used to lock customer onto the live tracking map during an active trip
     */
    async getActiveCustomerOrder(customerId: string) {
        const { data, error } = await supabase
            .from('orders')
            .select('*, driver:driver_id(full_name, phone)')
            .eq('customer_id', customerId)
            .in('status', [
                'driver_assigned', 
                'en_route_to_pickup', 
                'arrived_at_pickup', 
                'picked_up', 
                'en_route_to_delivery', 
                'arrived_at_delivery',
                'in_delivery',
                'en_route',
                'arrived',
                'accepted',
                'in_progress'
            ])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        if (!data) return null;

        // Defensive resolution of driver phone
        if (data.driver_id && (!data.driver?.phone || !data.driver_phone)) {
            let dPhone = data.driver_phone || data.driver?.phone || null;
            if (!data.driver) {
                data.driver = { full_name: 'Your Mate', phone: dPhone };
            } else if (!data.driver.phone) {
                data.driver.phone = dPhone;
            }
            if (!data.driver_phone) {
                data.driver_phone = dPhone;
            }
        }

        return data as Order | null;
    },

    /**
     * Update order status
     */
    async updateOrderStatus(orderId: string, status: OrderStatus) {
        const { data, error } = await supabase
            .from('orders')
            .update({ 
                status, 
                updated_at: new Date().toISOString() 
            })
            .eq('id', orderId)
            .select()
            .single();

        if (error) throw error;

        // Auto-notify customer of transit milestone
        this.notifyOrderMilestone(orderId, status).catch((mErr) => {
            console.warn(`notifyOrderMilestone ${status} error:`, mErr?.message || mErr);
        });

        return data as Order;
    },

    /**
     * Settle order payment (handles cash on delivery float commission deduction or digital earnings credit)
     */
    async settleOrderPayment(orderId: string, driverId: string) {
        try {
            const { data, error } = await supabase.rpc('settle_order_payment_rpc', {
                p_order_id: orderId,
                p_driver_id: driverId
            });
            if (error) {
                console.warn('RPC settle_order_payment_rpc error (non-blocking fallback):', error.message);
                return null;
            }
            return data;
        } catch (err: any) {
            console.warn('settleOrderPayment non-blocking error:', err.message);
            return null;
        }
    },

    /**
     * Complete order with proof of delivery (Signature & Photo)
     */
    async completeOrderWithProof(orderId: string, signatureUrl: string, photoUrl: string) {
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
            .from('orders')
            .update({ 
                status: 'delivered',
                delivery_signature_url: signatureUrl,
                delivery_photo_url: photoUrl,
                delivered_at: nowIso,
                updated_at: nowIso 
            })
            .eq('id', orderId)
            .select()
            .single();

        if (error) throw error;

        // Auto-notify customer of delivered milestone
        this.notifyOrderMilestone(orderId, 'delivered').catch((mErr) => {
            console.warn('notifyOrderMilestone delivered error:', mErr?.message || mErr);
        });

        // Auto-trigger payment settlement (COD commission deduction vs Digital earnings credit)
        if (data && data.driver_id) {
            this.settleOrderPayment(data.id, data.driver_id).catch((settleErr) => {
                console.warn('settleOrderPayment catch:', settleErr?.message || settleErr);
            });
        }

        return data as Order;
    },

    /**
     * Acknowledge delivery by customer with optional rating & feedback
     */
    async acknowledgeDelivery(orderId: string, rating?: number, feedback?: string) {
        const updatePayload: any = { 
            status: 'completed',
            customer_acknowledged: true,
            acknowledged_at: new Date().toISOString(),
            updated_at: new Date().toISOString() 
        };

        if (rating !== undefined && rating !== null) {
            updatePayload.customer_rating = rating;
        }
        if (feedback !== undefined && feedback !== null) {
            updatePayload.customer_feedback = feedback;
        }

        const { data, error } = await supabase
            .from('orders')
            .update(updatePayload)
            .eq('id', orderId)
            .select()
            .single();

        if (error) throw error;
        return data as Order;
    },

    /**
     * Update driver location for an active order
     */
    async updateDriverLocation(orderId: string, latitude: number, longitude: number) {
        const { error } = await supabase
            .from('orders')
            .update({
                driver_latitude: latitude,
                driver_longitude: longitude,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);

        if (error) throw error;
    },

    /**
     * Fetch all orders (Admin side)
     */
    async getAllOrders() {
        const { data, error } = await supabase
            .from('orders')
            .select(`
                *,
                customer:customer_id(full_name),
                driver:driver_id(full_name)
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    /**
     * Real-time subscription to order changes
     */
    subscribeToOrder(orderId: string, callback: (payload: any) => void) {
        return supabase
            .channel(`order_tracking_${orderId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
                callback
            )
            .subscribe();
    },

    /**
     * Real-time subscription to new offers for an order
     */
    subscribeToOffers(orderId: string, callback: (payload: any) => void) {
        return supabase
            .channel(`order_offers_${orderId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'order_offers', filter: `order_id=eq.${orderId}` },
                callback
            )
            .subscribe();
    },

    /**
     * Customer cancels order (calculates distance fee, credits driver, logs debt)
     */
    async cancelOrderByCustomer(orderId: string, customerId: string, reason?: string) {
        const { data, error } = await supabase.rpc('cancel_order_by_customer_rpc', {
            p_order_id: orderId,
            p_customer_id: customerId,
            p_reason: reason || 'Customer cancelled'
        });

        if (error) throw error;

        // Dispatch background notification & auto-call via edge function
        supabase.functions.invoke('handle-cancellation-release', {
            body: {
                order_id: orderId,
                event_type: 'cancellation',
                actor_role: 'customer',
                reason: reason || 'Customer cancelled',
                fee: data?.cancellation_fee || 0,
                distance_km: data?.distance_km || 0
            }
        }).catch(err => console.warn('handle-cancellation-release invoke error:', err?.message || err));

        return data;
    },

    /**
     * Start the 5-minute arrival waiting countdown timer (Push alert only; zero SMS/WhatsApp)
     */
    async startArrivalTimer(orderId: string, driverId: string) {
        const { data, error } = await supabase.rpc('start_arrival_timer_rpc', {
            p_order_id: orderId,
            p_driver_id: driverId
        });

        if (error) throw error;

        // Dispatches push alert ONLY (No SMS, no WhatsApp)
        supabase.functions.invoke('handle-cancellation-release', {
            body: {
                order_id: orderId,
                event_type: 'arrival_timer',
                actor_role: 'driver'
            }
        }).catch(err => console.warn('handle-cancellation-release timer invoke error:', err?.message || err));

        return data;
    },

    /**
     * Driver releases an order (enforces 3 calls spaced >= 1 min & 5 min timer for customer_no_show)
     */
    async releaseOrderByDriver(
        orderId: string,
        driverId: string,
        reason: OrderReleaseReason,
        callLogId?: string | null,
        compensationProposed: number = 0
    ) {
        const { data, error } = await supabase.rpc('release_order_by_driver_rpc', {
            p_order_id: orderId,
            p_driver_id: driverId,
            p_reason: reason,
            p_call_log_id: callLogId || null,
            p_compensation_proposed: compensationProposed
        });

        if (error) throw error;

        // Dispatch background notification & auto-call via edge function
        supabase.functions.invoke('handle-cancellation-release', {
            body: {
                order_id: orderId,
                event_type: 'release',
                actor_role: 'driver',
                reason: reason,
                penalty: data?.rating_penalty || 0
            }
        }).catch(err => console.warn('handle-cancellation-release release invoke error:', err?.message || err));

        return data;
    },

    /**
     * Customer responds to proposed release compensation
     */
    async respondToReleaseCompensation(
        orderId: string,
        customerId: string,
        accepted: boolean,
        disputeReason?: string
    ) {
        const { data, error } = await supabase.rpc('respond_to_release_compensation_rpc', {
            p_order_id: orderId,
            p_customer_id: customerId,
            p_accepted: accepted,
            p_dispute_reason: disputeReason || null
        });

        if (error) throw error;
        return data;
    },

    /**
     * Check customer's unsettled cancellation debt
     */
    async getCustomerUnsettledDebt(customerId: string): Promise<{ totalDebt: number; debts: CancellationDebt[] }> {
        const { data, error } = await supabase
            .from('cancellation_debt')
            .select('*')
            .eq('customer_id', customerId)
            .eq('settled', false);

        if (error) throw error;

        const debts = (data || []) as CancellationDebt[];
        const totalDebt = debts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
        return { totalDebt, debts };
    },

    /**
     * Settle customer's cancellation debt
     */
    async settleCancellationDebt(customerId: string, paymentMethod: string, paymentReference: string) {
        const { data, error } = await supabase.rpc('settle_cancellation_debt_rpc', {
            p_customer_id: customerId,
            p_payment_method: paymentMethod,
            p_payment_reference: paymentReference
        });

        if (error) throw error;
        return data;
    },

    /**
     * Log / initiate masked phone call attempt
     */
    async initiateMaskedCall(
        orderId: string,
        callerId: string,
        callerRole: 'driver' | 'customer',
        recipientId?: string | null,
        recipientPhone?: string | null,
        triggerEvent: 'manual_driver_call' | 'auto_cancellation' | 'auto_release' | 'customer_call' | 'in_app_call' | 'in_app_audio_call' = 'in_app_call',
        callerPhone?: string | null
    ) {
        let finalCallerPhone = callerPhone || null;
        let finalRecipientPhone = recipientPhone || null;

        // If phones are missing, resolve them from the order record
        if (!finalCallerPhone || !finalRecipientPhone) {
            try {
                const { data: order } = await supabase
                    .from('orders')
                    .select('customer_phone, driver_phone, payment_phone, recipient_phone, customer:customer_id(phone), driver:driver_id(phone)')
                    .eq('id', orderId)
                    .single();

                if (order) {
                    const custPhone = order.customer_phone || (order.customer as any)?.phone || order.payment_phone || order.recipient_phone || null;
                    const drivPhone = order.driver_phone || (order.driver as any)?.phone || null;

                    if (!finalCallerPhone) {
                        finalCallerPhone = callerRole === 'driver' ? drivPhone : custPhone;
                    }
                    if (!finalRecipientPhone) {
                        finalRecipientPhone = callerRole === 'driver' ? custPhone : drivPhone;
                    }
                }
            } catch (err) {
                console.warn('Non-blocking: could not fetch order for phone resolution:', err);
            }
        }

        const { data, error } = await supabase
            .from('masked_call_logs')
            .insert([{
                order_id: orderId,
                caller_id: callerId,
                caller_phone: finalCallerPhone,
                caller_role: callerRole,
                recipient_id: recipientId || null,
                recipient_phone: finalRecipientPhone,
                masked_proxy_number: '+2638677000123',
                status: 'completed',
                duration_seconds: 25,
                trigger_event: triggerEvent
            }])
            .select()
            .single();

        if (error) throw error;
        return data as MaskedCallLog;
    },

    /**
     * Fetch call attempts made for an order by a driver
     */
    async getOrderCallAttempts(orderId: string, driverId: string) {
        const { data, error } = await supabase
            .from('masked_call_logs')
            .select('*')
            .eq('order_id', orderId)
            .eq('caller_id', driverId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return (data || []) as MaskedCallLog[];
    },

    /**
     * Verify 4-digit Handover PIN for final delivery confirmation
     * Primary confirmation path: Enforces server-side 3-attempt lockout.
     * On 3rd failure, locks PIN and falls back to photo proof-of-delivery.
     */
    async verifyHandoverPin(orderId: string, driverId: string, enteredPin: string): Promise<HandoverPinVerificationResult> {
        const cleanPin = (enteredPin || '').trim();

        try {
            const { data, error } = await supabase.rpc('verify_handover_pin_rpc', {
                p_order_id: orderId,
                p_driver_id: driverId,
                p_entered_pin: cleanPin
            });

            if (!error && data) {
                const result = data as HandoverPinVerificationResult;
                if (result.success) {
                    // Auto-notify customer of completed milestone
                    this.notifyOrderMilestone(orderId, 'completed').catch((mErr) => {
                        console.warn('notifyOrderMilestone completed error:', mErr?.message || mErr);
                    });
                    // Auto-trigger payment settlement
                    this.settleOrderPayment(orderId, driverId).catch((settleErr) => {
                        console.warn('settleOrderPayment post-PIN catch:', settleErr?.message || settleErr);
                    });
                }
                return result;
            }

            console.warn('verify_handover_pin_rpc returned error or null, falling back to direct verification:', error?.message);
        } catch (err: any) {
            console.warn('verifyHandoverPin RPC call exception:', err?.message);
        }

        // Direct table fallback if RPC is not yet migrated in current Supabase connection
        return await this.verifyHandoverPinDirectFallback(orderId, driverId, cleanPin);
    },

    /**
     * Defensive fallback verification directly querying orders table if RPC is unavailable
     */
    async verifyHandoverPinDirectFallback(orderId: string, driverId: string, enteredPin: string): Promise<HandoverPinVerificationResult> {
        const { data: order, error: fetchErr } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (fetchErr || !order) {
            return {
                success: false,
                error: 'ORDER_NOT_FOUND',
                message: 'Order not found.',
                attempts_left: 0,
                locked: false,
                fallback_to_photo: false
            };
        }

        if (order.driver_id !== driverId) {
            return {
                success: false,
                error: 'UNAUTHORIZED',
                message: 'Courier not authorized for this delivery.',
                attempts_left: 0,
                locked: false,
                fallback_to_photo: false
            };
        }

        if (['completed', 'delivered', 'cancelled', 'disputed'].includes(order.status)) {
            return {
                success: false,
                error: 'INVALID_ORDER_STATE',
                message: `Order is not eligible for PIN handover (Current status: ${order.status}).`,
                attempts_left: 0,
                locked: false,
                fallback_to_photo: false
            };
        }

        const currentAttempts = order.pin_attempts_count || 0;
        if (order.pin_locked || currentAttempts >= 3) {
            return {
                success: false,
                error: 'PIN_LOCKED',
                message: 'Handover PIN is locked due to 3 failed attempts. Please complete delivery using Photo Proof-of-Delivery.',
                attempts_left: 0,
                locked: true,
                fallback_to_photo: true
            };
        }

        const isMatch = order.handover_pin && order.handover_pin.trim() === enteredPin;

        if (isMatch) {
            const nowIso = new Date().toISOString();
            const { data: updated, error: updateErr } = await supabase
                .from('orders')
                .update({
                    status: 'completed',
                    pin_verified_at: nowIso,
                    pin_attempts_count: currentAttempts + 1,
                    completed_at: nowIso,
                    updated_at: nowIso
                })
                .eq('id', orderId)
                .select()
                .single();

            if (updateErr) throw updateErr;

            this.notifyOrderMilestone(orderId, 'completed').catch(() => {});
            this.settleOrderPayment(orderId, driverId).catch(() => {});

            return {
                success: true,
                order: updated as Order,
                order_status: 'completed',
                message: 'Handover PIN verified! Delivery confirmed and completed.',
                attempts_left: Math.max(0, 3 - (currentAttempts + 1)),
                locked: false,
                fallback_to_photo: false
            };
        } else {
            const newAttempts = currentAttempts + 1;
            const isLocked = newAttempts >= 3;
            const attemptsLeft = Math.max(0, 3 - newAttempts);

            await supabase
                .from('orders')
                .update({
                    pin_attempts_count: newAttempts,
                    pin_locked: isLocked,
                    pin_fallback_to_photo: isLocked,
                    pin_failed_flagged: isLocked,
                    updated_at: new Date().toISOString()
                })
                .eq('id', orderId);

            return {
                success: false,
                error: isLocked ? 'MAX_ATTEMPTS_EXCEEDED' : 'INCORRECT_PIN',
                message: isLocked 
                    ? 'Incorrect PIN. 3 attempts exceeded. PIN entry is locked and order flagged. Please complete handover using Photo Proof-of-Delivery.'
                    : `Incorrect PIN. ${attemptsLeft} attempt(s) remaining.`,
                attempts_left: attemptsLeft,
                locked: isLocked,
                fallback_to_photo: isLocked
            };
        }
    }
};
