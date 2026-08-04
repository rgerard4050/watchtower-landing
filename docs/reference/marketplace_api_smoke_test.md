# Marketplace API Smoke Test

Tracks verification of the marketplace `/api` layer (`api/buyers.js`, `api/listings.js`, `api/offers.js`, `api/transactions.js`) against the deployed Vercel project, separate from the DB-level verification already done in the foundation commit (schema, RPC security, triggers, permissions, invariants — see the `20260728100xxx_marketplace_*.sql` migrations and their in-file rollback/verification notes).

All four endpoints are POST-only with an `action` field for every operation, including `buyers` — there is no `GET /api/buyers` route. This matches every other file in `/api`: `access_token` has to travel in the request body, since no client anywhere in this app sends an `Authorization` header.

## Confirmed request contract (read directly from source)

Every action on every route requires `access_token` (401 if missing/invalid, 403 if the signed-in user has no row in `public.operators`).

| Route | `action` | Additional required fields | Additional optional fields | Success shape |
|---|---|---|---|---|
| `api/buyers.js` | `create` | `company_name` | `contact_name`, `email`, `phone`, `location`, `buyer_type` | `{ buyer }` |
| `api/buyers.js` | `list` | — | — | `{ buyers: [] }` |
| `api/listings.js` | `create` | `manifest_id`, `material_type`, `available_weight` | `grade`, `asking_price` | `{ listing }` |
| `api/listings.js` | `list` | — | `status` | `{ listings: [] }` |
| `api/listings.js` | `update_status` | `listing_id`, `status` | — | `{ listing }` |
| `api/offers.js` | `list` | — | `listing_id`, `status` | `{ offers: [] }` |
| `api/offers.js` | `submit` | `listing_id`, `buyer_id`, `offered_price`, `offered_weight` | — | `{ offer }` |
| `api/offers.js` | `accept` | `offer_id` | — | `{ transaction }` (calls `accept_offer(p_operator_id, p_offer_id)` server-side) |
| `api/offers.js` | `reject` | `offer_id` | — | `{ offer }` |
| `api/transactions.js` | `list` | — | `status` | `{ transactions: [] }` |
| `api/transactions.js` | `complete` | `transaction_id` | — | `{ transaction }` (calls `complete_transaction(p_operator_id, p_transaction_id)` server-side) |

## Live HTTP test results

Run against the preview deployment `https://watchtower-landing-mmrbgtf7l-gerard-2859s-projects.vercel.app` (same Vercel project/env vars as production), using a disposable QA operator account created for this test and removed afterward (see Cleanup below). Vercel's deployment-protection wall was bypassed via a temporary share link so requests reached the actual functions.

| # | Endpoint | Payload | HTTP status | Result | DB verification |
|---|---|---|---|---|---|
| 1 | `GET /api/buyers` (no body) | — | `405` `{"error":"Method not allowed."}` | Rejected before touching Supabase/service key, as designed (no GET route exists) | N/A |
| 2 | `POST /api/listings` `action:create` | `manifest_id:1, material_type:"QA Test Copper", available_weight:100` (manifest 1 has no linked passport in production) | `200` | Draft listing created, id `3` | — |
| 3 | `POST /api/listings` `action:update_status` | `listing_id:3, status:"AVAILABLE"` | `400` | `"Cannot mark listing 3 AVAILABLE: manifest 1 has no verified (ACQUIRED intake + linked passport) material"` — `trg_validate_listing_verified` fired correctly through the full HTTP path | Confirmed listing stayed `DRAFT` |
| 4 | `POST /api/buyers` `action:create` | `company_name:"QA Smoke Test Buyer Co"` | `200` | Buyer created | — |
| 5 | `POST /api/offers` `action:submit` | `listing_id:3, buyer_id:<from #4>, offered_price:200, offered_weight:100` | `200` | Offer created, id `2`, status `PENDING` | `listing_events` row confirmed: `event_type:OFFER_RECEIVED, actor:<buyer id>, notes:"offer 2: 200 for 100"` |
| 6 | `POST /api/offers` `action:accept` (bonus — tests `accept_offer()` over HTTP without needing a verified manifest) | `offer_id:2` | `400` | `"Listing 3 is not AVAILABLE (status: DRAFT)."` — proves the full chain (HTTP → `api/offers.js` → service role → `accept_offer()` RPC → internal operator re-check → business-rule guard) executes correctly end-to-end | — |

**Rows 1–6: all pass, all expected results matched exactly.**

## Still blocked — the `accept_offer()`/`complete_transaction()` *success* path

Not run, per instruction not to fabricate a verified manifest just to force this test. **No manifest in production currently has a linked passport** (`select id, passport_id from manifests` → both existing manifests show `passport_id: null`), so there is no real verified inventory to run the positive path against yet. Closing this out requires walking one real intake through to `ACQUIRED` and attaching a passport via the normal `operations/manifest.html` → `passport.html` flow, then repeating rows 2–6 through to `accept`/`complete` for real.

## Cleanup

Test rows (`listing_events` ×1, `offers` ×1, `material_listings` id 3, `buyers` "QA Smoke Test Buyer Co", `operators` row for the disposable QA user) were deleted after testing — confirmed via count query, all back to pre-test state (`operators` back to its original 2 rows). The disposable Supabase Auth account itself (`wt-marketplace-qa-*@example.com`) was **not** removed — no admin-API access from this session to do that cleanly. Harmless (no PII, no operator privilege remaining), but worth removing from Supabase Auth → Users when convenient.
