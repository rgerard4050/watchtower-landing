-- 20260720120000_material_lifecycle.sql
--
-- PROBLEM SOLVED:
-- Every intake was implicitly treated as Watchtower-owned inventory the
-- moment it was accepted -- GENERATE PASSPORT was available immediately
-- after ACCEPT GRADE, with nothing in the data model distinguishing
-- "we've confirmed what this is" from "we actually own it now."
--
-- DECISION: introduce an explicit material lifecycle on intakes with three
-- states relevant at this stage (VERIFIED / AVAILABLE / ACQUIRED -- MATCHED/
-- CONTRACTED/COMPLETED are marketplace states with no code path yet and are
-- intentionally not in the CHECK constraint; add them when that code exists).
-- ACCEPT GRADE now only reaches VERIFIED. A separate operator action moves
-- an intake to ACQUIRED, and passport/manifest creation from an intake is
-- blocked at the database level (not just the UI) until that happens.
--
-- Three ownership buckets, mapped to existing tables -- no new tables:
--   Network-known materials  -> scans + intakes, any lifecycle_status
--   Seller-owned materials   -> intakes with owner_ref set, status VERIFIED/AVAILABLE
--   Watchtower-owned inventory -> passports (status ACQUIRED+ by construction)

-- 1. resident_ref was added in an earlier phase, never wired into any code
--    path (verified: no references outside docs). Renaming is safe.
ALTER TABLE public.intakes RENAME COLUMN resident_ref TO owner_ref;

ALTER TABLE public.intakes
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'VERIFIED',
  ADD COLUMN IF NOT EXISTS acquired_at timestamptz;

ALTER TABLE public.intakes
  ADD CONSTRAINT intakes_lifecycle_status_check
  CHECK (lifecycle_status IN ('VERIFIED', 'AVAILABLE', 'ACQUIRED'));

-- 2. Operators could INSERT/SELECT intakes but never UPDATE them (no policy
--    existed) -- needed now so an operator can move VERIFIED -> ACQUIRED.
CREATE POLICY "operators update intakes" ON public.intakes
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());

-- 3. Enforce the gate server-side: a passport or manifest linked to an
--    intake (intake_id IS NOT NULL) can only be created once that intake is
--    ACQUIRED. Records with no intake_id (the existing standalone-creation
--    path) are untouched -- this only fires when the new lineage column is
--    actually used.
CREATE OR REPLACE FUNCTION public.require_acquired_intake()
RETURNS trigger AS $$
BEGIN
  IF NEW.intake_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.intakes WHERE id = NEW.intake_id AND lifecycle_status = 'ACQUIRED'
    ) THEN
      RAISE EXCEPTION 'intake % is not ACQUIRED yet -- confirm acquisition before creating % records from it', NEW.intake_id, TG_TABLE_NAME;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_require_acquired_intake ON public.passports;
CREATE TRIGGER trg_require_acquired_intake
  BEFORE INSERT ON public.passports
  FOR EACH ROW
  EXECUTE FUNCTION public.require_acquired_intake();

DROP TRIGGER IF EXISTS trg_require_acquired_intake ON public.manifests;
CREATE TRIGGER trg_require_acquired_intake
  BEFORE INSERT ON public.manifests
  FOR EACH ROW
  EXECUTE FUNCTION public.require_acquired_intake();

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   DROP TRIGGER IF EXISTS trg_require_acquired_intake ON public.manifests;
--   DROP TRIGGER IF EXISTS trg_require_acquired_intake ON public.passports;
--   DROP FUNCTION IF EXISTS public.require_acquired_intake();
--   DROP POLICY IF EXISTS "operators update intakes" ON public.intakes;
--   ALTER TABLE public.intakes DROP CONSTRAINT IF EXISTS intakes_lifecycle_status_check;
--   ALTER TABLE public.intakes DROP COLUMN IF EXISTS acquired_at, DROP COLUMN IF EXISTS lifecycle_status;
--   ALTER TABLE public.intakes RENAME COLUMN owner_ref TO resident_ref;
-- ---------------------------------------------------------------------
