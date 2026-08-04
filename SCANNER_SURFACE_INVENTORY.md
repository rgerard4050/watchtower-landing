# Watchtower Scanner Surface Inventory

Audit date: 2026-08-04  
Scope: repository inspection only  
Canonical decision: root `scanner.html` is the provisional canonical resident scanner

## Classification rules

- **Canonical:** approved primary surface for the resident scan path.
- **Active experiment:** internally reachable prototype that is not approved as canonical.
- **Legacy but still referenced:** superseded implementation with a live incoming runtime reference.
- **Dead/unreferenced:** no incoming product navigation, import, or script reference; direct URL access may still be possible.
- **Broken:** contains a confirmed runtime, markup, or functional defect that prevents or materially misrepresents its intended behavior.
- **Duplicate:** overlaps a canonical or experimental scanner implementation without owning a distinct approved responsibility.

A surface may receive more than one classification. “Dead/unreferenced” describes repository reachability, not physical absence from a static deployment.

## Summary matrix

| Surface | Primary classification | Additional classifications | Deploy relevance |
|---|---|---|---|
| `scanner.html` | **canonical** | none; known defects documented separately | Tracked root page; directly deployed by Vercel |
| `resident/scanner.html` | **dead/unreferenced** | **broken**, **duplicate** | Tracked static page; direct URL may still expose it |
| `resident/scanner.css` | **dead/unreferenced** outside its page | **duplicate** support asset | Tracked; loaded only by `resident/scanner.html` |
| `resident/scanner.js` | **broken** | **dead/unreferenced**, **duplicate** | Tracked; loaded only by `resident/scanner.html` |
| `app/modules/scanner.js` | **active experiment** | **duplicate**, partially broken/incomplete | Tracked; dynamically imported by `/app/#scanner` |
| `resident/app/` | **dead/unreferenced** | **duplicate**, incomplete experiment | Untracked; absent from Git-based deployment until committed |
| `app/` | **active experiment** | **duplicate**, partially broken | Tracked; deployable at `/app/`, but has no product-nav incoming link |

No audited alternative qualifies as “legacy but still referenced”: the noncanonical surfaces have either only internal prototype references or no incoming product references at all.

## 1. Root `scanner.html`

### Classification: canonical

This classification comes from the explicit product decision and is consistent with current repository wiring.

### Incoming links

- `resident.html` links its resident scan action directly to `scanner.html`.
- `manifest.json` exposes `/scanner.html` as the installed PWA “Scan an item” shortcut.
- `README.md` identifies it as the resident scanning experience.
- The canonical Playwright checkpoint opens `/scanner.html` directly.

Documentation and tests are supporting evidence; `resident.html` and the PWA shortcut are the live runtime entry points.

### Imports and script references

- Loads `/pwa.js`, which registers `/sw.js`.
- Loads Supabase JavaScript v2 from jsDelivr.
- Loads Google Fonts through an inline CSS `@import`.
- Uses inline application JavaScript; it does not import another local scanner implementation.
- Links the PWA manifest and `/icon-192.png`.

### Routes and downstream handoff

- Static route: `/scanner.html`; Vercel `cleanUrls` may also expose an extensionless form.
- Analysis API: `POST /api/scan`.
- Successful pickup candidate handoff: `pickup-photo.html?bounty=<scan UUID>`.
- Home navigation: `index.html`.

### API calls

- Captures a JPEG camera frame and posts base64 plus `mediaType: image/jpeg` to `/api/scan`.
- The endpoint forwards the image to Anthropic and returns advisory scan JSON.
- The browser does not call `/api/verify-pickup`; that call occurs after the handoff in `pickup-photo.html`.

### Supabase usage

- Creates a browser Supabase client with an embedded public project URL/key.
- Reads the current Auth session.
- Looks up `residents.id` by authenticated `user_id`.
- Inserts one `scans` row on “Log This Haul,” then requests the inserted representation with `.select()`.
- Does not directly create a job. `pickup-photo.html` later transitions `scans.bounty_status` from null to `open`; the live database trigger creates the `PENDING` job.

### Build/deploy relevance

- The repository has no application build step; the file is served as a root static page.
- It is tracked by Git and not excluded by a `.vercelignore` file (none exists).
- It participates in PWA installation and navigation caching through the service worker.
- It is the only scanner surface covered by `tests/canonical-scanner.spec.js`.

### Known runtime defects and risks

The surface is canonical but not defect-free:

- no scan-insert idempotency key;
- reload can lose an in-flight analysis or uncertain insert result;
- asynchronous resident lookup can race the Log action;
- missing `navigator.mediaDevices` is not handled safely;
- capture can occur before usable video dimensions are available;
- invalid JSON and network errors collapse into the same message;
- API output is not schema-validated before rendering or persistence;
- `printLog()` concatenates external error strings into `innerHTML`, creating a DOM-XSS sink;
- the browser treats AI `estimated_value_high` as `accepted_value` and calculates resident WTWR display locally;
- browser Supabase configuration is duplicated and hard-coded.

These defects do not change its canonical classification; they define its stabilization backlog.

## 2. `resident/scanner.html`

### Classification: dead/unreferenced, broken, duplicate

It duplicates the resident scanning concept but has no verified incoming product link.

### Incoming links

- No HTML, JavaScript, manifest, or navigation file outside `resident/scanner.*` links to it.
- Repository documentation mentions it as a separate prototype, not as a runtime destination.
- It remains reachable only if someone knows and enters `/resident/scanner.html` directly.

### Imports and script references

- Loads sibling `scanner.css`.
- Loads sibling `scanner.js` as a classic script.
- Does not import root `scanner.html`, `/app` scanner services, or shared configuration.

### Routes and API calls

- Potential static route: `/resident/scanner.html`.
- It declares no API route and makes no network request itself.
- Its linked JavaScript uses simulated timers rather than `/api/scan`.

### Supabase usage

- None.
- The page has no Supabase client, authentication, scan insert, pickup update, or job transition.

### Build/deploy relevance

- The file is tracked, and no `.vercelignore` excludes it.
- In the framework-free Vercel deployment, it can be served by direct URL despite having no incoming link.
- It is not part of the PWA shortcut, resident dashboard navigation, `/app` imports, or canonical scanner tests.

### Known runtime defects

- Malformed camera heading markup contains `</h3>3>` and duplicated “Align Material” text.
- The camera surface is only a styled placeholder; no browser camera is requested.
- Several controls have no corresponding JavaScript behavior.
- It presents WTWR/value/verification concepts that are not backed by durable state.

## 3. `resident/scanner.css`

### Classification: dead/unreferenced outside its page; duplicate support asset

The stylesheet is internally referenced, but only by a dead/unreferenced duplicate page.

### Incoming links

- Sole runtime incoming reference: `<link rel="stylesheet" href="scanner.css">` in `resident/scanner.html`.
- No root page, `/app` module, or shared layout loads it.

### Imports, routes, APIs, and Supabase

- No imports.
- Potential static route: `/resident/scanner.css`.
- No API calls or Supabase usage.

### Build/deploy relevance

- Tracked and directly servable as a static asset.
- Not bundled, transformed, minified, or shared by any canonical surface.

### Known defects

- It styles the duplicate prototype only.
- `.sheet` contains bottom-sheet alignment behavior, but the HTML `#bottom-sheet` uses `overlay` without the `sheet` class, so that intended layout is not activated.
- Its UI states imply behavior that `resident/scanner.js` does not render or wire.

The CSS parses as a stylesheet; its defects are integration and dead-surface defects rather than a confirmed CSS syntax failure.

## 4. `resident/scanner.js`

### Classification: broken, dead/unreferenced, duplicate

This file calls itself a “Lifecycle Test Harness,” but it is neither an executable lifecycle test nor a canonical client implementation.

### Incoming links

- Sole runtime incoming reference: `<script src="scanner.js">` in `resident/scanner.html`.
- No other module imports it.
- It is not referenced by the canonical scanner, PWA manifest, resident dashboard, or Playwright checkpoint.

### Routes and API calls

- No `fetch()` call.
- `api.createVerifiedBounty()` only writes to the browser console.
- Scanning and proof verification use `setTimeout()` with invented fixed values.

### Supabase usage

- None.
- A comment says “Supabase placeholder goes here”; there is no client or persistence call.
- It therefore cannot create a `scans` row or participate in canonical scan-to-job creation.

### Browser-local state

- Stores only `wtwr_buckets` in `localStorage`.
- Keeps bucket value, materials, impact, XP ledger, inventory, and proof state in memory.
- These values are competing, non-authoritative representations of product and reward state.

### Build/deploy relevance

- Tracked classic script and directly servable.
- No compilation or module loader protects it from runtime defects.

### Confirmed runtime/functional defects

- `updateUI()` is a placeholder and never updates visible statistics.
- Finalize, reset, inventory-open/close, agreement accept/cancel, and camera-cancel buttons have no registered listeners.
- `btn-finalize` remains hidden and cannot reach `acceptAgreement()` through the UI.
- `ai-overlay` is queried but does not exist in the paired HTML.
- The alternate initialization branch executes `ScannerApp.ithis.els = ...; nit();`; `ScannerApp.ithis` is undefined and `nit` is undefined.
- `acceptAgreement()` marks the bucket locked and immediately calls `startNewBucket()`, erasing the visible locked state.
- It invents XP and value locally and never persists canonical lifecycle evidence.

The file passes JavaScript parsing; its failure is runtime and behavioral, not a syntax error.

## 5. `app/modules/scanner.js`

### Classification: active experiment, duplicate, partially broken/incomplete

This is the scanner module of the tracked `/app` hash-routed experiment.

### Incoming links and imports

- `app/app.js` maps the `scanner` route to `/app/modules/scanner.js` and dynamically imports it.
- `app/index.html` changes the hash to `#scanner`, which causes that import.
- The scanner module imports `../services/scanner-api.js`.
- No canonical/root page imports it.

### Routes

- User-visible experimental route: `/app/#scanner`.
- Module asset route: `/app/modules/scanner.js`.

### API calls

- Calls `scanMaterial()` in `app/services/scanner-api.js`.
- That service posts to `/api/scan.js`, while the established canonical endpoint path is `/api/scan`.
- The service reads the raw response, logs it in full, parses JSON, and throws on a non-OK response.

### Supabase usage

- None.
- `app/services/supabase.js` exists but is a zero-byte file and is not imported.
- Successful AI output is displayed but never inserted into `scans`.
- The module cannot open pickup or create a canonical job.

### Build/deploy relevance

- Tracked ES module loaded from the directly addressable `/app/` shell.
- No bundler is required; browsers load it through native dynamic import.
- It is not linked by current product navigation, so its only entry is a direct `/app/` visit.

### Known runtime defects and incompleteness

- Camera failure text is assigned through `innerHTML` using `error.message`.
- API results are interpolated into `innerHTML` via `JSON.stringify`; this is not a safe normalized rendering boundary.
- The service logs the complete raw AI response.
- No missing-`mediaDevices` guard, video-readiness check, capture retry model, stream cleanup, or navigation cleanup exists.
- Navigating between hash modules can leave the camera stream running.
- No scan persistence, resident identity, location, pickup, or job path exists.
- The path duplicates camera/API analysis without strengthening the canonical scanner.

## 6. `resident/app/`

### Classification: dead/unreferenced, duplicate, incomplete experiment

This directory is a second modular shell copied from an earlier `/app` shape.

### Incoming links

- No repository page, script, manifest, PWA shortcut, or tracked route links to `resident/app/index.html`.
- Its only references are internal:
  - `index.html` loads `app.css` and `app.js`;
  - `app.js` dynamically imports its own `modules/*` files;
  - navigation buttons call the global `loadPage()` function.

### Routes

- Potential local/direct route: `/resident/app/` or `/resident/app/index.html`.
- No hash or History API routing; buttons directly call `loadPage()` and the initial load always renders home.

### API calls and Supabase usage

- No API calls.
- No Supabase client, Auth, table access, Storage, or RPC use.
- The scanner module only changes text to “Camera module coming online.”

### Build/deploy relevance

- The entire directory is untracked.
- A Git-based Vercel deployment will not receive it unless it is added and committed.
- A manual deployment of the dirty working directory could include it because no `.vercelignore` exists, but that is not repository-defined deploy state.

### Known defects and incompleteness

- It duplicates `/app` structure and navigation.
- Scanner, marketplace, dispatch, and wallet modules are placeholders.
- No error boundary exists around dynamic imports.
- No URL state records the selected page, so reload always returns to home.
- No authentication or persona boundary exists.
- It creates a second resident shell without a canonical decision or integration path.

## 7. `app/`

### Classification: active experiment, duplicate, partially broken

The directory is explicitly described by the architecture as an experimental hash-routed shell. It is more developed than `resident/app/`, but it is not the architectural standard and has no incoming product-navigation link.

### Incoming links

- No page outside `app/` links to `/app/` or `app/index.html`.
- Internal wiring is complete enough to enter by direct URL:
  - `app/index.html` loads `/app/app.css` and `/app/app.js`;
  - navigation writes `#home`, `#scanner`, `#marketplace`, `#dispatch`, or `#wallet`;
  - `app/app.js` maps those names to absolute module paths and dynamically imports them.

### Routes

- Direct shell route: `/app/` or `/app/index.html`.
- Client routes: `/app/#home`, `#scanner`, `#marketplace`, `#dispatch`, and `#wallet`.
- Unknown hashes fall back to the home module.

### API calls

- Only the scanner module has an implemented API client.
- It uses `app/services/scanner-api.js`, which posts to `/api/scan.js`.
- Other modules render static placeholder content.

### Supabase usage

- None.
- `app/services/supabase.js` is empty.
- The shell does not persist scans, use Auth, open pickup, or interact with jobs.

### Build/deploy relevance

- All `/app` files are tracked.
- They are directly servable in the current no-build Vercel architecture.
- There is no `.vercelignore`, rewrite, or authorization gate preventing direct access.
- The architecture explicitly says hash routing under `/app` is experimental and not the standard until adopted.

### Known runtime defects and incompleteness

- `app/modules/wallet.js` ends with the bare identifier `yup`; module evaluation throws `ReferenceError: yup is not defined`, which the shell catches and displays as page-load failure.
- Scanner behavior has the defects listed in the prior section.
- Marketplace, dispatch, wallet, and home modules are presentation placeholders rather than complete persona flows.
- The shell error panel interpolates `error.message` into `innerHTML`.
- No authentication, role-aware navigation, Supabase persistence, or canonical lifecycle ownership exists.
- Camera resources are not cleaned up on hash navigation.

## Dependency and duplication map

```text
resident.html
  -> scanner.html                         CANONICAL
       -> /api/scan
       -> Supabase Auth/residents/scans
       -> pickup-photo.html
            -> Supabase Storage/scans
            -> scan-open trigger -> jobs

direct URL only
  -> resident/scanner.html                DEAD + DUPLICATE + BROKEN
       -> resident/scanner.css
       -> resident/scanner.js

direct URL only
  -> app/index.html                       ACTIVE EXPERIMENT + DUPLICATE
       -> app/app.js
            -> app/modules/scanner.js
                 -> app/services/scanner-api.js -> /api/scan.js

not tracked; direct local URL only
  -> resident/app/index.html              DEAD + DUPLICATE + INCOMPLETE
       -> resident/app/app.js
            -> resident/app/modules/scanner.js (placeholder)
```

## Inventory conclusion

The repository has one canonical resident scanner and three competing representations:

1. root `scanner.html`: canonical, linked, persistent, and connected to scan-to-job creation;
2. `/app/#scanner`: tracked active experiment with real camera/API analysis but no persistence;
3. `resident/scanner.html`: tracked, direct-address duplicate lifecycle mock with confirmed runtime defects;
4. `resident/app/`: untracked duplicate shell whose scanner is only a placeholder.

The canonical decision removes ownership ambiguity but does not remove deployment ambiguity: tracked duplicate pages remain directly addressable. Any future quarantine or removal should be a separate, explicit change with route compatibility and user-data impact reviewed first.
