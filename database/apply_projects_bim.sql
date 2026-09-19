-- OH I SEE — Run in Supabase SQL Editor
-- Creates projects + BIM tables aligned with the Express API
-- Safe to run: uses IF NOT EXISTS

-- Projects (API-compatible columns)
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  project_type TEXT DEFAULT 'Residential',
  location TEXT,
  state TEXT,
  district TEXT,
  city TEXT,
  plot_size TEXT,
  plot_length NUMERIC,
  plot_width NUMERIC,
  road_facing TEXT,
  built_up_area TEXT,
  floors INTEGER DEFAULT 1,
  bedrooms INTEGER,
  bathrooms INTEGER,
  parking_count INTEGER,
  has_pooja BOOLEAN,
  has_office BOOLEAN,
  has_terrace BOOLEAN,
  vastu_preference TEXT,
  architectural_style TEXT,
  intent_type TEXT,
  budget NUMERIC DEFAULT 0,
  quality_level TEXT DEFAULT 'Standard',
  description TEXT,
  status TEXT DEFAULT 'active',
  acceptance_status TEXT DEFAULT 'pending_vendor',
  current_stage TEXT DEFAULT 'Requirement',
  estimated_cost NUMERIC,
  construction_context JSONB DEFAULT '{}'::jsonb,
  bim_model_id UUID,
  bim_generation_status TEXT DEFAULT 'none',
  progress_design INTEGER DEFAULT 0,
  progress_boq INTEGER DEFAULT 0,
  progress_estimate INTEGER DEFAULT 0,
  progress_products INTEGER DEFAULT 0,
  progress_procurement INTEGER DEFAULT 0,
  progress_construction INTEGER DEFAULT 0,
  boq_data JSONB DEFAULT '{}'::jsonb,
  ai_analysis JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_project_id ON public.projects(project_id);

-- BIM tables (from schema_v4_bim.sql)
CREATE TABLE IF NOT EXISTS public.bim_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  current_version_id UUID,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id)
);

CREATE TABLE IF NOT EXISTS public.bim_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bim_model_id UUID NOT NULL REFERENCES public.bim_models(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  label TEXT,
  structured_input JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_result JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bim_model_id, version_number)
);

ALTER TABLE public.bim_models
  DROP CONSTRAINT IF EXISTS bim_models_current_version_id_fkey;
ALTER TABLE public.bim_models
  ADD CONSTRAINT bim_models_current_version_id_fkey
  FOREIGN KEY (current_version_id) REFERENCES public.bim_versions(id) ON DELETE SET NULL;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_bim_model_id_fkey;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_bim_model_id_fkey
  FOREIGN KEY (bim_model_id) REFERENCES public.bim_models(id) ON DELETE SET NULL;
