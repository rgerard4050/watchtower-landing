# Watchtower Protocol — Session Handoff

Status snapshot as of this session. Written to be pasted into another AI tool (ChatGPT, etc.) to bring it up to speed, and to serve as a durable record of where this work stands.

**No credentials are included in this file.** A Supabase personal access token and database password were used during this session to authenticate the Supabase CLI — neither value is repeated here. If you're picking this up fresh, you'll need your own token from [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) and the project's database password (Project Settings → Database).

---

## What this project is

Watchtower Protocol — a static-HTML site (no build step, no npm, no framework) backed by a Supabase project. Every page loads `@supabase/supabase-js` from the jsDelivr CDN via a `<script>` tag and creates its own Supabase client inline, using the anon/publishable key. There is no login/auth flow anywhere in the app today.

Intended business workflow:
```
INTAKE → REVIEW QUEUE → MANIFEST → DISPATCH → RECOVERY → LEDGER → MARKETPLACE
```

Supabase project ref: `eypovuxuddiqgncjdpkq` (region ca-central-1, Postgres 17.6.1).

---

## Work completed this session

1. **Full read-only database + application audit.** Complete findings — every table/column/FK/RLS policy, every frontend Supabase call with line numbers, schema-vs-payload mismatches, workflow trace, relationship audit, failure predictions, prioritized fix list — written to [docs/watchtower_database_audit.md](watchtower_database_audit.md). Nothing was modified during the audit.

2. **A five-phase repair roadmap** (planning only, not yet executed) covering: unblocking Intake→Dispatch, fixing the `manifests.id`/`manifest_id` identity split, repairing the Recovery pipeline (passports→materials_recovered→transactions), fixing Marketplace schema mismatches (`businesses.name`/`multiplier`, `redemptions.resident_id`), and a security-hardening phase (real per-persona RLS, which requires introducing actual auth — none exists today).

3. **Draft migration files written to disk** (SQL only — **none have been applied to the live database**):
   - [operations/migrations/006_fix_manifest_identity.sql](../operations/migrations/006_fix_manifest_identity.sql) — makes `manifests.id` (bigint) the sole canonical key; `manifest_id` becomes an auto-generated display code.
   - `operations/migrations/007_fix_rls_policies.sql` — minimum RLS policies to unblock `manifests`, `manifest_decisions`, `manifest_events`, `passports`, `materials_recovered`, `intakes` (currently deny-all on most of these).
   - `operations/migrations/008_fix_transactions_schema.sql` — adds `buyer`/`sale_price`/`date_sold` columns (additive, 0 existing rows).
   - `operations/migrations/009_fix_relationships.sql` — repoints `dispatch_stops.manifest_id` → `manifests.id`, `transactions.material_id` → `materials_recovered.id`, adds `redemptions.resident_id` → `residents.id` FK.
   - `operations/migrations/010_fix_marketplace_schema.sql` — adds `businesses.name` (generated column mirroring `business_name`) and `businesses.multiplier` (placeholder default 1.00 — real per-tier values are a pricing decision still needed from the project owner).

   Note: these are numbered 006–010, not 001–005, because `operations/migrations/001_operations_schema.sql` through `005_manifest_status_uppercase.sql` already existed in the repo before this session.

4. **Supabase CLI installed and linked.** Installed via Scoop (`scoop install supabase`, v2.109.1, since Windows doesn't support the old `npm install -g supabase` path anymore). Authenticated with `supabase login --token ...` and linked with `supabase link --project-ref eypovuxuddiqgncjdpkq --password ...`. Confirmed working — `supabase migration list` shows 4 pre-existing remote migrations (2026-07-09 through 2026-07-11) that have no corresponding local files.

---

## Where things stand right now

- **The live database has not been changed.** Everything above is audit + drafted SQL + a linked CLI — no `apply_migration`, no `db push`, no manual SQL execution against the project.
- The draft migration files live in `operations/migrations/`, which is **not** the folder the Supabase CLI expects (`supabase/migrations/`), so `supabase db push` won't pick them up as-is. A `supabase/config.toml` doesn't exist yet either (only `supabase/.temp/` link metadata) — `supabase init` hasn't been run.
- The most severe confirmed blockers, if anyone asks "why doesn't the operator terminal work": `manifests`, `manifest_decisions`, `manifest_events`, `passports`, `materials_recovered` all have RLS enabled with **zero policies**, meaning the anon-keyed frontend can't reach them at all — full detail in the audit doc.

## Immediate open decision

Whether/when to actually apply migrations 006–010 to the live project. Recommended order and full risk/rollback detail for each is in the audit doc and was walked through in-session; nothing executes until explicitly told to proceed.
