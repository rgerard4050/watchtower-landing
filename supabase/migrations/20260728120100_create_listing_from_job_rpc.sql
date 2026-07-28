-- 20260728120100_create_listing_from_job_rpc.sql
-- Passport -> Marketplace bridge, step 2 of 2: create_listing_from_job().
--
-- Follows the now-established template (marketplace RPCs + jobs RPCs,
-- confirmed correct across two prior rounds this session): SECURITY
-- DEFINER, owner postgres, explicit REVOKE from PUBLIC/anon/service_role,
-- GRANT to authenticated only -- applied together here rather than as a
-- follow-up fix, since this project's default privileges are now a known
-- quantity (they leak EXECUTE to anon/service_role/PUBLIC on every new
-- function otherwise).
--
-- Caller must be the job's assigned driver (auth.uid() = jobs.driver_id)
-- or an operator -- same authorization shape as the job_* RPCs. Job must
-- be in PASSPORT state with a passport_id set.
--
-- Idempotent by design, not by a jobs.listing_id column (Phase 1
-- deliberately kept marketplace ownership out of jobs -- see the Phase 1
-- migration notes). A successful call advances the job to MARKETPLACE, so
-- a retry naturally lands on status=MARKETPLACE instead of PASSPORT; in
-- that case, if a listing already exists for the job's passport, it's
-- returned as-is rather than erroring or creating a second one. A
-- genuinely conflicting insert (a listing for this passport that didn't
-- come from this job) is still rejected, both here and by the DB-level
-- partial unique index from the prior migration (defense in depth, same
-- pattern as offers_listing_accepted_uniq). No manifest is ever created on
-- a retry -- that code path is only reached on a fresh PASSPORT-state call.
--
-- material_type/grade/available_weight are inherited from the job's
-- intake (the human-confirmed final numbers, not the AI's raw estimate
-- range) -- passports themselves don't carry weight as a first-class
-- column. asking_price is left null; pricing is an operator decision made
-- afterward via the existing marketplace UI, not part of this bridge.
--
-- seller_id is only set when the caller is an operator (its FK targets
-- operators(id) -- a driver calling this directly is not in that table,
-- so seller_id stays null in that case rather than violating the FK).
--
-- Does not touch trg_validate_listing_verified, accept_offer(), or
-- complete_transaction() -- the resulting listing is DRAFT and must still
-- pass the existing ACQUIRED-intake + linked-passport gate before it can
-- ever become AVAILABLE, exactly as before.

CREATE OR REPLACE FUNCTION public.create_listing_from_job(p_job_id bigint)
RETURNS public.material_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_intake public.intakes%ROWTYPE;
  v_passport public.passports%ROWTYPE;
  v_manifest_id bigint;
  v_seller_id uuid;
  v_listing public.material_listings%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % not found.', p_job_id;
  END IF;
  IF NOT (auth.uid() = v_job.driver_id OR public.is_operator()) THEN
    RAISE EXCEPTION 'Not authorized for job %.', p_job_id;
  END IF;
  IF v_job.passport_id IS NULL THEN
    RAISE EXCEPTION 'Job % has no passport_id.', p_job_id;
  END IF;

  -- Idempotent retry: this job already produced a listing (status was
  -- already advanced to MARKETPLACE by a prior successful call).
  IF v_job.status = 'MARKETPLACE' THEN
    SELECT * INTO v_listing FROM public.material_listings
      WHERE passport_id = v_job.passport_id AND status <> 'CLOSED' LIMIT 1;
    IF FOUND THEN
      RETURN v_listing;
    END IF;
    RAISE EXCEPTION 'Job % is MARKETPLACE but no listing exists for passport % -- inconsistent state.', p_job_id, v_job.passport_id;
  END IF;

  IF v_job.status <> 'PASSPORT' THEN
    RAISE EXCEPTION 'Job % is not in PASSPORT state (status: %).', p_job_id, v_job.status;
  END IF;

  SELECT * INTO v_passport FROM public.passports WHERE id = v_job.passport_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Passport % not found.', v_job.passport_id;
  END IF;

  -- Not a retry of this job, but the passport already backs another
  -- listing (e.g. created some other way) -- a genuine conflict, not an
  -- idempotent case.
  IF EXISTS (
    SELECT 1 FROM public.material_listings
    WHERE passport_id = v_passport.id AND status <> 'CLOSED'
  ) THEN
    RAISE EXCEPTION 'A listing already exists for passport %.', v_passport.id;
  END IF;

  SELECT * INTO v_intake FROM public.intakes WHERE id = v_job.intake_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % has no intake on file.', p_job_id;
  END IF;

  -- Marketplace inventory stays manifest-backed. Auto-generate a minimal
  -- manifest only if this passport doesn't already have one (true for
  -- every Phase 1 bounty-path job today; reused as-is for any future
  -- source that already has a real manifest).
  v_manifest_id := v_passport.manifest_id;
  IF v_manifest_id IS NULL THEN
    INSERT INTO public.manifests (source, description, intake_id, status)
    VALUES (
      'job-flow (auto)',
      COALESCE(v_intake.material, 'Job ' || p_job_id || ' recovered material'),
      v_job.intake_id, 'REVIEWING'
    )
    RETURNING id INTO v_manifest_id;

    UPDATE public.manifests SET passport_id = v_passport.id WHERE id = v_manifest_id;
    UPDATE public.passports SET manifest_id = v_manifest_id WHERE id = v_passport.id;
  END IF;

  v_seller_id := CASE WHEN public.is_operator() THEN auth.uid() ELSE NULL END;

  INSERT INTO public.material_listings (
    manifest_id, passport_id, seller_id, material_type, grade, available_weight, status
  ) VALUES (
    v_manifest_id, v_passport.id, v_seller_id, v_intake.material, v_intake.grade, v_intake.weight_lb, 'DRAFT'
  )
  RETURNING * INTO v_listing;

  -- Job's role in the marketplace hand-off ends here -- a listing now
  -- exists, and pricing/publishing/sale from this point on is entirely
  -- the marketplace's own concern (material_listings/offers/
  -- marketplace_transactions), not jobs'.
  UPDATE public.jobs SET status = 'MARKETPLACE' WHERE id = p_job_id;

  RETURN v_listing;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_listing_from_job(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_listing_from_job(bigint) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_listing_from_job(bigint) TO authenticated;

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   REVOKE EXECUTE ON FUNCTION public.create_listing_from_job(bigint) FROM authenticated;
--   DROP FUNCTION IF EXISTS public.create_listing_from_job(bigint);
-- ---------------------------------------------------------------------
