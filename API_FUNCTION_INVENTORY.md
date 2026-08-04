# Watchtower API Function Inventory

Audit date: 2026-08-04  
Scope: repository inspection only; no files or deployments changed  
Trigger: Vercel preview failure — `No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.`

## Executive summary

The repository contains **16 JavaScript files under `api/`**, and the current framework-free Vercel layout maps each API file to a separate Vercel Function. Vercel documents that direct, non-framework API files each become one function and that Hobby deployments are limited to 12 such functions. [Vercel runtime documentation](https://vercel.com/docs/functions/runtimes), [Vercel limits](https://vercel.com/docs/limits).

The count is therefore consistent with the preview failure:

```text
16 current API files
- 2 unreferenced duplicate handlers
- 4 separate marketplace handlers
+ 1 consolidated marketplace handler
= 11 deployed functions
```

The recommended reduction preserves all identified active capabilities and leaves one function of headroom. It does not require deleting repository history: `.vercelignore` can exclude superseded handlers from deployment while their source remains versioned. Vercel states that `.vercelignore` entries are not uploaded or served. [Vercel ignore documentation](https://vercel.com/docs/deployments/vercel-ignore).

Two important distinctions:

- **Required for the canonical product spine** means the handler participates in `scan -> job -> intake -> passport -> listing -> offer -> transaction` or an adjacent required custody/payout boundary.
- **Currently referenced** does not mean safe or canonical. Several active endpoints lack authentication, schema validation, idempotency, or stable error handling.

## Classification definitions

- **Canonical:** owns an approved path in the current product spine or its required operational boundary.
- **Active but incomplete:** has a verified caller and real behavior, but is outside the complete spine or lacks required hardening.
- **Legacy but referenced:** superseded/noncanonical behavior still called by a repository surface.
- **Duplicate:** materially repeats another handler without an approved separate responsibility.
- **Unreferenced:** no repository UI/script caller or documented external integration was found.
- **Unsafe or broken:** contains a verified security, correctness, runtime, or failure-handling defect. This can accompany another classification.

## 1. Complete API inventory

Routes below follow the current raw Vercel `api/` filesystem convention. The nested `route.js` path is not treated as a Next.js route convention because this repository is not a Next.js application.

| # | File | Deployed route | Verified caller(s) | Classification | Spine requirement and findings |
|---:|---|---|---|---|---|
| 1 | `api/buyers.js` | `/api/buyers` | `operations/marketplace.html` calls `/api/buyers.js`; marketplace smoke-test documentation calls `/api/buyers` | **canonical**, unsafe/incomplete | Required for the current operator-mediated buyer/offer path. POST actions `create` and `list`. Verifies a Supabase token and operator row, then uses service role. Malformed string JSON is parsed outside `try`; token travels in body; input shape is minimally validated. |
| 2 | `api/create-business-checkout.js` | `/api/create-business-checkout` | `business.html` | **active but incomplete**, unsafe | Required for the business subscription boundary, not for the material lifecycle itself. Authenticates the Supabase user, resolves their business, and creates Stripe subscription Checkout. Duplicates auth/service helpers; trusts request host for return URLs; no request idempotency or rate limit. |
| 3 | `api/create-checkout.js` | `/api/create-checkout` | `index.html` | **active but incomplete**, unsafe | Public/resident subscription checkout, not required for scan-to-transaction. Unauthenticated session creation permits abuse; request host supplies fallback origin; no rate limit or idempotency. This is the referenced copy and must remain unless the landing-page subscription flow is explicitly retired. |
| 4 | `api/create-checkout/route.js` | `/api/create-checkout/route` | No UI, script, import, or documented external caller found | **duplicate**, **unreferenced** | Byte-for-behavior duplicate of `api/create-checkout.js`. It does not own `/api/create-checkout`; excluding it is the safest immediate function-count reduction. |
| 5 | `api/driver-connect-onboarding.js` | `/api/driver-connect-onboarding` | `driver-board.html` | **canonical** for payout onboarding, unsafe/incomplete | Required to make verified drivers eligible for Stripe transfers. Authenticates user and verified driver, creates/reuses Express account, then stores its ID. Creation followed by database update is not transactionally recoverable; retries can orphan Stripe accounts if persistence fails. |
| 6 | `api/driver-connect-return.js` | `/api/driver-connect-return` | `driver-board.html` after Stripe return | **canonical** for payout onboarding | Required to synchronize `stripe_payouts_enabled`. Authenticates user and driver ownership. Duplicates authentication/service logic and lacks a shared error contract. |
| 7 | `api/generate-listing.js` | `/api/generate-listing` | `console.html` | **legacy but referenced**, unsafe | Generates copy for the separate revenue/collector console, not canonical `material_listings`. It is unauthenticated and rate-unlimited, accepts loosely validated values, exposes upstream details, and returns parse failures as HTTP 200. Excluding it would break a verified operator-adjacent surface, so it is not in the smallest safe reduction. |
| 8 | `api/grade.js` | `/api/grade` | `job.html`, `operator.html`, `operator-scanner.html` | **canonical**, unsafe/incomplete | Required for operator/driver grading before durable job scan/intake evidence. Returns AI provenance fields consumed by the job path. No endpoint authentication or role verification, no image/media/size limit, no output schema validation, and raw upstream/model details may be logged or returned. AI prompt also calculates payout values, which must remain advisory. |
| 9 | `api/listings.js` | `/api/listings` | `operations/marketplace.html` calls `/api/listings.js`; marketplace smoke-test documentation calls `/api/listings` | **canonical**, unsafe/incomplete | Required for listing create/list/status operations. Operator authentication plus service role; database trigger enforces verified-material publication. Body token, duplicated helpers, unguarded string JSON parsing, loose numeric/status validation. Candidate for consolidation, not removal of behavior. |
| 10 | `api/offers.js` | `/api/offers` | `operations/marketplace.html` calls `/api/offers.js`; marketplace smoke-test documentation calls `/api/offers` | **canonical**, unsafe/incomplete | Required for offer list/submit/accept/reject. Acceptance correctly delegates atomic transition to `accept_offer`; reject uses guarded `PENDING` update. Operator-only buyer proxy remains the current model. Duplicated helpers, body token, loose numeric validation, and unguarded string JSON parsing remain. |
| 11 | `api/pay-driver.js` | `/api/pay-driver` | `terminal-v2.html` | **canonical** payout boundary, **unsafe** | Required to preserve current driver payout behavior. Authenticates operator and checks completion/driver eligibility. Critical defect: check → Stripe transfer → database patch is not atomic and sends no Stripe idempotency key; concurrent/retried requests can create duplicate transfers, while a successful transfer followed by failed persistence requires manual repair. Do not casually consolidate or exclude this handler. |
| 12 | `api/scan.js` | `/api/scan` | canonical `scanner.html`; experimental `app/services/scanner-api.js` calls `/api/scan.js`; Playwright intercepts `/api/scan` | **canonical**, unsafe/incomplete | Required for resident capture analysis. No endpoint authentication/rate limit/content-type check/image-size limit/media allowlist/output schema validation. Returns model parse failure with HTTP 200 and exposes raw error messages. The browser persists the result separately to `scans`. |
| 13 | `api/scan-operator.js` | `/api/scan-operator` | No runtime caller found; its comment claiming `operator-scanner.html` calls it is contradicted by that page, which calls `/api/grade` | **duplicate**, **unreferenced**, unsafe | Near-duplicate of `api/grade.js`, but omits the provenance fields added by the canonical handler. Safe candidate for deployment exclusion after a final repository and preview-log reference check. |
| 14 | `api/stripe-webhook.js` | `/api/stripe-webhook` | Expected external caller: Stripe webhook configuration; no browser caller should exist | **canonical** Stripe boundary, unsafe/incomplete | Signature-verifies raw Stripe events and is the privileged writer of business billing identifiers/status. The external endpoint registration is not verifiable from the repository. It has no persisted Stripe event-id deduplication ledger; handled updates are mostly repeatable, but webhook idempotency/reconciliation is incomplete. Must remain deployed. |
| 15 | `api/transactions.js` | `/api/transactions` | `operations/marketplace.html` calls `/api/transactions.js`; marketplace smoke-test documentation calls `/api/transactions` | **canonical**, unsafe/incomplete | Required for transaction list/completion. Completion correctly delegates to service-role-only `complete_transaction`. Duplicates operator/service/RPC helpers; body token; unguarded string JSON parsing and loose filtering. Candidate for consolidation, not removal of behavior. |
| 16 | `api/verify-pickup.js` | `/api/verify-pickup` | `pickup-photo.html`; Playwright intercepts it | **canonical**, unsafe/incomplete | Required advisory evidence check in the scan-to-job opening path. It deliberately fails open so AI cannot block pickup. No endpoint authentication/rate limit/image limits/media validation/output schema validation. Error text is concatenated into a success-shaped fallback note. |

### Function count by domain

| Domain | Files | Count |
|---|---|---:|
| Resident/operator AI | `scan`, `verify-pickup`, `grade`, `scan-operator`, `generate-listing` | 5 |
| Stripe/subscription/payout | `create-checkout`, nested duplicate `route`, `create-business-checkout`, two Connect handlers, `pay-driver`, `stripe-webhook` | 7 |
| Marketplace control plane | `buyers`, `listings`, `offers`, `transactions` | 4 |
| **Total** |  | **16** |

## 2. Caller and route evidence

### Canonical resident scanner

```text
scanner.html
  -> POST /api/scan
  -> browser Supabase insert into scans
  -> pickup-photo.html?bounty=<scan id>
       -> POST /api/verify-pickup
       -> Supabase scan update/opening
       -> database trigger creates job
```

Neither `scan-operator.js` nor any marketplace API participates in the initial resident capture request.

### Driver/operator workflow

```text
job.html ----------------------> POST /api/grade
operator.html -----------------> POST /api/grade
operator-scanner.html ---------> POST /api/grade

driver-board.html -------------> POST /api/driver-connect-onboarding
driver-board.html -------------> POST /api/driver-connect-return
terminal-v2.html --------------> POST /api/pay-driver
```

Job claim, arrival, scan recording, intake, passport, and other canonical transitions are primarily direct Supabase/RPC operations rather than separate Vercel functions. Reducing API count must not redirect these clients to legacy tables or browser-authored lifecycle writes.

### Marketplace

`operations/marketplace.html` calls all four operator APIs using `.js` URL suffixes. The documented deployed smoke path also uses extensionless routes. A consolidation must preserve both forms during rollout or update every verified caller and explicitly reject unknown old clients.

Public `marketplace.html` and `marketplace-listing.html` read public marketplace data through Supabase; they do not call these four operator APIs.

### Stripe

- `index.html` calls the referenced general checkout handler.
- `business.html` calls business checkout.
- `driver-board.html` calls both Connect handlers.
- `terminal-v2.html` calls driver payout.
- Stripe itself is the expected caller of the webhook; dashboard registration remains external/unverified.

## 3. Shared dependencies and duplicated boundary logic

### Runtime dependencies

- Native/global `fetch` is used for Anthropic, Supabase Auth/PostgREST, and raw Stripe Checkout.
- The installed `stripe` package is used by business checkout, Connect, payout, and webhook handlers.
- `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, price-specific variables, and `SUPABASE_SERVICE_ROLE_KEY` are server-only environment variables.
- The Supabase URL and browser-safe publishable key are hard-coded repeatedly instead of centralized.

No secret values are reproduced in this report.

### Authentication duplication

The same `getAuthedUser(accessToken)` implementation is repeated in:

- all four marketplace handlers;
- business checkout;
- both driver Connect handlers;
- driver payout.

The same service-role PostgREST wrapper is repeated in those files and the webhook, with small differences. Marketplace handlers also repeat `requireOperator`, and two repeat `serviceRpc`.

All authenticated application APIs accept `access_token` in the JSON body. None implements the architectural target of `Authorization: Bearer <token>`. Body tokens increase accidental logging/exposure risk and prevent conventional authorization middleware. Consolidation should preserve the current contract for compatibility first, then migrate authorization separately.

### Supabase safety

- Service-role use is server-side only, which is correct, but it bypasses RLS and makes handler authorization correctness critical.
- Operator checks use a service-role query to `operators` after Supabase Auth resolves the user.
- Marketplace RPCs re-check operator identity inside the database, providing defense in depth for acceptance/completion.
- Direct service-role table operations in buyers/listings/offers/reject paths rely only on endpoint checks and database constraints/triggers.
- Multiple handlers call `.json()` on Supabase responses before validating response status; non-JSON upstream failures can become generic handler failures.

### CORS

No API file sets CORS headers or handles `OPTIONS`. Current browser callers are same-origin, so this is not presently blocking them. It is nevertheless inconsistent with any future cross-origin client and should not be “fixed” during count reduction without an explicit origin policy.

### Request parsing and validation

Three patterns coexist:

1. `getBody()` catches malformed JSON and silently returns `{}` in both checkout duplicates.
2. Supabase/Stripe service handlers call `JSON.parse()` outside their main `try`, so malformed JSON can escape the intended error envelope.
3. AI handlers assume `req.body` is already an object.

There is no shared content-type check, maximum decoded image size, request schema, numeric range validation, or stable validation-error envelope.

### AI parsing and error behavior

The five AI handlers repeat Anthropic request construction and fenced-JSON cleanup. None validates the parsed object against a schema. `scan`, `grade`, `scan-operator`, and `generate-listing` can return parsing failure with HTTP 200. Several return/log upstream response bodies or raw exception strings. None authenticates or rate-limits requests.

### Financial error and idempotency behavior

- Checkout creation has no caller idempotency key.
- Connect account creation can orphan an account when the subsequent database write fails.
- Driver transfer lacks a Stripe idempotency key and an atomic reservation/ledger transition.
- The webhook verifies signatures correctly but does not persist processed event IDs.
- Error envelopes and status mapping differ across handlers.

These are independent correctness debts. The function-count fix must preserve behavior and avoid combining financial and marketplace refactors in one unreviewable router.

## 4. Functions required for the canonical product spine

### Directly required

| Lifecycle boundary | Required deployed behavior |
|---|---|
| Resident scan | `scan.js` |
| Pickup evidence/opening | `verify-pickup.js` |
| Operator/driver material grade | `grade.js` |
| Buyer administration for operator-mediated offers | `buyers.js` behavior |
| Listing creation/publication administration | `listings.js` behavior |
| Offer submission/decision | `offers.js` behavior |
| Transaction list/completion | `transactions.js` behavior |

The four marketplace behaviors may share one deployed router without changing the database source of truth or atomic RPC ownership.

### Adjacent boundaries that must remain intact

- `driver-connect-onboarding.js`, `driver-connect-return.js`, and `pay-driver.js` preserve driver payout capability.
- `stripe-webhook.js` preserves signed business billing synchronization.
- `create-business-checkout.js` preserves business subscription onboarding.
- `create-checkout.js` preserves the currently referenced landing-page checkout.
- `generate-listing.js` preserves the referenced legacy revenue-console action until that surface receives a separate ownership decision.

### Not required

- `scan-operator.js`: unreferenced duplicate of canonical `grade.js`.
- `create-checkout/route.js`: unreferenced duplicate of referenced `create-checkout.js`.

## 5. Smallest safe reduction plan

### Recommended outcome: 11 deployed functions

Perform this as two reviewable commits, with the preview remaining undeployed until both are present.

#### Commit A — exclude verified duplicates

Append these exact entries to the existing root `.vercelignore`:

```text
api/create-checkout/route.js
api/scan-operator.js
```

This reduces the prospective count from 16 to 14 without changing a verified caller. Before relying on the exclusion, search runtime logs for requests to both routes over an agreed observation window; repository evidence alone cannot identify unknown external callers.

#### Commit B — consolidate only the marketplace control plane

Create one `api/marketplace.js` handler containing the existing buyers, listings, offers, and transactions actions behind a required `resource` discriminator plus the existing `action` discriminator. It must:

- preserve one Supabase user lookup and one operator authorization path;
- preserve service-role-only database access;
- preserve `accept_offer` and `complete_transaction` RPC calls unchanged;
- preserve current status codes and response shapes for each action;
- keep malformed JSON inside a controlled `400` response;
- reject unknown resource/action combinations;
- avoid adding CORS, buyer self-service, lifecycle changes, or new financial behavior in this consolidation.

Preserve existing route contracts with explicit Vercel rewrites from both current route styles to the router, passing a server-defined resource value:

```text
/api/buyers       and /api/buyers.js       -> /api/marketplace?resource=buyers
/api/listings     and /api/listings.js      -> /api/marketplace?resource=listings
/api/offers       and /api/offers.js        -> /api/marketplace?resource=offers
/api/transactions and /api/transactions.js -> /api/marketplace?resource=transactions
```

The router must prefer the rewrite-supplied resource and must not allow a body value to impersonate a different route. Exact Vercel rewrite syntax must be validated against a preview deployment before removal of the old functions.

Once compatibility routes pass, append these entries to `.vercelignore`:

```text
api/buyers.js
api/listings.js
api/offers.js
api/transactions.js
```

Result:

```text
16 original
- 2 duplicate exclusions
- 4 marketplace exclusions
+ 1 marketplace router
= 11 deployed functions
```

One function remains available below the Hobby ceiling. The original marketplace files remain in Git for rollback and comparison but are absent from deployment.

### Exact files changed by the recommended implementation

```text
.vercelignore          # add six API exclusions; retain existing `quarantine`
vercel.json            # add only compatibility rewrites for four resources and both path styles
api/marketplace.js     # new consolidated handler
```

No UI, SQL, migration, RPC, Stripe handler, AI handler, test, or original API source file needs modification for compatibility-preserving consolidation.

If preview testing shows that clean URL handling makes one route form redundant, do not remove compatibility rules until both repository callers and observed deployed traffic confirm that decision.

## 6. Alternatives considered

### Exclude dead functions with `.vercelignore`

Recommended as the first step for the two verified duplicates. It is reversible and retains Git history, but reaches only 14 functions and cannot solve the Hobby failure alone. Excluding referenced handlers simply to reach 12 would break product surfaces and is not approved.

### Consolidate related handlers behind one router

Recommended only for the four marketplace handlers because they already share authentication, service-role access, response conventions, and one operator UI. Consolidating unrelated AI, Stripe, and marketplace concerns into a single catch-all function would enlarge the blast radius and weaken boundary clarity.

Potential tradeoffs:

- one marketplace defect can affect all four resources;
- logs and metrics need a `resource`/`action` dimension;
- route compatibility must be proven for extensionless and `.js` callers;
- bundle size increases modestly;
- the reduction provides useful shared auth/parsing but should not become an opportunistic API redesign.

### Move experimental APIs into quarantine

Moving the two duplicates under `quarantine/api-functions/` and relying on the existing `quarantine` exclusion would also reduce count. It preserves history with `git mv`, but changes repository paths and makes rollback/caller archaeology less direct. `.vercelignore` exclusions are smaller and keep API history where it currently lives.

Moving `generate-listing.js` is not safe yet because `console.html` references it. The same applies to any active Stripe handler.

### Upgrade to Vercel Pro

Pro removes the immediate 12-function ceiling according to Vercel's plan limits, and is the lowest-code operational workaround. [Vercel limits](https://vercel.com/docs/limits).

Tradeoffs:

- recurring cost and plan governance;
- leaves duplicate functions and duplicated privileged logic intact;
- does not address unsafe authentication, AI validation, or financial idempotency;
- may be appropriate as an emergency deployment unblock, but is not architectural remediation.

Upgrade and consolidation are not mutually exclusive. A temporary Pro upgrade can reduce release pressure, but the repository should still remove ambiguity and duplication.

## 7. Verification

### Pre-change verification

```powershell
rg --files api | Sort-Object
(rg --files api | Measure-Object -Line).Lines
rg -n --hidden --glob '!api/**' --glob '!node_modules/**' --glob '!.git/**' '/api/' .
Get-Content -Raw -LiteralPath .vercelignore
```

Expected baseline: 16 API files and only `quarantine` in `.vercelignore`.

Before excluding duplicates, inspect preview/production logs for:

```text
/api/scan-operator
/api/create-checkout/route
```

Any verified traffic blocks exclusion until its caller is identified and migrated.

### Static and local checks

```powershell
git diff --check
npm test
npm run test:scanner-checkpoint
node --check api/marketplace.js
```

Also run a local API contract harness with Supabase and Stripe mocked; never use production service-role credentials or live payments. At minimum assert:

- every unsupported method returns `405` with `Allow: POST`;
- missing/malformed bodies return controlled `400` responses;
- missing token returns `401`;
- authenticated non-operator returns `403`;
- each marketplace action preserves its previous response shape;
- `accept` calls only `accept_offer` with the authenticated operator ID;
- `complete` calls only `complete_transaction` with the authenticated operator ID;
- unknown resource/action combinations are rejected;
- body-supplied `resource` cannot override the route-selected resource.

### Preview deployment checks

Deploy to a protected preview first. In the Vercel Resources view, count function bundles and verify exactly these 11 logical functions:

```text
api/create-business-checkout
api/create-checkout
api/driver-connect-onboarding
api/driver-connect-return
api/generate-listing
api/grade
api/marketplace
api/pay-driver
api/scan
api/stripe-webhook
api/verify-pickup
```

Confirm no bundles exist for:

```text
api/create-checkout/route
api/scan-operator
api/buyers
api/listings
api/offers
api/transactions
```

The last four URLs must nevertheless resolve through rewrites to `api/marketplace`; absence here refers to function bundles, not public compatibility routes.

### HTTP contract verification

Against the protected preview with an approved non-production operator identity:

1. Repeat the documented marketplace API smoke cases through extensionless routes.
2. Repeat them through the `.js` paths used by `operations/marketplace.html`.
3. Verify unauthenticated and non-operator denials.
4. Confirm the canonical scanner loads and its mocked checkpoint still passes.
5. Confirm `/api/grade` resolves and rejects a non-POST without invoking Anthropic.
6. Confirm both driver Connect endpoints resolve and reject unauthenticated requests without contacting Stripe.
7. Confirm `/api/pay-driver` rejects unauthenticated requests without contacting Stripe.
8. Confirm `/api/create-checkout` and `/api/create-business-checkout` resolve, using mocked/test Stripe only for POST success paths.
9. Confirm `/api/stripe-webhook` rejects an invalid signature and then deliver a signed Stripe test-mode event.
10. Confirm `/api/scan-operator` and `/api/create-checkout/route` return genuine `404` responses.

Do not perform a real driver transfer or use production Supabase data during verification.

### Product-spine verification

On staging/test data, prove:

```text
resident scanner -> one scan -> pickup opening -> one job
driver claim/arrival -> grade -> intake -> passport
marketplace listing -> offer -> accepted transaction -> completion
```

Assert database event evidence and denied wrong-role actions. The function-count fix is not complete if it deploys but breaks an atomic RPC or bypasses operator authorization.

## 8. Rollback

### Before commit

- remove the six proposed API entries from `.vercelignore` while retaining `quarantine`;
- remove only the new compatibility rewrites from `vercel.json`;
- leave `api/marketplace.js` uncommitted or unstage it without deleting unrelated work.

### After commit but before production

Revert Commit B first and redeploy the preview. This restores the four original marketplace function bundles but returns the count to 14, so the Hobby deployment will fail unless the project is temporarily upgraded to Pro. A rollback that cannot deploy is not operationally sufficient.

### After production

The safe rollback sequence is:

1. temporarily upgrade the Vercel project to Pro or prepare an alternative consolidation that remains at 12 or fewer;
2. revert the marketplace consolidation commit;
3. deploy and verify the four original marketplace endpoints;
4. revert duplicate exclusions only if an actual caller requires them;
5. never roll back SQL/RPC state as part of this API packaging rollback.

Because the original handler files remain in Git, rollback is configuration/routing restoration rather than source reconstruction.

## Final recommendation

Do not solve the limit by removing active product boundaries. Exclude the two proven duplicates, consolidate the four homogeneous marketplace control-plane handlers behind one operator-authorized router, and preserve their old URLs with explicit rewrites. This reaches 11 functions while keeping the canonical scanner, driver workflow, operator grading, marketplace lifecycle, and Stripe boundaries intact.

Treat the count reduction as packaging stabilization only. Follow it with separate hardening work for authenticated AI access, shared bearer-token authorization, request schemas, service-role isolation, Stripe idempotency, and webhook reconciliation.
