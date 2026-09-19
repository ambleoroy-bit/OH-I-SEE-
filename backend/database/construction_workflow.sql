-- Additive migration: apply after schema.sql and projects_migration.sql.
-- References the existing public project_id, compatible with bigint/UUID internal IDs.
BEGIN;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS construction_context JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.construction_admins (
  user_id UUID PRIMARY KEY REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.construction_professionals (
  id UUID PRIMARY KEY REFERENCES public.users(id),
  name TEXT NOT NULL,
  profession TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  experience_years INTEGER NOT NULL CHECK (experience_years BETWEEN 0 AND 80),
  service_radius_km NUMERIC NOT NULL CHECK (service_radius_km BETWEEN 1 AND 500),
  lat NUMERIC CHECK (lat BETWEEN -90 AND 90),
  lng NUMERIC CHECK (lng BETWEEN -180 AND 180),
  available BOOLEAN NOT NULL DEFAULT false,
  rate NUMERIC CHECK (rate >= 0),
  rate_unit TEXT NOT NULL DEFAULT 'project',
  verification TEXT NOT NULL DEFAULT 'pending' CHECK (verification IN ('pending','verified','rejected','suspended')),
  verification_reference TEXT,
  verified_by UUID REFERENCES public.users(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((lat IS NULL) = (lng IS NULL))
);
CREATE INDEX IF NOT EXISTS construction_professional_search ON public.construction_professionals(verification, city, profession);

CREATE TABLE IF NOT EXISTS public.construction_engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES public.projects(project_id),
  customer_id UUID NOT NULL REFERENCES public.users(id),
  professional_id UUID NOT NULL REFERENCES public.construction_professionals(id),
  data JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, professional_id),
  CHECK (customer_id <> professional_id)
);
CREATE INDEX IF NOT EXISTS construction_engagement_customer ON public.construction_engagements(customer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS construction_engagement_professional ON public.construction_engagements(professional_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS construction_payment_order ON public.construction_engagements((data->'payment'->>'order_id')) WHERE data->'payment'->>'order_id' IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.construction_events (
  id BIGSERIAL PRIMARY KEY,
  engagement_id UUID REFERENCES public.construction_engagements(id),
  project_id TEXT REFERENCES public.projects(project_id),
  actor_id UUID REFERENCES public.users(id),
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS construction_event_project ON public.construction_events(project_id, id DESC);
CREATE TABLE IF NOT EXISTS public.construction_notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id),
  engagement_id UUID REFERENCES public.construction_engagements(id),
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS construction_notification_user ON public.construction_notifications(user_id, id DESC);

-- Application JWTs are verified by Express. Browser clients cannot mutate these tables.
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['construction_admins','construction_professionals','construction_engagements','construction_events','construction_notifications'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE public.construction_events_id_seq, public.construction_notifications_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.construction_save(p_id UUID, p_version INTEGER, p_data JSONB, p_actor UUID, p_action TEXT)
RETURNS public.construction_engagements LANGUAGE plpgsql SET search_path = public AS $$
DECLARE previous public.construction_engagements; result public.construction_engagements;
BEGIN
  SELECT * INTO previous FROM construction_engagements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR previous.version <> p_version THEN RAISE EXCEPTION 'Workflow changed. Refresh and retry.' USING ERRCODE = '40001'; END IF;
  IF p_actor IS NOT NULL AND p_actor NOT IN (previous.customer_id, previous.professional_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  UPDATE construction_engagements SET data = p_data, version = version + 1, updated_at = now() WHERE id = p_id RETURNING * INTO result;
  INSERT INTO construction_events(engagement_id, project_id, actor_id, action, old_value, new_value) VALUES (p_id, result.project_id, p_actor, p_action, previous.data, result.data);
  INSERT INTO construction_notifications(user_id, engagement_id, message)
    SELECT u, p_id, replace(p_action, '_', ' ') || ' · ' || result.project_id FROM unnest(ARRAY[result.customer_id,result.professional_id]) u WHERE u IS DISTINCT FROM p_actor;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.construction_save(UUID,INTEGER,JSONB,UUID,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.construction_save(UUID,INTEGER,JSONB,UUID,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.construction_requested() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO construction_events(engagement_id, project_id, actor_id, action, new_value) VALUES (new.id,new.project_id,new.customer_id,'requested',new.data);
  INSERT INTO construction_notifications(user_id,engagement_id,message) VALUES (new.professional_id,new.id,'New project request · ' || new.project_id);
  RETURN new;
END $$;
DROP TRIGGER IF EXISTS construction_requested ON public.construction_engagements;
CREATE TRIGGER construction_requested AFTER INSERT ON public.construction_engagements FOR EACH ROW EXECUTE FUNCTION public.construction_requested();

CREATE OR REPLACE FUNCTION public.construction_verify(p_id UUID,p_actor UUID,p_status TEXT,p_reference TEXT)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_profile JSONB; new_profile JSONB;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM construction_admins WHERE user_id=p_actor) OR p_id=p_actor THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
  SELECT to_jsonb(p) INTO old_profile FROM construction_professionals p WHERE id=p_id FOR UPDATE;
  IF old_profile IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;
  UPDATE construction_professionals SET verification=p_status, verification_reference=p_reference, verified_by=p_actor, verified_at=now(), updated_at=now() WHERE id=p_id RETURNING to_jsonb(construction_professionals.*) INTO new_profile;
  INSERT INTO construction_events(actor_id,action,old_value,new_value) VALUES(p_actor,'professional_verification',old_profile,new_profile);
  INSERT INTO construction_notifications(user_id,message) VALUES(p_id,'Professional verification: ' || p_status);
END $$;
REVOKE ALL ON FUNCTION public.construction_verify(UUID,UUID,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.construction_verify(UUID,UUID,TEXT,TEXT) TO service_role;
COMMIT;
