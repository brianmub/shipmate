import { supabase } from '../utils/supabase';

export interface ChatMessage {
    id: string;
    order_id: string;
    sender_id: string;
    message_text: string;
    created_at: string;
    is_read?: boolean;
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

        // Dispatch background push notification to recipient asynchronously
        supabase.functions.invoke('notify-call-message', {
            body: {
                orderId,
                eventType: 'message',
                senderId,
                messageText: text
            }
        }).catch((pushErr) => {
            console.warn('Non-blocking: could not dispatch message push notification:', pushErr);
        });

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
    },

    /**
     * Get unread message count for an order for a specific user
     */
    async getUnreadCount(orderId: string, currentUserId: string): Promise<number> {
        try {
            const { count, error } = await supabase
                .from('order_messages')
                .select('*', { count: 'exact', head: true })
                .eq('order_id', orderId)
                .neq('sender_id', currentUserId)
                .eq('is_read', false);

            if (error) return 0;
            return count || 0;
        } catch {
            return 0;
        }
    },

    /**
     * Mark all unread messages in an order as read for the current user
     */
    async markAsRead(orderId: string, currentUserId: string): Promise<void> {
        try {
            await supabase
                .from('order_messages')
                .update({ is_read: true })
                .eq('order_id', orderId)
                .neq('sender_id', currentUserId)
                .eq('is_read', false);
        } catch (e) {
            console.error('Error marking messages as read:', e);
        }
    }
};
