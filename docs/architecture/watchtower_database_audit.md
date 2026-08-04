# Watchtower Protocol — Complete Database & Application Audit

Project ref: `eypovuxuddiqgncjdpkq` (Supabase, region ca-central-1, Postgres 17.6.1)

Read-only audit. No policies, tables, schema, or data were modified in the course of producing this report.

---

## Part 1 — Full Table Inventory (public schema)

All tables have RLS **enabled**.

### public.residents
| Column | Type | Nullable/Default |
|---|---|---|
| id | uuid | default gen_random_uuid() |
| name | text | |
| email | text | nullable |
| address | text | nullable |
| zip | text | nullable |
| wallet_id | text | unique |
| subscriber | boolean | nullable, default false |
| wtwr_balance | numeric | nullable, default 0 |
| created_at | timestamptz | nullable, default now() |

Primary key: `id`. Referenced by: `materials.resident_id`, `tickets.resident_id`.

### public.tickets
| Column | Type | Nullable/Default |
|---|---|---|
| id | text | |
| resident_id | uuid | nullable |
| material | text | nullable |
| qty | numeric | nullable |
| unit | text | nullable |
| resident_wtwr | numeric | nullable, default 0 |
| status | text | default 'pending' |
| driver_id | text | nullable |
| claimed_at | timestamptz | nullable |
| delivered_at | timestamptz | nullable |
| created_at | timestamptz | nullable, default now() |
| notes | text | nullable |
| src | text | nullable, default 'resident' |
| driver_wtwr | numeric | nullable, default 0 |
| platform_revenue_usd | numeric | nullable, default 0 |
| lat | numeric | nullable |
| lng | numeric | nullable |

Primary key: `id`. FK: `resident_id` → `residents.id`.

### public.materials
| Column | Type | Nullable/Default |
|---|---|---|
| id | uuid | default gen_random_uuid() |
| resident_id | uuid | nullable |
| photo_url | text | nullable |
| description | text | nullable |
| category | text | nullable |
| estimated_value | numeric | nullable |
| status | text | nullable, default 'logged' |
| created_at | timestamptz | nullable, default now() |

Primary key: `id`. FK: `resident_id` → `residents.id`. Referenced by: `transactions.material_id` (legacy relationship — see Part 4).

### public.transactions
| Column | Type | Nullable/Default |
|---|---|---|
| id | uuid | default gen_random_uuid() |
| material_id | uuid | nullable |
| pickup_status | text | nullable, default 'pending' |
| final_value | numeric | nullable |
| reward_amount | numeric | nullable |
| created_at | timestamptz | nullable, default now() |

Primary key: `id`. FK: `material_id` → `materials.id`. Row count: 0.

### public.businesses
| Column | Type | Nullable/Default |
|---|---|---|
| id | uuid | default extensions.uuid_generate_v4() |
| auth_id | uuid | nullable |
| business_name | text | |
| tier | text | check: tier IN ('Signal','Enforcer','Sentinel') |
| disposal_cost_saved | numeric | nullable, default 0.00 |
| wtwr_redeemed | numeric | nullable, default 0.00 |
| created_at | timestamptz | nullable, default timezone('utc', now()) |

Primary key: `id`. FK: `auth_id` → `auth.users.id`. Referenced by: `redemptions.business_id`.
No `name` column, no `multiplier` column (see Part 4/5).

### public.redemptions
| Column | Type | Nullable/Default |
|---|---|---|
| id | uuid | default extensions.uuid_generate_v4() |
| business_id | uuid | nullable |
| resident_id | text | |
| wtwr_amount | numeric | |
| usd_value | numeric | |
| created_at | timestamptz | nullable, default timezone('utc', now()) |

Primary key: `id`. FK: `business_id` → `businesses.id`. **No FK on resident_id** (see Part 4). Row count: 0.

### public.scans
| Column | Type | Nullable/Default |
|---|---|---|
| id | uuid | default gen_random_uuid() |
| created_at | timestamptz | default now() |
| session_id | text | nullable |
| summary | text | nullable |
| items_seen | jsonb | nullable |
| est_low | numeric | nullable |
| est_high | numeric | nullable |
| coaching_tip | text | nullable |
| safety_warning | text | nullable |

Primary key: `id`. No foreign keys.

### public.intakes
| Column | Type | Nullable/Default |
|---|---|---|
| id | uuid | default gen_random_uuid() |
| created_at | timestamptz | default now() |
| operator | text | nullable |
| resident_ref | text | nullable |
| material | text | nullable |
| grade | text | nullable |
| confidence | text | nullable |
| contamination | text | nullable |
| notes | text | nullable |
| weight_lb | numeric | nullable |
| price_per_lb | numeric | nullable |
| gross_value | numeric | nullable |
| resident_wtwr | numeric | nullable |

Primary key: `id`. No foreign keys.

### public.manifests
| Column | Type | Nullable/Default |
|---|---|---|
| id | bigint | default nextval('manifests_id_seq') |
| manifest_id | text | nullable, unique |
| source | text | |
| description | text | |
| estimated_units | numeric | nullable |
| estimated_weight | numeric | nullable |
| estimated_recovery_value | numeric | nullable |
| pickup_cost | numeric | nullable |
| labor_cost | numeric | nullable |
| ai_confidence | numeric | nullable |
| opportunity_score | numeric | nullable |
| risk_flags | text[] | nullable, default '{}' |
| status | text | default 'REVIEWING' |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

Primary key: `id`. Referenced by: `manifest_decisions.manifest_id` → `manifests.id`, `manifest_events.manifest_id` → `manifests.id`, `dispatch_stops.manifest_id` → `manifests.manifest_id` (mismatched target — see Part 4).

### public.manifest_decisions
| Column | Type | Nullable/Default |
|---|---|---|
| id | bigint | default nextval('manifest_decisions_id_seq') |
| manifest_id | bigint | nullable |
| decision | text | |
| reason_code | text | nullable |
| operator_notes | text | nullable |
| operator_name | text | nullable |
| decided_at | timestamptz | default now() |

Primary key: `id`. FK: `manifest_id` → `manifests.id`.

### public.manifest_events
| Column | Type | Nullable/Default |
|---|---|---|
| id | bigint | default nextval('manifest_events_id_seq') |
| manifest_id | bigint | nullable |
| event_type | text | |
| payload | jsonb | nullable |
| created_at | timestamptz | default now() |

Primary key: `id`. FK: `manifest_id` → `manifests.id`.

### public.passports
| Column | Type | Nullable/Default |
|---|---|---|
| id | bigint | default nextval('passports_id_seq') |
| passport_id | text | nullable, unique |
| manufacturer | text | nullable |
| model | text | nullable |
| serial | text | nullable |
| asset_tag | text | nullable |
| incoming_weight | numeric | nullable |
| photo_url | text | nullable |
| disposition | text | default 'REUSE' |
| status | text | default 'received' |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

Primary key: `id`. Referenced by: `materials_recovered.passport_id`.

### public.materials_recovered
| Column | Type | Nullable/Default |
|---|---|---|
| id | bigint | default nextval('materials_recovered_id_seq') |
| passport_id | bigint | nullable |
| material_name | text | |
| quantity | numeric | nullable |
| unit | text | nullable |
| sale_value_estimate | numeric | nullable |
| sale_status | text | default 'pending' |
| created_at | timestamptz | default now() |

Primary key: `id`. FK: `passport_id` → `passports.id`.

### public.dispatch_runs
| Column | Type | Nullable/Default |
|---|---|---|
| id | bigint | default nextval('dispatch_runs_id_seq') |
| driver_name | text | |
| vehicle_name | text | |
| scheduled_at | timestamptz | nullable |
| manifest_ids | text[] | nullable, default '{}' |
| status | text | default 'queued' |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |
| completed_at | timestamptz | nullable |
| completed_by | text | nullable |

Primary key: `id`. `manifest_ids` is an unconstrained text array — no FK, nothing enforces the values correspond to real manifests. Referenced by: `dispatch_stops.run_id`.

### public.dispatch_stops
| Column | Type | Nullable/Default |
|---|---|---|
| id | uuid | default gen_random_uuid() |
| run_id | bigint | nullable |
| manifest_id | text | nullable |
| stop_order | integer | |
| arrival_window | text | nullable |
| status | text | default 'WAITING' |
| completed_at | timestamp (no tz) | nullable |
| created_at | timestamp (no tz) | default now() |

Primary key: `id`. FK: `run_id` → `dispatch_runs.id`. FK: `manifest_id` → `manifests.manifest_id` (mismatched — see Part 4).

---

## Part 2 — RLS Policy Audit

All tables have RLS **enabled**. Below is every existing policy, and every command with no policy is called out explicitly.

### TABLE: public.intakes
RLS enabled: true

ROLE: anon, authenticated
- SELECT: **NO POLICY EXISTS**
- INSERT: `operator can record intake` — USING: null, WITH CHECK: true
- UPDATE: **NO POLICY EXISTS**
- DELETE: **NO POLICY EXISTS**

Impact: intake.html can insert a record but the read-back at intake.html:309-311 fails — the recent-records list never populates.

### TABLE: public.manifests
RLS enabled: true

ROLE: anon
- SELECT: **NO POLICY EXISTS**
- INSERT: **NO POLICY EXISTS**
- UPDATE: **NO POLICY EXISTS**
- DELETE: **NO POLICY EXISTS**

ROLE: authenticated
- SELECT: **NO POLICY EXISTS**
- INSERT: **NO POLICY EXISTS**
- UPDATE: **NO POLICY EXISTS**
- DELETE: **NO POLICY EXISTS**

Zero rows in `pg_policies` for this table, any role, any command. RLS enabled + no policy = deny-all. Only `service_role` (which bypasses RLS) can reach this table. This completely blocks `operations/manifest.html` / `ops.js` (createManifest, loadReviewQueue, approveManifest, savePassDecision, reconcile view, learning view) and `operations/dispatch.js` (loadDispatchQueue).

### TABLE: public.manifest_decisions
RLS enabled: true. **Zero policies for any role/command.** Blocks approveManifest/savePassDecision writes in ops.js.

### TABLE: public.manifest_events
RLS enabled: true. **Zero policies for any role/command.** Blocks the audit-trail writes in ops.js, dispatch.js, and driver.js.

### TABLE: public.passports
RLS enabled: true. **Zero policies for any role/command.** Blocks createPassport and the passport dropdown in ops.js.

### TABLE: public.materials_recovered
RLS enabled: true. **Zero policies for any role/command.** Blocks createMaterial and the recovered-material dropdown in ops.js.

### TABLE: public.dispatch_runs
RLS enabled: true

ROLE: anon
- SELECT: `Allow dispatch stops read` — USING: true
- INSERT: `Allow dispatch stops insert` — WITH CHECK: true
- UPDATE: `Allow dispatch stops update` — USING: true, WITH CHECK: true
- DELETE: **NO POLICY EXISTS**

ROLE: authenticated
- SELECT/INSERT/UPDATE/DELETE: **NO POLICY EXISTS**

Note: policy names are copy-pasted from `dispatch_stops` (naming bug, not a functional bug).

### TABLE: public.dispatch_stops
RLS enabled: true

ROLE: anon
- SELECT: `Allow dispatch stops read` — USING: true
- INSERT: `Allow dispatch stops insert` — WITH CHECK: true
- UPDATE: `allow for update` — USING: true, WITH CHECK: true
- DELETE: **NO POLICY EXISTS**

ROLE: authenticated
- SELECT/INSERT/UPDATE/DELETE: **NO POLICY EXISTS**

### TABLE: public.transactions
RLS enabled: true

ROLE: public (applies to every role, including anon and authenticated)
- SELECT / INSERT / UPDATE / DELETE: `open transactions` — cmd: ALL, USING: true, WITH CHECK: true

Fully open, no restriction, to any caller including unauthenticated `anon`.

### Table grants (information_schema.table_privileges)
Checked for intakes, manifests, dispatch_runs, dispatch_stops, transactions: `anon`, `authenticated`, and `service_role` all hold full GRANT (SELECT/INSERT/UPDATE/DELETE/REFERENCES/TRIGGER/TRUNCATE) at the table-privilege level for all five tables. This is irrelevant to the deny-all findings above — RLS policy (or absence of one) is what actually gates access; grants only set the ceiling.

---

## Part 3 — Frontend Supabase Call Inventory

All pages connect using the same anon/publishable key (`sb_publishable_ZlykauNc-...` / equivalent anon JWT). No page uses a service-role key.

### operations/ops.js (loaded by operations/manifest.html)
```
LINE 47   TABLE manifests            INSERT  {source, description, estimated_units, estimated_weight,
                                               estimated_recovery_value, pickup_cost, labor_cost,
                                               ai_confidence, opportunity_score, risk_flags, status:'REVIEWING'}
LINE 61   TABLE manifests            SELECT  * .eq(status,'REVIEWING')
LINE 120  TABLE manifests            SELECT  id, source, description, estimated_recovery_value, status
LINE 144  TABLE manifest_decisions   INSERT  {manifest_id, decision:'approve', reason_code:'approved', operator_notes}
LINE 155  TABLE manifests            UPDATE  {status:'APPROVED'} .eq(id, manifestId)
LINE 161  TABLE manifest_events      INSERT  {manifest_id, event_type:'approved', payload:{action:'approved'}}
LINE 197  TABLE manifest_decisions   INSERT  {manifest_id, decision:'pass', reason_code, operator_notes:notes}
LINE 208  TABLE manifests            UPDATE  {status:'PASSED'} .eq(id, activePassManifestId)
LINE 214  TABLE manifest_events      INSERT  {manifest_id, event_type:'passed', payload:{reason_code, notes}}
LINE 238  TABLE passports            SELECT  id, manufacturer, model
LINE 245  TABLE materials_recovered  SELECT  id, material_name
LINE 255  TABLE manifests            SELECT  * (reconcile view)
LINE 328  TABLE manifests            SELECT  * (learning view)
LINE 386  TABLE passports            INSERT  {manufacturer, model, serial, asset_tag, incoming_weight, photo_url, disposition, status:'received'}
LINE 413  TABLE materials_recovered  INSERT  {passport_id, material_name, quantity, unit, sale_value_estimate, sale_status:'pending'}
LINE 438  TABLE transactions         INSERT  {material_id, buyer, sale_price, date_sold}
```

### intake.html
```
LINE 290  TABLE intakes   INSERT  {operator, material, weight_lb, resident_wtwr, notes}
LINE 309  TABLE intakes   SELECT  * .order(created_at desc) .limit(10)
```

### operator.html
```
LINE 248  TABLE intakes   INSERT  {operator, material, grade, confidence, contamination, notes,
                                   weight_lb, price_per_lb, gross_value, resident_wtwr}
```

### terminal.html
```
LINE 640   TABLE tickets       SELECT  *, residents(wallet_id, name)
LINE 661   TABLE redemptions   SELECT  *, businesses(name), residents(wallet_id)
LINE 669   TABLE businesses    SELECT  * .order(name)
LINE 679   TABLE residents     SELECT  * .eq(wallet_id)
LINE 798   TABLE tickets       INSERT  {id, resident_id, material, qty, unit, resident_wtwr, driver_wtwr,
                                        platform_revenue_usd, status:'pending', src, notes}
LINE 863   TABLE tickets       UPDATE  {status:'dispatched'}
LINE 870   TABLE tickets       UPDATE  {status:'rejected'}
LINE 998   TABLE tickets       UPDATE  {claimed_at, driver_id}
LINE 1012  TABLE tickets       UPDATE  {status:'approved', qty, delivered_at}
LINE 1019  TABLE residents     SELECT  wtwr_balance .eq(id)
LINE 1022  TABLE residents     UPDATE  {wtwr_balance}
LINE 1059  TABLE redemptions   INSERT  {resident_id, business_id, wtwr_amount, usd_value}
LINE 1065  TABLE residents     UPDATE  {wtwr_balance}
```

### operations/dispatch.js (supporting context for the Dispatch step)
```
LINE 38   TABLE manifests        SELECT  * .eq(status,'APPROVED')
LINE 95   TABLE dispatch_stops   SELECT  * .eq(run_id)
LINE 132  TABLE dispatch_stops   INSERT  [{run_id, manifest_id, stop_order, status:'WAITING', arrival_window:null}, ...]
LINE 144  TABLE dispatch_runs    SELECT  * .order(scheduled_at)
LINE 195  TABLE dispatch_runs    UPDATE  {status, updated_at}
LINE 205  TABLE dispatch_stops   UPDATE  {status:'WAITING'} .eq(run_id)
LINE 219  TABLE dispatch_runs    SELECT  * .eq(id) .single()
LINE 225  TABLE dispatch_stops   SELECT  * .eq(run_id)
LINE 232  TABLE dispatch_runs    UPDATE  {status:'COMPLETED', completed_at, completed_by:'dispatcher'}
LINE 244  TABLE manifests        UPDATE  {status:'COMPLETED'} .in(manifest_id, manifestIds)
LINE 256  TABLE manifest_events  INSERT  [{manifest_id, event_type:'pickup_completed', payload}, ...]
LINE 285  TABLE dispatch_runs    INSERT  {driver_name, vehicle_name, scheduled_at, manifest_ids, status:'QUEUED'}
LINE 307  TABLE dispatch_stops   INSERT  [{run_id, manifest_id, stop_order, status:'WAITING', arrival_window:null}, ...]
```

### operations/driver.js (supporting context for the Dispatch step)
```
LINE 26   TABLE dispatch_runs    SELECT  * .in(status,['ASSIGNED','ACTIVE']) .limit(1)
LINE 44   TABLE dispatch_stops   SELECT  * .eq(run_id) .order(stop_order)
LINE 77   TABLE manifests        SELECT  * .eq(manifest_id, stop.manifest_id) .maybeSingle()
LINE 120  TABLE dispatch_stops   UPDATE  {status}
LINE 129  TABLE dispatch_stops   UPDATE  {status:'COMPLETED', completed_at}
LINE 139  TABLE dispatch_stops   SELECT  * .eq(run_id)
LINE 147  TABLE dispatch_stops   SELECT  * .eq(run_id)
LINE 149  TABLE dispatch_runs    UPDATE  {status:'COMPLETED', completed_at, completed_by:'driver'}
LINE 151  TABLE manifests        UPDATE  {status:'COMPLETED'} .in(manifest_id, manifestIds)
LINE 157  TABLE manifest_events  INSERT  [{manifest_id, event_type:'pickup_completed', payload}, ...]
```

---

## Part 4 — Schema Compatibility Findings

### transactions (ops.js:438) — hard failure
Sent: `material_id`, `buyer`, `sale_price`, `date_sold`.
- `material_id`: column exists (uuid), but its FK points at `public.materials.id`, not `materials_recovered.id` — the table the operations UI actually populates and sources this ID from (materials_recovered has a **bigint** PK, not uuid — a type mismatch on top of the wrong target).
- `buyer`: **does not exist** on `public.transactions`.
- `sale_price`: **does not exist**.
- `date_sold`: **does not exist**.

Result: insert fails outright — PostgREST returns a schema-cache error (`Could not find the 'buyer' column of 'transactions'`) before RLS is even evaluated. The real columns (`pickup_status`, `final_value`, `reward_amount`) aren't mapped to by the form at all.

### businesses (terminal.html reads)
- `b.name` referenced — **does not exist**; actual column is `business_name`.
- `b.multiplier` referenced — **does not exist at all**, no multiplier column on the table.

Result: not a thrown error (PostgREST returns `*`, JS just reads `undefined`), but every UI label showing a business name renders `undefined`, and every redemption multiplier silently falls back to `1` (`parseFloat(undefined) || 1`) instead of the intended tier-based multiplier — a silent pricing bug.

### manifests (ops.js:47, insert)
`manifest_id` (text, unique, nullable) is never set by `createManifest`. Every manifest is created with `manifest_id = NULL`. This is the column `dispatch_stops.manifest_id` has its foreign key against (not `manifests.id`) — root cause of the Dispatch break (see Part 5).

### intakes, tickets, passports, materials_recovered
All sent columns exist and type-match. No issues found in these payloads.

---

## Part 5 — Workflow Trace

```
STEP: INTAKE
PAGE: intake.html, operator.html
TABLE: public.intakes
READ: intake.html (SELECT * limit 10)
WRITE: both pages (INSERT)
RLS: INSERT-only for anon+authenticated; no SELECT policy
BLOCKER: intake.html's own read-back fails — operator can submit but never sees the confirmation list.

STEP: REVIEW QUEUE
PAGE: operations/manifest.html (ops.js: loadReviewQueue / approveManifest / savePassDecision)
TABLE: public.manifests, public.manifest_decisions, public.manifest_events
READ: manifests (status='REVIEWING')
WRITE: manifests (status update), manifest_decisions (insert), manifest_events (insert)
RLS: zero policies on all three tables — full deny for anon/authenticated
BLOCKER: entire step non-functional; every read/write fails at the RLS layer regardless of payload correctness.

STEP: MANIFEST (creation)
PAGE: operations/manifest.html (ops.js: createManifest)
TABLE: public.manifests
WRITE: INSERT (manifest_id column never populated)
RLS: deny-all
BLOCKER: (1) RLS blocks the insert entirely; (2) even if RLS were fixed, manifest_id is left NULL, which breaks Dispatch.

STEP: DISPATCH
PAGE: operations/dispatch.html (dispatch.js), operations/driver.html (driver.js)
TABLE: public.dispatch_runs, public.dispatch_stops, public.manifests
READ: dispatch_runs, dispatch_stops, manifests (by manifest_id)
WRITE: dispatch_runs (insert/update), dispatch_stops (insert/update), manifests (update by manifest_id), manifest_events (insert)
RLS: dispatch_runs/dispatch_stops open for anon; manifests deny-all
BLOCKER: dispatch_stops.manifest_id has a foreign key to manifests.manifest_id (always NULL). The frontend fills manifest_id with manifests.id (bigint) cast to string via a `manifest.manifest_id || manifest.id` fallback. That value never matches manifests.manifest_id, so the INSERT into dispatch_stops violates the FK constraint and fails outright. Even where inserts survive, `.in('manifest_id', manifestIds)` filters against the same always-null column and silently update zero rows.

STEP: RECOVERY
PAGE: operations/manifest.html (ops.js: createPassport / createMaterial)
TABLE: public.passports, public.materials_recovered
RLS: zero policies — deny-all
BLOCKER: entire step non-functional at the RLS layer.

STEP: LEDGER
PAGE: terminal.html (renderLedger, confirmDelivery)
TABLE: public.tickets, public.residents
READ: tickets (joined with residents)
WRITE: tickets (status/qty/delivered_at), residents (wtwr_balance)
BLOCKER: none found beyond whatever tickets/residents RLS coverage already exists; this step runs on a completely separate pipeline from manifests/dispatch_runs (see architectural note below).

STEP: MARKETPLACE
PAGE: terminal.html (Cashier: calcRedeem / processRedeem)
TABLE: public.redemptions, public.businesses, public.residents
READ: businesses (wrong column names: b.name / b.multiplier don't exist), redemptions (joined with businesses + residents)
WRITE: redemptions (insert), residents (wtwr_balance update)
BLOCKER: businesses.name / businesses.multiplier don't exist → wrong redemption pricing (multiplier silently defaults to 1x) and blank business names in the UI. The redemptions→residents embedded select has no FK backing it (see Part 6) and will error.
```

**Architectural observation:** the application runs two parallel, disconnected pipelines that both claim pieces of "dispatch/ledger": (1) `tickets` + `residents` + `redemptions` + `businesses`, driven entirely by `terminal.html` — a self-contained resident/marketplace loop; and (2) `manifests` + `manifest_decisions`/`manifest_events` + `dispatch_runs`/`dispatch_stops` + `passports`/`materials_recovered`, driven by the `operations/*` pages — the B2B/bulk recovery loop that the named workflow (Intake→Review Queue→Manifest→Dispatch→Recovery→Ledger→Marketplace) actually describes. These two pipelines never intersect anywhere in the schema — there is no FK or shared key linking a `tickets` row to a `manifests` row.

---

## Part 6 — Relationship Audit

| Table | ID column(s) | Type | FK target | Issue |
|---|---|---|---|---|
| manifests | id (PK) | bigint | — | autoincrement, treated as canonical everywhere in ops.js |
| manifests | manifest_id | text, unique, nullable | — | never populated by any insert path in this codebase |
| manifest_decisions | manifest_id | bigint | → manifests.id | consistent — matches how ops.js uses it |
| manifest_events | manifest_id | bigint | → manifests.id | consistent when written from ops.js; inconsistent in practice when written from dispatch.js/driver.js (values sourced from the never-populated manifest_id chain) |
| dispatch_stops | manifest_id | text | → manifests.manifest_id | mismatched — the only FK in the schema pointing at the text manifest_id column instead of the bigint id PK |
| dispatch_runs | manifest_ids | text[] | none | unconstrained; nothing stops a run from referencing manifests that don't exist |
| passports | id (PK) | bigint | — | |
| materials_recovered | passport_id | bigint | → passports.id | consistent |
| transactions | material_id | uuid | → public.materials.id | points at the legacy materials table, not materials_recovered — but the frontend sources this ID from materials_recovered (bigint PK), so there's both a wrong-target and a type mismatch |
| redemptions | resident_id | text | none | residents.id is uuid; no FK exists between redemptions.resident_id and residents.id, yet terminal.html embeds residents(wallet_id) off of it — PostgREST embedding requires a real relationship; this will error |
| redemptions | business_id | uuid | → businesses.id | consistent |
| tickets | resident_id | uuid | → residents.id | consistent |
| tickets | id | text (client-generated TKT-...) | — | fine, self-consistent, not referenced elsewhere |

**Summary of ID-format problems:**
1. `manifests` has two identity columns and the codebase is inconsistent about which is canonical.
2. `transactions.material_id` (uuid, FK→materials) doesn't line up with the bigint-keyed `materials_recovered` table the operations UI actually populates.
3. `redemptions.resident_id` is untyped text with no FK, the only resident reference in the schema that isn't a uuid FK to residents.id — breaks the embedded-select syntax terminal.html relies on.

---

## Part 7 — Code-Level Failure Predictions

```
ERROR: RLS denial (PostgREST 42501-equivalent) on every manifests/manifest_decisions/manifest_events/passports/materials_recovered call
WHERE: operations/manifest.html — createManifest, loadReviewQueue, approveManifest, savePassDecision, createPassport, createMaterial
WHY: RLS enabled, zero policies
SEVERITY: Critical — blocks Review Queue, Manifest, and Recovery steps entirely

ERROR: PGRST204 "Could not find the 'buyer' column of 'transactions' in the schema cache"
WHERE: operations/ops.js:438, createTransaction
WHY: payload uses buyer/sale_price/date_sold, none of which exist on public.transactions
SEVERITY: Critical — Ledger sale-recording is broken independent of RLS

ERROR: Foreign key violation on dispatch_stops_manifest_id_fkey
WHERE: operations/dispatch.js:307 (createDispatchRun) and :132 (ensureStopsForRun)
WHY: manifest_id values passed in are really manifests.id (bigint) cast to string; FK target is manifests.manifest_id, always NULL
SEVERITY: Critical — a dispatch_runs row gets created, then the next insert (dispatch_stops) fails, leaving an orphaned run with zero stops

ERROR: Silent no-op update (0 rows affected, no thrown error)
WHERE: operations/dispatch.js:244 and driver.js:151 — .update({status:'COMPLETED'}).in('manifest_id', manifestIds)
WHY: manifestIds are bigint ids as strings; manifests.manifest_id (the filtered column) is NULL for every row, so .in() matches nothing
SEVERITY: High — operator/driver believes the route completed and the manifest closed out; it silently doesn't

ERROR: "Manifest unavailable" shown for every stop card
WHERE: driver.js:77 — .from('manifests').select('*').eq('manifest_id', stop.manifest_id).maybeSingle()
WHY: same manifest_id/id conflation — lookup always returns null
SEVERITY: High — driver view unusable even once dispatch_stops rows exist

ERROR: PGRST200 "Could not find a relationship between 'redemptions' and 'residents' in the schema cache"
WHERE: terminal.html:661 — refreshRedemptions embedded select
WHY: no FK exists between redemptions.resident_id (text) and residents.id (uuid)
SEVERITY: High — breaks the redemption history view in the Marketplace/Cashier tab

ERROR: undefined business name / NaN→1x multiplier in Cashier UI
WHERE: terminal.html:665/674/1036/1049
WHY: businesses.name and businesses.multiplier don't exist
SEVERITY: Medium — not a crash, but redemptions silently price at the wrong multiplier — a financial-correctness bug

ERROR: Read-back returns nothing / blank recent-records table
WHERE: intake.html:309
WHY: no SELECT policy on public.intakes
SEVERITY: Medium — cosmetic from the operator's point of view (the insert itself works), but looks broken
```

---

## Part 8 — Final Summary

**A. Confirmed blockers**
1. `manifests`, `manifest_decisions`, `manifest_events`, `passports`, `materials_recovered` — zero RLS policies, fully deny-all. Kills Review Queue, Manifest creation, and Recovery.
2. `transactions` insert payload (`buyer`, `sale_price`, `date_sold`) references columns that don't exist on the table at all.
3. `dispatch_stops` FK is wired to `manifests.manifest_id` (never populated), while the rest of the app treats `manifests.id` as canonical — breaks route creation via FK violation.
4. `redemptions` has no FK to `residents`, but `terminal.html` performs a PostgREST embedded select assuming one exists.

**B. Likely blockers**
5. `businesses.name` / `businesses.multiplier` don't exist (real: `business_name`, no multiplier column) — silently wrong pricing/labels rather than a hard error.
6. `intakes` has no SELECT policy — insert succeeds, read-back UI shows nothing.
7. `transactions.material_id` FK points at the legacy `public.materials` table, not `materials_recovered`, which is what the operations UI actually populates — a type mismatch (uuid vs bigint) on top of the wrong target.

**C. Non-blocking issues**
8. `dispatch_runs`/`dispatch_stops` policies exist only for role `anon`, not `authenticated` — irrelevant today since the app never signs users in, but would silently break if auth is ever added.
9. Two independent, non-intersecting pipelines exist in the same schema (`tickets`/`residents`/`redemptions`/`businesses` vs. `manifests`/`dispatch_*`/`passports`/`materials_recovered`) — a duplicated-responsibility design smell worth a deliberate decision (merge, or clearly separate as "consumer" vs "B2B" tracks).
10. Cosmetic-only: policy names on `dispatch_runs` are copy-pasted from `dispatch_stops` ("Allow dispatch stops insert/read"), confusing during future maintenance but not functionally wrong.

**D. Recommended order of fixes**
1. Resolve the `manifests.id` vs `manifests.manifest_id` identity conflict — decide on one canonical key and make every table's FK and every frontend reference agree on it. This one decision fixes the Dispatch break, the driver view, and the route-completion no-ops all at once.
2. Fix the `transactions` table/payload mismatch (columns + correct FK target for the "materials" concept it should reference) — the Ledger sale-recording step is dead code otherwise.
3. Add RLS policies for `manifests`, `manifest_decisions`, `manifest_events`, `passports`, `materials_recovered`, and a SELECT policy for `intakes` — everything upstream of this is irrelevant to operators until they can actually reach the tables.
4. Fix `redemptions.resident_id` (type + FK) so the embedded select in `terminal.html` resolves.
5. Fix `businesses.name`/`multiplier` column references (either add the columns or fix the frontend to use `business_name` and a real tier→multiplier mapping).
6. Decide whether the `tickets`-based pipeline and the `manifests`-based pipeline are meant to converge, or document that they're intentionally separate tracks.

No SQL, migrations, policies, or data were touched in the course of this audit.
