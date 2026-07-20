-- 20260720090000_add_intake_number.sql
--
-- PROBLEM SOLVED:
-- The operator scanner's success screen surfaced intakes.id (a raw uuid) to
-- operators as "the intake ID." Not human-readable, not something an operator
-- can read back over a radio or write on a paper tag.
--
-- DECISION: add a generated, human-readable document number (WT-INT-000001,
-- WT-INT-000002, ...) alongside the existing uuid primary key. The uuid stays
-- canonical for joins/URLs/API calls; intake_number is display-only.
--
-- Built as a reusable generator (public.next_doc_number(seq_name, prefix))
-- rather than a one-off, so the same pattern can be repeated later for other
-- entities (e.g. WT-PAS- for passports, WT-RUN- for dispatch runs, WT-TRX-
-- for transactions) by creating another sequence + column + default -- no
-- new function needed.
--
-- NOTE ON EXISTING CONVENTION: manifests already has a human-readable code
-- (manifest_id), but its live trigger (set_manifest_code(), from
-- 20260718090000_fix_manifest_identity.sql) generates "MFT-000123", not
-- "WT-MAN-000123" -- only one legacy/seed row uses the WT- style. This
-- migration does not touch manifests; if manifests should be brought onto
-- the WT- convention to match, that's a separate follow-up.

-- 1. Generic generator: SECURITY DEFINER so callers only need EXECUTE on the
--    function, not USAGE on the underlying sequence directly -- mirrors the
--    is_operator() pattern already used in this project.
CREATE OR REPLACE FUNCTION public.next_doc_number(seq_name text, prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN prefix || '-' || lpad(nextval(seq_name::regclass)::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_doc_number(text, text) TO authenticated;

-- 2. Per-entity sequence + column for intakes.
CREATE SEQUENCE IF NOT EXISTS public.intakes_number_seq;
GRANT USAGE ON SEQUENCE public.intakes_number_seq TO authenticated;

ALTER TABLE public.intakes ADD COLUMN IF NOT EXISTS intake_number text;
ALTER TABLE public.intakes
  ALTER COLUMN intake_number SET DEFAULT public.next_doc_number('public.intakes_number_seq', 'WT-INT');

-- 3. Backfill existing rows in creation order, so numbering reflects the
--    real intake history rather than being assigned arbitrarily.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.intakes WHERE intake_number IS NULL ORDER BY created_at ASC
  LOOP
    UPDATE public.intakes
    SET intake_number = public.next_doc_number('public.intakes_number_seq', 'WT-INT')
    WHERE id = r.id;
  END LOOP;
END $$;

-- 4. Now that every row has one, enforce it going forward.
ALTER TABLE public.intakes ALTER COLUMN intake_number SET NOT NULL;
ALTER TABLE public.intakes ADD CONSTRAINT intakes_intake_number_key UNIQUE (intake_number);

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   ALTER TABLE public.intakes DROP CONSTRAINT IF EXISTS intakes_intake_number_key;
--   ALTER TABLE public.intakes ALTER COLUMN intake_number DROP NOT NULL;
--   ALTER TABLE public.intakes ALTER COLUMN intake_number DROP DEFAULT;
--   ALTER TABLE public.intakes DROP COLUMN IF EXISTS intake_number;
--   DROP SEQUENCE IF EXISTS public.intakes_number_seq;
-- Leave public.next_doc_number() in place even on rollback -- it's inert
-- with no columns depending on it, and future prefixes can still use it.
-- ---------------------------------------------------------------------
