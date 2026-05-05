-- ShipMate Earnings Calculation Trigger
-- Automates balance updates when an order is delivered

CREATE OR REPLACE FUNCTION public.calculate_order_earnings() 
RETURNS TRIGGER AS $$
DECLARE
    v_platform_fee_rate DECIMAL := 0.13; -- 13% as per spec
    v_total_amount DECIMAL;
    v_driver_earnings DECIMAL;
    v_platform_fee DECIMAL;
BEGIN
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

-- Create the trigger
DROP TRIGGER IF EXISTS on_order_delivered ON public.orders;
CREATE TRIGGER on_order_delivered
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE PROCEDURE public.calculate_order_earnings();
