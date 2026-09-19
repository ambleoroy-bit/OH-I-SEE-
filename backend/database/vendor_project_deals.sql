-- ============================================================
-- OH I SEE — AI Construction Platform
-- Vendor Project Deals & Employee Wage Management Migration
-- ============================================================

-- 1. Add vendor & payment columns to projects table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS acceptance_status TEXT DEFAULT 'pending_vendor' CHECK (acceptance_status IN ('pending_vendor', 'accepted', 'negotiating', 'rejected')),
ADD COLUMN IF NOT EXISTS payment_terms JSONB DEFAULT '{"advance_percentage": 20, "payment_model": "milestone", "milestone_schedule": ["20% Advance", "40% Slab Completion", "30% Finishing", "10% Handover"]}';

-- 2. Create project_employees table for workforce tracking
CREATE TABLE IF NOT EXISTS public.project_employees (
  id           BIGSERIAL PRIMARY KEY,
  emp_id       TEXT UNIQUE NOT NULL DEFAULT ('EMP-' || (1000 + floor(random() * 8999))::TEXT),
  project_id   TEXT NOT NULL REFERENCES public.projects(project_id) ON DELETE CASCADE,
  vendor_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'Site Worker',
  phone        TEXT DEFAULT '',
  wage_type    TEXT NOT NULL DEFAULT 'daily' CHECK (wage_type IN ('daily', 'monthly', 'milestone', 'completion')),
  wage_rate    NUMERIC NOT NULL DEFAULT 0,
  advance_paid NUMERIC DEFAULT 0,
  status       TEXT DEFAULT 'active' CHECK (status IN ('active', 'on_leave', 'completed')),
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on project_employees
ALTER TABLE public.project_employees ENABLE ROW LEVEL SECURITY;

-- Policies for project_employees
CREATE POLICY "Vendors can manage their assigned project employees"
  ON public.project_employees FOR ALL
  USING (auth.uid() = vendor_id)
  WITH CHECK (auth.uid() = vendor_id);

CREATE POLICY "Clients can view employees assigned to their projects"
  ON public.project_employees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = project_employees.project_id
      AND p.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_proj_emp_project_id ON public.project_employees(project_id);
CREATE INDEX IF NOT EXISTS idx_proj_emp_vendor_id ON public.project_employees(vendor_id);
