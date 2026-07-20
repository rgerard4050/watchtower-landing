-- 20260720150000_business_supply_partners.sql
--
-- PROBLEM SOLVED:
-- No entity exists for "a company that supplies material to Watchtower."
-- intakes.owner_ref is a free-text field, never populated by any UI, and
-- businesses is shaped entirely for the WTWR-redemption/buyer-tier concept
-- (tier, wtwr_redeemed, multiplier) -- wrong shape for a supply partner, and
-- explicitly not to be confused with one per this session's constraints.
--
-- DECISION (per explicit direction this round): do not create a separate
-- acquisition_partners table -- extend businesses so one company has one
-- identity, and link intakes to it. owner_ref is left untouched.
--
-- BLOCKER FOUND DURING FRESH INSPECTION (not in any prior report):
-- businesses.tier is NOT NULL with CHECK IN ('Signal','Enforcer','Sentinel').
-- A supply partner (e.g. an appliance repair shop) is not a WTWR tier and
-- has no reason to hold one. Every INSERT of a supplier-only business would
-- otherwise be forced to fabricate a meaningless tier value just to satisfy
-- this constraint. Fix: DROP NOT NULL. The CHECK constraint is left in
-- place -- any row that DOES set a tier is still restricted to the three
-- valid values; only rows that omit tier entirely are now permitted.
--
-- SECOND BLOCKER FOUND: businesses has zero operator RLS policies -- only
-- "auth.uid() = auth_id" self-service SELECT/INSERT for the business owner.
-- An operator session could not read or write a single business row.
-- Without this, Task 2/5 are unusable by the actual operator tool. Adding
-- operator SELECT/INSERT/UPDATE policies, additive alongside (not replacing)
-- the existing self-service policies.

-- 1. Loosen the tier constraint for supplier-only rows.
ALTER TABLE public.businesses ALTER COLUMN tier DROP NOT NULL;

-- 2. Supply-partner fields (Task 2). All nullable except is_supplier/verified,
--    which need a safe default so existing rows aren't left ambiguous.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS lat numeric,
  ADD COLUMN IF NOT EXISTS lng numeric,
  ADD COLUMN IF NOT EXISTS is_supplier boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS material_types text[],
  ADD COLUMN IF NOT EXISTS plan text,
  ADD COLUMN IF NOT EXISTS monthly_rate numeric,
  ADD COLUMN IF NOT EXISTS billing_status text,
  ADD COLUMN IF NOT EXISTS pickup_day text,
  ADD COLUMN IF NOT EXISTS pickup_cadence text,
  ADD COLUMN IF NOT EXISTS next_pickup_at timestamptz,
  ADD COLUMN IF NOT EXISTS relationship_status text,
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text;

-- No Stripe/billing integration -- billing_status/monthly_rate/plan are
-- plain columns for manual tracking, structure only, per instruction.

CREATE POLICY "operators select businesses" ON public.businesses
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY "operators insert businesses" ON public.businesses
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY "operators update businesses" ON public.businesses
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());

-- 3. Task 1: connect intakes to a source business. owner_ref untouched.
ALTER TABLE public.intakes
  ADD COLUMN IF NOT EXISTS source_business_id uuid REFERENCES public.businesses(id);

CREATE INDEX IF NOT EXISTS idx_intakes_source_business_id ON public.intakes(source_business_id);

-- 4. Task 3: prospect/relationship tracking -- replaces the spreadsheet.
CREATE TABLE public.business_touches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  channel text,
  outcome text,
  notes text,
  next_touch_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_business_touches_business_id ON public.business_touches(business_id);

ALTER TABLE public.business_touches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operators select business_touches" ON public.business_touches
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY "operators insert business_touches" ON public.business_touches
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());

-- 5. Task 4: recovery reporting view. No stored/materialized data -- a plain
--    view inherits RLS from intakes/businesses for the querying role, so no
--    separate grant is needed beyond the operator policies added above.
CREATE VIEW public.business_recovery_report AS
SELECT
  b.id AS business_id,
  b.business_name,
  date_trunc('month', i.created_at) AS month,
  count(i.id) AS material_count,
  sum(i.weight_lb) AS total_weight_lb,
  sum(i.gross_value) AS recovered_estimated_value,
  array_agg(DISTINCT i.material) FILTER (WHERE i.material IS NOT NULL) AS material_categories
FROM public.intakes i
JOIN public.businesses b ON b.id = i.source_business_id
GROUP BY b.id, b.business_name, date_trunc('month', i.created_at);

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   DROP VIEW IF EXISTS public.business_recovery_report;
--   DROP TABLE IF EXISTS public.business_touches;
--   DROP INDEX IF EXISTS idx_intakes_source_business_id;
--   ALTER TABLE public.intakes DROP COLUMN IF EXISTS source_business_id;
--   DROP POLICY IF EXISTS "operators update businesses" ON public.businesses;
--   DROP POLICY IF EXISTS "operators insert businesses" ON public.businesses;
--   DROP POLICY IF EXISTS "operators select businesses" ON public.businesses;
--   ALTER TABLE public.businesses DROP COLUMN IF EXISTS contact_name, DROP COLUMN IF EXISTS phone,
--     DROP COLUMN IF EXISTS email, DROP COLUMN IF EXISTS address, DROP COLUMN IF EXISTS lat,
--     DROP COLUMN IF EXISTS lng, DROP COLUMN IF EXISTS is_supplier, DROP COLUMN IF EXISTS material_types,
--     DROP COLUMN IF EXISTS plan, DROP COLUMN IF EXISTS monthly_rate, DROP COLUMN IF EXISTS billing_status,
--     DROP COLUMN IF EXISTS pickup_day, DROP COLUMN IF EXISTS pickup_cadence, DROP COLUMN IF EXISTS next_pickup_at,
--     DROP COLUMN IF EXISTS relationship_status, DROP COLUMN IF EXISTS verified, DROP COLUMN IF EXISTS notes;
--   -- tier NOT NULL is intentionally not restored on rollback: any supplier
--   -- rows created with tier NULL would violate it immediately.
-- ---------------------------------------------------------------------
