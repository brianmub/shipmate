-- Migration: Courier Payout & Automated Disbursement System
-- Date: 2026-09-17
-- Description: Enhances transactions table with payout metadata and creates atomic process_driver_payout_rpc

-- 1. Ensure transactions table has payout columns
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS payout_method TEXT CHECK (payout_method IN ('ecocash', 'innbucks', 'bank_transfer')),
ADD COLUMN IF NOT EXISTS payout_destination TEXT,
ADD COLUMN IF NOT EXISTS payout_reference TEXT,
ADD COLUMN IF NOT EXISTS provider_response JSONB DEFAULT '{}'::jsonb;

-- 2. Atomic Payout Disbursement RPC
CREATE OR REPLACE FUNCTION public.process_driver_payout_rpc(
    p_driver_id UUID,
    p_amount DECIMAL(10,2),
    p_method TEXT,
    p_destination TEXT,
    p_reference TEXT,
    p_provider_details JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    v_current_balance DECIMAL(12,2);
    v_min_threshold DECIMAL(10,2);
    v_tx_id UUID;
    v_new_balance DECIMAL(12,2);
BEGIN
    -- 1. Lock and check current driver available balance
    SELECT COALESCE(available_balance, 0.00) INTO v_current_balance
    FROM public.drivers
    WHERE id = p_driver_id
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
        RAISE EXCEPTION 'Driver profile not found for ID %', p_driver_id;
    END IF;

    -- 2. Check threshold from system_settings
    SELECT COALESCE(min_payout_threshold, 20.00) INTO v_min_threshold
    FROM public.system_settings
    LIMIT 1;

    IF v_min_threshold IS NULL THEN
        v_min_threshold := 20.00;
    END IF;

    IF p_amount < v_min_threshold THEN
        RAISE EXCEPTION 'Minimum payout threshold is $%', v_min_threshold;
    END IF;

    IF v_current_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient balance. Available: $%, Requested: $%', v_current_balance, p_amount;
    END IF;

    v_new_balance := v_current_balance - p_amount;

    -- 3. Deduct from available_balance
    UPDATE public.drivers
    SET available_balance = v_new_balance
    WHERE id = p_driver_id;

    -- 4. Record transaction ledger entry
    INSERT INTO public.transactions (
        driver_id,
        amount,
        type,
        status,
        payout_method,
        payout_destination,
        payout_reference,
        provider_response
    )
    VALUES (
        p_driver_id,
        p_amount,
        'payout',
        'completed',
        p_method,
        p_destination,
        p_reference,
        p_provider_details
    )
    RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'amount', p_amount,
        'previous_balance', v_current_balance,
        'remaining_balance', v_new_balance,
        'reference', p_reference,
        'method', p_method,
        'destination', p_destination
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
