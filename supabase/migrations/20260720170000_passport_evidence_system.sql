-- 20260720170000_passport_evidence_system.sql
-- Material Passport roadmap, Phase 2 only (evidence). Not building public
-- verification, QR codes, marketplace, or buyer access -- Phase 6.
--
-- PROBLEM SOLVED:
-- passports.photo_url is a single free-text field: no type, no timestamp,
-- no uploader, no verification state, and (confirmed live) empty string on
-- every real row today -- one photo cannot prove anything about a device
-- that passes through multiple recovery stages.
--
-- Reviewed before writing: the intake-evidence bucket + its RLS policies
-- (private, operator-only insert/select -- same shape reused here for
-- passport-evidence), the intake_events table (same actor/timestamp
-- pattern), and materials_recovered.passport_id, which already names its
-- FK column `passport_id` as a bigint referencing passports.id -- distinct
-- from passports.passport_id (the WT-MAT text code). Reusing that same
-- naming precedent here rather than introducing a new convention.

-- 1. Private storage, mirroring intake-evidence exactly.
INSERT INTO storage.buckets (id, name, public)
VALUES ('passport-evidence', 'passport-evidence', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "operators upload passport evidence" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'passport-evidence' AND public.is_operator());

CREATE POLICY "operators read passport evidence" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'passport-evidence' AND public.is_operator());

-- 2. Evidence table. photo_path stores the private object path (mirrors
--    intakes.photo_path), never a public URL.
CREATE TABLE public.passport_evidence (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  passport_id bigint NOT NULL REFERENCES public.passports(id),
  evidence_type text NOT NULL CHECK (evidence_type IN (
    'INITIAL_PHOTO', 'SERIAL_LABEL', 'DAMAGE_PHOTO',
    'WEIGHT_PHOTO', 'PROCESSING_PHOTO', 'FINAL_OUTPUT'
  )),
  photo_path text NOT NULL,
  uploaded_by text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  verification_status text NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_status IN ('UNVERIFIED', 'VERIFIED', 'REJECTED'))
);

CREATE INDEX idx_passport_evidence_passport_id ON public.passport_evidence(passport_id);

ALTER TABLE public.passport_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operators select passport_evidence" ON public.passport_evidence
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY "operators insert passport_evidence" ON public.passport_evidence
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY "operators update passport_evidence" ON public.passport_evidence
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
-- UPDATE is needed for verification_status to ever move off UNVERIFIED --
-- a field with no write path would be inert from day one.

-- NOTE: no backfill from passports.photo_url. Every real photo_url value
-- today is either '' or an intake-evidence bucket path copied forward from
-- intake.photo_path -- converting either into a passport_evidence row would
-- require fabricating an evidence_type and uploaded_by that isn't actually
-- known. Left alone rather than guessed, same reasoning already applied to
-- the created_by backfill in Phase 1.

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   DROP TABLE IF EXISTS public.passport_evidence;
--   DROP POLICY IF EXISTS "operators read passport evidence" ON storage.objects;
--   DROP POLICY IF EXISTS "operators upload passport evidence" ON storage.objects;
--   -- bucket itself intentionally left in place on rollback (may hold data)
-- ---------------------------------------------------------------------
