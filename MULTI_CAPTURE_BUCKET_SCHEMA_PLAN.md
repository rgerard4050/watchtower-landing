# Multi-Capture Bucket Durable Schema Plan

Status: proposed; not implemented  
Prepared: 2026-08-04  
Scope: durable resident collection drafts, item ledger, atomic Stage Bounty, and compatibility with the canonical scan/job lifecycle

## Executive decision

Add two pre-lifecycle tables, `collections` and `collection_items`. Accepted captures become durable item rows while the collection remains editable. One atomic and idempotent `stage_collection()` transition freezes the ledger, creates exactly one canonical `scans` row with `bounty_status = null`, and links the collection to that scan.

```text
collections (OPEN) 1 -> many collection_items (ACCEPTED/REMOVED)
          |
          | stage_collection() — one transaction
          v
collections (STAGED) 1 -> 1 scans (bounty_status NULL)
                                  |
                                  | existing pickup evidence update
                                  v
                           scans.bounty_status = open
                                  |
                                  | existing live trigger
                                  v
                           one active jobs row
```

This preserves RFC-0001 ownership:

- draft tables own only editable pre-staging evidence;
- `scans` remains the first canonical lifecycle record and resident-visible pickup state;
- `jobs` remains the operational workflow state;
- staging does not create jobs, credit wallets, accrue payouts, create intakes/passports, or enter marketplace state;
- the existing null-to-`open` scan transition remains the pickup/job boundary.

## Evidence boundary

### Verified live

- `scans` is UUID-keyed, RLS-enabled, and owns resident/business association, accepted estimates, pickup evidence, value fields, and `bounty_status`.
- The live scan transition guard permits null→open, open→claimed, claimed→completed, and open/claimed→cancelled.
- `trg_create_job_on_bounty_open` creates a PENDING job when a scan becomes open.
- `jobs_scan_id_active_uniq` prevents more than one non-cancelled job per scan.
- Scan completion triggers wallet credit, payout accrual, and legacy lifecycle side effects; staging must not invoke them.
- Residents may open pickup only on an owned eligible scan with required evidence.
- Direct job writes are absent; triggers/RPCs own the job lifecycle.
- Live migration history diverges materially from local filenames. Live catalog definitions must be re-queried before any migration is written or applied.

### Repository intent

- Root `scanner.html` currently inserts one scan per accepted capture and immediately locks/redirects.
- The current browser computes an estimated resident share as 40% of AI high estimate and 100 WTWR per resident dollar.
- That browser calculation is not sufficient evidence of the live completion-credit formula and must not be promoted to a financial database rule without catalog verification.

### Proposed in this document

Every table, function, policy, grant, status, retention interval, and contract below is proposed. None exists merely because it is named here.

## 1. Proposed tables and columns

### `public.collections`

One row represents one resident-owned editable collection and, after staging, its immutable linkage to one canonical scan.

| Column | Type | Null/default | Contract |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Stable collection identity |
| `owner_user_id` | `uuid` | NOT NULL | FK to `auth.users(id)`; authorization owner captured from verified identity, never client claims |
| `resident_id` | `uuid` | NOT NULL | FK to `public.residents(id)`; domain owner used on staged scan |
| `session_id` | `text` | NOT NULL | Compatibility identifier copied to the staged scan; not authorization |
| `status` | `text` | NOT NULL default `'OPEN'` | `OPEN`, `STAGED`, or `ABANDONED` |
| `version` | `bigint` | NOT NULL default `0` | Monotonic optimistic-concurrency version |
| `item_count` | `integer` | NOT NULL default `0` | Server-maintained count of ACCEPTED items |
| `estimated_market_low_cents` | `bigint` | NOT NULL default `0` | Sum of accepted item market-low estimates |
| `estimated_market_high_cents` | `bigint` | NOT NULL default `0` | Sum of accepted item market-high estimates; maps to staged scan high/accepted value |
| `estimated_resident_dollars_cents` | `bigint` | NOT NULL default `0` | Sum of accepted item resident-dollar estimates |
| `estimated_wtwr_units` | `bigint` | NOT NULL default `0` | Sum of accepted item advisory WTWR estimates; not issued balance |
| `pricing_rule_version` | `text` | NOT NULL | Version used for server-derived item/aggregate estimates |
| `staged_scan_id` | `uuid` | nullable | UNIQUE FK to `public.scans(id)` ON DELETE RESTRICT |
| `stage_idempotency_key` | `uuid` | nullable | Unique successful Stage Bounty key |
| `staged_at` | `timestamptz` | nullable | Server staging time |
| `abandoned_at` | `timestamptz` | nullable | Server abandonment time |
| `created_at` | `timestamptz` | NOT NULL default `now()` | Audit time |
| `updated_at` | `timestamptz` | NOT NULL default `now()` | Updated on every durable mutation |
| `last_activity_at` | `timestamptz` | NOT NULL default `now()` | Cleanup/recovery activity clock |

Why both owner columns exist:

- `owner_user_id` permits efficient RLS using `(select auth.uid())` without a per-row residents join.
- `resident_id` preserves the verified domain relationship required by `scans`, wallets, and pickup.
- Creation/staging functions must verify that the resident row belongs to `owner_user_id`. The pair is immutable after creation.
- `session_id` supports current scan grouping but grants no access and cannot recover a collection by itself.

### `public.collection_items`

One row represents one accepted capture. Pending/unaccepted photos never create a row.

| Column | Type | Null/default | Contract |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Stable server item ID |
| `collection_id` | `uuid` | NOT NULL | FK to `collections(id)` ON DELETE CASCADE |
| `client_item_id` | `uuid` | NOT NULL | Stable retry key generated before Add Item |
| `position` | `integer` | NOT NULL | Stable drawer order, positive and server-assigned |
| `status` | `text` | NOT NULL default `'ACCEPTED'` | `ACCEPTED` or `REMOVED` |
| `captured_at` | `timestamptz` | NOT NULL | Capture time validated/bounded by server |
| `image_path` | `text` | NOT NULL | Private storage object path; never raw base64 or a signed URL |
| `image_sha256` | `text` | NOT NULL | 64-character lowercase SHA-256 hex for evidence integrity/dedup diagnostics |
| `summary` | `text` | NOT NULL | Normalized AI summary displayed once |
| `materials` | `text[]` | NOT NULL | Normalized, trimmed, deduplicated non-empty material labels |
| `estimated_market_low_cents` | `bigint` | NOT NULL | Server-validated AI market low estimate |
| `estimated_market_high_cents` | `bigint` | NOT NULL | Server-validated AI market high estimate |
| `estimated_resident_dollars_cents` | `bigint` | NOT NULL | Server-derived resident-dollar estimate |
| `estimated_wtwr_units` | `bigint` | NOT NULL | Server-derived advisory WTWR estimate |
| `analysis_confidence` | `numeric(5,4)` | nullable | Range 0–1; advisory only |
| `review_state` | `text` | NOT NULL default `'UNREVIEWED'` | `UNREVIEWED`, `NEEDS_REVIEW`, `RESIDENT_CONFIRMED`, `OPERATOR_REVIEWED`, or `REJECTED` |
| `coaching_tip` | `text` | nullable | Advisory preparation guidance |
| `safety_warning` | `text` | nullable | Advisory safety warning |
| `ai_provider` | `text` | NOT NULL | Analysis provenance |
| `ai_model` | `text` | NOT NULL | Analysis provenance |
| `ai_schema_version` | `text` | NOT NULL | Response schema version |
| `ai_prompt_version` | `text` | NOT NULL | Prompt version |
| `ai_analyzed_at` | `timestamptz` | NOT NULL | Server analysis timestamp |
| `analysis_payload` | `jsonb` | NOT NULL | Validated normalized response/provenance, not image data or secrets |
| `removed_at` | `timestamptz` | nullable | Required only when REMOVED |
| `removed_by` | `uuid` | nullable | FK to `auth.users(id)`; actor who removed the item |
| `created_at` | `timestamptz` | NOT NULL default `now()` | Durable acceptance time |
| `updated_at` | `timestamptz` | NOT NULL default `now()` | Last durable mutation |

Store currency as integer cents and WTWR as integer units to avoid floating-point or inconsistent browser rounding. Convert to the live `scans` numeric columns only inside staging.

## 2. Keys, constraints, and indexes

### `collections` constraints

- PK: `collections_pkey (id)`.
- FK: `owner_user_id -> auth.users(id) ON DELETE RESTRICT`.
- FK: `resident_id -> residents(id) ON DELETE RESTRICT`.
- FK: `staged_scan_id -> scans(id) ON DELETE RESTRICT`.
- Status check: `status IN ('OPEN','STAGED','ABANDONED')`.
- Version check: `version >= 0`.
- Totals checks: all count/cents/WTWR totals are non-negative.
- Staging consistency:
  - OPEN requires `staged_scan_id`, `stage_idempotency_key`, `staged_at`, and `abandoned_at` all null.
  - STAGED requires `staged_scan_id`, `stage_idempotency_key`, and `staged_at` non-null and `abandoned_at` null.
  - ABANDONED requires `abandoned_at` non-null and all staging columns null.
- Staged non-empty check: STAGED requires `item_count > 0`.
- `UNIQUE (staged_scan_id)` guarantees a scan is linked from at most one collection.
- `UNIQUE (stage_idempotency_key)` guarantees one successful staging identity.

Indexes:

- Partial unique `collections_one_open_per_owner` on `(owner_user_id) WHERE status = 'OPEN'`.
- `collections_resident_status_idx (resident_id, status)`.
- `collections_last_activity_open_idx (last_activity_at) WHERE status = 'OPEN'` for cleanup.
- Unique indexes backing staged scan and idempotency constraints.

### `collection_items` constraints

- PK: `collection_items_pkey (id)`.
- FK: `collection_id -> collections(id) ON DELETE CASCADE`.
- FK: `removed_by -> auth.users(id) ON DELETE SET NULL`.
- `UNIQUE (collection_id, client_item_id)` for item idempotency.
- `UNIQUE (collection_id, position)` for stable ordering.
- Status check: `status IN ('ACCEPTED','REMOVED')`.
- Position check: `position > 0`.
- Material check: `cardinality(materials) > 0`; normalization/dedup is also enforced in the mutation function.
- Estimate checks: every cents/WTWR field is non-negative and high >= low.
- Confidence check: null or between 0 and 1 inclusive.
- Review check: approved vocabulary only.
- Removal consistency: ACCEPTED requires `removed_at/removed_by` null; REMOVED requires both non-null.
- Image hash check: `image_sha256 ~ '^[0-9a-f]{64}$'`.
- Text size checks proposed at the database boundary: summary <= 2,000 characters; each material <= 120; coaching/safety <= 2,000; `analysis_payload` bounded at the API boundary.

Indexes:

- `collection_items_collection_status_position_idx (collection_id, status, position)`.
- `collection_items_review_idx (review_state) WHERE status = 'ACCEPTED'` for operator exceptions.
- No uniqueness on `image_sha256`: two legitimate captures can be visually identical; the hash is diagnostic, while `client_item_id` owns idempotency.

### Mutation guard

A `BEFORE INSERT OR UPDATE` trigger on `collection_items` must lock/read the parent and reject mutations unless `collections.status = 'OPEN'`. This protects the invariant even from an accidentally over-privileged path. There is no ordinary DELETE path; removal is a status transition.

## 3. RLS policies and grants

Enable RLS on both tables immediately. Explicit grants are mandatory because current Supabase platform defaults no longer guarantee new public tables are Data API-exposed, and because this project has historically broad default privileges.

### Base grants

Start by revoking everything from every browser role:

```text
REVOKE ALL from PUBLIC, anon, authenticated on both tables
```

Then grant only:

| Role | `collections` | `collection_items` | RPC execution |
|---|---|---|---|
| `anon` | none | none | none |
| `authenticated` | SELECT | SELECT | get/create open, remove item, abandon, stage as explicitly granted |
| resident | authenticated own-row policies | authenticated own-parent policies | functions derive resident from `auth.uid()` |
| driver | no draft access merely for being a driver | no draft access | none; after pickup they use scan/job contracts |
| operator | SELECT through `is_operator()` policy | SELECT through `is_operator()` policy | optional review RPC only, separately approved |
| `service_role` | SELECT, INSERT, UPDATE; no routine DELETE | SELECT, INSERT, UPDATE; no routine DELETE | item-accept/internal cleanup RPCs only |

`service_role` bypasses RLS but still receives explicit least-privilege grants. Physical deletion belongs only to a tightly scoped retention function owned by `postgres`, not routine service-role table access.

### `collections` policies

1. **Resident select own collection** — `FOR SELECT TO authenticated USING (owner_user_id = (select auth.uid()))`.
2. **Operator select collections** — `FOR SELECT TO authenticated USING ((select public.is_operator()))`.
3. No browser INSERT/UPDATE/DELETE policies. Resident mutations use narrow functions that derive identity and validate state/version.

### `collection_items` policies

1. **Resident select own items** — `FOR SELECT TO authenticated USING (EXISTS collection owned by auth.uid())`.
2. **Operator select items** — `FOR SELECT TO authenticated USING ((select public.is_operator()))`.
3. No browser INSERT/UPDATE/DELETE policies.

Use `(select auth.uid())` and `(select public.is_operator())` in policies to avoid repeated per-row function evaluation. Index `collections.owner_user_id` via the partial/open index and, if staged-history reads become frequent, add a general `owner_user_id` index.

### Function grants

Every new function must:

- use a fixed `search_path`;
- revoke EXECUTE from `PUBLIC`, `anon`, and every unintended role explicitly;
- avoid direct client-supplied actor/resident authority;
- be `SECURITY INVOKER` when RLS can safely express the operation;
- use `SECURITY DEFINER` only for required atomic writes, with internal `auth.uid()`/ownership checks.

Proposed execution:

- `get_or_create_open_collection()` — authenticated only.
- `remove_collection_item(collection_id,item_id,expected_version)` — authenticated only.
- `abandon_collection(collection_id,expected_version)` — authenticated only.
- `stage_collection(collection_id,expected_version,idempotency_key,location...)` — authenticated only.
- `accept_collection_item(...)` — service_role only, invoked by a server API that verifies the resident bearer token and validates the `/api/scan` result/image.
- retention cleanup — no application-role EXECUTE; scheduled privileged owner only.

## 4. Item-level idempotency

Before upload/save, the browser generates one `client_item_id` and retains it for retries of that pending item only.

The server uses a deterministic private object path such as:

```text
collection-items/<owner_user_id>/<collection_id>/<client_item_id>.jpg
```

`accept_collection_item()` locks the collection, verifies OPEN status/version/owner, then:

1. looks up `(collection_id, client_item_id)`;
2. if found and payload hash matches, returns that item plus the current aggregate without incrementing version;
3. if found and payload hash differs, returns a conflict; it never overwrites a different accepted capture under the same key;
4. if absent, inserts exactly one item, recomputes aggregate totals, increments collection version once, and returns the full ledger.

The unique constraint is the concurrency backstop. On a unique violation from simultaneous retries, the function re-reads and returns the winner only when hashes/contracts match.

## 5. Collection versioning

- `collections.version` starts at 0.
- Every successful add, remove, allowed review mutation, abandonment, or staging increments it by exactly 1.
- Idempotent retries that make no durable change return the existing version unchanged.
- Mutation requests include `expected_version`.
- The function locks the collection `FOR UPDATE`; if actual != expected, it returns a structured conflict containing the current version/ledger (API maps to HTTP 409).
- The browser replaces local state with the returned server representation; it never patches totals optimistically.
- Stale-tab mutations after staging return STAGED plus `staged_scan_id`, causing the tab to render locked state.

## 6. Server-derived WTWR and dollar totals

### Source values

The analysis API may propose market low/high estimates, but the item-accept server boundary validates them and computes resident-dollar and WTWR estimates using a named `pricing_rule_version`. Clients cannot submit authoritative resident-dollar totals, WTWR totals, payout amounts, or wallet credit.

### Aggregate algorithm

After every item mutation and again inside staging:

```text
item_count                         = count(ACCEPTED items)
estimated_market_low_cents        = sum(item.market_low_cents)
estimated_market_high_cents       = sum(item.market_high_cents)
estimated_resident_dollars_cents  = sum(item.resident_dollars_cents)
estimated_wtwr_units              = sum(item.estimated_wtwr_units)
```

All sums use `COALESCE(...,0)` and checked bigint arithmetic. Stored collection totals are a cache maintained inside the same transaction and verified against a recomputation during staging.

### Required pre-migration decision

The browser currently displays 40% of estimated high value and 100 WTWR per resident dollar. The live audit confirms wallet credit occurs only on scan completion but does not record the trigger's exact formula. Before writing SQL:

1. inspect the live definition of `credit_resident_wtwr_on_completion` and related reserve events;
2. approve whether pre-staging WTWR is the same estimate as eventual completion credit;
3. encode that approved calculation once in a versioned server pricing function/test fixture;
4. keep the display labelled **Estimated** and never alter `residents.wtwr_balance` during analysis, item acceptance, or staging.

The schema supports the values without inventing the formula. Implementation is blocked until this verification is complete.

## 7. Atomic Stage Bounty RPC

Proposed signature:

```text
stage_collection(
  p_collection_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid,
  p_lat numeric,
  p_lng numeric,
  p_location_accuracy_m numeric
) -> composite collection + staged scan projection
```

The function is authenticated-only, `SECURITY DEFINER`, fixed `search_path`, and derives the actor from `auth.uid()`.

Transaction behavior:

1. Reject missing auth identity.
2. Lock the collection `FOR UPDATE` and verify `owner_user_id = auth.uid()` and the `resident_id` relationship.
3. If already STAGED:
   - return the existing scan only when the supplied idempotency key matches the successful key;
   - otherwise return an already-staged conflict without mutation.
4. Require OPEN status, exact expected version, at least one ACCEPTED item, and no invalid/rejected item that policy says blocks staging.
5. Lock/re-read accepted items in stable position order.
6. Recompute totals from item rows and reject any cached-total mismatch rather than trusting cached columns.
7. Validate optional location ranges and compute pickup eligibility through the existing verified server/database rule. Do not trust a browser `bountyCreated` flag.
8. Build the canonical scan aggregate:
   - `resident_id` from collection;
   - `session_id` from collection for compatibility;
   - `summary` as one deterministic collection summary, e.g. item count plus normalized material union, not duplicated item prose;
   - `items_seen` as a normalized, deduplicated union of accepted item materials;
   - `est_low` from market-low cents / 100;
   - `est_high` and `accepted_value` from market-high cents / 100, preserving current downstream value semantics;
   - coaching/safety aggregate from accepted item evidence under a deterministic rule;
   - `lat/lng/location_accuracy_m` from validated staging location when supplied;
   - `accepted = true`;
   - `bounty_created` from the existing verified eligibility rule;
   - `bounty_status = null` explicitly;
   - no claimed/completed/pickup evidence fields.
9. Insert exactly one `scans` row.
10. Update collection to STAGED with returned scan ID, staging key/time, recomputed totals, and version + 1.
11. Return the locked ledger summary and staged scan projection.

No external network call occurs inside the transaction. No job, wallet credit, payout, intake, passport, manifest, listing, or marketplace record is written.

## 8. One collection to exactly one scan

The one-to-one invariant uses both state gating and database uniqueness:

- only `stage_collection()` may populate `collections.staged_scan_id`;
- `staged_scan_id` is UNIQUE and non-null only for STAGED collections;
- `stage_idempotency_key` is UNIQUE;
- the function locks the collection before scan insertion;
- status/version checks prevent a second normal insertion;
- a retry with the winning idempotency key returns the existing scan;
- a different key after staging conflicts;
- one scan cannot be referenced by two collections because of the unique scan linkage.

Do not add a second collection foreign key to `scans` in the minimum phase. The unique reverse lookup on `collections(staged_scan_id)` provides bidirectional resolution without a circular FK. A later denormalization requires separate justification.

## 9. Reload and session recovery

Minimum safe release requires an authenticated resident:

- resolve Supabase session;
- query `collections` using the own-row SELECT policy;
- load the one OPEN collection, otherwise the most recent STAGED collection relevant to handoff;
- load ordered item rows and display returned totals/version;
- if STAGED, load `staged_scan_id` and render locked/request-pickup state;
- never use local storage as item, total, lock, or pickup authority.

The current `wt_session` value may be copied for analytics compatibility but cannot authorize recovery. Supporting anonymous durable collections would require a separate server-issued, hashed recovery credential/API design and is explicitly outside the minimum safe contract.

If reload loses a pending, unaccepted capture, explain that only the current photo was lost; accepted items remain durable.

## 10. Allowed mutations before staging

While OPEN, an owning resident may request these narrow operations:

- accept one analyzed item through the authenticated API/service-role function;
- soft-remove one ACCEPTED item;
- optionally change `review_state` from UNREVIEWED/NEEDS_REVIEW to RESIDENT_CONFIRMED through a dedicated RPC;
- abandon an empty or unwanted collection;
- Stage Bounty.

The resident cannot directly change:

- owner/resident/session identity;
- item estimates, AI provenance, confidence, image hash/path, or accepted timestamp;
- collection cached totals, pricing version, status, staged scan linkage, or staging key;
- OPERATOR_REVIEWED/REJECTED states;
- scan/job/wallet/payout fields.

“Edit item” in the minimum UI should mean remove and rescan, not mutate AI evidence in place. This preserves provenance and keeps the mutation surface small.

## 11. Enforcement after staging

Defense in depth:

- item mutation trigger requires parent OPEN;
- every mutation function locks and checks OPEN plus expected version;
- collection status/link consistency constraint prevents clearing/replacing the staged scan;
- no direct authenticated table-write grants/policies exist;
- stage function treats STAGED as return-existing/conflict, never restage;
- no resident DELETE path exists;
- private storage policies prevent replacing staged item objects; staging should move/mark objects into an immutable prefix or make the accepted object path write-once.

Operators and service role do not receive an ordinary “unlock” function. Corrections require a future append-only correction/review design, not status rollback.

## 12. Failure, retry, and partial-success behavior

### Analysis failure

No item row exists. Existing camera/API recovery remains local; accepted ledger is unchanged.

### Image upload succeeds, item transaction fails

- Object path is deterministic by `client_item_id`.
- Retry verifies/reuses the same object hash and then retries item acceptance.
- An orphan-object cleanup job removes objects with no item row after a grace period.
- Never create the item first and hope an image upload later succeeds.

### Item transaction succeeds, response is lost

Retry with the same `client_item_id` returns the same item and unchanged version/totals.

### Version conflict

No write occurs. Return current ledger/version; client refreshes and asks the user to retry the intended action.

### Stage failure before commit

Postgres rolls back the scan insert and collection update together. Collection remains OPEN and editable with the same version.

### Stage commit succeeds, response is lost

Retry with the same idempotency key returns the same staged scan. It cannot insert another.

### Pickup failure

Collection and scan remain STAGED with scan bounty null. Existing pickup page retries evidence/update against the same scan; no collection/item/scan duplication occurs.

### Job-trigger failure

The scan null-to-open update and its AFTER trigger execute in one database transaction. A trigger error rolls back the open transition. The pickup page reports failure and retries the same scan transition.

## 13. Forward migration and rollback

Because live/local migration ledgers diverge, begin with a fresh read-only live catalog audit and create migrations only after reconciling object names/ACL defaults.

### Forward migration sequence

1. **Tables and constraints:** create collections/items, indexes, RLS, explicit revokes/grants, and immutable timestamp/guard triggers. No client can create rows yet.
2. **Read/create and item RPCs:** add narrowly granted functions, explicit EXECUTE revokes, and aggregate/version logic.
3. **Stage RPC:** add atomic scan materialization, idempotency, and compatibility tests. Do not alter existing scan triggers.
4. **Private storage contract:** create/verify bucket policies and deterministic paths, if durable item images are approved.
5. **API/UI activation:** only after pgTAP and isolated integration tests pass.

Use `supabase migration new` when implementation is authorized; do not invent a filename. Run database/security advisors and compare the resulting migration ledger before deployment.

### Rollback strategy

- Before activation, normal reverse migration may revoke functions/grants and drop empty new tables in dependency order.
- After any collection data exists, prefer feature disablement: revoke RPC/API access, stop creating drafts, and retain rows/images for recovery/audit.
- Never drop tables while a STAGED collection references a canonical scan.
- Never delete or mutate staged scans, pickup state, jobs, wallets, payouts, or downstream lifecycle records.
- Removing the feature does not require changing existing scan/job triggers because the design never modifies them.
- A later destructive cleanup requires separate retention approval, zero-dependency verification, and a forward migration—not an ad hoc rollback script.

## 14. pgTAP coverage

### Schema and constraints

- tables/columns/types/defaults/PKs/FKs exist exactly as approved;
- RLS enabled on both tables;
- status, version, totals, confidence, removal, hash, and staging consistency checks reject invalid rows;
- unique open-owner, client item, position, staged scan, and stage key constraints hold under concurrency;
- required indexes exist and support FK/RLS paths.

### Grants and RLS matrix

Test as `anon`, authenticated owner, another resident, verified driver, operator, and service role:

- anon reads/writes nothing;
- owner reads own collection/items only;
- another resident reads/mutates nothing;
- driver identity alone grants no draft access;
- operator reads all but cannot mutate through base tables;
- service role has only intended relation/RPC privileges;
- PUBLIC/anon cannot execute any new function;
- authenticated cannot execute service-only item-accept/cleanup functions.

### Item/version behavior

- first accept creates one item and increments version/totals once;
- same client ID/hash is idempotent;
- same client ID/different hash conflicts;
- concurrent duplicate accepts result in one row;
- stale expected version changes nothing;
- remove affects only target item and recomputes totals;
- mutations against STAGED/ABANDONED parents fail;
- trigger blocks direct post-stage mutation even with an otherwise capable role.

### Stage behavior

- empty/foreign/stale/abandoned collection cannot stage;
- valid stage creates one scan and locks complete ledger;
- scan fields/totals/material union map exactly;
- staged scan bounty status is null and no job exists;
- same staging key returns same scan;
- different key conflicts;
- concurrent calls create one scan;
- simulated exception after scan insert rolls back both scan and collection changes;
- later valid pickup open creates one job; retry/concurrency remains one job;
- staging fires no completion wallet/payout/intake/passport triggers.

### Financial estimates

- item estimates come from the approved server pricing function/version;
- aggregate cents/WTWR equal item sums with deterministic rounding;
- stage recomputation detects cached drift;
- analysis, acceptance, and staging do not change resident balance, token reserve, payout, or redemption records.

## 15. Playwright/browser integration

- unauthenticated users may analyze but are prompted to sign in before durable Add Item/Stage;
- login/reload resolves the same open collection by auth identity;
- every accepted capture appears once with stable ID, timestamp, image reference/thumbnail, summary, normalized materials, estimates, confidence/review state;
- drawer totals match returned server aggregates, not DOM summation;
- double-click Add Item produces one item request identity/one row;
- Retake Current Photo changes no accepted row;
- Scan Another Item preserves prior items;
- reload preserves ledger/order/totals and makes no repeated writes;
- remove updates only one item and the returned totals;
- stale-tab conflict refreshes safely;
- stage failure remains editable and creates no scan;
- stage success locks all edits and yields one scan ID;
- retry/lost stage response resolves the same scan;
- Request Pickup appears only after staging;
- Pickup Requested appears only after the existing durable open transition;
- double pickup submit/reload creates one update and one active job;
- existing camera readiness and API/network/error recovery tests remain green;
- no production Supabase, storage, wallets, or jobs are touched by tests.

## 16. Cleanup and retention

Proposed minimum rules, subject to privacy/legal approval:

- OPEN collections with no activity for 30 days transition to ABANDONED through a privileged scheduled function.
- ABANDONED collection metadata/item rows are retained for an additional 30-day recovery/grace window, then physically deleted with their private image objects by a privileged retention job.
- Orphan image objects with no item row are deleted after 24 hours.
- STAGED collections/items/images inherit the canonical scan/evidence retention policy and are never removed by abandoned-draft cleanup.
- Cleanup uses batched indexed selection (`status`, `last_activity_at`), `FOR UPDATE SKIP LOCKED`, bounded row counts, and retryable object deletion.
- Database deletion and object deletion cannot be one transaction. Mark cleanup state first, delete objects idempotently, then delete eligible database rows; record failures for retry.
- No browser, resident, driver, or ordinary service endpoint receives physical-delete capability.
- If no scheduler is verified, use a Vercel/admin scheduled job; do not assume `pg_cron` is installed.

## 17. Compatibility impact

### Current `scanner.html`

Required future changes:

- stop inserting into `scans` on Add Item;
- require authenticated resident resolution for durable collection operations;
- load/get-or-create the open collection on startup;
- retain current `/api/scan` image contract unless separately versioned;
- upload accepted item image to private storage and call the item-accept boundary;
- render item ledger/totals from server responses;
- make Retake clear only pending capture;
- add Stage Bounty and lock only from its response;
- remove duplicate summary rendering and browser-authored financial totals;
- use the returned staged scan ID for pickup handoff.

Existing anonymous one-scan persistence behavior changes: anonymous visitors can still receive advisory analysis, but cannot create a durable multi-item collection until authenticated. Preserving anonymous durable drafts requires a separate approved recovery-token design.

### `/api/scan`

The existing request fields `imageBase64` and `mediaType` can remain. Its response needs versioned provenance/confidence and normalized estimates sufficient for the trusted item-accept server boundary, or the item API must derive/validate those fields independently. The browser cannot be trusted to relay financial values unchanged.

### Pickup flow

`pickup-photo.html?bounty=<scan UUID>` remains unchanged in purpose. It receives the Stage Bounty scan ID, uploads evidence, and conditionally changes that scan from null to open. Existing RLS eligibility, scan transition guard, job trigger, and active-job uniqueness continue unchanged.

The staging scan must satisfy every live scan insert/value/owner/location constraint. Exact live column defaults and `can_create_bounty(...)` inputs must be re-queried before writing the stage INSERT.

### Jobs and downstream lifecycle

No driver sees draft collections/items. After pickup opens, the job continues to reference one scan; intake/passport/manifest/listing behavior remains unchanged. Draft item detail may be exposed later to operators/drivers only through an approved least-privilege projection, not by broadening draft-table policies now.

## 18. Smallest safe phases

### Phase 0 — deployed-truth refresh and decisions

- Re-query live scans/residents constraints, scan policies/triggers/functions/grants, wallet-credit formula, storage configuration, and migration ledger.
- Approve authenticated-only drafts, pricing version/formula, storage retention, aggregate scan mapping, and location timing.
- Record the pre-lifecycle draft ownership decision in an ADR/RFC update.

Exit: no unresolved schema/financial/authorization names.

### Phase 1 — additive tables, RLS, grants, and pgTAP

- Add tables/constraints/indexes/guards.
- Add owner/operator read policies and explicit grants.
- Keep all creation/mutation inaccessible.

Exit: permission and constraint tests pass; zero production behavior change.

### Phase 2 — collection/item backend

- Add get/create and service item-accept/remove/version functions.
- Add private storage path/policies and isolated API handlers.
- Add idempotency, totals, reload, orphan handling, and integration tests.

Exit: authenticated residents can maintain one durable open ledger; no scan/job is created.

### Phase 3 — atomic staging

- Add `stage_collection()` and scan mapping.
- Prove one collection -> one scan under retry/concurrency and no completion side effects.
- Verify the staged scan is accepted by the existing pickup RLS path.

Exit: staging returns one null-bounty scan and creates no job.

### Phase 4 — canonical scanner UI integration

- Replace current direct scan insertion with ledger operations.
- Add drawer, multi-capture, reload, conflict, Stage Bounty, and locked states.
- Preserve camera and `/api/scan` recovery behavior.

Exit: unlimited sequential accepted captures survive reload and stage once.

### Phase 5 — pickup continuity preview

- Exercise staged scan -> pickup evidence -> open scan -> one job in an isolated preview project.
- Verify reload/retry and downstream driver/operator visibility.

Exit: one multi-item collection traverses the existing canonical product spine without duplicate scans, jobs, wallet events, payouts, intakes, or passports.

## Implementation gate

Do not implement migrations or UI from this plan until:

1. live scan/resident/wallet/storage definitions are refreshed;
2. the server WTWR/dollar estimate rule is approved;
3. authenticated-only draft ownership is approved or replaced by a secure anonymous recovery design;
4. the Stage Bounty aggregate mapping is reviewed against every live scan constraint/policy;
5. pgTAP and isolated browser fixtures are prepared before deployment.
