# Watchtower Master Plan

Status: governing product direction  
Last updated: 2026-08-04

## Mission

Watchtower turns recoverable material into a trusted, traceable economic asset. The product connects residents, drivers, operators, businesses, dispatchers, and buyers through one auditable lifecycle—from identification and pickup to recovery, resale, and reward.

## Product promise

Every material movement should answer five questions:

1. What material was identified?
2. Who had custody at each step?
3. What evidence supports the identification and condition?
4. What economic value was created and distributed?
5. What is the material's current state?

Watchtower must be useful before it is elaborate. A complete, trustworthy workflow is more valuable than several disconnected feature-rich surfaces.

## Canonical lifecycle

The product spine is:

```text
Resident scan
  -> verified pickup request
  -> driver job
  -> operator/driver intake
  -> material passport
  -> marketplace listing
  -> buyer offer
  -> marketplace transaction
  -> settlement, payout, and ledger evidence
```

The canonical technical records are `scans`, `jobs`, `intakes`, `passports`, `material_listings`, `offers`, and `marketplace_transactions`. Changes to this lifecycle require an architectural decision recorded in `ARCHITECTURE.md` or a future ADR.

Legacy `tickets` and `dispatch_runs`/`dispatch_stops` workflows are not approved for feature expansion. They may remain temporarily for compatibility until their data and behavior have been evaluated.

## Personas and outcomes

### Resident

- Understand what a material is and its approximate value.
- Provide evidence and location intentionally.
- Request pickup or choose a drop-off path.
- Track status and receive an understandable reward.
- Spend WTWR at participating businesses.

### Driver

- See eligible jobs without exposure to unnecessary resident data.
- Claim and advance one job through explicit states.
- Capture arrival, grading, intake, and custody evidence.
- Receive a transparent, idempotent payment.

### Operator

- Review exceptions and control high-risk transitions.
- Verify intake, passport, listing, offer, and transaction records.
- Observe the network through actionable operational views.
- Correct failures without silently rewriting history.

### Dispatcher

- Coordinate work through the canonical job model.
- Assign or monitor routes without creating a parallel custody system.
- See location confidence, job state, exceptions, and driver availability.

Dispatcher may initially be an operator capability. A distinct role should be introduced only when permissions genuinely differ.

### Business

- Subscribe to an appropriate participation tier.
- Maintain a verified business profile.
- Accept WTWR redemptions with deterministic pricing and limits.
- See settlement and value delivered by participation.

### Buyer

- Browse verified material listings.
- Maintain a buyer identity and submit offers.
- Complete transactions with traceable provenance.

Operator-mediated buyer actions are transitional. Buyer self-service is a later milestone after the operator-controlled marketplace is verified.

## Strategic phases

### Phase 0: Establish truth

- Confirm the live Supabase migration ledger, schema, policies, functions, and views.
- Document required deployment environment variables without exposing values.
- Prove the canonical lifecycle with a repeatable smoke test.
- Define state invariants and ownership for every transition.

Exit criterion: one test record can traverse the canonical lifecycle with correct authorization and evidence.

### Phase 1: Stabilize the product spine

- Fix failures found by the vertical smoke test.
- Add API contract validation, structured errors, and idempotency where money or state transitions are involved.
- Add automated tests for workflow RPCs, RLS boundaries, triggers, and critical serverless functions.
- Add observability for failed scans, jobs, webhooks, and transactions.

Exit criterion: the canonical lifecycle is repeatable, monitored, and regression-tested.

### Phase 2: Consolidate surfaces

- Select one resident scanner and one operational job experience.
- Move shared configuration, auth, navigation, and API helpers out of inline pages.
- Quarantine or retire duplicate prototypes and legacy paths after data-impact review.
- Standardize local development and deployment commands.

Exit criterion: each persona has one documented primary entry point and one workflow implementation.

### Phase 3: Complete role experiences

- Build buyer self-service with explicit authentication and RLS.
- Decide whether dispatcher requires a distinct authorization role.
- Separate business redemption from legacy operator cashier behavior.
- Improve resident and driver status visibility.

Exit criterion: every active persona has a least-privilege, end-to-end experience.

### Phase 4: Scale the network

- Introduce route optimization only after the job model is stable.
- Add pricing intelligence, marketplace automation, and exception triage.
- Add operational service-level metrics and financial reconciliation.
- Improve performance, accessibility, resilience, and PWA behavior under real usage.

Exit criterion: growth does not weaken custody, financial correctness, or user trust.

## Product invariants

- A material cannot be listed as verified without the required intake and passport evidence.
- A job transition must be authorized, valid from its current state, and recorded as an event.
- A financial action must be idempotent, attributable, and reconcilable.
- AI output is advisory evidence, never unquestioned truth.
- Public clients never receive service-role credentials or unrestricted operational data.
- Persona access is enforced in the data/API layer, not only by hidden navigation.
- Historical events are append-only unless a documented correction mechanism exists.
- User-facing estimates are clearly distinguished from guaranteed prices or rewards.

## Decision policy

Before implementing a feature, confirm:

1. It advances the canonical lifecycle or a named strategic phase.
2. Its persona and authorization boundary are explicit.
3. Its source of truth and state transitions are identified.
4. It does not create a competing scanner, dispatch, ledger, or marketplace path.
5. Its success and failure can be tested and observed.

If any answer is unclear, update the foundation documents or record an architectural decision before implementation.

