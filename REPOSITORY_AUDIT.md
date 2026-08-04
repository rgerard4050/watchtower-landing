# Watchtower Repository Technical Briefing

Audit date: 2026-08-04  
Scope: repository inspection only; no live Supabase or deployed Vercel environment was queried.

## Executive summary

Watchtower is a framework-free, Vercel-hosted web application made primarily of standalone HTML pages with inline JavaScript. It uses browser-loaded Supabase clients for authentication and row-level-security-controlled data access, Vercel serverless functions for privileged operations and third-party integrations, Anthropic vision models for image analysis, and Stripe for subscriptions and driver payments.

The repository currently contains several overlapping generations of the product. The most coherent current operational path is the `scans -> jobs -> intakes -> passports -> material_listings -> offers -> marketplace_transactions` pipeline introduced by the later Supabase migrations and surfaced in `job.html` and `operations/*`. Older `tickets`, `dispatch_runs`, legacy terminal functions, standalone scanners, and two modular app prototypes remain alongside it. This duplication is the main architectural and maintenance risk.

The working tree was already dirty when this audit began. Existing modifications under `app/`, `resident/`, and `.gitignore`, plus the untracked `resident/app/` tree, were not altered. This report is the only file created by the audit.

## 1. Overall architecture

### Client layer

There is no framework, bundler, or compile step. Vercel serves static files directly and applies clean URLs via `vercel.json`.

The UI is split into four forms:

1. **Root standalone pages** such as `index.html`, `resident.html`, `scanner.html`, `business.html`, `terminal.html`, `dispatch.html`, `job.html`, and `marketplace.html`. These are the primary public and persona-specific experiences. Most contain their styles and application logic inline.
2. **Operations pages** under `operations/`, which form a linked operator back office for command-center reporting, jobs, manifest review, dispatch, passports, reconciliation, and marketplace management. Shared logic is partially centralized in `operations/ops.js`; dispatch, driver, job, and intelligence views have separate scripts.
3. **A modular hash-routed prototype** under `app/`, using dynamic ES-module imports for home, scanner, marketplace, dispatch, and wallet modules.
4. **A second resident prototype** under `resident/app/`, duplicating the modular app structure. It is untracked in the current worktree, so it is not part of the committed repository state.

### Server layer

Files in `api/` are Vercel serverless functions. They fall into three groups:

- Anthropic image analysis: resident scanning, operator grading, pickup verification, and listing generation.
- Stripe: resident checkout, business checkout, driver Connect onboarding/return, driver payment, and webhook processing.
- Privileged marketplace operations: buyers, listings, offers, and transactions. These validate a Supabase access token, verify that the user exists in `operators`, then use the service-role key to reach PostgREST or restricted RPCs.

The API directory mixes CommonJS (`module.exports`) and ESM-style default exports. This relies on Vercel's function loader rather than a locally configured application server.

### Data layer

Supabase provides:

- Auth sessions for residents, operators, drivers, businesses, and planned buyers.
- Postgres tables and views accessed through PostgREST.
- RLS policies that define persona access.
- Security-definer RPCs for sensitive workflow transitions.
- Database triggers that create jobs, log events, enforce state, and bridge verified material into marketplace listings.

The canonical migration directory is `supabase/migrations/`. A second, older migration series remains under `operations/migrations/`, creating ambiguity about schema history. Local files describe intended state; whether every migration is applied to the live project is unverified.

### External dependencies

- Supabase JavaScript is loaded from jsDelivr on individual pages rather than installed through npm.
- Anthropic is called by serverless endpoints through raw `fetch`.
- Stripe is the only npm runtime dependency.
- Leaflet, QRCode, html5-qrcode, and exifr are loaded from CDNs on pages that need them.
- Some operator pages load Tailwind from a CDN.
- Terminal and dispatch pages query Dexscreener directly from the browser.

## 2. Application entry points

| Entry point | Intended audience / purpose |
|---|---|
| `index.html` | Public landing page, resident authentication/onboarding, business and operator entry paths, subscription checkout |
| `resident.html` | Authenticated resident dashboard and wallet summary; links to the root scanner |
| `scanner.html` | Current full resident AI scan and bounty-creation flow |
| `pickup-photo.html` | Follow-up pickup proof and AI verification for a logged scan |
| `business.html` | Business authentication, subscription setup, profile, and WTWR redemption scanning |
| `operator-login.html` | Supabase login gate for operator pages |
| `terminal.html` | Large legacy/current mixed operator console for jobs, ledger, redemption, and reporting |
| `operator-scanner.html` | Operator camera-based grading flow using `/api/grade` |
| `job.html` | Driver job board and canonical job lifecycle UI; supports `?job=<id>` |
| `driver-board.html` | Driver dashboard, Stripe Connect setup, open jobs, and payouts |
| `dispatch.html` | Operator-protected dispatch overview around scans/jobs |
| `operations/command.html` | Operations command center |
| `operations/jobs.html` | Operator job dashboard and exception views |
| `operations/manifest.html` | Manifest intake and review workflow |
| `operations/dispatch.html` / `driver.html` | Older manifest-based route workflow |
| `operations/passport.html` | Material passport creation/detail |
| `operations/marketplace.html` | Operator marketplace administration |
| `marketplace.html` / `marketplace-listing.html` | Public buyer-facing marketplace catalogue and listing detail |
| `app/index.html` | Experimental hash-routed modular application |
| `resident/scanner.html` | Separate resident scanner/lifecycle prototype |

There is no single JavaScript bootstrap for the whole product. Each standalone page is effectively its own application entry point.

## 3. Navigation

Navigation is currently a mixture of full-page links, redirects, query parameters, and one isolated hash router.

- The public landing page links directly to resident, business, marketplace, operator, and learning pages.
- `shared-nav.js` can inject a consistent public navigation bar, but much of the repository still defines navigation inline, so it is not the universal source of truth.
- Resident login state is checked with Supabase and redirects between `index.html` and `resident.html`.
- `operator-auth.js` hides protected pages until a Supabase session is confirmed and the authenticated UUID exists in `public.operators`; failures redirect to `operator-login.html?next=<current URL>`.
- Driver workflow uses `job.html?job=<id>` and passport detail uses `operations/passport.html?view_passport=<id>`.
- Public marketplace detail uses `marketplace-listing.html?id=<listing_id>`.
- The `/app` prototype alone uses `location.hash` (`#home`, `#scanner`, `#marketplace`, `#dispatch`, `#wallet`) and dynamically imports modules.
- `vercel.json` enables clean URLs, while source code inconsistently links both `.html` paths and extensionless `/api/...` paths. Both may work on Vercel, but local-server behavior can differ.

There is no centralized route definition covering the standalone pages, no shared authorization-aware navigation model, and no explicit 404/fallback route.

## 4. Scanner behavior

### Root resident scanner (`scanner.html`)

This is the most complete resident scan flow:

1. It creates or reuses a per-device `wt_session` ID in local storage.
2. It checks Supabase auth to associate the scan with a resident when possible.
3. It requests the rear camera, falling back to any video camera.
4. It captures a JPEG at 85% quality and sends base64 plus media type to `POST /api/scan`.
5. `api/scan.js` sends the image to Anthropic's `claude-haiku-4-5-20251001` with a strict JSON schema prompt.
6. The UI displays summary, materials, estimated range, coaching, safety, and the resident-facing value share.
7. “Log this haul” inserts into `scans`, including the AI result and available location/resident metadata.
8. If pickup is eligible, it redirects to `pickup-photo.html?bounty=<scan id>`, which captures evidence, calls `/api/verify-pickup`, and updates the scan.
9. Database triggers/RPC-era migrations create the downstream `jobs` workflow when a bounty opens.

Notable weaknesses: the base64 image is sent as JSON rather than multipart upload; no explicit client-side size reduction beyond JPEG quality is visible; API response validation is loose; and `api/scan.js` returns HTTP 200 with an `error` field when model JSON parsing fails.

### Operator grading

`operator-scanner.html` and the scan step in `job.html` capture a camera frame and call `/api/grade`. `job.html` then records the returned grade through `job_record_scan`, keeping state transitions in database RPCs. `/api/scan-operator` appears to duplicate `/api/grade` and may be legacy.

### Other scanner implementations

- `app/modules/scanner.js` is a minimal real-camera client that calls `/api/scan.js` and prints raw JSON. It does not implement resident identity, persistence, pickup, or workflow transitions.
- `resident/scanner.js` is explicitly a lifecycle test harness: scanning and proof verification are time-based mocks, and persistence is a placeholder. Its initialization tail is malformed (`ScannerApp.ithis...` / `};nit()`), so that path is likely nonfunctional as committed/working.
- `business.html` uses html5-qrcode to read a resident wallet/redemption code; this is a QR scanner, not material vision.

## 5. Supabase integration

### Browser usage

Most pages instantiate their own Supabase client using the same hard-coded project URL and publishable/anon key. This is safe in principle for a publishable key only if RLS and RPC grants are correct, but the repetition makes rotation and environment switching difficult.

Browser code uses Supabase for:

- Auth signup, login, session lookup, and logout.
- Resident, business, operator, and driver profile/role checks.
- Scan, intake, manifest, dispatch, passport, redemption, and marketplace reads/writes.
- RPC-driven job state transitions and WTWR redemption.
- Operator reporting views such as `vw_job_dashboard`, `vw_job_exceptions`, `vw_network_value`, and marketplace intelligence views.

`app/services/supabase.js` exists as an attempted central service, but the deployed-style standalone pages do not use it consistently.

### Server usage

Privileged endpoints accept a client access token, validate it against `/auth/v1/user` with the anon key, then use `SUPABASE_SERVICE_ROLE_KEY` for PostgREST requests. Marketplace and payment operations therefore depend on Vercel environment configuration and must never expose that service-role key to the browser.

### Schema and authorization model

The later migrations define a stronger model than the older audit documents describe:

- `operators` and verified-driver checks gate operational data.
- `jobs` and `job_events` are RLS-protected.
- Workflow mutation occurs through RPCs such as `claim_job`, `job_mark_en_route`, `job_mark_arrived`, `job_record_scan`, `job_create_intake`, `job_create_passport`, and `cancel_job`.
- Marketplace acceptance/completion uses service-role-only RPCs.
- Public marketplace access is exposed through restricted views rather than raw tables.

However, local migration presence is not proof of deployment. The live schema, migration ledger, RLS behavior, storage policies, and current environment variables are unverified in this audit.

## 6. API endpoints

All endpoints are Vercel functions under `/api`; nearly all accept only `POST`.

| Endpoint | Purpose | Authorization / dependency |
|---|---|---|
| `/api/scan` | Resident material identification and value estimate | Anthropic key; no user auth in handler |
| `/api/grade` | Operator/driver material grading | Anthropic key; handler itself does not verify operator role |
| `/api/scan-operator` | Apparent duplicate operator grading endpoint | Anthropic key |
| `/api/verify-pickup` | Pickup-photo verification | Anthropic key; no user auth in handler |
| `/api/generate-listing` | AI-generated marketplace listing content | Anthropic key |
| `/api/create-checkout` | General Stripe Checkout session | Stripe secret and price ID |
| `/api/create-checkout/route` | Duplicate checkout handler in nested route form | Stripe secret and price ID |
| `/api/create-business-checkout` | Tier/add-on subscription Checkout | Signed-in Supabase user, service role, Stripe tier price variables |
| `/api/driver-connect-onboarding` | Creates/continues Stripe Connect onboarding | Signed-in user, verified driver data, service role, Stripe |
| `/api/driver-connect-return` | Handles return/status synchronization from Connect | Signed-in user, service role, Stripe |
| `/api/pay-driver` | Issues driver payout/transfer | Signed-in authorized context, service role, Stripe |
| `/api/stripe-webhook` | Processes signed Stripe events and updates Supabase | Raw body, webhook secret, service role |
| `/api/listings` | Create/list/update marketplace listings | Operator access token; service role |
| `/api/offers` | List/submit/accept/reject offers | Operator access token; service role; restricted RPC for acceptance |
| `/api/transactions` | List and complete marketplace transactions | Operator access token; service role; restricted RPC |
| `/api/buyers` | Create/list buyer records | Operator access token; service role |

The action-based marketplace APIs are internal RPC-style endpoints rather than resource-oriented REST. Public marketplace pages read Supabase public views directly instead of these endpoints.

## 7. Role separation

| Role | Current boundary and experience | Gaps |
|---|---|---|
| Resident | Supabase-authenticated dashboard; owns wallet/profile; creates scans and pickup evidence; receives WTWR and can redeem at businesses | Some scanner use remains anonymous; multiple resident app/scanner implementations compete; authorization depends heavily on RLS |
| Operator | Auth session plus membership in `operators`; accesses terminal and `operations/*`; reviews jobs/manifests, creates passports/listings, manages offers and transactions | Several AI endpoints do not enforce operator auth themselves; operator UI is fragmented between terminal and operations pages |
| Business | Authenticated business profile/subscription; Stripe billing; scans resident redemption codes and calls the redemption workflow | Business UI is a single large page; business versus operator responsibilities overlap in legacy terminal cashier code |
| Dispatcher | Functionally an operator specialization using `dispatch.html`, terminal dispatch views, or `operations/dispatch.html` | No distinct dispatcher identity/table/role check was found; authorization is operator-level. Two dispatch models (`jobs` and `dispatch_runs/stops`) coexist |
| Buyer | Public users can browse marketplace views; `buyers` records and buyer RLS helper exist; operators currently create buyers and submit offers on their behalf | No complete buyer login/self-service offer flow exists. API comments explicitly describe operator-mediated buyer actions as current scope |

Drivers are also a material role even though not requested in the list: verified authenticated drivers claim jobs, advance job states, capture grading/intake/passport data, onboard to Stripe Connect, and request/receive payments.

## 8. Technical debt

1. **Multiple application generations:** root pages, `/app`, `resident/app`, `resident/scanner`, terminal workflows, and operations workflows overlap without a declared canonical surface.
2. **Two dispatch domains:** the newer `jobs` lifecycle and older `dispatch_runs`/`dispatch_stops` manifest routing remain active in code and migrations.
3. **Large inline applications:** `terminal.html`, `business.html`, `scanner.html`, `dispatch.html`, and `job.html` combine markup, CSS, data access, and business logic, making testing and safe reuse difficult.
4. **Configuration duplication:** Supabase URL and anon key are repeated across many files; route strings and status constants are likewise duplicated.
5. **Inconsistent modules and runtime conventions:** CommonJS and ESM serverless handlers coexist; browser code alternates between inline scripts, global objects, and ES modules.
6. **No automated tests:** `npm test` intentionally fails, and there is no linting, type checking, unit testing, integration testing, or CI configuration in the repository.
7. **No reproducible local runtime:** package scripts do not start a dev server or document Vercel CLI use; CDN dependencies make offline/local consistency weaker.
8. **Migration split and stale documentation:** `operations/migrations` and `supabase/migrations` overlap, while `docs/watchtower_database_audit.md` describes an earlier state that later migrations appear to repair.
9. **Security concentrated in RLS:** several AI endpoints accept unauthenticated image requests, creating abuse/cost exposure. Role-sensitive pages are only safe if every table, view, RPC, and endpoint independently enforces the intended boundary.
10. **Weak API contracts:** request/response bodies are manually parsed and validated; there is no shared schema, payload size limit, rate limiting, or structured error convention.
11. **Third-party CDN dependence:** versioning is inconsistent and subresource integrity is not used.
12. **Repository hygiene:** generated/reference artifacts (`structure.txt`), design photos, duplicate icons, and prototypes live at the root without lifecycle documentation.
13. **PWA cache risk:** a service worker and manifest exist while application assets and routes are rapidly changing; cache/version behavior needs deliberate testing to prevent stale clients.

## 9. Incomplete or uncertain work

- `resident/scanner.js` contains mock behavior, a persistence placeholder, and malformed initialization code.
- `resident/app/` is an untracked duplicate of `/app`, indicating an unfinished migration or experiment.
- `/app` modules are skeletal; the scanner only prints raw results and other modules do not represent the full standalone product workflows.
- Buyer self-service authentication, offer creation, and account experience are not implemented; operators act for buyers.
- Dispatcher is not a distinct authorization role.
- `api/scan-operator.js` and `api/create-checkout/route.js` duplicate other handlers without a documented reason.
- The older manifest dispatch path remains beside the newer job lifecycle; which one is intended for production is not explicitly documented.
- Marketplace listing generation exists as an AI endpoint, but the main marketplace path also uses a database RPC bridge; ownership of listing composition is unclear.
- Live migration application status is unverified. Repository comments claim some migrations were applied, while older handoff documentation says other migrations were not; neither is authoritative without checking the live migration ledger.
- Environment readiness is unverified: Anthropic, Supabase service role, Stripe products, webhook secret, and all business tier/add-on price IDs must be configured for full functionality.
- No end-to-end evidence covers resident scan through job, pickup, intake, passport, marketplace sale, driver payment, and WTWR accounting.

## 10. Recommended next implementation step

**Declare and validate one canonical vertical workflow before adding features: use the newer `scan -> job -> intake -> passport -> listing -> offer -> transaction` path, then prove it with a repeatable end-to-end smoke test.**

The immediate implementation should be a consolidation/verification slice, not a new screen:

1. Confirm the live Supabase migration ledger and schema match all files in `supabase/migrations`.
2. Exercise one authenticated resident, one verified driver, one operator, one business, and one buyer record through the complete lifecycle.
3. Record failures at page, API, RPC, RLS, trigger, and Stripe boundaries.
4. Add an automated smoke-test harness for the database/RPC transitions and serverless APIs.
5. Once that path passes, mark `jobs` as canonical and quarantine or remove the overlapping `dispatch_runs`/legacy scanner/prototype surfaces in a separate, explicitly reviewed cleanup.

This step has the highest leverage because it converts a large set of plausible but overlapping implementations into one verified product spine. It also establishes the evidence needed to simplify navigation and role-specific UIs safely afterward.
