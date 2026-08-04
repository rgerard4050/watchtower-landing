# API Function Reduction Plan

Status: proposed; not implemented  
Prepared: 2026-08-04  
Scope: two unreferenced duplicates plus marketplace-handler consolidation only

## Decision summary

Watchtower currently has 16 JavaScript files under `api/`. In this framework-free Vercel project, each file is treated as one deployed function; Vercel documents a 12-function limit for direct functions on Hobby. [Vercel runtimes](https://vercel.com/docs/functions/runtimes), [Vercel limits](https://vercel.com/docs/limits).

The approved reduction is:

```text
16 current functions
- 2 excluded unreferenced duplicates
- 4 excluded marketplace handlers
+ 1 consolidated marketplace router
= 11 deployed functions
```

This leaves one function of headroom. It does not change scanner, driver, Stripe, SQL, migration, RPC, or marketplace-domain behavior. Existing marketplace URLs continue to work through explicit compatibility rewrites.

## 1. Exact duplicate API files to exclude

Keep both files in Git, but exclude them from Vercel source upload with `.vercelignore`:

```text
api/create-checkout/route.js
api/scan-operator.js
```

Evidence:

- `api/create-checkout/route.js` duplicates `api/create-checkout.js`; no repository caller references `/api/create-checkout/route`.
- `api/scan-operator.js` duplicates the canonical `api/grade.js`; no repository caller references `/api/scan-operator`. Its own stale comment claims `operator-scanner.html` calls it, but that page calls `/api/grade`.

No file is moved, deleted, or renamed. Before exclusion, review available Vercel request logs for both routes to detect callers outside the repository. Unknown external traffic is the only unresolved caller risk.

## 2. Exact marketplace handlers to consolidate

Consolidate the behavior of:

```text
api/buyers.js
api/listings.js
api/offers.js
api/transactions.js
```

into one new deployed function:

```text
api/marketplace.js
```

The original four files remain versioned but are added to `.vercelignore` after contract tests pass. They are retained as rollback/reference sources and must not be edited during consolidation.

## 3. Current callers that must remain compatible

### Runtime caller

`operations/marketplace.html` uses the following paths:

```text
/api/buyers.js
/api/listings.js
/api/offers.js
/api/transactions.js
```

It sends `POST` JSON through its shared `callApi()` helper. The helper obtains a Supabase session and adds `access_token` to the request body. It expects success payloads such as `{ buyers }`, `{ listing }`, `{ offers }`, and `{ transactions }`; on failure it expects `data.error` to be a displayable string.

### Documented/deployed contract

`docs/reference/marketplace_api_smoke_test.md` uses extensionless paths:

```text
/api/buyers
/api/listings
/api/offers
/api/transactions
```

Those tests establish the current POST/action contract and several exact status/error behaviors.

### External callers

No additional repository runtime caller was found. Deployed clients, bookmarks, scripts, or integrations outside the repository remain unknown. Preserving both `.js` and extensionless URLs avoids requiring their discovery before this packaging change.

Public `marketplace.html` and `marketplace-listing.html` use Supabase reads rather than these operator APIs and require no change.

## 4. Router route and dispatch contract

### Canonical deployed router

```text
POST /api/marketplace?resource=<resource>
Content-Type: application/json
```

Allowed resources:

```text
buyers
listings
offers
transactions
```

The router reads `resource` only from the server routing/query context. It must not accept a body `resource` that can override the compatibility route. Existing body contracts remain unchanged:

```json
{
  "access_token": "<Supabase access token>",
  "action": "<resource-specific action>",
  "...": "existing action fields"
}
```

The body token is retained only for backward compatibility. Migrating to `Authorization: Bearer` is a separate hardening change.

### Dispatch matrix

| Resource | Allowed actions | Success shape |
|---|---|---|
| `buyers` | `create`, `list` | `{ buyer }` or `{ buyers: [] }` |
| `listings` | `create`, `list`, `update_status` | `{ listing }` or `{ listings: [] }` |
| `offers` | `list`, `submit`, `accept`, `reject` | `{ offers: [] }`, `{ offer }`, or `{ transaction }` |
| `transactions` | `list`, `complete` | `{ transactions: [] }` or `{ transaction }` |

The consolidated router must preserve:

- all required and optional request fields;
- existing success response keys;
- the `accept_offer(p_operator_id, p_offer_id)` RPC call;
- the `complete_transaction(p_operator_id, p_transaction_id)` RPC call;
- guarded rejection of only `PENDING` offers;
- database trigger enforcement for verified listing publication;
- authenticated operator identity as `seller_id` and RPC actor;
- current `200`, `400`, `401`, `403`, `405`, `409`, and `500` meanings where applicable.

It must not introduce buyer self-service, browser-direct privileged writes, new lifecycle states, or financial behavior.

## 5. Compatibility routing

Add eight explicit rewrites to `vercel.json`:

```json
{
  "source": "/api/buyers",
  "destination": "/api/marketplace?resource=buyers"
},
{
  "source": "/api/buyers.js",
  "destination": "/api/marketplace?resource=buyers"
},
{
  "source": "/api/listings",
  "destination": "/api/marketplace?resource=listings"
},
{
  "source": "/api/listings.js",
  "destination": "/api/marketplace?resource=listings"
},
{
  "source": "/api/offers",
  "destination": "/api/marketplace?resource=offers"
},
{
  "source": "/api/offers.js",
  "destination": "/api/marketplace?resource=offers"
},
{
  "source": "/api/transactions",
  "destination": "/api/marketplace?resource=transactions"
},
{
  "source": "/api/transactions.js",
  "destination": "/api/marketplace?resource=transactions"
}
```

These entries become the `rewrites` array while preserving the existing `version`, `cleanUrls`, and `trailingSlash` values. Explicit rules are preferred to a compact regex because they are easier to audit and avoid uncertainty around Vercel parameter/optional-suffix syntax.

Vercel rewrites should preserve the HTTP method and body while internally selecting the single router. This behavior must be verified on preview before production. [Vercel rewrite configuration](https://vercel.com/docs/project-configuration/vercel-json#rewrites).

The original four handler files are excluded from upload, so no filesystem function competes with these source routes. Both the runtime UI and documented extensionless smoke contract continue without caller edits.

Direct `/api/marketplace` requests must include a valid `resource` query parameter. Missing, repeated, array-shaped, or unknown resource values return `400` and never reach Supabase.

## 6. Shared boundary behavior

### Authentication and authorization

Implement one shared request path inside `api/marketplace.js`:

1. Require `SUPABASE_SERVICE_ROLE_KEY` before privileged work.
2. Parse and validate the body.
3. Read `access_token` from the body for compatibility.
4. Call Supabase Auth `/auth/v1/user` with the public publishable key and bearer token.
5. Return `401` if no valid user is resolved.
6. Query `operators?id=eq.<authenticated user id>&select=id` with service role.
7. Return `403` unless an operator row exists.
8. Dispatch the authorized resource/action.

Do not use user metadata or a client-supplied role. Do not expose the service-role key in any response, browser bundle, log, or fixture. Service-role access bypasses RLS, so all resource actions must remain behind the operator check.

The database RPCs continue to re-check the operator argument as defense in depth. No SQL/RPC change is part of this plan.

### CORS

Preserve the current same-origin posture:

- do not add `Access-Control-Allow-Origin: *`;
- do not add credentialed cross-origin support;
- unsupported methods, including `OPTIONS`, receive `405` with `Allow: POST` unless a separately approved origin policy is introduced.

This is intentional compatibility, not a claim that CORS has been fully designed.

### Parsing

Use one parser that:

- accepts an already parsed, non-array JSON object;
- safely parses a string body;
- returns `400` for malformed JSON, arrays, null, or unsupported body shapes;
- never throws before the handler's error boundary;
- validates `resource`, `action`, and required action fields before Supabase calls.

Do not silently convert malformed JSON to `{}`.

### Supabase requests

Use one internal service request helper and one RPC helper. Each helper must:

- set service-role `apikey` and bearer authorization only server-side;
- preserve `Content-Type: application/json` and the existing `Prefer` behavior;
- read the response safely as text, then parse JSON when possible;
- distinguish transport failure, non-JSON upstream failure, and PostgREST/RPC error;
- never include secrets or access tokens in logs/errors.

The Supabase URL and publishable key may remain at their current values for behavior parity. Centralizing broader configuration is outside this count-reduction scope.

### Normalized errors without caller breakage

Use the compatibility envelope:

```json
{
  "error": "Human-readable string",
  "code": "STABLE_MACHINE_CODE",
  "detail": {}
}
```

Rules:

- `error` remains a string because `operations/marketplace.html` directly displays it.
- `code` is stable and additive.
- `detail` is optional, sanitized, and used only for safe database constraint/RPC context.
- internal exception strings, service keys, tokens, and raw upstream bodies are never returned.
- unknown resource/action is `400`; invalid session is `401`; non-operator is `403`; invalid method is `405`; stale offer state remains `409`; unexpected failure is `500`.

Success envelopes remain byte-shape compatible at the top level.

## 7. Exact repository changes

### Create

```text
api/marketplace.js
tests/api-marketplace.test.js
```

### Modify

```text
.vercelignore
vercel.json
package.json
```

`.vercelignore` becomes exactly:

```text
quarantine
api/create-checkout/route.js
api/scan-operator.js
api/buyers.js
api/listings.js
api/offers.js
api/transactions.js
```

`package.json` adds a clear marketplace API unit-test script and makes the normal test command run both the existing canonical scanner checkpoint and the new API tests. No dependency should be added if Node's built-in test runner and injected/mocked `fetch` are sufficient; in that case `package-lock.json` remains unchanged.

### Move, rename, or delete

None.

### Explicitly unchanged

```text
operations/marketplace.html
docs/reference/marketplace_api_smoke_test.md
api/buyers.js
api/listings.js
api/offers.js
api/transactions.js
api/create-checkout/route.js
api/scan-operator.js
all scanner, driver, Stripe, SQL, migration, and RPC files
```

The existing callers remain untouched because rewrites provide compatibility.

## 8. Function-count expectation

### Before

| Category | Count |
|---|---:|
| AI handlers | 5 |
| Stripe/subscription/payout handlers | 7 |
| Marketplace handlers | 4 |
| **Total** | **16** |

### After

| Deployed function | Count |
|---|---:|
| `create-business-checkout` | 1 |
| `create-checkout` | 1 |
| `driver-connect-onboarding` | 1 |
| `driver-connect-return` | 1 |
| `generate-listing` | 1 |
| `grade` | 1 |
| `marketplace` | 1 |
| `pay-driver` | 1 |
| `scan` | 1 |
| `stripe-webhook` | 1 |
| `verify-pickup` | 1 |
| **Total** | **11** |

Static rewrite rules do not create additional serverless functions. Verify the actual preview resource count rather than treating this calculation as deployment proof.

## 9. Automated tests

### Unit tests for `api/marketplace.js`

Use Node's built-in test runner with mocked `global.fetch` and lightweight request/response doubles. Tests must not contact production Supabase.

Cover:

1. non-POST request returns `405` and `Allow: POST`;
2. missing, unknown, repeated, or array resource returns `400` before authentication;
3. malformed JSON and non-object bodies return normalized `400`;
4. missing service-role configuration returns sanitized `500`;
5. missing/invalid access token returns `401`;
6. authenticated user without operator row returns `403`;
7. operator lookup happens once per request;
8. every documented resource/action reaches the same PostgREST table or RPC as before;
9. required-field validation remains compatible;
10. success responses preserve existing top-level shapes;
11. listing publication surfaces the verified-material trigger error safely;
12. offer rejection preserves empty-update `409` behavior;
13. offer acceptance calls only `accept_offer` with the authenticated operator ID;
14. transaction completion calls only `complete_transaction` with the authenticated operator ID;
15. client-supplied seller/operator IDs cannot override the authenticated user;
16. service keys/tokens never occur in error bodies or captured logs;
17. body `resource` cannot override the query/rewrite resource;
18. transport and non-JSON Supabase failures return normalized errors.

### Local integration tests

Run the router behind the same local Vercel runtime used by the project, with a stub Supabase HTTP service or request interception. Verify all eight compatibility paths preserve POST bodies and select the expected resource. Do not use production credentials or data.

The test matrix must compare old-handler fixtures with router results for:

- status code;
- `Allow` header;
- success keys;
- error string and additive code;
- Supabase path/method/body;
- RPC name and arguments.

### Existing regression checks

```powershell
git diff --check
npm test
npm run test:scanner-checkpoint
npm run test:api-marketplace
```

The canonical scanner checkpoint must remain isolated from production APIs and Supabase.

## 10. Preview-deployment verification

Deploy the complete atomic change to a protected Vercel preview. Do not deploy an intermediate state or production first.

### Resource inspection

In Vercel's deployment Resources view:

- confirm exactly 11 Vercel Functions;
- confirm `api/marketplace` exists;
- confirm the two duplicate and four original marketplace function bundles are absent;
- confirm canonical `scan`, `grade`, pickup, driver, and Stripe functions remain present.

### Compatibility routes

For each of buyers, listings, offers, and transactions:

- POST to the extensionless path;
- POST to the `.js` path;
- confirm both hit the marketplace router;
- confirm method, body, authentication, response status, and payload shape match;
- GET both forms and confirm `405` plus `Allow: POST`;
- confirm direct `/api/marketplace` without resource returns `400`.

Add a temporary non-sensitive response/log correlation marker identifying `resource` and `action`, never token/body contents, if route diagnosis requires it.

### Authorization matrix

For both URL forms verify:

| Identity | Expected result |
|---|---|
| no/invalid session | `401` |
| authenticated non-operator | `403` |
| authorized disposable operator | action-specific result |

Use a disposable non-production/test operator and clean up test rows through approved mechanisms.

### Marketplace lifecycle

Repeat the existing marketplace smoke runbook and extend it on staging when verified inventory exists:

```text
create buyer
create draft listing
reject publication of unverified material
publish verified listing
submit offer
reject an offer
submit replacement offer
accept offer -> one marketplace transaction
retry accept -> no duplicate transaction
complete transaction
retry completion -> no duplicate completion side effects
```

Assert relevant listing events and database invariants. No SQL or RPC is changed by this work.

### Unreferenced duplicates

Confirm genuine `404` responses for:

```text
/api/create-checkout/route
/api/scan-operator
```

Also confirm referenced `/api/create-checkout` and `/api/grade` still resolve.

### Unaffected boundaries

- load `scanner.html` and rerun the canonical browser checkpoint;
- verify `/api/grade` rejects an unsupported method without contacting Anthropic;
- verify driver Connect and payout routes reject unauthenticated test requests without contacting Stripe;
- verify `/api/stripe-webhook` rejects an invalid signature;
- verify all quarantine URLs remain absent due to the existing `.vercelignore` entry.

## 11. Rollback

### Before commit

Reverse only the planned working-tree changes:

- remove the new `api/marketplace.js` and its test if they were created solely for this change;
- restore the prior `vercel.json`, `.vercelignore`, and `package.json` contents without resetting unrelated work;
- verify the original four API files remain intact.

### After commit, before production

Revert the complete atomic commit. The repository returns to 16 functions and will again exceed the Hobby limit, so this rollback cannot produce a successful Hobby preview. Use it only to restore source state while preparing a corrected reduction or temporary Pro upgrade.

### After production

Safest operational rollback:

1. upgrade the Vercel project temporarily to Pro or prepare another verified ≤12-function deployment;
2. revert the reduction commit;
3. deploy the restored original handlers;
4. exercise all four old marketplace routes and authorization cases;
5. confirm Stripe, scanner, driver, SQL, and RPC state were not changed;
6. remove the temporary plan upgrade only after a corrected ≤12-function deployment is ready.

Do not delete data, reverse migrations, or alter marketplace RPCs during rollback.

## 12. Vercel and runtime risks

### Rewrite precedence

The source marketplace functions are excluded, so compatibility paths depend entirely on Vercel rewrites. A syntax error, route-precedence issue, or query-parameter handling difference could yield `404`, drop `resource`, or dispatch incorrectly. Only a real preview proves the behavior.

### `.js` path handling

The UI explicitly requests `.js` API paths. `cleanUrls` should not be assumed to normalize JavaScript function routes. Both source forms therefore receive explicit rewrite rules and separate HTTP tests.

### Query dispatch

Vercel may represent query values as strings or arrays. The router must accept exactly one whitelisted string and reject arrays/repeated values. Body fields must not override it.

### Serverless export format

The repository mixes CommonJS and ESM handlers. The new router should use the proven CommonJS form:

```js
module.exports = async function handler(req, res) { /* ... */ }
```

Do not mix `export default` with CommonJS in the consolidated file. Validate with `node --check`, a direct unit import, and the preview runtime.

### Body parsing through rewrites

Compatibility relies on Vercel preserving the POST method and request body across internal rewrites. Unit tests cannot prove platform behavior; preview HTTP tests must.

### Exclusion timing

Adding the original four APIs to `.vercelignore` before the router and rewrites are included creates immediate marketplace `404`s. All implementation pieces must ship together.

### Observability concentration

Four endpoints become one runtime bundle and log stream. Structured non-sensitive fields for `resource`, `action`, outcome, and correlation ID are needed to retain diagnosability, but tokens and payload contents must not be logged.

### Failure blast radius

A router initialization/export error affects the entire operator marketplace. This is why all resource contracts need unit coverage and preview verification before production.

## 13. Smallest safe commit boundary

Use **one atomic deployability commit**:

```text
refactor(api): consolidate marketplace functions for Hobby deployment
```

It contains only:

```text
M  .vercelignore
M  vercel.json
M  package.json
A  api/marketplace.js
A  tests/api-marketplace.test.js
```

One commit is safer than separate exclusion/router commits because no intermediate commit can both preserve marketplace compatibility and satisfy the Hobby limit. Implementation can still be developed in test-first steps locally, but the review/deployment boundary must be atomic.

Do not include documentation, unrelated working-tree changes, UI changes, SQL, migrations, scanner behavior, Stripe behavior, or existing handler edits.

## Acceptance criteria

- The two duplicate and four superseded marketplace files remain in Git but are absent from deployment.
- Exactly 11 functions appear in the preview Resources view.
- Both existing URL forms work for every marketplace action.
- Authentication and operator authorization match existing behavior.
- Marketplace RPC and database invariants remain unchanged.
- Canonical scanner, driver, operator, and Stripe boundaries still deploy and pass non-production checks.
- All local tests pass.
- Rollback prerequisites are understood before production promotion.
