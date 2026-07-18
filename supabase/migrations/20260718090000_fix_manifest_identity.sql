-- 20260718090000_fix_manifest_identity.sql
-- (copied from operations/migrations/006_fix_manifest_identity.sql, unchanged)
--
-- PROBLEM SOLVED:
-- manifests has two identity columns: id (bigint PK, autoincrement) and
-- manifest_id (text, unique, nullable). The frontend is inconsistent about
-- which one it treats as canonical: manifest_decisions/manifest_events key
-- off id, dispatch_stops keys off manifest_id -- which is never populated
-- by any insert path in the codebase (createManifest in ops.js never sets it).
--
-- DECISION: manifests.id (bigint) is the ONLY canonical key used in foreign
-- keys, everywhere. manifest_id becomes an auto-generated, always-populated
-- human-readable display code (e.g. MFT-000123) -- cosmetic only, never
-- joined on. No existing data is deleted.
--
-- VERIFIED during Phase 1 prep: the one existing manifests row (id=1) already
-- has a non-null manifest_id ('WT-MAN-000001', apparently seeded/manual data,
-- not something the audited frontend code path ever produces). The backfill
-- below only touches rows WHERE manifest_id IS NULL, so this existing value
-- is left untouched -- no conflict.

-- 1. Backfill manifest_id for any existing rows where it's null.
UPDATE public.manifests
SET manifest_id = 'MFT-' || lpad(id::text, 6, '0')
WHERE manifest_id IS NULL;

-- 2. Auto-generate manifest_id going forward, for any insert that omits it.
--    Safe because a BEFORE INSERT trigger runs after the bigint identity
--    column's DEFAULT nextval() has already been resolved, so NEW.id is
--    available inside the trigger.
CREATE OR REPLACE FUNCTION public.set_manifest_code()
RETURNS trigger AS $$
BEGIN
  IF NEW.manifest_id IS NULL THEN
    NEW.manifest_id := 'MFT-' || lpad(NEW.id::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_manifest_code ON public.manifests;
CREATE TRIGGER trg_set_manifest_code
  BEFORE INSERT ON public.manifests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_manifest_code();

-- 3. Now that manifest_id is always populated, enforce it.
ALTER TABLE public.manifests
  ALTER COLUMN manifest_id SET NOT NULL;

-- ---------------------------------------------------------------------
-- RISKS:
-- - Trigger-based code generation is new logic; test with a manual insert
--   after applying.
-- - Any code path that explicitly supplies its own manifest_id is left
--   untouched (the trigger only fires when manifest_id IS NULL).
--
-- ROLLBACK STRATEGY:
--   ALTER TABLE public.manifests ALTER COLUMN manifest_id DROP NOT NULL;
--   DROP TRIGGER IF EXISTS trg_set_manifest_code ON public.manifests;
--   DROP FUNCTION IF EXISTS public.set_manifest_code();
-- Backfilled manifest_id values from step 1 are left in place on rollback --
-- this is non-destructive and does not need to be undone.
-- ---------------------------------------------------------------------
