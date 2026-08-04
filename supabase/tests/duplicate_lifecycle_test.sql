BEGIN;
SELECT plan(21);

-- Transactional fixture IDs. This test is intended for a local database or
-- isolated Supabase branch after all migrations have been applied.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  (
    'd1000000-0000-4000-8000-000000000001',
    'duplicate-lifecycle-operator@example.invalid',
    '{"name":"Duplicate Lifecycle Operator"}'::jsonb
  ),
  (
    'd1000000-0000-4000-8000-000000000002',
    'duplicate-lifecycle-driver@example.invalid',
    '{"name":"Duplicate Lifecycle Driver"}'::jsonb
  );

INSERT INTO public.operators (id)
VALUES ('d1000000-0000-4000-8000-000000000001');

INSERT INTO public.drivers (user_id, verification_status)
VALUES ('d1000000-0000-4000-8000-000000000002', 'verified');

INSERT INTO public.residents (id, name, email, wallet_id, wtwr_balance)
VALUES
  ('d1000000-0000-4000-8000-000000000011', 'Canonical Job Fixture', 'duplicate-lifecycle-resident@example.invalid', 'WTWR-DUP-JOB', 0),
  ('d1000000-0000-4000-8000-000000000012', 'Legacy Fixture', 'duplicate-lifecycle-legacy@example.invalid', 'WTWR-DUP-LEGACY', 0);

-- Start both scans in CLAIMED state so this test isolates completion behavior.
INSERT INTO public.scans (
  id, session_id, summary, est_low, est_high,
  resident_id, bounty_created, accepted_value,
  lat, lng, pickup_lat, pickup_lng, pickup_photo_url, pickup_photo_at,
  bounty_status, claimed_by, claimed_at
) VALUES
  (
    'd1000000-0000-4000-8000-000000000021', 'duplicate-lifecycle-job',
    'Canonical job fixture material', 10, 10,
    'd1000000-0000-4000-8000-000000000011', true, 10,
    1, 1, 1, 1, 'test/duplicate-lifecycle-job.jpg', now(),
    'claimed', 'd1000000-0000-4000-8000-000000000002', now()
  ),
  (
    'd1000000-0000-4000-8000-000000000022', 'duplicate-lifecycle-legacy',
    'Legacy fixture material', 10, 10,
    'd1000000-0000-4000-8000-000000000012', true, 10,
    1, 1, 1, 1, 'test/duplicate-lifecycle-legacy.jpg', now(),
    'claimed', 'd1000000-0000-4000-8000-000000000002', now()
  );

INSERT INTO public.jobs (
  id, source_type, scan_id, resident_id, driver_id, status, ai_grade,
  claimed_at, en_route_at, arrived_at, scanning_at
) OVERRIDING SYSTEM VALUE VALUES (
  9100001,
  'bounty',
  'd1000000-0000-4000-8000-000000000021',
  'd1000000-0000-4000-8000-000000000011',
  'd1000000-0000-4000-8000-000000000002',
  'SCANNING',
  jsonb_build_object(
    'material', 'aluminum',
    'grade', 'A',
    'confidence', 'high',
    'contamination', jsonb_build_array(),
    'safety_flags', jsonb_build_array(),
    'ai_provider', 'test',
    'ai_model', 'fixture',
    'ai_prompt_version', 'test-v1',
    'ai_timestamp', now()::text
  ),
  now(), now(), now(), now()
);

-- Execute as the fixture operator so the SECURITY DEFINER RPC's internal
-- authorization check sees a real auth.uid().
SET LOCAL "request.jwt.claim.sub" = 'd1000000-0000-4000-8000-000000000001';

SELECT lives_ok(
  $$SELECT public.job_create_intake(9100001, 10, 1)$$,
  'the canonical job intake RPC succeeds'
);

SELECT is(
  (SELECT count(*) FROM public.intakes WHERE resident_id = 'd1000000-0000-4000-8000-000000000011'),
  1::bigint,
  'one job creates exactly one intake'
);

SELECT ok(
  (SELECT intake_id IS NOT NULL FROM public.jobs WHERE id = 9100001),
  'the job points to its intake'
);

SELECT is(
  (SELECT count(*) FROM public.passports WHERE resident_id = 'd1000000-0000-4000-8000-000000000011'),
  0::bigint,
  'job intake creation does not create a legacy passport'
);

SELECT is(
  (SELECT wtwr_balance FROM public.residents WHERE id = 'd1000000-0000-4000-8000-000000000011'),
  400::numeric,
  'wallet credit side effect occurs exactly once'
);

SELECT is(
  (SELECT driver_payout_cents::numeric FROM public.scans WHERE id = 'd1000000-0000-4000-8000-000000000021'),
  100::numeric,
  'driver payout accrual side effect is preserved'
);

SELECT is(
  (SELECT count(*) FROM public.job_events WHERE job_id = 9100001 AND event_type = 'INTAKE_LOGGED'),
  1::bigint,
  'the intake transition emits one job event'
);

SELECT throws_ok(
  $$SELECT public.job_create_intake(9100001, 10, 1)$$,
  'P0001',
  'Job 9100001 is not SCANNING (status: INTAKE).',
  'retrying intake creation is rejected'
);

SELECT is(
  (SELECT count(*) FROM public.intakes WHERE resident_id = 'd1000000-0000-4000-8000-000000000011'),
  1::bigint,
  'the rejected intake retry creates no duplicate'
);

SELECT is(
  (SELECT wtwr_balance FROM public.residents WHERE id = 'd1000000-0000-4000-8000-000000000011'),
  400::numeric,
  'the rejected intake retry does not credit the wallet again'
);

SELECT lives_ok(
  $$SELECT public.job_create_passport(9100001)$$,
  'the canonical job passport RPC succeeds'
);

SELECT is(
  (SELECT count(*) FROM public.passports WHERE resident_id = 'd1000000-0000-4000-8000-000000000011'),
  1::bigint,
  'one job creates exactly one passport'
);

SELECT ok(
  (
    SELECT j.passport_id IS NOT NULL AND p.intake_id = j.intake_id
    FROM public.jobs j
    JOIN public.passports p ON p.id = j.passport_id
    WHERE j.id = 9100001
  ),
  'the job passport points to the job intake'
);

SELECT is(
  (SELECT count(*) FROM public.job_events WHERE job_id = 9100001 AND event_type = 'PASSPORT_CREATED'),
  1::bigint,
  'the passport transition emits one job event'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.passport_events pe
    JOIN public.jobs j ON j.passport_id = pe.passport_id
    WHERE j.id = 9100001 AND pe.event_type = 'PASSPORT_CREATED'
  ),
  1::bigint,
  'the passport insert emits one passport birth event'
);

SELECT throws_ok(
  $$SELECT public.job_create_passport(9100001)$$,
  'P0001',
  'Job 9100001 is not INTAKE (status: PASSPORT).',
  'retrying passport creation is rejected'
);

SELECT is(
  (SELECT count(*) FROM public.passports WHERE resident_id = 'd1000000-0000-4000-8000-000000000011'),
  1::bigint,
  'the rejected passport retry creates no duplicate'
);

-- A claimed scan without any job must retain the legacy compatibility path.
UPDATE public.scans
SET bounty_status = 'completed', completed_at = now()
WHERE id = 'd1000000-0000-4000-8000-000000000022';

SELECT is(
  (SELECT count(*) FROM public.intakes WHERE resident_id = 'd1000000-0000-4000-8000-000000000012'),
  1::bigint,
  'a non-job completion still creates one legacy intake'
);

SELECT is(
  (SELECT count(*) FROM public.passports WHERE resident_id = 'd1000000-0000-4000-8000-000000000012'),
  1::bigint,
  'a non-job completion still creates one legacy passport'
);

SELECT is(
  (SELECT wtwr_balance FROM public.residents WHERE id = 'd1000000-0000-4000-8000-000000000012'),
  400::numeric,
  'legacy completion still credits the wallet once'
);

SELECT is(
  (SELECT driver_payout_cents::numeric FROM public.scans WHERE id = 'd1000000-0000-4000-8000-000000000022'),
  100::numeric,
  'legacy completion still accrues the driver payout'
);

SELECT * FROM finish();
ROLLBACK;
