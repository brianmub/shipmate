import { supabase } from '../utils/supabase';
import { Order, OrderStatus } from '../types';

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

        const { data, error } = await supabase
            .from('orders')
            .insert([orderData])
            .select()
            .single();

        if (error) throw error;
        return data as Order;
    },

    /**
     * Fetch all available jobs for drivers (where status is pending)
     */
    async getAvailableJobs() {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as Order[];
    },

    /**
     * Submit an offer for an order (Driver side)
     */
    async submitOffer(orderId: string, driverId: string, amount: number, pickupEstimate: number, lat: number, lng: number) {
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
     * Fetch offers for a specific order (Customer side)
     */
    async getOrderOffers(orderId: string) {
        const { data, error } = await supabase
            .from('order_offers')
            .select(`
                *,
                driver:driver_id(full_name, average_rating)
            `)
            .eq('order_id', orderId)
            .order('offer_amount', { ascending: true });

        if (error) throw error;
        return data;
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

        // 3. Update the order with the assigned driver and new status
        const { data, error: orderError } = await supabase
            .from('orders')
            .update({ 
                status: 'driver_assigned', 
                driver_id: driverId,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .select()
            .single();

        if (orderError) throw orderError;
        return data as Order;
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
    }
};
