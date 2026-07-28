-- 20260728150000_marketplace_intelligence_views.sql
-- Phase 5 -- Marketplace Intelligence Layer.
--
-- No new tables. No changes to accept_offer(), complete_transaction(),
-- trg_validate_listing_verified, or the material_listings/offers/
-- marketplace_transactions schemas -- material_listings stays the only
-- inventory table (passport = identity, listing = commercial offer,
-- job = custody history, unchanged).
--
-- Two of the four views below are deliberately public (anon-readable) --
-- the one intentional exception to this session's "no anon" default.
-- material_listings has zero buyer/public read policy today (confirmed
-- live via pg_policies: only is_operator() can SELECT it), and there is
-- no buyer self-service auth/UI anywhere in this app, so a public,
-- no-login browse view is the only way anyone but an operator can see a
-- listing at all -- confirmed decision, not a default. Both public views
-- hard-filter to status='AVAILABLE' in their own body (not left to the
-- caller) and expose a fixed, deliberately narrow column list -- no
-- manifest_id, no seller_id, no intake cost/margin fields, no raw
-- lat/lng, no buyer data. This is narrower than the pre-existing
-- "anon select manifests" policy (qual: true, no column or row
-- restriction at all) already live in this schema before this session.

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_offers_created_at ON public.offers(created_at);
CREATE INDEX IF NOT EXISTS idx_listing_events_listing_created ON public.listing_events(listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_listings_status_created ON public.material_listings(status, created_at);

-- ---------------------------------------------------------------------
-- vw_marketplace_public: the buyer browse source. AVAILABLE only.
-- is_verified mirrors trg_validate_listing_verified's own gate exactly
-- (ACQUIRED intake + linked passport) -- always true for any row this
-- view can return (that gate already ran before the listing could become
-- AVAILABLE), included anyway so the buyer UI has an explicit field to
-- render instead of re-deriving trust from "it appeared on this page."
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_marketplace_public AS
SELECT
  ml.id AS listing_id,
  ml.material_type,
  ml.grade,
  ml.available_weight,
  ml.asking_price,
  ml.created_at,
  p.passport_id AS passport_public_id,
  p.manufacturer,
  p.model,
  p.serial,
  p.asset_tag,
  p.disposition,
  i.region AS location_region,
  (i.lifecycle_status = 'ACQUIRED' AND m.passport_id IS NOT NULL) AS is_verified
FROM public.material_listings ml
JOIN public.manifests m ON m.id = ml.manifest_id
JOIN public.intakes i ON i.id = m.intake_id
LEFT JOIN public.passports p ON p.id = COALESCE(ml.passport_id, m.passport_id)
WHERE ml.status = 'AVAILABLE';

-- ---------------------------------------------------------------------
-- vw_marketplace_listing_detail: same AVAILABLE-only base, plus photos
-- (passport photo + aggregated passport_evidence) and a provenance
-- timeline (passport_events + listing_events for this listing, merged
-- and ordered). Same column-exclusion rules as vw_marketplace_public.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_marketplace_listing_detail AS
SELECT
  ml.id AS listing_id,
  ml.material_type,
  ml.grade,
  ml.available_weight,
  ml.asking_price,
  ml.created_at,
  p.passport_id AS passport_public_id,
  p.manufacturer,
  p.model,
  p.serial,
  p.asset_tag,
  p.disposition,
  p.photo_url,
  i.region AS location_region,
  (i.lifecycle_status = 'ACQUIRED' AND m.passport_id IS NOT NULL) AS is_verified,
  COALESCE(ev.photos, '[]'::jsonb) AS evidence_photos,
  COALESCE(tl.timeline, '[]'::jsonb) AS provenance_timeline
FROM public.material_listings ml
JOIN public.manifests m ON m.id = ml.manifest_id
JOIN public.intakes i ON i.id = m.intake_id
LEFT JOIN public.passports p ON p.id = COALESCE(ml.passport_id, m.passport_id)
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
           jsonb_build_object(
             'photo_path', pe.photo_path,
             'evidence_type', pe.evidence_type,
             'verification_status', pe.verification_status,
             'uploaded_at', pe.uploaded_at
           ) ORDER BY pe.uploaded_at
         ) AS photos
  FROM public.passport_evidence pe
  WHERE pe.passport_id = p.id
) ev ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('event_type', x.event_type, 'created_at', x.created_at) ORDER BY x.created_at) AS timeline
  FROM (
    SELECT event_type, created_at FROM public.passport_events WHERE passport_id = p.id
    UNION ALL
    SELECT event_type, created_at FROM public.listing_events WHERE listing_id = ml.id
  ) x
) tl ON true
WHERE ml.status = 'AVAILABLE';

-- ---------------------------------------------------------------------
-- vw_marketplace_operator_intel: operator-only (security_invoker so RLS
-- is evaluated as the querying operator, same as every Phase 4 view).
-- One row per non-CLOSED listing. "Aging"/"inactive" thresholds are
-- named rules, not a config table -- same approach as Phase 4's
-- vw_job_exceptions:
--   aging:    AVAILABLE, zero offers, listed 14+ days ago -- published
--             and not moving.
--   inactive: DRAFT for 7+ days -- created but never published at all.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_marketplace_operator_intel
WITH (security_invoker = true) AS
SELECT
  ml.id AS listing_id,
  ml.status,
  ml.material_type,
  ml.grade,
  ml.available_weight,
  ml.asking_price,
  ml.created_at,
  COALESCE(le.listed_at, ml.created_at) AS effective_listed_at,
  EXTRACT(DAY FROM now() - COALESCE(le.listed_at, ml.created_at))::int AS days_listed,
  COALESCE(oc.offer_count, 0) AS offer_count,
  oc.last_offer_at,
  (ml.status = 'AVAILABLE' AND COALESCE(oc.offer_count, 0) = 0
     AND now() - COALESCE(le.listed_at, ml.created_at) > interval '14 days') AS aging,
  (ml.status = 'DRAFT' AND now() - ml.created_at > interval '7 days') AS inactive
FROM public.material_listings ml
LEFT JOIN LATERAL (
  SELECT min(created_at) AS listed_at FROM public.listing_events
  WHERE listing_id = ml.id AND event_type = 'LISTED'
) le ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS offer_count, max(created_at) AS last_offer_at
  FROM public.offers WHERE listing_id = ml.id
) oc ON true
WHERE ml.status <> 'CLOSED';

-- ---------------------------------------------------------------------
-- vw_marketplace_buyer_activity: operator-only, one row per buyer --
-- offer volume/recency/acceptance and which materials they're active on
-- (demand signal by buyer; demand-by-material itself is a simple
-- GROUP BY the operator page runs directly against offers/
-- material_listings, both already is_operator()-gated -- no fifth view
-- needed for one aggregate query).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_marketplace_buyer_activity
WITH (security_invoker = true) AS
SELECT
  b.id AS buyer_id,
  b.company_name,
  b.buyer_type,
  COALESCE(o.offer_count, 0) AS offer_count,
  o.last_offer_at,
  COALESCE(o.accepted_count, 0) AS accepted_offer_count,
  COALESCE(o.materials, '{}') AS materials_offered
FROM public.buyers b
LEFT JOIN LATERAL (
  SELECT
    count(*) AS offer_count,
    max(o2.created_at) AS last_offer_at,
    count(*) FILTER (WHERE o2.status = 'ACCEPTED') AS accepted_count,
    array_agg(DISTINCT ml2.material_type) AS materials
  FROM public.offers o2
  JOIN public.material_listings ml2 ON ml2.id = o2.listing_id
  WHERE o2.buyer_id = b.id
) o ON true;

-- ---------------------------------------------------------------------
-- Grants, explicit -- not left to Supabase's default privileges.
-- REVOKE ALL must name anon/authenticated directly, not just PUBLIC:
-- this project's default privileges grant INSERT/UPDATE/DELETE/TRUNCATE/
-- REFERENCES/TRIGGER (not just SELECT) directly to anon/authenticated on
-- every new relation, and "REVOKE ALL FROM PUBLIC" alone does not strip
-- privileges already granted directly to a role -- confirmed live via
-- information_schema.role_table_grants after first applying this
-- migration with only "FROM PUBLIC": authenticated (and anon, on the two
-- public views) still held every verb beyond SELECT. Same class of leak
-- already documented for functions in
-- 20260728100400_marketplace_rpc_revoke_default_grants.sql, just for
-- relations instead. Not exploitable today (none of these views are
-- updatable -- multi-table joins/aggregates -- so INSERT/UPDATE/DELETE
-- would fail regardless), but fixed to match the SELECT-only design
-- intent rather than relying on that.
-- ---------------------------------------------------------------------
REVOKE ALL ON public.vw_marketplace_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vw_marketplace_public TO anon, authenticated;
REVOKE ALL ON public.vw_marketplace_listing_detail FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vw_marketplace_listing_detail TO anon, authenticated;
REVOKE ALL ON public.vw_marketplace_operator_intel FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vw_marketplace_operator_intel TO authenticated;
REVOKE ALL ON public.vw_marketplace_buyer_activity FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vw_marketplace_buyer_activity TO authenticated;

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   DROP VIEW IF EXISTS public.vw_marketplace_buyer_activity;
--   DROP VIEW IF EXISTS public.vw_marketplace_operator_intel;
--   DROP VIEW IF EXISTS public.vw_marketplace_listing_detail;
--   DROP VIEW IF EXISTS public.vw_marketplace_public;
--   DROP INDEX IF EXISTS public.idx_material_listings_status_created;
--   DROP INDEX IF EXISTS public.idx_listing_events_listing_created;
--   DROP INDEX IF EXISTS public.idx_offers_created_at;
-- ---------------------------------------------------------------------
