# Watchtower Architecture

Status: target architecture with current-state constraints  
Last updated: 2026-08-04

## Architectural objective

Watchtower will evolve from a collection of standalone pages into a coherent, testable application without interrupting the working product. The architecture is organized around one canonical material lifecycle and least-privilege persona boundaries.

For a repository inventory and current-state findings, see `REPOSITORY_AUDIT.md`. This document defines direction and constraints.

## System context

```text
Residents / Drivers / Operators / Businesses / Buyers
                         |
                 Static web clients
                         |
          +--------------+---------------+
          |                              |
  Supabase Auth/PostgREST/RPC      Vercel API functions
          |                              |
       Postgres                 Anthropic / Stripe
```

## Canonical domain flow

```text
scans
  -> jobs
  -> intakes
  -> passports
  -> material_listings
  -> offers
  -> marketplace_transactions
```

Each arrow represents an explicit, authorized transition. Database RPCs and triggers may implement transitions when atomicity or invariant enforcement is required. UI code must not recreate those invariants through a sequence of loosely related client writes.

`tickets` and `dispatch_runs`/`dispatch_stops` are legacy domains pending evaluation. New work must not add dependencies on them unless an approved decision changes this direction.

## Layers and responsibilities

### Presentation

Owns rendering, camera access, form interaction, accessibility, and user feedback. It may request domain actions but must not contain security-critical authorization rules or financial calculations that are absent from the server/database.

Current standalone pages remain supported during migration. New shared behavior should move into small ES modules rather than expanding inline scripts.

### Client services

Owns Supabase client creation, session retrieval, API requests, request correlation, response normalization, and safe error display.

Target shared services include:

- configuration and environment discovery;
- Supabase browser client;
- authentication/session helpers;
- typed or schema-validated API client;
- camera/image preparation;
- navigation and persona-aware route metadata.

There must be one implementation of each shared concern.

### Serverless APIs

Own third-party secrets, privileged Supabase access, webhook verification, payload validation, rate limiting, and authorization that cannot safely live in the browser.

Endpoint rules:

- Reject unsupported methods with `405` and an `Allow` header.
- Validate content type, payload shape, size, and required identity.
- Use consistent status codes and a stable error envelope.
- Verify access tokens from an `Authorization: Bearer` header in the target design.
- Never trust a role, user ID, price, payout amount, or record owner supplied by the client.
- Apply idempotency to payments, webhooks, and irreversible transitions.
- Log a correlation ID without logging secrets or sensitive images.

### Database

Supabase Postgres is the source of truth for identity-linked application state. The canonical migration path is `supabase/migrations/`.

Database rules:

- RLS is enabled for persona-scoped tables.
- Policies implement least privilege and are tested for allowed and denied cases.
- Security-definer functions set a safe `search_path`, validate the caller, and expose only required grants.
- State machines reject invalid transitions.
- Multi-record transitions are atomic.
- Financial and custody events remain auditable.
- Public marketplace access uses deliberately restricted views.
- Schema changes are forward migrations; live schema is verified before names are referenced.

`operations/migrations/` is historical until reconciled. No new migration belongs there.

## Identity and roles

Supabase Auth supplies user identity. Application roles come from verified database records and relationships, not client claims.

- Resident: authenticated user linked to a resident record.
- Driver: authenticated user satisfying the verified-driver rule.
- Operator: authenticated user present in `operators`.
- Business: authenticated user linked to an authorized business record.
- Buyer: authenticated user linked to a buyer record when self-service is enabled.
- Dispatcher: currently an operator capability, not a separate security principal.

Every sensitive action needs defense in depth: page gating for user experience, plus RLS/RPC/API enforcement for security.

## AI boundary

Anthropic analyzes resident scans, operator grades, pickup evidence, and potential listing text. AI results are untrusted structured input.

- Validate returned JSON against a versioned schema.
- Store model, prompt/schema version, timestamp, and relevant confidence/evidence metadata.
- Enforce upload and decoded-image size limits.
- Strip unsupported media types and metadata where appropriate.
- Apply authentication/rate limits based on endpoint risk.
- Require human or deterministic validation for financial and custody decisions.
- Do not expose private images through public marketplace views by default.

## Payments boundary

Stripe handles subscriptions, Connect onboarding, and payouts. Supabase stores the minimum identifiers and state required for reconciliation.

- Stripe webhook events are signature-verified and idempotently processed.
- Stripe is authoritative for payment-provider state.
- Watchtower is authoritative for domain eligibility and allocation rules.
- Client-supplied amounts are never authoritative.
- Payout and redemption state changes produce immutable audit evidence.

## Navigation direction

Each persona should converge on one primary entry point. A centralized route registry should identify label, path, visibility, required role, and legacy status. Clean URL behavior must be identical in local and deployed environments.

Hash routing under `/app` is experimental and is not the architectural standard until explicitly adopted. Migration must be incremental; a framework rewrite is not a prerequisite for stabilization.

## Configuration

- Browser-safe configuration is centralized and contains only public values.
- Secrets exist only in deployment/runtime environment variables.
- Required variables are documented by name and validated at startup or request time.
- Development, preview, and production Supabase/Stripe environments must be distinguishable.
- Hard-coded project identifiers should be removed gradually as affected files are consolidated.

## Testing strategy

The minimum test pyramid is:

1. SQL/RPC tests for invariants, transitions, grants, and RLS matrices.
2. API integration tests with third-party calls mocked where practical.
3. Browser smoke tests for each persona's critical path.
4. A staging end-to-end test covering the complete canonical lifecycle.

Every production defect in a canonical transition should add a regression test at the lowest effective layer.

## Observability

Critical actions should expose structured logs and measurable outcomes:

- scan requests, latency, model failures, and invalid responses;
- job creation and transition failures;
- RLS/RPC authorization failures;
- webhook receipt, deduplication, and processing result;
- payout/redemption/transaction reconciliation;
- PWA version and stale-client incidents.

Sensitive image data, access tokens, service keys, and unnecessary personal information must not be logged.

## Resident pre-lifecycle contract

An authenticated Personal/Resident context owns one editable `scan_collections` ledger containing durable `scan_collection_items`. `/api/scan` supplies signed, advisory analysis only. Add Item validates that reference and attaches protected evidence. Atomic Stage Bounty locks the ledger and creates exactly one `scans` row with `bounty_status = null`. Explicit Request Pickup remains the null-to-`open` transition that creates one active `jobs` row. `resident_estimate_v1` is provisional, server-owned, and cannot post WTWR Credit.

The private `collection-evidence` bucket stores immutable JPEG evidence under `{resident_user_id}/{collection_id}/{collection_item_id}/{evidence_id}.jpg`. Browser clients receive only five-minute server-signed previews. Unstaged cleanup eligibility begins after 30 days; staged provenance defaults to seven-year retention pending jurisdiction-specific policy.

## Durable progression contract

Resident and future Field Partner progression is an additive, non-financial system. Postgres owns an append-only `xp_entries` ledger, versioned XP rules, verified-XP level thresholds, learning completion, mission progress, Material discovery, achievements, and recognition history. The browser receives only the safe `resident_gamification_projection()` response and never supplies XP amounts.

XP, estimated WTWR, WTWR Credit, estimated dollars, and compensation are separate values. Progression triggers cannot write Wallet balances, payments, marketplace Transactions, Asset status, or role assignments. Levels provide education, missions, recognition, and application eligibility only. Watchtower Champion is recognition and training—not ownership or elevated platform authority. Field Partner progression uses an explicit future context without inventing specializations or granting Field Partner approval.

## Change rules

An architectural decision is required before:

- introducing a new framework or build system;
- adding another workflow representation for scan, dispatch, custody, ledger, or marketplace;
- changing the canonical lifecycle or source-of-truth table;
- adding a new role or broadening an existing role's permissions;
- bypassing RLS through a service-role endpoint;
- adding a payment or token accounting mechanism.
