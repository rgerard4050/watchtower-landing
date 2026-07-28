-- 20260727130000_business_column_scoped_grants.sql
--
-- The self-service UPDATE policy added in 20260727120000 was correct on row
-- scope (auth.uid() = auth_id) but RLS cannot restrict columns -- that's a
-- GRANT concern, and businesses still carried Supabase's default bootstrap
-- grant (GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated),
-- confirmed via information_schema.role_table_grants: UPDATE was table-wide
-- for both anon and authenticated, no column restriction. Combined with the
-- new policy, a signed-in business owner could UPDATE any column on their
-- own row -- tier, monthly_rate, billing_status, verified,
-- stripe_customer_id, stripe_subscription_id included. That's a direct
-- billing-bypass path (set billing_status = 'active' and never pay).
--
-- anon is revoked entirely -- anon's auth.uid() is always NULL, so it can
-- never satisfy auth.uid() = auth_id on any real row, but there is no
-- reason to leave the grant sitting there regardless.
--
-- authenticated keeps UPDATE only on the columns a business owner
-- legitimately maintains themselves. Everything else -- tier, plan,
-- monthly_rate, multiplier, billing_status, verified, stripe_customer_id,
-- stripe_subscription_id, business_name, wtwr_redeemed,
-- disposal_cost_saved, and the rest -- becomes owner-unwritable. Those get
-- written only by the Stripe webhook (service_role, which bypasses grants
-- and RLS) or by an operator (separate "operators update businesses"
-- policy, untouched by this migration).

REVOKE UPDATE ON businesses FROM anon;
REVOKE UPDATE ON businesses FROM authenticated;

GRANT UPDATE (material_types, contact_name, phone, address, notes, pickup_day, pickup_cadence)
  ON businesses TO authenticated;

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   GRANT UPDATE ON businesses TO authenticated, anon;
--   -- (restores the original blanket grant -- not recommended)
-- ---------------------------------------------------------------------
