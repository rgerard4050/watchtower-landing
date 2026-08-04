# Multi-Capture Resident Bucket Plan

Status: proposed; not implemented  
Prepared: 2026-08-04  
Canonical resident entry point: `/scanner.html`

## Decision summary

The requested experience is a true multi-capture collection, not another presentation of one `scans` row. Keep `scans` as the canonical staged haul in the existing `scan -> job -> intake -> passport -> marketplace` lifecycle, but add an explicitly pre-lifecycle draft aggregate with durable item rows.

```text
open collection + accepted item drafts
  -> Stage Bounty (one atomic, idempotent transition)
  -> one canonical scans row with bounty_status = null
  -> Request Pickup / pickup evidence
  -> scans.bounty_status = open
  -> one active job
```

Do not insert one `scans` row per captured item. Live-schema evidence shows that `scans` owns resident pickup state and that opening a scan creates a job. Treating every item as a scan would create the wrong lifecycle cardinality and make one resident collection capable of producing multiple jobs.

The referenced live-preview screenshot was not attached in the available conversation payload and no matching preview screenshot exists in the repository. Visual conclusions below therefore come from the current `scanner.html` and the supplied user feedback, not an inspected screenshot.

## Verified constraints and proposed additions

### Verified repository/live behavior

- Root `scanner.html` is the canonical resident scanner.
- Each accepted capture currently calls `POST /api/scan` with one JPEG and receives one advisory analysis.
- The current UI duplicates the analysis summary in `#collectionSummary` and `#summaryText`.
- The current Add to Collection action immediately inserts one `scans` row and then locks or redirects.
- `scans` contains the aggregate summary, `items_seen`, estimates, accepted value, resident/session/location data, and `bounty_status` used by the pickup lifecycle.
- Changing `scans.bounty_status` from null to `open` invokes the live job-creation trigger.
- A partial unique index permits at most one non-cancelled job per scan.
- Pickup evidence and the null-to-`open` transition are currently completed by `pickup-photo.html`.
- The current tests model one scan row, one pickup update, and one active job.

### Proposed, not yet verified or implemented

- A draft collection table and child item table.
- A resident-authorized item-accept contract.
- An atomic Stage Bounty RPC/API contract.
- Server-derived collection totals and WTWR estimate rules.
- Reload recovery for an open collection.

These additions require an approved architecture decision, live-schema re-verification immediately before migration, explicit grants, RLS policies, and permission tests. Supabase's current Data API defaults require new-table exposure to be granted deliberately; RLS and grants are separate controls.

## 1. Exact resident workflow

1. The resident opens `/scanner.html`.
2. The client resolves the authenticated resident and loads that resident's one open collection. If none exists, it creates or requests one through the approved collection contract.
3. The bucket control shows the durable open collection's item count and estimated totals. Clicking it opens the collection drawer.
4. The camera becomes available only after the existing `loadedmetadata`/`canplay` and positive-dimension checks pass.
5. The resident captures one current item. The client validates the JPEG and submits exactly one `POST /api/scan`.
6. The response is rendered once in a current-item review area: description, materials, safety warning, coaching, estimated dollars, and estimated WTWR. It is advisory and is not yet part of the bucket.
7. The resident chooses one of two actions:
   - **Retake Current Photo:** discard only the current capture/analysis and return to the camera. Existing accepted collection items remain unchanged.
   - **Add Item to Collection:** persist one item under the open collection using a stable client item id/idempotency key.
8. After item persistence succeeds, the drawer totals update from the returned durable collection representation. The current-item review clears and the camera returns ready for another item.
9. The resident can repeat capture, analysis, review, and Add Item without a fixed item limit. Practical API/image/rate limits still apply, but the UI must not impose a product count limit.
10. While the collection is open, the resident can inspect it, remove an item, or rescan/replace an item through explicit durable operations. Every edit returns refreshed server-computed totals.
11. When satisfied, the resident chooses **Stage Bounty** in the drawer. The client submits one idempotent staging request.
12. Staging atomically verifies ownership and open state, freezes the accepted item set, computes totals, creates exactly one canonical `scans` row, links it to the collection, and marks the collection staged.
13. Only after the staging response returns the canonical scan ID does the UI show **Staged / Collection Locked**. No item edit controls remain.
14. If the staged scan is pickup-eligible, the resident chooses **Request Pickup**, which hands the staged scan ID to the existing pickup-evidence flow.
15. Only after pickup evidence upload and the durable null-to-`open` update succeed may the UI show **Pickup Requested**. The database trigger remains responsible for creating one active job.
16. A staged collection that is not pickup-eligible shows the drop-off path and permits **Start New Collection**. Starting another collection never deletes or mutates the staged one.

## 2. Open-bucket states and transitions

Use one explicit state machine. UI details such as drawer visibility are orthogonal and must not become lifecycle state.

```text
LOADING_COLLECTION
  -> OPEN_EMPTY
  -> OPEN_READY
  -> ERROR_COLLECTION_LOAD

OPEN_EMPTY / OPEN_READY
  -> CAPTURING
  -> STAGING (only OPEN_READY)

CAPTURING
  -> ANALYZING
  -> OPEN_EMPTY / OPEN_READY (cancel current item)

ANALYZING
  -> ITEM_REVIEW
  -> ERROR_ANALYSIS

ITEM_REVIEW
  -> ADDING_ITEM
  -> CAPTURING (retake current photo)

ADDING_ITEM
  -> OPEN_READY
  -> ERROR_ITEM_SAVE

OPEN_READY
  -> EDITING_ITEM
  -> REMOVING_ITEM
  -> STAGING

STAGING
  -> STAGED_LOCKED
  -> ERROR_STAGING

STAGED_LOCKED
  -> PICKUP_EVIDENCE
  -> NEW_COLLECTION (when pickup is unavailable or later completed)

PICKUP_EVIDENCE
  -> PICKUP_REQUESTED only after the durable open transition
  -> ERROR_PICKUP
```

State invariants:

- `OPEN_EMPTY` has zero durable item rows and zero totals.
- `OPEN_READY` totals include only successfully persisted, non-removed items.
- `ITEM_REVIEW` is not counted until Add Item succeeds.
- `STAGING` disables all edits and duplicate staging requests.
- `STAGED_LOCKED` requires a durable collection row linked to a returned `scans.id`.
- `PICKUP_REQUESTED` requires the staged scan's returned `bounty_status` to equal `open`; navigation or local flags are insufficient.

## 3. Clickable bucket drawer/modal

The collapsed bucket is a real `<button>` available throughout the open-collection workflow. Its accessible name includes the current count and totals, for example: “Open collection, 3 items, estimated 2,400 WTWR, $24.00.”

Clicking it opens a mobile bottom drawer and a centered dialog at larger breakpoints:

- `role="dialog"`, `aria-modal="true"`, labelled title, and described status;
- focus moves to the drawer heading or close button;
- focus is trapped while open;
- Escape and the explicit Close button close it and return focus to the bucket button;
- backdrop click may close only when no save, edit, remove, or staging request is in flight;
- scrolling is contained inside the item list;
- screen-reader live updates announce successful item addition, removal, total changes, staging, and errors.

Drawer content:

- collection status;
- durable item count;
- estimated WTWR total;
- estimated resident-dollar total;
- one row/card per accepted item with thumbnail if safely available, one description, material labels, per-item estimates, and safety marker;
- every row exposes its item ID, capture timestamp, private image thumbnail/reference state, normalized materials, estimated WTWR, estimated dollars, AI confidence, and review state;
- Edit/Remove controls only while open;
- **Scan Another Item** while open;
- **Stage Bounty** only when at least one durable item exists and no mutation is in flight;
- **Request Pickup** only after successful staging and only when eligible;
- **Start New Collection** only after the current collection is staged/cancelled/completed according to the approved lifecycle.

Closing the drawer does not change collection state.

## 4. Per-item data

Each accepted item needs its own durable row. Proposed fields are contract-level names, not approved schema names:

| Field | Purpose |
|---|---|
| `id` | Server-generated item identity; displayed in a compact/copyable form |
| `collection_id` | Parent open collection |
| `client_item_id` | Stable UUID generated before save; retry idempotency key |
| `position` | Stable display ordering |
| `status` | `accepted` or `removed`; prefer soft removal/audit evidence over destructive deletion |
| `captured_at` | Server-validated capture timestamp; display in the resident's locale while retaining the canonical UTC value |
| `image_path` | Private storage object reference for the accepted capture; signed URLs are temporary presentation data, not stored authority |
| `summary` | One normalized AI description for this capture, displayed once |
| `materials` | Normalized, deduplicated material list identified in this capture |
| `estimated_value_low/high` | Advisory scan estimates retained with provenance |
| `estimated_resident_dollars` | Server-derived advisory dollar estimate under a versioned rule; displayed per item |
| `estimated_wtwr` | Server-derived advisory WTWR estimate under a versioned rule; displayed per item |
| `analysis_confidence` | Normalized AI confidence when the analysis contract supplies it; nullable and never treated as verification |
| `review_state` | Separate workflow state such as `unreviewed`, `needs_review`, `resident_confirmed`, or `operator_reviewed`; transitions require an approved actor contract |
| `coaching_tip` | Advisory preparation guidance |
| `safety_warning` | Advisory safety warning |
| `analysis_provenance` | Model/schema/prompt version and timestamp; no secrets |
| `created_at`, `updated_at`, `removed_at` | Server audit/recovery timestamps; `created_at` does not replace `captured_at` |

Raw base64 must not be stored in Postgres or local storage. If persistent thumbnails/evidence are required, upload the JPEG to a private bucket under an ownership-scoped path and store only the path.

The accepted-item response and drawer must expose these fields together so the resident is always looking at the durable item representation:

```json
{
  "id": "item-uuid",
  "capturedAt": "2026-08-04T18:42:11.000Z",
  "imageReference": "private/collection-uuid/item-uuid.jpg",
  "summary": "Separated aluminum beverage cans",
  "materials": ["aluminum cans"],
  "estimatedWtwr": 600,
  "estimatedDollars": 6.00,
  "analysisConfidence": 0.86,
  "reviewState": "unreviewed"
}
```

The browser may exchange `imageReference` for a short-lived signed URL when rendering. It must never persist that signed URL, expose the storage bucket publicly, or infer `operator_reviewed` from confidence.

## Materials Found and Item Ledger Contract

The collection item ledger is the sole source for accepted-item contents and running collection totals before staging. Display panels must render from this ledger contract rather than maintain parallel descriptions, material arrays, or counters.

### Accepted-capture record

Every successful **Add Item to Collection** action creates or idempotently returns exactly one collection item for the accepted capture. Each item stores and returns:

- a stable server item ID;
- the capture timestamp in canonical UTC form;
- a private image reference, never raw base64 or a durable signed URL;
- one normalized AI summary;
- a normalized, deduplicated materials array;
- a server-derived estimated WTWR value;
- a server-derived estimated dollar value;
- AI confidence when supplied and a separate review state when workflow review is required.

Confidence is advisory evidence. It must not imply resident confirmation, operator review, custody verification, payout approval, or marketplace verification. The review state is an explicit workflow fact with separately authorized transitions.

### Materials Found presentation

- Materials are stored on and displayed for each individual item in the clickable bucket drawer.
- The drawer shows all accepted item rows and their material arrays; it may also show a deduplicated collection-wide material index derived from those rows.
- Item count equals the number of accepted ledger items, not the number of material strings.
- Estimated WTWR and dollar totals equal the deterministic sum of accepted, non-removed item values returned by the backend.
- Totals must never be parsed or recomputed from rendered text, chips, summary prose, or DOM contents.
- The current pending scan summary appears only in the current-item review. After acceptance, its summary appears only on its drawer item row. No second summary card or competing collection panel renders the same description.

### Action invariants

**Retake Current Photo** replaces only the pending, unaccepted capture and its transient analysis. It performs no ledger mutation and leaves every prior accepted item, material list, and total unchanged.

**Add Item to Collection** appends exactly one durable ledger item. A stable `client_item_id` makes double-clicks, timeouts, and response retries return the same item rather than append another.

**Scan Another Item** starts a fresh pending capture while retaining the complete accepted ledger. It does not reset the collection, totals, drawer contents, or staged-scan linkage.

**Remove Item** changes only the selected open-ledger item through an authorized durable mutation. It cannot remove a merely pending capture, and it returns a freshly computed ledger and totals.

**Stage Bounty** atomically persists and locks the complete accepted item ledger, recomputes its totals, creates or reuses exactly one canonical `scans` row, links that scan to the collection, and records the staging transition. Partial staging is forbidden: either the complete versioned ledger and scan linkage commit together, or the collection remains open and editable.

Once staged, add, edit, remove, retake-as-replacement, and reorder mutations must be rejected at the database/API boundary. UI-disabled controls are not sufficient enforcement.

### Required ledger tests

Playwright and backend/database coverage must jointly prove:

1. Accepting each of several captures appends its normalized materials to exactly one corresponding durable item row.
2. Reload fetches the same accepted item IDs, material arrays, image references, timestamps, summaries, estimates, confidence/review states, and ordering from the backend.
3. Collection WTWR and dollar totals exactly equal the sum of accepted, non-removed item ledger values using the server's deterministic rounding rule.
4. Double-clicking Add Item or retrying the same `client_item_id` creates one item and returns one stable item ID.
5. Retaking or discarding the pending item leaves all previously accepted item IDs, materials, and totals unchanged.
6. Removing one accepted item changes only that item's ledger state and recomputes totals without altering prior unrelated items.
7. Scan Another Item clears only pending-item state and preserves the accepted ledger through the next capture.
8. Concurrent or repeated Stage Bounty calls create one staged collection and one canonical scan.
9. After staging, UI, API, RPC, and direct Data API attempts to add, edit, remove, or reorder items are denied and leave the ledger unchanged.
10. The accepted scan summary appears in one drawer item location and is absent from competing summary panels.

## 5. Running totals

### Item count

Count durable child rows whose status is `accepted`. Do not count `items_seen.length`: one photo may identify several labels but is still one accepted collection item.

### Estimated dollars

Display the sum of each accepted item's server-returned `estimated_resident_dollars`. Before staging it must be labelled **Estimated**. At staging, the server recomputes from locked item rows and returns the staged aggregate stored on the canonical scan.

### Estimated WTWR

Display the sum of each accepted item's server-returned `estimated_wtwr`, also labelled **Estimated**. Do not recreate the current percentage/rate in browser code. The conversion and resident share rule must be versioned and computed at the backend boundary. WTWR is not issued merely because an item or collection was analyzed or staged.

### Consistency rule

Every successful add/edit/remove response returns the complete aggregate:

```json
{
  "collectionId": "uuid",
  "version": 4,
  "status": "open",
  "itemCount": 3,
  "estimatedResidentDollars": 24.00,
  "estimatedWtwr": 2400,
  "items": []
}
```

The browser replaces its displayed aggregate with this response; it does not increment totals optimistically. This prevents retry, rounding, and concurrent-tab drift.

## 6. Remove duplicate descriptions

The current page renders the same `summary` in both the collection panel and the standalone summary card. Converge to one owner:

- current unaccepted analysis description lives only in the current-item review;
- after Add Item succeeds, that review clears;
- accepted item descriptions live only in their drawer rows;
- the collapsed bucket shows totals/status, not the latest description;
- after staging, one collection-level staged summary may appear once, derived by the backend for the canonical scan;
- material chips, safety, and coaching remain attached to their item rather than duplicated globally unless an explicit aggregate presentation is defined.

## 7. Action semantics

| Action | Exact effect | Durable write |
|---|---|---|
| **Retake Current Photo** | Discards only the current unaccepted JPEG and analysis; preserves every accepted collection item and total | None |
| **Add Item to Collection** | Persists the reviewed analysis as one child item using `client_item_id`; replaces UI totals with server response | One idempotent item upsert/accept operation |
| **Scan Another Item** | Closes the drawer/current review and returns to a ready camera for a new item | None |
| **Stage Bounty** | Atomically freezes the open collection, computes totals, creates/links one canonical scan, and returns it | One idempotent transaction/RPC |
| **Request Pickup** | Begins evidence/location collection for the staged scan; it does not create another collection or scan | Existing pickup evidence/update path |

“Stage Bounty” means resident staging, not operator verification, custody acceptance, guaranteed value, payout, or WTWR issuance.

## 8. State that may remain local before staging

Only transient interaction state may be local:

- live camera stream and readiness;
- the current unaccepted JPEG/base64;
- the current in-flight `/api/scan` request;
- the current unaccepted normalized analysis;
- drawer open/closed state, focus return target, and pending UI indicators;
- a stable `client_item_id` retained only long enough to retry the same item save.

Once the resident selects Add Item, the item must be durable. An “accepted” item held only in an array or local storage would be lost on reload and would create a competing authority. Local storage must not own collection status, item acceptance, totals, staging, pickup, jobs, custody, or financial state.

## 9. State that must become durable at staging

The Stage Bounty transaction must durably establish:

- collection ownership and final item membership/version;
- staged/locked status and timestamp;
- server-recomputed item count and advisory totals;
- exactly one canonical `scans` row containing the downstream aggregate contract;
- a unique `collection -> staged_scan_id` link;
- aggregate summary and material labels derived from the locked items;
- resident/session association;
- accepted estimate/value fields under one versioned server rule;
- location/eligibility facts required at this boundary, or an explicit decision to collect them only during pickup evidence;
- an immutable staging idempotency key and transition/audit event.

The staged scan must initially retain `bounty_status = null`. Staging alone must not create a job. The existing pickup evidence transition to `open` remains the job-opening boundary.

## 10. Minimum backend contract

### Draft collection reads

- `GET /api/resident-collection` or an authenticated, RLS-safe equivalent returns the resident's one open collection and all accepted item rows.
- The response includes server totals, a monotonic `version`, and staged scan linkage when applicable.

### Accept/update/remove item

- `POST /api/resident-collection/items` accepts a normalized scan result plus `collectionId`, `clientItemId`, and expected collection version.
- Repeating the same `(collection_id, client_item_id)` returns the existing item and aggregate without adding twice.
- Edit/remove operations require ownership, `status = open`, and an expected version to prevent lost updates across tabs.
- The server validates AI-result shape and derives dollar/WTWR estimates; client-supplied totals are ignored.

### Stage collection

- `POST /api/resident-collection/stage` or a narrowly granted RPC accepts `collectionId`, `idempotencyKey`, and expected version.
- In one database transaction it locks the collection/items, validates ownership and non-empty state, recomputes totals, inserts or reuses exactly one `scans` row, links it uniquely, records the transition, and marks the collection staged.
- A retry returns the same collection and `scanId`.
- Concurrent staging requests cannot create two scans.

### Pickup

- The existing `pickup-photo.html?bounty=<scanId>` contract remains after staging.
- The durable null-to-`open` scan update remains the point at which Pickup Requested and one job become valid.

Direct Data API access is possible only if grants and RLS are deliberately designed and tested. A server endpoint or narrowly granted RPC is preferred for atomic staging and server-derived financial estimates.

## 11. Schema decision

### Can `scans` safely represent the open multi-item collection?

No, not under the verified current contract.

One `scans` row has aggregate arrays/text and lifecycle fields but no durable per-capture identity, item ordering, per-item provenance, edit/removal history, collection version, or item-level idempotency. Updating its aggregate arrays from multiple browser actions would create lost-update risks. Creating one scan per item would violate the required one-collection/one-job cardinality. JSON packing multiple captures into existing columns would hide relational constraints and is not proven safe by the schema audit.

### Required model

Use an additive parent/child draft model, with final names approved through an ADR:

```text
scan_collections (proposed)
  id
  resident_id / session ownership
  status: open | staging | staged | cancelled
  version
  staged_scan_id UNIQUE -> scans.id
  stage_idempotency_key UNIQUE
  server totals and pricing-rule version
  timestamps

scan_collection_items (proposed)
  id
  collection_id -> scan_collections.id
  client_item_id
  status
  normalized analysis/provenance/evidence fields
  per-item server estimates
  timestamps

UNIQUE (collection_id, client_item_id)
```

`scans` remains the first canonical lifecycle record. The new tables are an editable pre-staging workspace, not a replacement workflow.

## 12. Idempotency and reload recovery

- Enforce at most one open collection per authenticated resident with a partial unique index. If anonymous sessions remain supported, define a secure ownership/idempotency model before exposing durable drafts; the loose `wt_session` value alone is not authorization.
- Add Item uses `client_item_id`; retry returns the existing row.
- Edit/remove uses collection `version` or row revision and rejects stale writes with `409`/structured conflict.
- Stage uses a client-generated idempotency key plus unique `staged_scan_id` linkage and row locking.
- Stage retries return the same scan even if the first response was lost.
- Request Pickup remains protected by the scan's null-to-`open` transition plus the existing one-active-job uniqueness rule.
- On reload, query the durable open/staged collection. Never rebuild it from local storage.
- If reload occurs with an unaccepted current photo, that photo may be lost; explain this without affecting accepted items.
- If another tab stages the collection, a stale add/edit must fail and refresh into `STAGED_LOCKED`.

## 13. Smallest implementation phases

### Phase A — architecture and live contract

- Record an ADR defining the draft collection as pre-lifecycle state and `scans` as the sole staged lifecycle record.
- Re-query the live schema, grants, RLS, triggers, and migration ledger.
- Approve pricing/WTWR estimate ownership, anonymous-versus-authenticated behavior, image retention, and location timing.

Checkpoint: schema and authorization contract approved; no UI behavior changed.

### Phase B — additive schema and database tests

- Add collection/item tables, constraints, indexes, RLS, grants, and transition/audit support through forward migrations.
- Add an atomic stage RPC or transaction boundary.
- Do not change current `scans` triggers or pickup/job behavior.

Checkpoint: database tests prove ownership, editing, totals, one staged scan, retries, and one later job.

### Phase C — backend endpoints

- Add authenticated load/add/edit/remove/stage handlers or narrow RPC client service.
- Normalize validation, errors, CORS, auth, and idempotency.
- Keep `/api/scan` payload/response compatible; optionally version it only if provenance/estimate fields require a contract change.

Checkpoint: integration tests pass without production Supabase or images.

### Phase D — drawer and multi-capture UI

- Update only the canonical scanner surface and its browser tests.
- Remove duplicate summary rendering.
- Add clickable accessible drawer, current-item review, running returned totals, retake-current behavior, scan-another behavior, and durable reload.
- Remove the current immediate scan insert/lock from Add Item.

Checkpoint: unlimited sequential items are accepted into one open collection; staging still disabled behind the backend contract until Phase E.

### Phase E — Stage Bounty and pickup handoff

- Wire the idempotent stage contract.
- Lock only from its successful response.
- Expose Request Pickup only for the returned staged scan.
- Preserve pickup evidence and database-owned job creation.

Checkpoint: multiple items produce one scan, one pickup transition, and one active job.

Each phase is a separate reviewable commit and deployable checkpoint. Do not start UI multi-capture by expanding browser-only arrays before Phases A–C exist.

## 14. Test plan

### Playwright

- Bucket button is keyboard/click accessible and drawer focus behavior is correct.
- Empty collection loads with zero returned totals.
- One capture shows one current-item description in exactly one place.
- Every accepted drawer item displays its durable ID, capture time, image, single summary, normalized materials, estimated WTWR/dollars, confidence, and review state.
- Reload obtains those item fields from the backend; no signed image URL or item authority is reconstructed from local storage.
- Retake clears only the current item and preserves previously accepted drawer rows/totals.
- Add Item persists once under a stable idempotency key; double click/retry does not duplicate.
- Scan Another Item permits repeated captures without a hard item limit; exercise at least three sequential items.
- Drawer count counts accepted captures, not material labels.
- Returned dollar and WTWR totals replace local display after each mutation.
- Reload restores accepted items/totals from the mocked backend and does not repeat analysis or writes.
- Remove/edit updates returned totals only while open.
- Stage failure leaves collection editable and does not show locked.
- Stage double submission returns one scan ID and one locked state.
- After staging, all edit/add/remove controls are disabled or absent.
- Request Pickup is absent before staging, starts the existing evidence flow afterward, and only shows Pickup Requested after the durable open response.
- Reload after pickup does not duplicate the scan, pickup update, or job.
- Camera denial, zero dimensions, invalid JPEG, API/network failure, and analysis retry remain covered.
- Malicious descriptions render as text in current review and drawer.

### Database/RPC

- RLS allows a resident to read/mutate only their own open collection and items.
- Anonymous access is denied unless an explicit secure model is approved.
- Only one open collection exists per owner.
- Duplicate `client_item_id` returns/retains one item.
- Stale version writes fail without changing totals.
- Removed items are excluded from totals and staging.
- Server totals equal the sum of accepted item server estimates with deterministic rounding.
- Empty, foreign-owned, cancelled, or already-staged collections reject invalid staging transitions.
- Concurrent stage calls create exactly one `scans` row and return the same ID.
- The staged scan has `bounty_status = null` and creates no job.
- Opening pickup after evidence creates exactly one active job even under retry/concurrency.
- Grants and RLS denial cases are tested separately for `anon`, `authenticated`, other residents, and service roles.
- Security-definer code, if unavoidable, verifies `auth.uid()`, uses a safe `search_path`, and has EXECUTE revoked from `PUBLIC` with only required roles granted.

## 15. Rollback

### UI/API rollback

- Gate the new workflow behind a deploy-time feature flag during preview/staging rollout.
- Revert UI and endpoint commits independently in reverse order.
- The prior single-capture scanner can remain available during controlled rollout, but it must never interpret a draft collection as a staged scan.

### Schema rollback

- Prefer additive deactivation over destructive down migration: revoke endpoint/RPC access and stop creating new draft collections while retaining existing rows for recovery/audit.
- Do not drop collection/item tables while any open collection or staged linkage exists.
- Do not delete or mutate canonical `scans` rows created by staging.
- If the stage RPC is disabled, already staged scan IDs remain valid for the existing pickup and downstream lifecycle.
- A later cleanup migration may archive/drop unused draft structures only after an explicit data-retention review and verified zero dependencies.

### Recovery guarantees

- Rollback never reverses pickup state, jobs, custody, WTWR, payouts, or marketplace records.
- Open draft collections remain non-canonical and create no job while the feature is disabled.
- Staged collections remain linked to their one canonical scan and can continue through the established product spine.

## Acceptance criteria

- The bucket is clickable and exposes its durable item contents.
- A current scan description is rendered once.
- Accepted items survive reload and update server-returned estimated WTWR/dollar totals.
- Retake affects only the unaccepted current photo.
- The resident can add sequential items without a product-level count limit.
- The collection remains editable until Stage Bounty succeeds.
- One Stage Bounty operation creates exactly one canonical scan.
- Staging, not Add Item, locks the collection.
- Pickup begins only from the staged scan and creates at most one active job.
- No browser-only state claims durable acceptance, locking, pickup, custody, payout, or WTWR issuance.
