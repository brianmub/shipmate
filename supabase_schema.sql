-- ShipMate Database Schema Script

-- 1. Create a public users table that maps to Supabase auth.users
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT CHECK (role IN ('customer', 'driver', 'admin')),
    expo_push_token TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create policies for users
CREATE POLICY "Users can view their own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

-- Function to handle new user sign ups automatically
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id, 
    NEW.email, 
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'role', 'customer')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 2. Create the Orders Table
CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES public.users(id),
    driver_id UUID REFERENCES public.users(id),
    service_type TEXT CHECK (service_type IN ('delivery', 'errand')),
    status TEXT DEFAULT 'pending',
    
    -- Pickup Details
    pickup_address TEXT,
    pickup_latitude DOUBLE PRECISION,
    pickup_longitude DOUBLE PRECISION,
    
    -- Dropoff Details
    dropoff_address TEXT,
    dropoff_latitude DOUBLE PRECISION,
    dropoff_longitude DOUBLE PRECISION,
    
    -- Real-time Driver Tracking
    driver_latitude DOUBLE PRECISION,
    driver_longitude DOUBLE PRECISION,
    
    -- Errand Specifics
    errand_location TEXT,
    errand_instructions TEXT,
    
    -- Package Details
    package_description TEXT,
    
    -- Pricing
    estimated_cost DECIMAL(10,2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for Orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Customers can view their own orders
CREATE POLICY "Customers can view own orders" ON public.orders FOR SELECT 
    USING (auth.uid() = customer_id);

-- Customers can create orders
CREATE POLICY "Customers can create orders" ON public.orders FOR INSERT 
    WITH CHECK (auth.uid() = customer_id);

-- Drivers can view all available pending orders
CREATE POLICY "Drivers view pending orders" ON public.orders FOR SELECT 
    USING (status = 'pending' AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'driver'));

-- Drivers can view orders assigned to them
CREATE POLICY "Drivers view assigned orders" ON public.orders FOR SELECT 
    USING (auth.uid() = driver_id);

-- Drivers can update orders assigned to them (or accept them)
CREATE POLICY "Drivers can update orders" ON public.orders FOR UPDATE 
    USING (status = 'pending' OR auth.uid() = driver_id);

-- 3. Push Notifications Setup
-- Enable the HTTP extension (pg_net) to make outward calls to edge functions
-- CREATE EXTENSION IF NOT EXISTS pg_net; -- Commenting out as it requires Supabase project dashboard activation usually

-- Note: The webhook connecting the 'orders' table INSERT event to the 
-- 'notify-drivers' Edge Function should be created via the Supabase Dashboard 
-- Database -> Webhooks UI for maximum reliability, pointing to your project's Edge Function URL.
