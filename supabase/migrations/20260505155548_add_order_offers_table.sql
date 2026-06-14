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
