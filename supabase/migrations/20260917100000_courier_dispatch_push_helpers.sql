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
