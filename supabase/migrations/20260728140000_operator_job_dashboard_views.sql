-- 20260728140000_operator_job_dashboard_views.sql
-- Phase 4 -- Operator Command Center, step 1 of 1: read-only dashboard
-- views over the existing jobs pipeline, plus indexes those views need.
--
-- No new tables. No new mutation surface -- every RPC and RLS policy from
-- Phases 1-3 is untouched. This migration is additive (CREATE INDEX IF NOT
-- EXISTS, CREATE OR REPLACE VIEW) except for the REVOKE block at the end,
-- which is grants-only and is being applied explicitly rather than left to
-- Postgres/Supabase's default privileges (see below).
--
-- ---------------------------------------------------------------------
-- Indexes: jobs.resident_id/intake_id/passport_id/created_at and
-- job_events(job_id, created_at desc) had no index. Fine at today's row
-- counts, but the dashboard/detail queries below join and sort on exactly
-- these columns, so adding them now rather than after the dashboard is
-- live and slow.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_jobs_resident_id ON public.jobs(resident_id);
CREATE INDEX IF NOT EXISTS idx_jobs_intake_id ON public.jobs(intake_id);
CREATE INDEX IF NOT EXISTS idx_jobs_passport_id ON public.jobs(passport_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_job_events_job_created ON public.job_events(job_id, created_at DESC);

-- ---------------------------------------------------------------------
-- vw_job_dashboard: one row per job, joined with everything the operator
-- console needs to display without a second round trip per row.
--
-- security_invoker=true (supported: this project runs Postgres 17) means
-- the view is evaluated with the *querying* role's RLS, not the view
-- owner's -- matching the documented intent of the existing Command
-- Center views, made explicit here instead of relying on the implicit
-- default.
--
-- "Driver identity" is driver_id + verification/payout flags only --
-- public.drivers has no name/email column anywhere in this schema, and no
-- other page in the app displays one for the bounty-driver path. Adding a
-- display name is a separate change (new column+backfill, or an
-- auth.admin lookup via an Edge Function); not fabricated here.
--
-- payout_status and wtwr_credit_status are *derived*, not stored --
-- neither is a real column anywhere. Both are driven off the same
-- scans.bounty_status='completed' moment that job_create_intake() sets:
--   payout_status:  scans.driver_payout_cents / driver_transfer_id
--                    (set by record_driver_payout_on_bounty_completion()
--                    trigger, then driver_transfer_id later by the
--                    existing /api/pay-driver batch payout flow)
--   wtwr_credit_status: credit_resident_on_bounty_completion() fires in
--                    the same trigger moment, so "job has reached INTAKE
--                    or later, with a resident_id" implies credited.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_job_dashboard
WITH (security_invoker = true) AS
SELECT
  j.id AS job_id,
  j.source_type,
  j.status,
  j.created_at,
  j.updated_at,
  j.driver_id,
  d.verification_status AS driver_verification_status,
  d.stripe_payouts_enabled AS driver_payouts_enabled,
  j.resident_id,
  r.name AS resident_name,
  j.scan_id,
  s.summary AS scan_summary,
  s.est_high AS scan_est_high,
  s.bounty_status AS scan_bounty_status,
  j.intake_id,
  i.material AS intake_material,
  i.weight_lb AS intake_weight_lb,
  i.gross_value AS intake_gross_value,
  j.passport_id,
  p.passport_id AS passport_public_id,
  p.status AS passport_status,
  lst.id AS listing_id,
  lst.status AS listing_status,
  lst.material_type AS listing_material_type,
  le.event_type AS last_event_type,
  le.created_at AS last_event_at,
  CASE
    WHEN s.driver_transfer_id IS NOT NULL THEN 'PAID'
    WHEN s.driver_payout_cents IS NOT NULL THEN 'PENDING'
    ELSE 'NONE'
  END AS payout_status,
  CASE
    WHEN j.resident_id IS NULL THEN 'N/A'
    WHEN j.status IN ('INTAKE','PASSPORT','MARKETPLACE','COMPLETED') THEN 'CREDITED'
    ELSE 'PENDING'
  END AS wtwr_credit_status
FROM public.jobs j
LEFT JOIN public.drivers d ON d.user_id = j.driver_id
LEFT JOIN public.residents r ON r.id = j.resident_id
LEFT JOIN public.scans s ON s.id = j.scan_id
LEFT JOIN public.intakes i ON i.id = j.intake_id
LEFT JOIN public.passports p ON p.id = j.passport_id
LEFT JOIN LATERAL (
  SELECT ml.id, ml.status, ml.material_type
  FROM public.material_listings ml
  WHERE ml.passport_id = j.passport_id
  ORDER BY ml.created_at DESC
  LIMIT 1
) lst ON true
LEFT JOIN LATERAL (
  SELECT je.event_type, je.created_at
  FROM public.job_events je
  WHERE je.job_id = j.id
  ORDER BY je.created_at DESC
  LIMIT 1
) le ON true;

-- ---------------------------------------------------------------------
-- vw_job_exceptions: jobs that need operator attention. There is no
-- "failed" flag anywhere in this schema (every job RPC is transactional --
-- it fully succeeds or raises and persists nothing), so "intake failed" /
-- "passport creation failed" / "listing creation failed" from the spec
-- are read honestly as *staleness*: a job sitting in a non-terminal
-- status without progressing. Thresholds are named per rule below, not a
-- config table (no new infra), and are chosen relative to what a driver
-- is actually doing in that state:
--   PENDING   24h  -- nobody has claimed it; long enough that "just
--                     posted" isn't a false positive, short enough that
--                     it's a real problem, not routine backlog
--   CLAIMED    2h  -- a driver accepted the job but never even started
--                     moving; short window because "on my way" should be
--                     one screen tap away
--   EN_ROUTE/ARRIVED/SCANNING  2h  -- mid-pickup states; a driver
--                     shouldn't be mid-workflow for hours
--   INTAKE     2h  -- intake logged but passport never generated
--   PASSPORT   2h  -- passport exists but no listing created yet
-- SCAN_STATE_MISMATCH has no time threshold -- it is a real
-- data-consistency check: the job reached INTAKE or later (which only
-- happens after job_create_intake() sets scans.bounty_status='completed'
-- as a mechanical side effect) but the mirrored scans row was never
-- actually flipped, meaning the trigger-fired resident-credit/driver-payout
-- side effects may not have run. Should never fire against a job created
-- through job.html's own RPCs; existing to catch drift, not expected to
-- return rows today.
-- RECENTLY_CANCELLED is capped to the last 24h so it doesn't grow
-- unbounded -- visibility into recent cancellations, not a permanent log
-- (job_events already is that permanent log).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_job_exceptions
WITH (security_invoker = true) AS
SELECT j.id AS job_id, 'UNCLAIMED_TOO_LONG' AS exception_type, j.status,
       now() - j.created_at AS since
FROM public.jobs j
WHERE j.status = 'PENDING' AND j.created_at < now() - interval '24 hours'

UNION ALL
SELECT j.id, 'CLAIMED_INACTIVE', j.status, now() - j.claimed_at
FROM public.jobs j
WHERE j.status = 'CLAIMED' AND j.claimed_at < now() - interval '2 hours'

UNION ALL
SELECT j.id, 'STALLED_IN_PROGRESS', j.status, now() - j.updated_at
FROM public.jobs j
WHERE j.status IN ('EN_ROUTE','ARRIVED','SCANNING') AND j.updated_at < now() - interval '2 hours'

UNION ALL
SELECT j.id, 'INTAKE_NOT_ADVANCING', j.status, now() - j.updated_at
FROM public.jobs j
WHERE j.status = 'INTAKE' AND j.updated_at < now() - interval '2 hours'

UNION ALL
SELECT j.id, 'PASSPORT_NOT_LISTED', j.status, now() - j.updated_at
FROM public.jobs j
WHERE j.status = 'PASSPORT' AND j.updated_at < now() - interval '2 hours'

UNION ALL
SELECT j.id, 'SCAN_STATE_MISMATCH', j.status, now() - j.updated_at
FROM public.jobs j
JOIN public.scans s ON s.id = j.scan_id
WHERE j.status IN ('INTAKE','PASSPORT','MARKETPLACE','COMPLETED')
  AND s.bounty_status <> 'completed'

UNION ALL
SELECT j.id, 'RECENTLY_CANCELLED', j.status, now() - j.updated_at
FROM public.jobs j
WHERE j.status = 'CANCELLED' AND j.updated_at > now() - interval '24 hours';

-- ---------------------------------------------------------------------
-- Grants for the two new views: explicit, not left to Supabase's default
-- privileges. authenticated only -- RLS on the underlying tables (all
-- already is_operator()-gated for read) does the rest of the work; a
-- driver's own "select own jobs"/"select own job_events" policies also
-- apply through security_invoker, but a driver has no legitimate use for
-- these dashboard views (job.html reads jobs/job_events directly), so
-- this is belt-and-suspenders, not a new access path.
-- ---------------------------------------------------------------------
REVOKE ALL ON public.vw_job_dashboard FROM PUBLIC, anon;
GRANT SELECT ON public.vw_job_dashboard TO authenticated;
REVOKE ALL ON public.vw_job_exceptions FROM PUBLIC, anon;
GRANT SELECT ON public.vw_job_exceptions TO authenticated;

-- ---------------------------------------------------------------------
-- Pre-existing leak found during this migration's audit, fixed here per
-- explicit confirmation: the 5 Command Center views from
-- 20260720180000_command_center_views.sql were never given explicit
-- grants, so Supabase's default relation privileges left them SELECT-able
-- (plus INSERT/UPDATE/DELETE/TRUNCATE, though none of these views are
-- updatable so those verbs would fail at runtime -- SELECT is the real,
-- exploitable exposure) by *anon* -- unauthenticated reads of intake
-- counts/values, dispatch summaries, and the alert queue (which includes
-- intake_number/passport_id). Same default-grant pattern that's been
-- closed on every RPC this session, just on relations instead of
-- functions this time. Restricting to authenticated (still no RLS gate
-- on these specific views since they don't filter by is_operator() today
-- -- that's a separate, pre-existing design question, out of scope here;
-- this migration only removes anonymous access, matching Phase 4's "no
-- anon access" requirement).
-- ---------------------------------------------------------------------
REVOKE ALL ON public.vw_inventory_summary FROM PUBLIC, anon;
GRANT SELECT ON public.vw_inventory_summary TO authenticated;
REVOKE ALL ON public.vw_dispatch_summary FROM PUBLIC, anon;
GRANT SELECT ON public.vw_dispatch_summary TO authenticated;
REVOKE ALL ON public.vw_network_value FROM PUBLIC, anon;
GRANT SELECT ON public.vw_network_value TO authenticated;
REVOKE ALL ON public.vw_material_flow FROM PUBLIC, anon;
GRANT SELECT ON public.vw_material_flow TO authenticated;
REVOKE ALL ON public.vw_alert_queue FROM PUBLIC, anon;
GRANT SELECT ON public.vw_alert_queue TO authenticated;

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   GRANT SELECT ON public.vw_alert_queue TO anon;
--   GRANT SELECT ON public.vw_material_flow TO anon;
--   GRANT SELECT ON public.vw_network_value TO anon;
--   GRANT SELECT ON public.vw_dispatch_summary TO anon;
--   GRANT SELECT ON public.vw_inventory_summary TO anon;
--   DROP VIEW IF EXISTS public.vw_job_exceptions;
--   DROP VIEW IF EXISTS public.vw_job_dashboard;
--   DROP INDEX IF EXISTS public.idx_job_events_job_created;
--   DROP INDEX IF EXISTS public.idx_jobs_created_at;
--   DROP INDEX IF EXISTS public.idx_jobs_passport_id;
--   DROP INDEX IF EXISTS public.idx_jobs_intake_id;
--   DROP INDEX IF EXISTS public.idx_jobs_resident_id;
-- ---------------------------------------------------------------------
