-- 20260722100000_sale_items.sql
-- Watchtower Revenue Console — SELL tab.
-- NOT YET APPLIED. Written for review; run manually when approved.
--
-- Additive only. Does not touch intakes/passports/manifests/dispatch or
-- any existing table or migration.

CREATE TABLE public.sale_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  category text,
  ask_price numeric,
  floor_price numeric,
  status text NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW', 'LISTED', 'PENDING', 'SOLD')),
  listed_at timestamptz,
  -- Not in your original field list -- added because "sum of sold_price
  -- this month" (MONEY tab) has no accurate date to filter on without it:
  -- created_at is when the item was entered, not when it sold, and an
  -- item could be created one month and sell the next. Strip this column
  -- (and the two lines below that set it) from the migration before
  -- running if you'd rather not track it -- the rest of the schema
  -- doesn't depend on it.
  sold_at timestamptz,
  sold_price numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operators select sale_items" ON public.sale_items
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY "operators insert sale_items" ON public.sale_items
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY "operators update sale_items" ON public.sale_items
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   DROP TABLE IF EXISTS public.sale_items;
-- ---------------------------------------------------------------------
