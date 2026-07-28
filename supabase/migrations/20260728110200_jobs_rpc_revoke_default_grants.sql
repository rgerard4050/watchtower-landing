-- 20260728110200_jobs_rpc_revoke_default_grants.sql
-- Two layers of default-grant leakage found and closed on the 6 jobs RPC
-- functions, same class of issue as
-- 20260728100400_marketplace_rpc_revoke_default_grants.sql:
--   1. This project's Supabase-level default privileges grant EXECUTE to
--      anon/authenticated/service_role on every new function.
--   2. Separately, core Postgres itself auto-grants EXECUTE to the PUBLIC
--      pseudo-role on every CREATE FUNCTION unless explicitly revoked --
--      every role (including anon) inherits from PUBLIC, so revoking the
--      direct anon/service_role grants alone is not sufficient.
--
-- Final intended state, now the standard template for future Watchtower
-- state-transition RPCs: SECURITY DEFINER, owner = postgres (verified via
-- pg_proc.prosecdef/proowner), PUBLIC and unneeded roles explicitly
-- revoked, only the intended actor role granted.

REVOKE EXECUTE ON FUNCTION public.claim_job(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.job_mark_en_route(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.job_mark_arrived(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.job_record_scan(bigint, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.job_create_intake(bigint, numeric, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.job_create_passport(bigint) FROM PUBLIC;

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   GRANT EXECUTE ON FUNCTION public.claim_job(bigint) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.job_mark_en_route(bigint) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.job_mark_arrived(bigint) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.job_record_scan(bigint, jsonb) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.job_create_intake(bigint, numeric, numeric) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.job_create_passport(bigint) TO PUBLIC;
-- (Restores the prior, overly-broad state -- not recommended.)
-- ---------------------------------------------------------------------
