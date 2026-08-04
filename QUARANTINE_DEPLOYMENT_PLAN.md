# Quarantine Deployment Exclusion Plan

Status: proposed; not implemented  
Prepared: 2026-08-04  
Scope: prevent repository quarantine artifacts from entering Vercel deployments

## Executive conclusion

The current repository configuration does not exclude `quarantine/` from Vercel. The project has no `.vercelignore`, no build command, and no configured output directory in `vercel.json`; the file contains only `version`, `cleanUrls`, and `trailingSlash`. For a static project whose output is the repository root, Vercel serves eligible files from that root. Vercel states that, absent a `.vercelignore` exclusion, project files are uploaded and that ignored files are prevented from being deployed and served. See [Vercel's `.vercelignore` documentation](https://vercel.com/docs/deployments/vercel-ignore) and [static-project output-directory behavior](https://vercel.com/docs/builds/configure-a-build).

Therefore, **a Vercel deployment containing the current quarantine commit is expected to expose the quarantine artifacts at public filesystem-derived URLs**. This is verified configuration behavior, not a successful probe of the production deployment.

The exact currently live revision remains unverified:

- the quarantine move exists in local commit `0e4cf58` on branch `resident-scanner-demo`;
- the branch has no configured upstream in this checkout;
- this checkout has no `.vercel/project.json` linkage;
- no authoritative production deployment URL or deployment revision is recorded locally;
- Vercel dashboard project settings, including any output-directory override, were not available during this audit.

Consequently, it is not possible from this repository alone to assert that the presently live production deployment already contains `0e4cf58`. If it does, the quarantine content is expected to be public. If it does not, the content is absent only because that revision has not been deployed—not because the configuration protects it.

## 1. Current Vercel static-serving behavior

### Verified repository state

`vercel.json` currently contains:

```json
{
  "version": 2,
  "cleanUrls": true,
  "trailingSlash": false
}
```

There is:

- no `.vercelignore`;
- no `buildCommand` or build script;
- no `outputDirectory`;
- no route blocking `/quarantine`;
- no framework build that emits an allowlisted artifact tree.

Vercel documents that a static project using the `Other` preset and no `public` directory serves the project root, unless an output-directory override changes that behavior. It also documents that files not excluded by `.vercelignore` are uploaded, while excluded files are not deployed or served. The repository matches the root-static pattern, subject to the unresolved dashboard-setting caveat above. [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build), [Vercel ignore configuration](https://vercel.com/docs/deployments/vercel-ignore).

`cleanUrls: true` removes `.html` from public-facing HTML URLs in deployed Vercel behavior; it does not make repository directories private. Vercel documents `cleanUrls` as a URL normalization option, not a deployment filter. [Vercel static configuration](https://vercel.com/docs/project-configuration/vercel-json).

### Current quarantine tree

The repository contains eleven quarantined files:

```text
quarantine/scanner-surfaces/resident-scanner-prototype/scanner.html
quarantine/scanner-surfaces/resident-scanner-prototype/scanner.css
quarantine/scanner-surfaces/resident-scanner-prototype/scanner.js
quarantine/scanner-surfaces/resident-app-prototype/index.html
quarantine/scanner-surfaces/resident-app-prototype/app.css
quarantine/scanner-surfaces/resident-app-prototype/app.js
quarantine/scanner-surfaces/resident-app-prototype/modules/dispatch.js
quarantine/scanner-surfaces/resident-app-prototype/modules/home.js
quarantine/scanner-surfaces/resident-app-prototype/modules/marketplace.js
quarantine/scanner-surfaces/resident-app-prototype/modules/scanner.js
quarantine/scanner-surfaces/resident-app-prototype/modules/wallet.js
```

They are ordinary HTML, CSS, and JavaScript files under the deployment root. Nothing in the current repository configuration distinguishes them from intended static assets.

## 2. Direct accessibility

If commit `0e4cf58` is included in a root-static deployment, these representative URLs are expected to resolve publicly:

```text
/quarantine/scanner-surfaces/resident-scanner-prototype/scanner
/quarantine/scanner-surfaces/resident-scanner-prototype/scanner.html
/quarantine/scanner-surfaces/resident-scanner-prototype/scanner.css
/quarantine/scanner-surfaces/resident-scanner-prototype/scanner.js
/quarantine/scanner-surfaces/resident-app-prototype/
/quarantine/scanner-surfaces/resident-app-prototype/index.html
/quarantine/scanner-surfaces/resident-app-prototype/app.js
/quarantine/scanner-surfaces/resident-app-prototype/modules/scanner.js
```

The extensionless HTML form follows from `cleanUrls`; the precise redirect/canonical response should be confirmed on a preview deployment. Static subdirectories retain their URL path in Vercel deployment output. [Vercel static file behavior](https://vercel.com/docs/build-output-api/primitives).

There are no incoming product-navigation links to these URLs, but lack of links is not access control. Anyone with the path—or a crawler, source-map reference, log entry, or shared link—could request the assets.

## 3. Recommended smallest safe method

Create a root `.vercelignore` containing exactly:

```gitignore
quarantine
```

This is the smallest safe change because it excludes the complete quarantine subtree before upload while leaving the repository files and Git history intact. It does not change routing, application behavior, build architecture, canonical scanner code, or API functions.

Vercel explicitly supports a root `.vercelignore` for excluding files and directories from deployment, and states that excluded content is prevented from being deployed and served. [Vercel `.vercelignore` documentation](https://vercel.com/docs/deployments/vercel-ignore).

Use the directory name rather than enumerating eleven files. This automatically protects future artifacts placed under the approved quarantine boundary and avoids a partial exclusion when the tree changes.

### Exact implementation

Create one new file at repository root:

```text
.vercelignore
```

with this content and a final newline:

```text
quarantine
```

Do not copy unrelated `.gitignore` entries into it. In particular, do not introduce an allowlist or exclude `api/`, root HTML, PWA assets, or test-support files as part of this change.

## 4. Alternatives considered

### A. Vercel ignore configuration — recommended

Advantages:

- one declarative file and one exclusion rule;
- removes the files from deployment rather than merely hiding their routes;
- preserves the quarantine tree and Git history in the repository;
- does not alter canonical scanner or API routing;
- automatically covers future descendants of `quarantine/`.

Tradeoffs:

- behavior is Vercel-specific;
- local generic static servers will still serve `quarantine/` unless independently configured;
- a deployment must be inspected because dashboard overrides and deployment tooling can differ from repository assumptions;
- an operator using a custom upload manifest outside normal Vercel Git/CLI behavior must retain the exclusion.

### B. Move quarantine outside the deploy root — rejected for now

Moving `quarantine/` outside the Vercel project root would make it unavailable to the deployment source set.

Advantages:

- structural separation from deployable assets;
- platform-independent if local and production servers share the same root boundary.

Tradeoffs:

- with the repository root also acting as the Vercel project root, a path outside it would normally fall outside the repository and lose ordinary version control/history;
- keeping it inside the repository but outside the deploy root would require moving the deploy root to a new subdirectory;
- moving the deploy root would force relocation or copying of root pages, assets, `api/`, and configuration, creating a broad architectural change;
- it exceeds the approved quarantine scope and risks breaking APIs and standalone pages.

### C. Build-output allowlisting — rejected for this checkpoint

Introduce a build step that emits only approved static files into a dedicated output directory, then set `outputDirectory` in `vercel.json`. Vercel serves only the configured output directory after a build. [Vercel output-directory documentation](https://vercel.com/docs/builds/configure-a-build).

Advantages:

- strongest long-term explicit control over the public artifact set;
- avoids accidentally deploying future repository-only files;
- can make deploy contents reproducible and inspectable.

Tradeoffs:

- requires a new build/copy manifest and maintenance of every root page and asset;
- serverless `api/` behavior must be verified or separately represented;
- changes the framework-free deployment architecture;
- a missed allowlist entry could remove canonical pages, PWA assets, or functions;
- disproportionate to excluding one directory.

This could be reconsidered as a separate deployment-hardening project, not folded into scanner quarantine.

### D. Route-level blocking — fallback defense, not exclusion

Add a high-priority Vercel route returning `404` for `/quarantine` and descendants. Vercel supports ordered route patterns and status responses in `vercel.json`. [Vercel route configuration](https://vercel.com/docs/project-configuration/vercel-json#routes).

Advantages:

- explicit HTTP denial even if files are uploaded;
- can serve as defense in depth where upload exclusion cannot be trusted.

Tradeoffs:

- quarantined bytes remain in the deployment rather than being excluded;
- ordered low-level routes are easier to misconfigure and can interfere with filesystem routing, `cleanUrls`, or APIs;
- expands `vercel.json` and requires route-precedence testing;
- does not meet the stronger goal that quarantine assets be absent from deployment resources.

Route blocking should be considered only as an additional separately approved control if preview verification shows `.vercelignore` is not honored by the actual deployment pipeline.

## 5. Rollback

Before commit, remove only the new `.vercelignore` file from the proposed change. After a shared commit, create a normal revert commit:

```powershell
git revert <quarantine-exclusion-commit-sha>
```

Then deploy the revert and verify that the expected prior deployment behavior returns. Rollback deliberately re-exposes quarantine content, so it should be used only when the exclusion unexpectedly removes required artifacts or functions.

No quarantine files should be moved or deleted during rollback. Do not roll back the scanner-quarantine commit merely to undo deployment exclusion.

## 6. Exact files that would change

Only one new file:

```text
.vercelignore
```

No existing file needs modification. Specifically unchanged:

- `vercel.json`;
- `scanner.html` and all canonical scanner dependencies;
- `api/`;
- `quarantine/` contents;
- `app/` and `.agents/`;
- SQL, migrations, RPCs, marketplace code, and tests.

Proposed commit boundary:

```text
chore(deploy): exclude quarantine artifacts from Vercel
```

The commit should contain only `.vercelignore`.

## 7. Verification plan

### A. Repository checks before deployment

```powershell
Get-Content -Raw -LiteralPath .vercelignore
git diff --check -- .vercelignore
git diff --name-only -- .vercelignore vercel.json scanner.html api quarantine tests
npm test
npm run test:scanner-checkpoint
```

Expected:

- `.vercelignore` contains only `quarantine` plus its final newline;
- no change appears in `vercel.json`, `scanner.html`, `api/`, `quarantine/`, or `tests/`;
- all canonical scanner checkpoint tests pass without production credentials or data.

### B. Preview deployment resource verification

Create a Vercel preview deployment through the project's normal Git integration. Do not deploy directly to production first. Record the preview commit SHA and confirm it contains the exclusion commit.

In the Vercel deployment Resources view:

- confirm `scanner.html` is listed as a static asset;
- confirm expected functions under `api/` are listed;
- search for `quarantine` and confirm no matching static asset exists.

Vercel exposes static assets and functions in the deployment Resources view. [Vercel deployment resources](https://vercel.com/docs/deployments/overview#resources-tab-and-deployment-summary).

If the Resources view still lists quarantine assets, stop. Verify the configured Vercel project root and whether the deployment pipeline uses a custom/prebuilt upload that bypasses normal source collection.

### C. Preview HTTP verification

Set the preview origin explicitly; never point these commands at production during initial verification:

```powershell
$previewOrigin = 'https://<preview-deployment-host>'

curl.exe -sS -o NUL -w "%{http_code}`n" "$previewOrigin/scanner"
curl.exe -sS -o NUL -w "%{http_code}`n" "$previewOrigin/scanner.html"

curl.exe -sS -o NUL -w "%{http_code}`n" "$previewOrigin/api/scan"

curl.exe -sS -o NUL -w "%{http_code}`n" "$previewOrigin/quarantine/scanner-surfaces/resident-scanner-prototype/scanner"
curl.exe -sS -o NUL -w "%{http_code}`n" "$previewOrigin/quarantine/scanner-surfaces/resident-scanner-prototype/scanner.html"
curl.exe -sS -o NUL -w "%{http_code}`n" "$previewOrigin/quarantine/scanner-surfaces/resident-scanner-prototype/scanner.js"
curl.exe -sS -o NUL -w "%{http_code}`n" "$previewOrigin/quarantine/scanner-surfaces/resident-app-prototype/"
curl.exe -sS -o NUL -w "%{http_code}`n" "$previewOrigin/quarantine/scanner-surfaces/resident-app-prototype/index.html"
curl.exe -sS -o NUL -w "%{http_code}`n" "$previewOrigin/quarantine/scanner-surfaces/resident-app-prototype/modules/scanner.js"
```

Expected:

- canonical `/scanner` resolves with `200`; `/scanner.html` may redirect or normalize because `cleanUrls` is enabled;
- `/api/scan` must resolve to the function rather than a platform `404`; because it is a POST-only application endpoint, a GET may correctly return an application `405`—that result proves deployment without invoking analysis or production data;
- every quarantine URL returns the platform's not-found response, normally `404`, with no quarantined file body;
- deployment protection responses such as `401` or `403` are inconclusive; repeat with an authorized preview request or temporary approved share mechanism.

Also inspect response bodies or headers sufficiently to distinguish an application `404` from an authentication wall. A redirect to a login page does not prove the asset is absent.

### D. Browser checkpoint against the preview

Run the existing isolated checkpoint locally again:

```powershell
npm test
npm run test:scanner-checkpoint
```

Then manually load the preview's canonical scanner and confirm its HTML, CSS, camera-permission handling, and mocked/non-production verification path still function. Do not submit real production data as part of this deployment check.

### E. Production promotion

Promote only the verified preview artifact through the normal Vercel workflow. Repeat the representative canonical scanner, API method, and quarantine `404` probes against the production origin. Confirm the production deployment revision matches the reviewed commit before declaring the exposure closed.

## Acceptance criteria

The exclusion is complete only when all of the following are true:

- `.vercelignore` is the sole repository change in its commit;
- canonical scanner tests pass;
- the preview deployment lists the canonical static scanner and API functions;
- no `quarantine/` resource appears in preview deployment assets;
- representative quarantine URLs return genuine `404` responses;
- the same checks pass after production promotion;
- the deployed revision is recorded, eliminating the current uncertainty about live state.
