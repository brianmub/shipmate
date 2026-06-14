import { supabase } from '../utils/supabase';
import { UserProfile } from '../types';

export const userService = {
    /**
     * Fetch user profile from public.users
     */
    async getUserProfile(userId: string) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;
        return data as UserProfile;
    },

    /**
     * Update user's push notification token
     */
    async updatePushToken(userId: string, token: string) {
        const { error } = await supabase
            .from('users')
            .update({ expo_push_token: token })
            .eq('id', userId);

        if (error) throw error;
    },

    /**
     * Fetch full driver profile with metrics
     */
    async getDriverProfile(userId: string) {
        const { data, error } = await supabase
            .from('drivers')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error) throw error;
        return data;
    },

    /**
     * Toggle driver online status
     */
    async toggleOnlineStatus(userId: string, isOnline: boolean) {
        const { error } = await supabase
            .from('drivers')
            .update({ is_online: isOnline })
            .eq('id', userId);

        if (error) throw error;
    },

    /**
     * Fetch driver verification status
     */
    async getDriverStatus(userId: string) {
        const { data, error } = await supabase
            .from('drivers')
            .select('verification_status')
            .eq('id', userId)
            .single();
        
        if (error) throw error;
        return data.verification_status;
    },

    /**
     * Fetch recent transaction ledger entries for a driver
     */
    async getTransactions(driverId: string) {
        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('driver_id', driverId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    /**
     * Fetch platform-wide system settings (pricing, payout thresholds)
     */
    async getSystemSettings() {
        const { data, error } = await supabase
            .from('system_settings')
            .select('*')
            .eq('id', 1)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    /**
     * Submit driver payout request, validate balance, deduct balance and log transaction
     */
    async requestPayout(driverId: string, amount: number) {
        // 1. Fetch current driver balance
        const { data: driver, error: driverError } = await supabase
            .from('drivers')
            .select('available_balance')
            .eq('id', driverId)
            .single();
        
        if (driverError) throw driverError;
        if (!driver) throw new Error("Driver profile not found");
        if (driver.available_balance < amount) {
            throw new Error(`Insufficient balance. Available: $${driver.available_balance.toFixed(2)}`);
        }

        // 2. Insert transaction ledger entry
        const { error: txError } = await supabase
            .from('transactions')
            .insert({
                driver_id: driverId,
                amount: amount,
                type: 'payout',
                status: 'completed'
            });

        if (txError) throw txError;

        // 3. Deduct from available_balance
        const { error: updateError } = await supabase
            .from('drivers')
            .update({
                available_balance: driver.available_balance - amount
            })
            .eq('id', driverId);

        if (updateError) throw updateError;
    }
};
