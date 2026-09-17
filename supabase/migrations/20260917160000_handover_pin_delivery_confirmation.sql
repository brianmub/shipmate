-- Database Migration: 4-Digit Handover PIN (OTP) for Delivery Confirmation
-- File: 20260917160000_handover_pin_delivery_confirmation.sql

-- ============================================================================
-- 1. ADD HANDOVER PIN COLUMNS TO ORDERS TABLE
-- ============================================================================
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS handover_pin VARCHAR(4),
ADD COLUMN IF NOT EXISTS pin_attempts_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pin_locked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pin_verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS pin_fallback_to_photo BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pin_failed_flagged BOOLEAN DEFAULT FALSE;

-- Create index on handover_pin and order status
CREATE INDEX IF NOT EXISTS idx_orders_handover_pin ON public.orders(handover_pin);

-- ============================================================================
-- 2. SERVER-SIDE 4-DIGIT PIN GENERATION TRIGGER
-- ============================================================================
-- Single PIN per order, generated once at acceptance, valid for order's full lifetime.
-- No separate expiry timer or regeneration logic. If cancelled, PIN becomes unusable naturally.
CREATE OR REPLACE FUNCTION public.fn_generate_handover_pin()
RETURNS TRIGGER AS $$
BEGIN
    -- Generate when driver is assigned and PIN does not already exist
    IF (NEW.status = 'driver_assigned' OR NEW.driver_id IS NOT NULL) 
       AND (NEW.handover_pin IS NULL OR LENGTH(TRIM(NEW.handover_pin)) = 0) THEN
        -- Generate random 4-digit number between 1000 and 9999
        NEW.handover_pin := lpad((floor(random() * 9000) + 1000)::text, 4, '0');
        NEW.pin_attempts_count := 0;
        NEW.pin_locked := FALSE;
        NEW.pin_verified_at := NULL;
        NEW.pin_fallback_to_photo := FALSE;
        NEW.pin_failed_flagged := FALSE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_handover_pin ON public.orders;
CREATE TRIGGER trg_generate_handover_pin
    BEFORE INSERT OR UPDATE OF status, driver_id ON public.orders
    FOR EACH ROW
    EXECUTE PROCEDURE public.fn_generate_handover_pin();

-- Backfill any existing active orders with driver_assigned that don't have a PIN
UPDATE public.orders
SET handover_pin = lpad((floor(random() * 9000) + 1000)::text, 4, '0')
WHERE handover_pin IS NULL 
  AND driver_id IS NOT NULL 
  AND status NOT IN ('completed', 'delivered', 'cancelled');

-- ============================================================================
-- 3. STORED PROCEDURE: VERIFY HANDOVER PIN (Server-Side 3-Attempt Lockout)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.verify_handover_pin_rpc(
    p_order_id UUID,
    p_driver_id UUID,
    p_entered_pin VARCHAR(4)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_new_attempts INTEGER;
    v_locked BOOLEAN;
    v_attempts_left INTEGER;
BEGIN
    -- 1. Fetch Order
    SELECT 
        id, 
        status, 
        driver_id, 
        customer_id, 
        handover_pin, 
        COALESCE(pin_attempts_count, 0) AS pin_attempts_count, 
        COALESCE(pin_locked, FALSE) AS pin_locked, 
        COALESCE(pin_fallback_to_photo, FALSE) AS pin_fallback_to_photo,
        estimated_cost,
        payment_method
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ORDER_NOT_FOUND',
            'locked', false,
            'fallback_to_photo', false,
            'attempts_left', 0,
            'message', 'Order not found.'
        );
    END IF;

    -- 2. Validate Driver Authorization
    IF v_order.driver_id IS NULL OR v_order.driver_id <> p_driver_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'UNAUTHORIZED',
            'locked', false,
            'fallback_to_photo', false,
            'attempts_left', 0,
            'message', 'Courier not authorized for this delivery.'
        );
    END IF;

    -- 3. Verify Order Status is in an Active Handover State
    -- Cancelling an order naturally renders its PIN unusable without a separate expiry job
    IF v_order.status IN ('completed', 'delivered', 'cancelled', 'disputed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_ORDER_STATE',
            'locked', false,
            'fallback_to_photo', false,
            'attempts_left', 0,
            'message', format('Order is not eligible for PIN handover (Current status: %s).', v_order.status)
        );
    END IF;

    -- 4. Server-Side Check: Is PIN already locked?
    IF v_order.pin_locked OR v_order.pin_attempts_count >= 3 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PIN_LOCKED',
            'locked', true,
            'fallback_to_photo', true,
            'attempts_left', 0,
            'message', 'Handover PIN is locked due to 3 failed attempts. Please complete delivery using Photo Proof-of-Delivery.'
        );
    END IF;

    -- 5. PIN Verification
    IF v_order.handover_pin IS NOT NULL 
       AND LENGTH(v_order.handover_pin) = 4 
       AND v_order.handover_pin = TRIM(p_entered_pin) THEN
        
        -- SUCCESS: Correct PIN entered!
        -- Transition order to completed
        UPDATE public.orders
        SET 
            status = 'completed',
            pin_verified_at = NOW(),
            pin_attempts_count = v_order.pin_attempts_count + 1,
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = p_order_id;

        -- Auto-trigger financial settlement if applicable
        BEGIN
            PERFORM public.settle_order_payment_rpc(p_order_id, p_driver_id);
        EXCEPTION WHEN OTHERS THEN
            -- Non-blocking settlement failure log
            RAISE NOTICE 'Handover payment settlement notice: %', SQLERRM;
        END;

        RETURN jsonb_build_object(
            'success', true,
            'locked', false,
            'fallback_to_photo', false,
            'attempts_left', GREATEST(0, 3 - (v_order.pin_attempts_count + 1)),
            'order_status', 'completed',
            'message', 'Handover PIN verified! Delivery confirmed and completed.'
        );

    ELSE
        -- FAILURE: Wrong PIN entered
        v_new_attempts := v_order.pin_attempts_count + 1;
        v_locked := (v_new_attempts >= 3);
        v_attempts_left := GREATEST(0, 3 - v_new_attempts);

        UPDATE public.orders
        SET 
            pin_attempts_count = v_new_attempts,
            pin_locked = v_locked,
            pin_fallback_to_photo = v_locked,
            pin_failed_flagged = v_locked,
            updated_at = NOW()
        WHERE id = p_order_id;

        IF v_locked THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'MAX_ATTEMPTS_EXCEEDED',
                'locked', true,
                'fallback_to_photo', true,
                'attempts_left', 0,
                'message', 'Incorrect PIN. 3 attempts exceeded. PIN entry is locked and order flagged. Please complete handover using Photo Proof-of-Delivery.'
            );
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'error', 'INCORRECT_PIN',
                'locked', false,
                'fallback_to_photo', false,
                'attempts_left', v_attempts_left,
                'message', format('Incorrect PIN. %s attempt(s) remaining.', v_attempts_left)
            );
        END IF;
    END IF;
END;
$$;
