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
    }
};
