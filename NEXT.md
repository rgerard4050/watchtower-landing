# Watchtower: Current Sprint

## Resident front-door checkpoint

- Live verified: `20260805065906_guard_legacy_completion_for_active_jobs.sql` keeps the Jobs RPC lifecycle canonical while preserving legacy non-Job completion behavior.
- Live verified: `20260805070355_resident_collections.sql` and `20260805070909_resident_collections_hardening.sql` provide the Resident collection, staging, pickup, evidence, RLS, and service-boundary foundation.
- Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `ANALYSIS_SIGNING_SECRET` in server runtime environments.
- Run the Resident SQL/RLS, API, and Playwright gates before rollout.
- Phase 5 durable gamification is authorized for repository implementation after the Resident gates passed. It remains undeployed until its migration, RLS, API, and browser checks pass independently.

Sprint theme: prove the product spine  
Status: ready for execution  
Last updated: 2026-08-04

## Sprint goal

Establish verified, repeatable evidence that one record can move through the canonical Watchtower lifecycle:

```text
scan -> job -> intake -> passport -> listing -> offer -> transaction
```

This sprint prioritizes truth, safety, and testability. It does not add new product features or perform broad UI rewrites.

## Deliverables

### 1. Verify deployed state

- Compare the live Supabase migration ledger with `supabase/migrations/`.
- Inventory the live tables, columns, foreign keys, triggers, functions, views, grants, and RLS policies touched by the canonical lifecycle.
- Record differences between repository intent and deployed reality.
- Confirm required Vercel environment variable names and deployment presence without recording secret values.

Output: a dated deployment/schema verification report.

### 2. Define the lifecycle contract

- Document allowed job and marketplace states and transitions.
- Identify the actor authorized for each transition.
- Identify database functions, triggers, API handlers, and pages responsible for each transition.
- Define invariants for custody evidence, verified listing eligibility, transaction completion, and payment eligibility.

Output: a concise state-transition matrix linked from `ARCHITECTURE.md`.

### 3. Build a repeatable smoke test

- Use non-production or clearly marked test identities/data.
- Cover resident scan creation and pickup opening.
- Confirm automatic job creation and driver claim.
- Exercise en-route, arrival, grade, intake, and passport creation.
- Create/publish a verified listing, submit/accept an offer, and complete the transaction.
- Verify event/audit records and denied actions for the wrong persona.
- Keep Stripe money movement mocked or in test mode.

Output: an executable smoke-test harness plus a short operator runbook.

### 4. Fix only blocking defects

- Repair defects that prevent the smoke test or violate an invariant.
- Add a regression test with each fix.
- Avoid opportunistic legacy cleanup unless it directly blocks the canonical path.

Output: small, separately reviewable fixes with verification notes.

### 5. Declare canonical and legacy surfaces

- Identify the primary resident scanner, driver job UI, operator operations UI, business portal, and public marketplace.
- Label duplicate or legacy paths in documentation.
- Produce a follow-up cleanup plan covering data compatibility and rollback; do not delete legacy paths in this sprint without explicit approval.

Output: an entry-point ownership table and prioritized cleanup backlog.

## Priority order

1. Live schema and environment verification.
2. State-transition and authorization matrix.
3. Database/RPC smoke coverage.
4. API integration coverage.
5. Browser critical-path coverage.
6. Blocking fixes.
7. Canonical/legacy declaration.

## Acceptance criteria

- The live state of every schema object used by the lifecycle is confirmed or explicitly marked blocked/unverified.
- One test record completes the lifecycle without manual database edits.
- Invalid role access and invalid state transitions are rejected by RLS, RPC, or API enforcement.
- AI output is schema-validated before it advances durable workflow state.
- Listing verification and marketplace transaction invariants hold.
- Financial operations are test-mode, idempotent, and reconcilable.
- Failures produce actionable errors and sufficient non-sensitive diagnostics.
- The smoke test can be rerun from documented setup instructions.
- No new competing workflow, scanner, dispatch model, or ledger is introduced.

## Explicitly out of scope

- New persona features.
- Buyer self-service UI.
- Route optimization.
- Framework migration or full visual redesign.
- Production data deletion or destructive schema cleanup.
- Removing legacy pages before ownership and compatibility are established.
- Tokenomics or pricing changes.

## Known risks

- Local migration files may not match the live Supabase project.
- Existing UI paths mix newer job flows with legacy dispatch and ledger behavior.
- Several AI endpoints lack endpoint-level authentication and rate limiting.
- Stripe configuration may be incomplete across preview and production environments.
- PWA caching may serve stale assets during verification.
- The repository currently has unrelated uncommitted work that must be preserved.

## First task

Perform a read-only live Supabase migration/schema/RLS verification for the canonical lifecycle. Do not write SQL or change deployed state during discovery. Use the result to finalize the transition matrix and smoke-test fixtures.

## Sprint completion decision

At sprint review, choose one of two outcomes:

- **Proceed to consolidation:** the canonical lifecycle passes and legacy surfaces can be quarantined safely.
- **Continue stabilization:** documented blockers remain; the next sprint contains only the highest-risk lifecycle fixes.

Feature expansion begins only after the canonical lifecycle is verified.
