-- Database Migration: Create Vouchers, Promo Codes, and Driver Subsidy Ledger
-- Ensures customers get discounts while drivers are 100% compensated via platform promo credits.

-- 1. Alter Orders Table to Store Price Breakdown
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promo_code TEXT;

-- 2. Create Vouchers Table
CREATE TABLE IF NOT EXISTS public.vouchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('fixed', 'percentage')),
    discount_value NUMERIC(10,2) NOT NULL,
    min_order_amount NUMERIC(10,2) DEFAULT 4.00,
    max_uses_per_user INT DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Voucher Redemptions Table (Track usage per customer)
CREATE TABLE IF NOT EXISTS public.voucher_redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voucher_id UUID REFERENCES public.vouchers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    discount_applied NUMERIC(10,2) NOT NULL,
    redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_voucher UNIQUE(voucher_id, user_id)
);

-- 4. Seed Default WELCOME263 Voucher ($2.00 off orders over $4.00)
INSERT INTO public.vouchers (code, description, discount_type, discount_value, min_order_amount, max_uses_per_user, is_active)
VALUES (
    'WELCOME263',
    '$2.00 OFF First Delivery for New Customers',
    'fixed',
    2.00,
    4.00,
    1,
    true
)
ON CONFLICT (code) DO UPDATE SET
    discount_value = 2.00,
    min_order_amount = 4.00,
    is_active = true;

-- 5. Atomic RPC: Credit Driver Wallet for Platform Promo Subsidy
CREATE OR REPLACE FUNCTION public.credit_promo_subsidy_rpc(
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
    -- Lock driver wallet row
    SELECT balance, status INTO v_old_balance, v_status
    FROM public.courier_wallets
    WHERE courier_id = p_courier_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.courier_wallets (courier_id, balance, status)
        VALUES (p_courier_id, 0.00, 'locked')
        RETURNING balance, status INTO v_old_balance, v_status;
    END IF;

    -- Add promo subsidy amount to driver's balance
    v_new_balance := v_old_balance + p_amount;

    -- Unlock driver if balance is now above threshold
    IF v_new_balance >= 0.25 THEN
        v_status := 'active';
    END IF;

    -- Update wallet balance and status
    UPDATE public.courier_wallets
    SET 
        balance = v_new_balance,
        status = v_status,
        updated_at = NOW()
    WHERE courier_id = p_courier_id;

    -- Record transaction in ledger as 'promo_credit'
    INSERT INTO public.wallet_transactions (
        courier_id,
        type,
        amount,
        net_amount,
        job_id
    )
    VALUES (
        p_courier_id,
        'promo_credit',
        p_amount,
        p_amount,
        p_job_id
    );

    RETURN QUERY SELECT v_old_balance, v_new_balance, v_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Row Level Security Policies
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_redemptions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view active vouchers for checkout validation
CREATE POLICY "Allow users to view active vouchers"
ON public.vouchers
FOR SELECT
TO authenticated
USING (is_active = true);

-- Allow users to view their own redemptions
CREATE POLICY "Allow users to view own redemptions"
ON public.voucher_redemptions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Allow users to insert their redemption during checkout
CREATE POLICY "Allow users to record redemption"
ON public.voucher_redemptions
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Allow admins full access
CREATE POLICY "Admins full access to vouchers"
ON public.vouchers
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role = 'admin'
    )
);

CREATE POLICY "Admins full access to voucher redemptions"
ON public.voucher_redemptions
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role = 'admin'
    )
);
