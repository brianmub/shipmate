-- Migration: Priority Dispatch Consistency Check & Trigger Activation
-- Date: 2026-09-17
-- Description: Complete consistency enforcement, schema alignment, and explicit activation of all 
--              triggers across orders, drivers, order_offers, and courier_wallets.

-- ============================================================================
-- 1. DEFENSIVE COLUMN VERIFICATION
-- ============================================================================

-- Users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS expo_push_token TEXT,
ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active';

-- Drivers table
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'standard' CHECK (tier IN ('standard', 'silver', 'gold', 'platinum')),
ADD COLUMN IF NOT EXISTS on_time_rate DECIMAL(5,2) DEFAULT 100.00,
ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_identity_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS total_deliveries INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS completed_deliveries INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cancelled_deliveries INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2) DEFAULT 5.00,
ADD COLUMN IF NOT EXISTS acceptance_rate DECIMAL(5,2) DEFAULT 100.00,
ADD COLUMN IF NOT EXISTS completion_rate DECIMAL(5,2) DEFAULT 100.00,
ADD COLUMN IF NOT EXISTS working_radius_km INTEGER DEFAULT 10;

-- Orders table
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS priority_window_ends_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS priority_tier_required TEXT DEFAULT 'platinum',
ADD COLUMN IF NOT EXISTS estimated_delivery_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS customer_rating INTEGER CHECK (customer_rating BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS customer_feedback TEXT;

-- Courier Wallets table
ALTER TABLE public.courier_wallets
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'locked')),
ADD COLUMN IF NOT EXISTS balance DECIMAL(12,2) DEFAULT 0.00;

-- Backfill NULLs to valid default baselines
UPDATE public.drivers SET tier = 'standard' WHERE tier IS NULL;
UPDATE public.drivers SET on_time_rate = 100.00 WHERE on_time_rate IS NULL;
UPDATE public.drivers SET completed_deliveries = 0 WHERE completed_deliveries IS NULL;
UPDATE public.drivers SET cancelled_deliveries = 0 WHERE cancelled_deliveries IS NULL;
UPDATE public.drivers SET average_rating = 5.00 WHERE average_rating IS NULL OR average_rating = 0;
UPDATE public.drivers SET acceptance_rate = 100.00 WHERE acceptance_rate IS NULL OR acceptance_rate = 0;
UPDATE public.drivers SET completion_rate = 100.00 WHERE completion_rate IS NULL OR completion_rate = 0;
UPDATE public.drivers SET is_online = FALSE WHERE is_online IS NULL;
UPDATE public.drivers SET is_identity_verified = FALSE WHERE is_identity_verified IS NULL;

-- Ensure all drivers have a corresponding wallet row
INSERT INTO public.courier_wallets (courier_id, balance, status)
SELECT id, 0.00, 'active'
FROM public.drivers
ON CONFLICT (courier_id) DO NOTHING;

-- ============================================================================
-- 2. PRIORITY DISPATCH TRIGGER (BEFORE INSERT ON orders)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_order_priority_dispatch()
RETURNS TRIGGER AS $$
BEGIN
    -- For pending orders, enforce 30s exclusive window for Platinum couriers
    IF NEW.status = 'pending' THEN
        IF NEW.priority_window_ends_at IS NULL THEN
            NEW.priority_window_ends_at := NOW() + INTERVAL '30 SECONDS';
        END IF;
        IF NEW.priority_tier_required IS NULL THEN
            NEW.priority_tier_required := 'platinum';
        END IF;
        IF NEW.estimated_delivery_at IS NULL THEN
            NEW.estimated_delivery_at := NOW() + INTERVAL '45 MINUTES';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_order_priority_dispatch ON public.orders;
CREATE TRIGGER trg_set_order_priority_dispatch
    BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE PROCEDURE public.set_order_priority_dispatch();

-- ============================================================================
-- 3. DELIVERED_AT STAMP TRIGGER (BEFORE UPDATE ON orders)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_order_delivered_at()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status IN ('delivered', 'completed')) AND (OLD.status NOT IN ('delivered', 'completed')) THEN
        IF NEW.delivered_at IS NULL THEN
            NEW.delivered_at := NOW();
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_order_delivered_at ON public.orders;
CREATE TRIGGER trg_set_order_delivered_at
    BEFORE UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE PROCEDURE public.set_order_delivered_at();

-- ============================================================================
-- 4. MASTER TIER EVALUATOR FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.evaluate_driver_tier(p_driver_id UUID)
RETURNS VOID AS $$
DECLARE
    v_completed INTEGER := 0;
    v_rating DECIMAL := 5.0;
    v_completion DECIMAL := 100.0;
    v_acceptance DECIMAL := 100.0;
    v_ontime DECIMAL := 100.0;
    v_verified BOOLEAN := FALSE;
    v_wallet_status TEXT := 'locked';
    v_wallet_balance DECIMAL := 0.0;
    v_new_tier TEXT := 'standard';
BEGIN
    -- Fetch driver metrics
    SELECT 
        COALESCE(completed_deliveries, 0),
        COALESCE(average_rating, 5.0),
        COALESCE(completion_rate, 100.0),
        COALESCE(acceptance_rate, 100.0),
        COALESCE(on_time_rate, 100.0),
        COALESCE(is_identity_verified, FALSE)
    INTO 
        v_completed,
        v_rating,
        v_completion,
        v_acceptance,
        v_ontime,
        v_verified
    FROM public.drivers
    WHERE id = p_driver_id;

    -- Fetch wallet metrics
    SELECT 
        COALESCE(status, 'locked'),
        COALESCE(balance, 0.0)
    INTO
        v_wallet_status,
        v_wallet_balance
    FROM public.courier_wallets
    WHERE courier_id = p_driver_id;

    -- 6 Platinum qualification benchmarks:
    -- 1. Completed Deliveries >= 50
    -- 2. Customer Rating >= 4.85
    -- 3. Completion Rate >= 95.0%
    -- 4. Acceptance Rate >= 80.0%
    -- 5. On-Time Rate >= 90.0%
    -- 6. Wallet active and balance >= 0, identity verified
    IF (v_completed >= 50) AND
       (v_rating >= 4.85) AND
       (v_completion >= 95.0) AND
       (v_acceptance >= 80.0) AND
       (v_ontime >= 90.0) AND
       (v_wallet_status = 'active') AND
       (v_wallet_balance >= 0) AND
       (v_verified = TRUE) THEN
        v_new_tier := 'platinum';
    ELSE
        v_new_tier := 'standard';
    END IF;

    UPDATE public.drivers
    SET tier = v_new_tier
    WHERE id = p_driver_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. DRIVER METRICS & TIER RECALCULATION TRIGGER (AFTER UPDATE ON orders)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_order_driver_metrics()
RETURNS TRIGGER AS $$
DECLARE
    v_avg_rating DECIMAL;
    v_ontime_rate DECIMAL;
    v_completion_rate DECIMAL;
    v_completed INTEGER;
    v_cancelled INTEGER;
BEGIN
    IF NEW.driver_id IS NOT NULL THEN
        -- 1. Rating update
        IF NEW.customer_rating IS NOT NULL AND (OLD.customer_rating IS NULL OR OLD.customer_rating != NEW.customer_rating) THEN
            SELECT COALESCE(ROUND(AVG(customer_rating)::numeric, 2), 5.00)
            INTO v_avg_rating
            FROM public.orders
            WHERE driver_id = NEW.driver_id AND customer_rating IS NOT NULL;

            UPDATE public.drivers
            SET average_rating = v_avg_rating
            WHERE id = NEW.driver_id;
        END IF;

        -- 2. On-Time Delivery update
        IF (NEW.status IN ('delivered', 'completed')) AND (OLD.status NOT IN ('delivered', 'completed')) THEN
            SELECT COALESCE(
                ROUND(
                    (COUNT(*) FILTER (WHERE delivered_at <= estimated_delivery_at)::numeric / NULLIF(COUNT(*), 0)::numeric) * 100,
                    2
                ),
                100.00
            )
            INTO v_ontime_rate
            FROM public.orders
            WHERE driver_id = NEW.driver_id 
              AND status IN ('delivered', 'completed')
              AND estimated_delivery_at IS NOT NULL;

            UPDATE public.drivers
            SET on_time_rate = v_ontime_rate
            WHERE id = NEW.driver_id;
        END IF;

        -- 3. Cancellation tracking
        IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
            UPDATE public.drivers
            SET cancelled_deliveries = COALESCE(cancelled_deliveries, 0) + 1
            WHERE id = NEW.driver_id;
        END IF;

        -- 4. Completion Rate update
        SELECT 
            COALESCE(completed_deliveries, 0),
            COALESCE(cancelled_deliveries, 0)
        INTO v_completed, v_cancelled
        FROM public.drivers
        WHERE id = NEW.driver_id;

        IF (v_completed + v_cancelled) > 0 THEN
            v_completion_rate := ROUND((v_completed::numeric / (v_completed + v_cancelled)::numeric) * 100, 2);
            UPDATE public.drivers
            SET completion_rate = v_completion_rate
            WHERE id = NEW.driver_id;
        END IF;

        -- 5. Re-evaluate Master Tier
        PERFORM public.evaluate_driver_tier(NEW.driver_id);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_order_driver_metrics ON public.orders;
CREATE TRIGGER trg_order_driver_metrics
    AFTER UPDATE OF status, customer_rating, delivered_at ON public.orders
    FOR EACH ROW EXECUTE PROCEDURE public.handle_order_driver_metrics();

-- ============================================================================
-- 6. ORDER OFFERS ACCEPTANCE RATE TRIGGER (AFTER INSERT/UPDATE ON order_offers)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_order_offer_metrics()
RETURNS TRIGGER AS $$
DECLARE
    v_target_driver UUID;
    v_rate DECIMAL;
BEGIN
    v_target_driver := COALESCE(NEW.driver_id, OLD.driver_id);
    IF v_target_driver IS NOT NULL THEN
        SELECT COALESCE(
            ROUND(
                (COUNT(*) FILTER (WHERE status = 'accepted')::numeric / NULLIF(COUNT(*), 0)::numeric) * 100, 
                2
            ), 
            100.00
        )
        INTO v_rate
        FROM public.order_offers
        WHERE driver_id = v_target_driver;

        UPDATE public.drivers
        SET acceptance_rate = v_rate
        WHERE id = v_target_driver;

        PERFORM public.evaluate_driver_tier(v_target_driver);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_order_offer_metrics ON public.order_offers;
CREATE TRIGGER trg_order_offer_metrics
    AFTER INSERT OR UPDATE OF status ON public.order_offers
    FOR EACH ROW EXECUTE PROCEDURE public.handle_order_offer_metrics();

-- ============================================================================
-- 7. COURIER WALLET TIER TRIGGER (AFTER UPDATE ON courier_wallets)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_courier_wallet_tier_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.evaluate_driver_tier(NEW.courier_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_courier_wallet_tier_change ON public.courier_wallets;
CREATE TRIGGER trg_courier_wallet_tier_change
    AFTER UPDATE OF status, balance ON public.courier_wallets
    FOR EACH ROW EXECUTE PROCEDURE public.handle_courier_wallet_tier_change();

-- ============================================================================
-- 8. DRIVER IDENTITY TIER TRIGGER (AFTER UPDATE ON drivers)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_driver_identity_tier_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_identity_verified IS DISTINCT FROM OLD.is_identity_verified THEN
        PERFORM public.evaluate_driver_tier(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_driver_identity_tier_change ON public.drivers;
CREATE TRIGGER trg_driver_identity_tier_change
    AFTER UPDATE OF is_identity_verified ON public.drivers
    FOR EACH ROW EXECUTE PROCEDURE public.handle_driver_identity_tier_change();

-- ============================================================================
-- 9. EXPLICITLY ACTIVATE ALL TRIGGERS
-- ============================================================================

ALTER TABLE public.orders ENABLE TRIGGER trg_set_order_priority_dispatch;
ALTER TABLE public.orders ENABLE TRIGGER trg_set_order_delivered_at;
ALTER TABLE public.orders ENABLE TRIGGER trg_order_driver_metrics;
ALTER TABLE public.order_offers ENABLE TRIGGER trg_order_offer_metrics;
ALTER TABLE public.courier_wallets ENABLE TRIGGER trg_courier_wallet_tier_change;
ALTER TABLE public.drivers ENABLE TRIGGER trg_driver_identity_tier_change;

-- ============================================================================
-- 10. ROW LEVEL SECURITY (RLS) PRIORITY WINDOW ENFORCEMENT
-- ============================================================================

DROP POLICY IF EXISTS "Drivers view pending orders" ON public.orders;
CREATE POLICY "Drivers view pending orders" ON public.orders FOR SELECT 
    USING (
        status = 'pending' 
        AND EXISTS (
            SELECT 1 FROM public.users u
            JOIN public.drivers d ON d.id = u.id
            LEFT JOIN public.courier_wallets cw ON cw.courier_id = u.id
            WHERE u.id = auth.uid() 
            AND u.role = 'driver'
            AND (cw.status IS NULL OR cw.status = 'active')
            AND (
                orders.priority_window_ends_at IS NULL
                OR orders.priority_window_ends_at <= NOW()
                OR d.tier = 'platinum'
            )
        )
    );

DROP POLICY IF EXISTS "Drivers update assigned orders" ON public.orders;
CREATE POLICY "Drivers update assigned orders" ON public.orders FOR UPDATE 
    USING (
        (
            status = 'pending' 
            AND EXISTS (
                SELECT 1 FROM public.drivers d
                LEFT JOIN public.courier_wallets cw ON cw.courier_id = d.id
                WHERE d.id = auth.uid() 
                AND (cw.status IS NULL OR cw.status = 'active')
                AND (
                    orders.priority_window_ends_at IS NULL
                    OR orders.priority_window_ends_at <= NOW()
                    OR d.tier = 'platinum'
                )
            )
        )
        OR auth.uid() = driver_id
    );

-- ============================================================================
-- 11. BATCH RE-EVALUATION OF ALL EXISTING COURIERS
-- ============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.drivers LOOP
        PERFORM public.evaluate_driver_tier(r.id);
    END LOOP;
END;
$$;
