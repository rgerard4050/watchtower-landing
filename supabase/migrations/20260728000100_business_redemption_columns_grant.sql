-- 20260728000100_business_redemption_columns_grant.sql
--
-- Extends the column-scoped owner grant from 20260727130000 to cover the
-- three new Redemptions-tab controls. Confirmed via
-- information_schema.column_privileges after applying: authenticated's
-- UPDATE columns on businesses are exactly
-- {accepting_wtwr, address, contact_name, material_types, multiplier,
--  notes, phone, pickup_cadence, pickup_day, redemption_cap_monthly} --
-- tier, plan, monthly_rate, billing_status, verified, stripe_customer_id,
-- stripe_subscription_id remain owner-unwritable.
--
-- multiplier is bounded by businesses_multiplier_check (1.00-3.00, added in
-- 20260728000000) before being added here, specifically because
-- terminal.html's Cashier tab reads it at face value with no independent
-- check -- an unbounded self-set multiplier would otherwise be a payout
-- inflation path. redemption_cap_monthly and accepting_wtwr are
-- self-limiting (a business can only restrict itself with these) so they
-- carry no equivalent risk.

GRANT UPDATE (multiplier, redemption_cap_monthly, accepting_wtwr)
  ON businesses TO authenticated;

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   REVOKE UPDATE (multiplier, redemption_cap_monthly, accepting_wtwr) ON businesses FROM authenticated;
-- ---------------------------------------------------------------------
