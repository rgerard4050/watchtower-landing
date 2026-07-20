-- 20260720200000_manifest_passport_link.sql
--
-- PROBLEM SOLVED:
-- A manifest is meant to be a "lot" containing many passports, but no
-- column anywhere expresses that relationship. manifests.passport_id
-- (added earlier this session) is the reverse case -- one manifest
-- optionally recording the single passport that directly spawned it via
-- the operator-scanner "CREATE REVIEW MANIFEST" quick action. That's a
-- different, narrower relationship and is left untouched.
--
-- DECISION: add passports.manifest_id (many passports -> one manifest,
-- the actual "lot" relationship). Nullable -- a passport not yet assigned
-- to any manifest is a normal, expected state, not an error.
--
-- Reviewed before writing: passports has one existing trigger
-- (trg_require_acquired_intake, BEFORE INSERT only) -- unaffected, since
-- assigning manifest_id happens via UPDATE, not INSERT. RLS: operators
-- already have UPDATE on passports (added when lifecycle_status/
-- CONFIRM ACQUISITION shipped) and SELECT on manifests (open policy,
-- root dispatch.html's live map depends on it) -- no new policies needed.

ALTER TABLE public.passports
  ADD COLUMN IF NOT EXISTS manifest_id bigint REFERENCES public.manifests(id);

CREATE INDEX IF NOT EXISTS idx_passports_manifest_id ON public.passports(manifest_id);

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   DROP INDEX IF EXISTS idx_passports_manifest_id;
--   ALTER TABLE public.passports DROP COLUMN IF EXISTS manifest_id;
-- ---------------------------------------------------------------------
