-- 20260718090100_fix_rls_policies.sql
--
-- PROBLEM SOLVED:
-- manifests, manifest_decisions, manifest_events, passports, materials_recovered
-- all have RLS enabled with zero policies -> deny-all for anon/authenticated.
-- intakes has an INSERT policy but no SELECT policy.
-- The frontend (operations/ops.js, intake.html, operator.html) only ever
-- connects as anon/authenticated via the publishable key -- no other role
-- exists in this application today.
--
-- SCOPE: this migration only ADDS policies. It does not remove, replace, or
-- narrow anything that currently exists (e.g. intakes' existing INSERT policy
-- is left untouched). No DELETE policy is added anywhere, per instruction --
-- nothing in the audited frontend ever deletes a row from these tables.

-- manifests: INSERT, SELECT, UPDATE
CREATE POLICY "anon insert manifests" ON public.manifests
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon select manifests" ON public.manifests
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon update manifests" ON public.manifests
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- manifest_decisions: INSERT, SELECT
CREATE POLICY "anon insert manifest_decisions" ON public.manifest_decisions
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon select manifest_decisions" ON public.manifest_decisions
  FOR SELECT TO anon, authenticated USING (true);

-- manifest_events: INSERT, SELECT
CREATE POLICY "anon insert manifest_events" ON public.manifest_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon select manifest_events" ON public.manifest_events
  FOR SELECT TO anon, authenticated USING (true);

-- passports: INSERT, SELECT, UPDATE
CREATE POLICY "anon insert passports" ON public.passports
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon select passports" ON public.passports
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon update passports" ON public.passports
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- materials_recovered: INSERT, SELECT, UPDATE
CREATE POLICY "anon insert materials_recovered" ON public.materials_recovered
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon select materials_recovered" ON public.materials_recovered
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon update materials_recovered" ON public.materials_recovered
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- intakes: SELECT only (INSERT policy 'operator can record intake' already exists)
CREATE POLICY "anon select intakes" ON public.intakes
  FOR SELECT TO anon, authenticated USING (true);

-- ---------------------------------------------------------------------
-- RISKS:
-- - These policies are intentionally permissive (using/with check: true),
--   matching the pattern already live on dispatch_runs/dispatch_stops in
--   this project. This is the "get the terminal working" pass, not the
--   final security posture -- Phase 5 (auth-based, per-persona policies)
--   is expected to replace these.
-- - No conflicting policy names exist today on any of these six tables
--   (confirmed via a fresh pg_policies read immediately before this file
--   was written), so none of these CREATE POLICY statements collide with
--   anything already in place.
--
-- ROLLBACK STRATEGY:
--   DROP POLICY "anon insert manifests" ON public.manifests;
--   DROP POLICY "anon select manifests" ON public.manifests;
--   DROP POLICY "anon update manifests" ON public.manifests;
--   DROP POLICY "anon insert manifest_decisions" ON public.manifest_decisions;
--   DROP POLICY "anon select manifest_decisions" ON public.manifest_decisions;
--   DROP POLICY "anon insert manifest_events" ON public.manifest_events;
--   DROP POLICY "anon select manifest_events" ON public.manifest_events;
--   DROP POLICY "anon insert passports" ON public.passports;
--   DROP POLICY "anon select passports" ON public.passports;
--   DROP POLICY "anon update passports" ON public.passports;
--   DROP POLICY "anon insert materials_recovered" ON public.materials_recovered;
--   DROP POLICY "anon select materials_recovered" ON public.materials_recovered;
--   DROP POLICY "anon update materials_recovered" ON public.materials_recovered;
--   DROP POLICY "anon select intakes" ON public.intakes;
-- Dropping these restores the exact deny-all state confirmed in Phase 0.
-- ---------------------------------------------------------------------
