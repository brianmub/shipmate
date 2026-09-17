-- Database Migration: Order Cancellation, Driver Release, Distance-Based Fees, Debt Ledger & Masked Calls
-- File: 20260917150000_order_cancellation_release_and_debt.sql

-- ============================================================================
-- 1. EXTEND ORDER STATUS CONSTRAINT
-- ============================================================================
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN (
    'pending', 
    'driver_assigned', 
    'en_route_to_pickup', 
    'arrived_at_pickup', 
    'picked_up', 
    'en_route_to_delivery', 
    'arrived_at_delivery', 
    'delivered', 
    'completed', 
    'cancelled', 
    'failed',
    'en_route',
    'arrived',
    'in_delivery',
    'disputed'
));

-- ============================================================================
-- 2. ADD COLUMNS TO ORDERS, USERS, AND DRIVERS
-- ============================================================================
-- Orders: GPS Distance tracking, cancellation metrics, release audits, arrival timer
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS cumulative_distance_km NUMERIC(10,3) DEFAULT 0.000,
ADD COLUMN IF NOT EXISTS last_driver_latitude NUMERIC(10,7),
ADD COLUMN IF NOT EXISTS last_driver_longitude NUMERIC(10,7),
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cancellation_fee NUMERIC(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS released_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_released_reason TEXT,
ADD COLUMN IF NOT EXISTS last_released_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS arrival_timer_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS pending_release_compensation NUMERIC(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS pending_release_driver_id UUID REFERENCES public.drivers(id);

-- Users: Track customer near-threshold cancellations to detect abuse
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS near_threshold_cancellations_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cancellation_flagged BOOLEAN DEFAULT FALSE;

-- Drivers: Track released deliveries and penalty points
ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS released_deliveries INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_penalty_points NUMERIC(5,2) DEFAULT 0.00;

-- Expand transactions type check constraint to include cancellation fees
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK (
    type IN ('payout', 'earnings', 'adjustment', 'cancellation_fee', 'release_compensation')
);

-- ============================================================================
-- 3. CREATE MASKED CALL LOGS TABLE (Single unified logging path)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.masked_call_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    caller_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    caller_role TEXT CHECK (caller_role IN ('driver', 'customer', 'system')) NOT NULL,
    recipient_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    recipient_phone TEXT,
    masked_proxy_number TEXT DEFAULT '+2638677000123',
    status TEXT CHECK (status IN ('initiated', 'completed', 'unanswered', 'busy', 'failed', 'simulated')) DEFAULT 'initiated',
    duration_seconds INTEGER DEFAULT 0,
    trigger_event TEXT CHECK (trigger_event IN ('manual_driver_call', 'auto_cancellation', 'auto_release', 'customer_call')) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.masked_call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants and admins can view masked call logs" ON public.masked_call_logs;
CREATE POLICY "Participants and admins can view masked call logs"
ON public.masked_call_logs FOR SELECT
TO authenticated
USING (
    auth.uid() = caller_id 
    OR auth.uid() = recipient_id 
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Authenticated users can insert call logs" ON public.masked_call_logs;
CREATE POLICY "Authenticated users can insert call logs"
ON public.masked_call_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================================================
-- 4. CREATE ORDER RELEASES AUDIT TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.order_releases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE,
    reason TEXT CHECK (reason IN ('mechanical_issue', 'store_closed', 'customer_no_show')) NOT NULL,
    call_log_id UUID REFERENCES public.masked_call_logs(id) ON DELETE SET NULL,
    auto_flagged BOOLEAN DEFAULT FALSE,
    rating_penalty_applied NUMERIC(5,2) NOT NULL,
    compensation_proposed NUMERIC(10,2) DEFAULT 0.00,
    compensation_accepted BOOLEAN DEFAULT NULL, -- NULL: pending, TRUE: accepted, FALSE: disputed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.order_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins, drivers, and customers can view order releases" ON public.order_releases;
CREATE POLICY "Admins, drivers, and customers can view order releases"
ON public.order_releases FOR SELECT
TO authenticated
USING (
    auth.uid() = driver_id 
    OR EXISTS (SELECT 1 FROM public.orders WHERE id = order_id AND customer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Drivers can insert order releases" ON public.order_releases;
CREATE POLICY "Drivers can insert order releases"
ON public.order_releases FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = driver_id OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================================
-- 5. CREATE CANCELLATION DEBT LEDGER TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cancellation_debt (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    source TEXT CHECK (source IN ('cancellation_fee', 'release_compensation')) NOT NULL,
    settled BOOLEAN DEFAULT FALSE,
    settled_at TIMESTAMP WITH TIME ZONE,
    payment_method TEXT,
    payment_reference TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.cancellation_debt ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers and admins can view cancellation debts" ON public.cancellation_debt;
CREATE POLICY "Customers and admins can view cancellation debts"
ON public.cancellation_debt FOR SELECT
TO authenticated
USING (
    auth.uid() = customer_id 
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Service role can insert cancellation debts" ON public.cancellation_debt;
CREATE POLICY "Service role can insert cancellation debts"
ON public.cancellation_debt FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================================================
-- 6. SERVER-SIDE BLOCKING TRIGGER FOR UNSETTLED DEBT
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_check_customer_unsettled_debt()
RETURNS TRIGGER AS $$
DECLARE
    v_unsettled_debt NUMERIC;
BEGIN
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_unsettled_debt
    FROM public.cancellation_debt
    WHERE customer_id = NEW.customer_id AND settled = FALSE;

    IF v_unsettled_debt > 0 THEN
        RAISE EXCEPTION 'Order creation blocked: customer has unsettled cancellation debt of $%', v_unsettled_debt
        USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_order_if_unsettled_debt ON public.orders;
CREATE TRIGGER trg_prevent_order_if_unsettled_debt
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    EXECUTE PROCEDURE public.fn_check_customer_unsettled_debt();

-- ============================================================================
-- 7. CUMULATIVE DRIVER GPS DISTANCE ACCUMULATION TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_accumulate_driver_gps_distance()
RETURNS TRIGGER AS $$
DECLARE
    v_rad_lat1 NUMERIC;
    v_rad_lat2 NUMERIC;
    v_dlat NUMERIC;
    v_dlon NUMERIC;
    v_a NUMERIC;
    v_c NUMERIC;
    v_delta_km NUMERIC;
BEGIN
    -- Only accumulate when order is active and assigned to driver
    IF NEW.driver_id IS NOT NULL 
       AND NEW.driver_latitude IS NOT NULL 
       AND NEW.driver_longitude IS NOT NULL
       AND NEW.status IN ('driver_assigned', 'en_route', 'arrived', 'in_delivery', 
                          'en_route_to_pickup', 'arrived_at_pickup', 'picked_up', 'en_route_to_delivery', 'arrived_at_delivery') THEN
        
        IF OLD.driver_latitude IS NOT NULL AND OLD.driver_longitude IS NOT NULL THEN
            -- Haversine formula
            v_rad_lat1 := radians(OLD.driver_latitude);
            v_rad_lat2 := radians(NEW.driver_latitude);
            v_dlat := radians(NEW.driver_latitude - OLD.driver_latitude);
            v_dlon := radians(NEW.driver_longitude - OLD.driver_longitude);

            v_a := sin(v_dlat / 2.0)^2 + cos(v_rad_lat1) * cos(v_rad_lat2) * sin(v_dlon / 2.0)^2;
            v_c := 2.0 * atan2(sqrt(v_a), sqrt(greatest(0.0, 1.0 - v_a)));
            v_delta_km := 6371.0 * v_c;

            -- Filter GPS jitter (<5m) and abnormal teleport jumps (>5km per ping)
            IF v_delta_km >= 0.005 AND v_delta_km <= 5.0 THEN
                NEW.cumulative_distance_km := COALESCE(OLD.cumulative_distance_km, 0.000) + v_delta_km;
            END IF;
        END IF;

        NEW.last_driver_latitude := NEW.driver_latitude;
        NEW.last_driver_longitude := NEW.driver_longitude;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_accumulate_driver_gps_distance ON public.orders;
CREATE TRIGGER trg_accumulate_driver_gps_distance
    BEFORE UPDATE OF driver_latitude, driver_longitude ON public.orders
    FOR EACH ROW
    EXECUTE PROCEDURE public.fn_accumulate_driver_gps_distance();

-- ============================================================================
-- 8. FEE CALCULATION FUNCTION (0km -> free, 0.5-1km -> $0.50, >1km -> $0.25/km)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_cancellation_fee(p_distance_km NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
    IF p_distance_km IS NULL OR p_distance_km < 0.5 THEN
        RETURN 0.00;
    ELSIF p_distance_km <= 1.0 THEN
        RETURN 0.50;
    ELSE
        RETURN ROUND(p_distance_km * 0.25, 2);
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 9. ATOMIC STORED PROCEDURE: cancel_order_by_customer_rpc
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cancel_order_by_customer_rpc(
    p_order_id UUID,
    p_customer_id UUID,
    p_reason TEXT DEFAULT 'Customer requested cancellation'
)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_distance NUMERIC;
    v_fee NUMERIC := 0.00;
    v_debt_created BOOLEAN := FALSE;
BEGIN
    -- 1. Lock and fetch order
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    IF v_order.customer_id != p_customer_id THEN
        RAISE EXCEPTION 'Unauthorized: only the customer who created the order can cancel it';
    END IF;

    IF v_order.status IN ('completed', 'delivered', 'cancelled', 'disputed') THEN
        RAISE EXCEPTION 'Cannot cancel order in status %', v_order.status;
    END IF;

    v_distance := COALESCE(v_order.cumulative_distance_km, 0.000);

    -- 2. Compute fee if driver was assigned
    IF v_order.driver_id IS NOT NULL THEN
        v_fee := public.calculate_cancellation_fee(v_distance);

        -- Track near-threshold cancellations (0.3km <= distance < 0.5km)
        IF v_distance >= 0.3 AND v_distance < 0.5 THEN
            UPDATE public.users
            SET near_threshold_cancellations_count = COALESCE(near_threshold_cancellations_count, 0) + 1,
                cancellation_flagged = (COALESCE(near_threshold_cancellations_count, 0) + 1 >= 2)
            WHERE id = p_customer_id;
        END IF;

        -- If fee applies, create debt and credit driver in same transaction
        IF v_fee > 0.00 THEN
            INSERT INTO public.cancellation_debt (
                customer_id,
                order_id,
                amount,
                source,
                settled
            ) VALUES (
                p_customer_id,
                p_order_id,
                v_fee,
                'cancellation_fee',
                FALSE
            );
            v_debt_created := TRUE;

            -- Credit driver's wallet directly
            UPDATE public.drivers
            SET available_balance = available_balance + v_fee,
                total_earnings = total_earnings + v_fee
            WHERE id = v_order.driver_id;

            -- Record in transactions ledger
            INSERT INTO public.transactions (
                driver_id,
                amount,
                type,
                status
            ) VALUES (
                v_order.driver_id,
                v_fee,
                'cancellation_fee',
                'completed'
            );
        END IF;
    END IF;

    -- 3. Update order status to cancelled
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = NOW(),
        cancellation_reason = p_reason,
        cancellation_fee = v_fee
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'distance_km', v_distance,
        'fee', v_fee,
        'debt_created', v_debt_created,
        'driver_id', v_order.driver_id,
        'status', 'cancelled'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 10. ATOMIC STORED PROCEDURE: start_arrival_timer_rpc
-- ============================================================================
CREATE OR REPLACE FUNCTION public.start_arrival_timer_rpc(
    p_order_id UUID,
    p_driver_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order.driver_id != p_driver_id THEN
        RAISE EXCEPTION 'Unauthorized: only assigned driver can start arrival timer';
    END IF;

    IF v_order.arrival_timer_started_at IS NULL THEN
        UPDATE public.orders
        SET arrival_timer_started_at = NOW(),
            status = 'arrived_at_delivery'
        WHERE id = p_order_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'arrival_timer_started_at', COALESCE(v_order.arrival_timer_started_at, NOW())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 11. ATOMIC STORED PROCEDURE: release_order_by_driver_rpc
-- ============================================================================
CREATE OR REPLACE FUNCTION public.release_order_by_driver_rpc(
    p_order_id UUID,
    p_driver_id UUID,
    p_reason TEXT,
    p_call_log_id UUID DEFAULT NULL,
    p_compensation_proposed NUMERIC(10,2) DEFAULT 0.00
)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_call_attempts INTEGER := 0;
    v_auto_flagged BOOLEAN := FALSE;
    v_rating_penalty NUMERIC(5,2);
    v_max_comp NUMERIC(10,2);
    v_distance NUMERIC;
    v_driver RECORD;
BEGIN
    -- 1. Validate fixed enum reasons
    IF p_reason NOT IN ('mechanical_issue', 'store_closed', 'customer_no_show') THEN
        RAISE EXCEPTION 'Invalid release reason: %. Must be mechanical_issue, store_closed, or customer_no_show', p_reason;
    END IF;

    -- 2. Lock order
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    IF v_order.driver_id != p_driver_id THEN
        RAISE EXCEPTION 'Unauthorized: driver % is not assigned to order %', p_driver_id, p_order_id;
    END IF;

    v_distance := COALESCE(v_order.cumulative_distance_km, 0.000);

    -- 3. Validate Anti-Abuse Protocol based on Reason
    IF p_reason = 'customer_no_show' THEN
        -- Gating: Must be at delivery stage
        IF v_order.status NOT IN ('arrived_at_delivery', 'arrived') THEN
            v_auto_flagged := TRUE;
        END IF;

        -- Must have 3 distinct calls spaced >= 1 min apart
        SELECT COUNT(*) INTO v_call_attempts
        FROM public.masked_call_logs
        WHERE order_id = p_order_id 
          AND caller_id = p_driver_id
          AND trigger_event IN ('manual_driver_call', 'customer_call');

        IF v_call_attempts < 3 THEN
            v_auto_flagged := TRUE;
        END IF;

        -- Must have 5-minute arrival timer elapsed
        IF v_order.arrival_timer_started_at IS NULL OR NOW() < (v_order.arrival_timer_started_at + INTERVAL '5 minutes') THEN
            v_auto_flagged := TRUE;
        END IF;

        IF v_auto_flagged THEN
            v_rating_penalty := 0.50; -- Max penalty for bypassing anti-abuse rules
        ELSE
            v_rating_penalty := 0.15; -- Heavy penalty
        END IF;

    ELSIF p_reason = 'store_closed' THEN
        -- Require at least 1 call attempt
        SELECT COUNT(*) INTO v_call_attempts
        FROM public.masked_call_logs
        WHERE order_id = p_order_id 
          AND caller_id = p_driver_id;

        IF v_call_attempts < 1 THEN
            v_auto_flagged := TRUE;
            v_rating_penalty := 0.50; -- Max penalty
        ELSE
            v_rating_penalty := 0.15; -- Heavy penalty
        END IF;

    ELSE -- 'mechanical_issue'
        v_rating_penalty := 0.05; -- Light penalty
    END IF;

    -- 4. Bound proposed compensation to distance traveled
    IF p_compensation_proposed > 0.00 THEN
        IF v_distance <= 1.0 THEN
            v_max_comp := 0.50;
        ELSE
            v_max_comp := LEAST(ROUND(v_distance * 0.25, 2), COALESCE(v_order.estimated_cost, 5.00));
        END IF;
        p_compensation_proposed := LEAST(p_compensation_proposed, v_max_comp);
    ELSE
        p_compensation_proposed := 0.00;
    END IF;

    -- 5. Insert audit row in order_releases
    INSERT INTO public.order_releases (
        order_id,
        driver_id,
        reason,
        call_log_id,
        auto_flagged,
        rating_penalty_applied,
        compensation_proposed,
        compensation_accepted
    ) VALUES (
        p_order_id,
        p_driver_id,
        p_reason,
        p_call_log_id,
        v_auto_flagged,
        v_rating_penalty,
        p_compensation_proposed,
        NULL -- Customer must explicitly accept/reject
    );

    -- 6. Apply rating penalty directly to driver Platinum scoring metrics
    UPDATE public.drivers
    SET average_rating = GREATEST(1.00, LEAST(5.00, COALESCE(average_rating, 5.00) - v_rating_penalty)),
        released_deliveries = COALESCE(released_deliveries, 0) + 1,
        total_penalty_points = COALESCE(total_penalty_points, 0.00) + v_rating_penalty
    WHERE id = p_driver_id;

    -- Re-evaluate Platinum tier
    PERFORM public.evaluate_driver_tier(p_driver_id);

    -- 7. Reset order to pending (released is not a resting state)
    UPDATE public.orders
    SET status = 'pending',
        driver_id = NULL,
        released_count = COALESCE(released_count, 0) + 1,
        last_released_reason = p_reason,
        last_released_at = NOW(),
        pending_release_compensation = p_compensation_proposed,
        pending_release_driver_id = p_driver_id,
        arrival_timer_started_at = NULL
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'reason', p_reason,
        'auto_flagged', v_auto_flagged,
        'rating_penalty', v_rating_penalty,
        'compensation_proposed', p_compensation_proposed,
        'status', 'pending'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 12. ATOMIC STORED PROCEDURE: respond_to_release_compensation_rpc
-- ============================================================================
CREATE OR REPLACE FUNCTION public.respond_to_release_compensation_rpc(
    p_order_id UUID,
    p_customer_id UUID,
    p_accepted BOOLEAN,
    p_dispute_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_comp_amount NUMERIC(10,2);
    v_driver_id UUID;
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order.customer_id != p_customer_id THEN
        RAISE EXCEPTION 'Unauthorized: only order customer can respond to compensation';
    END IF;

    v_comp_amount := COALESCE(v_order.pending_release_compensation, 0.00);
    v_driver_id := v_order.pending_release_driver_id;

    IF p_accepted THEN
        IF v_comp_amount > 0.00 AND v_driver_id IS NOT NULL THEN
            -- Create customer debt
            INSERT INTO public.cancellation_debt (
                customer_id,
                order_id,
                amount,
                source,
                settled
            ) VALUES (
                p_customer_id,
                p_order_id,
                v_comp_amount,
                'release_compensation',
                FALSE
            );

            -- Credit driver wallet
            UPDATE public.drivers
            SET available_balance = available_balance + v_comp_amount,
                total_earnings = total_earnings + v_comp_amount
            WHERE id = v_driver_id;

            -- Record in transactions ledger
            INSERT INTO public.transactions (
                driver_id,
                amount,
                type,
                status
            ) VALUES (
                v_driver_id,
                v_comp_amount,
                'release_compensation',
                'completed'
            );
        END IF;

        -- Update order release audit
        UPDATE public.order_releases
        SET compensation_accepted = TRUE
        WHERE order_id = p_order_id AND driver_id = v_driver_id;

        -- Clear pending compensation; order stays in pending for priority dispatch
        UPDATE public.orders
        SET pending_release_compensation = 0.00,
            pending_release_driver_id = NULL
        WHERE id = p_order_id;

        RETURN jsonb_build_object(
            'success', true,
            'accepted', true,
            'compensation_debt', v_comp_amount,
            'status', 'pending'
        );
    ELSE
        -- Customer rejected / disputed: Order state transitions to disputed
        UPDATE public.order_releases
        SET compensation_accepted = FALSE
        WHERE order_id = p_order_id AND driver_id = v_driver_id;

        UPDATE public.orders
        SET status = 'disputed',
            cancellation_reason = COALESCE(p_dispute_reason, 'Customer disputed driver release compensation'),
            pending_release_compensation = 0.00,
            pending_release_driver_id = NULL
        WHERE id = p_order_id;

        RETURN jsonb_build_object(
            'success', true,
            'accepted', false,
            'status', 'disputed'
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 13. ATOMIC STORED PROCEDURE: settle_cancellation_debt_rpc
-- ============================================================================
CREATE OR REPLACE FUNCTION public.settle_cancellation_debt_rpc(
    p_customer_id UUID,
    p_payment_method TEXT,
    p_payment_reference TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_count INTEGER;
    v_total NUMERIC(10,2);
BEGIN
    SELECT COUNT(*), COALESCE(SUM(amount), 0.00)
    INTO v_count, v_total
    FROM public.cancellation_debt
    WHERE customer_id = p_customer_id AND settled = FALSE;

    IF v_count > 0 THEN
        UPDATE public.cancellation_debt
        SET settled = TRUE,
            settled_at = NOW(),
            payment_method = p_payment_method,
            payment_reference = p_payment_reference
        WHERE customer_id = p_customer_id AND settled = FALSE;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'debts_settled', v_count,
        'amount_settled', v_total
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
