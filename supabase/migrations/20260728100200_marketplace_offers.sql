-- 20260728100200_marketplace_offers.sql
-- Marketplace Phase 2, step 3 of 4: buyer offers on listings.
--
-- No buyer self-service auth/UI exists yet (Phase 2 scope is the internal
-- operator control panel only), so today offers are created by an operator
-- on a buyer's behalf via /api/offers.js. The "buyers select own offers"
-- policy is prepared for when buyer self-service auth exists, so that adds
-- to RLS rather than requiring a change to this table.

CREATE TABLE public.offers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id bigint NOT NULL REFERENCES public.material_listings(id),
  buyer_id uuid NOT NULL REFERENCES public.buyers(id),
  offered_price numeric NOT NULL CHECK (offered_price > 0),
  offered_weight numeric NOT NULL CHECK (offered_weight > 0),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','ACCEPTED','REJECTED','WITHDRAWN')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_offers_listing_id ON public.offers(listing_id);
CREATE INDEX idx_offers_buyer_id ON public.offers(buyer_id);
-- At most one ACCEPTED offer per listing.
CREATE UNIQUE INDEX offers_listing_accepted_uniq ON public.offers(listing_id) WHERE status = 'ACCEPTED';

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operators select offers" ON public.offers
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY "operators insert offers" ON public.offers
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY "operators update offers" ON public.offers
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE POLICY "buyers select own offers" ON public.offers
  FOR SELECT TO authenticated
  USING (buyer_id IN (SELECT id FROM public.buyers WHERE auth_id = auth.uid()));

-- OFFER_RECEIVED, auto-written on every new offer -- same pattern as
-- log_passport_created() / log_listing_status_events().
CREATE OR REPLACE FUNCTION public.log_offer_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.listing_events (listing_id, event_type, actor, notes)
  VALUES (
    NEW.listing_id,
    'OFFER_RECEIVED',
    NEW.buyer_id::text,
    'offer ' || NEW.id || ': ' || NEW.offered_price || ' for ' || NEW.offered_weight
  );
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_log_offer_received
  AFTER INSERT ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.log_offer_received();

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   DROP TRIGGER IF EXISTS trg_log_offer_received ON public.offers;
--   DROP FUNCTION IF EXISTS public.log_offer_received();
--   DROP POLICY IF EXISTS "buyers select own offers" ON public.offers;
--   DROP POLICY IF EXISTS "operators update offers" ON public.offers;
--   DROP POLICY IF EXISTS "operators insert offers" ON public.offers;
--   DROP POLICY IF EXISTS "operators select offers" ON public.offers;
--   DROP TABLE IF EXISTS public.offers;
-- ---------------------------------------------------------------------
