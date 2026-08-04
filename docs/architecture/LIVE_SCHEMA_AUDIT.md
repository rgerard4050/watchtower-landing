# Watchtower Live Supabase Schema Audit

Audit date: 2026-08-04  
Project: `eypovuxuddiqgncjdpkq`  
Scope: Phase 0, read-only catalog and repository inspection

## Evidence labels

- **Verified live** — returned by read-only queries against the connected Supabase project's `pg_catalog`, `information_schema`, or `supabase_migrations.schema_migrations`.
- **Repository intent** — present in application code or `supabase/migrations/`, but not proof of deployment.
- **Unresolved** — not established by the available catalog, repository, or deployment access.

No schema, data, policy, function, trigger, grant, migration, or application change was made during this audit.

## Executive findings

1. **Verified live:** the remote migration ledger contains 75 records, while `supabase/migrations/` contains 37 files. Only three versions match exactly.
2. **Verified live:** all nine requested tables exist and have RLS enabled.
3. **Verified live:** `jobs.status` and `scans.bounty_status` are both active workflow state. `claim_job`, `job_create_intake`, and `cancel_job` synchronize selected transitions across both tables.
4. **Verified live:** opening a scan bounty creates a job through `trg_create_job_on_bounty_open` and `create_job_on_bounty_open()`.
5. **Verified live, critical:** the newer job intake flow and the older scan-completion bridge are both active. For a resident-backed job, `job_create_intake()` creates one intake, then its update of `scans.bounty_status` to `completed` fires `create_intake_and_passport_on_bounty_completion()`, which creates a second intake and a passport. `job_create_passport()` can subsequently create another passport.
6. **Verified live:** no unique constraint prevents multiple passports for one intake, and no scan reference or uniqueness constraint on `intakes` prevents the duplicate intake described above.
7. **Verified live:** one active job per scan and one active listing per passport are protected by partial unique indexes. Offer acceptance is limited to one accepted offer per listing by another partial unique index.
8. **Verified live:** `create_listing_from_job()` still creates a manifest when needed because `material_listings.manifest_id` is non-null and foreign-keyed to `manifests(id)`.
9. **Verified live:** base table privileges are broadly granted to `anon`, `authenticated`, and `service_role`; RLS is therefore the effective restriction for browser roles.
10. **Verified live:** job workflow RPCs are executable only by `authenticated`; marketplace acceptance and completion RPCs are executable only by `service_role` among the three application roles checked.

## 1. Migration ledger divergence

### Verified live ledger

- Remote records: **75**
- First version: `20260718090000`
- Last version: `20260728190601`
- Local files in `supabase/migrations/`: **37**

Exact version matches:

| Version | Name |
|---|---|
| `20260718090000` | `fix_manifest_identity` |
| `20260718090100` | `fix_rls_policies` |
| `20260718090200` | `fix_dispatch_manifest_relationship` |

The remaining 34 local versions are not present under the same version in the live ledger:

```text
20260718090300  fix_transactions_schema
20260719100000  fix_marketplace_schema
20260719100100  add_operator_role_and_lock_writes
20260720090000  add_intake_number
20260720100000  chain_of_custody
20260720120000  material_lifecycle
20260720130000  intake_trust_layer
20260720150000  business_supply_partners
20260720160000  passport_core_identity
20260720170000  passport_evidence_system
20260720180000  command_center_views
20260720190000  passport_events_birth_certificate
20260720200000  manifest_passport_link
20260722100000  sale_items
20260722110000  residents_email_unique
20260727120000  business_self_service_update
20260727130000  business_column_scoped_grants
20260728000000  redeem_wtwr_schema_and_functions
20260728000100  business_redemption_columns_grant
20260728100000  marketplace_buyers
20260728100100  marketplace_listings
20260728100200  marketplace_offers
20260728100300  marketplace_transactions
20260728100400  marketplace_rpc_revoke_default_grants
20260728110000  jobs_core
20260728110100  jobs_rpc
20260728110200  jobs_rpc_revoke_default_grants
20260728110300  job_create_intake_fix_completed_at
20260728110400  jobs_events_trigger_fix
20260728120000  passport_marketplace_bridge_core
20260728120100  create_listing_from_job_rpc
20260728130000  cancel_job_and_event_normalization
20260728140000  operator_job_dashboard_views
20260728150000  marketplace_intelligence_views
```

### Same-name live records

The live ledger contains same-name records for all 34 unmatched local migrations, but with different versions. For example:

| Local version | Live version | Name |
|---|---|---|
| `20260718090300` | `20260718232445` | `fix_transactions_schema` |
| `20260719100100` | `20260718233713` | `add_operator_role_and_lock_writes` |
| `20260728100000` | `20260728085346` | `marketplace_buyers` |
| `20260728110000` | `20260728154910` | `jobs_core` |
| `20260728120100` | `20260728170103` | `create_listing_from_job_rpc` |
| `20260728150000` | `20260728190601` | `marketplace_intelligence_views` |

The remote ledger also contains migrations that have no local counterpart, including bounty, wallet, driver verification, Stripe, trigger, and resident-auth changes. One notable example is live `20260728160018 jobs_rpc_revoke_public`, for which no local file exists.

**Conclusion:** same-name entries provide evidence that similarly named work was applied, but do not prove that live SQL is byte-for-byte equivalent to local files. The catalog definitions below, not filename similarity, are authoritative for current live behavior.

## 2. Requested live objects

All requested objects are ordinary `public` tables with RLS enabled and not forced for the table owner.

| Table | Primary state / linkage verified live | Important constraints |
|---|---|---|
| `scans` | UUID PK; resident/business owner; bounty status, claim, completion, pickup evidence and value fields | bounty-state/value/owner/location checks; FK to residents, businesses, and drivers |
| `jobs` | bigint identity PK; links scan, resident, driver, intake, passport; uppercase workflow status | status/source checks and FKs to all linked records |
| `job_events` | bigint identity PK; job, normalized event type, actor, notes, timestamp | FK to jobs; constrained event vocabulary |
| `intakes` | UUID PK; generated unique intake number; material, AI evidence, value, location, lifecycle, resident/business links | lifecycle checks; FKs to residents and businesses |
| `passports` | bigint PK; unique passport display ID; intake/manifest/resident links; lifecycle/status fields | FKs to intake, manifest, resident; lifecycle check |
| `manifests` | bigint PK; unique non-null display ID; intake and passport links | FKs to intake/passport; unique manifest display ID |
| `material_listings` | bigint PK; mandatory manifest; optional passport/seller; weight, price and state | positive weight; status check; FKs to manifest/passport/operator |
| `offers` | bigint PK; listing/buyer, price, weight and state | positive price/weight; status check; FKs to listing/buyer |
| `marketplace_transactions` | bigint PK; listing, offer, buyer, seller, mandatory manifest, final values and state | status check; FKs to all linked records |

Notable live differences from an idealized direct spine:

- `material_listings.manifest_id` is non-null and mandatory.
- `material_listings.passport_id` is nullable.
- `marketplace_transactions.manifest_id` is also non-null.
- `intakes` has no `scan_id` or `job_id` column.
- `passports.intake_id` is not unique.

## 3. Live triggers

### `scans`

| Trigger | Timing | Effect |
|---|---|---|
| `scans_bounty_transition_guard` | BEFORE UPDATE | Allows only null→open, open→claimed, claimed→completed, and open/claimed→cancelled |
| `record_driver_payout_on_bounty_completion` | BEFORE UPDATE | On completion, calculates `driver_payout_cents` from accepted value |
| `trg_create_job_on_bounty_open` | AFTER UPDATE | Creates a PENDING job when bounty status becomes open |
| `create_intake_passport_on_bounty_completion` | AFTER UPDATE | On resident-backed completion, creates an ACQUIRED intake and CREATED passport |
| `credit_resident_wtwr_on_completion` | AFTER UPDATE | Credits the resident balance on completion |

### `jobs`

| Trigger | Timing | Effect |
|---|---|---|
| `trg_touch_job_updated_at` | BEFORE INSERT or status UPDATE | Sets `updated_at` |
| `trg_log_job_status_events` | AFTER INSERT or status UPDATE | Creates normalized job events; excludes CANCELLED updates because `cancel_job` logs cancellation manually |

The event mapping is:

- insert → `CREATED`
- `SCANNING` → `SCAN_RECORDED`
- `INTAKE` → `INTAKE_LOGGED`
- `PASSPORT` → `PASSPORT_CREATED`
- `MARKETPLACE` → `LISTING_CREATED`
- other non-cancel statuses → the status text itself

### `passports`

| Trigger | Timing | Effect |
|---|---|---|
| `trg_require_acquired_intake` | BEFORE INSERT | Rejects a linked intake unless its lifecycle is `ACQUIRED` |
| `trg_log_passport_created` | AFTER INSERT | Inserts `PASSPORT_CREATED` into `passport_events` |
| `record_token_reserve_event_on_grading` | AFTER UPDATE | Records token-reserve behavior when passport grading changes; full downstream token-reserve scope was outside the requested object set |

### `manifests`

| Trigger | Timing | Effect |
|---|---|---|
| `trg_require_acquired_intake` | BEFORE INSERT | Requires linked intake to be `ACQUIRED` |
| `trg_set_manifest_code` | BEFORE INSERT | Generates the required manifest display code |

### `material_listings`

| Trigger | Timing | Effect |
|---|---|---|
| `trg_validate_listing_verified` | BEFORE INSERT or status UPDATE | An AVAILABLE listing requires its manifest to reference an ACQUIRED intake and a passport |
| `trg_log_listing_status_events` | AFTER INSERT or status UPDATE | Logs `LISTING_CREATED`, `LISTED`, and `SOLD` events |

### `offers`

`trg_log_offer_received` logs `OFFER_RECEIVED` to `listing_events` after every offer insert.

### Tables with no live user trigger in the requested set

- `job_events`
- `intakes`
- `marketplace_transactions`

Transaction completion changes the listing to `SOLD`, which indirectly produces the listing event through the listing trigger.

## 4. RLS policies and table grants

### Base grants

**Verified live:** `anon`, `authenticated`, and `service_role` each have base privileges including SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, and TRIGGER on all nine requested tables. RLS is enabled on every table, so browser-role row access is constrained by policies despite the broad base grants. `service_role` retains its privileged bypass behavior.

This broad-grant posture increases the importance of complete RLS coverage and function grant tests.

### Policy summary

| Table | Live policies |
|---|---|
| `scans` | public insert with restricted initial state; resident own reads and pickup submission/cancel; verified-driver open/own reads, claim, and completion; operator read and cancellation |
| `jobs` | driver reads assigned jobs; operator reads all jobs; no direct write policy |
| `job_events` | driver reads events for assigned jobs; operator reads all; no direct write policy |
| `intakes` | operator SELECT, INSERT, UPDATE |
| `passports` | operator SELECT, INSERT, UPDATE |
| `manifests` | public/anonymous SELECT; operator INSERT and UPDATE |
| `material_listings` | operator SELECT, INSERT, UPDATE |
| `offers` | buyer reads own offers; operator SELECT, INSERT, UPDATE |
| `marketplace_transactions` | operator ALL |

No requested table has an RLS DELETE policy. The service role can bypass RLS; ordinary `anon` and `authenticated` roles cannot turn their broad base DELETE grant into row access without a policy.

### Notable policy details

- Anonymous/authenticated scan insertion requires no claimed/completed fields and permits only null or open bounty status.
- Resident pickup opening requires an authenticated resident match, pickup photo, coordinates, timestamp, and `can_create_bounty(...)` approval.
- Drivers may claim only open bounties with staged pickup evidence and must be verified.
- Direct writes to `jobs` and `job_events` are intentionally absent; security-definer RPCs and triggers own them.
- `manifests` has a live public SELECT policy (`anon select manifests`) applying to both `anon` and `authenticated` with `USING (true)`. This exposes every manifest row permitted by selected columns/base grants, not merely public marketplace projection data.

## 5. Function execution permissions

All workflow functions below are live `SECURITY DEFINER` functions with `search_path` fixed to `public`.

| Function | `anon` | `authenticated` | `service_role` |
|---|---:|---:|---:|
| `claim_job(bigint)` | no | yes | no |
| `job_mark_en_route(bigint)` | no | yes | no |
| `job_mark_arrived(bigint)` | no | yes | no |
| `job_record_scan(bigint,jsonb)` | no | yes | no |
| `job_create_intake(bigint,numeric,numeric)` | no | yes | no |
| `job_create_passport(bigint)` | no | yes | no |
| `cancel_job(bigint,text)` | no | yes | no |
| `create_listing_from_job(bigint)` | no | yes | no |
| `accept_offer(uuid,bigint)` | no | no | yes |
| `complete_transaction(uuid,bigint)` | no | no | yes |

Authenticated job functions enforce assigned-driver-or-operator authorization internally; `claim_job` specifically requires a verified driver. `cancel_job` requires an operator. Marketplace acceptance/completion recheck the supplied operator ID and are intended for service-role API invocation.

Trigger functions retain broad EXECUTE ACLs including PUBLIC/anon/authenticated/service role. They return `trigger` and execute in trigger context; nevertheless, the broad ACLs are a verified grant posture worth including in later permission review.

## 6. Dual workflow state

### Verified live writes and synchronization

| Operation | `jobs.status` | `scans.bounty_status` |
|---|---|---|
| Resident opens pickup | trigger creates `PENDING` job | null → `open` |
| `claim_job` | `PENDING` → `CLAIMED` | `open` → `claimed`; also sets driver and claim time |
| `job_mark_en_route` | `CLAIMED` → `EN_ROUTE` | unchanged (`claimed`) |
| `job_mark_arrived` | `EN_ROUTE` → `ARRIVED` | unchanged (`claimed`) |
| `job_record_scan` | `ARRIVED` → `SCANNING` | unchanged (`claimed`) |
| `job_create_intake` | `SCANNING` → `INTAKE` | `claimed` → `completed`; sets completion time |
| `job_create_passport` | `INTAKE` → `PASSPORT` | unchanged (`completed`) |
| `create_listing_from_job` | `PASSPORT` → `MARKETPLACE` | unchanged (`completed`) |
| `cancel_job` | PENDING/CLAIMED → `CANCELLED` | open/claimed → `cancelled` |
| `complete_transaction` | unchanged (`MARKETPLACE`) | unchanged (`completed`) |

### Repository reads

**Repository intent/current code:**

- `job.html`, `driver-board.html`, `terminal.html`, and operations job views read `jobs.status` for the newer workflow.
- `scanner.html`, `pickup-photo.html`, `driver-board.html`, `dispatch.html`, `terminal.html`, payout code, and several live triggers still read `scans.bounty_status`.
- `api/pay-driver.js` treats `scans.bounty_status = completed` as payout eligibility.

### Authority conclusion

Neither column is merely historical. `jobs.status` is authoritative for detailed operational progress, while `scans.bounty_status` remains authoritative for resident-visible pickup state, bounty constraints, reward credit, intake/passport compatibility triggers, and driver payout eligibility. Synchronization exists only at claim, intake completion, and cancellation.

## 7. Exact lifecycle creation paths and retry behavior

### Pickup opening → job

1. An authenticated resident updates their scan from null bounty state to `open` with required pickup evidence.
2. RLS checks resident ownership, evidence, and bounty eligibility.
3. The transition guard permits null→open.
4. `trg_create_job_on_bounty_open` invokes `create_job_on_bounty_open()`.
5. The function inserts a `PENDING` bounty job if no non-cancelled job exists for that scan.

Duplicate prevention:

- Function-level `NOT EXISTS` check.
- Partial unique index `jobs_scan_id_active_uniq` on `jobs(scan_id) WHERE status <> 'CANCELLED'` protects concurrent attempts.
- A cancelled scan cannot reopen under the live transition guard, so a second active lifecycle is not currently reachable through the normal scan transition.

### Intake creation

`job_create_intake()` locks the job and scan, validates actor/state and positive weight/price, inserts an ACQUIRED intake, marks the scan completed, and advances the job to INTAKE in one transaction.

**Critical live interaction:** marking the scan completed fires `create_intake_and_passport_on_bounty_completion()`. When the scan has a resident, that trigger inserts a second ACQUIRED intake and immediately creates a passport for that second intake.

Duplicate behavior:

- The job status gate prevents retrying `job_create_intake()` after a successful transition.
- The function is transactional, so an error rolls back its writes.
- It does not prevent the separate legacy completion trigger from creating the second records during a successful call.
- `intakes` has no scan/job reference or uniqueness key that could reject this duplication.

### Passport creation

`job_create_passport()` requires an INTAKE job, reads the job-linked intake, inserts a CREATED passport, and advances the job to PASSPORT.

Duplicate behavior:

- The job status gate prevents repeating the RPC after success.
- `passports.intake_id` has only a non-unique index; multiple passports may reference one intake.
- On the resident path, a passport may already exist for the legacy trigger-created second intake, and this RPC creates another for the job-linked first intake. These are two passports for the same scan lifecycle, though not the same intake row.

### Listing creation

`create_listing_from_job()` requires the assigned driver or an operator, a passport-linked job, and PASSPORT state. It reuses an existing passport manifest or creates a minimal manifest, links both sides, creates a DRAFT listing, and advances the job to MARKETPLACE.

Duplicate prevention:

- If the job is already MARKETPLACE, the function returns the existing non-closed listing for the passport.
- Before insertion it rejects an existing active listing for the passport.
- Partial unique index `material_listings_passport_id_active_uniq` enforces one non-CLOSED listing per non-null passport under concurrency.
- Because `passport_id` is nullable, the partial uniqueness rule does not constrain legacy manifest-only listings with null passport IDs.

### Offers and transactions

`accept_offer()` locks the offer and listing, requires PENDING/AVAILABLE states, accepts one offer, rejects sibling pending offers, reserves the listing, creates one pending marketplace transaction, and logs acceptance atomically.

- Partial unique index `offers_listing_accepted_uniq` permits only one ACCEPTED offer per listing.
- No unique index exists on `marketplace_transactions.offer_id` or `listing_id`.
- Normal retry is rejected because the offer is no longer PENDING; transaction creation is in the same database transaction as acceptance.

`complete_transaction()` locks and requires a PENDING transaction, marks it COMPLETED, and marks the listing SOLD atomically. A retry is rejected because the transaction is no longer PENDING.

## 8. Event creation

Verified live event paths:

- Job insert/status change → `job_events` through `trg_log_job_status_events`.
- Cancellation → one manual `job_events` insert in `cancel_job`; the job trigger deliberately skips CANCELLED.
- Passport insert → `passport_events.PASSPORT_CREATED`.
- Listing insert/AVAILABLE/SOLD → `listing_events`.
- Offer insert → `listing_events.OFFER_RECEIVED`.
- Offer acceptance → explicit `listing_events.OFFER_ACCEPTED` inside `accept_offer()`.
- Transaction completion → listing status becomes SOLD, producing a listing event indirectly.

`job_events` has no uniqueness constraint preventing two otherwise identical events. Current trigger/function design avoids a duplicate cancellation event by convention rather than constraint.

## 9. Environment-variable visibility

Only names were inspected; no values were displayed or recorded.

### Present in local `.env.local`

- `ANTHROPIC_API_KEY`
- `VERCEL_OIDC_TOKEN`

### Referenced by serverless code

- `ANTHROPIC_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `STRIPE_PRICE_SIGNAL_MONTHLY`
- `STRIPE_PRICE_SIGNAL_ANNUAL`
- `STRIPE_PRICE_ENFORCER_MONTHLY`
- `STRIPE_PRICE_ENFORCER_ANNUAL`
- `STRIPE_PRICE_SENTINEL_MONTHLY`
- `STRIPE_PRICE_SENTINEL_ANNUAL`
- `STRIPE_PRICE_AD_BOOST`
- `STRIPE_PRICE_AD_FEATURED`

### Unresolved

Deployment-level Vercel environment-variable presence was not available through the Supabase catalog integration. The absence of a name from local `.env.local` does not prove that it is absent from Vercel.

## 10. Verified live state vs repository intent

### Verified live

- All requested tables, constraints, indexes, triggers, RLS policies, and function grants described above.
- The dual scan/job state system and its synchronization points.
- The active legacy scan-completion bridge alongside the newer job RPCs.
- The resulting resident-path duplicate intake/passport behavior.
- Mandatory manifest linkage for listings and marketplace transactions.
- Partial uniqueness for active jobs, active passport listings, and accepted offers.

### Repository intent

- `ARCHITECTURE.md` and the master plan define the direct product spine as scan → job → intake → passport → listing → offer → transaction.
- Local migration comments say `jobs.status` should be authoritative for new operational reads while scan status remains for compatibility triggers.
- Local migrations describe the same broad workflow functions, but their versions mostly do not match the live ledger exactly.
- Application code uses the RPC workflow for driver job progression and service-role APIs for marketplace acceptance/completion.

### Unresolved questions

1. Whether same-name local and live migrations have identical SQL beyond the catalog objects inspected.
2. Whether the duplicate intake/passport behavior has already produced duplicate live records; live data was intentionally not queried.
3. Whether any external client, automation, or Edge Function writes these tables outside repository-visible paths.
4. Whether Vercel has every required environment variable configured in each environment.
5. Whether broad base grants and public manifest SELECT are deliberate long-term policy or historical defaults.
6. Whether the legacy automatic intake/passport bridge or the job RPC path is intended to own canonical record creation.
7. Whether jobs should advance from MARKETPLACE to COMPLETED when a marketplace transaction completes; no inspected live function currently does so.

## Phase 0 conclusion

The live database contains the intended job and marketplace machinery, but it is not a single clean product spine. The most immediate verified conflict is simultaneous ownership of intake/passport creation by `job_create_intake`/`job_create_passport` and `create_intake_and_passport_on_bounty_completion`.

Phase 1 should begin with a non-mutating reproduction plan and automated test for that interaction, followed by an explicit ownership decision before any migration is proposed. The migration ledger must also be reconciled so future deployments do not treat local timestamps as an accurate record of live application order.
