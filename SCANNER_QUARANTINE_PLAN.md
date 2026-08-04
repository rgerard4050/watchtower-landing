# Scanner Surface Quarantine Plan

Status: proposed; not implemented  
Prepared: 2026-08-04  
Scope: unreferenced duplicate resident scanner surfaces only

## Decision and boundaries

The root `scanner.html` remains the canonical resident scanner. Its production entry points, API path, Supabase persistence, pickup handoff, PWA shortcut, and Playwright coverage are unchanged.

This plan quarantines only these inventory-confirmed duplicate surfaces:

1. the tracked `resident/scanner.html`, `resident/scanner.css`, and `resident/scanner.js` prototype as one self-contained unit;
2. the entire untracked `resident/app/` duplicate shell as one self-contained unit.

The destination is:

```text
quarantine/
  scanner-surfaces/
    resident-scanner-prototype/
      scanner.html
      scanner.css
      scanner.js
    resident-app-prototype/
      app.css
      app.js
      index.html
      modules/
        dispatch.js
        home.js
        marketplace.js
        scanner.js
        wallet.js
```

The following remain in place and outside this change:

- canonical `scanner.html`;
- experimental `app/` and all of its contents;
- `.agents/`;
- APIs, SQL, migrations, RPCs, marketplace code, tests, and existing documentation.

No files are deleted. The three tracked prototype files use Git-aware moves so their history remains traceable. `resident/app/` has no Git history to preserve because it is currently untracked; its directory is moved intact and then added at the destination.

## Preconditions

Run these read-only checks immediately before moving anything:

```powershell
git status --short -- scanner.html resident/scanner.html resident/scanner.css resident/scanner.js resident/app app .agents
git ls-files -- resident/scanner.html resident/scanner.css resident/scanner.js resident/app app
rg -n --glob '!SCANNER_QUARANTINE_PLAN.md' 'resident/scanner(?:\.html|\.css|\.js)|resident/app|/resident/scanner|/resident/app' .
Test-Path -LiteralPath quarantine/scanner-surfaces/resident-scanner-prototype
Test-Path -LiteralPath quarantine/scanner-surfaces/resident-app-prototype
```

Expected results at the time of this plan:

- the three `resident/scanner.*` files are tracked and have pre-existing working-tree modifications;
- `resident/app/` is untracked and contains exactly the eight files listed above;
- neither destination exists;
- no production entry point references either source surface;
- `app/` also has pre-existing modifications and must remain untouched.

Stop if either destination exists, the source inventory differs, a production entry point has acquired a reference, or the working-tree state cannot be attributed. Do not overwrite or merge an existing quarantine directory.

## Exact move operations

Execute from the repository root in PowerShell. Create only the two required destination parents, then use `git mv` for tracked files and `Move-Item` for the untracked directory.

```powershell
New-Item -ItemType Directory -Path quarantine/scanner-surfaces/resident-scanner-prototype
New-Item -ItemType Directory -Path quarantine/scanner-surfaces/resident-app-prototype

git mv -- resident/scanner.html quarantine/scanner-surfaces/resident-scanner-prototype/scanner.html
git mv -- resident/scanner.css quarantine/scanner-surfaces/resident-scanner-prototype/scanner.css
git mv -- resident/scanner.js quarantine/scanner-surfaces/resident-scanner-prototype/scanner.js

Move-Item -LiteralPath resident/app/app.css -Destination quarantine/scanner-surfaces/resident-app-prototype/app.css
Move-Item -LiteralPath resident/app/app.js -Destination quarantine/scanner-surfaces/resident-app-prototype/app.js
Move-Item -LiteralPath resident/app/index.html -Destination quarantine/scanner-surfaces/resident-app-prototype/index.html
Move-Item -LiteralPath resident/app/modules -Destination quarantine/scanner-surfaces/resident-app-prototype/modules

git add -- quarantine/scanner-surfaces/resident-app-prototype
```

The file-by-file move for the untracked shell avoids a broad recursive command and makes the exact scope reviewable. Once empty, `resident/app/` may remain as an untracked empty directory on disk; Git does not record empty directories. No cleanup command is required.

Internal relative references remain coherent after these moves:

- `resident-scanner-prototype/scanner.html` still resolves sibling `scanner.css` and `scanner.js`;
- `resident-app-prototype/index.html` still resolves sibling `app.css` and `app.js`;
- `resident-app-prototype/app.js` still resolves its sibling `modules/` directory.

No source, import, link, or route should be edited as part of this commit.

## Expected Git changes

After staging, Git should represent the tracked trio as renames where similarity detection permits:

```text
R  resident/scanner.html -> quarantine/scanner-surfaces/resident-scanner-prototype/scanner.html
R  resident/scanner.css  -> quarantine/scanner-surfaces/resident-scanner-prototype/scanner.css
R  resident/scanner.js   -> quarantine/scanner-surfaces/resident-scanner-prototype/scanner.js
```

Because these files already contain uncommitted edits, the exact status presentation may vary by Git version and index state. `git diff --cached --find-renames` is authoritative: the destination content must match the pre-move working-tree content, and no edits beyond path changes may appear. Rename detection is a diff presentation feature; Git history remains recoverable through `git log --follow` even if a low-similarity file is displayed as a deletion plus addition.

The untracked `resident/app/` files have no prior commits, so their expected status is eight additions under `quarantine/scanner-surfaces/resident-app-prototype/`, not renames. The source paths should disappear from `git status`.

No status change is expected for canonical `scanner.html`, `app/`, `.agents/`, SQL, migrations, RPCs, APIs, marketplace code, tests, or documentation other than this plan if it is committed separately.

## Verification commands

### Scope and rename verification

```powershell
git status --short
git diff --cached --name-status --find-renames
git diff --cached --summary --find-renames
git diff --cached --stat
git diff --cached --check
```

Review the full staged patch before committing:

```powershell
git diff --cached --find-renames -- quarantine/scanner-surfaces resident/scanner.html resident/scanner.css resident/scanner.js resident/app
```

The staged diff must contain only the three tracked moves and the eight additions from the formerly untracked shell. If unrelated pre-staged changes appear, stop and isolate them without resetting or discarding user work.

### Canonical and excluded-surface verification

```powershell
git diff --exit-code -- scanner.html
git diff --exit-code -- app
git diff --exit-code -- .agents
git diff --exit-code -- api supabase tests
Test-Path -LiteralPath scanner.html
Test-Path -LiteralPath app
Test-Path -LiteralPath .agents
```

The `git diff --exit-code` checks compare against the index and may report pre-existing unstaged work. Compare their output with the recorded precondition status; the quarantine operation must introduce no new diff in these paths.

### Reference and internal-integrity verification

```powershell
rg -n 'resident/scanner(?:\.html|\.css|\.js)|resident/app|/resident/scanner|/resident/app' --glob '!SCANNER_QUARANTINE_PLAN.md' .
rg -n 'scanner\.css|scanner\.js' quarantine/scanner-surfaces/resident-scanner-prototype/scanner.html
rg -n 'app\.css|app\.js' quarantine/scanner-surfaces/resident-app-prototype/index.html
rg -n 'modules/' quarantine/scanner-surfaces/resident-app-prototype/app.js
```

The first command should find no production reference to the removed source paths. The remaining checks confirm that each quarantined surface kept its relative dependency layout.

### History verification

After the move commit exists:

```powershell
git log --follow --oneline -- quarantine/scanner-surfaces/resident-scanner-prototype/scanner.html
git log --follow --oneline -- quarantine/scanner-surfaces/resident-scanner-prototype/scanner.css
git log --follow --oneline -- quarantine/scanner-surfaces/resident-scanner-prototype/scanner.js
```

Each command should traverse into the corresponding former `resident/scanner.*` path. No equivalent history assertion applies to `resident/app/`, which was untracked before quarantine.

## Rollback

Rollback must preserve the pre-existing modified contents. Use a reverse Git-aware move for the tracked trio and literal moves for the newly tracked shell; do not use `git reset --hard`, `git checkout --`, or deletion commands.

### Before the quarantine commit

```powershell
git mv -- quarantine/scanner-surfaces/resident-scanner-prototype/scanner.html resident/scanner.html
git mv -- quarantine/scanner-surfaces/resident-scanner-prototype/scanner.css resident/scanner.css
git mv -- quarantine/scanner-surfaces/resident-scanner-prototype/scanner.js resident/scanner.js
git restore --staged -- resident/scanner.html resident/scanner.css resident/scanner.js

git restore --staged -- quarantine/scanner-surfaces/resident-app-prototype
New-Item -ItemType Directory -Path resident/app -Force
Move-Item -LiteralPath quarantine/scanner-surfaces/resident-app-prototype/app.css -Destination resident/app/app.css
Move-Item -LiteralPath quarantine/scanner-surfaces/resident-app-prototype/app.js -Destination resident/app/app.js
Move-Item -LiteralPath quarantine/scanner-surfaces/resident-app-prototype/index.html -Destination resident/app/index.html
Move-Item -LiteralPath quarantine/scanner-surfaces/resident-app-prototype/modules -Destination resident/app/modules
```

Then verify that the original `git status --short` shape and file inventory have been restored. Empty quarantine directories can be left on disk; they are not tracked and do not affect the repository.

### After the quarantine commit

Create a normal revert commit:

```powershell
git revert <quarantine-commit-sha>
```

Review the revert before pushing. This is the safest history-preserving rollback once the commit is shared. It restores the tracked prototype paths and removes the newly committed copy of the formerly untracked shell. If work has subsequently changed either location, resolve conflicts by preserving that work rather than forcing the revert.

## Smallest safe commit boundary

Use one implementation commit with one outcome:

```text
chore(scanner): quarantine unreferenced resident scanner prototypes
```

That commit contains only:

- the three tracked `resident/scanner.*` path renames;
- the eight `resident/app/` files added at their quarantine paths.

Do not include this planning document in the implementation commit if it has already been committed separately. Do not include unrelated modified or untracked files. Keeping both duplicate surfaces in one implementation commit is the smallest safe boundary because they implement the same approved quarantine decision, while splitting the internally coupled files within either surface would create a broken intermediate tree.

## Residual risk

This plan provides repository-level quarantine, not guaranteed deployment exclusion. The repository is statically served and currently has no quarantine-specific ignore rule, so committed quarantine files may remain addressable at new direct URLs. Preventing deployment of the quarantine tree would require a separate, explicitly approved deployment-configuration change; it is intentionally not included here.

The move also carries forward all current prototype defects and pre-existing uncommitted edits unchanged. That is deliberate: quarantine establishes ownership without rewriting or destroying historical work.
