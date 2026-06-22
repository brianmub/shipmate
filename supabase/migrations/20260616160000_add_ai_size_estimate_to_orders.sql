-- Add package_image_url if not exists to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS package_image_url TEXT;

-- Add ai_size_estimate if not exists to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ai_size_estimate TEXT;
