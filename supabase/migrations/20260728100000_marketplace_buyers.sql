-- 20260728100000_marketplace_buyers.sql
-- Marketplace Phase 2, step 1 of 4: buyer accounts.
--
-- Additive only. Does not touch intakes/manifests/passports/dispatch,
-- sale_items, transactions, or materials.
--
-- All marketplace WRITES in Phase 2 go through /api/listings.js,
-- /api/offers.js, /api/transactions.js using the service role key -- per
-- explicit decision, operator pages do not write to marketplace tables
-- directly. The RLS policies below are defense-in-depth (so a stray direct
-- client call is still blocked the same way every other table in this
-- schema is) and support direct reads, not the primary write path.

CREATE TABLE public.buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id uuid REFERENCES auth.users(id),
  company_name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  location text,
  buyer_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.buyers ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER so it can be used inside other tables' RLS policies,
-- same shape as is_operator(). Not yet called anywhere (no buyer
-- self-service UI exists in Phase 2), but added now so a future buyer
-- portal doesn't need a schema change to gain it.
CREATE OR REPLACE FUNCTION public.is_buyer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.buyers WHERE auth_id = auth.uid());
$$;

CREATE POLICY "operators select buyers" ON public.buyers
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY "operators insert buyers" ON public.buyers
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY "operators update buyers" ON public.buyers
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE POLICY "buyers select own record" ON public.buyers
  FOR SELECT TO authenticated USING (auth.uid() = auth_id);

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   DROP POLICY IF EXISTS "buyers select own record" ON public.buyers;
--   DROP POLICY IF EXISTS "operators update buyers" ON public.buyers;
--   DROP POLICY IF EXISTS "operators insert buyers" ON public.buyers;
--   DROP POLICY IF EXISTS "operators select buyers" ON public.buyers;
--   DROP FUNCTION IF EXISTS public.is_buyer();
--   DROP TABLE IF EXISTS public.buyers;
-- ---------------------------------------------------------------------
