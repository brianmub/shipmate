-- Database Migration: Add Admin Policies for Driver Documents and Vehicles
-- Timestamp: 20260919210000

-- 1. Policies for public.driver_documents
DROP POLICY IF EXISTS "Admins can view all driver documents" ON public.driver_documents;
CREATE POLICY "Admins can view all driver documents" 
    ON public.driver_documents FOR SELECT 
    TO authenticated 
    USING (public.is_admin() OR (auth.uid() = driver_id));

DROP POLICY IF EXISTS "Admins can update driver documents" ON public.driver_documents;
CREATE POLICY "Admins can update driver documents" 
    ON public.driver_documents FOR UPDATE 
    TO authenticated 
    USING (public.is_admin() OR (auth.uid() = driver_id))
    WITH CHECK (public.is_admin() OR (auth.uid() = driver_id));

DROP POLICY IF EXISTS "Admins can delete driver documents" ON public.driver_documents;
CREATE POLICY "Admins can delete driver documents" 
    ON public.driver_documents FOR DELETE 
    TO authenticated 
    USING (public.is_admin() OR (auth.uid() = driver_id));

-- 2. Policies for public.vehicles
DROP POLICY IF EXISTS "Admins can view all vehicles" ON public.vehicles;
CREATE POLICY "Admins can view all vehicles" 
    ON public.vehicles FOR SELECT 
    TO authenticated 
    USING (public.is_admin() OR (auth.uid() = driver_id));

DROP POLICY IF EXISTS "Admins can update all vehicles" ON public.vehicles;
CREATE POLICY "Admins can update all vehicles" 
    ON public.vehicles FOR UPDATE 
    TO authenticated 
    USING (public.is_admin() OR (auth.uid() = driver_id))
    WITH CHECK (public.is_admin() OR (auth.uid() = driver_id));

DROP POLICY IF EXISTS "Admins can delete all vehicles" ON public.vehicles;
CREATE POLICY "Admins can delete all vehicles" 
    ON public.vehicles FOR DELETE 
    TO authenticated 
    USING (public.is_admin() OR (auth.uid() = driver_id));
