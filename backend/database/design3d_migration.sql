-- OH I SEE shared 3D engine. Additive migration; uses existing public.users.
-- Run in the EXISTING Supabase project's SQL editor as its database owner.
BEGIN;
CREATE TABLE IF NOT EXISTS public.oh3d_projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id),
 prompt text NOT NULL CHECK(length(prompt) BETWEEN 1 AND 8000), inputs jsonb NOT NULL DEFAULT '{}',
 specification jsonb, current_version integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'draft',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.oh3d_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.oh3d_projects(id),
 version integer NOT NULL, specification jsonb, artifacts jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'pending', prompt text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,version)
);
CREATE SEQUENCE IF NOT EXISTS public.oh3d_job_seq;
CREATE TABLE IF NOT EXISTS public.oh3d_jobs (
 id text PRIMARY KEY DEFAULT ('OH3D-'||to_char(now(),'YYYYMMDD')||'-'||lpad(nextval('public.oh3d_job_seq')::text,8,'0')),
 project_id uuid NOT NULL REFERENCES public.oh3d_projects(id), user_id uuid NOT NULL REFERENCES public.users(id),
 version_id uuid NOT NULL REFERENCES public.oh3d_versions(id), base_version_id uuid REFERENCES public.oh3d_versions(id),
 operation text NOT NULL CHECK(operation IN ('generate','modify','retry_render')),
 prompt text NOT NULL, request_key uuid NOT NULL, options jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','building','materials','lighting','rendering','completed','failed')),
 progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100), message text, error_code text,
 worker_id text, lease_until timestamptz, available_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS oh3d_one_active_job ON public.oh3d_jobs(project_id) WHERE status NOT IN ('completed','failed');
CREATE INDEX IF NOT EXISTS oh3d_queue ON public.oh3d_jobs(status,available_at,created_at);
CREATE INDEX IF NOT EXISTS oh3d_owner ON public.oh3d_projects(user_id,updated_at);
CREATE TABLE IF NOT EXISTS public.oh3d_worker_leases(resource text PRIMARY KEY, worker_id text NOT NULL, lease_until timestamptz NOT NULL);
ALTER TABLE public.oh3d_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oh3d_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oh3d_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oh3d_worker_leases ENABLE ROW LEVEL SECURITY;
-- The existing app uses custom JWTs, not Supabase browser JWTs. Access is backend-only.
REVOKE ALL ON public.oh3d_projects,public.oh3d_versions,public.oh3d_jobs,public.oh3d_worker_leases FROM anon,authenticated;
GRANT ALL ON public.oh3d_projects,public.oh3d_versions,public.oh3d_jobs,public.oh3d_worker_leases TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.oh3d_job_seq TO service_role;

CREATE OR REPLACE FUNCTION public.oh3d_enqueue(p_project uuid,p_user uuid,p_expected integer,p_operation text,p_prompt text,p_key uuid,p_options jsonb DEFAULT '{}',p_base uuid DEFAULT NULL)
RETURNS public.oh3d_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p oh3d_projects; j oh3d_jobs; v oh3d_versions; b uuid; n integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 SELECT * INTO p FROM oh3d_projects WHERE id=p_project AND user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO j FROM oh3d_jobs WHERE user_id=p_user AND request_key=p_key;
 IF FOUND THEN
   IF j.project_id<>p_project OR j.operation<>p_operation OR j.prompt<>p_prompt THEN RAISE EXCEPTION 'Idempotency key already used' USING ERRCODE='40001'; END IF;
   RETURN j;
 END IF;
 IF p.current_version<>p_expected THEN RAISE EXCEPTION 'Project changed. Refresh and retry.' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM oh3d_jobs WHERE project_id=p_project AND status NOT IN ('completed','failed')) THEN RAISE EXCEPTION 'Project already has an active job' USING ERRCODE='40001'; END IF;
 IF (SELECT count(*) FROM oh3d_jobs WHERE user_id=p_user AND status NOT IN ('completed','failed'))>=3 THEN RAISE EXCEPTION 'Three active jobs per account maximum' USING ERRCODE='40001'; END IF;
 SELECT id INTO b FROM oh3d_versions WHERE project_id=p_project AND version=p.current_version;
 IF p_operation='retry_render' THEN
   SELECT id INTO b FROM oh3d_versions WHERE id=p_base AND project_id=p_project AND artifacts ? 'project';
   IF b IS NULL THEN RAISE EXCEPTION 'No saved model to render' USING ERRCODE='22023'; END IF;
 END IF;
 IF p_operation='modify' AND b IS NULL THEN RAISE EXCEPTION 'Generate the initial design first' USING ERRCODE='22023'; END IF;
 SELECT coalesce(max(version),0)+1 INTO n FROM oh3d_versions WHERE project_id=p_project;
 INSERT INTO oh3d_versions(project_id,version,prompt) VALUES(p_project,n,p_prompt) RETURNING * INTO v;
 INSERT INTO oh3d_jobs(project_id,user_id,version_id,base_version_id,operation,prompt,request_key,options)
 VALUES(p_project,p_user,v.id,b,p_operation,p_prompt,p_key,p_options) RETURNING * INTO j;
 UPDATE oh3d_projects SET status='queued',prompt=CASE WHEN p_operation='generate' THEN p_prompt ELSE prompt END,updated_at=now() WHERE id=p_project;
 RETURN j;
END $$;

CREATE OR REPLACE FUNCTION public.oh3d_claim(p_worker text,p_resource text)
RETURNS SETOF public.oh3d_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j oh3d_jobs; locked_resource text;
BEGIN
 INSERT INTO oh3d_worker_leases(resource,worker_id,lease_until) VALUES(p_resource,p_worker,now()+interval '90 seconds')
 ON CONFLICT(resource) DO UPDATE SET worker_id=p_worker,lease_until=now()+interval '90 seconds'
 WHERE oh3d_worker_leases.lease_until<now() OR oh3d_worker_leases.worker_id=p_worker RETURNING resource INTO locked_resource;
 IF locked_resource IS NULL THEN RETURN; END IF;
 -- Interrupted work is never silently submitted twice to Blender.
 UPDATE oh3d_jobs SET status='failed',error_code='WORKER_INTERRUPTED',message='Worker interrupted. Saved files are retained; retry when the worker is available.',updated_at=now()
 WHERE status NOT IN ('queued','completed','failed') AND lease_until<now();
 SELECT * INTO j FROM oh3d_jobs WHERE status='queued' AND available_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE oh3d_jobs SET status='processing',progress=5,worker_id=p_worker,lease_until=now()+interval '90 seconds',updated_at=now() WHERE id=j.id RETURNING * INTO j;
 RETURN NEXT j;
END $$;

CREATE OR REPLACE FUNCTION public.oh3d_heartbeat(p_job text,p_worker text,p_resource text,p_status text,p_progress integer,p_message text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE oh3d_worker_leases SET lease_until=now()+interval '90 seconds' WHERE resource=p_resource AND worker_id=p_worker AND lease_until>now();
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE oh3d_jobs SET status=p_status,progress=p_progress,message=p_message,lease_until=now()+interval '90 seconds',updated_at=now()
 WHERE id=p_job AND worker_id=p_worker AND status NOT IN ('completed','failed') AND lease_until>now();
 RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.oh3d_finish(p_job text,p_worker text,p_spec jsonb,p_artifacts jsonb,p_error text DEFAULT NULL,p_message text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j oh3d_jobs; v oh3d_versions;
BEGIN
 SELECT * INTO j FROM oh3d_jobs WHERE id=p_job AND worker_id=p_worker AND status NOT IN ('completed','failed') AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE oh3d_versions SET specification=p_spec,artifacts=p_artifacts,status=CASE WHEN p_error IS NULL THEN 'completed' ELSE 'failed' END WHERE id=j.version_id RETURNING * INTO v;
 UPDATE oh3d_jobs SET status=CASE WHEN p_error IS NULL THEN 'completed' ELSE 'failed' END,progress=CASE WHEN p_error IS NULL THEN 100 ELSE progress END,error_code=p_error,message=p_message,updated_at=now() WHERE id=j.id;
 UPDATE oh3d_projects SET specification=CASE WHEN p_error IS NULL THEN p_spec ELSE specification END,current_version=CASE WHEN p_error IS NULL THEN v.version ELSE current_version END,status=CASE WHEN p_error IS NULL THEN 'completed' ELSE 'failed' END,updated_at=now() WHERE id=j.project_id;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.oh3d_restore(p_project uuid,p_user uuid,p_version uuid,p_expected integer)
RETURNS public.oh3d_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p oh3d_projects; v oh3d_versions;
BEGIN
 SELECT * INTO p FROM oh3d_projects WHERE id=p_project AND user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE='P0002'; END IF;
 IF p.current_version<>p_expected OR EXISTS(SELECT 1 FROM oh3d_jobs WHERE project_id=p_project AND status NOT IN ('completed','failed')) THEN RAISE EXCEPTION 'Project is busy or changed' USING ERRCODE='40001'; END IF;
 SELECT * INTO v FROM oh3d_versions WHERE id=p_version AND project_id=p_project AND status='completed';
 IF NOT FOUND THEN RAISE EXCEPTION 'Completed version not found' USING ERRCODE='P0002'; END IF;
 UPDATE oh3d_projects SET current_version=v.version,specification=v.specification,status='completed',updated_at=now() WHERE id=p_project RETURNING * INTO p;
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.oh3d_enqueue(uuid,uuid,integer,text,text,uuid,jsonb,uuid),public.oh3d_claim(text,text),public.oh3d_heartbeat(text,text,text,text,integer,text),public.oh3d_finish(text,text,jsonb,jsonb,text,text),public.oh3d_restore(uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.oh3d_enqueue(uuid,uuid,integer,text,text,uuid,jsonb,uuid),public.oh3d_claim(text,text),public.oh3d_heartbeat(text,text,text,text,integer,text),public.oh3d_finish(text,text,jsonb,jsonb,text,text),public.oh3d_restore(uuid,uuid,uuid,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
