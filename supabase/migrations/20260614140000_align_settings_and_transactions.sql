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
