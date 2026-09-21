-- ============================================================================
-- Migration: Allow 'driver' in order_notifications recipient_type check constraint
-- ============================================================================

DO $$
BEGIN
    -- Drop existing check constraint if present
    ALTER TABLE public.order_notifications 
    DROP CONSTRAINT IF EXISTS order_notifications_recipient_type_check;

    -- Add updated constraint allowing customer, recipient, and driver
    ALTER TABLE public.order_notifications 
    ADD CONSTRAINT order_notifications_recipient_type_check 
    CHECK (recipient_type IN ('customer', 'recipient', 'driver'));
END $$;

-- Create index on recipient_type and order_id if not present
CREATE INDEX IF NOT EXISTS idx_order_notifications_recipient ON public.order_notifications(order_id, recipient_type);
