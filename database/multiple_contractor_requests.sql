BEGIN;
ALTER TABLE public.marketplace_jobs DROP CONSTRAINT IF EXISTS marketplace_jobs_project_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_jobs_project_contractor ON public.marketplace_jobs(project_id,contractor_id);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_jobs_one_award ON public.marketplace_jobs(project_id) WHERE data->>'stage' IN ('approved','in_execution');
CREATE OR REPLACE FUNCTION public.marketplace_sync_project() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.projects WHERE project_id=NEW.project_id AND user_id=NEW.customer_id) THEN RAISE EXCEPTION 'Project owner mismatch'; END IF;
 IF NEW.data->>'stage' IN ('approved','in_execution') THEN
 UPDATE public.projects SET selected_builder=NEW.data->>'builder_name',acceptance_status='accepted',
 status=CASE WHEN NEW.data->>'stage'='in_execution' THEN 'in_execution' ELSE 'customer_approved' END,
 current_stage=CASE WHEN NEW.data->>'stage'='in_execution' THEN 'Project Execution' ELSE 'Budget Approved' END,
 workflow_step=CASE WHEN NEW.data->>'stage'='in_execution' THEN 7 ELSE 6 END,
 contract_value=(NEW.data->'proposal'->>'total')::numeric,updated_at=now()
 WHERE project_id=NEW.project_id AND user_id=NEW.customer_id;
 END IF;
 RETURN NEW;
END; $$;
UPDATE public.projects p SET selected_builder=NULL,acceptance_status='pending_vendor',status='active',current_stage='Builder Selection',workflow_step=5
WHERE EXISTS(SELECT 1 FROM public.marketplace_jobs j WHERE j.project_id=p.project_id)
AND NOT EXISTS(SELECT 1 FROM public.marketplace_jobs j WHERE j.project_id=p.project_id AND j.data->>'stage' IN ('approved','in_execution'));
COMMIT;
NOTIFY pgrst,'reload schema';
