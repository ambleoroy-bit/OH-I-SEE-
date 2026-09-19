-- Additive, registered-account marketplace. Apply after projects_migration.sql.
BEGIN;
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
COMMIT;
NOTIFY pgrst, 'reload schema';
