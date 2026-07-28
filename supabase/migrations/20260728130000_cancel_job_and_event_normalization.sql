-- 20260728130000_cancel_job_and_event_normalization.sql
-- Phase 3 consolidation, migration 1 of 1: cancel_job() RPC + job_events
-- naming normalization.
--
-- ---- Normalization ----
-- job_events currently copies jobs.status verbatim as event_type -- a
-- state snapshot, not an event, and inconsistent with every sibling event
-- log in this schema (intake_events/passport_events/listing_events all
-- use action-style names). Fixing now, before any real job_events rows
-- exist in production (every test run against this table so far was
-- rolled back or cleaned up).
--
--   jobs.status  ->  job_events.event_type
--   (insert)         CREATED           (unchanged)
--   CLAIMED          CLAIMED           (unchanged -- already action-like)
--   EN_ROUTE         EN_ROUTE          (unchanged)
--   ARRIVED          ARRIVED           (unchanged)
--   SCANNING         SCAN_RECORDED
--   INTAKE           INTAKE_LOGGED
--   PASSPORT         PASSPORT_CREATED  -- now matches passport_events exactly
--   MARKETPLACE      LISTING_CREATED   -- now matches listing_events exactly
--   COMPLETED        COMPLETED         (unchanged)
--   CANCELLED        CANCELLED, written explicitly by cancel_job() below,
--                    not by this trigger (see next section)
--
-- ---- cancel_job() ----
-- Same shape as the other job RPCs: SECURITY DEFINER, owner postgres,
-- PUBLIC/anon/service_role revoked, authenticated granted -- applied
-- together, not as a follow-up fix (established pattern from the last two
-- rounds this session). Operator-only (this is an operator safety valve,
-- same as the old cancelBounty() it replaces). Idempotent: calling it
-- again on an already-CANCELLED job returns the row as-is rather than
-- erroring or double-writing -- same pattern as create_listing_from_job's
-- retry handling.
--
-- Cancellation is a custody event, not a silent transition: the function
-- inserts its own job_events row (actor = the cancelling operator, notes
-- = previous status + reason) rather than relying on the generic
-- log_job_status_events() trigger, which is why that trigger now
-- explicitly skips the CANCELLED case -- avoids one generic event plus a
-- redundant, less-informative one for the same transition.

ALTER TABLE public.job_events DROP CONSTRAINT job_events_event_type_check;
ALTER TABLE public.job_events ADD CONSTRAINT job_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'CREATED','CLAIMED','EN_ROUTE','ARRIVED','SCAN_RECORDED','INTAKE_LOGGED',
    'PASSPORT_CREATED','LISTING_CREATED','COMPLETED','CANCELLED'
  ]));

CREATE OR REPLACE FUNCTION public.log_job_status_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_event_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.job_events (job_id, event_type, actor)
    VALUES (NEW.id, 'CREATED', COALESCE(NEW.driver_id::text, 'system'));
  ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status <> 'CANCELLED' THEN
    v_event_type := CASE NEW.status
      WHEN 'SCANNING' THEN 'SCAN_RECORDED'
      WHEN 'INTAKE' THEN 'INTAKE_LOGGED'
      WHEN 'PASSPORT' THEN 'PASSPORT_CREATED'
      WHEN 'MARKETPLACE' THEN 'LISTING_CREATED'
      ELSE NEW.status
    END;
    INSERT INTO public.job_events (job_id, event_type, actor)
    VALUES (NEW.id, v_event_type, COALESCE(NEW.driver_id::text, 'system'));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_job(p_job_id bigint, p_reason text DEFAULT NULL)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_previous_status text;
BEGIN
  IF NOT public.is_operator() THEN
    RAISE EXCEPTION 'Only an operator can cancel a job.';
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % not found.', p_job_id;
  END IF;

  IF v_job.status = 'CANCELLED' THEN
    RETURN v_job; -- idempotent retry
  END IF;

  IF v_job.status NOT IN ('PENDING', 'CLAIMED') THEN
    RAISE EXCEPTION 'Job % cannot be cancelled from status % -- already past claim.', p_job_id, v_job.status;
  END IF;

  v_previous_status := v_job.status;

  IF v_job.scan_id IS NOT NULL THEN
    UPDATE public.scans SET bounty_status = 'cancelled' WHERE id = v_job.scan_id;
  END IF;

  UPDATE public.jobs SET status = 'CANCELLED' WHERE id = p_job_id RETURNING * INTO v_job;

  INSERT INTO public.job_events (job_id, event_type, actor, notes)
  VALUES (
    p_job_id, 'CANCELLED', auth.uid()::text,
    'previous status: ' || v_previous_status || '; reason: ' || COALESCE(p_reason, 'none given')
  );

  RETURN v_job;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_job(bigint, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_job(bigint, text) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_job(bigint, text) TO authenticated;

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   REVOKE EXECUTE ON FUNCTION public.cancel_job(bigint, text) FROM authenticated;
--   DROP FUNCTION IF EXISTS public.cancel_job(bigint, text);
--   (restore prior log_job_status_events() body manually if needed)
--   ALTER TABLE public.job_events DROP CONSTRAINT job_events_event_type_check;
--   ALTER TABLE public.job_events ADD CONSTRAINT job_events_event_type_check
--     CHECK (event_type = ANY (ARRAY['CREATED','CLAIMED','EN_ROUTE','ARRIVED','SCANNING','INTAKE','PASSPORT','MARKETPLACE','COMPLETED','CANCELLED']));
-- ---------------------------------------------------------------------
