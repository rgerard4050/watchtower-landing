-- 20260720180000_command_center_views.sql
-- Command Center v1: five read-only views over real, existing tables only.
-- No new tables, no fabricated metrics.
--
-- BLOCKER FOUND DURING REVIEW: dispatch_runs has INSERT/UPDATE policies for
-- operators but no SELECT policy at all -- not even operators can read it
-- today. Confirmed live via pg_policies. Without fixing this,
-- vw_dispatch_summary returns nothing for anyone. Adding the missing
-- operator SELECT policy, same is_operator() pattern used everywhere else.
CREATE POLICY "operators select dispatch_runs" ON public.dispatch_runs
  FOR SELECT TO authenticated USING (public.is_operator());

-- Views inherit RLS from their underlying tables for the querying role, so
-- no separate grants are needed beyond the policy above -- intakes,
-- passports, and passport_evidence already have operator SELECT policies.

CREATE VIEW public.vw_inventory_summary AS
SELECT
  material,
  count(*) item_count,
  sum(weight_lb) total_weight_lb,
  sum(gross_value) total_estimated_value
FROM public.intakes
WHERE lifecycle_status='ACQUIRED'
GROUP BY material;

CREATE VIEW public.vw_dispatch_summary AS
SELECT
  status,
  count(*) run_count
FROM public.dispatch_runs
GROUP BY status;

CREATE VIEW public.vw_network_value AS
SELECT
  sum(gross_value) estimated_value,
  count(*) acquired_count
FROM public.intakes
WHERE lifecycle_status='ACQUIRED';

CREATE VIEW public.vw_material_flow AS
SELECT
  date_trunc('day',created_at) AS flow_day,
  count(*) AS intake_count,
  sum(weight_lb) AS weight_lb
FROM public.intakes
GROUP BY date_trunc('day',created_at);

CREATE VIEW public.vw_alert_queue AS
SELECT
  'INTAKE_NOT_ACQUIRED' alert_type,
  id::text entity_id,
  intake_number,
  created_at
FROM public.intakes
WHERE lifecycle_status='VERIFIED'

UNION ALL

SELECT
  'PASSPORT_NO_EVIDENCE',
  p.id::text,
  p.passport_id,
  p.created_at
FROM public.passports p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.passport_evidence e
  WHERE e.passport_id=p.id
);

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   DROP VIEW IF EXISTS public.vw_alert_queue;
--   DROP VIEW IF EXISTS public.vw_material_flow;
--   DROP VIEW IF EXISTS public.vw_network_value;
--   DROP VIEW IF EXISTS public.vw_dispatch_summary;
--   DROP VIEW IF EXISTS public.vw_inventory_summary;
--   DROP POLICY IF EXISTS "operators select dispatch_runs" ON public.dispatch_runs;
-- ---------------------------------------------------------------------
