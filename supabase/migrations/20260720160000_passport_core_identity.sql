-- 20260720160000_passport_core_identity.sql
-- Material Passport roadmap, Phase 1 only (core identity). No evidence,
-- events, or material-classification tables -- those are Phases 2-4.
--
-- PROBLEM SOLVED:
-- passports.passport_id exists (unique, nullable) but has no generator --
-- confirmed live, every row has passport_id = NULL. Unlike intakes
-- (intake_number, real sequence) and manifests (manifest_id, real trigger),
-- passports have no permanent human-readable identifier at all, only the
-- raw bigint id.
--
-- Reviewed before writing: existing sequences (intakes_number_seq,
-- manifests_id_seq, passports_id_seq, etc. -- no name collision with the
-- new passports_number_seq below) and the one existing passports trigger
-- (trg_require_acquired_intake, BEFORE INSERT -- fires after column
-- defaults resolve, so it sees the already-generated passport_id; no
-- conflict).

-- 1. Same generator already used by intakes -- no new function needed.
CREATE SEQUENCE IF NOT EXISTS public.passports_number_seq;
GRANT USAGE ON SEQUENCE public.passports_number_seq TO authenticated;

-- 2. Backfill existing rows in creation order before enforcing NOT NULL.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.passports WHERE passport_id IS NULL ORDER BY created_at ASC
  LOOP
    UPDATE public.passports
    SET passport_id = public.next_doc_number('public.passports_number_seq', 'WT-MAT')
    WHERE id = r.id;
  END LOOP;
END $$;

-- 3. Auto-generate going forward; enforce now that every row has one.
ALTER TABLE public.passports
  ALTER COLUMN passport_id SET DEFAULT public.next_doc_number('public.passports_number_seq', 'WT-MAT');
ALTER TABLE public.passports
  ALTER COLUMN passport_id SET NOT NULL;

-- 4. created_by -- text, matching the existing intakes.operator /
--    intake_events.actor convention (auth uid stored as text, not a uuid
--    FK). Backfilled from intake_operator where a source intake exists;
--    left NULL for standalone passports rather than fabricated.
ALTER TABLE public.passports ADD COLUMN IF NOT EXISTS created_by text;
UPDATE public.passports SET created_by = intake_operator WHERE created_by IS NULL AND intake_operator IS NOT NULL;

-- 5. lifecycle_status -- separate from the existing `status` column
--    (untouched, still default 'received'). Scoped to the states named in
--    the Phase 1-4 roadmap; only 'CREATED' is reachable by any code today
--    since no transition UI exists yet (Phases 2-4).
ALTER TABLE public.passports
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'CREATED';
ALTER TABLE public.passports
  ADD CONSTRAINT passports_lifecycle_status_check
  CHECK (lifecycle_status IN (
    'CREATED', 'VERIFIED', 'COLLECTED', 'INSPECTED',
    'GRADED', 'PROCESSING', 'RECOVERED', 'COMPLETED'
  ));

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   ALTER TABLE public.passports DROP CONSTRAINT IF EXISTS passports_lifecycle_status_check;
--   ALTER TABLE public.passports DROP COLUMN IF EXISTS lifecycle_status;
--   ALTER TABLE public.passports DROP COLUMN IF EXISTS created_by;
--   ALTER TABLE public.passports ALTER COLUMN passport_id DROP NOT NULL;
--   ALTER TABLE public.passports ALTER COLUMN passport_id DROP DEFAULT;
--   DROP SEQUENCE IF EXISTS public.passports_number_seq;
-- Backfilled passport_id values are not reverted -- non-destructive, no
-- need to undo real identifiers once assigned.
-- ---------------------------------------------------------------------
