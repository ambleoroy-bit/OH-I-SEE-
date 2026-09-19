-- OH I SEE — Customer Portal extensions
-- Run in Supabase SQL Editor after apply_projects_bim.sql and schema_project_setup.sql

-- Workflow tracking on projects
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

-- Construction milestones (Step 7)
CREATE TABLE IF NOT EXISTS public.portal_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress_pct INTEGER DEFAULT 0,
  start_date DATE,
  expected_date DATE,
  completed_date DATE,
  notes TEXT,
  photos JSONB DEFAULT '[]'::jsonb,
  issues JSONB DEFAULT '[]'::jsonb,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_milestones_project ON public.portal_milestones(project_id);

-- Site updates
CREATE TABLE IF NOT EXISTS public.portal_site_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  stage TEXT,
  description TEXT,
  photos JSONB DEFAULT '[]'::jsonb,
  videos JSONB DEFAULT '[]'::jsonb,
  author_name TEXT,
  completion_pct INTEGER,
  issues TEXT,
  customer_comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_site_updates_project ON public.portal_site_updates(project_id);

-- Project messages
CREATE TABLE IF NOT EXISTS public.portal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT DEFAULT 'customer',
  receiver_role TEXT,
  body TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_messages_project ON public.portal_messages(project_id);

-- Customer payments (project milestones)
CREATE TABLE IF NOT EXISTS public.portal_customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_ref TEXT UNIQUE NOT NULL DEFAULT ('CPAY-' || floor(random() * 900000 + 100000)::TEXT),
  project_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  milestone TEXT,
  description TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT,
  transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  receipt_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_customer_payments_project ON public.portal_customer_payments(project_id);

-- Material orders (customer view)
CREATE TABLE IF NOT EXISTS public.portal_material_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_ref TEXT UNIQUE NOT NULL DEFAULT ('MO-' || floor(random() * 900000 + 100000)::TEXT),
  project_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  supplier TEXT,
  category TEXT,
  product_name TEXT,
  quantity NUMERIC DEFAULT 0,
  unit TEXT DEFAULT 'Units',
  unit_price NUMERIC DEFAULT 0,
  total_amount NUMERIC DEFAULT 0,
  delivery_date DATE,
  delivery_location TEXT,
  order_status TEXT NOT NULL DEFAULT 'requested',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_material_orders_project ON public.portal_material_orders(project_id);

-- Project approvals (Step 6)
CREATE TABLE IF NOT EXISTS public.portal_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  approval_type TEXT NOT NULL DEFAULT 'construction_start',
  construction_cost NUMERIC DEFAULT 0,
  design_cost NUMERIC DEFAULT 0,
  approval_fees NUMERIC DEFAULT 0,
  other_charges NUMERIC DEFAULT 0,
  total_cost NUMERIC DEFAULT 0,
  customer_budget NUMERIC DEFAULT 0,
  budget_exceeded BOOLEAN DEFAULT false,
  customer_decision TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  signed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_approvals_project ON public.portal_approvals(project_id);

-- Design versions (Step 4)
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
CREATE INDEX IF NOT EXISTS idx_portal_design_versions_project ON public.portal_design_versions(project_id);

-- Builder selection
CREATE TABLE IF NOT EXISTS public.portal_builder_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  builder_name TEXT NOT NULL,
  quote_ref TEXT,
  quotation_id UUID,
  status TEXT NOT NULL DEFAULT 'shortlisted',
  selected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_builder_selections_project ON public.portal_builder_selections(project_id);

-- Handover documents (Step 8)
CREATE TABLE IF NOT EXISTS public.portal_handover_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  file_name TEXT,
  storage_path TEXT,
  file_size BIGINT,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_handover_docs_project ON public.portal_handover_documents(project_id);

-- Handover checklist
CREATE TABLE IF NOT EXISTS public.portal_handover_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL UNIQUE,
  items JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Maintenance requests
CREATE TABLE IF NOT EXISTS public.portal_maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_ref TEXT UNIQUE NOT NULL DEFAULT ('MNT-' || floor(random() * 900000 + 100000)::TEXT),
  project_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_maintenance_project ON public.portal_maintenance_requests(project_id);

-- Support tickets
CREATE TABLE IF NOT EXISTS public.portal_support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_ref TEXT UNIQUE NOT NULL DEFAULT ('TKT-' || floor(random() * 900000 + 100000)::TEXT),
  project_id TEXT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_support_tickets_user ON public.portal_support_tickets(user_id);
