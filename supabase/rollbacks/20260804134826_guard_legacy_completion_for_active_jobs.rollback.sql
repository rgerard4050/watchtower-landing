-- Rollback for 20260804134826_guard_legacy_completion_for_active_jobs.sql
--
-- WARNING: applying this rollback restores the verified duplicate behavior
-- for job-backed scan completions. It does not delete or repair any data.

CREATE OR REPLACE FUNCTION public.create_intake_and_passport_on_bounty_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resident_name text;
  v_resident_wallet text;
  v_intake_id uuid;
  v_intake_number text;
  v_intake_created_at timestamptz;
BEGIN
  IF NEW.bounty_status = 'completed'
     AND OLD.bounty_status IS DISTINCT FROM NEW.bounty_status
     AND NEW.resident_id IS NOT NULL THEN

    SELECT name, wallet_id
      INTO v_resident_name, v_resident_wallet
      FROM public.residents
      WHERE id = NEW.resident_id;

    INSERT INTO public.intakes (
      operator, owner_ref, material, gross_value, notes,
      lifecycle_status, acquired_at, lat, lng, photo_path, resident_id
    ) VALUES (
      'bounty-flow (auto)',
      COALESCE(v_resident_name, 'Unknown resident') ||
        ' (' || COALESCE(v_resident_wallet, 'no wallet') || ')',
      NEW.summary,
      NEW.accepted_value,
      'Created automatically from bounty completion, not manual operator entry. Source scan id: ' || NEW.id,
      'ACQUIRED',
      now(),
      NEW.pickup_lat,
      NEW.pickup_lng,
      NEW.pickup_photo_url,
      NEW.resident_id
    )
    RETURNING id, intake_number, created_at
      INTO v_intake_id, v_intake_number, v_intake_created_at;

    INSERT INTO public.passports (
      intake_id, intake_number, intake_created_at, intake_operator, intake_material,
      lifecycle_status, created_by, photo_url, resident_id
    ) VALUES (
      v_intake_id, v_intake_number, v_intake_created_at,
      'bounty-flow (auto)', NEW.summary,
      'CREATED', 'bounty-flow (auto)', NEW.pickup_photo_url, NEW.resident_id
    );
  END IF;

  RETURN NEW;
END;
$function$;
