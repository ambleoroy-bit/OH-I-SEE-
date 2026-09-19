-- Run only against the isolated marketplace test database after activation migration.
BEGIN;
INSERT INTO public.users(id,role) VALUES ('00000000-0000-0000-0000-000000000001','Customer'),('00000000-0000-0000-0000-000000000002','Partner');
INSERT INTO public.projects(project_id,user_id,project_name) VALUES ('MARKETPLACE-TEST','00000000-0000-0000-0000-000000000001','Synthetic migration test');
DO $$ BEGIN
 IF has_table_privilege('anon','public.marketplace_jobs','SELECT') OR has_table_privilege('authenticated','public.marketplace_products','INSERT') THEN RAISE EXCEPTION 'Browser roles must not access private marketplace tables'; END IF;
 BEGIN
  INSERT INTO public.marketplace_profiles(user_id,kind,company,city) VALUES ('00000000-0000-0000-0000-000000000002','contractor','Invalid missing rates','Test');
  RAISE EXCEPTION 'Missing contractor rates accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SET LOCAL ROLE service_role;
INSERT INTO public.marketplace_jobs(id,project_id,customer_id,contractor_id,data) VALUES ('00000000-0000-0000-0000-000000000010','MARKETPLACE-TEST','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','{"stage":"requested","builder_name":"Registered Test Builder"}');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.projects WHERE project_id='MARKETPLACE-TEST' AND selected_builder='Registered Test Builder' AND status='builder_selected') THEN RAISE EXCEPTION 'Atomic selection sync failed'; END IF;
 BEGIN
  INSERT INTO public.marketplace_jobs(project_id,customer_id,contractor_id,data) VALUES ('MARKETPLACE-TEST','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','{}');
  RAISE EXCEPTION 'Duplicate project lead accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
UPDATE public.marketplace_jobs SET data='{"stage":"approved","builder_name":"Registered Test Builder","proposal":{"total":500000}}',version=2 WHERE id='00000000-0000-0000-0000-000000000010' AND version=1;
DO $$ DECLARE n integer; BEGIN
 UPDATE public.marketplace_jobs SET version=99 WHERE id='00000000-0000-0000-0000-000000000010' AND version=1;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Stale update succeeded'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.projects WHERE project_id='MARKETPLACE-TEST' AND contract_value=500000 AND status='customer_approved') THEN RAISE EXCEPTION 'Approved proposal not synchronized'; END IF;
END $$;
ROLLBACK;
SELECT 'Marketplace constraints, grants, atomic project updates and stale version checks passed' AS result;
