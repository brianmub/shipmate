-- Migration: Create customer_leads table for landing page customer onboarding & waitlist
CREATE TABLE IF NOT EXISTS public.customer_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    city TEXT NOT NULL,
    customer_type TEXT NOT NULL CHECK (customer_type IN ('personal', 'business')),
    business_name TEXT,
    estimated_frequency TEXT DEFAULT 'occasional' CHECK (estimated_frequency IN ('daily', 'weekly', 'occasional')),
    notes TEXT,
    promo_code TEXT DEFAULT 'WELCOME263',
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.customer_leads ENABLE ROW LEVEL SECURITY;

-- 1. Allow public / anonymous visitors to submit customer leads
CREATE POLICY "Public can insert customer leads"
ON public.customer_leads
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 2. Allow admins full access to view, update, and manage customer leads
CREATE POLICY "Admins have full access to customer leads"
ON public.customer_leads
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role = 'admin'
    )
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_customer_leads_status ON public.customer_leads(status);
CREATE INDEX IF NOT EXISTS idx_customer_leads_city ON public.customer_leads(city);
CREATE INDEX IF NOT EXISTS idx_customer_leads_type ON public.customer_leads(customer_type);
CREATE INDEX IF NOT EXISTS idx_customer_leads_created_at ON public.customer_leads(created_at DESC);
