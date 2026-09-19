-- ============================================================
-- OH I SEE — Database Schema v3
-- Intelligent Construction Marketplace Extensions
-- Run this AFTER schema_v2.sql
-- ============================================================

-- ------------------------------------------------------------
-- 0. EXTEND USERS TABLE — Client profile photo for lead review
-- ------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS profile_image TEXT;

-- ------------------------------------------------------------
-- 1. EXTEND PROJECTS TABLE — Construction Intelligence Fields
-- ------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS intent_type TEXT DEFAULT 'Residential'
    CHECK (intent_type IN ('NEW_HOME','RENOVATION','ELECTRICAL','PRODUCT_SEARCH','QUOTE_COMPARE','BLUEPRINT','VISUALIZER_3D','Residential')),
  ADD COLUMN IF NOT EXISTS plot_length NUMERIC,
  ADD COLUMN IF NOT EXISTS plot_width NUMERIC,
  ADD COLUMN IF NOT EXISTS road_facing TEXT DEFAULT 'East',
  ADD COLUMN IF NOT EXISTS vastu_preference BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS architectural_style TEXT,
  ADD COLUMN IF NOT EXISTS parking_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_terrace BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_balcony BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_pooja BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_office BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_garden BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_utility BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS renovation_type TEXT,
  ADD COLUMN IF NOT EXISTS electrical_points JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_project_summary JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quality_level TEXT DEFAULT 'Standard'
    CHECK (quality_level IN ('Economic','Standard','Premium','Custom'));

-- ------------------------------------------------------------
-- 2. INTENT SESSIONS — Progressive Questioning State
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL DEFAULT ('SES-' || floor(random() * 900000 + 100000)::TEXT),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  intent_type TEXT NOT NULL,
  answers JSONB DEFAULT '{}'::jsonb,
  current_step INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intent_sessions_user ON public.intent_sessions(user_id);

-- ------------------------------------------------------------
-- 3. BLUEPRINTS — AI-Generated Floor Plans
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id TEXT UNIQUE NOT NULL DEFAULT ('BLP-' || floor(random() * 90000 + 10000)::TEXT),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  version INTEGER DEFAULT 1,
  requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  layout_data JSONB DEFAULT '{}'::jsonb,
  validation_result JSONB DEFAULT '{}'::jsonb,
  svg_content TEXT,
  is_ai_generated BOOLEAN DEFAULT true,
  disclaimer TEXT DEFAULT 'AI-generated preliminary design. Final structural, architectural and statutory approval must be obtained from a qualified professional.',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blueprints_project ON public.blueprints(project_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_user ON public.blueprints(user_id);

-- ------------------------------------------------------------
-- 4. BUILDER QUOTATIONS — Uploaded & Compared
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.builder_quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_ref TEXT UNIQUE NOT NULL DEFAULT ('BQ-' || floor(random() * 90000 + 10000)::TEXT),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  builder_name TEXT NOT NULL,
  company_name TEXT,
  gstin TEXT,
  contact TEXT,
  quotation_number TEXT,
  quotation_date DATE,
  validity_days INTEGER DEFAULT 30,
  total_amount NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  timeline_months NUMERIC,
  payment_terms TEXT,
  warranty_period TEXT,
  exclusions TEXT,
  extracted_scope JSONB DEFAULT '{}'::jsonb,   -- normalized line items
  raw_text TEXT,                                -- original extracted text
  file_url TEXT,
  score_data JSONB DEFAULT '{}'::jsonb,         -- multi-factor scores
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_builder_quotes_project ON public.builder_quotations(project_id);

-- ------------------------------------------------------------
-- 5. QUOTE COMPARISON SESSIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_ref TEXT UNIQUE NOT NULL DEFAULT ('QC-' || floor(random() * 90000 + 10000)::TEXT),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  quote_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  normalized_scope JSONB DEFAULT '{}'::jsonb,
  comparison_result JSONB DEFAULT '{}'::jsonb,
  recommended_builder TEXT,
  recommendation_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 6. SERVICE REQUESTS — Professional Matching
-- (Extends the existing construction_engagements pattern)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_ref TEXT UNIQUE NOT NULL DEFAULT ('SR-' || floor(random() * 90000 + 10000)::TEXT),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,   -- ARCHITECT, ELECTRICIAN, PLUMBER, CONTRACTOR, etc.
  scope TEXT,
  location TEXT,
  budget NUMERIC,
  preferred_date DATE,
  status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN','MATCHED','QUOTED','CLOSED')),
  matched_professionals JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 7. PRODUCT RECOMMENDATIONS (project-level)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_product_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  subcategory TEXT,
  product_id INTEGER REFERENCES public.products(id) ON DELETE SET NULL,
  external_product JSONB DEFAULT NULL,  -- for external supplier products
  source TEXT DEFAULT 'OH_I_SEE' CHECK (source IN ('OH_I_SEE','EXTERNAL_SUPPLIER')),
  recommendation_reason TEXT,
  quantity_required NUMERIC DEFAULT 1,
  unit TEXT DEFAULT 'Nos',
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING','ADDED_TO_CART','ORDERED','SUBSTITUTED')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 8. ANALYTICS EVENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  session_id TEXT,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  properties JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON public.analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON public.analytics_events(user_id);

-- ============================================================
-- SCHEMA V3 COMPLETE
-- ============================================================
