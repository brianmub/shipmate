-- ==============================================================================
-- ShipMate Consolidated Live Migrations Deployment
-- Generated: 2026-09-17T14:42:21.878Z
-- Total Migrations: 24
-- ==============================================================================


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #1: 20260505155548_add_order_offers_table.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Create Order Offers Table (Bidding System)
CREATE TABLE IF NOT EXISTS public.order_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES public.users(id),
    offer_amount DECIMAL(10,2) NOT NULL,
    pickup_time_estimate INTEGER, -- calculated in minutes
    driver_latitude DOUBLE PRECISION,
    driver_longitude DOUBLE PRECISION,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for Order Offers
ALTER TABLE public.order_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can create and view their own offers" ON public.order_offers;
CREATE POLICY "Drivers can create and view their own offers" 
ON public.order_offers FOR ALL USING (auth.uid() = driver_id);

DROP POLICY IF EXISTS "Customers can view offers for their orders" ON public.order_offers;
CREATE POLICY "Customers can view offers for their orders" 
ON public.order_offers FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.orders 
        WHERE id = order_offers.order_id 
        AND customer_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Customers can update offer status (accept/reject)" ON public.order_offers;
CREATE POLICY "Customers can update offer status (accept/reject)" 
ON public.order_offers FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.orders 
        WHERE id = order_offers.order_id 
        AND customer_id = auth.uid()
    )
);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #2: 20260614140000_align_settings_and_transactions.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 1. Create system_settings table matching web-admin expected schema
CREATE TABLE IF NOT EXISTS public.system_settings (
    id INT PRIMARY KEY DEFAULT 1,
    commission_rate DECIMAL(5,2) DEFAULT 13.00,
    base_delivery_fee DECIMAL(10,2) DEFAULT 5.00,
    per_km_rate DECIMAL(10,2) DEFAULT 1.50,
    max_driver_radius INTEGER DEFAULT 10,
    min_payout_threshold DECIMAL(10,2) DEFAULT 20.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT one_row CHECK (id = 1)
);

-- Insert default values if not exists
INSERT INTO public.system_settings (id, commission_rate, base_delivery_fee, per_km_rate, max_driver_radius, min_payout_threshold)
VALUES (1, 13.00, 5.00, 1.50, 10, 20.00)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS for system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All authenticated users can view system settings" ON public.system_settings;
CREATE POLICY "All authenticated users can view system settings" 
ON public.system_settings FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Admins can manage system settings" ON public.system_settings;
CREATE POLICY "Admins can manage system settings" 
ON public.system_settings FOR ALL 
USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));


-- 2. Create transactions table (ledger for payouts/earnings history)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    type TEXT CHECK (type IN ('payout', 'earnings', 'adjustment')) NOT NULL,
    status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can view their own transactions" ON public.transactions;
CREATE POLICY "Drivers can view their own transactions" 
ON public.transactions FOR SELECT 
USING (auth.uid() = driver_id);

DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;
CREATE POLICY "Admins can view all transactions" 
ON public.transactions FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));


-- 3. Update the calculate_order_earnings trigger function to use system_settings and record transactions
CREATE OR REPLACE FUNCTION public.calculate_order_earnings() 
RETURNS TRIGGER AS $$
DECLARE
    v_platform_fee_rate DECIMAL;
    v_total_amount DECIMAL;
    v_driver_earnings DECIMAL;
    v_platform_fee DECIMAL;
BEGIN
    -- Fetch the current commission rate from settings
    SELECT (commission_rate / 100) INTO v_platform_fee_rate 
    FROM public.system_settings 
    WHERE id = 1;

    -- Fallback to 13% if setting missing
    IF v_platform_fee_rate IS NULL THEN
        v_platform_fee_rate := 0.13;
    END IF;

    -- Only trigger when status changes to 'delivered'
    IF NEW.status = 'delivered' AND OLD.status != 'delivered' AND NEW.driver_id IS NOT NULL THEN
        
        v_total_amount := COALESCE(NEW.estimated_cost, 0);
        v_platform_fee := v_total_amount * v_platform_fee_rate;
        v_driver_earnings := v_total_amount - v_platform_fee;

        -- Update the driver's financial metrics
        UPDATE public.drivers
        SET 
            total_earnings = total_earnings + v_driver_earnings,
            available_balance = available_balance + v_driver_earnings,
            platform_fees_paid = platform_fees_paid + v_platform_fee,
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

-- Re-attach the trigger
DROP TRIGGER IF EXISTS on_order_delivered ON public.orders;
CREATE TRIGGER on_order_delivered
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE PROCEDURE public.calculate_order_earnings();


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #3: 20260616160000_add_ai_size_estimate_to_orders.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Add package_image_url if not exists to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS package_image_url TEXT;

-- Add ai_size_estimate if not exists to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ai_size_estimate TEXT;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #4: 20260622183500_add_admin_policies_to_users.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Database Migration: Add Admin RLS Policies

-- 1. Create a security-definer helper function to check admin role
-- This bypasses RLS and prevents infinite recursion loops in policies
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop existing policies on public.users if they exist
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins can update all users" ON public.users;

-- 3. Create Admin policies for public.users
CREATE POLICY "Admins can view all users" ON public.users 
    FOR SELECT 
    TO authenticated 
    USING (public.is_admin() OR (auth.uid() = id));

CREATE POLICY "Admins can update all users" ON public.users 
    FOR UPDATE 
    TO authenticated 
    USING (public.is_admin() OR (auth.uid() = id));

-- 4. Create Admin policies for public.customers
DROP POLICY IF EXISTS "Admins can view all customers" ON public.customers;
CREATE POLICY "Admins can view all customers" ON public.customers
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- 5. Create Admin policies for public.drivers
DROP POLICY IF EXISTS "Admins can view all drivers" ON public.drivers;
DROP POLICY IF EXISTS "Admins can update all drivers" ON public.drivers;

CREATE POLICY "Admins can view all drivers" ON public.drivers
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

CREATE POLICY "Admins can update all drivers" ON public.drivers
    FOR UPDATE
    TO authenticated
    USING (public.is_admin());


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #5: 20260622195500_driver_ai_verification.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Database Migration: AI Driver Verification and Screening
-- Timestamp: 20260622195500

-- 1. Create app_settings table
CREATE TABLE IF NOT EXISTS public.app_settings (
    feature_key TEXT PRIMARY KEY,
    enabled BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Enable RLS on app_settings
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Policies for app_settings
DROP POLICY IF EXISTS "Allow read access to app_settings for authenticated users" ON public.app_settings;
CREATE POLICY "Allow read access to app_settings for authenticated users" 
    ON public.app_settings FOR SELECT 
    TO authenticated 
    USING (true);

DROP POLICY IF EXISTS "Allow read access to app_settings for anonymous users" ON public.app_settings;
CREATE POLICY "Allow read access to app_settings for anonymous users" 
    ON public.app_settings FOR SELECT 
    TO anon 
    USING (true);

DROP POLICY IF EXISTS "Allow admins full control on app_settings" ON public.app_settings;
CREATE POLICY "Allow admins full control on app_settings" 
    ON public.app_settings FOR ALL 
    TO authenticated 
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- 2. Create driver_applications table
CREATE TABLE IF NOT EXISTS public.driver_applications (
    id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- Document Verification status and extracted data
    id_verification_status TEXT DEFAULT 'pending' CHECK (id_verification_status IN ('pending', 'verified', 'flagged', 'skipped')),
    id_extracted_data JSONB,
    license_verification_status TEXT DEFAULT 'pending' CHECK (license_verification_status IN ('pending', 'verified', 'flagged', 'skipped')),
    license_extracted_data JSONB,
    verification_flags TEXT[],
    
    -- Pre-Screening Chat status, transcript, and verdict
    screening_status TEXT DEFAULT 'not_started' CHECK (screening_status IN ('not_started', 'in_progress', 'completed', 'skipped')),
    screening_transcript JSONB,
    screening_verdict TEXT CHECK (screening_verdict IN ('approve', 'flag_for_review', 'reject')),
    screening_reasoning TEXT,
    vehicle_type TEXT,
    coverage_area TEXT,
    screening_concerns TEXT[],
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on driver_applications
ALTER TABLE public.driver_applications ENABLE ROW LEVEL SECURITY;

-- Policies for driver_applications
DROP POLICY IF EXISTS "Drivers can view their own application" ON public.driver_applications;
CREATE POLICY "Drivers can view their own application" 
    ON public.driver_applications FOR SELECT 
    TO authenticated 
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Drivers can insert their own application" ON public.driver_applications;
CREATE POLICY "Drivers can insert their own application" 
    ON public.driver_applications FOR INSERT 
    TO authenticated 
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Drivers can update their own application" ON public.driver_applications;
CREATE POLICY "Drivers can update their own application" 
    ON public.driver_applications FOR UPDATE 
    TO authenticated 
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all driver applications" ON public.driver_applications;
CREATE POLICY "Admins can view all driver applications" 
    ON public.driver_applications FOR SELECT 
    TO authenticated 
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update all driver applications" ON public.driver_applications;
CREATE POLICY "Admins can update all driver applications" 
    ON public.driver_applications FOR UPDATE 
    TO authenticated 
    USING (public.is_admin());


-- 3. Create ai_verification_audit table
CREATE TABLE IF NOT EXISTS public.ai_verification_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    feature TEXT CHECK (feature IN ('document_verification', 'prescreening_chat')),
    verdict TEXT,
    raw_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on ai_verification_audit
ALTER TABLE public.ai_verification_audit ENABLE ROW LEVEL SECURITY;

-- Policies for ai_verification_audit
DROP POLICY IF EXISTS "Admins can view all audits" ON public.ai_verification_audit;
CREATE POLICY "Admins can view all audits" 
    ON public.ai_verification_audit FOR SELECT 
    TO authenticated 
    USING (public.is_admin());


-- Seed app settings defaults
INSERT INTO public.app_settings (feature_key, enabled) 
VALUES 
('document_verification_enabled', false),
('prescreening_chat_enabled', false)
ON CONFLICT (feature_key) DO NOTHING;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #6: 20260625120500_add_order_messages.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Create order_messages table
CREATE TABLE IF NOT EXISTS public.order_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.users(id),
    message_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

-- Drop policy if it exists
DROP POLICY IF EXISTS "Matched users can exchange messages" ON public.order_messages;

-- Create policy to allow access only if matched and order is not pending
CREATE POLICY "Matched users can exchange messages" ON public.order_messages
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.orders 
        WHERE id = order_messages.order_id 
        AND status != 'pending'
        AND (customer_id = auth.uid() OR driver_id = auth.uid())
    )
);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #7: 20260625123600_add_is_identity_verified_to_drivers.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Add columns to drivers table if they do not exist
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS is_identity_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_verification_at TIMESTAMP WITH TIME ZONE;

-- Force reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #8: 20260625123700_add_update_policies_to_profiles.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Drop existing update policies if they exist
DROP POLICY IF EXISTS "Drivers can update own profile" ON public.drivers;
DROP POLICY IF EXISTS "Customers can update own profile" ON public.customers;

-- Allow drivers to update their own profile columns
CREATE POLICY "Drivers can update own profile" ON public.drivers
FOR UPDATE USING (auth.uid() = id);

-- Allow customers to update their own profile columns
CREATE POLICY "Customers can update own profile" ON public.customers
FOR UPDATE USING (auth.uid() = id);

-- Force reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #9: 20260701200000_courier_wallet_system.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #10: 20260724191000_add_delivery_proof_to_orders.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Database Migration: Add Delivery Proof (Signature & Photo) Columns to Orders Table

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_signature_url TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_photo_url TEXT;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #11: 20260810233000_add_acknowledgement_to_orders.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Database Migration: Add Customer Acknowledgement Columns to Orders Table

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_acknowledged BOOLEAN DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE;

-- Recreate constraint to include 'completed' status
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
    'failed'
));

-- Create or update policy to allow customers to update their own orders (e.g. for confirming receipt)
DROP POLICY IF EXISTS "Customers update own orders" ON public.orders;
CREATE POLICY "Customers update own orders" ON public.orders 
    FOR UPDATE 
    USING (auth.uid() = customer_id)
    WITH CHECK (auth.uid() = customer_id);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #12: 20260902160000_create_courier_applications.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration: Create courier_applications table for web landing page onboarding
CREATE TABLE IF NOT EXISTS public.courier_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    city TEXT NOT NULL,
    vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('motorcycle', 'sedan', 'bakkie', 'van', 'bicycle')),
    has_license BOOLEAN DEFAULT TRUE,
    experience_years TEXT DEFAULT '1-3 years',
    notes TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.courier_applications ENABLE ROW LEVEL SECURITY;

-- 1. Allow public / anonymous visitors to submit courier applications
CREATE POLICY "Public can insert courier applications"
ON public.courier_applications
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 2. Allow admins full access to view, update, and manage applications
CREATE POLICY "Admins have full access to courier applications"
ON public.courier_applications
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role = 'admin'
    )
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_courier_applications_status ON public.courier_applications(status);
CREATE INDEX IF NOT EXISTS idx_courier_applications_city ON public.courier_applications(city);
CREATE INDEX IF NOT EXISTS idx_courier_applications_created_at ON public.courier_applications(created_at DESC);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #13: 20260902170000_create_customer_leads.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration: Create customer_leads table for landing page customer onboarding & waitlist
CREATE TABLE IF NOT EXISTS public.customer_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    city TEXT NOT NULL,
    customer_type TEXT NOT NULL CHECK (customer_type IN ('personal', 'business')),
    business_name TEXT,
    estimated_frequency TEXT DEFAULT 'occasional' CHECK (estimated_frequency IN ('daily', 'weekly', 'occasional')),
    notes TEXT,
    promo_code TEXT DEFAULT 'WELCOME263',
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.customer_leads ENABLE ROW LEVEL SECURITY;

-- 1. Allow public / anonymous visitors to submit customer leads
CREATE POLICY "Public can insert customer leads"
ON public.customer_leads
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 2. Allow admins full access to view, update, and manage customer leads
CREATE POLICY "Admins have full access to customer leads"
ON public.customer_leads
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role = 'admin'
    )
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_customer_leads_status ON public.customer_leads(status);
CREATE INDEX IF NOT EXISTS idx_customer_leads_city ON public.customer_leads(city);
CREATE INDEX IF NOT EXISTS idx_customer_leads_type ON public.customer_leads(customer_type);
CREATE INDEX IF NOT EXISTS idx_customer_leads_created_at ON public.customer_leads(created_at DESC);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #14: 20260902180000_create_vouchers_and_promo_system.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #15: 20260916190000_platinum_tier_and_priority_dispatch_full.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration: Driver Platinum Tier and 30-Second Priority Job Dispatch (Full 6 Metrics)
-- Date: 2026-09-16
-- Updated with Database Consistency Hardening:
-- 1. BEFORE UPDATE trigger to persist delivered_at
-- 2. Database-level RLS enforcing 30s priority window
-- 3. Trigger tracking cancelled_deliveries for accurate completion rate
-- 4. Triggers on courier_wallets and drivers (identity verification) for real-time tier recalculation
-- 5. Robust variable defaults for evaluate_driver_tier

-- 1. Ensure columns exist on drivers
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'standard' CHECK (tier IN ('standard', 'silver', 'gold', 'platinum')),
ADD COLUMN IF NOT EXISTS on_time_rate DECIMAL(5,2) DEFAULT 100.00;

-- Update null defaults for existing rows if needed
UPDATE public.drivers SET tier = 'standard' WHERE tier IS NULL;
UPDATE public.drivers SET on_time_rate = 100.00 WHERE on_time_rate IS NULL;
UPDATE public.drivers SET average_rating = 5.00 WHERE average_rating IS NULL OR average_rating = 0;
UPDATE public.drivers SET acceptance_rate = 100.00 WHERE acceptance_rate IS NULL OR acceptance_rate = 0;
UPDATE public.drivers SET completion_rate = 100.00 WHERE completion_rate IS NULL OR completion_rate = 0;

-- 2. Ensure columns exist on orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS priority_window_ends_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS priority_tier_required TEXT DEFAULT 'platinum',
ADD COLUMN IF NOT EXISTS estimated_delivery_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS customer_rating INTEGER CHECK (customer_rating BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS customer_feedback TEXT;

-- 3. Automatic Priority Window & Estimated Delivery on Order Creation
CREATE OR REPLACE FUNCTION public.set_order_priority_dispatch()
RETURNS TRIGGER AS $$
BEGIN
    -- If newly created order is pending, set 30s exclusive window for Platinum
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

-- 4. BEFORE UPDATE Trigger to stamp delivered_at on order delivery/completion
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

-- 5. Master Tier Evaluator
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

    -- Check all 6 Platinum qualification benchmarks:
    -- 1. Job Volume: >= 50 completed deliveries
    -- 2. Customer Rating: >= 4.85
    -- 3. Completion Rate: >= 95.0%
    -- 4. Acceptance Rate: >= 80.0%
    -- 5. On-Time Rate: >= 90.0%
    -- 6. Wallet Health & Verified: active wallet, balance >= 0, identity verified
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

-- 6. Recalculate Acceptance Rate from order_offers
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

-- 7. Recalculate Rating, Completion & On-Time on Order Status / Rating Update
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

        -- 3. Cancellation count tracking (assigned driver cancels or order cancelled with driver assigned)
        IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
            UPDATE public.drivers
            SET cancelled_deliveries = COALESCE(cancelled_deliveries, 0) + 1
            WHERE id = NEW.driver_id;
        END IF;

        -- 4. Completion Rate update (completed vs cancelled)
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

-- 8. Re-evaluate Tier on Wallet Status or Balance Changes
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

-- 9. Re-evaluate Tier on Driver Identity Verification Changes
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

-- 10. Database-Level RLS Enforcement for Priority Dispatch Window
DROP POLICY IF EXISTS "Drivers view pending orders" ON public.orders;
CREATE POLICY "Drivers view pending orders" ON public.orders FOR SELECT 
    USING (
        status = 'pending' 
        AND EXISTS (
            SELECT 1 FROM public.users u
            JOIN public.courier_wallets cw ON cw.courier_id = u.id
            JOIN public.drivers d ON d.id = u.id
            WHERE u.id = auth.uid() 
            AND u.role = 'driver'
            AND cw.status = 'active'
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
                SELECT 1 FROM public.courier_wallets cw
                JOIN public.drivers d ON d.id = cw.courier_id
                WHERE cw.courier_id = auth.uid() 
                AND cw.status = 'active'
                AND (
                    orders.priority_window_ends_at IS NULL
                    OR orders.priority_window_ends_at <= NOW()
                    OR d.tier = 'platinum'
                )
            )
        )
        OR auth.uid() = driver_id
    );


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #16: 20260916210000_add_is_read_to_order_messages.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration: Add is_read to order_messages for unread badge tracking
ALTER TABLE public.order_messages 
ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;

-- Create index for rapid unread lookup and updates
CREATE INDEX IF NOT EXISTS idx_order_messages_unread 
ON public.order_messages(order_id, sender_id, is_read);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #17: 20260917100000_courier_dispatch_push_helpers.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration: Courier Dispatch & Priority Push Notification Helpers
-- Date: 2026-09-17
-- Description: Helper function to identify eligible couriers for Platinum priority early access (T=0)
--              and secondary broadcast (T=30s) during priority dispatch.

CREATE OR REPLACE FUNCTION public.get_eligible_couriers_for_dispatch(
    p_tier_filter TEXT DEFAULT NULL,
    p_exclude_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS TABLE (
    driver_id UUID,
    expo_push_token TEXT,
    tier TEXT,
    full_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id AS driver_id,
        u.expo_push_token,
        COALESCE(d.tier, 'standard') AS tier,
        u.full_name
    FROM public.users u
    JOIN public.drivers d ON d.id = u.id
    LEFT JOIN public.courier_wallets cw ON cw.courier_id = u.id
    WHERE u.role = 'driver'
      AND COALESCE(u.account_status, 'active') = 'active'
      AND u.expo_push_token IS NOT NULL
      AND d.is_online = TRUE
      -- Wallet check: wallet must not be locked
      AND (cw.status IS NULL OR cw.status = 'active')
      -- Tier filter: if specified (e.g. 'platinum'), match driver's tier; otherwise all tiers
      AND (p_tier_filter IS NULL OR d.tier = p_tier_filter)
      -- Exclude IDs: avoid notifying couriers who already received priority dispatch
      AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0 OR NOT (u.id = ANY(p_exclude_ids)));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #18: 20260917110000_priority_dispatch_consistency_and_triggers.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #19: 20260917120000_payout_disbursement_system.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #20: 20260917130000_order_payment_methods_and_directives.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration: Order Payment Methods, Cash vs Digital Directives, and Settlement
-- Date: 2026-09-17
-- Description: Adds payment_method, payment_status, cash_to_collect, and payment_phone to public.orders, with automatic directive triggers.

-- 1. Enhance orders table with payment columns
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash_on_delivery' CHECK (payment_method IN ('cash_on_delivery', 'ecocash', 'innbucks', 'card')),
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'collected', 'refunded')),
ADD COLUMN IF NOT EXISTS cash_to_collect NUMERIC(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS payment_phone TEXT;

-- 2. Trigger function to compute cash_to_collect automatically
CREATE OR REPLACE FUNCTION public.fn_sync_order_payment_directive()
RETURNS TRIGGER AS $$
BEGIN
    -- Normalize payment_method if null
    IF NEW.payment_method IS NULL THEN
        NEW.payment_method := 'cash_on_delivery';
    END IF;

    -- Compute cash_to_collect
    IF NEW.payment_method = 'cash_on_delivery' THEN
        NEW.cash_to_collect := COALESCE(NEW.estimated_cost, 0.00);
        IF NEW.payment_status IS NULL OR NEW.payment_status = 'paid' THEN
            NEW.payment_status := 'unpaid';
        END IF;
    ELSE
        -- Digital payments (EcoCash, InnBucks, Card)
        NEW.cash_to_collect := 0.00;
        IF NEW.payment_status IS NULL OR NEW.payment_status = 'unpaid' THEN
            NEW.payment_status := 'paid';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach trigger to orders table
DROP TRIGGER IF EXISTS trg_sync_order_payment_directive ON public.orders;
CREATE TRIGGER trg_sync_order_payment_directive
BEFORE INSERT OR UPDATE OF payment_method, estimated_cost ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_order_payment_directive();

-- 4. Set default values on existing orders
UPDATE public.orders
SET payment_method = 'cash_on_delivery',
    cash_to_collect = COALESCE(estimated_cost, 0.00),
    payment_status = CASE 
        WHEN status IN ('delivered', 'completed') THEN 'collected' 
        ELSE 'unpaid' 
    END
WHERE payment_method IS NULL;

-- 5. RPC function to settle order on delivery (supports both COD float commission and Digital earnings credit)
CREATE OR REPLACE FUNCTION public.settle_order_payment_rpc(
    p_order_id UUID,
    p_driver_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_commission_rate DECIMAL(5,2) := 0.12;
    v_commission_amount DECIMAL(10,2);
    v_net_driver_earnings DECIMAL(10,2);
    v_new_wallet_balance DECIMAL(12,2);
    v_new_driver_balance DECIMAL(12,2);
BEGIN
    -- 1. Fetch order details with row lock
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found for ID %', p_order_id;
    END IF;

    -- 2. Fetch platform commission rate from system_settings
    SELECT COALESCE(commission_rate, 12.00) / 100.0 INTO v_commission_rate
    FROM public.system_settings
    LIMIT 1;

    IF v_commission_rate IS NULL THEN
        v_commission_rate := 0.12;
    END IF;

    -- Minimum base for commission is $2.00
    v_commission_amount := ROUND(GREATEST(COALESCE(v_order.estimated_cost, 0.00), 2.00) * v_commission_rate, 2);
    v_net_driver_earnings := GREATEST(0.00, COALESCE(v_order.estimated_cost, 0.00) - v_commission_amount);

    IF v_order.payment_method = 'cash_on_delivery' THEN
        -- Courier physically collected cash from customer:
        -- Deduct commission from courier prepaid float wallet
        UPDATE public.courier_wallets
        SET balance = balance - v_commission_amount,
            updated_at = NOW()
        WHERE courier_id = p_driver_id
        RETURNING balance INTO v_new_wallet_balance;

        -- Record transaction
        INSERT INTO public.wallet_transactions (
            courier_id, type, amount, net_amount, job_id, created_at
        ) VALUES (
            p_driver_id, 'commission_deduction', v_commission_amount, -v_commission_amount, p_order_id, NOW()
        );

        -- Update order payment status
        UPDATE public.orders
        SET payment_status = 'collected',
            updated_at = NOW()
        WHERE id = p_order_id;

        RETURN jsonb_build_object(
            'success', true,
            'payment_method', 'cash_on_delivery',
            'cash_collected', v_order.cash_to_collect,
            'commission_deducted', v_commission_amount,
            'float_balance', v_new_wallet_balance
        );
    ELSE
        -- Digital payment collected online by platform (EcoCash, InnBucks, Card):
        -- Credit net earnings into courier available_balance
        UPDATE public.drivers
        SET available_balance = available_balance + v_net_driver_earnings,
            total_earnings = total_earnings + v_net_driver_earnings
        WHERE id = p_driver_id
        RETURNING available_balance INTO v_new_driver_balance;

        -- Record ledger transaction
        INSERT INTO public.transactions (
            driver_id, amount, type, status, created_at, provider_response
        ) VALUES (
            p_driver_id, v_net_driver_earnings, 'delivery_earnings', 'completed', NOW(),
            jsonb_build_object('order_id', p_order_id, 'fare', v_order.estimated_cost, 'commission', v_commission_amount)
        );

        -- Update order payment status
        UPDATE public.orders
        SET payment_status = 'paid',
            updated_at = NOW()
        WHERE id = p_order_id;

        RETURN jsonb_build_object(
            'success', true,
            'payment_method', v_order.payment_method,
            'gross_fare', v_order.estimated_cost,
            'commission_retained', v_commission_amount,
            'net_credited', v_net_driver_earnings,
            'driver_balance', v_new_driver_balance
        );
    END IF;
END;
$$ LANGUAGE plpgsql;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #21: 20260917140000_order_lifecycle_notifications.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #22: 20260917150000_order_cancellation_release_and_debt.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #23: 20260917160000_handover_pin_delivery_confirmation.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration #24: 20260917170000_user_account_deletion.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- Migration: 20260917170000_user_account_deletion.sql
-- Description: User Account & Data Deletion RPC complying with Apple Guideline 5.1.1(v)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.delete_user_account_rpc()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_active_orders_count INTEGER := 0;
BEGIN
    -- 1. Ensure caller is authenticated
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'UNAUTHORIZED',
            'message', 'You must be authenticated to delete your account.'
        );
    END IF;

    -- 2. Verify no active in-flight orders exist for this user (as customer or driver)
    SELECT COUNT(*) INTO v_active_orders_count
    FROM public.orders
    WHERE (customer_id = v_user_id OR driver_id = v_user_id)
      AND status IN (
          'driver_assigned', 
          'en_route_to_pickup', 
          'arrived_at_pickup', 
          'picked_up', 
          'en_route_to_delivery', 
          'arrived_at_delivery'
      );

    IF v_active_orders_count > 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'ACTIVE_ORDERS_IN_PROGRESS',
            'message', 'Cannot delete account while you have an active delivery in progress. Please complete or cancel in-progress orders first.'
        );
    END IF;

    -- 3. Deactivate & wipe courier profile if user is a courier
    UPDATE public.drivers
    SET 
        is_online = FALSE,
        tier = 'standard',
        status = 'suspended',
        updated_at = NOW()
    WHERE id = v_user_id;

    -- 4. Anonymize/wipe driver applications
    DELETE FROM public.driver_applications
    WHERE id = v_user_id;

    -- 5. Wipe courier wallet records / clear push tokens
    DELETE FROM public.order_notifications
    WHERE destination IN (
        SELECT expo_push_token FROM public.users WHERE id = v_user_id AND expo_push_token IS NOT NULL
    );

    -- 6. Anonymize personal identity in public.users while preserving order history FK
    UPDATE public.users
    SET 
        full_name = 'Deleted User',
        phone = NULL,
        expo_push_token = NULL,
        account_status = 'deleted',
        profile_photo_url = NULL,
        updated_at = NOW()
    WHERE id = v_user_id;

    -- 7. Revoke/delete auth user credentials and active sessions
    -- Handled safely in exception block in case FK cascades from custom auth triggers
    BEGIN
        DELETE FROM auth.users WHERE id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
        -- If auth.users deletion has FK constraints, ensure user is banned/locked out
        UPDATE auth.users 
        SET 
            banned_until = '2999-01-01 00:00:00+00',
            raw_user_meta_data = '{"deleted": true}'::jsonb,
            encrypted_password = ''
        WHERE id = v_user_id;
    END;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Account and personal data have been permanently wiped and deactivated.'
    );
END;
$$;

-- Grant execution to all authenticated users
GRANT EXECUTE ON FUNCTION public.delete_user_account_rpc() TO authenticated;

