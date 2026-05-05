-- ShipMate Dynamic Settings & Configuration
-- This script adds a settings table and updates the earnings trigger to be dynamic.

-- 1. Create Settings Table
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Insert Default Values
INSERT INTO public.settings (key, value, description)
VALUES 
('platform_commission_rate', '13', 'Platform commission percentage (e.g. 13 for 13%)'),
('min_withdrawal_amount', '20', 'Minimum amount a driver can request for payout'),
('driver_acceptance_timeout', '30', 'Seconds a driver has to accept a job')
ON CONFLICT (key) DO NOTHING;

-- 3. Update Earnings Trigger to use dynamic settings
CREATE OR REPLACE FUNCTION public.calculate_order_earnings() 
RETURNS TRIGGER AS $$
DECLARE
    v_platform_fee_rate DECIMAL;
    v_total_amount DECIMAL;
    v_driver_earnings DECIMAL;
    v_platform_fee DECIMAL;
BEGIN
    -- Fetch the current commission rate from settings
    SELECT (value::DECIMAL / 100) INTO v_platform_fee_rate 
    FROM public.settings 
    WHERE key = 'platform_commission_rate';

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

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS for settings (Only admins can modify)
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage settings" 
ON public.settings FOR ALL 
USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "All users can view settings" 
ON public.settings FOR SELECT 
TO authenticated 
USING (true);
