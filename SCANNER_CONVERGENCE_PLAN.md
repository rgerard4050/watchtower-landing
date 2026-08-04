# Resident Scanner Convergence Plan

Status: proposed; not implemented  
Prepared: 2026-08-04  
Canonical route: root `/scanner.html`

## Executive decision

Keep root `scanner.html` as the only canonical resident scanner and bring the useful bucket presentation into that page. Do not revive, import, link, or execute the quarantined prototype.

For the first convergence, a **bucket is the resident-facing name for one existing canonical haul/scan record**. One camera analysis may identify multiple materials through the existing `items_seen` array, but the bucket still persists as exactly one `scans` row and can open exactly one pickup/job path.

This mapping is deliberately narrow:

```text
resident-facing bucket
  = one captured haul
  = one /api/scan analysis
  = one scans row after Add to Bucket
  = at most one active pickup job after pickup evidence
```

The repository has no verified durable bucket or scan-item aggregate record. A multi-capture bucket assembled only in JavaScript would become an undocumented competing source of truth for material, value, custody, and reward. True multi-capture buckets require a separate architecture/schema decision and are not part of the initial convergence.

## 1. Bucket-scanner features worth preserving

Preserve the product ideas, not the prototype implementation.

### Visual hierarchy

- Compact Watchtower scanner header and focused mobile container.
- Prominent camera/viewfinder area with clear alignment guidance.
- A concise status/console region that tells the resident what the scanner is doing.
- High-contrast primary action and visually distinct recovery/secondary actions.
- Mobile-first full-height presentation.

### Bucket mental model

- “Bucket” as a plain-language container for the current haul.
- A visible current-bucket summary: estimated value/share, material count, and identified materials.
- A material inventory sheet/panel that lets the resident review what was identified.
- An explicit “Add to Bucket” action rather than silently persisting AI output.
- A locked/read-only completion state after durable persistence succeeds.
- A clear “Start New Bucket” path after the current bucket is complete or does not qualify for pickup.

### Interaction feedback

- Explicit states for ready, scanning/analyzing, identified, saving, and locked.
- Disabled controls while an irreversible or duplicate-prone action is in flight.
- Clear visual confirmation after persistence rather than only a console line.
- A review moment before pickup handoff.

### Language worth adapting

- “Materials found” for the `items_seen` inventory.
- “Bucket locked” for a successfully persisted, immutable-in-this-page scan—not for a local Boolean.
- “New collection” for resetting transient UI after the previous durable scan is safely complete.

## 2. Prototype behavior that must not be copied

### Fake lifecycle and persistence

- `api.createVerifiedBounty()` only logs to the console and must not be imported.
- `activeBucketId` is a browser UUID with no canonical database meaning.
- `bucketLocked`, `collections`, `inventory`, `xpLedger`, and related objects are local-only lifecycle representations.
- `wtwr_buckets` in `localStorage` is not durable material, custody, job, or financial evidence.
- `setTimeout()` scanning and proof verification are simulations, not API or evidence boundaries.

### Invented financial/reward state

- Fixed `$5` increments, `impact += 1.5`, XP rewards, and verification bonuses are fabricated.
- `totalXp`, `pendingReward`, and the XP ledger have no verified Supabase owner.
- The “WTWR” stat must not imply an issued balance. At most it may display the existing advisory estimate, clearly labeled as estimated.
- “Verified bounty” must not be claimed before durable pickup evidence and the canonical database transition.

### Fake proof controls

- `ORGANIZED`, `BUCKET`, and `SCALE` toggles merely flip local Booleans after a timer.
- They must not be copied as verification claims.
- If the concepts remain visually useful, they may appear only as optional preparation guidance until a real evidence contract exists.

### Broken implementation details

- Malformed heading markup and duplicate `</h3>` fragments.
- Missing `ai-overlay` element.
- Empty `updateUI()` implementation.
- Unwired finalize, reset, sheet, agreement, cancel, and camera controls.
- Broken alternate initializer (`ScannerApp.ithis...; nit();`).
- Immediate `startNewBucket()` after setting `bucketLocked`, which erases the lock state.
- Mock camera overlay instead of `getUserMedia`.
- Bottom-sheet class mismatch between HTML and CSS.
- Unbounded global mutable state and `window.app` compatibility bridge.

No code, CSS, DOM structure, state object, local-storage key, or script import should be copied wholesale from quarantine.

## 3. Working canonical behavior that must remain

### Entry point and deployment

- Root `/scanner.html` remains linked from `resident.html` and the PWA shortcut.
- Existing `/pwa.js` and service-worker behavior remains; API and Supabase traffic must stay network-only.
- Do not introduce a second scanner route or make the quarantine tree deployable.

### Camera and capture contract

- Real `navigator.mediaDevices.getUserMedia` with environment-facing preference and default-camera fallback.
- Real video frame drawn to canvas and encoded as JPEG.
- Captured-image preview and retake behavior.
- The camera-readiness defect must be fixed: no capture or request is allowed while video dimensions are zero, and empty base64 must be rejected before fetch.

### Analysis API

- Exactly one `POST /api/scan` per accepted capture.
- Existing JSON fields `imageBase64` and `mediaType: image/jpeg`.
- Existing advisory result fields: `summary`, `estimated_value_low`, `estimated_value_high`, `coaching_tip`, `items_seen`, and `safety_warning`.
- AI remains advisory and must not independently claim verification, custody, payout, or guaranteed value.

### Safe result rendering

- External result fields rendered with `textContent` or created text nodes.
- Material entries created as individual elements.
- Safety warning and coaching guidance remain visible when present.
- The unsafe `innerHTML` console concatenation should be replaced as part of convergence; external errors must never be interpreted as markup.

### Supabase and lifecycle behavior

- Supabase Auth session lookup and resident association.
- Fresh geolocation for the current haul.
- One insert into `scans` only after explicit resident action.
- Existing scan columns and initial null `bounty_status` contract.
- Existing pickup eligibility conditions unless separately approved.
- Redirect to `pickup-photo.html?bounty=<persisted scan id>` for eligible pickup.
- Pickup evidence upload and conditional null-to-`open` update remain owned by `pickup-photo.html`.
- Database trigger/RPC ownership of job creation remains unchanged.
- Existing duplicate-active-job defenses remain authoritative.

### Failure behavior

- Camera denial, API error, network failure, Supabase error, and retry remain recoverable.
- Controls stay locked during analysis and persistence.
- A failed insert never presents a locked bucket or successful pickup.
- Reload after pickup opening remains read-from-Supabase behavior, not reconstruction from local flags.

## 4. Exact UI state model

Use one explicit finite state value rather than independent, contradictory Booleans. Suggested names are illustrative but the transitions are normative.

```text
INITIALIZING
  -> CAMERA_READY
  -> ERROR_CAMERA

CAMERA_READY
  -> CAPTURED

CAPTURED
  -> ANALYZING
  -> CAMERA_READY (retake)

ANALYZING
  -> RESULT
  -> ERROR_ANALYSIS

RESULT
  -> ADDING_TO_BUCKET
  -> CAMERA_READY (retake/discard)

ADDING_TO_BUCKET
  -> BUCKET_LOCKED
  -> ERROR_PERSISTENCE

BUCKET_LOCKED
  -> pickup-photo handoff when eligible
  -> CAMERA_READY for a new bucket when pickup is not eligible

pickup-photo handoff
  -> PICKUP_REQUESTED after verified durable open transition
  -> ERROR_PICKUP with retry
```

### Camera ready

- Live video visible; captured preview and result/bucket panels hidden.
- Primary button reads “Scan Bucket” or equivalent.
- Capture remains disabled until `loadedmetadata`/usable dimensions prove `videoWidth > 0` and `videoHeight > 0`.
- Status text says camera is ready; no value/material/WTWR claim is shown.
- Prior transient capture/result state has been cleared.

### Captured

- Frozen captured JPEG preview visible.
- Video hidden but stream may remain available for retake.
- Base64 is non-empty and locally validated before analysis.
- Primary scan action disabled; Retake is available only until analysis begins or according to one consistent policy.
- No bucket value or durable identity exists yet.

### Analyzing

- Captured image remains visible.
- Status says “Analyzing materials…” without implying persistence.
- Capture, Add to Bucket, and pickup actions are disabled.
- Exactly one API request is in flight.
- Retake/retry behavior must not create concurrent analysis requests.

### Result

- API response has been normalized and schema-checked before rendering.
- Summary, material chips, safety warning, coaching tip, and advisory value/share are visible.
- Bucket stats derive only from this normalized result:
  - material count = normalized `items_seen.length`;
  - value = clearly labeled estimate, not guaranteed price;
  - WTWR = clearly labeled estimate, not issued wallet balance.
- “View Materials Found” opens an accessible review panel using the same normalized array.
- Primary action reads “Add to Bucket.”
- No scan row exists yet and the UI must not say locked, verified, earned, or pickup requested.

### Add to bucket

- This is the existing explicit persistence action, renamed and visually integrated.
- State first becomes `ADDING_TO_BUCKET`.
- Button is disabled and shows location/save progress.
- A fresh location fix is acquired.
- Exactly one existing-shape `scans` insert is attempted.
- No local-only bucket ledger, XP award, or fake bounty call occurs.
- On failure, transition to persistence error while retaining the captured result for retry.

### Bucket locked

- Enter only after Supabase returns a successful inserted scan representation and ID.
- The durable `scans.id` is the bucket/haul identity; do not display or store a separate authoritative browser UUID.
- Analysis, value, materials, location outcome, and pickup eligibility are read-only in this page state.
- The Add button remains disabled and cannot issue another insert.
- Display “Bucket locked” as confirmation that this page persisted the haul—not that material is operator-verified or paid.
- If eligible, the next action/handoff is “Continue to Pickup Request.”
- If ineligible, explain the drop-off path and offer “Start New Bucket.”

### Pickup requested

- This state belongs to `pickup-photo.html`, not an optimistic flag in `scanner.html`.
- It appears only after:
  - pickup photo upload succeeds;
  - the conditional scan update succeeds;
  - the returned scan has `bounty_status = open`.
- The page may say pickup requested and link back to resident status.
- Job existence/state remains a database fact. If the UI displays job state, it must query an authorized canonical view/table rather than infer it from a local timer.
- Reload re-reads the scan and shows the already-requested state without repeating submission.

### Error recovery

Use explicit recoverable variants:

| Error | Preserved state | Recovery |
|---|---|---|
| Camera denied/missing | no capture | explain permission/file-fallback status; retry camera where supported |
| Camera not ready/zero dimensions | live camera | keep capture disabled; wait for readiness; never call API |
| Invalid/empty JPEG | camera/capture | show capture error; retake; never call API |
| API JSON/HTTP error | captured preview | retry same image once at user request or retake; no duplicate concurrent request |
| Network failure | captured preview | retry analysis or retake; no scan exists |
| Invalid AI schema | captured preview | explain analysis failed; do not render/persist partial result |
| Resident lookup unresolved | result | wait/resolve identity before deciding pickup eligibility; do not silently downgrade a signed-in resident |
| Geolocation denied/imprecise | result | permit durable scan/drop-off path; clearly state pickup is unavailable |
| Supabase insert failure | result + location outcome | re-enable Add to Bucket; do not show locked; retry risks remain until idempotency is separately solved |
| Pickup upload/update failure | persisted scan + pickup page | retry existing object/update path; do not create another scan |

All error text must use safe text rendering. State transition failures should be visible and actionable, not only logged.

## 5. Browser memory versus Supabase ownership

### Browser memory only

- Current UI state enum.
- Camera stream and readiness.
- Current captured data URL/base64 until analysis/persistence/handoff.
- Current normalized API response before persistence.
- Whether an analysis or insert request is locally in flight.
- Modal/sheet visibility and focus return target.
- Temporary geolocation result used for the pending insert.
- Non-authoritative display calculations and formatting.

These values may disappear on reload. They must never be treated as proof of a completed transition.

### Browser storage

Retain only the existing loose `wt_session` device/session identifier for compatibility. It is neither a bucket ID nor an idempotency key.

Do not add:

- local bucket-completion counters;
- XP/WTWR ledgers;
- locked/verified/pickup flags;
- authoritative scan/job state;
- material custody state.

### Supabase-owned durable state

- Resident identity relationship.
- The persisted scan/haul and its canonical UUID.
- Advisory scan fields retained on `scans`.
- Accepted value and pickup-candidate fields under the current contract.
- Location/evidence fields.
- `scans.bounty_status` and canonical job state.
- Pickup evidence path.
- Jobs, events, intake, passport, marketplace, wallet, payout, and ledger records.

The UI can display these facts only after a successful write/read response or authorized reload query.

### Explicitly deferred

A durable bucket containing multiple separately captured scans is unresolved. Before implementing it, verify or approve:

- whether one bucket maps to one job or multiple jobs;
- how captures/items relate to `scans`;
- which record owns aggregate value and evidence;
- idempotent finalization and retry semantics;
- RLS/RPC permissions;
- downstream intake/passport implications.

Do not emulate that model in local state while the contract is undefined.

## 6. Required API and persistence contracts

### Analysis request

```http
POST /api/scan
Content-Type: application/json
```

```json
{
  "imageBase64": "<non-empty raw JPEG base64>",
  "mediaType": "image/jpeg"
}
```

Preconditions:

- non-zero video and canvas dimensions;
- valid JPEG data URL prefix;
- non-empty decoded bytes;
- one in-flight request maximum.

### Analysis response

Normalize before UI use:

```json
{
  "summary": "string",
  "estimated_value_low": 0,
  "estimated_value_high": 0,
  "coaching_tip": "string",
  "items_seen": ["string"],
  "safety_warning": "string"
}
```

Require finite non-negative estimates, an array of safe strings, and bounded text. An invalid result returns to analysis recovery and is never persisted.

No API change is required merely to adopt bucket UX. API authentication, payload limits, correlation IDs, and server-side schema validation remain important Phase 1 hardening work but should be separately scoped if they exceed the UI convergence checkpoint.

### Scan persistence

“Add to Bucket” preserves the current `scans` insert contract:

```text
session_id
resident_id
summary
items_seen
est_low
est_high
coaching_tip
safety_warning
lat
lng
location_accuracy_m
accepted = true
accepted_value
bounty_created
bounty_status = null
```

The UI enters `BUCKET_LOCKED` only after `.insert(...).select()` returns a row with an ID. Existing anonymous `.select()`/RLS uncertainty must be tested; convergence must not mask it with a local success state.

### Pickup persistence

Continue using:

```text
pickup-photo.html?bounty=<scan UUID>
```

The pickup page retains its evidence upload and conditional update:

```text
scan id = UUID
bounty_status IS NULL
-> bounty_status = open + evidence/location fields
```

The database remains responsible for creating at most one active job. The scanner must not insert `jobs`, set job state, grant WTWR, or create payouts.

## 7. Exact implementation files

### Phase 0–2 required modifications

```text
scanner.html
tests/canonical-scanner.spec.js
```

`scanner.html` receives the bucket visual/state convergence while retaining its real camera, API, Supabase insert, and pickup handoff. The existing browser test receives readiness, state, rendering, persistence, and retry assertions.

### Phase 3 only if pickup terminology/state needs alignment

```text
pickup-photo.html
tests/canonical-scanner.spec.js
```

Only presentation/test selectors should change there. Storage paths, conditional scan update, and job-trigger behavior remain untouched.

### Documentation after implementation

```text
CANONICAL_SCANNER_CHECKPOINT.md
```

Update its state-flow description only after the implementation and verification are complete.

### Explicitly unchanged

```text
quarantine/scanner-surfaces/resident-scanner-prototype/scanner.html
quarantine/scanner-surfaces/resident-scanner-prototype/scanner.css
quarantine/scanner-surfaces/resident-scanner-prototype/scanner.js
api/scan.js unless separately approved API hardening is added
SQL, migrations, RPCs, jobs, marketplace, wallet, and payout files
resident/app/
app/modules/scanner.js
```

Do not link to, import from, or remove the quarantined prototype.

## 8. Required test updates

Extend the existing Playwright checkpoint rather than creating a second scanner suite.

### Camera and capture

- Capture is disabled before video readiness.
- Zero dimensions produce no API request and an actionable status.
- A ready frame produces a non-empty JPEG payload.
- Exactly one click produces exactly one `/api/scan` request.
- Retake resets only transient capture/analysis state.

The current fixture must stop masking readiness by making dimensions permanently non-zero without a readiness transition. Tests should explicitly control readiness.

### UI state machine

Assert each visible state and allowed action:

```text
CAMERA_READY
CAPTURED
ANALYZING
RESULT
ADDING_TO_BUCKET
BUCKET_LOCKED
PICKUP_REQUESTED
ERROR_RECOVERY
```

Assert impossible actions are disabled—for example, Add to Bucket during analysis and a second insert after lock.

### Response and inventory

- Valid result renders summary, safety, coaching, estimates, material count, and inventory sheet.
- External strings render as text, not HTML.
- Invalid JSON, non-OK JSON, network failure, and invalid response schema recover without persistence.
- WTWR/value language is explicitly estimated before issuance.

### Persistence

- Add to Bucket produces exactly one `scans` insert.
- Insert payload retains the established column contract.
- Insert success with ID produces Bucket Locked.
- Insert failure retains result and permits retry without claiming success.
- Pickup-eligible success hands off the one inserted scan ID.
- Noneligible success shows the drop-off/new-bucket path.
- Add cannot be submitted twice in the same document.

### Pickup and reload

- Pickup evidence submission conditionally opens the persisted scan.
- Exactly one active job exists for the scan.
- Pickup success displays Pickup Requested.
- Reload reads durable state and does not repeat the scan insert, pickup update, or job creation.

### Negative assertion against prototype behavior

Tests should fail if canonical code introduces:

- `wtwr_buckets`;
- fixed XP or `$5` increments;
- `createVerifiedBounty`;
- mock proof timers;
- local `bucketLocked` as the source of durable truth;
- imports or links into `quarantine/`.

## 9. Smallest implementation phases

### Phase 0 — stabilize the existing capture boundary

Files: `scanner.html`, `tests/canonical-scanner.spec.js`.

- Add explicit camera readiness.
- Prevent zero-dimension/empty-JPEG submission.
- Add the regression test for the observed “No image received” failure.
- Replace unsafe console HTML concatenation with text-node rendering.

Checkpoint: a real ready capture sends one non-empty JPEG and renders one response; all existing scanner tests pass.

### Phase 1 — introduce the state machine and bucket presentation

Files: `scanner.html`, `tests/canonical-scanner.spec.js`.

- Adopt the useful bucket layout, stats, inventory review, and status language.
- Keep one canonical state value and one render function.
- Rename the persistence action to Add to Bucket.
- Label value/WTWR as estimates.
- Do not change API or Supabase request shapes.

Checkpoint: all UI states are deterministic, accessible, and backed by the existing contracts.

### Phase 2 — durable lock and new-bucket behavior

Files: `scanner.html`, `tests/canonical-scanner.spec.js`.

- Show Bucket Locked only after successful insert and returned scan ID.
- Preserve the result on failed insert for retry.
- Make double submission impossible within the document.
- Add noneligible Start New Bucket flow.
- Preserve eligible pickup handoff.

Checkpoint: one bucket creates exactly one scan, and local reset never erases or fabricates durable state.

### Phase 3 — pickup-state language alignment

Files only if needed: `pickup-photo.html`, `tests/canonical-scanner.spec.js`.

- Align confirmation language with Bucket Locked → Pickup Requested.
- Keep upload/update/job behavior unchanged.
- Verify reload from Supabase.

Checkpoint: one persisted bucket opens at most one active job and reload remains idempotent.

### Deferred phase — true multi-capture buckets

Do not begin until an approved lifecycle contract defines durable ownership and idempotency. This phase will likely require schema/RPC/API work and is intentionally not estimated or smuggled into the UI convergence.

Each implementation phase should be a separate reviewable commit and must pass the full scanner checkpoint before the next begins.

## 10. Rollback

### Before commit

Restore only the files changed in the active phase using a reviewed reverse patch. Do not reset the dirty worktree or touch quarantined files.

### After a phase commit

Create a normal revert commit for that phase. Because phases preserve the existing API/database contracts, rolling back presentation/state changes does not require data migration or cleanup.

Rollback order is newest phase first:

1. revert pickup-language alignment;
2. revert durable bucket-lock presentation;
3. revert bucket layout/state machine;
4. revert capture stabilization only if it causes a confirmed regression—the zero-dimension guard should otherwise remain.

### Data handling during rollback

- Never delete scans or jobs created while the bucket UI was active.
- Existing records use the same canonical schema and remain valid.
- Do not reverse triggers, RLS, RPCs, wallet, payout, or marketplace behavior.
- A scan ID already handed to `pickup-photo.html` remains a valid durable URL after UI rollback.

## Acceptance criteria

- Root `scanner.html` remains the sole canonical scanner and deployment entry.
- No quarantine code or local lifecycle state enters production.
- Bucket terminology maps to one canonical persisted scan.
- Camera readiness prevents empty-image requests.
- AI output remains advisory and schema-normalized before use.
- Add to Bucket creates exactly one scan.
- Bucket Locked is shown only after durable success.
- Pickup Requested is shown only after the durable pickup transition.
- One scan creates at most one active job.
- Reload and error recovery do not fabricate or duplicate state.
- Full scanner and repository tests pass after every phase.
