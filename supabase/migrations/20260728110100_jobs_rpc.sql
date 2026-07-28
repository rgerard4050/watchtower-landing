-- 20260728110100_jobs_rpc.sql
-- Unified Driver Job Workflow, Phase 1, step 2 of 2: the 5 state-transition
-- RPC functions, one per transition (mirrors accept_offer/mint_wallet_token's
-- established shape, not a generic dispatcher).
--
-- Identity: none of these accept a driver-id parameter. Like
-- mint_wallet_token()/redeem_wtwr(), the acting driver is always
-- auth.uid() -- never trusted from client input -- so a driver can only
-- ever act as themselves. is_verified_driver() (existing function, reused
-- here rather than reinvented) gates claiming; every later transition
-- requires auth.uid() = jobs.driver_id OR is_operator(), so an operator
-- can act on/observe any job (matches "operator can open any bounty and
-- launch the Driver workflow") without being able to impersonate a driver.
--
-- job_create_intake() is the one function that writes scans.bounty_status
-- = 'completed' -- the mechanical side effect that keeps
-- credit_resident_on_bounty_completion / record_driver_payout_on_bounty_completion
-- firing (both are hard-keyed to that column, out of scope to rewrite).
-- enforce_scan_bounty_transition() still requires the prior value to be
-- 'claimed', which it always is at this point since nothing between
-- CLAIMED and SCANNING touches scans.

CREATE OR REPLACE FUNCTION public.claim_job(p_job_id bigint)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_scan public.scans%ROWTYPE;
BEGIN
  IF NOT public.is_verified_driver() THEN
    RAISE EXCEPTION 'Only a verified driver can claim a job.';
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % not found.', p_job_id;
  END IF;
  IF v_job.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Job % is not PENDING (status: %).', p_job_id, v_job.status;
  END IF;

  SELECT * INTO v_scan FROM public.scans WHERE id = v_job.scan_id FOR UPDATE;
  IF v_scan.pickup_photo_url IS NULL THEN
    RAISE EXCEPTION 'Bounty has no staged pickup photo yet -- cannot claim.';
  END IF;
  IF v_scan.bounty_status <> 'open' THEN
    RAISE EXCEPTION 'Underlying bounty is not open (status: %).', v_scan.bounty_status;
  END IF;

  UPDATE public.scans
    SET bounty_status = 'claimed', claimed_by = auth.uid(), claimed_at = now()
    WHERE id = v_job.scan_id;

  UPDATE public.jobs
    SET driver_id = auth.uid(), status = 'CLAIMED', claimed_at = now()
    WHERE id = p_job_id
    RETURNING * INTO v_job;

  RETURN v_job;
END;
$function$;

CREATE OR REPLACE FUNCTION public.job_mark_en_route(p_job_id bigint)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % not found.', p_job_id;
  END IF;
  IF NOT (auth.uid() = v_job.driver_id OR public.is_operator()) THEN
    RAISE EXCEPTION 'Not authorized for job %.', p_job_id;
  END IF;
  IF v_job.status <> 'CLAIMED' THEN
    RAISE EXCEPTION 'Job % is not CLAIMED (status: %).', p_job_id, v_job.status;
  END IF;

  UPDATE public.jobs SET status = 'EN_ROUTE', en_route_at = now()
    WHERE id = p_job_id RETURNING * INTO v_job;
  RETURN v_job;
END;
$function$;

CREATE OR REPLACE FUNCTION public.job_mark_arrived(p_job_id bigint)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % not found.', p_job_id;
  END IF;
  IF NOT (auth.uid() = v_job.driver_id OR public.is_operator()) THEN
    RAISE EXCEPTION 'Not authorized for job %.', p_job_id;
  END IF;
  IF v_job.status <> 'EN_ROUTE' THEN
    RAISE EXCEPTION 'Job % is not EN_ROUTE (status: %).', p_job_id, v_job.status;
  END IF;

  UPDATE public.jobs SET status = 'ARRIVED', arrived_at = now()
    WHERE id = p_job_id RETURNING * INTO v_job;
  RETURN v_job;
END;
$function$;

CREATE OR REPLACE FUNCTION public.job_record_scan(p_job_id bigint, p_ai_grade jsonb)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % not found.', p_job_id;
  END IF;
  IF NOT (auth.uid() = v_job.driver_id OR public.is_operator()) THEN
    RAISE EXCEPTION 'Not authorized for job %.', p_job_id;
  END IF;
  IF v_job.status <> 'ARRIVED' THEN
    RAISE EXCEPTION 'Job % is not ARRIVED (status: %).', p_job_id, v_job.status;
  END IF;
  IF p_ai_grade IS NULL THEN
    RAISE EXCEPTION 'AI grade result is required.';
  END IF;

  UPDATE public.jobs SET status = 'SCANNING', ai_grade = p_ai_grade, scanning_at = now()
    WHERE id = p_job_id RETURNING * INTO v_job;
  RETURN v_job;
END;
$function$;

-- job_create_intake: SCANNING -> INTAKE. Mirrors the field mapping
-- operator-scanner.html already uses when it accepts a grade and inserts
-- into intakes (material/grade/confidence/contamination/safety_flags/
-- ai_provider/ai_model/ai_prompt_version/ai_timestamp/ai_raw_response from
-- the AI result; weight_lb/price_per_lb as final human-confirmed numbers,
-- not the AI's raw range, same as that page's human-editable w/p fields).
-- lat/lng come from the scan's own pickup_lat/pickup_lng (where the
-- resident staged the material), same source the existing
-- create_intake_and_passport_on_bounty_completion() trigger already uses
-- for the fully-automatic bounty path.
CREATE OR REPLACE FUNCTION public.job_create_intake(
  p_job_id bigint, p_weight_lb numeric, p_price_per_lb numeric
)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_scan public.scans%ROWTYPE;
  v_intake_id uuid;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % not found.', p_job_id;
  END IF;
  IF NOT (auth.uid() = v_job.driver_id OR public.is_operator()) THEN
    RAISE EXCEPTION 'Not authorized for job %.', p_job_id;
  END IF;
  IF v_job.status <> 'SCANNING' THEN
    RAISE EXCEPTION 'Job % is not SCANNING (status: %).', p_job_id, v_job.status;
  END IF;
  IF p_weight_lb IS NULL OR p_weight_lb <= 0 OR p_price_per_lb IS NULL OR p_price_per_lb <= 0 THEN
    RAISE EXCEPTION 'weight_lb and price_per_lb must be positive.';
  END IF;

  SELECT * INTO v_scan FROM public.scans WHERE id = v_job.scan_id FOR UPDATE;

  INSERT INTO public.intakes (
    operator, material, grade, confidence, contamination, safety_flags, notes,
    weight_lb, price_per_lb, gross_value,
    ai_provider, ai_model, ai_prompt_version, ai_timestamp, ai_raw_response,
    lat, lng, lifecycle_status, acquired_at, photo_path, resident_id
  ) VALUES (
    auth.uid()::text,
    v_job.ai_grade->>'material',
    v_job.ai_grade->>'grade',
    v_job.ai_grade->>'confidence',
    NULLIF(ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_job.ai_grade->'contamination', '[]'::jsonb))), '{}'),
    NULLIF(ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_job.ai_grade->'safety_flags', '[]'::jsonb))), '{}'),
    'Created from driver Job workflow. Source job id: ' || p_job_id,
    p_weight_lb, p_price_per_lb, p_weight_lb * p_price_per_lb,
    v_job.ai_grade->>'ai_provider', v_job.ai_grade->>'ai_model', v_job.ai_grade->>'ai_prompt_version',
    NULLIF(v_job.ai_grade->>'ai_timestamp','')::timestamptz,
    v_job.ai_grade,
    v_scan.pickup_lat, v_scan.pickup_lng,
    'ACQUIRED', now(), v_scan.pickup_photo_url, v_job.resident_id
  )
  RETURNING id INTO v_intake_id;

  -- Mechanical side effect only -- keeps the existing resident-credit /
  -- driver-payout triggers firing. Nothing new should read this column.
  UPDATE public.scans SET bounty_status = 'completed' WHERE id = v_job.scan_id;

  UPDATE public.jobs SET status = 'INTAKE', intake_id = v_intake_id, intake_at = now()
    WHERE id = p_job_id RETURNING * INTO v_job;
  RETURN v_job;
END;
$function$;

-- job_create_passport: INTAKE -> PASSPORT. require_acquired_intake() is
-- already satisfied since job_create_intake() just set lifecycle_status
-- to ACQUIRED. log_passport_created() (existing trigger) auto-logs
-- PASSPORT_CREATED in passport_events -- not duplicated here.
CREATE OR REPLACE FUNCTION public.job_create_passport(p_job_id bigint)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_intake public.intakes%ROWTYPE;
  v_passport_id bigint;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % not found.', p_job_id;
  END IF;
  IF NOT (auth.uid() = v_job.driver_id OR public.is_operator()) THEN
    RAISE EXCEPTION 'Not authorized for job %.', p_job_id;
  END IF;
  IF v_job.status <> 'INTAKE' THEN
    RAISE EXCEPTION 'Job % is not INTAKE (status: %).', p_job_id, v_job.status;
  END IF;
  IF v_job.intake_id IS NULL THEN
    RAISE EXCEPTION 'Job % has no intake_id.', p_job_id;
  END IF;

  SELECT * INTO v_intake FROM public.intakes WHERE id = v_job.intake_id;

  INSERT INTO public.passports (
    intake_id, intake_number, intake_created_at, intake_operator, intake_material,
    lifecycle_status, created_by, photo_url, resident_id
  ) VALUES (
    v_intake.id, v_intake.intake_number, v_intake.created_at, v_intake.operator, v_intake.material,
    'CREATED', auth.uid()::text, v_intake.photo_path, v_job.resident_id
  )
  RETURNING id INTO v_passport_id;

  UPDATE public.jobs SET status = 'PASSPORT', passport_id = v_passport_id, passport_at = now()
    WHERE id = p_job_id RETURNING * INTO v_job;
  RETURN v_job;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_job(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.job_mark_en_route(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.job_mark_arrived(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.job_record_scan(bigint, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.job_create_intake(bigint, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.job_create_passport(bigint) TO authenticated;

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   REVOKE EXECUTE ON FUNCTION public.job_create_passport(bigint) FROM authenticated;
--   DROP FUNCTION IF EXISTS public.job_create_passport(bigint);
--   REVOKE EXECUTE ON FUNCTION public.job_create_intake(bigint, numeric, numeric) FROM authenticated;
--   DROP FUNCTION IF EXISTS public.job_create_intake(bigint, numeric, numeric);
--   REVOKE EXECUTE ON FUNCTION public.job_record_scan(bigint, jsonb) FROM authenticated;
--   DROP FUNCTION IF EXISTS public.job_record_scan(bigint, jsonb);
--   REVOKE EXECUTE ON FUNCTION public.job_mark_arrived(bigint) FROM authenticated;
--   DROP FUNCTION IF EXISTS public.job_mark_arrived(bigint);
--   REVOKE EXECUTE ON FUNCTION public.job_mark_en_route(bigint) FROM authenticated;
--   DROP FUNCTION IF EXISTS public.job_mark_en_route(bigint);
--   REVOKE EXECUTE ON FUNCTION public.claim_job(bigint) FROM authenticated;
--   DROP FUNCTION IF EXISTS public.claim_job(bigint);
-- ---------------------------------------------------------------------
