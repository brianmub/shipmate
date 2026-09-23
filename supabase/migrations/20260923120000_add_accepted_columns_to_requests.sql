-- ==============================================================================
-- Migration: Add Accepted Columns to Requests & Timeout Reassign Procedure
-- Timestamp: 20260923120000
-- Author: ShipMate Engineering
-- Task: Step 5 of Multi-Step Feature Build (Atomic Accept + Reassign)
-- ==============================================================================

-- 1. Add accepted_mate_id and accepted_amount columns to requests
ALTER TABLE public.requests
ADD COLUMN IF NOT EXISTS accepted_mate_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS accepted_amount NUMERIC(10, 2);

-- 2. Index for accepted_mate_id lookup
CREATE INDEX IF NOT EXISTS idx_requests_accepted_mate_id ON public.requests(accepted_mate_id);

-- 3. Update Mate RLS policy so the winning Mate can view the request after acceptance
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
    OR (accepted_mate_id = auth.uid())
);

-- 4. Check-on-read timeout expiration helper function
CREATE OR REPLACE FUNCTION public.expire_stale_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    affected_count integer;
BEGIN
    UPDATE public.requests
    SET status = 'expired'
    WHERE status = 'searching'
    AND expires_at IS NOT NULL
    AND expires_at <= NOW();

    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$$;

-- 5. Grant execute on expire_stale_requests
GRANT EXECUTE ON FUNCTION public.expire_stale_requests() TO authenticated, service_role, anon;

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
