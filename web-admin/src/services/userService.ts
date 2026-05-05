import { supabase } from '../utils/supabase';

export const userService = {
    async getUserProfile(userId: string) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;
        return data;
    },

    async getAdminDashboardMetrics() {
        // This is a placeholder for real metrics fetching
        const { data: orders, error: orderError } = await supabase.from('orders').select('status');
        const { data: drivers, error: driverError } = await supabase.from('drivers').select('id');
        
        if (orderError || driverError) throw orderError || driverError;

        return {
            totalOrders: orders?.length || 0,
            activeDrivers: drivers?.length || 0,
            pendingOrders: orders?.filter(o => o.status === 'pending').length || 0,
            completedOrders: orders?.filter(o => o.status === 'delivered').length || 0,
        };
    }
};
