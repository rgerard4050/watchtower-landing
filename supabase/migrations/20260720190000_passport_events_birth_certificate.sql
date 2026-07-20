-- 20260720190000_passport_events_birth_certificate.sql
-- Material Passport roadmap, Phase 3 (partial): passport_events table plus
-- the one automatic event explicitly requested -- PASSPORT_CREATED, fired
-- by a real trigger on INSERT INTO passports. Not building the full custody
-- ledger UI or every future event type yet -- just the birth certificate.
--
-- Reviewed before writing: passports has exactly one existing trigger
-- (trg_require_acquired_intake, BEFORE INSERT). The new trigger here is
-- AFTER INSERT -- required, not optional: passport_events.passport_id has
-- a FK to passports.id, and a BEFORE INSERT trigger fires before the parent
-- row physically exists in the table, which would fail the FK check. AFTER
-- INSERT runs once the parent row is real. No conflict with the existing
-- BEFORE trigger; they run at different times regardless of order.
--
-- event_type is intentionally NOT constrained to a fixed enum (unlike
-- intake_events). The roadmap's own examples for this table --
-- DISASSEMBLED, COPPER_REMOVED -- are custody/processing actions far more
-- granular and open-ended than intake's fixed six-step flow. Locking this
-- to a short CHECK list now would block exactly the kind of event this
-- table exists to capture later.

CREATE TABLE public.passport_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  passport_id bigint NOT NULL REFERENCES public.passports(id),
  event_type text NOT NULL,
  actor text,
  location text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_passport_events_passport_id ON public.passport_events(passport_id);

ALTER TABLE public.passport_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operators select passport_events" ON public.passport_events
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY "operators insert passport_events" ON public.passport_events
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());

-- SECURITY DEFINER so the birth-certificate event is guaranteed to be
-- written regardless of the calling role's own grants -- same reasoning as
-- next_doc_number() and require_acquired_intake().
CREATE OR REPLACE FUNCTION public.log_passport_created()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.passport_events (passport_id, event_type, actor, created_at)
  VALUES (NEW.id, 'PASSPORT_CREATED', NEW.created_by, NEW.created_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_log_passport_created
  AFTER INSERT ON public.passports
  FOR EACH ROW
  EXECUTE FUNCTION public.log_passport_created();

-- Backfill for existing passports: honest, not fabricated -- created_at and
-- created_by are real historical values already on each row, not guesses.
-- (Contrast with Phase 2's evidence backfill, which was deliberately
-- skipped because evidence_type/uploader for old photo_url values genuinely
-- isn't known -- this is different: the birth facts already exist.)
INSERT INTO public.passport_events (passport_id, event_type, actor, created_at)
SELECT p.id, 'PASSPORT_CREATED', p.created_by, p.created_at
FROM public.passports p
WHERE NOT EXISTS (
  SELECT 1 FROM public.passport_events e
  WHERE e.passport_id = p.id AND e.event_type = 'PASSPORT_CREATED'
);

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   DROP TRIGGER IF EXISTS trg_log_passport_created ON public.passports;
--   DROP FUNCTION IF EXISTS public.log_passport_created();
--   DROP TABLE IF EXISTS public.passport_events;
-- ---------------------------------------------------------------------
