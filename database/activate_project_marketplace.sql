-- OH I SEE project + marketplace activation (registered users must already exist).
-- Does not create demo accounts, profiles, products or quotes.
-- Run as the database owner in the configured Supabase SQL Editor.
BEGIN;
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
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS latitude NUMERIC;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS longitude NUMERIC;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS survey_number TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS facing_direction TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS target_completion_date DATE;

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS workflow_step INTEGER DEFAULT 1;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS workflow_progress INTEGER DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS selected_builder TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS contract_value NUMERIC;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS amount_paid NUMERIC DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS latitude NUMERIC;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS longitude NUMERIC;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS survey_number TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS facing_direction TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS target_completion_date DATE;


-- OH I SEE — Draft persistence columns for Customer Portal
-- Run in Supabase SQL Editor after schema_customer_portal.sql

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS completion_percentage INTEGER DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS last_saved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_projects_user_status ON public.projects(user_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_last_saved ON public.projects(last_saved_at DESC);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.projects TO service_role;
-- Additive, registered-account marketplace. Apply after projects_migration.sql.

CREATE TABLE IF NOT EXISTS public.marketplace_profiles (
 user_id uuid PRIMARY KEY REFERENCES public.users(id),
 kind text NOT NULL CHECK (kind IN ('contractor','supplier')),
 company text NOT NULL, city text NOT NULL,
 rate_min numeric, rate_max numeric, scope text NOT NULL DEFAULT '',
 available boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (kind <> 'contractor' OR (rate_min IS NOT NULL AND rate_max IS NOT NULL AND rate_min > 0 AND rate_max >= rate_min))
);
CREATE TABLE IF NOT EXISTS public.marketplace_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), supplier_id uuid NOT NULL REFERENCES public.users(id),
 name text NOT NULL, brand text NOT NULL DEFAULT '', category text NOT NULL,
 unit text NOT NULL, price numeric NOT NULL CHECK(price > 0),
 stock numeric NOT NULL DEFAULT 0 CHECK(stock >= 0), active boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_products_supplier ON public.marketplace_products(supplier_id);
CREATE TABLE IF NOT EXISTS public.marketplace_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id text NOT NULL UNIQUE REFERENCES public.projects(project_id),
 customer_id uuid NOT NULL REFERENCES public.users(id), contractor_id uuid NOT NULL REFERENCES public.users(id),
 version integer NOT NULL DEFAULT 1, data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(customer_id <> contractor_id)
);
CREATE INDEX IF NOT EXISTS marketplace_jobs_contractor ON public.marketplace_jobs(contractor_id);
CREATE INDEX IF NOT EXISTS marketplace_jobs_customer ON public.marketplace_jobs(customer_id);
ALTER TABLE public.marketplace_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_profiles, public.marketplace_products, public.marketplace_jobs FROM anon, authenticated;
GRANT ALL ON public.marketplace_profiles, public.marketplace_products, public.marketplace_jobs TO service_role;
-- Keep the existing customer project screens in sync in the same transaction.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS selected_builder text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS contract_value numeric;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS acceptance_status text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS workflow_step integer DEFAULT 1;
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
CREATE OR REPLACE FUNCTION public.marketplace_sync_project() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 UPDATE public.projects SET
   selected_builder=NEW.data->>'builder_name',
   acceptance_status=CASE WHEN NEW.data->>'stage'='requested' THEN 'pending_vendor' ELSE 'accepted' END,
   status=CASE NEW.data->>'stage' WHEN 'in_execution' THEN 'in_execution' WHEN 'approved' THEN 'customer_approved' ELSE 'builder_selected' END,
   current_stage=CASE NEW.data->>'stage' WHEN 'in_execution' THEN 'Project Execution' WHEN 'approved' THEN 'Budget Approved' WHEN 'proposal_sent' THEN 'Budget Approval' ELSE 'Builder Selection' END,
   workflow_step=CASE NEW.data->>'stage' WHEN 'in_execution' THEN 7 WHEN 'approved' THEN 6 WHEN 'proposal_sent' THEN 6 ELSE 5 END,
   contract_value=CASE WHEN NEW.data->>'stage' IN ('approved','in_execution') THEN (NEW.data->'proposal'->>'total')::numeric ELSE NULL END,
   updated_at=now()
 WHERE project_id=NEW.project_id AND user_id=NEW.customer_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project owner mismatch'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.marketplace_sync_project() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS marketplace_sync_project ON public.marketplace_jobs;
CREATE TRIGGER marketplace_sync_project AFTER INSERT OR UPDATE OF data ON public.marketplace_jobs
 FOR EACH ROW EXECUTE FUNCTION public.marketplace_sync_project();



-- Persistence required by document upload and design version comparison.
CREATE TABLE IF NOT EXISTS public.project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  is_required BOOLEAN DEFAULT false,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_documents FROM anon, authenticated;
GRANT ALL ON public.project_documents TO service_role;
CREATE TABLE IF NOT EXISTS public.portal_design_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  packages JSONB DEFAULT '[]'::jsonb,
  preferences JSONB DEFAULT '{}'::jsonb,
  boq_snapshot JSONB DEFAULT '{}'::jsonb,
  cost_estimate NUMERIC,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  customer_comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, version_number)
);
ALTER TABLE public.portal_design_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_design_versions FROM anon, authenticated;
GRANT ALL ON public.portal_design_versions TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
