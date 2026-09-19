-- Supabase Schema Update for Admin Add Product Feature
-- Run this in your Supabase SQL Editor

-- 1. Alter Products Table to include new required fields
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS model_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS short_description VARCHAR(255),
ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS warehouse_location VARCHAR(100),
ADD COLUMN IF NOT EXISTS reorder_level INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS gallery_images JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS specifications JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS visible BOOLEAN DEFAULT true;

-- Note: We already have image_url which can act as 'thumbnail'
-- We also already have stock_quantity, stock_status, unit, gst_percent, moq.

-- 2. Create Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    admin_id UUID REFERENCES auth.users(id),
    admin_name VARCHAR(255),
    action VARCHAR(255) NOT NULL,
    entity_name VARCHAR(255),
    ip_address VARCHAR(45),
    browser VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on Audit Logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view audit logs for their store
CREATE POLICY "Store owners can view their audit logs" 
ON public.audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.stores WHERE stores.id = store_id AND stores.owner_id = auth.uid())
);

-- System can insert audit logs
CREATE POLICY "System can insert audit logs" 
ON public.audit_logs FOR INSERT WITH CHECK (true);
