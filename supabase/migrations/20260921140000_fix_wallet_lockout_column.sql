-- ============================================================================
-- Migration: Fix driver column in wallet lockout triggers and commission deduction
-- File: 20260921140000_fix_wallet_lockout_column.sql
-- ============================================================================

-- 1. Fix handle_courier_wallet_lockout_after to update only is_online
CREATE OR REPLACE FUNCTION public.handle_courier_wallet_lockout_after()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'locked' OR NEW.balance <= 0.25 THEN
        UPDATE public.drivers
        SET is_online = false
        WHERE id = NEW.courier_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Fix deduct_commission_rpc to update only is_online
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
        SET is_online = false
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
