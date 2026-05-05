import { supabase } from '../utils/supabase';
import { Order, OrderStatus } from '../types';

export const orderService = {
    /**
     * Create a new order (Customer side)
     */
    async createOrder(orderData: Partial<Order>) {
        const { data, error } = await supabase
            .from('orders')
            .insert([orderData])
            .select()
            .single();

        if (error) throw error;
        return data as Order;
    },

    /**
     * Fetch all pending orders (Driver side)
     */
    async getPendingOrders() {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as Order[];
    },

    /**
     * Fetch active job for a driver
     */
    async getActiveDriverJob(driverId: string) {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
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
     * Accept a job (Driver side)
     */
    async acceptOrder(orderId: string, driverId: string) {
        const { data, error } = await supabase
            .from('orders')
            .update({ 
                status: 'driver_assigned', 
                driver_id: driverId,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .select()
            .single();

        if (error) throw error;
        return data as Order;
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
    }
};
