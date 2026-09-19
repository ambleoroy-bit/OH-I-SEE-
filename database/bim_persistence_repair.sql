-- ============================================================
-- OH I SEE — Database Schema v4 — BIM Integration
-- Run AFTER schema_v2.sql and schema_v3.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. EXTEND PROJECTS — BIM linkage
-- ------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS bim_model_id UUID,
  ADD COLUMN IF NOT EXISTS bim_generation_status TEXT DEFAULT 'none'
    CHECK (bim_generation_status IN ('none','pending','generating','ready','failed'));

CREATE INDEX IF NOT EXISTS idx_projects_bim_model ON public.projects(bim_model_id);

-- ------------------------------------------------------------
-- 2. BIM MODELS — one active model per construction project
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bim_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  current_version_id UUID,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','validated','exported','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id)
);

CREATE INDEX IF NOT EXISTS idx_bim_models_project ON public.bim_models(project_id);

-- ------------------------------------------------------------
-- 3. BIM VERSIONS — immutable snapshots
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bim_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bim_model_id UUID NOT NULL REFERENCES public.bim_models(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  label TEXT,
  structured_input JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_result JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bim_model_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_bim_versions_model ON public.bim_versions(bim_model_id);

ALTER TABLE public.bim_models
  DROP CONSTRAINT IF EXISTS bim_models_current_version_id_fkey;
ALTER TABLE public.bim_models
  ADD CONSTRAINT bim_models_current_version_id_fkey
  FOREIGN KEY (current_version_id) REFERENCES public.bim_versions(id) ON DELETE SET NULL;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_bim_model_id_fkey;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_bim_model_id_fkey
  FOREIGN KEY (bim_model_id) REFERENCES public.bim_models(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 4. BIM ELEMENTS — normalized element index (optional query layer)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bim_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bim_version_id UUID NOT NULL REFERENCES public.bim_versions(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL,
  global_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT,
  storey_id TEXT,
  geometry JSONB NOT NULL DEFAULT '{}'::jsonb,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  quantity JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bim_version_id, element_id)
);

CREATE INDEX IF NOT EXISTS idx_bim_elements_version ON public.bim_elements(bim_version_id);
CREATE INDEX IF NOT EXISTS idx_bim_elements_global_id ON public.bim_elements(global_id);
CREATE INDEX IF NOT EXISTS idx_bim_elements_type ON public.bim_elements(type);

-- ------------------------------------------------------------
-- 5. BIM RELATIONSHIPS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bim_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bim_version_id UUID NOT NULL REFERENCES public.bim_versions(id) ON DELETE CASCADE,
  source_element_id TEXT NOT NULL,
  target_element_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bim_relationships_version ON public.bim_relationships(bim_version_id);

-- ------------------------------------------------------------
-- 6. BIM MATERIALS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bim_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bim_version_id UUID NOT NULL REFERENCES public.bim_versions(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  unit_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bim_version_id, material_id)
);

-- ------------------------------------------------------------
-- 7. BIM QUANTITIES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bim_quantities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bim_version_id UUID NOT NULL REFERENCES public.bim_versions(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL,
  measure_type TEXT NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  boq_line_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bim_quantities_version ON public.bim_quantities(bim_version_id);

-- ------------------------------------------------------------
-- 8. BIM FILES (IFC, JSON export, PDF floor plan)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bim_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bim_version_id UUID NOT NULL REFERENCES public.bim_versions(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------

ALTER TABLE public.bim_models ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.bim_models TO service_role;

ALTER TABLE public.bim_versions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.bim_versions TO service_role;

ALTER TABLE public.bim_elements ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.bim_elements TO service_role;

ALTER TABLE public.bim_relationships ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.bim_relationships TO service_role;

ALTER TABLE public.bim_materials ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.bim_materials TO service_role;

ALTER TABLE public.bim_quantities ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.bim_quantities TO service_role;

ALTER TABLE public.bim_files ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.bim_files TO service_role;

CREATE OR REPLACE FUNCTION public.save_bim_snapshot(p_project uuid, p_owner uuid, p_requirements jsonb, p_snapshot jsonb, p_validation jsonb, p_label text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m uuid; v public.bim_versions; n integer;
BEGIN
 PERFORM 1 FROM public.projects WHERE id=p_project AND user_id=p_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
 INSERT INTO public.bim_models(project_id) VALUES(p_project) ON CONFLICT(project_id) DO NOTHING;
 SELECT id INTO m FROM public.bim_models WHERE project_id=p_project;
 SELECT coalesce(max(version_number),0)+1 INTO n FROM public.bim_versions WHERE bim_model_id=m;
 INSERT INTO public.bim_versions(bim_model_id,version_number,label,structured_input,model_snapshot,validation_result,created_by)
 VALUES(m,n,coalesce(p_label,'Version '||n),p_requirements,p_snapshot,p_validation,p_owner) RETURNING * INTO v;
 INSERT INTO public.bim_elements(bim_version_id,element_id,global_id,type,name,storey_id,geometry,properties,quantity)
 SELECT v.id,e->>'id',e->>'globalId',e->>'type',e->>'name',e->>'storeyId',coalesce(e->'geometry','{}'),coalesce(e->'properties','{}'),coalesce(e->'quantity','{}') FROM jsonb_array_elements(p_snapshot->'elements') e;
 INSERT INTO public.bim_relationships(bim_version_id,source_element_id,target_element_id,relationship_type,properties)
 SELECT v.id,e->>'sourceId',e->>'targetId',e->>'type',coalesce(e->'properties','{}') FROM jsonb_array_elements(coalesce(p_snapshot->'relationships','[]')) e;
 UPDATE public.bim_models SET current_version_id=v.id,status='validated',updated_at=now() WHERE id=m;
 UPDATE public.projects SET bim_model_id=m,bim_generation_status='ready' WHERE id=p_project;
 RETURN to_jsonb(v)-'model_snapshot'-'structured_input';
END $$;
REVOKE ALL ON FUNCTION public.save_bim_snapshot(uuid,uuid,jsonb,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_bim_snapshot(uuid,uuid,jsonb,jsonb,jsonb,text) TO service_role;
NOTIFY pgrst, 'reload schema';
