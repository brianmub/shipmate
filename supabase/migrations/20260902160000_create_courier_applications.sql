-- Migration: Create courier_applications table for web landing page onboarding
CREATE TABLE IF NOT EXISTS public.courier_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    city TEXT NOT NULL,
    vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('motorcycle', 'sedan', 'bakkie', 'van', 'bicycle')),
    has_license BOOLEAN DEFAULT TRUE,
    experience_years TEXT DEFAULT '1-3 years',
    notes TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.courier_applications ENABLE ROW LEVEL SECURITY;

-- 1. Allow public / anonymous visitors to submit courier applications
CREATE POLICY "Public can insert courier applications"
ON public.courier_applications
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 2. Allow admins full access to view, update, and manage applications
CREATE POLICY "Admins have full access to courier applications"
ON public.courier_applications
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role = 'admin'
    )
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_courier_applications_status ON public.courier_applications(status);
CREATE INDEX IF NOT EXISTS idx_courier_applications_city ON public.courier_applications(city);
CREATE INDEX IF NOT EXISTS idx_courier_applications_created_at ON public.courier_applications(created_at DESC);
