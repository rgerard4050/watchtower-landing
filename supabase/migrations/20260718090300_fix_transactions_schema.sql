-- 20260718090300_fix_transactions_schema.sql
-- (mirrors operations/migrations/008_fix_transactions_schema.sql)
--
-- PROBLEM SOLVED:
-- operations/ops.js createTransaction (Ledger sale-recording step) inserts
-- {material_id, buyer, sale_price, date_sold}, but public.transactions only
-- had {material_id, pickup_status, final_value, reward_amount}. Every insert
-- failed with PGRST204 "Could not find the 'buyer' column of 'transactions'".
--
-- SCOPE: additive only. 0 existing rows in public.transactions at the time
-- this was applied, so no backfill is needed. Existing columns are untouched.

ALTER TABLE public.transactions
  ADD COLUMN buyer text,
  ADD COLUMN sale_price numeric,
  ADD COLUMN date_sold date;

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   ALTER TABLE public.transactions DROP COLUMN buyer;
--   ALTER TABLE public.transactions DROP COLUMN sale_price;
--   ALTER TABLE public.transactions DROP COLUMN date_sold;
-- ---------------------------------------------------------------------
