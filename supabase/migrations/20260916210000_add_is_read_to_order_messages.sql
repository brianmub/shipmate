-- Migration: Add is_read to order_messages for unread badge tracking
ALTER TABLE public.order_messages 
ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;

-- Create index for rapid unread lookup and updates
CREATE INDEX IF NOT EXISTS idx_order_messages_unread 
ON public.order_messages(order_id, sender_id, is_read);
