-- ShipMate FULL Database Schema (Combined & Spec-Compliant)
-- This script sets up the entire database from scratch.

-- 0. Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create a public users table that maps to Supabase auth.users
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT CHECK (role IN ('customer', 'driver', 'admin')),
    phone TEXT,
    account_status TEXT DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'deleted')),
    expo_push_token TEXT,
    profile_photo_url TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for Users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

-- 2. Create Customers Table
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    total_orders INTEGER DEFAULT 0,
    lifetime_spend DECIMAL(12,2) DEFAULT 0,
    referral_code TEXT UNIQUE,
    referred_by UUID REFERENCES public.customers(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Drivers Table
CREATE TABLE IF NOT EXISTS public.drivers (
    id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    date_of_birth DATE,
    national_id_number TEXT,
    license_number TEXT,
    license_expiry_date DATE,
    verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected', 'suspended')),
    rejection_reason TEXT,
    is_online BOOLEAN DEFAULT FALSE,
    is_identity_verified BOOLEAN DEFAULT FALSE,
    last_verification_at TIMESTAMP WITH TIME ZONE,
    working_radius_km INTEGER DEFAULT 10,
    total_deliveries INTEGER DEFAULT 0,
    completed_deliveries INTEGER DEFAULT 0,
    cancelled_deliveries INTEGER DEFAULT 0,
    average_rating DECIMAL(3,2) DEFAULT 0,
    acceptance_rate DECIMAL(5,2) DEFAULT 0,
    completion_rate DECIMAL(5,2) DEFAULT 0,
    platform_balance DECIMAL(12,2) DEFAULT 0,
    available_balance DECIMAL(12,2) DEFAULT 0,
    pending_clearance DECIMAL(12,2) DEFAULT 0,
    total_earnings DECIMAL(12,2) DEFAULT 0,
    platform_fees_paid DECIMAL(12,2) DEFAULT 0,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create Vehicles Table
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE,
    vehicle_type TEXT CHECK (vehicle_type IN ('motorcycle', 'car', 'van', 'bicycle')),
    make TEXT,
    model TEXT,
    year INTEGER,
    color TEXT,
    license_plate TEXT,
    photo_front_url TEXT,
    photo_back_url TEXT,
    photo_left_url TEXT,
    photo_right_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    registration_number TEXT,
    insurance_expiry_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create Driver Documents Table
CREATE TABLE IF NOT EXISTS public.driver_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE,
    document_type TEXT CHECK (document_type IN ('national_id_front', 'national_id_front', 'license_front', 'license_back', 'vehicle_registration', 'insurance')),
    file_url TEXT NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE
);

-- 6. Create Addresses Table
CREATE TABLE IF NOT EXISTS public.addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    label TEXT DEFAULT 'other',
    custom_label TEXT,
    street_address TEXT,
    building_number TEXT,
    city TEXT,
    postal_code TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    delivery_instructions TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Create Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number TEXT UNIQUE,
    customer_id UUID REFERENCES public.users(id),
    driver_id UUID REFERENCES public.users(id),
    service_type TEXT CHECK (service_type IN ('delivery', 'errand')),
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 
        'driver_assigned', 
        'en_route_to_pickup', 
        'arrived_at_pickup', 
        'picked_up', 
        'en_route_to_delivery', 
        'arrived_at_delivery', 
        'delivered', 
        'cancelled', 
        'failed'
    )),
    
    -- Location Details
    pickup_address TEXT,
    pickup_latitude DOUBLE PRECISION,
    pickup_longitude DOUBLE PRECISION,
    dropoff_address TEXT,
    dropoff_latitude DOUBLE PRECISION,
    dropoff_longitude DOUBLE PRECISION,
    
    -- Errand Specifics
    errand_location TEXT,
    errand_instructions TEXT,
    
    -- Package Details
    package_description TEXT,
    package_category TEXT,
    package_weight TEXT,
    package_dimensions TEXT,
    
    -- Real-time Driver Tracking
    driver_latitude DOUBLE PRECISION,
    driver_longitude DOUBLE PRECISION,
    
    package_image_url TEXT,
    ai_size_estimate TEXT,
    estimated_cost DECIMAL(10,2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Create Order Offers Table (Bidding System)
CREATE TABLE IF NOT EXISTS public.order_offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE POLICY "Drivers can create and view their own offers" 
ON public.order_offers FOR ALL USING (auth.uid() = driver_id);

CREATE POLICY "Customers can view offers for their orders" 
ON public.order_offers FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.orders 
        WHERE id = order_offers.order_id 
        AND customer_id = auth.uid()
    )
);

CREATE POLICY "Customers can update offer status (accept/reject)" 
ON public.order_offers FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.orders 
        WHERE id = order_offers.order_id 
        AND customer_id = auth.uid()
    )
);

-- 8. Functions and Triggers
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'customer');
    
    INSERT INTO public.users (id, email, full_name, role)
    VALUES (
        NEW.id, 
        NEW.email, 
        NEW.raw_user_meta_data->>'full_name',
        v_role
    );

    IF v_role = 'customer' THEN
        INSERT INTO public.customers (id) VALUES (NEW.id);
    ELSIF v_role = 'driver' THEN
        INSERT INTO public.drivers (id) VALUES (NEW.id);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clean up existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 9. Enable RLS and Policies for all tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Policy definitions
CREATE POLICY "Users can view own customer profile" ON public.customers FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can view own driver profile" ON public.drivers FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Drivers manage own vehicles" ON public.vehicles FOR ALL USING (auth.uid() = driver_id);
CREATE POLICY "Drivers manage own docs" ON public.driver_documents FOR ALL USING (auth.uid() = driver_id);
CREATE POLICY "Users manage own addresses" ON public.addresses FOR ALL USING (auth.uid() = user_id);

-- Order Policies
CREATE POLICY "Customers view own orders" ON public.orders FOR SELECT USING (auth.uid() = customer_id);
CREATE POLICY "Customers create orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Drivers view pending orders" ON public.orders FOR SELECT 
    USING (status = 'pending' AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'driver'));
CREATE POLICY "Drivers view assigned orders" ON public.orders FOR SELECT USING (auth.uid() = driver_id);
CREATE POLICY "Drivers update assigned orders" ON public.orders FOR UPDATE USING (status = 'pending' OR auth.uid() = driver_id);
