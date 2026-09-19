-- Multi-Tenant SaaS E-Commerce Platform Schema
-- Run this in your Supabase SQL Editor

-- 1. Create the stores table
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(255) UNIQUE NOT NULL,
    custom_domain VARCHAR(255) UNIQUE,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    theme_config JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) DEFAULT 'active',
    subscription_plan VARCHAR(50) DEFAULT 'starter',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read store info (needed for storefronts)
CREATE POLICY "Public stores are viewable by everyone." 
ON public.stores FOR SELECT USING (true);

-- Allow owners to update their stores
CREATE POLICY "Owners can update their own stores." 
ON public.stores FOR UPDATE USING (auth.uid() = owner_id);

-- Allow owners to insert (during signup)
CREATE POLICY "Users can create their own stores." 
ON public.stores FOR INSERT WITH CHECK (auth.uid() = owner_id);


-- 2. Modify existing tables to include store_id
-- We assume these tables exist from the old schema. If not, they will be created.

-- Products
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    brand VARCHAR(255),
    category VARCHAR(255),
    sku VARCHAR(100),
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    original_price DECIMAL(10,2),
    image_url TEXT,
    stock_quantity INT DEFAULT 0,
    stock_status VARCHAR(50) DEFAULT 'instock',
    badge VARCHAR(50) DEFAULT 'none',
    unit VARCHAR(50) DEFAULT 'Pieces',
    gst_percent DECIMAL(5,2) DEFAULT 18,
    moq INT DEFAULT 1,
    specs JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Products are viewable by everyone" ON public.products FOR SELECT USING (true);
CREATE POLICY "Store owners can insert products" ON public.products FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.stores WHERE stores.id = store_id AND stores.owner_id = auth.uid())
);
CREATE POLICY "Store owners can update their products" ON public.products FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.stores WHERE stores.id = store_id AND stores.owner_id = auth.uid())
);
CREATE POLICY "Store owners can delete their products" ON public.products FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.stores WHERE stores.id = store_id AND stores.owner_id = auth.uid())
);


-- Categories
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    parent_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(store_id, slug)
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories are viewable by everyone" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Store owners can manage categories" ON public.categories FOR ALL USING (
  EXISTS (SELECT 1 FROM public.stores WHERE stores.id = store_id AND stores.owner_id = auth.uid())
);


-- Orders
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id), -- Nullable for guest checkout
    customer_name VARCHAR(255),
    customer_email VARCHAR(255),
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    shipping_address JSONB,
    payment_details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Store owners can view their store's orders" ON public.orders FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.stores WHERE stores.id = store_id AND stores.owner_id = auth.uid())
);
CREATE POLICY "Store owners can update their store's orders" ON public.orders FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.stores WHERE stores.id = store_id AND stores.owner_id = auth.uid())
);
CREATE POLICY "Anyone can insert orders (checkout)" ON public.orders FOR INSERT WITH CHECK (true);


-- Order Items
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    quantity INT NOT NULL,
    price_at_time DECIMAL(10,2) NOT NULL
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their order items" ON public.order_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_id AND orders.user_id = auth.uid())
);
CREATE POLICY "Store owners can view their order items" ON public.order_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.orders JOIN public.stores ON orders.store_id = stores.id WHERE order_items.order_id = orders.id AND stores.owner_id = auth.uid())
);
CREATE POLICY "Anyone can insert order items" ON public.order_items FOR INSERT WITH CHECK (true);


-- Pages (Website Builder)
CREATE TABLE IF NOT EXISTS public.pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    content JSONB DEFAULT '[]'::jsonb, -- Store GrapeJS/Craft.js state or HTML sections
    is_published BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(store_id, slug)
);
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published pages are viewable by everyone" ON public.pages FOR SELECT USING (is_published = true);
CREATE POLICY "Store owners can manage pages" ON public.pages FOR ALL USING (
  EXISTS (SELECT 1 FROM public.stores WHERE stores.id = store_id AND stores.owner_id = auth.uid())
);


-- Function to auto-update updated_at column
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_stores_modtime ON public.stores;
CREATE TRIGGER update_stores_modtime BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

DROP TRIGGER IF EXISTS update_products_modtime ON public.products;
CREATE TRIGGER update_products_modtime BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
