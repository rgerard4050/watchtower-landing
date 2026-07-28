-- 20260728120000_passport_marketplace_bridge_core.sql
-- Passport -> Marketplace bridge, step 1 of 2: schema additions.
--
-- Two real gaps found while implementing this, both closed here rather
-- than worked around:
--
-- 1. material_listings has no passport_id column at all today -- the
--    existing marketplace Phase 2 work keyed listings off manifest_id
--    only. Adding it (nullable, so every existing manifest-only listing
--    stays valid) plus a partial unique index so a passport can never
--    back more than one non-CLOSED listing.
--
-- 2. material_listings.manifest_id is NOT NULL (deliberate prior
--    decision -- marketplace inventory stays manifest-backed, no second
--    inventory system). Bounty-path jobs (Phase 1 of the driver workflow)
--    produce passports with NO manifest at all. The RPC in the next
--    migration resolves this by auto-generating a minimal manifest when
--    the passport doesn't already have one -- exactly the normalization
--    the marketplace migration's own comment already flagged as the
--    intended future fix ("solved by normalizing bounty completions into
--    an auto-generated manifest upstream, not by weakening this table").
--    No schema change needed for that part; noted here since it's the
--    reason passport_id is nullable rather than assuming every listing
--    now has one.
--
-- Also widens listing_events.event_type to add LISTING_CREATED (fired on
-- every listing insert, regardless of initial status) and updates
-- log_listing_status_events() accordingly -- today a listing inserted as
-- DRAFT logs nothing at all, which is the actual gap behind "the history
-- should answer how did this listing come into existence." LISTED/SOLD
-- transition-logging behavior is unchanged.
--
-- Nothing here touches trg_validate_listing_verified (the AVAILABLE gate),
-- accept_offer(), or complete_transaction() -- per instruction, those stay
-- exactly as they are.

ALTER TABLE public.material_listings
  ADD COLUMN passport_id bigint REFERENCES public.passports(id);

CREATE UNIQUE INDEX material_listings_passport_id_active_uniq
  ON public.material_listings(passport_id) WHERE status <> 'CLOSED';

-- ---- listing_events.event_type: add LISTING_CREATED ----
-- Requires dropping and re-adding the CHECK constraint (flagged for
-- review per this repo's SQL rules -- DROP anything requires printing
-- and waiting).
ALTER TABLE public.listing_events DROP CONSTRAINT listing_events_event_type_check;
ALTER TABLE public.listing_events ADD CONSTRAINT listing_events_event_type_check
  CHECK (event_type = ANY (ARRAY['LISTING_CREATED','LISTED','OFFER_RECEIVED','OFFER_ACCEPTED','SOLD']));

CREATE OR REPLACE FUNCTION public.log_listing_status_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.listing_events (listing_id, event_type, actor, notes)
    VALUES (NEW.id, 'LISTING_CREATED', NEW.seller_id::text,
      CASE WHEN NEW.passport_id IS NOT NULL THEN 'from passport ' || NEW.passport_id ELSE NULL END);
    IF NEW.status = 'AVAILABLE' THEN
      INSERT INTO public.listing_events (listing_id, event_type, actor)
      VALUES (NEW.id, 'LISTED', NEW.seller_id::text);
    END IF;
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'AVAILABLE' THEN
      INSERT INTO public.listing_events (listing_id, event_type, actor)
      VALUES (NEW.id, 'LISTED', NEW.seller_id::text);
    ELSIF NEW.status = 'SOLD' THEN
      INSERT INTO public.listing_events (listing_id, event_type, actor)
      VALUES (NEW.id, 'SOLD', NEW.seller_id::text);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   ALTER TABLE public.listing_events DROP CONSTRAINT listing_events_event_type_check;
--   ALTER TABLE public.listing_events ADD CONSTRAINT listing_events_event_type_check
--     CHECK (event_type = ANY (ARRAY['LISTED','OFFER_RECEIVED','OFFER_ACCEPTED','SOLD']));
--   (restores prior log_listing_status_events() body manually if needed)
--   DROP INDEX IF EXISTS material_listings_passport_id_active_uniq;
--   ALTER TABLE public.material_listings DROP COLUMN IF EXISTS passport_id;
-- ---------------------------------------------------------------------
