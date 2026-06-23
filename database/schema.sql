-- ============================================================
-- OH I SEE — Supabase Database Schema
-- Run this entire script in your Supabase SQL Editor
-- ============================================================

-- ============================================================
-- SECTION 1: EXTENSIONS & SETUP
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- SECTION 2: USERS PROFILE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'Customer' CHECK (role IN ('Super Admin', 'Admin', 'Partner', 'Customer')),
  -- Customer fields
  company TEXT,
  gstin TEXT,
  city TEXT,
  -- Partner-specific fields
  partner_status TEXT DEFAULT 'pending' CHECK (partner_status IN ('pending', 'approved', 'rejected', 'suspended')),
  partner_tier TEXT DEFAULT 'Silver' CHECK (partner_tier IN ('Silver', 'Gold', 'Platinum', 'Diamond')),
  partner_type TEXT,
  gst TEXT,
  pan TEXT,
  address TEXT,
  state TEXT,
  pincode TEXT,
  purchase_volume NUMERIC DEFAULT 0,
  commission_earned NUMERIC DEFAULT 0,
  commission_pending NUMERIC DEFAULT 0,
  commission_paid NUMERIC DEFAULT 0,
  reward_points_total INTEGER DEFAULT 0,
  reward_points_redeemed INTEGER DEFAULT 0,
  reward_points_available INTEGER DEFAULT 0,
  referral_code TEXT UNIQUE,
  referred_count INTEGER DEFAULT 0,
  referral_revenue NUMERIC DEFAULT 0,
  referral_commission NUMERIC DEFAULT 0,
  insurance_status TEXT DEFAULT 'Pending Review',
  insurance_policy_no TEXT DEFAULT 'N/A',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy: users can read their own profile
CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

-- Policy: users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- Policy: Admins can view all users
CREATE POLICY "Admins can view all users"
  ON public.users FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('Admin', 'Super Admin')
    )
  );

-- Policy: service role can insert users (for trigger)
CREATE POLICY "Service role can insert users"
  ON public.users FOR INSERT
  WITH CHECK (true);


-- ============================================================
-- SECTION 3: AUTO-CREATE USER PROFILE ON SIGNUP TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role, referral_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'Customer'),
    'OHI-' || UPPER(substring(gen_random_uuid()::text, 1, 8))
  );
  RETURN NEW;
END;
$$;

-- Drop trigger if exists, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- SECTION 4: PRODUCTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.products (
  id BIGSERIAL PRIMARY KEY,
  product_name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('Electrical', 'Plumbing', 'Hardware', 'Industrial', 'Pipes', 'Pipe Fittings', 'Valves', 'Reducers', 'Bushes', 'Brass Fittings', 'Bathroom Fittings', 'Bathroom Accessories', 'CPVC Products', 'UPVC Products', 'Industrial Tools')),
  sku TEXT UNIQUE,
  description TEXT DEFAULT '',
  price NUMERIC NOT NULL CHECK (price > 0),
  original_price NUMERIC,
  image_url TEXT DEFAULT '',
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  stock_status TEXT DEFAULT 'instock' CHECK (stock_status IN ('instock', 'limited', 'outofstock', 'inactive')),
  badge TEXT DEFAULT 'instock' CHECK (badge IN ('bestseller', 'instock', 'limited', 'new')),
  unit TEXT DEFAULT 'Pieces',
  gst_percent NUMERIC DEFAULT 18,
  moq INTEGER DEFAULT 1,
  specs JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Policy: everyone can read active products
CREATE POLICY "Anyone can read active products"
  ON public.products FOR SELECT
  USING (is_active = true);

-- Policy: Admins can do everything
CREATE POLICY "Admins can manage products"
  ON public.products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('Admin', 'Super Admin')
    )
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- SECTION 5: CART TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cart (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- Enable RLS
ALTER TABLE public.cart ENABLE ROW LEVEL SECURITY;

-- Policy: users can manage their own cart
CREATE POLICY "Users can manage own cart"
  ON public.cart FOR ALL
  USING (auth.uid() = user_id);

-- Policy: Admins can view all carts
CREATE POLICY "Admins can view all carts"
  ON public.cart FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('Admin', 'Super Admin')
    )
  );


-- ============================================================
-- SECTION 6: ORDERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT UNIQUE NOT NULL DEFAULT ('OHI-' || floor(random() * 90000 + 10000)::TEXT),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  cgst NUMERIC NOT NULL DEFAULT 0,
  sgst NUMERIC NOT NULL DEFAULT 0,
  shipping NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  discount_code TEXT DEFAULT '',
  partner_savings NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  order_status TEXT NOT NULL DEFAULT 'processing' CHECK (order_status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  shipping_name TEXT,
  shipping_phone TEXT,
  shipping_address TEXT,
  shipping_city TEXT,
  shipping_state TEXT,
  shipping_pin TEXT,
  shipping_company TEXT,
  payment_method TEXT DEFAULT 'upi',
  gstin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Policy: users can read their own orders
CREATE POLICY "Users can view own orders"
  ON public.orders FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: users can create their own orders
CREATE POLICY "Users can create own orders"
  ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Admins can manage all orders
CREATE POLICY "Admins can manage all orders"
  ON public.orders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('Admin', 'Super Admin')
    )
  );

DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- SECTION 7: BULK_QUOTES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bulk_quotes (
  id BIGSERIAL PRIMARY KEY,
  quote_id TEXT UNIQUE NOT NULL DEFAULT ('QTE-' || floor(random() * 90000 + 10000)::TEXT),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  company_name TEXT NOT NULL,
  gstin TEXT DEFAULT '',
  project_name TEXT NOT NULL,
  location TEXT NOT NULL,
  budget TEXT,
  timeline TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  specs_notes TEXT DEFAULT '',
  quote_status TEXT NOT NULL DEFAULT 'pending' CHECK (quote_status IN ('pending', 'reviewing', 'delivered', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.bulk_quotes ENABLE ROW LEVEL SECURITY;

-- Policy: users can view their own quotes
CREATE POLICY "Users can view own quotes"
  ON public.bulk_quotes FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: authenticated users can create quotes
CREATE POLICY "Authenticated users can create quotes"
  ON public.bulk_quotes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Admins can manage all quotes
CREATE POLICY "Admins can manage all quotes"
  ON public.bulk_quotes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('Admin', 'Super Admin')
    )
  );

DROP TRIGGER IF EXISTS bulk_quotes_updated_at ON public.bulk_quotes;
CREATE TRIGGER bulk_quotes_updated_at
  BEFORE UPDATE ON public.bulk_quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- SECTION 8: STORAGE — PRODUCT IMAGES BUCKET
-- ============================================================
-- Run this separately if needed. Supabase allows bucket creation via SQL:
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Anyone can view product images
CREATE POLICY "Public read product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- Storage RLS: Admins can upload product images
CREATE POLICY "Admins can upload product images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('Admin', 'Super Admin')
    )
  );

-- Storage RLS: Admins can delete product images
CREATE POLICY "Admins can delete product images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('Admin', 'Super Admin')
    )
  );


-- ============================================================
-- SECTION 9: ADMIN HELPER VIEWS
-- ============================================================

-- View: revenue summary
CREATE OR REPLACE VIEW public.admin_revenue_summary AS
SELECT
  COUNT(*) FILTER (WHERE order_status != 'cancelled') AS total_orders,
  SUM(total_amount) FILTER (WHERE order_status != 'cancelled') AS total_revenue,
  COUNT(*) FILTER (WHERE order_status = 'pending' OR order_status = 'processing') AS pending_orders
FROM public.orders;

-- View: low stock products
CREATE OR REPLACE VIEW public.low_stock_products AS
SELECT id, product_name, sku, stock_quantity, category
FROM public.products
WHERE stock_quantity <= 25 AND is_active = true
ORDER BY stock_quantity ASC;

-- ============================================================
-- DONE — Schema is ready. Now seed data via the app's first load.
-- ============================================================
