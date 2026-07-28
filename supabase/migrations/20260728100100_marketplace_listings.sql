-- 20260728100100_marketplace_listings.sql
-- Marketplace Phase 2, step 2 of 4: material_listings + listing_events.
--
-- Decision (explicit, from architecture review): manifest_id stays
-- NOT NULL. Marketplace inventory is manifest-backed only -- the existing
-- Intake -> Manifest -> Passport -> Dispatch -> Marketplace chain stays a
-- single unified path. Bounty/resident-pickup material (which is recovered
-- without a manifest today) is explicitly out of scope for Phase 2; if it
-- needs marketplace eligibility later, that's solved by normalizing bounty
-- completions into an auto-generated manifest upstream, not by weakening
-- this table.
--
-- Verification gate: a listing can only become AVAILABLE if
--   manifests.intake_id -> intakes.lifecycle_status = 'ACQUIRED'
--   AND manifests.passport_id IS NOT NULL
-- This mirrors the existing require_acquired_intake() trigger (which
-- already gates manifests/passports the same way) rather than checking
-- passports.lifecycle_status, which is confirmed dead -- nothing in this
-- codebase ever advances it past its 'CREATED' default, so gating on it
-- would permanently block every listing.

CREATE TABLE public.material_listings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  manifest_id bigint NOT NULL REFERENCES public.manifests(id),
  -- Set explicitly by /api/listings.js from the verified operator's id
  -- (getAuthedUser(access_token).id) -- not DEFAULT auth.uid(), because
  -- inserts happen via the service role key, under which auth.uid() is null.
  seller_id uuid REFERENCES public.operators(id),
  material_type text NOT NULL,
  grade text,
  available_weight numeric NOT NULL CHECK (available_weight > 0),
  asking_price numeric,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','AVAILABLE','RESERVED','SOLD','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_material_listings_manifest_id ON public.material_listings(manifest_id);
CREATE INDEX idx_material_listings_status ON public.material_listings(status);

ALTER TABLE public.material_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operators select material_listings" ON public.material_listings
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY "operators insert material_listings" ON public.material_listings
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY "operators update material_listings" ON public.material_listings
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());

-- Event log, same shape as intake_events / manifest_events / passport_events.
CREATE TABLE public.listing_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id bigint NOT NULL REFERENCES public.material_listings(id),
  event_type text NOT NULL CHECK (event_type IN ('LISTED','OFFER_RECEIVED','OFFER_ACCEPTED','SOLD')),
  actor text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_listing_events_listing_id ON public.listing_events(listing_id);

ALTER TABLE public.listing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operators select listing_events" ON public.listing_events
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY "operators insert listing_events" ON public.listing_events
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());

CREATE OR REPLACE FUNCTION public.validate_listing_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_ok boolean;
BEGIN
  IF NEW.status = 'AVAILABLE' THEN
    SELECT (i.lifecycle_status = 'ACQUIRED' AND m.passport_id IS NOT NULL)
      INTO v_ok
      FROM public.manifests m
      JOIN public.intakes i ON i.id = m.intake_id
      WHERE m.id = NEW.manifest_id;

    IF NOT COALESCE(v_ok, false) THEN
      RAISE EXCEPTION 'Cannot mark listing % AVAILABLE: manifest % has no verified (ACQUIRED intake + linked passport) material', NEW.id, NEW.manifest_id;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_validate_listing_verified
  BEFORE INSERT OR UPDATE OF status ON public.material_listings
  FOR EACH ROW EXECUTE FUNCTION public.validate_listing_verified();

-- LISTED / SOLD events, auto-written on the actual status transition --
-- same pattern as the existing log_passport_created() trigger, so no
-- client call site has to remember to log it by hand.
CREATE OR REPLACE FUNCTION public.log_listing_status_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'AVAILABLE' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'AVAILABLE') THEN
    INSERT INTO public.listing_events (listing_id, event_type, actor)
    VALUES (NEW.id, 'LISTED', NEW.seller_id::text);
  ELSIF NEW.status = 'SOLD' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'SOLD') THEN
    INSERT INTO public.listing_events (listing_id, event_type, actor)
    VALUES (NEW.id, 'SOLD', NEW.seller_id::text);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_log_listing_status_events
  AFTER INSERT OR UPDATE OF status ON public.material_listings
  FOR EACH ROW EXECUTE FUNCTION public.log_listing_status_events();

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   DROP TRIGGER IF EXISTS trg_log_listing_status_events ON public.material_listings;
--   DROP FUNCTION IF EXISTS public.log_listing_status_events();
--   DROP TRIGGER IF EXISTS trg_validate_listing_verified ON public.material_listings;
--   DROP FUNCTION IF EXISTS public.validate_listing_verified();
--   DROP POLICY IF EXISTS "operators insert listing_events" ON public.listing_events;
--   DROP POLICY IF EXISTS "operators select listing_events" ON public.listing_events;
--   DROP TABLE IF EXISTS public.listing_events;
--   DROP POLICY IF EXISTS "operators update material_listings" ON public.material_listings;
--   DROP POLICY IF EXISTS "operators insert material_listings" ON public.material_listings;
--   DROP POLICY IF EXISTS "operators select material_listings" ON public.material_listings;
--   DROP TABLE IF EXISTS public.material_listings;
-- ---------------------------------------------------------------------
