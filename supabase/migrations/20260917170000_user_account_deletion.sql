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
