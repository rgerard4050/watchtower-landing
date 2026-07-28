-- 20260728100300_marketplace_transactions.sql
-- Marketplace Phase 2, step 4 of 4: marketplace_transactions +
-- accept_offer()/complete_transaction() RPC functions.
--
-- Named marketplace_transactions, not transactions, because a table named
-- "transactions" already exists (legacy, 0 rows, tied to the unrelated
-- materials table) -- Postgres can't have two tables with the same name,
-- and per instruction that legacy table is left untouched rather than
-- reused or renamed.
--
-- accept_offer()/complete_transaction() copy the atomic
-- SECURITY DEFINER-function shape already established by
-- mint_wallet_token()/redeem_wtwr() (single Postgres function does the
-- whole multi-table state change, instead of sequential client REST
-- calls) -- but with two deliberate differences from that precedent, per
-- explicit instruction:
--   1. These must be invoked ONLY by the API layer (/api/offers.js,
--      /api/transactions.js) using the service role key, never directly by
--      client code. EXECUTE is granted to service_role only, not to
--      authenticated -- unlike redeem_wtwr, which terminal.html calls
--      directly via sb.rpc().
--   2. Defense in depth: each function also re-verifies the caller is a
--      real operator, via an explicit p_operator_id parameter checked
--      against public.operators inside the function body. This matters
--      specifically because calls arrive under the service_role key --
--      auth.uid() is null in that context, so is_operator() (which reads
--      auth.uid()) can't be used here the way it's used everywhere else in
--      this schema. The API layer resolves p_operator_id itself from the
--      caller's access_token via getAuthedUser() (same helper
--      pay-driver.js already uses) before calling either function, so this
--      is a second, independent check inside the function -- not the only
--      one -- in case the API-layer check is ever bypassed or has a bug.

CREATE TABLE public.marketplace_transactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id bigint NOT NULL REFERENCES public.material_listings(id),
  offer_id bigint REFERENCES public.offers(id),
  buyer_id uuid NOT NULL REFERENCES public.buyers(id),
  seller_id uuid REFERENCES public.operators(id),
  manifest_id bigint NOT NULL REFERENCES public.manifests(id),
  final_price numeric NOT NULL,
  final_weight numeric NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','COMPLETED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketplace_transactions_listing_id ON public.marketplace_transactions(listing_id);
CREATE INDEX idx_marketplace_transactions_manifest_id ON public.marketplace_transactions(manifest_id);

ALTER TABLE public.marketplace_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operators all marketplace_transactions" ON public.marketplace_transactions
  FOR ALL TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());

-- accept_offer: offer -> ACCEPTED, sibling PENDING offers on the same
-- listing -> REJECTED, listing -> RESERVED (the material_listings status
-- trigger does not log an event for RESERVED -- only AVAILABLE/SOLD are
-- logged there), insert a PENDING marketplace_transactions row, log
-- OFFER_ACCEPTED. All in one transaction.
CREATE OR REPLACE FUNCTION public.accept_offer(p_operator_id uuid, p_offer_id bigint)
RETURNS public.marketplace_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_offer public.offers%ROWTYPE;
  v_listing public.material_listings%ROWTYPE;
  v_row public.marketplace_transactions%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.operators WHERE id = p_operator_id) THEN
    RAISE EXCEPTION 'Caller % is not an authorized operator.', p_operator_id;
  END IF;

  SELECT * INTO v_offer FROM public.offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer % not found.', p_offer_id;
  END IF;
  IF v_offer.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Offer % is not pending (status: %).', p_offer_id, v_offer.status;
  END IF;

  SELECT * INTO v_listing FROM public.material_listings WHERE id = v_offer.listing_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing % not found.', v_offer.listing_id;
  END IF;
  IF v_listing.status <> 'AVAILABLE' THEN
    RAISE EXCEPTION 'Listing % is not AVAILABLE (status: %).', v_listing.id, v_listing.status;
  END IF;

  UPDATE public.offers SET status = 'ACCEPTED', updated_at = now() WHERE id = p_offer_id;

  UPDATE public.offers SET status = 'REJECTED', updated_at = now()
    WHERE listing_id = v_listing.id AND id <> p_offer_id AND status = 'PENDING';

  UPDATE public.material_listings SET status = 'RESERVED', updated_at = now() WHERE id = v_listing.id;

  INSERT INTO public.marketplace_transactions (
    listing_id, offer_id, buyer_id, seller_id, manifest_id, final_price, final_weight, status
  ) VALUES (
    v_listing.id, v_offer.id, v_offer.buyer_id, v_listing.seller_id, v_listing.manifest_id,
    v_offer.offered_price, v_offer.offered_weight, 'PENDING'
  )
  RETURNING * INTO v_row;

  INSERT INTO public.listing_events (listing_id, event_type, actor, notes)
  VALUES (
    v_listing.id, 'OFFER_ACCEPTED', p_operator_id::text,
    'offer ' || p_offer_id || ' accepted, marketplace_transactions ' || v_row.id || ' created'
  );

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_offer(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_offer(uuid, bigint) TO service_role;

-- complete_transaction: transaction -> COMPLETED, listing -> SOLD (the
-- material_listings status trigger auto-logs the SOLD event -- not
-- duplicated here).
CREATE OR REPLACE FUNCTION public.complete_transaction(p_operator_id uuid, p_transaction_id bigint)
RETURNS public.marketplace_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row public.marketplace_transactions%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.operators WHERE id = p_operator_id) THEN
    RAISE EXCEPTION 'Caller % is not an authorized operator.', p_operator_id;
  END IF;

  SELECT * INTO v_row FROM public.marketplace_transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction % not found.', p_transaction_id;
  END IF;
  IF v_row.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Transaction % is not pending (status: %).', p_transaction_id, v_row.status;
  END IF;

  UPDATE public.marketplace_transactions SET status = 'COMPLETED', updated_at = now()
    WHERE id = p_transaction_id
    RETURNING * INTO v_row;

  UPDATE public.material_listings SET status = 'SOLD', updated_at = now() WHERE id = v_row.listing_id;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_transaction(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_transaction(uuid, bigint) TO service_role;

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   REVOKE EXECUTE ON FUNCTION public.complete_transaction(uuid, bigint) FROM service_role;
--   DROP FUNCTION IF EXISTS public.complete_transaction(uuid, bigint);
--   REVOKE EXECUTE ON FUNCTION public.accept_offer(uuid, bigint) FROM service_role;
--   DROP FUNCTION IF EXISTS public.accept_offer(uuid, bigint);
--   DROP POLICY IF EXISTS "operators all marketplace_transactions" ON public.marketplace_transactions;
--   DROP TABLE IF EXISTS public.marketplace_transactions;
-- ---------------------------------------------------------------------
