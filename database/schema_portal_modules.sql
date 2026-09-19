-- OH I SEE — Customer Portal module extensions
-- Run after schema_customer_portal.sql

CREATE TABLE IF NOT EXISTS public.portal_material_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  category TEXT NOT NULL,
  material_name TEXT NOT NULL,
  required_qty NUMERIC NOT NULL DEFAULT 0,
  ordered_qty NUMERIC NOT NULL DEFAULT 0,
  delivered_qty NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'Units',
  unit_budget NUMERIC DEFAULT 0,
  source TEXT DEFAULT 'boq',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_mat_req_project ON public.portal_material_requirements(project_id);

CREATE TABLE IF NOT EXISTS public.portal_site_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  reported_by TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_resolution DATE,
  actual_resolution DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_site_issues_project ON public.portal_site_issues(project_id);

CREATE TABLE IF NOT EXISTS public.portal_snag_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  location TEXT,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_to TEXT,
  resolution_date DATE,
  customer_verified BOOLEAN DEFAULT false,
  photos JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_snag_items_project ON public.portal_snag_items(project_id);

CREATE TABLE IF NOT EXISTS public.portal_budget_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  requested_by TEXT NOT NULL DEFAULT 'builder',
  reason TEXT,
  original_budget NUMERIC DEFAULT 0,
  current_committed NUMERIC DEFAULT 0,
  additional_amount NUMERIC DEFAULT 0,
  new_total NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  customer_decision TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_portal_budget_approvals_project ON public.portal_budget_approvals(project_id);

-- Extend builder selections for acceptance workflow
ALTER TABLE public.portal_builder_selections ADD COLUMN IF NOT EXISTS builder_accepted_at TIMESTAMPTZ;
ALTER TABLE public.portal_builder_selections ADD COLUMN IF NOT EXISTS builder_declined_at TIMESTAMPTZ;
ALTER TABLE public.portal_builder_selections ADD COLUMN IF NOT EXISTS final_quote NUMERIC;
ALTER TABLE public.portal_builder_selections ADD COLUMN IF NOT EXISTS expected_start DATE;
ALTER TABLE public.portal_builder_selections ADD COLUMN IF NOT EXISTS expected_completion DATE;
ALTER TABLE public.portal_builder_selections ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE public.portal_builder_selections ADD COLUMN IF NOT EXISTS exclusions TEXT;

-- Row Level Security (project ownership via projects table)
ALTER TABLE public.portal_material_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_site_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_snag_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_budget_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_mat_req_owner ON public.portal_material_requirements;
CREATE POLICY portal_mat_req_owner ON public.portal_material_requirements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.project_id = portal_material_requirements.project_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS portal_site_issues_owner ON public.portal_site_issues;
CREATE POLICY portal_site_issues_owner ON public.portal_site_issues
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.project_id = portal_site_issues.project_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS portal_snag_items_owner ON public.portal_snag_items;
CREATE POLICY portal_snag_items_owner ON public.portal_snag_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.project_id = portal_snag_items.project_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS portal_budget_approvals_owner ON public.portal_budget_approvals;
CREATE POLICY portal_budget_approvals_owner ON public.portal_budget_approvals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.project_id = portal_budget_approvals.project_id AND p.user_id = auth.uid())
  );
