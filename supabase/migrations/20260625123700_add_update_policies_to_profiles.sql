-- Drop existing update policies if they exist
DROP POLICY IF EXISTS "Drivers can update own profile" ON public.drivers;
DROP POLICY IF EXISTS "Customers can update own profile" ON public.customers;

-- Allow drivers to update their own profile columns
CREATE POLICY "Drivers can update own profile" ON public.drivers
FOR UPDATE USING (auth.uid() = id);

-- Allow customers to update their own profile columns
CREATE POLICY "Customers can update own profile" ON public.customers
FOR UPDATE USING (auth.uid() = id);

-- Force reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
