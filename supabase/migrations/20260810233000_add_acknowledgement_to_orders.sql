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
