-- OH I SEE — Draft persistence columns for Customer Portal
-- Run in Supabase SQL Editor after schema_customer_portal.sql

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS completion_percentage INTEGER DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS last_saved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_projects_user_status ON public.projects(user_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_last_saved ON public.projects(last_saved_at DESC);
