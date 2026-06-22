-- Database Migration: AI Driver Verification and Screening
-- Timestamp: 20260622195500

-- 1. Create app_settings table
CREATE TABLE IF NOT EXISTS public.app_settings (
    feature_key TEXT PRIMARY KEY,
    enabled BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Enable RLS on app_settings
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Policies for app_settings
DROP POLICY IF EXISTS "Allow read access to app_settings for authenticated users" ON public.app_settings;
CREATE POLICY "Allow read access to app_settings for authenticated users" 
    ON public.app_settings FOR SELECT 
    TO authenticated 
    USING (true);

DROP POLICY IF EXISTS "Allow read access to app_settings for anonymous users" ON public.app_settings;
CREATE POLICY "Allow read access to app_settings for anonymous users" 
    ON public.app_settings FOR SELECT 
    TO anon 
    USING (true);

DROP POLICY IF EXISTS "Allow admins full control on app_settings" ON public.app_settings;
CREATE POLICY "Allow admins full control on app_settings" 
    ON public.app_settings FOR ALL 
    TO authenticated 
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- 2. Create driver_applications table
CREATE TABLE IF NOT EXISTS public.driver_applications (
    id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- Document Verification status and extracted data
    id_verification_status TEXT DEFAULT 'pending' CHECK (id_verification_status IN ('pending', 'verified', 'flagged', 'skipped')),
    id_extracted_data JSONB,
    license_verification_status TEXT DEFAULT 'pending' CHECK (license_verification_status IN ('pending', 'verified', 'flagged', 'skipped')),
    license_extracted_data JSONB,
    verification_flags TEXT[],
    
    -- Pre-Screening Chat status, transcript, and verdict
    screening_status TEXT DEFAULT 'not_started' CHECK (screening_status IN ('not_started', 'in_progress', 'completed', 'skipped')),
    screening_transcript JSONB,
    screening_verdict TEXT CHECK (screening_verdict IN ('approve', 'flag_for_review', 'reject')),
    screening_reasoning TEXT,
    vehicle_type TEXT,
    coverage_area TEXT,
    screening_concerns TEXT[],
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on driver_applications
ALTER TABLE public.driver_applications ENABLE ROW LEVEL SECURITY;

-- Policies for driver_applications
DROP POLICY IF EXISTS "Drivers can view their own application" ON public.driver_applications;
CREATE POLICY "Drivers can view their own application" 
    ON public.driver_applications FOR SELECT 
    TO authenticated 
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Drivers can insert their own application" ON public.driver_applications;
CREATE POLICY "Drivers can insert their own application" 
    ON public.driver_applications FOR INSERT 
    TO authenticated 
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Drivers can update their own application" ON public.driver_applications;
CREATE POLICY "Drivers can update their own application" 
    ON public.driver_applications FOR UPDATE 
    TO authenticated 
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all driver applications" ON public.driver_applications;
CREATE POLICY "Admins can view all driver applications" 
    ON public.driver_applications FOR SELECT 
    TO authenticated 
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update all driver applications" ON public.driver_applications;
CREATE POLICY "Admins can update all driver applications" 
    ON public.driver_applications FOR UPDATE 
    TO authenticated 
    USING (public.is_admin());


-- 3. Create ai_verification_audit table
CREATE TABLE IF NOT EXISTS public.ai_verification_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    feature TEXT CHECK (feature IN ('document_verification', 'prescreening_chat')),
    verdict TEXT,
    raw_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on ai_verification_audit
ALTER TABLE public.ai_verification_audit ENABLE ROW LEVEL SECURITY;

-- Policies for ai_verification_audit
DROP POLICY IF EXISTS "Admins can view all audits" ON public.ai_verification_audit;
CREATE POLICY "Admins can view all audits" 
    ON public.ai_verification_audit FOR SELECT 
    TO authenticated 
    USING (public.is_admin());


-- Seed app settings defaults
INSERT INTO public.app_settings (feature_key, enabled) 
VALUES 
('document_verification_enabled', false),
('prescreening_chat_enabled', false)
ON CONFLICT (feature_key) DO NOTHING;
