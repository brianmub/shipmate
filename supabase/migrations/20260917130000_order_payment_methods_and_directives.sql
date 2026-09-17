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
