-- Database Migration: Add Admin RLS Policies

-- 1. Create a security-definer helper function to check admin role
-- This bypasses RLS and prevents infinite recursion loops in policies
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop existing policies on public.users if they exist
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins can update all users" ON public.users;

-- 3. Create Admin policies for public.users
CREATE POLICY "Admins can view all users" ON public.users 
    FOR SELECT 
    TO authenticated 
    USING (public.is_admin() OR (auth.uid() = id));

CREATE POLICY "Admins can update all users" ON public.users 
    FOR UPDATE 
    TO authenticated 
    USING (public.is_admin() OR (auth.uid() = id));

-- 4. Create Admin policies for public.customers
DROP POLICY IF EXISTS "Admins can view all customers" ON public.customers;
CREATE POLICY "Admins can view all customers" ON public.customers
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- 5. Create Admin policies for public.drivers
DROP POLICY IF EXISTS "Admins can view all drivers" ON public.drivers;
DROP POLICY IF EXISTS "Admins can update all drivers" ON public.drivers;

CREATE POLICY "Admins can view all drivers" ON public.drivers
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

CREATE POLICY "Admins can update all drivers" ON public.drivers
    FOR UPDATE
    TO authenticated
    USING (public.is_admin());
