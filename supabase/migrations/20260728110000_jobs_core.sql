-- 20260728110000_jobs_core.sql
-- Unified Driver Job Workflow, Phase 1, step 1 of 2: jobs + job_events.
--
-- jobs is the operational source of truth for driver workflow state
-- (PENDING->CLAIMED->EN_ROUTE->ARRIVED->SCANNING->INTAKE->PASSPORT, plus
-- MARKETPLACE/COMPLETED reserved for Phase 2, CANCELLED matching scans'
-- existing cancel capability). It is a workflow tracker, not a second
-- inventory system: it references intake_id/passport_id, it doesn't
-- duplicate their data, and it deliberately has no listing_id -- Passport
-- bridges Job to Marketplace in Phase 2, marketplace ownership stays
-- separate.
--
-- source_type is polymorphic (bounty/business/operator/dispatch) so the
-- CHECK constraint never needs an ALTER when those other sources get
-- built later, but only 'bounty' is creatable in Phase 1 -- no FK columns
-- added yet for sources that don't exist, matching dispatch_stops' own
-- pattern of adding a nullable FK per concrete source when that source is
-- real, not speculatively.
--
-- scans.bounty_status is NOT replaced. credit_resident_on_bounty_completion
-- and record_driver_payout_on_bounty_completion are hard-keyed to it and
-- are out of scope to rewrite -- job_create_intake() (next migration)
-- writes scans.bounty_status='completed' purely as a mechanical side
-- effect to keep those existing triggers firing. Nothing new should read
-- scans.bounty_status; jobs.status is authoritative for everything else.

CREATE TABLE public.jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_type text NOT NULL CHECK (source_type IN ('bounty','business','operator','dispatch')),
  scan_id uuid REFERENCES public.scans(id),
  resident_id uuid REFERENCES public.residents(id),
  driver_id uuid REFERENCES public.drivers(user_id),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING','CLAIMED','EN_ROUTE','ARRIVED','SCANNING','INTAKE','PASSPORT',
    'MARKETPLACE','COMPLETED','CANCELLED'
  )),
  intake_id uuid REFERENCES public.intakes(id),
  passport_id bigint REFERENCES public.passports(id),
  ai_grade jsonb,
  claimed_at timestamptz,
  en_route_at timestamptz,
  arrived_at timestamptz,
  scanning_at timestamptz,
  intake_at timestamptz,
  passport_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jobs_source_scan_consistency CHECK (
    (source_type = 'bounty' AND scan_id IS NOT NULL) OR
    (source_type <> 'bounty' AND scan_id IS NULL)
  )
);

CREATE UNIQUE INDEX jobs_scan_id_active_uniq ON public.jobs(scan_id) WHERE status <> 'CANCELLED';
CREATE INDEX idx_jobs_driver_id ON public.jobs(driver_id);
CREATE INDEX idx_jobs_status ON public.jobs(status);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drivers select own jobs" ON public.jobs
  FOR SELECT TO authenticated USING (driver_id = auth.uid());
CREATE POLICY "operators select jobs" ON public.jobs
  FOR SELECT TO authenticated USING (public.is_operator());
-- No direct INSERT/UPDATE policy for anyone -- every write goes through
-- the SECURITY DEFINER RPCs in the next migration, same posture as
-- offers/material_listings.

CREATE TABLE public.job_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id bigint NOT NULL REFERENCES public.jobs(id),
  event_type text NOT NULL CHECK (event_type IN (
    'CREATED','CLAIMED','EN_ROUTE','ARRIVED','SCANNING','INTAKE','PASSPORT',
    'MARKETPLACE','COMPLETED','CANCELLED'
  )),
  actor text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_events_job_id ON public.job_events(job_id);

ALTER TABLE public.job_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drivers select own job_events" ON public.job_events
  FOR SELECT TO authenticated
  USING (job_id IN (SELECT id FROM public.jobs WHERE driver_id = auth.uid()));
CREATE POLICY "operators select job_events" ON public.job_events
  FOR SELECT TO authenticated USING (public.is_operator());

-- Auto-logged event on every insert/status change, same pattern as the
-- existing log_passport_created() / log_listing_status_events() triggers
-- -- no RPC has to remember to log anything by hand.
CREATE OR REPLACE FUNCTION public.log_job_status_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.job_events (job_id, event_type, actor)
    VALUES (NEW.id, 'CREATED', COALESCE(NEW.driver_id::text, 'system'));
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.job_events (job_id, event_type, actor)
    VALUES (NEW.id, NEW.status, COALESCE(NEW.driver_id::text, 'system'));
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_log_job_status_events
  BEFORE INSERT OR UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.log_job_status_events();

-- Auto-create a PENDING job the moment a resident's bounty scan becomes
-- visible to drivers (pickup-photo.html sets bounty_status:'open'), same
-- shape as the existing create_intake_and_passport_on_bounty_completion()
-- trigger. One active job per scan, enforced by jobs_scan_id_active_uniq.
CREATE OR REPLACE FUNCTION public.create_job_on_bounty_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.bounty_status = 'open'
     AND OLD.bounty_status IS DISTINCT FROM NEW.bounty_status
     AND NOT EXISTS (SELECT 1 FROM public.jobs WHERE scan_id = NEW.id AND status <> 'CANCELLED') THEN
    INSERT INTO public.jobs (source_type, scan_id, resident_id, status)
    VALUES ('bounty', NEW.id, NEW.resident_id, 'PENDING');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_create_job_on_bounty_open
  AFTER UPDATE ON public.scans
  FOR EACH ROW EXECUTE FUNCTION public.create_job_on_bounty_open();

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   DROP TRIGGER IF EXISTS trg_create_job_on_bounty_open ON public.scans;
--   DROP FUNCTION IF EXISTS public.create_job_on_bounty_open();
--   DROP TRIGGER IF EXISTS trg_log_job_status_events ON public.jobs;
--   DROP FUNCTION IF EXISTS public.log_job_status_events();
--   DROP TABLE IF EXISTS public.job_events;
--   DROP TABLE IF EXISTS public.jobs;
-- ---------------------------------------------------------------------
