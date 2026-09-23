-- ==============================================================================
-- Migration: Create Requests and Bids Tables (inDrive-Style Bidding Model)
-- Timestamp: 20260923102500
-- Author: ShipMate Engineering
-- Task: Step 1 of Multi-Step Feature Build
-- ==============================================================================

-- 0. Ensure PostGIS is enabled in extensions schema
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- Set search_path so extensions types are accessible
SET search_path = public, extensions;

-- 1. Create public.profiles compatibility view if not exists
-- (ShipMate core stores user profiles in public.users; this view aliases it for spec compatibility)
CREATE OR REPLACE VIEW public.profiles AS
SELECT * FROM public.users;

-- 2. Create requests table
CREATE TABLE IF NOT EXISTS public.requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    pickup_location extensions.geography(Point, 4326),
    dropoff_location extensions.geography(Point, 4326),
    status TEXT NOT NULL DEFAULT 'searching' CHECK (status IN ('searching', 'accepted', 'expired', 'cancelled')),
    base_price NUMERIC(10, 2),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create bids table
CREATE TABLE IF NOT EXISTS public.bids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    mate_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create Indexes
-- Requests indexes
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_customer_id ON public.requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_requests_status_created_at ON public.requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_customer_status ON public.requests(customer_id, status);

-- PostGIS spatial GiST indexes for efficient geolocation queries
CREATE INDEX IF NOT EXISTS idx_requests_pickup_location ON public.requests USING GIST (pickup_location);
CREATE INDEX IF NOT EXISTS idx_requests_dropoff_location ON public.requests USING GIST (dropoff_location);

-- Bids indexes
CREATE INDEX IF NOT EXISTS idx_bids_request_id ON public.bids(request_id);
CREATE INDEX IF NOT EXISTS idx_bids_mate_id ON public.bids(mate_id);
CREATE INDEX IF NOT EXISTS idx_bids_request_amount ON public.bids(request_id, amount ASC);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for requests

-- Customer policies: Customers can read, create, update, and delete their own requests
DROP POLICY IF EXISTS "Customers can view their own requests" ON public.requests;
CREATE POLICY "Customers can view their own requests"
ON public.requests FOR SELECT
TO authenticated
USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can create their own requests" ON public.requests;
CREATE POLICY "Customers can create their own requests"
ON public.requests FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can update their own requests" ON public.requests;
CREATE POLICY "Customers can update their own requests"
ON public.requests FOR UPDATE
TO authenticated
USING (auth.uid() = customer_id)
WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can delete their own requests" ON public.requests;
CREATE POLICY "Customers can delete their own requests"
ON public.requests FOR DELETE
TO authenticated
USING (auth.uid() = customer_id);

-- Mate policies:
-- TODO: [Step 2+ / Matching Engine] Replace placeholder matching logic below with actual geo-proximity / dispatched mate matching logic.
-- Currently allows authenticated active drivers/mates to read open requests in 'searching' status,
-- or requests where they have already submitted a bid.
DROP POLICY IF EXISTS "Mates can view matched requests" ON public.requests;
CREATE POLICY "Mates can view matched requests"
ON public.requests FOR SELECT
TO authenticated
USING (
    (
        status = 'searching'
        AND (
            EXISTS (
                SELECT 1 FROM public.drivers d
                WHERE d.id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM public.users u
                WHERE u.id = auth.uid() AND u.role = 'driver'
            )
        )
    )
    OR EXISTS (
        SELECT 1 FROM public.bids b
        WHERE b.request_id = requests.id
        AND b.mate_id = auth.uid()
    )
);

-- Admin policy for requests (ShipMate uses public.is_admin() helper)
DROP POLICY IF EXISTS "Admins have full access to requests" ON public.requests;
CREATE POLICY "Admins have full access to requests"
ON public.requests FOR ALL
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- 7. RLS Policies for bids

-- Mates can insert their own bids on searching requests
DROP POLICY IF EXISTS "Mates can insert their own bids" ON public.bids;
CREATE POLICY "Mates can insert their own bids"
ON public.bids FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = mate_id
    AND EXISTS (
        SELECT 1 FROM public.requests r
        WHERE r.id = bids.request_id
        AND r.status = 'searching'
    )
);

-- Mates can view their own bids
DROP POLICY IF EXISTS "Mates can view their own bids" ON public.bids;
CREATE POLICY "Mates can view their own bids"
ON public.bids FOR SELECT
TO authenticated
USING (auth.uid() = mate_id);

-- Customers can view bids on their requests
DROP POLICY IF EXISTS "Customers can view bids on their requests" ON public.bids;
CREATE POLICY "Customers can view bids on their requests"
ON public.bids FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.requests r
        WHERE r.id = bids.request_id
        AND r.customer_id = auth.uid()
    )
);

-- Mates can update or cancel their own bids
DROP POLICY IF EXISTS "Mates can update their own bids" ON public.bids;
CREATE POLICY "Mates can update their own bids"
ON public.bids FOR UPDATE
TO authenticated
USING (auth.uid() = mate_id)
WITH CHECK (auth.uid() = mate_id);

DROP POLICY IF EXISTS "Mates can delete their own bids" ON public.bids;
CREATE POLICY "Mates can delete their own bids"
ON public.bids FOR DELETE
TO authenticated
USING (auth.uid() = mate_id);

-- Admin policy for bids
DROP POLICY IF EXISTS "Admins have full access to bids" ON public.bids;
CREATE POLICY "Admins have full access to bids"
ON public.bids FOR ALL
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- 8. Add tables to Supabase Realtime publication for presence and live bidding
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.requests;
        ALTER PUBLICATION supabase_realtime ADD TABLE public.bids;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

-- 9. Force schema reload for PostgREST
NOTIFY pgrst, 'reload schema';
