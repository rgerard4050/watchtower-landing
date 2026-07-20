-- 20260719100100_add_operator_role_and_lock_writes.sql
--
-- PROBLEM SOLVED:
-- Every write on the manifest/dispatch/recovery/ledger pipeline (and on
-- tickets/residents/redemptions from the operator terminal) was reachable by
-- any unauthenticated visitor, because RLS on those tables used
-- USING/WITH CHECK (true) for anon+authenticated, or in a few cases (tickets,
-- residents, transactions) a wide-open ALL policy for role "public". Neither
-- operations/*.html, terminal.html, intake.html, nor operator.html had any
-- real access gate -- terminal.html's "operator code" was a client-side
-- localStorage flag with a hardcoded passcode, trivially bypassable and with
-- zero effect on actual database authorization.
--
-- DECISION: introduce a real operator identity backed by Supabase Auth (the
-- app's existing auth model -- already used correctly by the business
-- portal in dashboard.html) via a minimal allowlist table, and gate every
-- write on it. Reads that legitimate PUBLIC pages depend on are left open:
--   - root dispatch.html (live pickup map): SELECT on manifests, dispatch_runs,
--     dispatch_stops
--   - resident.html (self-lookup by email) + index.html (signup, public
--     counter): SELECT + INSERT on residents
-- This migration only restricts WRITES; it does not add any new read
-- restriction beyond what the app already required.

-- 1. Operator identity: allowlist keyed to auth.users, nothing else.
CREATE TABLE public.operators (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;

-- A signed-in user may check their own operator status (used by the
-- client-side auth guard). No INSERT/UPDATE/DELETE policy exists for anon or
-- authenticated -- only the project owner (service_role, via the Supabase
-- dashboard or CLI) can promote a signed-up user into this table. Signing up
-- gets a Supabase Auth account, not operator access -- that's the actual
-- security boundary.
CREATE POLICY "operators can view own record" ON public.operators
  FOR SELECT TO authenticated USING (auth.uid() = id);

-- SECURITY DEFINER so this can be used inside other tables' RLS policies
-- without those policies being subject to *operators*' own RLS on the way in.
CREATE OR REPLACE FUNCTION public.is_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.operators WHERE id = auth.uid());
$$;

-- 2. manifests -- keep public SELECT (root dispatch.html live map depends on it).
DROP POLICY IF EXISTS "anon insert manifests" ON public.manifests;
DROP POLICY IF EXISTS "anon update manifests" ON public.manifests;
CREATE POLICY "operators insert manifests" ON public.manifests
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY "operators update manifests" ON public.manifests
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());

-- 3. manifest_decisions -- no public reader anywhere, lock down fully.
DROP POLICY IF EXISTS "anon select manifest_decisions" ON public.manifest_decisions;
DROP POLICY IF EXISTS "anon insert manifest_decisions" ON public.manifest_decisions;
CREATE POLICY "operators select manifest_decisions" ON public.manifest_decisions
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY "operators insert manifest_decisions" ON public.manifest_decisions
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());

-- 4. manifest_events -- same as manifest_decisions.
DROP POLICY IF EXISTS "anon select manifest_events" ON public.manifest_events;
DROP POLICY IF EXISTS "anon insert manifest_events" ON public.manifest_events;
CREATE POLICY "operators select manifest_events" ON public.manifest_events
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY "operators insert manifest_events" ON public.manifest_events
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());

-- 5. passports -- no public reader.
DROP POLICY IF EXISTS "anon select passports" ON public.passports;
DROP POLICY IF EXISTS "anon insert passports" ON public.passports;
DROP POLICY IF EXISTS "anon update passports" ON public.passports;
CREATE POLICY "operators select passports" ON public.passports FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY "operators insert passports" ON public.passports FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY "operators update passports" ON public.passports FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());

-- 6. materials_recovered -- no public reader.
DROP POLICY IF EXISTS "anon select materials_recovered" ON public.materials_recovered;
DROP POLICY IF EXISTS "anon insert materials_recovered" ON public.materials_recovered;
DROP POLICY IF EXISTS "anon update materials_recovered" ON public.materials_recovered;
CREATE POLICY "operators select materials_recovered" ON public.materials_recovered FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY "operators insert materials_recovered" ON public.materials_recovered FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY "operators update materials_recovered" ON public.materials_recovered FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());

-- 7. dispatch_runs -- keep public SELECT (root dispatch.html live map).
DROP POLICY IF EXISTS "Allow dispatch stops insert" ON public.dispatch_runs;
DROP POLICY IF EXISTS "Allow dispatch stops update" ON public.dispatch_runs;
CREATE POLICY "operators insert dispatch_runs" ON public.dispatch_runs FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY "operators update dispatch_runs" ON public.dispatch_runs FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());

-- 8. dispatch_stops -- keep public SELECT (root dispatch.html live map).
DROP POLICY IF EXISTS "Allow dispatch stops insert" ON public.dispatch_stops;
DROP POLICY IF EXISTS "allow for update" ON public.dispatch_stops;
CREATE POLICY "operators insert dispatch_stops" ON public.dispatch_stops FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY "operators update dispatch_stops" ON public.dispatch_stops FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());

-- 9. intakes -- intake.html/operator.html are operator tools, no public consumer.
DROP POLICY IF EXISTS "operator can record intake" ON public.intakes;
DROP POLICY IF EXISTS "anon select intakes" ON public.intakes;
CREATE POLICY "operators select intakes" ON public.intakes FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY "operators insert intakes" ON public.intakes FOR INSERT TO authenticated WITH CHECK (public.is_operator());

-- 10. transactions -- no public reader anywhere, was fully open to anon before.
DROP POLICY IF EXISTS "open transactions" ON public.transactions;
CREATE POLICY "operators all transactions" ON public.transactions
  FOR ALL TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());

-- 11. tickets -- only terminal.html (operator terminal) ever touches this table.
DROP POLICY IF EXISTS "allow all tickets" ON public.tickets;
CREATE POLICY "operators all tickets" ON public.tickets
  FOR ALL TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());

-- 12. residents -- split: public signup (index.html) + public lookup
-- (resident.html) stay open; wtwr_balance UPDATE (only ever done by
-- terminal.html) becomes operator-only. The old "allow all residents"
-- ALL/true policy also covered DELETE for anon, which nothing in the app
-- uses -- removing that is pure hardening, not a behavior change.
DROP POLICY IF EXISTS "allow all residents" ON public.residents;
DROP POLICY IF EXISTS "allow read residents" ON public.residents;
CREATE POLICY "public select residents" ON public.residents FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert residents" ON public.residents FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "operators update residents" ON public.residents FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());

-- 13. redemptions -- add the INSERT policy that never existed (processRedeem()
-- in terminal.html has been silently failing with 42501 on every attempt
-- since it was written). Operator-only, since only terminal.html ever calls it.
CREATE POLICY "operators insert redemptions" ON public.redemptions
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY: restore the pre-migration policies (see
-- 20260718090100_fix_rls_policies.sql and prior migration history for the
-- original anon-open policy definitions), then:
--   DROP FUNCTION IF EXISTS public.is_operator();
--   DROP TABLE IF EXISTS public.operators;
-- ---------------------------------------------------------------------
