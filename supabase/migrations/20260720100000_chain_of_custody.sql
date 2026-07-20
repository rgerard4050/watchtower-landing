-- 20260720100000_chain_of_custody.sql
--
-- PROBLEM SOLVED:
-- intake -> passport -> manifest was a one-way UI handoff (URL query params
-- only, from 20260720090000's passport prefill work). Nothing persisted the
-- link once a passport or manifest row was actually written, so there was no
-- way to answer "which intake did this passport come from" from the database
-- itself. Also, intakes.confidence held the AI's HIGH/MEDIUM/LOW string with
-- no record of which model/prompt produced it.
--
-- DECISION: add nullable provenance/lineage columns only -- no table is
-- dropped or renamed, no existing column changes type or becomes NOT NULL.
-- A passport or manifest created with no intake behind it (which is a real,
-- supported flow today) just leaves these columns null.
--
-- NAMING NOTE: manifests already has an `ai_confidence` numeric column (a
-- manifest-level prioritization score, unrelated to intake grading). To
-- avoid colliding two different concepts under one name, the copied intake
-- confidence value uses `intake_confidence` (text, matching intakes.confidence's
-- HIGH/MEDIUM/LOW scale) wherever it appears.
--
-- SCOPE: this migration covers intake -> passport -> manifest only, per the
-- explicit requirements list it was written against. dispatch_runs,
-- dispatch_stops, materials_recovered, transactions, businesses/redemptions
-- are NOT touched here -- extending the chain that far is a separate,
-- larger follow-up (dispatch_stops.manifest_id in particular already has a
-- pre-existing FK-target mismatch noted in docs/watchtower_database_audit.md
-- that should be resolved before adding more lineage columns on top of it).

-- 1. intakes: provenance for the AI call that produced the grade.
--    ai_confidence is intentionally NOT added as a new column -- the
--    existing `confidence` column already holds this value (HIGH/MEDIUM/LOW
--    string from the model). Duplicating it under a second name would just
--    create a sync hazard.
ALTER TABLE public.intakes
  ADD COLUMN IF NOT EXISTS ai_provider text,
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS ai_prompt_version text,
  ADD COLUMN IF NOT EXISTS ai_timestamp timestamptz;

-- 2. passports: everything required to reconstruct "which intake, by whom,
--    graded how" without a join, plus the FK for integrity.
ALTER TABLE public.passports
  ADD COLUMN IF NOT EXISTS intake_id uuid REFERENCES public.intakes(id),
  ADD COLUMN IF NOT EXISTS intake_number text,
  ADD COLUMN IF NOT EXISTS intake_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS intake_operator text,
  ADD COLUMN IF NOT EXISTS intake_confidence text,
  ADD COLUMN IF NOT EXISTS intake_material text,
  ADD COLUMN IF NOT EXISTS intake_grade text;

CREATE INDEX IF NOT EXISTS idx_passports_intake_id ON public.passports(intake_id);

-- 3. manifests: intake lineage + optional passport lineage (a manifest can
--    be built straight from an intake with no passport yet, hence nullable).
ALTER TABLE public.manifests
  ADD COLUMN IF NOT EXISTS intake_id uuid REFERENCES public.intakes(id),
  ADD COLUMN IF NOT EXISTS intake_number text,
  ADD COLUMN IF NOT EXISTS passport_id bigint REFERENCES public.passports(id);

CREATE INDEX IF NOT EXISTS idx_manifests_intake_id ON public.manifests(intake_id);
CREATE INDEX IF NOT EXISTS idx_manifests_passport_id ON public.manifests(passport_id);

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   ALTER TABLE public.manifests DROP COLUMN IF EXISTS intake_id, DROP COLUMN IF EXISTS intake_number, DROP COLUMN IF EXISTS passport_id;
--   ALTER TABLE public.passports DROP COLUMN IF EXISTS intake_id, DROP COLUMN IF EXISTS intake_number, DROP COLUMN IF EXISTS intake_created_at, DROP COLUMN IF EXISTS intake_operator, DROP COLUMN IF EXISTS intake_confidence, DROP COLUMN IF EXISTS intake_material, DROP COLUMN IF EXISTS intake_grade;
--   ALTER TABLE public.intakes DROP COLUMN IF EXISTS ai_provider, DROP COLUMN IF EXISTS ai_model, DROP COLUMN IF EXISTS ai_prompt_version, DROP COLUMN IF EXISTS ai_timestamp;
-- All additive/nullable -- safe to drop in any order, no data loss beyond
-- the lineage values themselves.
-- ---------------------------------------------------------------------
