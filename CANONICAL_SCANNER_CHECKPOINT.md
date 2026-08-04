# Canonical Resident Scanner Checkpoint

Audit date: 2026-08-04  
Canonical surface: root `scanner.html` (provisional)  
Scope: `scanner.html` and only the runtime paths it directly invokes. No UI, API, database, migration, RPC, marketplace, or experimental-scanner implementation was changed.

## Executive conclusion

The root scanner is the only resident scanner already connected to both `/api/scan` and the durable `scans` record. Its pickup handoff reaches the canonical `scan -> job` boundary through `pickup-photo.html` and the live `trg_create_job_on_bounty_open` database trigger.

It is suitable as the provisional canonical surface, but it is not yet a repeatable checkpoint. The principal blockers are:

1. scan creation has no idempotency key or reload recovery;
2. browser state is entirely in memory except for the device session ID;
3. the page does not distinguish malformed API JSON from network failure;
4. camera-feature absence is not handled safely;
5. external error strings can reach an `innerHTML` logging sink;
6. the hard-coded Supabase project prevents a safe automated staging run without a configuration seam;
7. the claimed anonymous logging path conflicts with `.insert(...).select()` and the verified resident-only scan read policy.

AI output remains advisory at analysis time, but the browser currently copies the AI high estimate into `accepted_value` and uses it to decide pickup eligibility. That is existing behavior and a product-boundary concern; this audit does not change it.

## 1. Complete browser flow: camera capture through `/api/scan`

### Page initialization

1. The browser loads `scanner.html`.
2. It loads the PWA manifest, Apple touch icon, `/pwa.js`, Supabase JavaScript v2 from jsDelivr, and two Google Fonts families.
3. `/pwa.js` registers `/sw.js` after window load. The service worker bypasses `/api/*` and Supabase requests, so scan API calls and database calls are network-only.
4. Inline JavaScript constructs a Supabase client using a hard-coded project URL and browser-safe public/anonymous key.
5. The page reads `wt_session` from `localStorage`. If absent, it creates a UUID (or timestamp fallback) and stores it.
6. `loadCurrentResident()` calls `db.auth.getSession()`. If a session exists, it selects the resident ID whose `user_id` matches the session user. Errors are silently ignored.
7. On window load, `initCamera()` requests an environment-facing camera.

### Camera capture

1. `initCamera()` first calls `navigator.mediaDevices.getUserMedia()` with exact environment-facing mode.
2. If that fails, it retries with the default camera.
3. On capture-button click, the handler:
   - ignores the click if the video was already hidden;
   - sizes a hidden canvas from `video.videoWidth` and `video.videoHeight`;
   - draws the current video frame;
   - encodes it as JPEG at quality `0.85`;
   - displays the captured data URL in an `<img>`;
   - hides the video, disables capture, and shows the retake control;
   - removes the data-URL prefix and passes the base64 payload to `analyzePayload()`.

There is no explicit camera-readiness check. A capture before video metadata is ready can produce a zero-sized or unusable frame.

### API request

`analyzePayload()` sends:

```http
POST /api/scan
Content-Type: application/json
```

```json
{
  "imageBase64": "<JPEG base64>",
  "mediaType": "image/jpeg"
}
```

The Vercel handler in `api/scan.js`:

1. rejects non-POST requests with `405` JSON, but does not set an `Allow` header;
2. fails with `500` if `ANTHROPIC_API_KEY` is absent;
3. checks only that `imageBase64` is truthy;
4. sends the image to `https://api.anthropic.com/v1/messages` using model `claude-haiku-4-5-20251001` and Anthropic API version `2023-06-01`;
5. requests a JSON object containing summary, low/high estimates, one coaching tip, identified items, and an optional safety warning;
6. strips Markdown fences and parses the returned text;
7. returns parsed model output directly on success;
8. returns `{ "error": ... }` when the model response cannot be parsed or Anthropic reports an error.

The endpoint does not authenticate the resident, impose an explicit request/image-size limit, validate `mediaType`, schema-validate model output, or provide a correlation ID.

### Response rendering

The browser always attempts `resp.json()` and does not inspect `resp.ok`.

- If parsed JSON contains `error`, it logs that message and re-enables capture.
- Otherwise, `showResult()` saves the object in the in-memory `lastScan` variable.
- Safety warning, summary, coaching tip, and item labels are rendered with `textContent`.
- Each `items_seen` entry is put in a newly created `<span>`.
- The resident share is calculated in the browser as 40% of `estimated_value_high`; WTWR display is that dollar share multiplied by 100.
- The result and “Log This Haul” button become visible.

No schema validation occurs before rendering or persistence. For example, a non-array `items_seen` value causes a runtime exception at `.forEach()`.

## 2. Exact persistence path into `scans`

Persistence occurs only after the resident clicks `+ LOG THIS HAUL`.

1. The button is disabled immediately for the current document.
2. The browser requests a fresh geolocation fix with a 10-second timeout, high accuracy, and no cached position.
3. It calculates three client-side conditions:
   - `worthDispatch`: AI `estimated_value_high >= 25`;
   - `fixIsPrecise`: latitude/longitude exist and accuracy is at most 100 meters;
   - resident identity was resolved by the earlier asynchronous lookup.
4. `bountyCreated` is true only when all three conditions pass.
5. The browser directly calls `db.from('scans').insert(...).select()` with:

| Column | Browser source |
|---|---|
| `session_id` | persistent `wt_session` device identifier |
| `resident_id` | resident lookup, or null |
| `summary` | `/api/scan` response |
| `items_seen` | `/api/scan` response |
| `est_low`, `est_high` | `/api/scan` response |
| `coaching_tip` | `/api/scan` response |
| `safety_warning` | `/api/scan` response |
| `lat`, `lng`, `location_accuracy_m` | browser geolocation |
| `accepted` | literal `true` |
| `accepted_value` | AI `estimated_value_high` |
| `bounty_created` | client-computed boolean |
| `bounty_status` | null |

6. Supabase PostgREST applies live `scans` grants, constraints, and RLS.
7. Verified live policy permits public scan insertion only in restricted initial state; this payload uses null bounty status and no claim/completion fields.
8. For a pickup candidate, `.select()` returns the inserted scan ID and the browser redirects to `pickup-photo.html?bounty=<scan UUID>`.
9. Otherwise, the page displays a drop-point message and leaves the scan at null bounty status.

### Identity race

`loadCurrentResident()` is invoked but not awaited before camera use. A fast user can analyze and log before `currentResidentId` resolves. The resulting scan can be written without the resident link and can no longer qualify for pickup in this page flow.

### Anonymous `.select()` conflict

The code comment says a scan can be logged without a resident. Live state confirms public INSERT but only resident-owned/operator/driver SELECT paths. Because the call requests a returned representation with `.select()`, the anonymous path may be rejected by the SELECT policy even if the insert shape itself satisfies INSERT policy. This requires an executable permission test; it must not be assumed to work.

## 3. Exact pickup-opening path: scan to job

The pickup path continues in `pickup-photo.html`.

1. The scanner redirects with the newly inserted scan UUID in the `bounty` query parameter.
2. `pickup-photo.html` creates its own Supabase client using the same hard-coded project and public key.
3. Initialization requires an authenticated Supabase session.
4. It selects the scan by UUID. Live RLS limits this read to the owning resident (or another specifically authorized persona).
5. If `bounty_status` is already non-null, the page treats the pickup as already saved and does not repeat the transition.
6. The resident captures a pickup-location photo.
7. The page requires a fresh geolocation fix.
8. It optionally parses EXIF through `exifr` and calls `/api/verify-pickup` for a non-blocking AI fraud signal.
9. It uploads the JPEG to private bucket `pickup-photos` at `<scan UUID>/pickup.jpg` with `upsert: true`.
10. It conditionally updates `scans` where both conditions hold:

```text
id = <scan UUID>
bounty_status IS NULL
```

The update sets `bounty_status = 'open'`, pickup photo path, coordinates, timestamp, and fraud-signal fields, then requests the updated representation.

11. Verified live RLS requires authenticated resident ownership, pickup evidence, coordinates/timestamp, and `can_create_bounty(...)` approval.
12. The live `scans_bounty_transition_guard` permits null to `open`.
13. The live AFTER UPDATE trigger `trg_create_job_on_bounty_open` calls `create_job_on_bounty_open()`.
14. That function inserts a `PENDING` bounty job only if no active, non-cancelled job exists for the scan.
15. The partial unique index `jobs_scan_id_active_uniq` independently enforces at most one job per scan where status is not `CANCELLED`.
16. If the conditional update returns zero rows, the UI reports that the pickup was already saved or the bounty changed.

The repository does not contain the live `pickup-photos` bucket policy definition identified by this code path, and the live schema audit did not inventory storage policies. Bucket existence and the exact resident upload policy are therefore unresolved in this checkpoint.

## 4. External dependencies

### Browser/platform APIs

- `navigator.mediaDevices.getUserMedia`
- Canvas 2D context and JPEG data URLs/blobs
- `navigator.geolocation.getCurrentPosition`
- `crypto.randomUUID` with timestamp fallback
- `localStorage`
- `fetch`
- `FileReader`, `URL.createObjectURL`, and `URLSearchParams` on the pickup page
- Service Worker, Cache API, and PWA install events through `/pwa.js` and `/sw.js`

### Same-origin files and routes

- `/api/scan` -> `api/scan.js`
- `pickup-photo.html`
- `/api/verify-pickup` -> `api/verify-pickup.js`
- `/pwa.js`
- `/sw.js`
- `/manifest.json`
- `/icon-192.png`, plus icons referenced by the manifest
- `index.html` navigation target

### Third parties

- Supabase JavaScript v2 from `cdn.jsdelivr.net` using an unpinned major-version URL
- Supabase Auth, PostgREST, Storage, and Postgres at the hard-coded project host
- `exifr@7.1.3` from jsDelivr on the pickup page
- Google Fonts (`Share Tech Mono` and `Inter`)
- Anthropic Messages API
- Anthropic model `claude-haiku-4-5-20251001`

### Runtime configuration

- Browser-visible Supabase URL and public/anonymous key are embedded independently in both pages.
- Server-side `/api/scan` and `/api/verify-pickup` require `ANTHROPIC_API_KEY`.
- No service-role key is used by this path.

Supabase documentation/changelog review found no relevant current breaking change that alters the existing `supabase-js` insert/update semantics. The unpinned CDN major remains a supply-chain and repeatability risk.

## 5. Error and reload behavior

| Scenario | Current behavior | Gap / consequence |
|---|---|---|
| Camera denied | Exact rear-camera request fails, then default camera is requested; final denial is printed | Capture remains enabled; no file-upload fallback or recovery control |
| Missing camera/API | Accessing `navigator.mediaDevices.getUserMedia` throws; catch then dereferences `navigator.mediaDevices` again | Can produce an uncaught error; no supported no-camera path |
| Invalid API JSON | `resp.json()` throws and the generic catch prints “CONNECTION ERROR” | Misclassified as connectivity; response status/body unavailable for diagnosis |
| API failure with JSON | HTTP status is ignored; `{error}` is displayed and capture is re-enabled | Works for current envelope, but cannot distinguish 4xx/5xx or retryability |
| API failure without JSON | Falls into generic connection error | Diagnostic context lost |
| Network failure | Generic connection error; capture re-enabled | Captured image remains visible and retake is available; no retry-current-image button, timeout, or offline detection |
| Supabase resident lookup failure | Silently treated as no resident | Signed-in user may unknowingly create an unowned/drop-point scan |
| Supabase scan insert failure | Button is restored and generic “Could not log” shown; raw database error is appended to console | Retry is possible, but no correlation or durable idempotency key exists |
| Supabase pickup upload failure | Button restored; message and alert shown | Retry upserts the same object path, which is desirable if policy allows it |
| Supabase pickup update failure | Button restored; uploaded object remains; retry reuses the path | Orphaned/replaced object is possible until retry succeeds |
| Reload during API analysis | Browser aborts the request; `lastScan` and captured image disappear | No duplicate write, but all pending work is lost |
| Reload after analysis, before logging | `lastScan` disappears | User must rescan; a prior result is not recoverable |
| Reload while scan insert is in flight | Commit outcome may be unknown to the browser | User can rescan and create a second scan because there is no idempotency key |
| Reload on pickup page before opening | Query parameter retains scan identity; page re-reads its current state | Safe if the URL is retained and auth is available |
| Reload after pickup opens | Page reads non-null bounty state and shows success | Does not repeat the update or create another job |

## 6. XSS and unsafe-rendering risks

### Verified unsafe sink

Both scanner and pickup pages implement logging with:

```js
consoleLog.innerHTML += `<br>&gt; ${msg}`;
```

Most messages are constants, but some include external strings:

- `/api/scan` `data.error`;
- Supabase scan insertion `error.message`;
- Supabase Storage/update error messages in the pickup path;
- interpolated runtime values.

If any external error string contains HTML, it is interpreted as markup. This is a DOM-XSS sink. Logging should append text nodes or DOM elements and never concatenate external text into `innerHTML`.

### Safer result rendering

The primary AI result fields use `textContent`, and material items are assigned through `span.textContent`. Clearing `itemsBlock` with `innerHTML = ''` is safe because no external content is inserted in that operation.

### Other untrusted-input concerns

- AI output is not schema validated before arithmetic, rendering, or database insertion.
- `items_seen` is assumed to be an array.
- Numeric estimates are not bounded or checked for finite/non-negative values.
- The API accepts arbitrary claimed media types and unbounded base64 input.
- Displayed WTWR is a browser calculation, not a durable credited balance; wording says “You earned” before completion triggers issue any credit.

## 7. Duplicate scan and job risks

### Scan duplication: exposed

There is no scan-level idempotency key or relevant uniqueness constraint documented live.

- The log button blocks double clicks only within the current document.
- A reload, tab duplication, lost response, or manual retry can create another scan for the same capture.
- `wt_session` groups scans but is not unique and does not deduplicate them.
- The captured photo is not persisted with the initial scan, so no evidence hash can identify a repeated capture.
- If insertion commits but redirect/response is lost, the browser has no durable scan ID recovery mechanism.

### Job duplication: protected

The pickup-opening update and live database defenses are layered:

1. the browser update requires `bounty_status IS NULL`;
2. the transition guard permits only the valid null-to-open transition;
3. `create_job_on_bounty_open()` checks for an existing non-cancelled job;
4. `jobs_scan_id_active_uniq` protects concurrent creation.

Therefore one scan should create at most one active job through this path. A repeated pickup submission may re-upload the same object, but it cannot normally repeat the state transition.

## 8. Smallest testable checkpoint

The checkpoint should prove one deterministic, authenticated, high-value resident scan on an isolated Supabase branch or staging project. It should not use production data or mock the database layer if the goal is to prove job creation.

### Required preconditions

- A non-production Supabase project/branch whose catalog matches the verified lifecycle objects.
- A marked test resident Auth user linked to one resident row.
- Browser-safe staging Supabase URL/key supplied through a centralized configuration seam.
- `/api/scan` intercepted in the browser test with a schema-valid deterministic fixture so Anthropic cost and model variability are excluded.
- `/api/verify-pickup` intercepted with a deterministic valid response.
- Camera and geolocation supplied through browser test fixtures.
- Cleanup performed only in the isolated environment, or fixtures use unique IDs and are retained as marked test evidence.

### Assertions

1. **One capture reaches `/api/scan`:** click capture once; assert exactly one POST, correct content type, `mediaType = image/jpeg`, and non-empty base64.
2. **One response renders:** fulfill with a known payload; assert summary, item tags, safety/tip visibility, and calculated resident-share display.
3. **One scan persists:** click Log once; wait for redirect; query staging as an authorized test observer and assert exactly one matching scan with the expected resident, session, AI fields, accepted value, coordinates, null bounty status, and pickup-candidate flag.
4. **One pickup opening creates one active job:** capture and submit pickup evidence; wait for success; assert scan status is `open`, evidence fields are present, and exactly one `jobs` row exists for the scan with status other than `CANCELLED` and initial status `PENDING`.
5. **Reload does not duplicate:** reload `pickup-photo.html?bounty=<id>` after success; assert success state, one scan, and one active job. Also repeat the submit interaction only where the UI permits and reassert counts.

### Known limitation

This checkpoint proves reload safety after a scan ID exists and during/after pickup opening. The current scanner cannot prove recoverable reload during analysis or an uncertain scan insert. That requires adding a durable client idempotency identifier and server/database enforcement, which is beyond a strictly UI-only checkpoint and would require a separately approved lifecycle change.

## 9. Proposed automated browser smoke test

Use Playwright with one serial test against a non-production deployment:

```text
setup
  create/identify marked authenticated resident fixture
  install Supabase auth session in browser context
  mock camera stream and canvas JPEG output
  grant and mock precise geolocation
  intercept POST /api/scan -> deterministic valid scan JSON
  intercept POST /api/verify-pickup -> deterministic staged-material JSON

test
  open /scanner.html
  capture once
  assert one /api/scan request
  assert result content
  click Log This Haul
  capture inserted scan UUID from redirect
  query staging and assert one scan
  capture pickup photo and submit
  assert pickup success
  query staging and assert one active job for scan
  reload pickup URL
  assert already-saved success state
  query again and assert one scan + one active job

teardown
  remove only uniquely marked fixture data if the isolated environment permits it,
  otherwise retain it with the run ID for audit evidence
```

The test should fail on unexpected browser console errors, page errors, duplicate `/api/scan` calls, duplicate scan records, or duplicate active jobs. Database assertions should use a server-side test credential available only to the test runner, never injected into the browser.

Additional negative cases should be separate tests: camera denial, missing `mediaDevices`, invalid API JSON, HTTP JSON error, network abort, failed scan insert, and failed pickup update.

## 10. Files required for the checkpoint

No implementation files were changed by this audit. The smallest credible checkpoint would require changes or additions in these areas:

| File | Why it would change |
|---|---|
| `scanner.html` | Add a staging-safe public configuration seam, stable test selectors, explicit camera/API/Supabase error states, schema normalization, safe logging, and pending/reload state handling without changing lifecycle ownership |
| `pickup-photo.html` | Use the same centralized public configuration, safe logging, stable selectors, and deterministic reload/status behavior |
| `api/scan.js` | Add response-schema validation, method `Allow` header, payload/media limits, stable error envelope, and correlation ID if API hardening is approved as part of the checkpoint |
| `api/verify-pickup.js` | Only if the pickup test is to exercise the real endpoint rather than intercept it; otherwise no change is required |
| a new browser-safe configuration file | Centralize the Supabase public URL/key and distinguish staging from production without exposing secrets |
| a new Playwright configuration file | Define the non-production base URL, browser fixtures, timeouts, and test project |
| a new canonical scanner smoke-test file | Implement the five required assertions and negative error cases |
| `package.json` and lockfile | Add pinned browser-test tooling and repeatable scripts if Playwright is not already managed outside this repository |
| a short smoke-test runbook | Document required environment-variable names, fixture identity, safe target verification, execution, and cleanup |

SQL, migrations, RPCs, marketplace files, `resident/scanner.*`, `resident/app/`, and `app/modules/scanner.js` are not required for the UI/API checkpoint described here.

If reload-safe scan insertion must be guaranteed rather than merely observed, the file list necessarily expands to an approved database/API idempotency change. That should be a separate checkpoint because current `scans` structure has no verified uniqueness key suitable for capture retries.

## Evidence classification

### Verified from repository and live audit

- Root scanner calls `/api/scan` and directly inserts `scans`.
- Pickup page uploads evidence and conditionally changes the scan from null to `open`.
- Live scan-to-job trigger, function check, and partial unique active-job index.
- Live scan RLS summary and dual scan/job state ownership.
- Service worker bypass of API and Supabase traffic.

### Strong inference requiring execution

- Anonymous `.insert(...).select()` fails or behaves differently because scan SELECT is resident-scoped.
- Exact behavior when navigation/reload races a committed scan insertion.
- Browser behavior when capture occurs before video metadata is ready.

### Unresolved

- Live `pickup-photos` bucket policies and grants.
- Whether the hard-coded browser Supabase project is production, preview, or another environment.
- Whether deployment currently supplies all required API environment variables.
- Whether existing production data already contains duplicate scans caused by retry/reload.
