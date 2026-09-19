BEGIN;
CREATE OR REPLACE FUNCTION public.marketplace_sync_project() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.projects WHERE project_id=NEW.project_id AND user_id=NEW.customer_id) THEN RAISE EXCEPTION 'Project owner mismatch'; END IF;
 IF NEW.data->'roadmap'->'handover'->>'approved_at' IS NOT NULL THEN
 UPDATE public.projects SET status='completed',current_stage='Handover & Maintenance',workflow_step=8,completion_percentage=100,workflow_progress=100,updated_at=now() WHERE project_id=NEW.project_id AND user_id=NEW.customer_id;
 ELSIF NEW.data->>'stage' IN ('approved','in_execution') THEN
 UPDATE public.projects SET selected_builder=NEW.data->>'builder_name',acceptance_status='accepted',
 status=CASE WHEN NEW.data->>'stage'='in_execution' THEN 'in_execution' ELSE 'customer_approved' END,
 current_stage=CASE WHEN NEW.data->>'stage'='in_execution' THEN 'Project Execution' ELSE 'Budget Approved' END,
 workflow_step=CASE WHEN NEW.data->>'stage'='in_execution' THEN 7 ELSE 6 END,
 contract_value=(NEW.data->'proposal'->>'total')::numeric,updated_at=now()
 WHERE project_id=NEW.project_id AND user_id=NEW.customer_id;
 END IF;
 RETURN NEW;
END; $$;
COMMIT;
NOTIFY pgrst,'reload schema';
