-- 20260728110300_job_create_intake_fix_completed_at.sql
-- Fixes a bug caught while building the rollback lifecycle test: the
-- existing scans_bounty_state_consistency CHECK constraint requires
-- claimed_by, claimed_at, AND completed_at to all be NOT NULL whenever
-- bounty_status='completed'. job_create_intake() (20260728110100) set
-- bounty_status='completed' without setting completed_at, which would
-- have failed this constraint on every real call, not just in testing.

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

  -- Fix: completed_at must be set alongside bounty_status='completed' to
  -- satisfy scans_bounty_state_consistency.
  UPDATE public.scans SET bounty_status = 'completed', completed_at = now() WHERE id = v_job.scan_id;

  UPDATE public.jobs SET status = 'INTAKE', intake_id = v_intake_id, intake_at = now()
    WHERE id = p_job_id RETURNING * INTO v_job;
  RETURN v_job;
END;
$function$;
