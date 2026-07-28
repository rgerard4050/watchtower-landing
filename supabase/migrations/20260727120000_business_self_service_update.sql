-- 20260727120000_business_self_service_update.sql
--
-- businesses had self-service SELECT and INSERT for the owner
-- (auth.uid() = auth_id) but no self-service UPDATE -- only operators could
-- UPDATE. Confirmed by querying pg_policies directly before writing this.
-- Blocks the business.html workspace: an owner could never edit their own
-- material_types (My Streams tab) or have their own stripe_customer_id /
-- stripe_subscription_id written back after Stripe Checkout (Billing tab).
--
-- Additive only -- does not touch the existing operator UPDATE policy.

CREATE POLICY "Businesses can update their own profile" ON public.businesses
  FOR UPDATE TO public
  USING (auth.uid() = auth_id)
  WITH CHECK (auth.uid() = auth_id);

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   DROP POLICY IF EXISTS "Businesses can update their own profile" ON public.businesses;
-- ---------------------------------------------------------------------
