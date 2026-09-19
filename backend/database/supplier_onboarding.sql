-- Additive vendor profile storage for the existing authenticated onboarding API.
BEGIN;
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
  rating NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.supplier_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_profiles FROM anon,authenticated;
GRANT ALL ON public.supplier_profiles TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
