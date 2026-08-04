# Watchtower Engineering Principles

Status: required engineering standards  
Last updated: 2026-08-04

## 1. Verify before referencing

Never invent a table, column, function, file, route, environment variable, or role. Confirm it in the repository or live schema first. When live state cannot be checked, label it unverified.

## 2. Protect the canonical lifecycle

New work must strengthen the `scan -> job -> intake -> passport -> listing -> offer -> transaction` path. Do not create parallel implementations of scanning, dispatch, custody, ledger, or marketplace behavior.

## 3. Keep one source of truth

Every domain fact has one authoritative owner. Postgres owns durable workflow state, Stripe owns provider payment state, and AI supplies advisory observations. UI-local state is never the authoritative record for custody or money.

## 4. Enforce security at the boundary

Hidden controls and redirects improve user experience but do not provide authorization. Enforce access with RLS, narrowly granted RPCs, verified API identity, and least privilege. Service-role access requires explicit justification and server-side authorization.

## 5. Make transitions explicit and atomic

State changes must declare valid starting states, authorized actors, resulting states, and emitted evidence. Related writes belong in one transaction or database function. Never rely on a browser to complete a critical sequence perfectly.

## 6. Treat financial correctness as safety-critical

Payments, payouts, WTWR issuance, redemptions, pricing, and settlements must be deterministic, idempotent, attributable, and reconcilable. Never trust client-supplied monetary values without server-side derivation or validation.

## 7. Treat AI as untrusted input

Validate AI responses against a schema, retain provenance, communicate uncertainty, and provide a correction path. AI must not independently authorize payments, custody, safety claims, or verified marketplace status.

## 8. Prefer complete vertical slices

Deliver one usable, tested path across UI, API, database, permissions, and observability before expanding breadth. A coherent workflow outranks a larger collection of partial screens.

## 9. Consolidate before abstracting

Remove ambiguity about which implementation is canonical before building generalized infrastructure around it. Extract shared code when duplication is understood and covered by tests, not merely because files look similar.

## 10. Make failures visible and actionable

Do not silently fall back for authorization, pricing, state transitions, or persistence. Return structured errors, preserve diagnostic context safely, and give users a clear recovery action.

## 11. Test permissions as behavior

For each persona and sensitive resource, test both allowed and denied actions. A passing happy path is insufficient evidence that RLS, RPC grants, or API authorization are correct.

## 12. Preserve history and user work

Use forward migrations and append-only events where practical. Do not destructively rewrite data, migrations, or unrelated working-tree changes. Cleanup requires an inventory, compatibility decision, and rollback plan.

## 13. Keep changes reviewable

Prefer small changes with one stated outcome. Document schema impact, security impact, rollout, rollback, and verification. Avoid mixing feature work with broad formatting or unrelated cleanup.

## 14. Centralize configuration; isolate secrets

Public configuration should have one maintained source. Secrets belong only in runtime environment variables and must never enter browser bundles, logs, fixtures, screenshots, or documentation.

## 15. Build for accessible, unreliable real-world use

Camera, location, mobile network, and PWA flows must handle denied permissions, poor connectivity, retries, stale caches, and assistive technology. Evidence collection should fail safely and explain what remains possible.

## 16. Observe what matters

Measure critical lifecycle transitions, AI failures, authorization denials, webhook processing, and financial reconciliation. Logs should answer what failed and where without leaking credentials or unnecessary personal data.

## 17. Documentation is part of the system

Update `WATCHTOWER_MASTER_PLAN.md`, `ARCHITECTURE.md`, and `NEXT.md` when product direction, system boundaries, or sprint priorities change. Code that contradicts governing documentation requires either a documentation decision or a different implementation.

## Definition of done

A change is done when:

- its intended persona and outcome are clear;
- relevant files, schema, and routes were verified;
- authorization is enforced at the correct boundary;
- success, denial, and failure paths are tested proportionately;
- state and financial invariants remain intact;
- logs and errors support diagnosis;
- documentation and migration records are current;
- deployment and rollback are understood;
- no competing workflow or undocumented source of truth was introduced.

