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
-- 9. LINK LEGACY BLUEPRINTS TO BIM VERSION (optional)
-- ------------------------------------------------------------
ALTER TABLE public.blueprints
  ADD COLUMN IF NOT EXISTS bim_version_id UUID REFERENCES public.bim_versions(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 10. ROW LEVEL SECURITY
-- ------------------------------------------------------------
ALTER TABLE public.bim_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bim_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bim_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bim_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bim_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bim_quantities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bim_files ENABLE ROW LEVEL SECURITY;

-- Helper: user owns project or is a project member
CREATE OR REPLACE FUNCTION public.user_can_access_project(p_project_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_uuid
      AND (
        p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_bim_model(p_bim_model_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bim_models m
    WHERE m.id = p_bim_model_id
      AND public.user_can_access_project(m.project_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_bim_version(p_bim_version_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bim_versions v
    JOIN public.bim_models m ON m.id = v.bim_model_id
    WHERE v.id = p_bim_version_id
      AND public.user_can_access_project(m.project_id)
  );
$$;

-- bim_models policies
DROP POLICY IF EXISTS bim_models_select ON public.bim_models;
DROP POLICY IF EXISTS bim_models_insert ON public.bim_models;
DROP POLICY IF EXISTS bim_models_update ON public.bim_models;
DROP POLICY IF EXISTS bim_models_delete ON public.bim_models;

CREATE POLICY bim_models_select ON public.bim_models
  FOR SELECT USING (public.user_can_access_project(project_id));
CREATE POLICY bim_models_insert ON public.bim_models
  FOR INSERT WITH CHECK (public.user_can_access_project(project_id));
CREATE POLICY bim_models_update ON public.bim_models
  FOR UPDATE USING (public.user_can_access_project(project_id));
CREATE POLICY bim_models_delete ON public.bim_models
  FOR DELETE USING (public.user_can_access_project(project_id));

-- bim_versions policies
DROP POLICY IF EXISTS bim_versions_select ON public.bim_versions;
DROP POLICY IF EXISTS bim_versions_insert ON public.bim_versions;
DROP POLICY IF EXISTS bim_versions_update ON public.bim_versions;

CREATE POLICY bim_versions_select ON public.bim_versions
  FOR SELECT USING (public.user_can_access_bim_model(bim_model_id));
CREATE POLICY bim_versions_insert ON public.bim_versions
  FOR INSERT WITH CHECK (public.user_can_access_bim_model(bim_model_id));
CREATE POLICY bim_versions_update ON public.bim_versions
  FOR UPDATE USING (public.user_can_access_bim_model(bim_model_id));

-- Child tables via version access
DROP POLICY IF EXISTS bim_elements_select ON public.bim_elements;
DROP POLICY IF EXISTS bim_elements_insert ON public.bim_elements;
DROP POLICY IF EXISTS bim_relationships_select ON public.bim_relationships;
DROP POLICY IF EXISTS bim_relationships_insert ON public.bim_relationships;
DROP POLICY IF EXISTS bim_materials_select ON public.bim_materials;
DROP POLICY IF EXISTS bim_materials_insert ON public.bim_materials;
DROP POLICY IF EXISTS bim_quantities_select ON public.bim_quantities;
DROP POLICY IF EXISTS bim_quantities_insert ON public.bim_quantities;
DROP POLICY IF EXISTS bim_files_select ON public.bim_files;
DROP POLICY IF EXISTS bim_files_insert ON public.bim_files;

CREATE POLICY bim_elements_select ON public.bim_elements
  FOR SELECT USING (public.user_can_access_bim_version(bim_version_id));
CREATE POLICY bim_elements_insert ON public.bim_elements
  FOR INSERT WITH CHECK (public.user_can_access_bim_version(bim_version_id));
CREATE POLICY bim_relationships_select ON public.bim_relationships
  FOR SELECT USING (public.user_can_access_bim_version(bim_version_id));
CREATE POLICY bim_relationships_insert ON public.bim_relationships
  FOR INSERT WITH CHECK (public.user_can_access_bim_version(bim_version_id));
CREATE POLICY bim_materials_select ON public.bim_materials
  FOR SELECT USING (public.user_can_access_bim_version(bim_version_id));
CREATE POLICY bim_materials_insert ON public.bim_materials
  FOR INSERT WITH CHECK (public.user_can_access_bim_version(bim_version_id));
CREATE POLICY bim_quantities_select ON public.bim_quantities
  FOR SELECT USING (public.user_can_access_bim_version(bim_version_id));
CREATE POLICY bim_quantities_insert ON public.bim_quantities
  FOR INSERT WITH CHECK (public.user_can_access_bim_version(bim_version_id));
CREATE POLICY bim_files_select ON public.bim_files
  FOR SELECT USING (public.user_can_access_bim_version(bim_version_id));
CREATE POLICY bim_files_insert ON public.bim_files
  FOR INSERT WITH CHECK (public.user_can_access_bim_version(bim_version_id));
