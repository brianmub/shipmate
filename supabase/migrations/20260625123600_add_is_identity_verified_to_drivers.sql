-- Add columns to drivers table if they do not exist
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS is_identity_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_verification_at TIMESTAMP WITH TIME ZONE;

-- Force reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
