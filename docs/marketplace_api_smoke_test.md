# Marketplace API Smoke Test

Tracks verification of the marketplace `/api` layer (`api/buyers.js`, `api/listings.js`, `api/offers.js`, `api/transactions.js`) against the deployed Vercel project, separate from the DB-level verification already done in the foundation commit (schema, RPC security, triggers, permissions, invariants — see the `20260728100xxx_marketplace_*.sql` migrations and their in-file rollback/verification notes).

All four endpoints are POST-only with an `action` field for every operation, including `buyers` — there is no `GET /api/buyers` route. This matches every other file in `/api` (`pay-driver.js`, `driver-connect-onboarding.js`, etc.): `access_token` has to travel in the request body, since no client anywhere in this app sends an `Authorization` header.

## Confirmed request contract (read directly from source, not assumed)

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

## Test results

| # | Endpoint | Method / payload | Result | HTTP status | DB verification |
|---|---|---|---|---|---|
| 1 | `api/buyers` | `GET` (no body) | Executed against the deployed preview. Rejected before touching Supabase or the service key. | `405`, body `{"error":"Method not allowed."}` | N/A (no DB write attempted) |
| 2 | Browser audit — client-side `sb.rpc('accept_offer', ...)` | static grep, repo-wide | Zero matches anywhere in the app | — | — |
| 3 | Browser audit — client-side `sb.rpc('complete_transaction', ...)` | static grep, repo-wide | Zero matches anywhere in the app | — | — |
| 4 | Browser audit — direct marketplace-table writes from `operations/marketplace.html` | static grep for `mktSb.from(` in that file | Only match is the comment documenting the design; every marketplace-table op goes through `fetch('/api/...')` | — | — |
| 5 | `api/listings` — negative verification test (`action:create` then `action:update_status, status:AVAILABLE` against manifest `id=1`, which has `passport_id: null`) | **Not executed** | Blocked (see below) | — | — |
| 6 | `api/buyers` — `action:create` | **Not executed** | Blocked | — | — |
| 7 | `api/offers` — `action:submit` | **Not executed** | Blocked | — | — |
| 8 | `api/transactions` — `accept_offer()`/`complete_transaction()` positive path | **Not executed** — also independently blocked because no manifest in production currently has a linked passport (`select m.id, m.passport_id from manifests m` → both existing manifests show `passport_id: null`), so the positive path has no real verified inventory to test against even if HTTP access existed | — | — |

## Remaining blocker

This session has no mechanism to issue an HTTP request with a method other than `GET`, to any host, from any available tool:
- `git push` to GitHub: `fatal: unable to access '...': Failed to connect to github.com port 443` (retried twice more since first observed, same result each time, including immediately before this update)
- `curl` from the sandbox shell, to the Vercel preview URL directly (not GitHub — ruling out a GitHub-specific block): `exit 28`, `HTTP:000` — connection refused/never established
- `web_fetch_vercel_url` (the one Vercel-aware fetch tool available): GET-only by its own schema, no method or body parameter

Tests 5–8 above require an operator's real `access_token` and a POST body, so they cannot run from here. Rows 1–4 are the complete set of checks this session is actually able to perform; they all pass.

**To close out rows 5–8:** run them from a machine with real network access, using an operator `access_token` (Supabase JS v2 stores the active session under `localStorage['sb-eypovuxuddiqgncjdpkq-auth-token']` in any browser already signed into an `operations/*.html` page), against `https://watchtower-landing-mmrbgtf7l-gerard-2859s-projects.vercel.app`. The payload shapes above are confirmed accurate against the current source — no guessing required on the caller's part.
