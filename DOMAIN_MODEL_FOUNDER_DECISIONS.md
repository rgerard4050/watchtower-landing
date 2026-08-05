# Domain Model Founder Decisions

Status: Founder decision register. This document records settled product-domain direction and its downstream consequences. It does not assert that the repository or live database implements these decisions.

Labels:

- **[Settled]** binding founder decision for future design and implementation.
- **[Verified]** current repository or live-state behavior documented by the existing audits.
- **[Consequence]** architectural work implied by a settled decision, not yet implemented.
- **[Unresolved]** requires a later founder/product/operational decision.

## Settled Decisions

### Authority hierarchy

1. **[Settled] Founder** is the only role that may grant or revoke Administrator.
2. **[Settled] Founder and Administrator** may grant or revoke Operator.
3. **[Settled] Administrator** may approve Field Partners and act across operational workflows, businesses, manifests, passports, dispatch, and exceptions.
4. **[Settled] Administrator** does not automatically receive `founder-private:view` or access to Founder Workspace.
5. **[Settled] Operator** may associate Residents and Businesses, verify Materials, approve Asset status, verify Passports, create/manage Manifests, approve dispatch, service Businesses, and manage operational exceptions.
6. **[Settled] Operator** may not make executive commitments, control unrestricted Business finances, grant Operator/Administrator or other elevated roles, or access founder-private information.
7. **[Settled]** A Person may hold every ordinary role, but every action occurs under one explicit active Access Context. Permissions do not accumulate invisibly across contexts.

The grant chain is therefore:

```text
Founder
  ├─ grants/revokes Administrator
  └─ grants/revokes Operator

Administrator
  ├─ grants/revokes Operator
  └─ approves/suspends Field Partner

Business Accountable Principal
  └─ grants/revokes scoped Business Worker memberships
```

Field Partner approval is an Administrator action, not an Operator grant. No role may grant itself. Emergency safety controls may fail closed, but permanent approval or revocation authority must follow the hierarchy above.

### Role definitions and boundaries

| Role/context | Settled definition | May do | Must not imply |
|---|---|---|---|
| Founder | Governance actor and sole Administrator grant authority | Founder-private governance; grant/revoke Admin or Operator; separately enter other contexts if separately granted | Routine operational access merely because Founder |
| Administrator | Founder-granted broad administrative and operational actor | Approve Field Partners; grant/revoke Operators; act across businesses, operational workflows, manifests, passports, dispatch, exceptions | Founder Workspace; founder-private data; ownership of customer property; unrestricted Business finance without separate legal mandate |
| Operator | Verified operational authority | Associate Residents/Businesses; verify Materials/uplift/Passports; approve Asset status; manage Manifests; approve dispatch; service Businesses; manage exceptions | Executive commitments; unrestricted Business finance; elevated-role grants; founder-private access |
| Field Partner | Umbrella role for Administrator-approved field/processing participants | View eligible work, perform specialization-authorized work, submit evidence/uplift proposals, receive payment | Operator verification authority; Asset declaration; work outside approved specialization |
| Business Owner / Accountable Principal | Exactly one active accountable representative for each Business | Billing, credits, commercial relationship, staff access, organization-scoped work | Platform administration or ownership of Watchtower records |
| Business Worker | Scoped Business membership | Work within granted Business/location capabilities | Accountable Principal, organization-wide finance, or platform authority |
| Watchtower Champion | Trained pro-WTWR employee/participant | Recognition, education, referrals/referral compensation, explicitly scoped operational privileges | Ownership, Operator/Admin/Founder authority, or implicit capability grants |
| Resident | Personal source/owner context | Build/stage Collections, request pickup, view own lifecycle/wallet, perform/propose permitted processing | Operator or Field Partner authority merely through participation |
| Buyer | Individual or organization marketplace context | Browse, offer, accept terms, transact, view own financial consequences | Seller, Operator, or Administrator authority |
| Founder Workspace | Separately protected workspace, not a role inherited by Admin/Operator | Founder-private governance and strategy | General operational workspace or an authorization shortcut |

### Field Partner umbrella and specializations

**[Settled]** “Driver” is no longer the umbrella role. It is one Field Partner specialization. Potential specializations are:

- Driver
- Bounty Hunter
- Processor
- Driver-Processor
- Passenger-Processor
- Territory Partner

**[Settled]** The minimal Field Partner capability set is only:

- view eligible work;
- perform explicitly authorized work;
- receive payment for eligible work.

Specializations narrow eligibility and allowed actions; they do not grant Operator authority. Combination labels such as Driver-Processor express approved capabilities from multiple specialization scopes, not a higher rank. Existing “Driver Board” and “Driver Job” may remain route/page names for the Driver specialization while the umbrella domain term becomes Field Partner.

### Business accountability and participation

**[Settled]** Every Business has exactly one active Accountable Principal responsible for billing, credits, the commercial relationship, and staff access. Business employees participate through scoped Business Worker memberships, optionally limited by location and capability. Accountable Principal is accountability and organization authority, not platform administration.

**[Settled]** Watchtower Champion is a recognition/training/program relationship. Champion participation may carry education, referral compensation, recognition, or separately granted operational privileges, but never automatically conveys ownership or an elevated platform role.

### Experience modes

- **[Settled] Basic** is the narrow single-context experience for Resident-only or Field-Partner-only users.
- **[Settled] Rosetta** is the context-aware multi-role experience. It makes the active context and switching model visible.
- Neither Basic nor Rosetta is an authorization role, capability bundle, seniority level, operational maturity designation, or automatic subscription tier.
- Both modes consume the same server-calculated capabilities and authoritative lifecycle state.

### Physical-value vocabulary and authority

| Term | Settled meaning | Authority boundary |
|---|---|---|
| Resource | Broad incoming physical-value term before final classification | May be captured or described by Resident, Business, or Field Partner |
| Collection | Editable pre-stage group of Resources or Materials | Owner/context members edit until successful stage |
| Collection Item | One Resource or Material entry within a Collection | Membership ledger locks when Collection stages |
| Material | A physical substance or known category | Participants may identify/propose; Operator/Admin verification is authoritative |
| Asset Candidate | Processed or separated Material awaiting Operator verification | Not an Asset and must not be listed/presented as verified value |
| Asset | Material whose value increased through Watchtower-authorized processing, verification, reclassification, and locked provenance | Only Operator or higher may approve the Candidate/Material-to-Asset transition |
| Asset Passport | Verified identity and provenance of an approved Asset | Operator/Admin verification is authoritative; field evidence may support it |
| Manifest | Grouping/movement record for multiple Assets or Materials when required | Operator/Admin management; grouping does not change ownership |
| Processing Contribution | Attribution of value-enhancing work, before/after evidence, proposed uplift, verified uplift, and resulting compensation | Participant submits; Operator/Admin verifies uplift; financial ledger settles compensation |

Residents and Field Partners may strip wire, remove motors, dismantle appliances, separate Materials, photograph work, and propose value uplift. They cannot declare Asset status. Operator verification makes classification, uplift, and Asset status authoritative.

## Unresolved Founder Decisions

The following were deliberately not invented:

1. **[Unresolved] Field Partner launch scope:** which specializations ship first and the exact eligibility, training, insurance, safety, location, custody, and payout rules for each.
2. **[Unresolved] Smart Yard Operator:** whether this becomes an Operator specialization, a Business/yard membership, a certification, or a distinct context.
3. **[Unresolved] Processor variants:** whether Processor, Driver-Processor, and Passenger-Processor remain labels over capabilities or require distinct workflow/state machines.
4. **[Unresolved] Territory management:** the meaning, geographic authority, commercial rights, exclusivity, assignment, and revocation rules of Territory Partner.
5. **[Unresolved] Yard-specific roles:** exact yard roles, employer relationship, shift/location scope, equipment certification, and separation-of-duties rules.
6. **[Unresolved] Asset approval standard:** minimum evidence, processing threshold, value-uplift method, material-specific criteria, review SLA, correction/appeal process, and whether Administrators approve routinely or only by escalation.
7. **[Unresolved] Legal ownership transfer:** when ownership of each Resource, Material, Candidate, and Asset transfers relative to pickup, Intake, processing, listing, and Transaction.
8. **[Unresolved] Processing compensation:** rate source, allocation across multiple contributors, dispute handling, withholding, approval thresholds, and relationship to WTWR versus fiat payout.
9. **[Unresolved] Accountable Principal transfer:** process for dispute, incapacity, departure, acquisition, or Business closure; required evidence and temporary continuity authority.
10. **[Unresolved] Champion program:** sponsor, curriculum, public recognition consent, referral qualification, compensation rules, expiration, and landing page.
11. **[Unresolved] Rosetta selection:** whether eligible users can temporarily choose Basic and how incomplete work behaves during a context switch.
12. **[Unresolved] Founder-private deployment boundary:** separate project, schema, service, or other control plane; retention and break-glass access.
13. **[Unresolved] Manifest requirement policy:** when Materials may be manifested before Asset approval and when listing creation requires a Manifest.
14. **[Unresolved] Passport draft authority:** whether automation or Field Partners may create drafts, provided only Operator/Admin verification can make them authoritative.

## Downstream Consequences

### SQL and RLS

**[Consequence]** Future schema work needs explicit Person role grants, Field Partner approvals/specializations, Business Accountable Principal uniqueness, Business Worker membership scope, Champion participation, and Access Context references. Role authority cannot rely on user-editable authentication metadata.

**[Consequence]** The physical model must distinguish Resource, Material, Collection Item, Asset Candidate, Asset, Processing Contribution, and Asset Passport. Existing uses of “asset” for accepted captures must be mapped deliberately rather than mechanically renamed.

Required invariants include:

- exactly one active Accountable Principal per Business;
- Founder-only Administrator grant/revoke;
- Founder/Administrator-only Operator grant/revoke;
- Administrator approval for Field Partners;
- specialization-scoped Field Partner eligibility and work actions;
- only Operator/Administrator may approve Material or Asset Candidate as Asset;
- Asset approval references locked provenance and the verifying actor/context;
- Processing Contributions retain before/after evidence, proposal, verification, and compensation lineage;
- founder-private records are inaccessible to Administrator and Operator absent a separately validated Founder context;
- RLS distinguishes view, proposal, verification, administration, and financial rights.

These requirements are future design constraints. No migration is authorized by this document.

### RPCs and lifecycle commands

**[Consequence]** Server commands—not direct table writes—must own:

- role grant/revoke and approval operations following the settled hierarchy;
- Accountable Principal creation/transfer;
- Business Worker invitation/scope/revocation;
- active-context validation;
- Field Partner specialization approval and work eligibility;
- Processing Contribution submission and verification;
- Material/Asset Candidate review and Asset approval;
- Asset Passport verification;
- dispatch approval and operational exceptions;
- compensation creation after verified work.

Asset approval must validate an Operator or Administrator context, expected Candidate/Material state, evidence completeness, and idempotency. It must atomically lock the approved classification/uplift/provenance and emit an audit/domain event. A contributor cannot approve their own proposal merely because the same Person also holds Operator; they must switch context, satisfy conflict policy, and may require a second reviewer.

The existing canonical Scan/Job/Intake/Passport lifecycle remains authoritative until deliberately migrated. Field Partner terminology must not break current Driver identifiers or RPC contracts without a compatibility plan.

### APIs

**[Consequence]** APIs need a server-validated active-context identifier and return context-scoped capability projections. Responses should distinguish proposed estimates/classification from Operator-verified values and Asset status. Public APIs expose only allowlisted Asset Passport/Manifest/Listing projections.

Compatibility requirements:

- Existing Driver callers continue to work as the Driver specialization during transition.
- Existing `driver_id`-style fields are not renamed until consumers, policies, functions, events, and rollback are inventoried.
- Error contracts distinguish `wrong_context`, `missing_capability`, `specialization_required`, `verification_required`, `conflict_of_interest`, and lifecycle/version conflicts without leaking sensitive data.
- Basic and Rosetta routes call the same domain APIs; presentation mode is never trusted for authorization.

### Navigation and workspaces

**[Consequence]** Rosetta requires a persistent context selector with at least Personal/Resident, each Business Principal/Worker context, Field Partner specialization context, Buyer, Watchtower Operations/Operator, Watchtower Administration, and Founder Workspace where separately granted. Basic omits the switcher only when exactly one eligible Resident or Field Partner context exists, while still showing the active identity.

Navigation must prevent:

- Field Partner work pages from exposing Asset approval;
- Operator pages from linking into role grants, executive commitments, unrestricted Business finance, or Founder Workspace;
- Administrator pages from implying founder-private access;
- Business Worker pages from implying Accountable Principal authority;
- Champion pages from implying ownership or operational authority;
- a context switch from carrying unsaved writes or selected organization IDs into another context.

The existing Driver Board/Job are specialization pages. A future general Field Partner work surface may route to specialization-specific tasks, but Smart Yard, territory, processor, and yard pages remain unresolved.

### Mobile UI

**[Consequence]** Every mobile page keeps the active context badge visible. Basic prioritizes one current workflow and one next action. Rosetta adds context switching without shrinking or hiding safety/status information.

Field Partner mobile work shows eligibility, specialization badge, assigned work, required evidence, next authorized action, and expected/posted payment. It must not display Asset approval controls. Operator mobile review prioritizes Material/Candidate identity, before/after evidence, proposed uplift, conflict indicators, authoritative classification, approve/reject/needs-work action, and audit confirmation. Administrator mobile prioritizes urgent access/operational approvals while keeping Founder Workspace absent.

Collection UI calls entries Resources or Materials, not Assets. Candidate and verified Asset badges must be visually and semantically distinct. Estimated WTWR/dollars, proposed uplift, verified uplift, and posted compensation must never share an unlabeled total.

## Implementation Blockers

1. **Live authorization mismatch audit.** Current roles, tables, RLS policies, grants, functions, and client assumptions must be compared with the settled grant hierarchy. The existing live-schema audit did not verify this full multi-role model.
2. **Migration-ledger divergence.** Local migrations cannot be assumed live. Reconciliation is required before any forward authorization or domain migration.
3. **Driver compatibility inventory.** Every `drivers`, `driver_id`, Driver page, policy, function, payout, event, and external integration must be cataloged before adopting Field Partner storage/contracts.
4. **Resource-to-Asset mapping.** Existing `scans`, intake, passport, material, manifest, listing, and UI fields may use “asset” loosely. A data-semantic mapping and backfill policy are required before enforcing the new approval boundary.
5. **Asset approval criteria unresolved.** SQL constraints and approval RPC behavior cannot be finalized until evidence and uplift rules are versioned by Material/category.
6. **Processing compensation unresolved.** Processing Contribution may be modeled before payout calculation, but automated compensation cannot ship without approved rate/allocation/dispute rules.
7. **Business principal recovery unresolved.** The uniqueness invariant is clear; safe transfer and emergency access procedures are not.
8. **Founder-private boundary unresolved.** Administrator policies and Founder Workspace cannot be safely finalized without choosing the isolation/control-plane design.
9. **Conflict-of-interest policy incomplete.** Multi-role Persons need explicit recusal/second-approver rules for their own Contributions, Business, Jobs, Passports, Listings, payouts, and role grants.
10. **Page convergence incomplete.** Existing entry points overlap and several target workspaces do not exist. Authorization must precede cosmetic route consolidation.
11. **Canonical lifecycle protection.** Any role/domain work must preserve jobs RPC ownership, Scan correlation, duplicate-prevention constraints, wallet/token/payout side effects, and marketplace compatibility.
12. **Future-role prohibition.** Smart Yard Operator, new processor semantics, territory management, and yard-specific roles are blocked from implementation until founder decisions define them.

## Decision-to-Implementation Order

1. Audit live and repository authorization against the settled grant chain.
2. Define server-validated Access Context and Basic/Rosetta presentation contract.
3. Define Accountable Principal transfer and Business Worker scope.
4. Inventory Driver compatibility and define Field Partner specialization contracts without renaming live identifiers.
5. Define the Resource/Material/Candidate/Asset semantic mapping and Operator verification criteria.
6. Define Processing Contribution attribution and compensation policy.
7. Design migrations, RLS, commands, projections, audit events, and regression tests from those approved contracts.
8. Implement only through separately approved, reversible phases; preserve the canonical Scan-to-Job lifecycle throughout.
