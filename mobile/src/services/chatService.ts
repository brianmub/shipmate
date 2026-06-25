import { supabase } from '../utils/supabase';

export interface ChatMessage {
    id: string;
    order_id: string;
    sender_id: string;
    message_text: string;
    created_at: string;
}

export const chatService = {
    /**
     * Fetch historical messages for an order
     */
    async getMessages(orderId: string): Promise<ChatMessage[]> {
        const { data, error } = await supabase
            .from('order_messages')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    },

    /**
     * Send a message
     */
    async sendMessage(orderId: string, senderId: string, text: string): Promise<ChatMessage> {
        const { data, error } = await supabase
            .from('order_messages')
            .insert([{
                order_id: orderId,
                sender_id: senderId,
                message_text: text
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Subscribe to real-time messages for an order
     */
    subscribeToChat(orderId: string, callback: (payload: any) => void) {
        return supabase
            .channel(`order_chat_${orderId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'order_messages', filter: `order_id=eq.${orderId}` },
                callback
            )
            .subscribe();
    }
};
