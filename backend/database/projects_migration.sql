-- ============================================================
-- OH I SEE — AI Construction Platform
-- Projects Table Migration
-- Run in your Supabase SQL Editor
-- ============================================================

-- Projects: Central entity linking all AI construction modules
CREATE TABLE IF NOT EXISTS public.projects (
  id                   BIGSERIAL PRIMARY KEY,
  project_id           TEXT UNIQUE NOT NULL DEFAULT ('PRJ-' || (10000 + floor(random() * 89999))::TEXT),
  user_id              UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_name         TEXT NOT NULL,
  project_type         TEXT NOT NULL DEFAULT 'Residential',
  location             TEXT DEFAULT '',
  state                TEXT DEFAULT 'Tamil Nadu',
  district             TEXT DEFAULT '',
  city                 TEXT DEFAULT '',
  plot_size            TEXT DEFAULT '',
  built_up_area        TEXT DEFAULT '',
  floors               INTEGER DEFAULT 1,
  bedrooms             INTEGER DEFAULT 0,
  bathrooms            INTEGER DEFAULT 0,
  budget               NUMERIC DEFAULT 0,
  quality_level        TEXT DEFAULT 'Standard' CHECK (quality_level IN ('Economic', 'Standard', 'Premium', 'Custom')),
  status               TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  current_stage        TEXT DEFAULT 'Requirement',
  -- Progress per stage (0-100)
  progress_design      INTEGER DEFAULT 0 CHECK (progress_design BETWEEN 0 AND 100),
  progress_boq         INTEGER DEFAULT 0 CHECK (progress_boq BETWEEN 0 AND 100),
  progress_estimate    INTEGER DEFAULT 0 CHECK (progress_estimate BETWEEN 0 AND 100),
  progress_products    INTEGER DEFAULT 0 CHECK (progress_products BETWEEN 0 AND 100),
  progress_procurement INTEGER DEFAULT 0 CHECK (progress_procurement BETWEEN 0 AND 100),
  progress_construction INTEGER DEFAULT 0 CHECK (progress_construction BETWEEN 0 AND 100),
  estimated_cost       NUMERIC DEFAULT 0,
  description          TEXT DEFAULT '',
  -- AI-generated data (stored as JSONB for flexibility)
  ai_analysis          JSONB DEFAULT '{}',
  boq_data             JSONB DEFAULT '[]',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Policy: users can fully manage their own projects
CREATE POLICY "Users can manage own projects"
  ON public.projects FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: admins can manage all projects
CREATE POLICY "Admins can manage all projects"
  ON public.projects FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('Admin', 'Super Admin')
    )
  );

-- Auto-update updated_at on changes
DROP TRIGGER IF EXISTS projects_updated_at ON public.projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Index for fast user project lookups
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_project_id ON public.projects(project_id);

-- ============================================================
-- DONE — Run this in Supabase SQL Editor
-- ============================================================
