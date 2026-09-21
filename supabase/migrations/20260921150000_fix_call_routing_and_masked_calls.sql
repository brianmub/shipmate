-- ============================================================================
-- Migration: Fix Call Routing, In-App Calls & Order Participant Phone Sync
-- ============================================================================

-- 1. ADD PARTICIPANT PHONE COLUMNS TO ORDERS TABLE
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS customer_phone TEXT,
ADD COLUMN IF NOT EXISTS driver_phone TEXT;

-- 2. ADD CALLER PHONE TO MASKED CALL LOGS AND UPDATE CHECK CONSTRAINT
ALTER TABLE public.masked_call_logs
ADD COLUMN IF NOT EXISTS caller_phone TEXT;

-- Update trigger_event check constraint to allow in_app_call
ALTER TABLE public.masked_call_logs DROP CONSTRAINT IF EXISTS masked_call_logs_trigger_event_check;
ALTER TABLE public.masked_call_logs 
ADD CONSTRAINT masked_call_logs_trigger_event_check 
CHECK (trigger_event IN (
    'manual_driver_call', 
    'auto_cancellation', 
    'auto_release', 
    'customer_call',
    'in_app_call',
    'in_app_audio_call'
));

-- 3. TRIGGER FUNCTION: AUTOMATICALLY SYNC PARTICIPANT PHONES ON ORDERS & USERS
CREATE OR REPLACE FUNCTION public.sync_order_participant_phones()
RETURNS TRIGGER AS $$
DECLARE
    v_cust_phone TEXT;
    v_driver_phone TEXT;
BEGIN
    -- Resolve Customer Phone
    IF NEW.customer_phone IS NULL OR NEW.customer_phone = '' THEN
        NEW.customer_phone := COALESCE(
            NEW.payment_phone, 
            NEW.recipient_phone, 
            (SELECT phone FROM public.users WHERE id = NEW.customer_id)
        );
    END IF;

    -- Sync back to users.phone for the customer if user profile has no phone
    IF NEW.customer_phone IS NOT NULL AND NEW.customer_phone != '' THEN
        UPDATE public.users 
        SET phone = NEW.customer_phone 
        WHERE id = NEW.customer_id AND (phone IS NULL OR phone = '');
    END IF;

    -- Resolve Driver Phone if driver assigned
    IF NEW.driver_id IS NOT NULL THEN
        IF NEW.driver_phone IS NULL OR NEW.driver_phone = '' THEN
            NEW.driver_phone := COALESCE(
                (SELECT phone FROM public.users WHERE id = NEW.driver_id),
                (SELECT emergency_contact_phone FROM public.drivers WHERE id = NEW.driver_id)
            );
        END IF;

        -- Sync back to users.phone for the driver if user profile has no phone
        IF NEW.driver_phone IS NOT NULL AND NEW.driver_phone != '' THEN
            UPDATE public.users 
            SET phone = NEW.driver_phone 
            WHERE id = NEW.driver_id AND (phone IS NULL OR phone = '');
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_order_participant_phones ON public.orders;
CREATE TRIGGER trg_sync_order_participant_phones
BEFORE INSERT OR UPDATE OF customer_id, driver_id, payment_phone, recipient_phone
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_participant_phones();

-- 4. BACKFILL EXISTING ORDERS & PARTICIPANTS
-- Backfill users.phone from drivers.emergency_contact_phone
UPDATE public.users u
SET phone = d.emergency_contact_phone
FROM public.drivers d
WHERE u.id = d.id 
  AND (u.phone IS NULL OR u.phone = '') 
  AND d.emergency_contact_phone IS NOT NULL;

-- Backfill users.phone from orders.payment_phone
UPDATE public.users u
SET phone = o.payment_phone
FROM public.orders o
WHERE u.id = o.customer_id 
  AND (u.phone IS NULL OR u.phone = '') 
  AND o.payment_phone IS NOT NULL;

-- Backfill orders.customer_phone
UPDATE public.orders o
SET customer_phone = COALESCE(o.payment_phone, o.recipient_phone, u.phone)
FROM public.users u
WHERE o.customer_id = u.id AND (o.customer_phone IS NULL OR o.customer_phone = '');

-- Backfill orders.driver_phone
UPDATE public.orders o
SET driver_phone = COALESCE(u.phone, d.emergency_contact_phone)
FROM public.drivers d
LEFT JOIN public.users u ON u.id = d.id
WHERE o.driver_id = d.id AND (o.driver_phone IS NULL OR o.driver_phone = '');
