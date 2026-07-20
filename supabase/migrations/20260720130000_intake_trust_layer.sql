-- 20260720130000_intake_trust_layer.sql
--
-- PROBLEM SOLVED:
-- An accepted intake was a text record with no photo, no record of what the
-- AI actually said before the operator edited it, no history of what
-- happened to it over time, no location, and contamination/safety hazards
-- flattened into a single comma-joined string. None of that is enough for
-- a future buyer to trust the record without personally inspecting the
-- source material.
--
-- DECISION: five additive changes, all nullable except where a CHECK/NOT
-- NULL is needed for integrity. No existing column is removed or repurposed.
-- Verified against the live schema (list_tables) immediately before writing
-- this, not against docs, to avoid duplicating anything that already exists.

-- ---------------------------------------------------------------------
-- 1. PHOTO EVIDENCE STORAGE
-- ---------------------------------------------------------------------
-- Private bucket -- public=false means no anonymous or public URL access.
-- Only a signed URL (generated server-/client-side by an authenticated
-- operator session) can ever read an object back out.
INSERT INTO storage.buckets (id, name, public)
VALUES ('intake-evidence', 'intake-evidence', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "operators upload intake evidence" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'intake-evidence' AND public.is_operator());

CREATE POLICY "operators read intake evidence" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'intake-evidence' AND public.is_operator());

ALTER TABLE public.intakes ADD COLUMN IF NOT EXISTS photo_path text;

-- ---------------------------------------------------------------------
-- 2. AI ORIGINAL VS OPERATOR FINAL
-- ---------------------------------------------------------------------
-- material/grade/confidence/notes (existing columns) remain the operator-
-- verified final values, exactly as today. This is the untouched snapshot
-- of what /api/grade returned before any correction.
ALTER TABLE public.intakes ADD COLUMN IF NOT EXISTS ai_raw_response jsonb;

-- ---------------------------------------------------------------------
-- 3. INTAKE EVENT HISTORY
-- ---------------------------------------------------------------------
CREATE TABLE public.intake_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  intake_id uuid NOT NULL REFERENCES public.intakes(id),
  event_type text NOT NULL CHECK (event_type IN (
    'CREATED', 'AI_GRADED', 'OPERATOR_VERIFIED', 'ACQUIRED',
    'PASSPORT_CREATED', 'MANIFEST_CREATED'
  )),
  actor text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_intake_events_intake_id ON public.intake_events(intake_id);

ALTER TABLE public.intake_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operators select intake_events" ON public.intake_events
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY "operators insert intake_events" ON public.intake_events
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());

-- ---------------------------------------------------------------------
-- 4. LOCATION FOUNDATION
-- ---------------------------------------------------------------------
-- lat/lng stay behind the same intakes RLS as everything else (operators
-- only) -- never separately exposed. region is a coarse label for future
-- regional aggregation; nothing populates it automatically yet (no
-- geocoding API configured in this project), so it starts as operator-
-- entered or empty.
ALTER TABLE public.intakes
  ADD COLUMN IF NOT EXISTS lat numeric,
  ADD COLUMN IF NOT EXISTS lng numeric,
  ADD COLUMN IF NOT EXISTS region text;

-- ---------------------------------------------------------------------
-- 5. STRUCTURED MATERIAL RISK DATA
-- ---------------------------------------------------------------------
-- contamination was `text`, populated by joining the AI's array with ', '.
-- Converting in place, losslessly, by reversing that join for existing rows.
ALTER TABLE public.intakes
  ALTER COLUMN contamination TYPE text[]
  USING CASE
    WHEN contamination IS NULL OR contamination = '' THEN NULL
    ELSE string_to_array(contamination, ', ')
  END;

-- safety_flags was never persisted at all -- the AI has always returned it
-- (api/grade.js's schema includes it) but the frontend silently dropped it.
ALTER TABLE public.intakes ADD COLUMN IF NOT EXISTS safety_flags text[];

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   ALTER TABLE public.intakes DROP COLUMN IF EXISTS safety_flags;
--   ALTER TABLE public.intakes ALTER COLUMN contamination TYPE text
--     USING CASE WHEN contamination IS NULL THEN NULL ELSE array_to_string(contamination, ', ') END;
--   ALTER TABLE public.intakes DROP COLUMN IF EXISTS lat, DROP COLUMN IF EXISTS lng, DROP COLUMN IF EXISTS region;
--   DROP POLICY IF EXISTS "operators insert intake_events" ON public.intake_events;
--   DROP POLICY IF EXISTS "operators select intake_events" ON public.intake_events;
--   DROP TABLE IF EXISTS public.intake_events;
--   ALTER TABLE public.intakes DROP COLUMN IF EXISTS ai_raw_response;
--   ALTER TABLE public.intakes DROP COLUMN IF EXISTS photo_path;
--   DROP POLICY IF EXISTS "operators read intake evidence" ON storage.objects;
--   DROP POLICY IF EXISTS "operators upload intake evidence" ON storage.objects;
--   -- bucket itself intentionally left in place on rollback (may hold data)
-- ---------------------------------------------------------------------
