-- ShipMate Extended Database Schema (v2.0)
-- Aligning with spec-shipmate.md requirements

-- 1. Extend Users Table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'deleted'));
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

-- 2. Create Customers Table (Extension of Users)
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    total_orders INTEGER DEFAULT 0,
    lifetime_spend DECIMAL(12,2) DEFAULT 0,
    referral_code TEXT UNIQUE,
    referred_by UUID REFERENCES public.customers(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Drivers Table (Extension of Users)
CREATE TABLE IF NOT EXISTS public.drivers (
    id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    date_of_birth DATE,
    national_id_number TEXT,
    license_number TEXT,
    license_expiry_date DATE,
    verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected', 'suspended')),
    rejection_reason TEXT,
    is_online BOOLEAN DEFAULT FALSE,
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
    document_type TEXT CHECK (document_type IN ('national_id_front', 'national_id_back', 'license_front', 'license_back', 'vehicle_registration', 'insurance')),
    file_url TEXT NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE
);

-- 6. Create Addresses Table (Saved Addresses)
CREATE TABLE IF NOT EXISTS public.addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    label TEXT DEFAULT 'other', -- home, work, other
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

-- 7. Update Orders Table Status & Fields
-- First, let's update the status constraint if it exists
-- Note: Altering enums or constraints can be tricky. We'll use a more flexible CHECK.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN (
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
));

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number TEXT UNIQUE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS package_category TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS package_weight TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS package_dimensions TEXT;

-- 8. Updated handle_new_user function to populate child tables
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

    -- Populate role-specific tables
    IF v_role = 'customer' THEN
        INSERT INTO public.customers (id) VALUES (NEW.id);
    ELSIF v_role = 'driver' THEN
        INSERT INTO public.drivers (id) VALUES (NEW.id);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Enable RLS on all new tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

-- 10. RLS Policies
-- Customers can view/update their own profile
CREATE POLICY "Customers view own profile" ON public.customers FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Customers update own profile" ON public.customers FOR UPDATE USING (auth.uid() = id);

-- Drivers can view/update their own profile
CREATE POLICY "Drivers view own profile" ON public.drivers FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Drivers update own profile" ON public.drivers FOR UPDATE USING (auth.uid() = id);

-- Vehicle policies
CREATE POLICY "Drivers manage own vehicles" ON public.vehicles FOR ALL USING (auth.uid() = driver_id);
CREATE POLICY "Admins view all vehicles" ON public.vehicles FOR SELECT USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- Document policies
CREATE POLICY "Drivers manage own docs" ON public.driver_documents FOR ALL USING (auth.uid() = driver_id);
CREATE POLICY "Admins view all docs" ON public.driver_documents FOR SELECT USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- Address policies
CREATE POLICY "Users manage own addresses" ON public.addresses FOR ALL USING (auth.uid() = user_id);
