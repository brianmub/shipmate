import { supabase } from '../utils/supabase';

export const settingsService = {
    /**
     * Fetch all system settings
     */
    async getSettings() {
        const { data, error } = await supabase
            .from('settings')
            .select('*')
            .order('key');
        
        if (error) throw error;
        return data;
    },

    /**
     * Update a specific setting
     */
    async updateSetting(key: string, value: string) {
        const { error } = await supabase
            .from('settings')
            .update({ 
                value, 
                updated_at: new Date().toISOString() 
            })
            .eq('key', key);
        
        if (error) throw error;
    }
};
