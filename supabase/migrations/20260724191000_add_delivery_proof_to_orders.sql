-- Database Migration: Add Delivery Proof (Signature & Photo) Columns to Orders Table

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_signature_url TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_photo_url TEXT;
