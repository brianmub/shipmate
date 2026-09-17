-- Migration: 20260917140000_order_lifecycle_notifications.sql
-- Description: Customer Order Lifecycle Milestone Notifications with Opt-In Paid SMS/WhatsApp Fee & Audit Log

-- 1. Add recipient contact and SMS opt-in columns to public.orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS recipient_name TEXT,
ADD COLUMN IF NOT EXISTS recipient_phone TEXT,
ADD COLUMN IF NOT EXISTS recipient_notes TEXT,
ADD COLUMN IF NOT EXISTS sms_notifications_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS sms_notification_fee NUMERIC(5,2) DEFAULT 0.00;

-- 2. Add default sms_notification_fee to public.system_settings
ALTER TABLE public.system_settings
ADD COLUMN IF NOT EXISTS sms_notification_fee NUMERIC(5,2) DEFAULT 0.25;

-- Update existing system_settings row if present
UPDATE public.system_settings
SET sms_notification_fee = COALESCE(sms_notification_fee, 0.25);

-- 3. Create public.order_notifications table for auditing Push and SMS/WhatsApp dispatches
CREATE TABLE IF NOT EXISTS public.order_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    recipient_type TEXT CHECK (recipient_type IN ('customer', 'recipient')),
    channel TEXT CHECK (channel IN ('push', 'sms', 'whatsapp')),
    milestone TEXT NOT NULL,
    destination TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'delivered_mock')),
    cost_billed NUMERIC(5,2) DEFAULT 0.00,
    provider_response JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast order notification lookups
CREATE INDEX IF NOT EXISTS idx_order_notifications_order_id ON public.order_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_order_notifications_created_at ON public.order_notifications(created_at DESC);

-- 4. Enable Row Level Security on public.order_notifications
ALTER TABLE public.order_notifications ENABLE ROW LEVEL SECURITY;

-- Service role full access
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'order_notifications' 
        AND policyname = 'Service role full access on order_notifications'
    ) THEN
        CREATE POLICY "Service role full access on order_notifications"
        ON public.order_notifications
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

-- Customers can view notifications for their own orders
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'order_notifications' 
        AND policyname = 'Customers view notifications for their orders'
    ) THEN
        CREATE POLICY "Customers view notifications for their orders"
        ON public.order_notifications
        FOR SELECT
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.orders o
                WHERE o.id = order_notifications.order_id
                AND o.customer_id = auth.uid()
            )
        );
    END IF;
END $$;

-- 5. Update fn_sync_order_payment_directive to incorporate sms_notification_fee
CREATE OR REPLACE FUNCTION public.fn_sync_order_payment_directive()
RETURNS TRIGGER AS $$
DECLARE
    v_cost NUMERIC(10,2) := COALESCE(NEW.estimated_cost, 0.00);
    v_sms_fee NUMERIC(5,2) := 0.00;
BEGIN
    -- Ensure payment_method defaults to cash_on_delivery if null
    IF NEW.payment_method IS NULL THEN
        NEW.payment_method := 'cash_on_delivery';
    END IF;

    -- Compute SMS fee if enabled
    IF NEW.sms_notifications_enabled IS TRUE THEN
        NEW.sms_notification_fee := COALESCE(NEW.sms_notification_fee, 0.25);
        v_sms_fee := NEW.sms_notification_fee;
    ELSE
        NEW.sms_notification_fee := 0.00;
        v_sms_fee := 0.00;
    END IF;

    -- Set default initial status based on method
    IF NEW.payment_status IS NULL THEN
        IF NEW.payment_method = 'cash_on_delivery' THEN
            NEW.payment_status := 'pending_cash';
        ELSE
            NEW.payment_status := 'pending_digital';
        END IF;
    END IF;

    -- Compute cash_to_collect
    IF NEW.payment_status IN ('paid', 'collected', 'refunded') THEN
        NEW.cash_to_collect := 0.00;
    ELSIF NEW.payment_method = 'cash_on_delivery' THEN
        -- Cash on delivery collects full delivery fare including SMS fee if opted in
        NEW.cash_to_collect := v_cost + v_sms_fee;
    ELSE
        -- Digital payments collect 0 cash at doorstep
        NEW.cash_to_collect := 0.00;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
