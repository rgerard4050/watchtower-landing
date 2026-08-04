# Duplicate Lifecycle Remediation Plan

Status: proposed only; no migration applied  
Prepared: 2026-08-04  
Scope: duplicate intake/passport creation on the resident job lifecycle

## Evidence labels

- **Verified live** — confirmed through read-only catalog queries against the connected Supabase project.
- **Repository direction** — required by `ENGINEERING_PRINCIPLES.md`, `ARCHITECTURE.md`, or `NEXT.md`.
- **Inferred dependency** — logically follows from verified definitions but has not been exercised against live data.
- **Unresolved** — requires staging execution or a separate live-data audit.

No database, migration, application, or UI change was made while preparing this plan.

## 1. Exact live functions and triggers

### Canonical job functions

All functions below are live `SECURITY DEFINER` functions with `SET search_path TO 'public'` and authenticated-only EXECUTE among the application roles inspected.

#### `public.job_create_intake(bigint, numeric, numeric)`

**Verified live behavior:**

1. Locks the job.
2. Requires the assigned driver or an operator.
3. Requires job status `SCANNING`.
4. Requires positive weight and price.
5. Locks the linked scan.
6. Inserts an `ACQUIRED` intake and returns its ID.
7. Updates the scan to `bounty_status = 'completed'` and sets `completed_at`.
8. Updates the job to `INTAKE`, assigns the first intake ID, and sets `intake_at`.

Step 7 activates every applicable UPDATE trigger on `scans`, including the legacy record-creation trigger.

#### `public.job_create_passport(bigint)`

**Verified live behavior:**

1. Locks the job.
2. Requires the assigned driver or an operator.
3. Requires job status `INTAKE` and a non-null `jobs.intake_id`.
4. Reads that intake.
5. Inserts a `CREATED` passport for it.
6. Updates the job to `PASSPORT`, assigns the passport ID, and sets `passport_at`.

### Legacy completion function

#### `public.create_intake_and_passport_on_bounty_completion()`

**Verified live behavior:** when a scan changes to `completed` and has a resident, the function:

1. Reads resident name and wallet ID.
2. Inserts another `ACQUIRED` intake whose operator is `bounty-flow (auto)` and whose notes contain the source scan ID.
3. Inserts a `CREATED` passport for that second intake.

It does not inspect `jobs`, `jobs.intake_id`, or `jobs.passport_id`.

### Live triggers directly involved

| Table | Trigger | Timing | Function |
|---|---|---|---|
| `scans` | `create_intake_passport_on_bounty_completion` | AFTER UPDATE | `create_intake_and_passport_on_bounty_completion()` |
| `scans` | `record_driver_payout_on_bounty_completion` | BEFORE UPDATE | `record_driver_payout_on_bounty_completion()` |
| `scans` | `scans_bounty_transition_guard` | BEFORE UPDATE | `enforce_scan_bounty_transition()` |
| `scans` | `credit_resident_wtwr_on_completion` | AFTER UPDATE | `credit_resident_on_bounty_completion()` |
| `scans` | `trg_create_job_on_bounty_open` | AFTER UPDATE | `create_job_on_bounty_open()` |
| `jobs` | `trg_touch_job_updated_at` | BEFORE INSERT or status UPDATE | `touch_job_updated_at()` |
| `jobs` | `trg_log_job_status_events` | AFTER INSERT or status UPDATE | `log_job_status_events()` |
| `passports` | `trg_require_acquired_intake` | BEFORE INSERT | `require_acquired_intake()` |
| `passports` | `trg_log_passport_created` | AFTER INSERT | `log_passport_created()` |
| `passports` | `record_token_reserve_event_on_grading` | AFTER UPDATE | `record_token_reserve_event_on_grading()` |

### Missing duplicate barriers

**Verified live:**

- `intakes` has no `scan_id` or `job_id` column and no lifecycle uniqueness constraint.
- `passports.intake_id` has a non-unique index only.
- The unique passport display ID does not prevent multiple passport rows.
- Job status gates prevent successful RPC retries, but do not prevent the sibling legacy trigger from writing different records inside the first successful transaction.

## 2. Duplicate-path sequence diagram

```mermaid
sequenceDiagram
    actor Driver
    participant JCI as job_create_intake()
    participant I as intakes
    participant S as scans
    participant Legacy as legacy completion trigger
    participant P as passports
    participant J as jobs
    participant JCP as job_create_passport()

    Driver->>JCI: RPC(job, weight, price)
    JCI->>JCI: lock job; require SCANNING
    JCI->>I: INSERT intake A (ACQUIRED)
    I-->>JCI: intake A id
    JCI->>S: UPDATE bounty_status = completed
    S->>Legacy: AFTER UPDATE fires
    Legacy->>I: INSERT intake B (ACQUIRED)
    I-->>Legacy: intake B id
    Legacy->>P: INSERT passport B for intake B
    Legacy-->>S: return NEW
    JCI->>J: UPDATE status = INTAKE, intake_id = A
    JCI-->>Driver: job references intake A

    Driver->>JCP: RPC(job)
    JCP->>JCP: require INTAKE; read intake A
    JCP->>P: INSERT passport A for intake A
    JCP->>J: UPDATE status = PASSPORT, passport_id = A
    JCP-->>Driver: job references passport A

    Note over I,P: One scan/job produced intake A + intake B and passport A + passport B
```

The duplicate legacy passport fires its own `PASSPORT_CREATED` event. The later job passport does the same, producing two passport birth events for the one material lifecycle.

## 3. Canonical path decision

### Decision: jobs RPC lifecycle is canonical

The canonical writer should be:

```text
job_create_intake()
  -> jobs.intake_id
job_create_passport()
  -> jobs.passport_id
create_listing_from_job()
  -> manifest/listing
```

Rationale:

- **Repository direction:** `ARCHITECTURE.md` defines `scans -> jobs -> intakes -> passports -> material_listings` as the product spine.
- Job RPCs enforce actor, current state, row locking, and explicit transitions.
- Job records retain direct, queryable custody links to the selected intake and passport.
- Job event normalization already maps the transitions to `INTAKE_LOGGED` and `PASSPORT_CREATED`.
- `create_listing_from_job()` consumes `jobs.intake_id` and `jobs.passport_id`; the legacy passport is not automatically attached to the job.
- Retaining the legacy trigger as canonical would leave job linkage as a secondary repair step and preserve two competing owners of lifecycle state.

The legacy function may temporarily remain as a compatibility path for scan completions that genuinely have no active job. It must not create records for a scan already represented by an active job.

## 4. Downstream dependencies of the legacy trigger

The phrase “legacy trigger dependency” needs care: several important side effects occur on the same scan completion but are independent sibling triggers, not calls made by `create_intake_and_passport_on_bounty_completion()`.

| Concern | Verified fact | Dependency classification | Effect of proposed guard |
|---|---|---|---|
| WTWR credits | `credit_resident_wtwr_on_completion` is a separate AFTER UPDATE trigger on `scans`; it adds `accepted_value * 0.40 * 100` to resident balance | Independent sibling trigger | Preserved |
| Driver payout accrual | `record_driver_payout_on_bounty_completion` is a separate BEFORE UPDATE trigger; it sets `driver_payout_cents` to 10% of accepted value in cents | Independent sibling trigger | Preserved |
| Token reserve events | `record_token_reserve_event_on_grading` fires when a passport changes to `GRADED`; it reads the passport intake value and inserts shares into `token_reserve_events` | Depends on the surviving passport, not the legacy creation function | Preserved when the job passport is graded; one passport avoids duplicate reserve exposure |
| Job events | `trg_log_job_status_events` logs `INTAKE_LOGGED` and `PASSPORT_CREATED` when the job changes state | Independent job transition behavior | Preserved |
| Passport events | Every passport insert fires `trg_log_passport_created` | Direct consequence of whichever path creates the passport | Preserved once for job passport; duplicate legacy birth event eliminated |
| Intakes | Legacy function directly inserts an ACQUIRED intake | Direct legacy output | Suppressed only when an active job exists |
| Passports | Legacy function directly inserts a CREATED passport linked to its intake | Direct legacy output | Suppressed only when an active job exists |
| Manifests | `create_listing_from_job()` creates a manifest if the job passport lacks one | Depends on job-linked passport and intake | Preserved |
| Listings | `create_listing_from_job()` creates a DRAFT listing and advances job to MARKETPLACE | Depends on job-linked records, not legacy passport | Preserved |
| Listing verification | AVAILABLE requires manifest with ACQUIRED intake and linked passport | Depends on manifest/intake/passport links | Preserved by job path |
| Offers/transactions | Marketplace operations consume the listing/manifest | Downstream of listing, not legacy trigger | Preserved |

### Inferred dependencies

- Removing the duplicate passport should reduce the chance that an operator grades or manifests the wrong passport.
- A legacy passport not linked to `jobs.passport_id` may still be visible to operator passport tooling and could be manually used later.
- Two passports could each be graded and produce two token reserve events because `token_reserve_events` has no unique index on `passport_id`.

These are strong structural inferences; whether they have occurred in production data is unresolved because this plan did not inspect or modify live rows.

## 5. Remediation approaches

### Approach A — guard the legacy function when an active job exists (recommended)

Add an early return to `create_intake_and_passport_on_bounty_completion()` when `jobs` contains the scan with status other than `CANCELLED`.

Advantages:

- Smallest behavioral change.
- Canonical job lifecycle becomes sole writer for job-backed intake/passport records.
- Keeps compatibility for any non-job completion path.
- Leaves credit, payout, transition guard, and job/event triggers untouched.
- `CREATE OR REPLACE FUNCTION` retains the existing trigger, owner, and function grants.
- Easy rollback by restoring the verified live function body.

Tradeoffs:

- Legacy code remains in production and must be retired later.
- Relies on the active job being created before completion; that is verified for the resident pickup path.
- Does not add a general uniqueness constraint against other manual/legacy duplicate writers.
- Existing duplicate rows are not repaired.

### Approach B — remove the legacy scan-completion trigger

Drop `create_intake_passport_on_bounty_completion` and make jobs the only automatic intake/passport path.

Advantages:

- Clean ownership and less hidden behavior.
- Eliminates the duplicate source completely.
- Simpler future reasoning.

Tradeoffs:

- A destructive trigger removal.
- Any valid scan-completion path without a job would stop producing intake/passport records.
- Requires confirming every external/legacy writer first.
- Rollback recreates the trigger but does not reconstruct records missed while it was absent.

This is a later consolidation step, not the smallest safe Phase 1 fix.

### Approach C — keep legacy creation canonical and make job RPCs adopt its records

Rewrite `job_create_intake()` so scan completion creates the intake/passport, then locate and attach those rows to the job; make `job_create_passport()` idempotently reuse the adopted passport.

Advantages:

- Preserves existing scan-completion behavior.
- Could serve non-job and job flows through one creation function.

Tradeoffs:

- Opposes the documented jobs RPC architecture.
- Legacy intakes have no structural `scan_id`, so adoption would depend on notes, resident/time matching, or a schema expansion.
- Makes a hidden trigger responsible for critical record identity.
- Requires a broader migration and more concurrency analysis.
- Harder rollback and test surface.

Not recommended.

## 6. Smallest safe migration

### Proposed migration SQL — do not apply yet

This replaces only the legacy trigger function. The trigger itself, scan state, wallet credit trigger, payout trigger, event triggers, RLS, and grants remain unchanged.

```sql
CREATE OR REPLACE FUNCTION public.create_intake_and_passport_on_bounty_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resident_name text;
  v_resident_wallet text;
  v_intake_id uuid;
  v_intake_number text;
  v_intake_created_at timestamptz;
BEGIN
  IF NEW.bounty_status = 'completed'
     AND OLD.bounty_status IS DISTINCT FROM NEW.bounty_status
     AND EXISTS (
       SELECT 1
       FROM public.jobs
       WHERE scan_id = NEW.id
         AND status <> 'CANCELLED'
     ) THEN
    RETURN NEW;
  END IF;

  IF NEW.bounty_status = 'completed'
     AND OLD.bounty_status IS DISTINCT FROM NEW.bounty_status
     AND NEW.resident_id IS NOT NULL THEN

    SELECT name, wallet_id
      INTO v_resident_name, v_resident_wallet
      FROM public.residents
      WHERE id = NEW.resident_id;

    INSERT INTO public.intakes (
      operator, owner_ref, material, gross_value, notes,
      lifecycle_status, acquired_at, lat, lng, photo_path, resident_id
    ) VALUES (
      'bounty-flow (auto)',
      COALESCE(v_resident_name, 'Unknown resident') ||
        ' (' || COALESCE(v_resident_wallet, 'no wallet') || ')',
      NEW.summary,
      NEW.accepted_value,
      'Created automatically from bounty completion, not manual operator entry. Source scan id: ' || NEW.id,
      'ACQUIRED',
      now(),
      NEW.pickup_lat,
      NEW.pickup_lng,
      NEW.pickup_photo_url,
      NEW.resident_id
    )
    RETURNING id, intake_number, created_at
      INTO v_intake_id, v_intake_number, v_intake_created_at;

    INSERT INTO public.passports (
      intake_id, intake_number, intake_created_at, intake_operator, intake_material,
      lifecycle_status, created_by, photo_url, resident_id
    ) VALUES (
      v_intake_id, v_intake_number, v_intake_created_at,
      'bounty-flow (auto)', NEW.summary,
      'CREATED', 'bounty-flow (auto)', NEW.pickup_photo_url, NEW.resident_id
    );
  END IF;

  RETURN NEW;
END;
$function$;
```

Why this is sufficient:

- During `job_create_intake()`, the job already exists and is `SCANNING` when the scan completion trigger runs.
- The guard returns before legacy intake/passport creation.
- The job RPC retains its first intake and later creates its one passport.
- The independent scan triggers still calculate payout and credit the wallet.
- Existing function ownership and ACLs are retained by `CREATE OR REPLACE`.

The migration intentionally does not delete or merge existing duplicates. Data cleanup requires a separate audited plan.

## 7. Rollback SQL

Rollback restores the exact verified live function body. It re-enables duplicate behavior for future job completions, so it should be used only if the compatibility guard blocks a required path.

```sql
CREATE OR REPLACE FUNCTION public.create_intake_and_passport_on_bounty_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resident_name text;
  v_resident_wallet text;
  v_intake_id uuid;
  v_intake_number text;
  v_intake_created_at timestamptz;
BEGIN
  IF NEW.bounty_status = 'completed'
     AND OLD.bounty_status IS DISTINCT FROM NEW.bounty_status
     AND NEW.resident_id IS NOT NULL THEN

    SELECT name, wallet_id
      INTO v_resident_name, v_resident_wallet
      FROM public.residents
      WHERE id = NEW.resident_id;

    INSERT INTO public.intakes (
      operator, owner_ref, material, gross_value, notes,
      lifecycle_status, acquired_at, lat, lng, photo_path, resident_id
    ) VALUES (
      'bounty-flow (auto)',
      COALESCE(v_resident_name, 'Unknown resident') ||
        ' (' || COALESCE(v_resident_wallet, 'no wallet') || ')',
      NEW.summary,
      NEW.accepted_value,
      'Created automatically from bounty completion, not manual operator entry. Source scan id: ' || NEW.id,
      'ACQUIRED',
      now(),
      NEW.pickup_lat,
      NEW.pickup_lng,
      NEW.pickup_photo_url,
      NEW.resident_id
    )
    RETURNING id, intake_number, created_at
      INTO v_intake_id, v_intake_number, v_intake_created_at;

    INSERT INTO public.passports (
      intake_id, intake_number, intake_created_at, intake_operator, intake_material,
      lifecycle_status, created_by, photo_url, resident_id
    ) VALUES (
      v_intake_id, v_intake_number, v_intake_created_at,
      'bounty-flow (auto)', NEW.summary,
      'CREATED', 'bounty-flow (auto)', NEW.pickup_photo_url, NEW.resident_id
    );
  END IF;

  RETURN NEW;
END;
$function$;
```

## 8. Pre-migration verification queries

Run these read-only queries immediately before applying any future migration.

### Confirm exact trigger attachment

```sql
SELECT
  t.relname AS table_name,
  tg.tgname AS trigger_name,
  pg_get_triggerdef(tg.oid, true) AS definition,
  p.proname AS function_name
FROM pg_trigger tg
JOIN pg_class t ON t.oid = tg.tgrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN pg_proc p ON p.oid = tg.tgfoid
WHERE n.nspname = 'public'
  AND NOT tg.tgisinternal
  AND t.relname IN ('scans', 'jobs', 'passports')
ORDER BY t.relname, tg.tgname;
```

### Capture current function definition and hash

```sql
SELECT
  p.oid::regprocedure AS function_signature,
  p.prosecdef AS security_definer,
  p.proacl,
  md5(pg_get_functiondef(p.oid)) AS definition_hash,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_intake_and_passport_on_bounty_completion';
```

### Confirm required columns and indexes

```sql
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'jobs' AND column_name IN ('id','scan_id','status','intake_id','passport_id'))
    OR (table_name = 'scans' AND column_name IN ('id','resident_id','bounty_status','accepted_value','driver_payout_cents'))
    OR (table_name = 'passports' AND column_name IN ('id','intake_id','resident_id'))
  )
ORDER BY table_name, ordinal_position;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('jobs','intakes','passports')
ORDER BY tablename, indexname;
```

### Identify already-affected job lifecycles without changing data

This detects the specific pair of job-created and legacy-created intake records by their verified note formats.

```sql
SELECT
  j.id AS job_id,
  j.scan_id,
  j.intake_id AS job_intake_id,
  ji.intake_number AS job_intake_number,
  li.id AS legacy_intake_id,
  li.intake_number AS legacy_intake_number,
  j.passport_id AS job_passport_id,
  lp.id AS legacy_passport_id
FROM public.jobs j
JOIN public.intakes ji ON ji.id = j.intake_id
JOIN public.intakes li
  ON li.notes = 'Created automatically from bounty completion, not manual operator entry. Source scan id: ' || j.scan_id
LEFT JOIN public.passports lp ON lp.intake_id = li.id
WHERE j.source_type = 'bounty'
  AND li.id <> j.intake_id
ORDER BY j.id;
```

The result is evidence only. Do not delete or merge rows as part of this migration.

### Record side-effect trigger definitions

```sql
SELECT
  tg.tgname,
  pg_get_triggerdef(tg.oid, true) AS definition
FROM pg_trigger tg
JOIN pg_class t ON t.oid = tg.tgrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'scans'
  AND NOT tg.tgisinternal
  AND tg.tgname IN (
    'credit_resident_wtwr_on_completion',
    'record_driver_payout_on_bounty_completion',
    'scans_bounty_transition_guard',
    'create_intake_passport_on_bounty_completion'
  )
ORDER BY tg.tgname;
```

## 9. Post-migration verification queries

### Confirm the compatibility guard exists

```sql
SELECT
  p.oid::regprocedure AS function_signature,
  p.prosecdef AS security_definer,
  p.proacl,
  position(
    'AND EXISTS (' IN pg_get_functiondef(p.oid)
  ) > 0 AS has_active_job_guard,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_intake_and_passport_on_bounty_completion';
```

### Confirm trigger and side-effect triggers remain attached

```sql
SELECT
  tg.tgname,
  pg_get_triggerdef(tg.oid, true) AS definition
FROM pg_trigger tg
JOIN pg_class t ON t.oid = tg.tgrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'scans'
  AND NOT tg.tgisinternal
  AND tg.tgname IN (
    'create_intake_passport_on_bounty_completion',
    'credit_resident_wtwr_on_completion',
    'record_driver_payout_on_bounty_completion',
    'scans_bounty_transition_guard',
    'trg_create_job_on_bounty_open'
  )
ORDER BY tg.tgname;
```

Expected: all five triggers remain.

### Confirm function grants did not change

```sql
SELECT
  p.oid::regprocedure AS function_signature,
  p.proacl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_intake_and_passport_on_bounty_completion';
```

### Verify a staging test job after execution

Supply a test job ID created by the regression harness; do not substitute a production job.

```sql
SELECT id, scan_id, status, intake_id, passport_id
FROM public.jobs
WHERE id = :test_job_id;

SELECT i.id, i.intake_number, i.operator, i.notes
FROM public.intakes i
WHERE i.id = (
  SELECT intake_id FROM public.jobs WHERE id = :test_job_id
);

SELECT p.id, p.passport_id, p.intake_id, p.created_by
FROM public.passports p
WHERE p.id = (
  SELECT passport_id FROM public.jobs WHERE id = :test_job_id
);

SELECT COUNT(*) AS legacy_intakes_for_scan
FROM public.intakes i
WHERE i.notes =
  'Created automatically from bounty completion, not manual operator entry. Source scan id: ' ||
  (SELECT scan_id FROM public.jobs WHERE id = :test_job_id);
```

Expected: one job-linked intake, one job-linked passport, and zero legacy intakes for the test scan.

## 10. Automated regression test

### Test environment

Run only against an isolated Supabase branch or staging project with Stripe in test mode. Use pre-provisioned test resident, verified-driver, and operator identities. Never run cleanup-capable test code against production.

The harness should use separate authenticated Supabase clients so RPC authorization and RLS are exercised. It should record all IDs it creates and clean up only its own tagged fixtures in the isolated environment.

### Test scenario

1. Record the resident's starting `wtwr_balance`.
2. Create a resident-owned test scan with a known positive `accepted_value` and required pickup evidence.
3. Open the bounty and assert exactly one active job exists for the scan.
4. As the verified driver, call:
   - `claim_job`
   - `job_mark_en_route`
   - `job_mark_arrived`
   - `job_record_scan` with a valid versioned grade payload
5. Snapshot intake and passport IDs/counts for the isolated resident fixture.
6. Call `job_create_intake` with positive weight and price.
7. Assert:
   - job status is `INTAKE`;
   - job has one non-null intake ID;
   - exactly one new intake was created for the fixture;
   - no intake with legacy `bounty-flow (auto)` notes exists for the scan;
   - scan status is `completed`;
   - scan `driver_payout_cents` equals `round(accepted_value * 0.10 * 100)`;
   - resident balance increased by `accepted_value * 0.40 * 100` exactly once;
   - one `INTAKE_LOGGED` job event exists for the job.
8. Retry `job_create_intake` and assert the RPC fails because the job is no longer `SCANNING`; assert intake count and wallet balance are unchanged.
9. Call `job_create_passport`.
10. Assert:
    - job status is `PASSPORT`;
    - job has one non-null passport ID;
    - exactly one new passport was created for the fixture;
    - it references `jobs.intake_id`;
    - exactly one `PASSPORT_CREATED` job event exists;
    - exactly one `PASSPORT_CREATED` passport event exists for that passport.
11. Retry `job_create_passport` and assert the RPC fails because the job is no longer `INTAKE`; assert passport and event counts are unchanged.
12. As an operator, move the surviving passport to `GRADED` using the authorized staging path.
13. Assert exactly one token reserve event exists for that passport and its resident/driver/treasury shares correspond to the verified live formula.
14. Call `create_listing_from_job` and assert exactly one manifest and one active listing are associated with the job passport; retry and assert the existing listing is returned without duplication.

### Example assertion skeleton

The project currently has no test framework. This is framework-neutral pseudocode for the first harness implementation:

```js
const before = await snapshotFixture(fixture);

await driver.rpc('claim_job', { p_job_id: jobId });
await driver.rpc('job_mark_en_route', { p_job_id: jobId });
await driver.rpc('job_mark_arrived', { p_job_id: jobId });
await driver.rpc('job_record_scan', {
  p_job_id: jobId,
  p_ai_grade: validGrade
});

await driver.rpc('job_create_intake', {
  p_job_id: jobId,
  p_weight_lb: 10,
  p_price_per_lb: 1
});

let afterIntake = await snapshotFixture(fixture);
assert.equal(afterIntake.intakeCount - before.intakeCount, 1);
assert.equal(afterIntake.legacyIntakesForScan, 0);
assert.equal(afterIntake.job.status, 'INTAKE');
assert.ok(afterIntake.job.intake_id);
assert.equal(afterIntake.scan.bounty_status, 'completed');
assert.equal(afterIntake.walletDelta, acceptedValue * 0.40 * 100);
assert.equal(afterIntake.scan.driver_payout_cents,
  Math.round(acceptedValue * 0.10 * 100));
assert.equal(afterIntake.jobEvents.INTAKE_LOGGED, 1);

await assertRpcRejects(
  driver.rpc('job_create_intake', {
    p_job_id: jobId,
    p_weight_lb: 10,
    p_price_per_lb: 1
  }),
  /not SCANNING/i
);
assert.deepEqual(await intakeIdentitySnapshot(fixture),
  afterIntake.intakeIdentitySnapshot);

await driver.rpc('job_create_passport', { p_job_id: jobId });

const afterPassport = await snapshotFixture(fixture);
assert.equal(afterPassport.passportCount - before.passportCount, 1);
assert.equal(afterPassport.job.status, 'PASSPORT');
assert.equal(afterPassport.passport.intake_id,
  afterPassport.job.intake_id);
assert.equal(afterPassport.jobEvents.PASSPORT_CREATED, 1);
assert.equal(afterPassport.passportEvents.PASSPORT_CREATED, 1);

await assertRpcRejects(
  driver.rpc('job_create_passport', { p_job_id: jobId }),
  /not INTAKE/i
);
assert.deepEqual(await passportIdentitySnapshot(fixture),
  afterPassport.passportIdentitySnapshot);
```

### Required pass criteria

- One job creates exactly one intake.
- One job creates exactly one passport.
- Failed retries change no intake, passport, event, wallet, or payout state.
- Wallet credit occurs exactly once.
- Driver payout accrual occurs exactly once and remains unpaid until the payment API acts.
- Job and passport events occur exactly once for their corresponding transitions.
- Grading the one surviving passport produces one token reserve event.
- Marketplace creation uses the job passport and does not duplicate manifest/listing records on retry.

## Recommendation

Adopt Approach A as the smallest safe migration after the regression harness is implemented on a Supabase branch and the pre-migration queries match this plan. Do not combine this change with cleanup of existing duplicates, grant hardening, payout idempotency, or legacy trigger removal. Those are separate reviewable changes with different rollback risks.
