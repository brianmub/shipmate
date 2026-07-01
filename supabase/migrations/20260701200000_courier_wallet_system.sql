-- Migration: Courier Wallet System
-- Target: Supabase Local / Remote Database

-- 1. Create Courier Wallets table
CREATE TABLE IF NOT EXISTS public.courier_wallets (
    courier_id UUID PRIMARY KEY REFERENCES public.drivers(id) ON DELETE CASCADE,
    balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('active', 'locked')),
    promo_applied BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Wallet Transactions table (Full Audit Trail)
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    courier_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('topup', 'commission_deduction', 'promo_credit')),
    amount DECIMAL(12,2) NOT NULL,
    net_amount DECIMAL(12,2) NULL,
    job_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Courier Registration Sequence table (Persistent Order Counter)
CREATE TABLE IF NOT EXISTS public.courier_registration_sequence (
    courier_id UUID PRIMARY KEY REFERENCES public.drivers(id) ON DELETE CASCADE,
    registration_order SERIAL NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Automatic Wallet Creation & Registration Sequence triggers

-- Trigger function for creating wallet
CREATE OR REPLACE FUNCTION public.handle_new_driver_wallet()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.courier_wallets (courier_id, balance, status)
    VALUES (NEW.id, 0.00, 'locked')
    ON CONFLICT (courier_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_driver_created_create_wallet ON public.drivers;
CREATE TRIGGER on_driver_created_create_wallet
    AFTER INSERT ON public.drivers
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_driver_wallet();

-- Trigger function for registration sequencing
CREATE OR REPLACE FUNCTION public.handle_new_driver_registration()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.courier_registration_sequence (courier_id)
    VALUES (NEW.id)
    ON CONFLICT (courier_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_driver_created_registration_seq ON public.drivers;
CREATE TRIGGER on_driver_created_registration_seq
    AFTER INSERT ON public.drivers
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_driver_registration();

-- 5. Seed Existing Drivers (create wallets and registration order based on existing drivers)
INSERT INTO public.courier_registration_sequence (courier_id, created_at)
SELECT id, created_at FROM public.drivers
ORDER BY created_at ASC
ON CONFLICT (courier_id) DO NOTHING;

INSERT INTO public.courier_wallets (courier_id, balance, status)
SELECT id, 0.00, 'locked' FROM public.drivers
ON CONFLICT (courier_id) DO NOTHING;

-- 6. Atomic Database RPC Helper Functions

-- Commission Deduction RPC
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

    -- Set locked status if new balance < 0.25
    IF v_new_balance < 0.25 THEN
        v_status := 'locked';
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

-- Promo Credit Grant RPC
CREATE OR REPLACE FUNCTION public.grant_promo_credit_rpc(
    p_courier_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_promo_applied BOOLEAN;
    v_reg_order INT;
BEGIN
    -- Check if wallet exists and promo is already applied with row lock
    SELECT promo_applied INTO v_promo_applied
    FROM public.courier_wallets
    WHERE courier_id = p_courier_id
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Create wallet
        INSERT INTO public.courier_wallets (courier_id, balance, status, promo_applied)
        VALUES (p_courier_id, 0.00, 'locked', FALSE)
        RETURNING promo_applied INTO v_promo_applied;
    END IF;

    IF v_promo_applied THEN
        RETURN FALSE; -- Already applied
    END IF;

    -- Get or create registration sequence number
    SELECT registration_order INTO v_reg_order
    FROM public.courier_registration_sequence
    WHERE courier_id = p_courier_id;

    IF NOT FOUND THEN
        INSERT INTO public.courier_registration_sequence (courier_id)
        VALUES (p_courier_id)
        RETURNING registration_order INTO v_reg_order;
    END IF;

    -- If in the first 50 registrations
    IF v_reg_order <= 50 THEN
        -- Credit $10
        UPDATE public.courier_wallets
        SET 
            balance = balance + 10.00,
            status = CASE WHEN balance + 10.00 >= 0.25 THEN 'active' ELSE 'locked' END,
            promo_applied = TRUE,
            updated_at = NOW()
        WHERE courier_id = p_courier_id;

        -- Record transaction
        INSERT INTO public.wallet_transactions (courier_id, type, amount, net_amount)
        VALUES (p_courier_id, 'promo_credit', 10.00, 10.00);

        RETURN TRUE;
    ELSE
        -- Just mark promo_applied to avoid re-checking
        UPDATE public.courier_wallets
        SET promo_applied = TRUE, updated_at = NOW()
        WHERE courier_id = p_courier_id;
        
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Wallet Top-up RPC
CREATE OR REPLACE FUNCTION public.topup_wallet_rpc(
    p_courier_id UUID,
    p_gross_amount DECIMAL(12,2),
    p_net_amount DECIMAL(12,2)
)
RETURNS DECIMAL(12,2) AS $$
DECLARE
    v_new_balance DECIMAL(12,2);
BEGIN
    -- Update wallet balance and status
    INSERT INTO public.courier_wallets (courier_id, balance, status)
    VALUES (p_courier_id, p_net_amount, CASE WHEN p_net_amount >= 0.25 THEN 'active' ELSE 'locked' END)
    ON CONFLICT (courier_id) DO UPDATE
    SET 
        balance = courier_wallets.balance + p_net_amount,
        status = CASE WHEN courier_wallets.balance + p_net_amount >= 0.25 THEN 'active' ELSE 'locked' END,
        updated_at = NOW()
    RETURNING balance INTO v_new_balance;

    -- Record transaction
    INSERT INTO public.wallet_transactions (courier_id, type, amount, net_amount)
    VALUES (p_courier_id, 'topup', p_gross_amount, p_net_amount);

    RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Row Level Security Policies

ALTER TABLE public.courier_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_registration_sequence ENABLE ROW LEVEL SECURITY;

-- Wallets
DROP POLICY IF EXISTS "Drivers view own wallet" ON public.courier_wallets;
CREATE POLICY "Drivers view own wallet" ON public.courier_wallets
    FOR SELECT USING (auth.uid() = courier_id);

DROP POLICY IF EXISTS "Admins manage all wallets" ON public.courier_wallets;
CREATE POLICY "Admins manage all wallets" ON public.courier_wallets
    FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- Transactions
DROP POLICY IF EXISTS "Drivers view own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Drivers view own wallet transactions" ON public.wallet_transactions
    FOR SELECT USING (auth.uid() = courier_id);

DROP POLICY IF EXISTS "Admins manage all transactions" ON public.wallet_transactions;
CREATE POLICY "Admins manage all transactions" ON public.wallet_transactions
    FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- Registration sequence (Admin only)
DROP POLICY IF EXISTS "Admins manage registration sequence" ON public.courier_registration_sequence;
CREATE POLICY "Admins manage registration sequence" ON public.courier_registration_sequence
    FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- 8. Enforce Lockout at the Order Level RLS Policies

DROP POLICY IF EXISTS "Drivers view pending orders" ON public.orders;
CREATE POLICY "Drivers view pending orders" ON public.orders FOR SELECT 
    USING (
        status = 'pending' 
        AND EXISTS (
            SELECT 1 FROM public.users 
            JOIN public.courier_wallets cw ON cw.courier_id = users.id
            WHERE users.id = auth.uid() 
            AND users.role = 'driver'
            AND cw.status = 'active'
        )
    );

DROP POLICY IF EXISTS "Drivers update assigned orders" ON public.orders;
CREATE POLICY "Drivers update assigned orders" ON public.orders FOR UPDATE 
    USING (
        (status = 'pending' AND EXISTS (
            SELECT 1 FROM public.courier_wallets 
            WHERE courier_id = auth.uid() AND status = 'active'
        ))
        OR auth.uid() = driver_id
    );

-- 9. Update existing calculate_order_earnings trigger function to avoid double-charging
-- Since platform commission is now deducted from the prepaid wallet/float separately,
-- the driver gets 100% of the order's estimated cost as earnings in their available_balance.
CREATE OR REPLACE FUNCTION public.calculate_order_earnings() 
RETURNS TRIGGER AS $$
DECLARE
    v_total_amount DECIMAL;
    v_driver_earnings DECIMAL;
BEGIN
    -- Only trigger when status changes to 'delivered'
    IF NEW.status = 'delivered' AND OLD.status != 'delivered' AND NEW.driver_id IS NOT NULL THEN
        
        v_total_amount := COALESCE(NEW.estimated_cost, 0);
        v_driver_earnings := v_total_amount; -- Driver receives 100% of the order fee

        -- Update the driver's financial metrics
        UPDATE public.drivers
        SET 
            total_earnings = total_earnings + v_driver_earnings,
            available_balance = available_balance + v_driver_earnings,
            completed_deliveries = completed_deliveries + 1,
            total_deliveries = total_deliveries + 1
        WHERE id = NEW.driver_id;

        -- Update customer metrics
        UPDATE public.customers
        SET 
            total_orders = total_orders + 1,
            lifetime_spend = lifetime_spend + v_total_amount
        WHERE id = NEW.customer_id;

        -- Record transaction history
        INSERT INTO public.transactions (driver_id, amount, type, status)
        VALUES (NEW.driver_id, v_driver_earnings, 'earnings', 'completed');

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Update system settings default commission rate to 12.00% to match new float system
UPDATE public.system_settings
SET commission_rate = 12.00
WHERE id = 1;


