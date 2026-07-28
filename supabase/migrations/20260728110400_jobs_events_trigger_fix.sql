-- 20260728110400_jobs_events_trigger_fix.sql
-- Fixes a bug caught while running the rollback lifecycle test:
-- log_job_status_events() was BEFORE INSERT OR UPDATE OF status, combining
-- the updated_at touch (needs BEFORE, to actually take effect on the row
-- being written) with the job_events insert (needs AFTER -- a BEFORE
-- INSERT trigger fires before the jobs row physically exists in the
-- table, so INSERT INTO job_events(job_id=NEW.id, ...) fails its FK check
-- even though NEW.id already has a value assigned). Splitting into two
-- triggers, matching the established log_passport_created()/
-- log_listing_status_events() pattern (AFTER, for exactly this reason)
-- while keeping a separate BEFORE trigger for the timestamp touch.

DROP TRIGGER IF EXISTS trg_log_job_status_events ON public.jobs;

CREATE OR REPLACE FUNCTION public.touch_job_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_touch_job_updated_at
  BEFORE INSERT OR UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_job_updated_at();

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
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_log_job_status_events
  AFTER INSERT OR UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.log_job_status_events();
