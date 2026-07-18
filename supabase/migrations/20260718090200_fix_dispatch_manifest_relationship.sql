-- 20260718090200_fix_dispatch_manifest_relationship.sql
--
-- PROBLEM SOLVED:
-- dispatch_stops.manifest_id (text) has its FK pointed at manifests.manifest_id
-- (the display-code column), not manifests.id (the canonical bigint key
-- established in 20260718090000_fix_manifest_identity.sql). This is what
-- breaks route creation for any manifest whose manifest_id doesn't happen to
-- match what dispatch_stops was given.
--
-- IMPORTANT CORRECTION FOUND DURING PHASE 1 PREP:
-- The original audit assumed manifest_id was always NULL and that the
-- existing dispatch_stops row held a stringified bigint id. A fresh read
-- immediately before writing this file shows that is NOT the case:
--   manifests:       id = 1, manifest_id = 'WT-MAN-000001'
--   dispatch_stops:  manifest_id = 'WT-MAN-000001' (correctly matches, under
--                    the CURRENT/old FK to manifests.manifest_id)
-- 'WT-MAN-000001' is not a valid bigint literal, so a blind
-- `ALTER COLUMN manifest_id TYPE bigint USING manifest_id::bigint` would
-- FAIL outright on this row. Instead, this migration looks up the correct
-- manifests.id for each existing dispatch_stops row via its current
-- manifest_id value and carries that forward -- no data is lost or guessed.

-- 1. Add a new bigint column alongside the old text one.
ALTER TABLE public.dispatch_stops
  ADD COLUMN manifest_id_new bigint;

-- 2. Backfill it by resolving the existing text manifest_id against
--    manifests.manifest_id, carrying over the corresponding manifests.id.
UPDATE public.dispatch_stops ds
SET manifest_id_new = m.id
FROM public.manifests m
WHERE ds.manifest_id = m.manifest_id;

-- 3. Safety check: abort if any row failed to resolve (would indicate an
--    orphaned dispatch_stops row referencing a manifest_id that no longer
--    exists on public.manifests -- confirmed there are none as of this
--    writing, but this guards future runs against silently dropping a
--    reference).
DO $$
DECLARE
  unresolved_count integer;
BEGIN
  SELECT count(*) INTO unresolved_count
  FROM public.dispatch_stops
  WHERE manifest_id IS NOT NULL AND manifest_id_new IS NULL;

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION
      '% dispatch_stops row(s) reference a manifest_id with no matching manifests.manifest_id -- resolve manually before re-running this migration',
      unresolved_count;
  END IF;
END $$;

-- 4. Swap the columns: drop the old FK and text column, promote the new one.
ALTER TABLE public.dispatch_stops
  DROP CONSTRAINT IF EXISTS dispatch_stops_manifest_id_fkey;

ALTER TABLE public.dispatch_stops
  DROP COLUMN manifest_id;

ALTER TABLE public.dispatch_stops
  RENAME COLUMN manifest_id_new TO manifest_id;

-- 5. Re-point the FK at the canonical manifests.id.
ALTER TABLE public.dispatch_stops
  ADD CONSTRAINT dispatch_stops_manifest_id_fkey
  FOREIGN KEY (manifest_id) REFERENCES public.manifests(id);

-- ---------------------------------------------------------------------
-- RISKS:
-- - This migration is written against the specific data verified above
--   (1 existing dispatch_stops row, cleanly resolvable). If more rows have
--   been added since this file was written, re-run the same lookup query
--   used in Phase 0/1 prep (`SELECT manifest_id FROM dispatch_stops`)
--   before applying, to confirm every value still resolves.
-- - operations/dispatch.js (lines 62, 74, 244) and operations/driver.js
--   (lines 77, 151) still read/write this column expecting the OLD
--   semantics (manifests.manifest_id-shaped values, or the
--   `manifest.manifest_id || manifest.id` fallback). Those frontend files
--   need the corresponding code fix (tracked separately, not part of this
--   SQL-only file) before or immediately after this migration is applied,
--   or Dispatch will break in a new way even though the FK itself is fixed.
--
-- ROLLBACK STRATEGY:
--   ALTER TABLE public.dispatch_stops ADD COLUMN manifest_id_old text;
--   UPDATE public.dispatch_stops ds SET manifest_id_old = m.manifest_id
--     FROM public.manifests m WHERE ds.manifest_id = m.id;
--   ALTER TABLE public.dispatch_stops DROP CONSTRAINT IF EXISTS dispatch_stops_manifest_id_fkey;
--   ALTER TABLE public.dispatch_stops DROP COLUMN manifest_id;
--   ALTER TABLE public.dispatch_stops RENAME COLUMN manifest_id_old TO manifest_id;
--   ALTER TABLE public.dispatch_stops
--     ADD CONSTRAINT dispatch_stops_manifest_id_fkey
--     FOREIGN KEY (manifest_id) REFERENCES public.manifests(manifest_id);
-- ---------------------------------------------------------------------
