-- ============================================================================
-- Migration: Courier Wallet Threshold Enforcement ($3 Warning, $0.25 Lockout)
-- File: 20260921133000_courier_wallet_threshold_enforcement.sql
-- ============================================================================

-- 1. Function to enforce status and disconnect driver if balance <= 0.25
CREATE OR REPLACE FUNCTION public.handle_courier_wallet_lockout()
RETURNS TRIGGER AS $$
BEGIN
    -- Enforce locked status if balance <= 0.25
    IF NEW.balance <= 0.25 THEN
        NEW.status := 'locked';
    ELSIF NEW.balance > 0.25 AND (NEW.status IS NULL OR NEW.status = 'locked') THEN
        NEW.status := 'active';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_courier_wallet_lockout_before ON public.courier_wallets;
CREATE TRIGGER trg_courier_wallet_lockout_before
    BEFORE INSERT OR UPDATE OF balance, status ON public.courier_wallets
    FOR EACH ROW EXECUTE FUNCTION public.handle_courier_wallet_lockout();

-- After update trigger: if status becomes locked, immediately force driver offline
CREATE OR REPLACE FUNCTION public.handle_courier_wallet_lockout_after()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'locked' OR NEW.balance <= 0.25 THEN
        UPDATE public.drivers
        SET is_online = false, is_available = false
        WHERE id = NEW.courier_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_courier_wallet_lockout_after ON public.courier_wallets;
CREATE TRIGGER trg_courier_wallet_lockout_after
    AFTER INSERT OR UPDATE OF balance, status ON public.courier_wallets
    FOR EACH ROW EXECUTE FUNCTION public.handle_courier_wallet_lockout_after();

-- 2. Update deduct_commission_rpc to use <= 0.25 for lockout
CREATE OR REPLACE FUNCTION public.deduct_commission_rpc(
    p_courier_id UUID,
    p_amount DECIMAL(12,2),
    p_job_id UUID
)
RETURNS TABLE (
    old_balance DECIMAL(12,2),
    new_balance DECIMAL(12,2),
    new_status TEXT
) AS $$
DECLARE
    v_old_balance DECIMAL(12,2);
    v_new_balance DECIMAL(12,2);
    v_status TEXT;
BEGIN
    -- Get current wallet details with row lock
    SELECT balance, status INTO v_old_balance, v_status
    FROM public.courier_wallets
    WHERE courier_id = p_courier_id
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Auto-create wallet if missing
        INSERT INTO public.courier_wallets (courier_id, balance, status)
        VALUES (p_courier_id, 0.00, 'locked')
        RETURNING balance, status INTO v_old_balance, v_status;
    END IF;

    -- Calculate new balance
    v_new_balance := v_old_balance - p_amount;

    -- Set locked status if new balance <= 0.25
    IF v_new_balance <= 0.25 THEN
        v_status := 'locked';
        -- Disconnect driver from dispatch
        UPDATE public.drivers
        SET is_online = false, is_available = false
        WHERE id = p_courier_id;
    ELSE
        v_status := 'active';
    END IF;

    -- Update wallet
    UPDATE public.courier_wallets
    SET 
        balance = v_new_balance,
        status = v_status,
        updated_at = NOW()
    WHERE courier_id = p_courier_id;

    -- Record transaction
    INSERT INTO public.wallet_transactions (courier_id, type, amount, job_id)
    VALUES (p_courier_id, 'commission_deduction', p_amount, p_job_id);

    RETURN QUERY SELECT v_old_balance, v_new_balance, v_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update get_nearby_available_drivers to exclude locked couriers (balance <= 0.25 or status = 'locked')
CREATE OR REPLACE FUNCTION public.get_nearby_available_drivers(
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_radius_km DOUBLE PRECISION DEFAULT 15.0
)
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    vehicle_type TEXT,
    vehicle_model TEXT,
    vehicle_plate TEXT,
    current_latitude DOUBLE PRECISION,
    current_longitude DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    average_rating NUMERIC,
    tier TEXT,
    distance_km DOUBLE PRECISION,
    location_updated_at TIMESTAMP WITH TIME ZONE
) AS $$
#variable_conflict use_column
DECLARE
    v_center_lat DOUBLE PRECISION := COALESCE(p_latitude, -17.8248);
    v_center_lng DOUBLE PRECISION := COALESCE(p_longitude, 31.0530);
BEGIN
    RETURN QUERY
    WITH active_drivers AS (
        SELECT 
            d.id AS a_id,
            COALESCE(u.full_name, 'ShipMate Courier') AS a_full_name,
            COALESCE(u.phone, '') AS a_phone,
            u.profile_photo_url AS a_avatar_url,
            COALESCE(veh.vehicle_type, 'motorcycle') AS a_vehicle_type,
            COALESCE(veh.make || ' ' || veh.model, 'Delivery Bike') AS a_vehicle_model,
            COALESCE(veh.license_plate, '') AS a_vehicle_plate,
            -- If real GPS exists, use it; otherwise generate deterministic local scatter within ~1.5 km
            COALESCE(d.current_latitude, v_center_lat + ((('x' || substr(md5(d.id::text || 'lat'), 1, 4))::bit(16)::int % 200 - 100) * 0.00025)) AS a_calc_lat,
            COALESCE(d.current_longitude, v_center_lng + ((('x' || substr(md5(d.id::text || 'lng'), 1, 4))::bit(16)::int % 200 - 100) * 0.00025)) AS a_calc_lng,
            COALESCE(d.heading, 0) AS a_heading,
            COALESCE(d.average_rating, 5.0) AS a_average_rating,
            COALESCE(d.tier, 'standard') AS a_tier,
            COALESCE(d.location_updated_at, NOW()) AS a_location_updated_at
        FROM public.drivers d
        JOIN public.users u ON u.id = d.id
        LEFT JOIN LATERAL (
            SELECT v.vehicle_type, v.make, v.model, v.license_plate
            FROM public.vehicles v
            WHERE v.driver_id = d.id AND v.is_active = true
            ORDER BY v.created_at DESC
            LIMIT 1
        ) veh ON true
        WHERE d.is_online = true 
          AND d.verification_status = 'approved'
          -- Exclude locked-out drivers whose wallet balance is <= $0.25 or status is 'locked'
          AND NOT EXISTS (
              SELECT 1 FROM public.courier_wallets cw
              WHERE cw.courier_id = d.id 
                AND (cw.status = 'locked' OR cw.balance <= 0.25)
          )
    )
    SELECT 
        a.a_id AS id,
        a.a_full_name AS full_name,
        a.a_phone AS phone,
        a.a_avatar_url AS avatar_url,
        a.a_vehicle_type AS vehicle_type,
        a.a_vehicle_model AS vehicle_model,
        a.a_vehicle_plate AS vehicle_plate,
        a.a_calc_lat AS current_latitude,
        a.a_calc_lng AS current_longitude,
        a.a_heading AS heading,
        a.a_average_rating AS average_rating,
        a.a_tier AS tier,
        -- Spherical Law of Cosines distance in km
        ROUND(
            (6371.0 * ACOS(
                LEAST(1.0, GREATEST(-1.0,
                    COS(RADIANS(v_center_lat)) * COS(RADIANS(a.a_calc_lat)) *
                    COS(RADIANS(a.a_calc_lng) - RADIANS(v_center_lng)) +
                    SIN(RADIANS(v_center_lat)) * SIN(RADIANS(a.a_calc_lat))
                ))
            ))::NUMERIC, 
            2
        )::DOUBLE PRECISION AS distance_km,
        a.a_location_updated_at AS location_updated_at
    FROM active_drivers a
    WHERE (
        6371.0 * ACOS(
            LEAST(1.0, GREATEST(-1.0,
                COS(RADIANS(v_center_lat)) * COS(RADIANS(a.a_calc_lat)) *
                COS(RADIANS(a.a_calc_lng) - RADIANS(v_center_lng)) +
                SIN(RADIANS(v_center_lat)) * SIN(RADIANS(a.a_calc_lat))
            ))
        )
    ) <= p_radius_km
    ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
