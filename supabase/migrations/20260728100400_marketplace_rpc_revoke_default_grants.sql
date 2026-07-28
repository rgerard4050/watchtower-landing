-- 20260728100400_marketplace_rpc_revoke_default_grants.sql
-- Fixes a gap in 20260728100300_marketplace_transactions.sql: this project
-- has a schema-level default privilege
--   ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role
-- that fires on every new function the postgres role creates, before any
-- REVOKE ALL ... FROM PUBLIC in the same migration runs. Revoking from
-- PUBLIC does not remove privileges already granted directly to anon/
-- authenticated by that default -- confirmed live via
-- information_schema.routine_privileges after applying 100300: both anon
-- and authenticated still had EXECUTE on accept_offer/complete_transaction,
-- meaning any client (even unauthenticated) could call sb.rpc() on either
-- function directly, bypassing /api/offers.js and /api/transactions.js
-- entirely -- exactly what those functions being service_role-only was
-- supposed to prevent.
--
-- Any future marketplace RPC intended to be service_role-only must repeat
-- this same explicit anon/authenticated revoke, not just REVOKE ... FROM
-- PUBLIC -- REVOKE ALL FROM PUBLIC alone is not sufficient on this project.

REVOKE EXECUTE ON FUNCTION public.accept_offer(uuid, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_transaction(uuid, bigint) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.accept_offer(uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_transaction(uuid, bigint) TO service_role;

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   GRANT EXECUTE ON FUNCTION public.accept_offer(uuid, bigint) TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.complete_transaction(uuid, bigint) TO anon, authenticated;
-- (Restores the prior, overly-broad state -- not recommended.)
-- ---------------------------------------------------------------------
