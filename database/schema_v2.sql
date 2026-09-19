-- ============================================================
-- OH I SEE — Master Production Database Schema (v2)
-- PostgreSQL / Supabase Migration Script
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- 1. ROLES & PERMISSIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.roles (name, description) VALUES
  ('SUPER_ADMIN', 'Full platform system access'),
  ('ADMIN', 'Administrative access'),
  ('CUSTOMER', 'Customer / Property Owner'),
  ('PROJECT_MANAGER', 'Manages construction projects'),
  ('PROCUREMENT_MANAGER', 'Manages PRs, RFQs, and POs'),
  ('PURCHASE_MANAGER', 'Approves purchase requisitions'),
  ('SUPPLIER', 'Material vendor / supplier'),
  ('VENDOR', 'Product seller / distributor'),
  ('CONTRACTOR', 'Main general contractor'),
  ('SUB_CONTRACTOR', 'Specialized trade contractor'),
  ('ARCHITECT', 'Architectural design lead'),
  ('CIVIL_ENGINEER', 'Civil engineering lead'),
  ('STRUCTURAL_ENGINEER', 'Structural calculations lead'),
  ('MEP_ENGINEER', 'Mechanical, Electrical, Plumbing lead'),
  ('ELECTRICIAN', 'Trade specialist - electrical'),
  ('PLUMBER', 'Trade specialist - plumbing'),
  ('LOGISTICS_MANAGER', 'Tracks shipments and gate entry'),
  ('WAREHOUSE_MANAGER', 'Manages GRN and inventory'),
  ('FINANCE_MANAGER', 'Handles invoices and 3-way matching'),
  ('QUALITY_MANAGER', 'Manages inspections and disputes'),
  ('SUPPORT_AGENT', 'Customer support')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role_id)
);

CREATE TABLE IF NOT EXISTS public.user_module_preferences (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  favorite_modules JSONB DEFAULT '[]'::jsonb,
  recently_used JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ------------------------------------------------------------
-- 2. PROJECTS & REQUIREMENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT UNIQUE NOT NULL DEFAULT ('PRJ-' || floor(random() * 90000 + 10000)::TEXT),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  project_type TEXT NOT NULL DEFAULT 'Residential',
  city TEXT,
  state TEXT,
  zip_code TEXT,
  address TEXT,
  plot_length NUMERIC,
  plot_width NUMERIC,
  plot_area NUMERIC,
  floors INTEGER DEFAULT 1,
  builtup_area NUMERIC,
  requirements JSONB DEFAULT '{}'::jsonb,
  budget NUMERIC DEFAULT 0,
  spent_amount NUMERIC DEFAULT 0,
  committed_amount NUMERIC DEFAULT 0,
  quality_tier TEXT DEFAULT 'Standard',
  start_date DATE,
  expected_completion DATE,
  ai_brief TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  current_stage TEXT DEFAULT 'Requirement' CHECK (current_stage IN ('Requirement', 'Design', 'Blueprint', 'BOQ', 'Estimate', 'Products', 'Procurement', 'Construction', 'Quality', 'Completion')),
  progress_design INTEGER DEFAULT 0,
  progress_boq INTEGER DEFAULT 0,
  progress_estimate INTEGER DEFAULT 0,
  progress_products INTEGER DEFAULT 0,
  progress_procurement INTEGER DEFAULT 0,
  progress_construction INTEGER DEFAULT 0,
  boq_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_members (
  id SERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- ------------------------------------------------------------
-- 3. BOQ & ESTIMATION
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.boqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version INTEGER DEFAULT 1,
  total_amount NUMERIC DEFAULT 0,
  generated_by_ai BOOLEAN DEFAULT true,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  total_budgeted NUMERIC DEFAULT 0,
  total_committed NUMERIC DEFAULT 0,
  total_actual NUMERIC DEFAULT 0,
  variance NUMERIC DEFAULT 0,
  category_breakdown JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 4. PROCUREMENT: PR, RFQ, QUOTATION, PO
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_number TEXT UNIQUE NOT NULL DEFAULT ('PR-' || floor(random() * 90000 + 10000)::TEXT),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.users(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  required_date DATE,
  delivery_location TEXT,
  justification TEXT,
  status TEXT DEFAULT 'SUBMITTED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RFQ_CREATED', 'CLOSED')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_number TEXT UNIQUE NOT NULL DEFAULT ('RFQ-' || floor(random() * 90000 + 10000)::TEXT),
  pr_id UUID REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  response_deadline TIMESTAMPTZ,
  delivery_location TEXT,
  terms TEXT,
  status TEXT DEFAULT 'OPEN' CHECK (status IN ('DRAFT', 'SENT', 'OPEN', 'PARTIALLY_RESPONDED', 'RESPONDED', 'CLOSED', 'CANCELLED')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  invited_suppliers JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supplier_quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT UNIQUE NOT NULL DEFAULT ('SQ-' || floor(random() * 90000 + 10000)::TEXT),
  rfq_id UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.users(id),
  supplier_name TEXT NOT NULL,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  delivery_days INTEGER DEFAULT 7,
  payment_terms TEXT,
  warranty_period TEXT,
  status TEXT DEFAULT 'SUBMITTED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'SHORTLISTED', 'ACCEPTED', 'REJECTED')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT UNIQUE NOT NULL DEFAULT ('PO-' || floor(random() * 90000 + 10000)::TEXT),
  rfq_id UUID REFERENCES public.rfqs(id) ON DELETE SET NULL,
  quotation_id UUID REFERENCES public.supplier_quotations(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.users(id),
  supplier_name TEXT NOT NULL,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  expected_delivery_date DATE,
  delivery_address TEXT,
  payment_terms TEXT,
  status TEXT DEFAULT 'APPROVED' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'ACKNOWLEDged', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 5. LOGISTICS, GATE ENTRY & GRN
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_number TEXT UNIQUE NOT NULL DEFAULT ('SHP-' || floor(random() * 90000 + 10000)::TEXT),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.users(id),
  vehicle_number TEXT NOT NULL,
  driver_name TEXT,
  driver_phone TEXT,
  dispatch_date TIMESTAMPTZ DEFAULT NOW(),
  expected_arrival TIMESTAMPTZ,
  tracking_number TEXT,
  status TEXT DEFAULT 'DISPATCHED' CHECK (status IN ('PLANNED', 'DISPATCHED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'DELAYED', 'CANCELLED')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.gate_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_entry_number TEXT UNIQUE NOT NULL DEFAULT ('GE-' || floor(random() * 90000 + 10000)::TEXT),
  shipment_id UUID REFERENCES public.shipments(id) ON DELETE SET NULL,
  po_number TEXT NOT NULL,
  vehicle_number TEXT NOT NULL,
  driver_name TEXT,
  supplier_name TEXT NOT NULL,
  entry_time TIMESTAMPTZ DEFAULT NOW(),
  exit_time TIMESTAMPTZ,
  security_officer TEXT,
  status TEXT DEFAULT 'ENTERED' CHECK (status IN ('ENTERED', 'UNLOADED', 'INSPECTED', 'EXITED')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_number TEXT UNIQUE NOT NULL DEFAULT ('GRN-' || floor(random() * 90000 + 10000)::TEXT),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  gate_entry_id UUID REFERENCES public.gate_entries(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  received_by TEXT NOT NULL,
  inspection_status TEXT DEFAULT 'PASSED' CHECK (inspection_status IN ('PENDING', 'PASSED', 'FAILED', 'PARTIAL')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory (
  id SERIAL PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity_available NUMERIC DEFAULT 0,
  unit TEXT DEFAULT 'Units',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 6. SUBCONTRACT MANAGEMENT
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subcontracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontract_number TEXT UNIQUE NOT NULL DEFAULT ('SUB-' || floor(random() * 90000 + 10000)::TEXT),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  subcontractor_id UUID NOT NULL REFERENCES public.users(id),
  subcontractor_name TEXT NOT NULL,
  scope_of_work TEXT NOT NULL,
  total_contract_value NUMERIC NOT NULL DEFAULT 0,
  start_date DATE,
  completion_date DATE,
  status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'COMPLETED', 'TERMINATED')),
  milestones JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 7. FINANCE & PAYMENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  grn_id UUID REFERENCES public.goods_receipts(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.users(id),
  subtotal NUMERIC NOT NULL,
  tax_amount NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  due_date DATE,
  match_status TEXT DEFAULT 'MATCHED' CHECK (match_status IN ('RECEIVED', 'MATCHING', 'MATCHED', 'EXCEPTION', 'REJECTED')),
  payment_status TEXT DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number TEXT UNIQUE NOT NULL DEFAULT ('PAY-' || floor(random() * 90000 + 10000)::TEXT),
  invoice_id UUID REFERENCES public.supplier_invoices(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  payer_id UUID NOT NULL REFERENCES public.users(id),
  payee_id UUID NOT NULL REFERENCES public.users(id),
  amount NUMERIC NOT NULL,
  payment_method TEXT DEFAULT 'BANK_TRANSFER',
  transaction_ref TEXT,
  status TEXT DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 8. QUALITY, DISPUTES & COMMUNICATION HUB
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quality_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_number TEXT UNIQUE NOT NULL DEFAULT ('INS-' || floor(random() * 90000 + 10000)::TEXT),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  inspector_name TEXT NOT NULL,
  stage TEXT NOT NULL,
  score INTEGER DEFAULT 100,
  result TEXT DEFAULT 'PASS' CHECK (result IN ('PASS', 'FAIL', 'CONDITIONAL')),
  comments TEXT,
  issues_found JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_number TEXT UNIQUE NOT NULL DEFAULT ('DSP-' || floor(random() * 90000 + 10000)::TEXT),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  raised_by UUID NOT NULL REFERENCES public.users(id),
  target_entity TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED')),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id),
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  entity_name TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 9. VENDOR ONBOARDING & SUPPLIER PROFILES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  legal_entity_type TEXT DEFAULT 'Private Limited',
  year_established INTEGER DEFAULT 2015,
  business_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  website TEXT,
  office_address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  gstin TEXT UNIQUE NOT NULL,
  pan TEXT NOT NULL,
  msme_reg_no TEXT,
  bank_name TEXT NOT NULL,
  bank_account_no TEXT NOT NULL,
  ifsc_code TEXT NOT NULL,
  bank_branch TEXT,
  categories JSONB DEFAULT '[]'::jsonb,
  brands JSONB DEFAULT '[]'::jsonb,
  service_pincodes JSONB DEFAULT '[]'::jsonb,
  gst_doc_url TEXT,
  pan_doc_url TEXT,
  cheque_doc_url TEXT,
  status TEXT DEFAULT 'PENDING_REVIEW' CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED')),
  review_notes TEXT,
  rating NUMERIC DEFAULT 4.5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Done with Schema V2
