# Watchtower Domain Model

Status: Proposed product-domain authority. This document describes business meaning, ownership, access, lifecycle, page responsibility, and navigation. It is not a database schema and does not claim that recommendations below are deployed.

Evidence labels used throughout:

- **[Verified]** observed in repository code or the read-only live-schema audit.
- **[Direction]** stated in founder, architecture, RFC, or approved planning documents.
- **[Founder Decision]** settled, binding product-domain direction supplied by the Founder.
- **[Recommendation]** the target domain model proposed here.
- **[Decision]** an unresolved founder/product decision.

## 1. Executive Summary

Watchtower converts an owner-controlled collection of Resources or Materials into a traceable recovery and exchange lifecycle:

`Collection -> Resource/Material entries -> staged Scan -> Pickup Request -> Job -> Intake -> processing -> Asset Candidate -> Operator-approved Asset -> Asset Passport -> optional Manifest -> Marketplace Listing -> Offer -> Transaction -> Wallet consequences`

**[Verified]** The deployed product spine begins at `scans`, opens one active `job`, and continues through `intakes`, `passports`, `material_listings`, `offers`, and `marketplace_transactions`. `jobs.status` and `scans.bounty_status` are both active state; job lifecycle RPCs synchronize them. Root `scanner.html` is the provisional canonical scanner. Existing role pages are static entry points with uneven authorization and overlapping operational implementations.

**[Direction]** True multi-capture collection work happens before the canonical scan. Staging a complete item ledger atomically creates exactly one scan. The jobs RPC lifecycle remains canonical after staging.

**[Founder Decision]** A person may hold every ordinary role, but every request executes in exactly one visible **Access Context**. Basic is the narrow single-context experience for Resident-only or Field-Partner-only users; Rosetta is the context-aware multi-role experience and is not a permission role. Effective permission is the intersection of account status, active role, organization membership, explicit grants, record state, and assurance requirements. Roles never accumulate invisibly across contexts. Ownership, custody, access, and administrative authority remain separate.

The immediate design consequence is that pages must be contracts over context and lifecycle state, not collections of links. The server authorizes every meaningful transition; the UI merely exposes authorized actions and renders authoritative results.

## 2. Domain Language

### Identity and access vocabulary

| Term | Permanent meaning |
|---|---|
| Person | A human being. One Person may control multiple Accounts only under an explicit recovery/enterprise policy; normally one active Account maps to one Person. |
| Account | Authentication principal and security boundary: credentials, sessions, assurance, status, and role grants. It is not a business asset owner. |
| Profile | Context-neutral presentation data for a Person, separated from role-specific Resident, Field Partner, Buyer, or staff records. |
| Role | Named responsibility eligible for capabilities. Roles are not mutually exclusive and are not authorization by themselves. |
| Capability | Atomic permission to view or perform a domain operation, scoped by context, organization, record relationship, state, and conditions. |
| Organization | Legal or operational group with members, locations, assets, and scoped financial visibility. |
| Organization Membership | Time-bounded relationship assigning a Person an organization role and capability constraints. |
| Access Context | The explicit acting identity for a request: Person + active role + optional Organization/location + capability set + assurance level. |
| Workspace | A coherent set of pages and tasks for one Access Context; switching workspace switches context, not merely navigation styling. |
| Session | Authenticated continuity with token/session identifiers, assurance level, active context, expiry, and revocation state. |
| Device | Client installation/browser used by a Session; useful for consent, camera permission, notification delivery, and risk signals, never independent authority. |
| Route/Page | Addressable UI contract with context, record-state, data-minimization, entry, action, and exit rules. |
| Navigation Transition | Authorized movement between page/record states. It may invoke a server command and must not be reduced to a URL link. |
| Private Founder/Admin Data | Strategy, governance, cap-table, privileged legal, security, credentials, incident, personnel, or platform-control information explicitly segregated from ordinary operations. |

### Operational vocabulary

- **Owner** has the legal/economic claim to an entity. **Custodian** physically or operationally safeguards it. Custody never transfers ownership by implication.
- **Resource** is the broad term for incoming physical value before its eventual classification is known.
- **Material** is a physical substance or known category, whether received directly or separated from a Resource.
- **Collection Item** is one Resource or Material entry inside one Collection. It is a membership/ledger entry, not an Asset.
- **Asset Candidate** is processed, separated, or reclassified material awaiting Operator verification.
- **Asset** is material whose value has been increased through Watchtower-authorized processing, verification, reclassification, and locked provenance. Only Operator or higher may approve Asset status.
- **Processing Contribution** records a participant's value-enhancing work, before/after evidence, proposed and verified uplift, and resulting compensation.
- **Asset Passport** is the Passport of a verified Asset and carries its authoritative identity and provenance.
- **Estimate** is a time-stamped, model/rate-versioned prediction. It is never a settled financial fact.
- **Stage Bounty** atomically freezes an open Collection ledger and creates its one canonical Scan.
- **Pickup Request** is the owner's durable request to move a staged Scan into pickup workflow.
- **Job** is the operational custody-transfer case. **Job Event** is its immutable history.
- **Intake** records physical acquisition. **Passport** records provenance/grade. **Manifest** aggregates or packages provenance when required.
- **Listing** offers verified recoverable value; **Offer** proposes terms; **Transaction** records an accepted exchange.
- **Wallet** is a ledger account; its balance is derived from immutable Wallet Transactions, including WTWR Credits and payout-related entries.

## 3. Identity, Roles, and Access Context

### Role model

A Person may concurrently be Resident, Business Owner, Business Worker, Field Partner, Watchtower Champion, Buyer, Operator, Administrator, and Founder. **[Founder Decision]** roles are separately granted and activated; they are never unioned implicitly. A Field Partner specialization does not imply Operator. Business ownership does not imply Administrator. Operator does not imply Founder. Administrator does not own customer resources or assets.

| Role | Grant authority | Verification/approval | Revocation |
|---|---|---|---|
| Resident | Self-enrollment plus identity/contact policy | Email/phone; stronger assurance for payout or pickup changes | Self-close or trust/safety suspension, preserving records |
| Business Owner / Accountable Principal | Verified business authority; every Business has exactly one active Accountable Principal | Legal/business authority; accountable for billing, credits, commercial relationship, and staff access | Founder/Administrator-supervised transfer to another verified principal, with audit |
| Business Worker | Accountable Principal or delegated membership manager | Invitation acceptance; capability and location scope | Business membership revocation |
| Field Partner | Administrator approval | Identity, eligibility, specialization training, payment readiness | Administrator suspension/revocation; assigned work safely reassigned |
| Watchtower Champion | Authorized program sponsor | Training and program eligibility; any operational privilege is separately scoped | Sponsor/Operator/Admin removes recognition or scoped grant |
| Buyer | Self/organization enrollment | Contact/payment/business verification according to transaction risk | Self-close, org removal, or marketplace suspension |
| Operator | Founder or Administrator only | Training, employment/contract status, MFA | Founder or Administrator only; no self-grant |
| Administrator | Founder only | MFA, security approval, periodic review | Founder only; emergency suspension may fail closed but cannot become a permanent role change |
| Founder | Explicit governance grant | Strong MFA and governance approval | Governance-controlled; never inferred from Administrator |

### Effective authorization

**[Recommendation]** For each server request:

`effective capabilities = account grants ∩ active-role bundle ∩ membership scope ∩ route/resource scope ∩ lifecycle permissions ∩ assurance policy − explicit denials`

Explicit denial, suspension, expired membership, or missing verification wins. The active context supplies one role and at most one organization/location scope; cross-context reads require a purpose-built capability. A UI context switch cannot elevate the server session without server validation.

### Active-context communication

Every authenticated workspace shows a persistent context chip containing icon, context name, active role, and organization/location where applicable. Destructive, financial, publication, role-management, and cross-context actions repeat the acting context in their confirmation. Page headers identify when a record is owned by another context.

### Conflicting roles and least privilege

- A Field Partner cannot claim a Job belonging to an Organization they control where self-dealing rules apply; route to Operator review.
- A Buyer cannot accept their own seller Listing or approve both sides of a controlled transaction.
- An Operator handling an exception cannot approve their own payout or grant elevated roles.
- An Administrator may approve Field Partners and act across operational workflows, businesses, manifests, passports, dispatch, and exceptions without acquiring domain ownership or founder-private visibility.
- A Founder uses Founder Workspace only for founder-private records; routine operations occur in Operator/Admin contexts.
- UI hides unavailable actions, but server authorization remains decisive.

### Re-authentication and confirmation

Require fresh authentication/MFA for role grants, privileged membership changes, payout approval, wallet redemption destination changes, publication with financial effect, sensitive export, founder-private access, session revocation, and destructive archive. Require explicit confirmation (not necessarily re-authentication) for Stage Bounty, pickup cancellation, Job cancellation, offer acceptance, and context-switching with unsaved work.

### Information private even from Operators

Authentication secrets and recovery material; full payment instruments; founder strategy/cap-table/governance and privileged legal records; security keys and incident details outside assigned duty; unrelated employee records; another organization's confidential financials; resident precise location outside an active need-to-know Job; raw evidence after its operational retention window; private communications and consent choices not needed for the task. Operators receive purpose-limited projections, not blanket table access.

## 4. Organizations and Memberships

**[Recommendation]** Organization is the common parent for businesses, Watchtower Operations, Watchtower Administration, and buyer organizations. Business is an organization subtype/domain record; every Business has one active Accountable Principal, and Business Workers receive scoped memberships. Business Location is an operational scope beneath it. Founder Workspace is not an Organization membership shortcut—it requires a separate Founder grant.

A Membership has person, organization, membership role, location scope, capability additions/removals, status (`invited`, `active`, `suspended`, `ended`), effective dates, inviter, approver, and audit references. Membership changes affect future authorization immediately but do not rewrite historical actor context.

Organization ownership grants organization-governance capabilities, not platform administration. Staff may be limited to one or more locations. Financial capabilities are separately scoped from operational capabilities. Removing a member revokes new access and sessions/context tokens; historical records retain their actor identity.

## 5. Core Entity Definitions

The following compact catalog covers definition/purpose; canonical owner and custodian; view/create/change/archive; creation, lifecycle, transitions and lock; producers, consumers and references; authoritative/derived/private/shared data; and retention. “Archive” never means erasing required financial, consent, provenance, or audit history.

| Entity | Definition and purpose | Owner / custodian | Access and mutation | Creation, lifecycle, transitions, lock | Producers, consumers, references | Authority, privacy, sharing, retention |
|---|---|---|---|---|---|---|
| Person | Human identity behind platform participation | Person / trust team | Person views profile; authorized support limited; account processes create/change; never hard-delete linked history | `active, restricted, deceased/closed`; identity facts lock after verification except reviewed correction | Account/Profile/Roles/Memberships consume | Verified identity authoritative; display derived; PII private; retain while obligations persist |
| Account | Authentication/security principal | Person / identity service | Person and security admins; auth system creates; Person changes safe settings; security archives | `pending, active, locked, closed`; security events immutable | Person, Sessions, role grants | Auth provider authoritative; secrets never shared; security retention policy |
| Resident | Role-specific participant who stages owned/presented Resources or Materials | Person / resident service | Self and need-to-know operations; self-enrollment; verified edits; archive after obligations | `pending, active, suspended, closed`; history locks | Account, Collections, Scans, Wallet | Resident linkage authoritative; contact/location private; share minimum with assigned Field Partner |
| Organization | Legal/operational group | Legal organization / designated admins | Members by scoped capability; verified admins create/change; archive only after obligations | `pending, verified, active, suspended, closed` | Memberships, Locations, Wallets, Listings | Legal identity authoritative; public trading identity shareable; sensitive governance retained |
| Business | Organization participating as service customer/source, with exactly one Accountable Principal | Organization / Accountable Principal | Scoped members, Operators, Administrators; verified principal creates/changes within scope | organization lifecycle plus service status; principal transfer audited | Locations, Collections, recovered value, Memberships | Business and principal designation authoritative; analytics derived; contracts/financials private and not unrestricted for Operators |
| Business Location | Physical/service site within Business | Business / location managers | Scoped staff, assigned operations; authorized member creates/changes | `active, paused, closed`; address changes audited | Collections, pickups, Jobs, staff memberships | Verified address authoritative; routing derived; precise access instructions restricted |
| Membership | Person-to-Organization authorization relationship | Organization / membership managers | Member sees own; managers manage; no destructive delete | `invited -> active -> suspended/ended`; grant history immutable | Context and authorization engine | Scope and dates authoritative; derived capabilities; limited sharing; retain audit term |
| Accountable Principal | The single Business representative accountable for billing, credits, commercial relationship, and staff access | Business / verified principal | Principal, authorized Administrators, purpose-limited Operators; Founder/Admin-supervised creation or transfer | `proposed -> verified -> active -> transferred/ended`; exactly one active per Business; history immutable | Business, Memberships, organization Wallet | designation and effective dates authoritative; private identity/financial contact; retain commercial term |
| Business Worker | Scoped Business employee/member | Business / Accountable Principal | Self, principal, scoped Operators/Admins; principal or membership manager creates/changes | `invited -> active -> suspended/ended`; scope changes audited | Membership, Location, Collections, service workflow | membership scope authoritative; activity derived; personnel data private |
| Field Partner | Approved participant who performs authorized field or processing work; umbrella for Driver, Bounty Hunter, Processor, Driver-Processor, Passenger-Processor, Territory Partner | Person or employing org / Watchtower Operations | Self; Operators/Admins job-relevant; Administrator approves and scopes | `applicant -> approved -> active -> suspended/ended`; specialization approvals versioned | Jobs, Contributions, Intakes, Payouts | approval/specializations authoritative; eligibility derived; identity/payment private |
| Watchtower Champion | Trained pro-WTWR employee or participant eligible for recognition, education, referral compensation, or separately scoped operational privileges | Person / program sponsor | Self and program administrators; sponsor enrolls; no implicit ownership/elevation | `nominated -> trained -> active -> inactive/revoked`; privileges remain separate grants | Training, referrals, recognition, optional Contributions | training/recognition authoritative; influence metrics derived; private compensation; public recognition only by consent |
| Operator | Platform operations worker who associates residents/businesses, verifies materials and passports, approves Asset status, manages Manifests, approves dispatch, and services businesses | Watchtower / administration | Self, Administrators, Founder; Founder/Admin grants; restricted from executive commitments, unrestricted business finance, elevated-role grants, and founder-private data | `pending, active, suspended, ended` | Jobs, Businesses, Materials, Assets, Passports, Manifests, dispatch, exceptions | grants and verification decisions authoritative; actions auditable; personnel and founder data restricted |
| Buyer | Person/org marketplace actor | Person or buyer Organization / marketplace | Own context; seller sees transaction minimum; approved enrollment | `pending, active, restricted, closed` | Offers, Transactions | verification authoritative; preferences derived; payment data private |
| Administrator | Founder-granted platform actor with broad operational and access-administration authority | Watchtower / Founder governance | Founder grants/revokes; Admin acts across operations/businesses/manifests/passports/dispatch/exceptions and approves Field Partners/Operators | `nominated -> active -> suspended/ended`; Founder alone changes role; grant history immutable | Accounts, Operators, Field Partners, Businesses, operational records, audits | grant authoritative; founder-private excluded absent separate Founder role; privileged activity retained/reviewed |
| Founder | Governance actor with separate private scope | Governance body / founder-security function | Explicit founders only; operators/admins excluded absent separate grant | `active, emeritus, revoked`; governance changes immutable | Founder Workspace/private records | founder grant authoritative; private corpus separately encrypted/retained |
| Collection | Editable pre-stage group of Resources or Materials | Resident or Business context / owner until staging | Owner/Business Workers edit by scope; service sees only when submitted/consented | `open -> staging -> staged`; `open -> abandoned`; staged locks; correction creates new version/workflow | Collection Items; Stage RPC creates Scan | Item ledger/version authoritative; totals server-derived at stage; drafts private; abandoned retention bounded |
| Collection Item | One Resource or Material entry and its membership in one Collection | Collection owner / owner | Owner adds/removes/reorders while open; never mutate after stage | `pending -> accepted -> removed`; accepted ledger locks at stage | Collection, Resource or Material, estimates/evidence | membership/type/order authoritative; display totals derived; follows collection privacy/retention |
| Resource | Broad incoming physical-value object before final classification | Presenting owner until explicit legal transfer / current custodian | Owner and assigned lifecycle actors; accepted capture creates/proposes; corrections append | `identified -> staged -> in_custody -> processed/separated`; may yield Materials or Asset Candidates; never becomes Asset by client declaration | Collection Item, Evidence, Scan, Job, processing | observed identity authoritative; classification/value estimated until Operator verification; evidence private; provenance retained |
| Material | Physical substance or known category, received directly or separated from a Resource | Presenting/legal owner / current custodian | Owner views; Field Partners may observe/process/propose; Operator verifies; controlled taxonomy curated | `observed/estimated -> separated/classified -> verified`; may become Asset Candidate; verified assertions append-only | Resource, Collection Item, Estimates, Contributions, Passport | normalized class and Operator verification authoritative; field proposals non-authoritative; shareable projection |
| Asset Candidate | Processed/separated Material proposed as value-enhanced but awaiting Operator approval | Material owner / current custodian | Residents/Field Partners propose; Operators/Admins review; only Operator or higher approves | `proposed -> under_review -> approved_as_asset` or `rejected/needs_work`; decision immutable except audited supersession | Processing Contribution creates proposal; Operator decision creates Asset | evidence/proposed uplift non-authoritative; verification result authoritative; task-private until approved |
| Asset | Material approved by Operator or higher after authorized processing, verification, reclassification, value uplift, and locked provenance | Legal owner / current custodian and provenance service | Approved projections visible by role; only Operator/Admin may create through approval; corrections versioned | `approved -> passported -> manifested/listed -> transferred/processed`; Asset status/provenance locks at approval | Asset Candidate, Operator decision; Passport/Manifest/Listing consume | approved class, verified uplift, provenance authoritative; estimates derived; source privacy protected; long-lived |
| Material Estimate | Model/rate-versioned prediction per Resource/Material or Candidate | Underlying physical-value owner / estimation service | Owner and operational reviewers; service creates; qualified correction/versioning | `generated -> accepted/review -> superseded/verified`; never overwrite provenance | AI scan, rate card; totals and planning consume | inputs/model/rate/version authoritative; value/confidence derived; share only appropriate estimate |
| Processing Contribution | Attribution record for value-enhancing work, before/after evidence, proposed uplift, verified uplift, and compensation | Contributor owns attribution/compensation claim; underlying material ownership unchanged / Watchtower | Contributor and relevant owner view; Field Partner/Resident proposes; Operator verifies; finance posts compensation; no destructive delete | `proposed -> submitted -> verified/adjusted/rejected -> compensated`; evidence and decisions append-only | Processing activity/evidence; Asset approval, Passport, Payout/Wallet consume | performer/evidence/proposal authoritative as submitted; Operator uplift authoritative; compensation ledger authoritative; private commercial details scoped |
| Image / Evidence | Stored capture supporting identity, pickup, grade, or custody | Underlying record owner; custody by secure storage | Owner before submission; assigned actors by purpose; signed access only; no arbitrary delete | `captured -> attached -> retained -> expired`; hash/metadata immutable; redaction creates derivative | Asset/Scan/Job/Intake/Passport/Audit | object hash/reference authoritative; thumbnails derived; high privacy; lifecycle retention by evidence purpose |
| Scan | One staged bounty record bridging collection to pickup/job spine | Staging Resident/Business / Watchtower lifecycle | Owner views/opens/cancels where allowed; server creates at stage; RPCs mutate | bounty state **[Verified]** `null/open/claimed/completed/cancelled` (exact legacy vocabulary remains migration-defined); stage identity locks | Collection stage creates; Pickup/Job consume; references owner/evidence | staged snapshot authoritative; UI summaries derived; shared minimum with assigned actors; provenance retention |
| Pickup Request | Intent to collect a staged Scan; concept may currently be represented by Scan transition | Scan owner / operations | Owner create/view/cancel pre-claim; assigned actors view; server state change | `requested -> dispatched/claimed -> fulfilled` or `cancelled`; locks after custody milestones | Scan, Job; notifications consume | request time/location/instructions authoritative; ETA derived; location private/need-to-know; operational retention |
| Job | Canonical operational custody-transfer case | Watchtower operations; resource/material ownership unchanged / assigned Field Partner then intake facility | Field Partners scoped eligible/assigned; Operators/Admins broad; lifecycle RPCs create/change; archive only terminal | **[Verified]** canonical server statuses include open/claimed and downstream milestones through intake/completion/cancel; transitions only RPC; terminal locked | Scan trigger/RPC creates; Job Events, Intake, Passport, Payout consume | `jobs.status` authoritative for operations while synchronized to Scan resident state; route/ETA derived; retain provenance |
| Job Event | Immutable statement of Job transition/action | Job history / Watchtower | Job participants see projections; server/triggers create; no change/delete | append-only event types; corrections append compensating event | Job RPCs/triggers create; timelines/audit consume | actor/context/time/type authoritative; presentation derived; privacy follows Job; long retention |
| Intake | Record of physical acquisition and custody acceptance | Receiving Watchtower/business entity / operator facility | Assigned authorized Field Partner/Operator creates via canonical RPC; participants view projections; correction controlled | `created/received -> graded/processed` plus exceptions; creation/chain facts lock | Job creates; Material/Contribution/Candidate/Passport and payout consequences consume | measured intake facts authoritative; estimates derived; facility/private notes scoped; provenance retention |
| Passport / Asset Passport | Durable verified identity and provenance record; an Asset Passport applies to an approved Asset | Watchtower provenance service / qualified Operator | Public/marketplace projection where approved; Field Partner may supply evidence; Operator verifies; no destructive delete | `draft -> under_review -> verified -> published/superseded`; source facts immutable, corrections versioned; only verified Asset has Asset Passport | Intake/Job/evidence create draft; Operator verification; Manifest/Listing consume | Operator-verified identity/provenance authoritative; field claims/market valuation derived; redact personal source data; long-lived |
| Manifest | Aggregation/package of one or more provenance units when required | Watchtower or seller Organization / operations | Operators manage; buyers see approved projection; no casual edit after approval | `draft -> review -> approved/passed/completed` or rejected; approved membership locks | Passports aggregate; Listing/dispatch may consume | membership/approval authoritative; summaries derived; commercial/private fields scoped; long retention |
| Marketplace Listing | Published offer of recoverable value | Seller Organization / marketplace custodian | Public/buyers view published; listing-capable operator/seller creates; publisher changes state | `draft -> published -> reserved/sold/withdrawn/expired`; material/provenance snapshot locks at publish | Passport/Manifest creates; Offers/Transactions consume | terms/quantity/status authoritative; display metrics derived; public projection only; commercial retention |
| Offer | Buyer's proposed terms on Listing | Buyer context / marketplace | Buyer and authorized seller/marketplace; Buyer creates; parties act through commands | `submitted -> countered/accepted/rejected/withdrawn/expired`; accepted immutable | Listing/Buyer; Transaction consumes accepted offer | terms/time/actor authoritative; ranking derived; private to parties until policy allows; transaction retention |
| Transaction | Accepted exchange and settlement record | Contracting parties / marketplace and payment provider | Parties see scoped record; server creates from accepted terms; controlled settlement transitions | `pending -> authorized -> settled/fulfilled` or failed/refunded/disputed; settled facts immutable | Offer/Listing; Wallet/notifications consume | contract/payment references authoritative; fees derived; financial privacy; statutory retention |
| Wallet | Ledger account for Person or Organization | Account holder / ledger service | Owner/context financial capability; support gets limited projection; system creates | `active, restricted, closed`; balance never directly edited | Wallet Transactions, Credits, Payouts | ledger entries authoritative; balance derived; private financial record; statutory retention |
| Wallet Transaction | Immutable debit/credit ledger entry | Wallet owner / ledger service | Owner views; system creates; finance correction by reversing entry only | `pending -> posted/reversed`; posted immutable | Transaction, credit/payout/redemption events | amount/unit/reason/idempotency authoritative; balance derived; private; statutory retention |
| WTWR Credit | Typed Wallet Transaction awarding WTWR | Recipient / ledger service | Recipient views; server-side lifecycle creates; finance may reverse with reason | `pending -> posted/reversed`; no overwrite | Scan/intake/approved incentive events; Wallet consumes | award rule/version and amount authoritative; fiat display derived; private unless consented; financial retention |
| Field Partner Payout | Compensation obligation/payment for eligible authorized work or verified Processing Contribution | Field Partner / finance custodian | Partner sees own; operations sees status minimum; authorized finance approves | `eligible -> approved -> submitted -> paid` or held/failed/reversed; paid immutable | Job/Intake/verified Contribution creates eligibility; payment provider/Wallet consume | eligibility and provider reference authoritative; estimates derived; highly private; statutory retention |
| Notification | Purpose-bound message about domain state | Recipient / notification service | Recipient only plus support metadata; system/authorized actor creates; mark read/preferences change | `queued -> sent/delivered/read` or failed/expired; content snapshot immutable | Domain events create; devices/channels consume | delivery status authoritative; localized rendering derived; minimize sensitive content; short content retention |
| Audit Event | Tamper-evident record of security/business action | Watchtower governance / audit service | Restricted audit capability; server creates; no change/delete | append-only; legal hold as needed | Every meaningful mutation/context elevation; review consumes | actor/context/action/resource/result/time authoritative; sensitive; policy/statutory retention |
| Consent Record | Versioned evidence of informed authorization | Person granting consent / compliance custodian | Subject and compliance roles; explicit action creates/withdraws; no overwrite | `granted -> withdrawn/expired/superseded`; historical grants immutable | Evidence use, communications, data sharing processes | text/policy version/scope/time authoritative; current status derived; private; legal retention |

## 6. Collection–Asset–Material Model

**[Direction]** The hierarchy is:

```text
Collection
  └─ Collection Item (membership, ordering, acceptance)
       └─ Resource or Material (incoming physical value)
            ├─ Image / Evidence
            ├─ Material Estimate
            └─ identified/separated Materials
                 └─ Processing Contribution -> Asset Candidate
                      └─ Operator approval -> Asset -> Asset Passport
```

**[Founder Decision]** Asset and Collection Item are not synonyms, and an accepted capture is not automatically an Asset. Collection Item expresses inclusion of one Resource or Material in a Collection and carries collection-specific order, accepted-at, and idempotency data. A Resource is broad incoming physical value. A Material is a known physical substance/category. Processing may yield an Asset Candidate; only Operator or higher verification can establish Asset status and lock its provenance.

Every accepted capture produces one Collection Item referencing a Resource or Material. Its ledger includes stable item ID, capture timestamp, image reference, AI summary, normalized materials, estimated WTWR, estimated dollars, confidence/review state, estimation/version metadata, and idempotency key. These remain estimates/proposals. Totals are server-recomputed from item estimates at staging; duplicated description text is never a calculation source.

Residents and Field Partners may photograph, strip wire, remove motors, dismantle appliances, separate Materials, and propose uplift. A Processing Contribution preserves who acted, before/after evidence, proposed uplift, Operator-verified uplift, and resulting compensation. None of those participants may self-declare Asset status unless separately acting in an authorized Operator context.

Before staging, owners may add/remove/reorder items, replace only the pending photo, or supersede an estimate. `Scan Another Item` preserves accepted items. `Stage Bounty` uses expected collection version and idempotency key to atomically validate the ledger, calculate totals, lock the Collection, and create exactly one Scan. No partial Scan is valid.

## 7. Canonical Product Spine

| Step | Domain event | Ownership/custody consequence | Canonical authority |
|---|---|---|---|
| 1 | Collection opened | Owner retains ownership/custody | **[Recommendation]** Collection service |
| 2 | Resources/Materials accepted and estimated | No transfer; no Asset status | **[Founder Decision]** item ledger; estimates explicitly non-final |
| 3 | Stage Bounty | Collection freezes; one Scan snapshot created | **[Direction]** atomic Stage RPC |
| 4 | Pickup requested | Owner requests service; no custody transfer yet | **[Verified/Recommendation]** Scan transition, with explicit Pickup Request projection/entity |
| 5 | Job opened/claimed/advanced | Assigned Field Partner gains operational custody duties, not ownership | **[Verified]** job lifecycle RPCs and events; role rename is future implementation |
| 6 | Intake created | Physical acquisition recorded | **[Verified]** `job_create_intake()` canonical path |
| 7 | Materials processed/contributions verified | Work attribution and uplift become authoritative only after Operator review | **[Founder Decision]** target Processing Contribution/Asset Candidate contract |
| 8 | Asset approved and Passport verified | Asset status and provenance become durable | **[Verified]** current passport path exists; **[Founder Decision]** Asset approval boundary is target |
| 9 | Manifest formed if required | Multiple Assets or Materials grouped/moved; provenance not re-owned | **[Verified]** marketplace path may create required Manifest |
| 10 | Listing published | Seller offers verified value | **[Verified]** `material_listings`; publication controls recommended |
| 11 | Offer accepted and Transaction settled | Contractual ownership/value exchange according to terms | **[Verified]** offers/marketplace transactions; settlement boundary remains provider-authoritative |
| 12 | Wallet consequences posted | Financial obligation/value recorded | **[Verified]** credits/payout events exist; immutable unified ledger is target |

`jobs.status` is the operational authority after Job creation; `scans.bounty_status` is the resident-facing correlated state and must be updated only through canonical server transitions. **[Verified]** both are live today. **[Recommendation]** clients never independently reconcile them.

## 8. Entity Lifecycles

| Entity | Start | Allowed forward path | Alternate/terminal | Lock boundary |
|---|---|---|---|---|
| Membership | invited | active | suspended, ended | ended history immutable |
| Collection | open | staging -> staged | abandoned | successful atomic stage |
| Collection Item | pending | accepted | removed before stage | parent stage |
| Resource | identified | staged -> in custody -> processed/separated | disposed/consumed | staged observation and custody history append-only |
| Material | observed/estimated | separated/classified -> verified -> candidate | corrected/rejected | Operator verification |
| Processing Contribution | proposed | submitted -> verified/adjusted -> compensated | rejected | verification and posted compensation |
| Asset Candidate | proposed | under review -> approved as Asset | rejected/needs work | Operator decision |
| Asset | approved | passported -> manifested/listed -> transferred/processed | superseded/corrected | approval locks status and provenance |
| Scan | staged | pickup open -> claimed -> completed | cancelled | identity/ledger snapshot at creation |
| Pickup Request | requested | assigned/claimed -> fulfilled | cancelled | claim/custody milestone limits cancellation |
| Job | open | claimed -> en route/arrived -> intake -> downstream completion | cancelled/exception | terminal facts immutable; transitions RPC-only |
| Intake | created | received -> graded/processed | exception/corrected by addendum | custody facts at creation |
| Passport | draft | verified -> published | superseded | verification/publish |
| Manifest | draft | review -> approved/passed -> completed | rejected | approval membership snapshot |
| Listing | draft | published -> reserved -> sold | withdrawn/expired | publish snapshot; sold terminal |
| Offer | submitted | countered -> accepted | rejected/withdrawn/expired | acceptance |
| Transaction | pending | authorized -> settled -> fulfilled | failed/refunded/disputed | settled entries corrected by compensating records |
| Wallet Transaction | pending | posted | reversed | posting |

Every transition validates actor context, capability, expected source state, record version, and idempotency key; writes its domain record and Audit Event atomically where feasible; and emits notifications after commit. Illegal shortcuts return a normalized conflict/forbidden result without mutation.

## 9. Capability Model

Capabilities are verbs, not page access. Default catalog:

- Resident/business source: `collection:create`, `collection:view-own`, `collection:item:add`, `collection:item:remove`, `collection:stage`, `pickup:request`, `pickup:view-own`, `pickup:cancel-own`.
- Field Partner: `job:view-eligible`, `job:view-assigned`, `job:claim`, `job:advance-own`, `work:perform-authorized`, `evidence:add-job`, `material:process`, `uplift:propose`, `intake:create`, and `passport:evidence-submit`, each limited by approved specialization. A minimal Field Partner receives only eligible-work view, authorized-work execution, and payment capabilities.
- Watchtower Champion: `education:access`, `recognition:receive`, `referral:submit`, and any separately granted scoped operational capability; Champion status itself grants no ownership or elevated authority.
- Operations: `resident:associate`, `business:associate`, `job:view-any`, `job:assign`, `job:advance-any`, `job:cancel`, `intake:view`, `intake:correct`, `material:verify`, `asset:approve`, `passport:create`, `passport:verify`, `manifest:manage`, `dispatch:approve`, `business:service`, `listing:create`, `listing:publish`, `exception:manage`.
- Marketplace: `listing:view-public`, `offer:create`, `offer:manage-own`, `offer:accept`, `transaction:view-own`.
- Financial: `wallet:view-own`, `wallet:view-organization`, `wallet:redeem`, `payout:view-own`, `payout:approve`.
- Governance: `membership:manage`, `field-partner:approve`, `operator:grant`, `administrator:grant`, `audit:view`, `admin:configure`, `founder-private:view`. `administrator:grant` is Founder-only; `operator:grant` is Founder/Administrator-only.

Capabilities may be narrowed by `own`, `assigned`, location, organization, or `any`; broader variants never follow automatically from narrower ones. Organization membership may add organization-scoped capabilities or explicitly deny defaults. Explicit individual grants must have issuer, reason, scope, start/end, and review date.

## 10. Role and Capability Matrix

Legend: `O` own/personal, `G` organization/location scoped, `A` assigned records, `P` platform scoped, `—` none by default. Conditional capabilities require verification and lifecycle state.

| Capability group | Resident | Business Owner / Accountable Principal | Business Worker | Field Partner | Watchtower Champion | Buyer | Operator | Administrator | Founder |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Collection create/edit/stage | O | G | G* | O* | — | — | P* | P | — |
| Pickup request/view | O | G | G* | A view | — | — | P | P | — |
| Eligible work/claim/advance-own | — | — | — | P/A* | — | — | P | P | — |
| Process/separate/propose uplift | O propose | G propose | G* propose | A* propose | separate grant only | — | P | P | — |
| Verify material/uplift/Asset status | — | — | — | — | — | — | P | P | — |
| Job assign/advance-any/exception | — | — | — | — | — | — | P | P | — |
| Intake create/view/correct | — | — | — | A create* | — | — | P | P | — |
| Passport evidence/verify | own projection | G projection | G projection | A evidence* | — | public projection | P verify | P | — |
| Manifest/dispatch manage/approve | — | projection | projection* | assigned view | — | — | P | P | — |
| Listing create/publish | — | G* | G* | — | — | — | P | P | — |
| Offer create/manage-own | — | G buyer* | G buyer* | — | — | O/G | marketplace exception | P* | — |
| Wallet own/organization | O | G | G* | O | own referral only | O/G | status-only* | support* | — |
| Payout approve | — | — | — | own view | own view | — | P* | P | — |
| Business staff membership manage | — | G | G* | — | — | G* | service assist* | P | — |
| Field Partner approve | — | — | — | — | — | — | — | P | — |
| Operator grant/revoke | — | — | — | — | — | — | — | P | P |
| Administrator grant/revoke | — | — | — | — | — | — | — | — | P |
| Audit view | own* | G* | G* | own work* | own* | own transaction* | P operational | P security/ops | founder scope* |
| Executive commitments/unrestricted business finance | — | G principal | G* | — | — | own/G terms | — | only explicit legal mandate* | P* |
| Founder-private view | — | — | — | — | — | — | — | — | P |

`*` means explicit capability/approval beyond merely holding the role.

### Role-to-page matrix

| Page | Resident | Business Owner / Worker | Field Partner | Watchtower Champion | Buyer | Operator | Administrator | Founder |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Context Selector/Settings/Notifications | own | own/G | own | own/program | own/G | own | own | own |
| Resident Home/Scanner/Open Collection/Staged Bounty/Pickup Status | primary | source-mode | assigned status only | — | — | support projection | operational access | — |
| Driver Board/Driver Job | — | — | specialization-specific | — | — | oversight | operational | — |
| Business Dashboard/Location | — | principal/worker | — | scoped grant* | buyer-org only* | service | operational | — |
| Operator Dashboard/Dispatch/Intake/Passport | own projection | org projection | assigned/evidence | scoped grant* | public passport | primary | full operational | — |
| Marketplace/Listing Detail/Offers | browse | seller/buyer | browse | browse | primary | manage | operational support | — |
| Wallet | own | organization | own payout | own referral/recognition | own/G | limited status | support* | — |
| Administration | — | — | — | — | — | — | primary | governance entry* |
| Founder Workspace | — | — | — | — | — | — | — | primary |

## 11. Page and Workspace Contracts

The following rows encode all page contract fields. `Req/Opt/Never` are content rules; `Entry -> Exit` defines route logic; `States` covers empty/loading/error/offline; `M/D` gives mobile priority and desktop enhancement.

| Page | Roles / active context / category | Primary question; Req / Opt / Never | Actions | Entry -> allowed exit; forbidden | States; M/D; privacy |
|---|---|---|---|---|---|
| Context Selector | Any multi-context Account / authenticated / administrative | “Who am I acting as?” Req contexts, role, org, verification; Opt recent; Never unavailable grants | Select context; manage account | login/current chip -> context landing/settings; never deep-link into unauthorized context | Empty single-context bypass; loading validation; error safe logout; offline last context read-only; M prominent list/D org detail; private memberships |
| Resident Home | Resident / Personal / operational | “What needs attention?” Req open collection/staged pickup status; Opt wallet summary; Never operator queues | Scan/add; view pickup/wallet | selector/login -> Scanner, Collection, Pickup, Wallet; no Field Partner/Operator shortcut | Empty start scan; skeleton; recoverable error; offline cached status/no mutation; M next action/D history; own data |
| Scanner | Resident or scoped Business / source context / operational | “Can this Resource or Material be analyzed?” Req camera readiness/pending result; Opt guidance; Never fake value, Asset declaration, or authoritative lifecycle claims | Capture/analyze; retake/add item | Home/Open Collection -> Open Collection; never Stage without accepted item/server validation | Empty camera; readiness loading; camera/API/persistence errors; offline capture draft only if safe; M camera-first/D guidance; images private |
| Open Collection | Resident/Business member / owner context / operational | “What is in this bounty?” Req clickable item ledger/materials/totals/status/version; Opt notes; Never duplicate summaries | Add/retake pending/remove/stage | Home/Scanner/reload -> Scanner, Staged Bounty after success; no Pickup before stage | Empty scan CTA; loading recovery; conflict/error retains draft; offline view/local draft but no stage; M total+items+stage/D drawer/table; owner-private |
| Staged Bounty | Owner context / operational | “What was locked and can pickup open?” Req immutable snapshot/scan/status; Opt estimates; Never edit controls | Request pickup; view evidence | Stage success/status link -> Pickup Status/Home; never return to editable collection | Empty invalid route; loading; transition error retry idempotently; offline read-only; M status/action/D provenance; owner + minimum service |
| Pickup Status | Owner; assigned Field Partner/Operator projections / operational | “Where is pickup now?” Req correlated Job/Scan state, next step; Opt ETA/partner public details; Never unrelated partner PII/internal notes | Cancel if allowed/contact/view timeline | Staged/Home/notification -> Home/Job projection; no direct state skip | Empty no request; loading; retry error; offline cached stale label; M status/next action/D timeline; location need-to-know |
| Driver Board | Driver-specialized Field Partner / Field Partner / operational | “Which driving jobs can I take or continue?” Req eligible/assigned authorized Jobs; Opt distance/earnings estimate; Never resident details pre-claim or non-specialized work | Claim/open assigned | context landing -> Driver Job/context selector; no arbitrary Job IDs | Empty no work; loading; auth/GPS errors; offline assigned cache only/no claim; M assigned first/D filters/map; minimized resident data |
| Driver Job | Driver-specialized Field Partner / Field Partner / operational | “What is the next authorized milestone?” Req job status, pickup facts, action/evidence; Opt route; Never future actions, Asset-approval controls, or full wallet | Perform specialization-authorized work/advance/add evidence/create intake draft as authorized | Board/notification -> Board/Pickup/Intake; no skipped milestone | Empty inaccessible; loading; conflict refresh; offline queue only if server contract supports—otherwise read-only; M single next action/D timeline; assigned need-to-know |
| Business Dashboard | Accountable Principal/Business Worker / Business org / analytical-operational | “How is this business recovering value?” Req locations, service/collection status, accountable principal; Opt trends/wallet by financial scope; Never other org data/founder metrics | Select location/create collection/manage staff if capable | context landing -> Location/Wallet/Marketplace/Membership; no Admin | Empty onboarding; loading; scoped error; offline cached analytics; M alerts/value/D comparisons; org confidential |
| Business Location | Scoped Accountable Principal/Business Workers / Business+location / operational | “What is happening here?” Req collections/pickups/staff scope; Opt history; Never other locations absent grant | Open collection/request service/manage location by capability | Dashboard -> Collection/Pickup/Dashboard; no cross-location write | Empty create collection; loading/error; offline read-only; M current work/D history; location confidential |
| Operator Dashboard | Operator / Watchtower Operations / analytical-operational | “What requires verification or intervention?” Req associations, job/intake/material/candidate/passport/manifest/dispatch/exception queues; Opt network metrics; Never founder-private, executive commitment controls, unrestricted business finance, or unrelated raw PII | Associate/service/review/verify/approve within Operator scope | operator landing -> Dispatch/Job/Intake/Passport/Manifest/Marketplace; no Founder/Admin implicit | Empty healthy state; loading; partial-data error labeled; offline no mutations; M verification/exceptions/D command metrics; purpose-limited |
| Dispatch | Operator or Administrator / Operations / operational | “How should authorized work be assigned?” Req open Jobs/eligible Field Partners/state; Opt route optimization; Never legacy manifest-route mutation presented as canonical Job dispatch | Approve/assign/reassign/cancel by command | Dashboard/Job -> Job/Dashboard; no direct Scan completion | Empty no work; loading; conflict/error refresh; offline read-only; M exceptions/assign/D map; minimum resident location |
| Intake | Assigned authorized Field Partner/Operator/Administrator / Operations / operational | “Was custody accepted?” Req Job/evidence/measures/idempotent result; Opt notes/contribution proposals; Never listing or Asset approval before prerequisites | Create/confirm intake; submit processing evidence; manage exception by capability | Field Partner Job/Operator queue -> Passport/Job/processing review; no orphan intake | Empty invalid job; loading; validation/conflict error; offline not authoritative; M form/confirm/D evidence comparison; custody-sensitive |
| Passport | Operator/Administrator verifier; Field Partner evidence contributor; public projection / Operations / operational | “What identity and provenance are verified?” Req lineage/materials/Asset approval/status; Opt evidence/market readiness; Never resident identity in public view or approval controls for Field Partner | Submit evidence; Operator/Admin verifies Asset and Passport; create listing when eligible | Intake/Job/review/listing -> Manifest/Listing/Job; no publish from candidate/unverified provenance | Empty missing prerequisite; loading/error; offline read-only; M verification/status/D provenance; projections separate private source |
| Marketplace | Public/Buyer/Seller/Operator / public or buyer/seller context / analytical-financial | “What verified value is available?” Req published listings; Opt filters; Never drafts/private seller economics | Browse/filter/create listing only in seller/ops workspace | public/home/context -> Listing Detail/ops manager; no edit from public route | Empty no supply; loading/API error; offline cache labeled; M cards/D tables; public projection |
| Listing Detail | Public/Buyer/Seller projection / selected context / financial | “What exactly is offered?” Req terms/material/provenance projection/status; Opt documents; Never private source/payment data | Submit offer; seller manage via proper workspace | Marketplace/link -> Offers/Marketplace; no offer if self-dealing/closed | Missing 404; loading; stale/conflict; offline read-only; M terms/action/D provenance; public/party split |
| Offers | Buyer, authorized seller, marketplace Operator / buyer or seller org / financial | “What terms are pending?” Req offers/status/parties' allowed projection; Opt comparison; Never competitor/private payment data | Create/counter/accept/reject/withdraw as permitted | Listing/notification -> Transaction/Listing; no accept own offer/expired terms | Empty CTA; loading; conflict refresh; offline no accept; M pending action/D comparison; party-confidential |
| Wallet | Resident/Field Partner/Champion/Buyer/Business finance / owner context / financial | “What posted value is mine/ours?” Req ledger-derived balance/transactions; Opt estimates separated; Never other holders/full instruments | Redeem/manage destination with reauth; inspect entry | home/dashboard/context -> transaction/settings; no balance edit | Empty zero balance; loading; provider error; offline cached balance stale; M balance+recent/D export/reconcile; financial private |
| Notifications | Any / active context filter / operational | “What changed for this context?” Req recipient/context/type/read state; Opt preferences; Never cross-context sensitive content | Open target/mark read | global -> authorized record/back; no target without capability | Empty all caught up; loading/error; offline cached; M chronological/D filters; recipient-private |
| Settings | Any / account or active context / administrative | “How is this account/context configured?” Req security/context/preferences/consents; Opt devices; Never raw secrets | Update safe settings/revoke session/consent | context menu -> selector/workspace; no self-grant | Empty defaults; loading/error; offline view only; M security first/D device history; private |
| Administration | Administrator / Watchtower Administration / administrative-operational | “Who may access/configure and what operations require administrative action?” Req Operator/Field Partner grants, memberships, security audits, operational/business/manifest/passport/dispatch/exception queues; Opt operational health; Never founder-private or unrestricted business finance absent separate mandate | Grant/revoke Operator; approve Field Partner; suspend/configure/act operationally with reauth where required | explicit context -> audit/account/operational records; no Founder shortcut or domain ownership mutation | Empty scoped queues; loading; fail closed; offline unavailable; M urgent security/operations/D review tools; privileged but founder-segregated |
| Founder Workspace | Founder / Founder / administrative-analytical | “What governance/strategy requires founder action?” Req founder-private records and governance; Opt approved aggregate metrics; Never routine raw customer/employee data absent separate lawful purpose | Governance actions/private review | explicit context+reauth -> founder records/context selector; no implicit operational mutation | Empty governance state; loading; fail closed; offline unavailable; M approvals/D strategic analysis; separately protected |

**[Verified entry-point mapping]** `scanner.html`, `resident.html`, `driver-board.html`, `job.html`, `business.html`, `intake.html`, `marketplace.html`, and `marketplace-listing.html` approximate several contracts. `operations/` provides command/jobs/passport/manifest/marketplace pages but includes both canonical Job views and legacy `dispatch_runs`/`dispatch_stops` flows. `operator.html`, `operator-scanner.html`, `terminal*.html`, `dispatch.html`, and `console.html` overlap. `app/` is an experimental hash-routed shell. Context Selector, dedicated Open Collection/Staged Bounty/Pickup Status/Notifications/Settings/Administration/Founder Workspace contracts are not verified implementations.

### Page entry/exit matrix

| Workflow area | Valid entry | Valid next | Forbidden shortcut |
|---|---|---|---|
| Collection | Resident/Business Home -> Scanner/Open Collection | Scanner <-> Open Collection -> Staged Bounty | Open Collection -> Pickup before stage |
| Pickup | Staged Bounty -> Pickup Status | Pickup Status -> Home; assigned Field Partner Job | Client writes claimed/completed state |
| Field Partner | eligible work board (Driver Board for Driver specialization) -> claimed Job | specialization-authorized milestones -> Intake/evidence/contribution proposal | Job -> Asset approval; work outside specialization; Intake without assigned eligible Job |
| Operator | Dashboard -> Dispatch/Job/Intake/Passport/Exception | verified Passport -> Listing manager | Manifest/legacy dispatch writes substituting for Job RPC |
| Buyer | Marketplace -> Listing Detail -> Offers | accepted Offer -> Transaction | Listing -> Transaction without accepted terms |
| Business | Dashboard -> Location -> Collection | Staged/Pickup/Recovered Value/Wallet | cross-location or platform-admin link without grant |
| Privileged | Context Selector + reauth -> Administration or Founder Workspace | scoped records -> selector | Operator -> Admin/Founder by URL |

## 12. Navigation and Transition Rules

Each row is a state-aware command contract.

| Origin -> destination | Actor/context | Capability and required state | Side effect and audit | Return / forbidden shortcut |
|---|---|---|---|---|
| Resident Home -> Open Collection | Resident personal | `collection:create/view-own`; none/open | create/resume draft; `collection.opened/viewed` | Home; no foreign collection ID |
| Scanner -> Open Collection | Resident/business source | `collection:item:add`; pending analyzed capture, open version | append exactly one Resource/Material membership via idempotency; `collection_item.accepted` | Scanner/Open Collection; double-submit no duplicate or Asset declaration |
| Open Collection -> Staged Bounty | Owner source context | `collection:stage`; nonempty open collection, expected version | atomic lock, server totals, one Scan; `collection.staged` | Staged Bounty; no client Scan insert/bypass |
| Staged Bounty -> Pickup Status | Owner | `pickup:request`; staged Scan not already active | open pickup and exactly one active Job by canonical boundary; `pickup.requested` | status/home; no second active Job |
| Driver Board -> Driver Job | verified Driver-specialized Field Partner | `job:claim`; eligible available Job | canonical `claim_job`, correlated states/event; `job.claimed` | board/job; no direct update or ineligible work |
| Field Partner Job -> next milestone | assigned Field Partner | `job:advance-own` + specialization capability; exact source status | lifecycle RPC + Job Event; milestone audit | job/board; no skipped/retrograde status or Asset approval |
| Field Partner Job -> Intake | assigned authorized Field Partner/Operator | `intake:create`; eligible arrived/graded Job | idempotent `job_create_intake`, one Intake, required independent side effects; audit | Passport/Job; no orphan/duplicate Intake |
| Processing -> Asset review | Resident/Field Partner proposer -> Operator/Admin reviewer | `uplift:propose`, then `material:verify`/`asset:approve`; candidate under review | record Contribution, verify uplift, approve/reject Asset; audit both actors/contexts | Passport/Job; proposer cannot approve own Asset status |
| Intake/approved Asset -> Passport | Operator/Administrator | `passport:create/verify`; eligible Intake and approved Asset | idempotent Passport creation/verification; audit | Passport/Job; no verified Asset Passport before approval or duplicate on retry |
| Dispatch -> Field Partner Job | Operator/Administrator | `dispatch:approve`, `job:assign/advance-any`; valid Job/eligible Partner | server assignment command/event; audit | Dispatch/Job; no legacy route as Job authority |
| Passport -> Listing manager | Operator/seller | `listing:create`; verified provenance, manifest rules satisfied | idempotent listing/required Manifest; audit | Listing/Passport; no publish unverified data |
| Marketplace -> Listing Detail | public/Buyer | `listing:view-public`; published | view analytics only with consent/policy | Marketplace; no draft URL access |
| Listing -> Offers | Buyer context | `offer:create`; listing open, non-conflicted party | create one offer/idempotency; audit | Listing/Offers; no own-party self-deal |
| Offers -> Transaction | authorized counterparty | `offer:accept`; current terms/open listing | atomic accept/reserve/create Transaction; audit | Transaction/Offers; no direct transaction insert |
| Business Location -> Open Collection | scoped member | collection capabilities; active membership/location | create/resume org-owned draft; audit | Location; no personal-context write |
| Any -> different workspace | authenticated Person | eligible context; no unsafe unsaved work | validate/set context; privileged switch audit | new landing/previous context; no capability union |

## 13. Context Switching

The global switcher displays a context icon/badge, context name, active role, organization/location, and verification warning. Recent context memory stores only a context identifier and last route; the server revalidates eligibility on each switch and each request.

| Context | Badge | Role / organization | Permitted route family | Default landing | Switch warning |
|---|---|---|---|---|---|
| Personal / Resident | home | Resident / none | resident, scanner, collection, pickup, own wallet | Resident Home | Unsaved pending capture stays with personal draft only |
| Business name / Accountable Principal | building+key | Business Owner / selected Business | business, locations, org collections, billing/credits, staff, org wallet | Business Dashboard | Writes bind the Business; commercial/staff accountability is active |
| Business name / Worker | building | Business Worker / selected org/location | granted location/work routes only | Business Location | Capabilities may differ by location; no principal authority implied |
| Field Partner | tools/vehicle + specialization | Field Partner / employer or territory if applicable | eligible work, assigned Job, contribution, own payout | specialization landing; Driver Board for Driver | Operational duty/location sharing activates; only listed specialization applies |
| Watchtower Champion | star | Champion / sponsoring program | education, recognition, referrals, explicitly granted routes | Champion/program home **[Decision]** | Recognition does not grant ownership or elevated authority |
| Buyer or buyer org | cart | Buyer / optional buyer org | marketplace/offers/transactions/wallet | Marketplace | Offers bind selected legal party |
| Watchtower Operations | shield | Operator / Watchtower Ops | dashboard/dispatch/intake/passport/listing exceptions | Operator Dashboard | Privileged actions are audited; no founder data |
| Watchtower Administration | key | Administrator / Watchtower Admin | access/security/audit/config | Administration | Fresh MFA; no domain ownership |
| Founder Workspace | crown/lock | Founder / no implied ops org | founder-private/governance | Founder Workspace | Fresh MFA; separately logged; no routine customer access |

Switching with unsaved data prompts to stay, discard only the pending capture, or save a permitted local draft. Draft keys are namespaced by Account + context + Collection. Server commands include context ID; a stale/mismatched context is rejected. Tabs do not silently overwrite each other's active context—prefer per-tab context with session-bound validation.

## 14. Privacy and Sensitive Data

| Data class | Resident | Business Owner / Worker | Field Partner | Watchtower Champion | Buyer | Operator | Administrator | Founder |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Identity/contact | own | member minimum | own + assigned contact minimum | own/program minimum | own/party minimum | task minimum | security-support minimum | no default |
| Precise pickup location/instructions | own | scoped source | assigned active Job | — | — | dispatch need | operational need | — |
| Raw resource/pickup/processing evidence | own/source | scoped | assigned task/contribution | only separate grant | approved provenance projection | verification purpose | operational/security purpose | — |
| Wallet/payout/payment | own | principal/finance scope | own payout | own referral/recognition | own transaction | status minimum; no unrestricted business finance | support/finance explicit | aggregates only by default |
| Organization financial/recovery analytics | — | scoped | — | recognition/referral only | transaction terms only | operational need but not unrestricted finance | operational need/support scope | approved aggregate |
| Job/intake/passport | own projection | source projection | assigned | separate grant only | public/party projection | operational scope | operational scope | aggregates only |
| Security/audit records | own session subset | membership subset | own subset | own subset | own subset | operational subset | security scope | governance subset |
| Founder-private | — | — | — | — | — | — | — | explicit only |

Sensitive data is minimized in routes, notifications, logs, analytics, and public views. Evidence uses non-public storage and short-lived authorized references. Service credentials never enter browser code. Public marketplace projections exclude source identity, precise location, internal notes, raw evidence, and private economics. Export and bulk access are separate capabilities and auditable.

### Entity ownership and visibility matrix

| Entity family | Canonical owner | Normal visibility | Mutation authority |
|---|---|---|---|
| Account/Profile/Consent | Person | subject; security/compliance minimum | subject-safe commands; security/compliance controls |
| Organization/Membership/Location | Organization | scoped members; service minimum | membership/location capabilities |
| Collection/Item/Resource/Material draft | Resident or Business | owning context | owning context before stage |
| Candidate/Contribution | Resource owner + contributor attribution | contributor, owner, verification actors | contributor proposes; Operator/Admin verifies |
| Asset/Asset Passport | legal owner; Watchtower provenance custodian | owner, operational participants, approved public projection | Operator/Admin approval and verification commands |
| Scan/Pickup | source owner | owner, assigned Field Partner, Operations projections | canonical transition commands |
| Job/Event | Watchtower operations case; asset ownership unchanged | assigned participants/Operators | job RPCs only |
| Intake/Passport/Manifest | provenance/custody service | participants plus approved public projection | qualified lifecycle commands |
| Listing/Offer/Transaction | seller/buyer contracting contexts | public listing; party-confidential offers/transactions | marketplace commands |
| Wallet/Credit/Payout | wallet holder/payee | holder; finance minimum | ledger/payment services only |
| Audit/Founder-private | governance-defined | explicitly capable principals | append-only service/governance commands |

## 15. Mobile Information Hierarchy

| Page group | Priority 1 | Priority 2 | Defer/collapse |
|---|---|---|---|
| Resident Home | current collection/pickup next action | value/status | history and education |
| Scanner | live camera/readiness/capture | pending result and error recovery | methodology |
| Open Collection | status, item count, totals, Stage CTA | item ledger/materials | model metadata |
| Pickup Status | current state/next action | ETA and timeline | provenance detail |
| Field Partner Board | assigned Job then eligible work | specialization/distance/estimated pay | analytics |
| Field Partner Job | one valid authorized action/status | location/evidence/contribution | full event history and Asset approval |
| Business | urgent service/location status | recovered value | cross-location trends |
| Operator | exceptions and blocking queues | next operational actions | network analytics |
| Marketplace/Listing | availability, material, terms, primary action | provenance confidence | comparative analytics |
| Wallet/Offers | balance or pending decision | recent entries/terms | export/reconciliation |
| Admin/Founder | urgent approval/security item | scoped summary | deep analysis; desktop preferred |

Mobile never removes required context identity, state, privacy warning, error, or confirmation. It may collapse optional analytics and history. Primary actions remain reachable and are disabled with a reason when server state forbids them.

## 16. Desktop Enhancements

Desktop may add split-pane ledger/detail views, maps alongside dispatch queues, provenance timelines, multi-location comparisons, offer comparisons, reconciliation tables, audit filters, bulk review, and keyboard navigation. These are enhancements, not broader permissions. Bulk actions require per-record authorization, preview, idempotency, and an audit summary. Desktop does not expose raw fields merely because space exists.

**[Recommendation]** consolidate role workspaces around shared domain services while keeping public marketplace and marketing routes separate. **[Verified]** current pages use independent HTML/JS and overlapping Supabase/API access; the experimental `app/` hash router is not yet a canonical shell.

## 17. Source-of-Truth Matrix

| Question | Canonical source | Derived/display source | Never authoritative |
|---|---|---|---|
| Who is authenticated? | Auth Account/session validated server-side | profile display | local storage or DOM role flag |
| What may they do? | server grants + membership + active context + state | UI capability projection | hidden buttons alone; user metadata claims |
| Open collection contents | **[Recommendation]** durable Collection Item ledger/version | drawer/cards/local pending capture | duplicated description text |
| Staged bounty contents/totals | atomic staged snapshot + server estimate/rate versions | Scan summary | browser-summed unverified values |
| Resident bounty status | Scan state correlated by server command | resident timeline | client-written status |
| Operational job status | **[Verified]** `jobs.status` via lifecycle RPC | dashboard projections/events | legacy dispatch tables or arbitrary updates |
| Custody history | Job Events + Intake/Passport evidence | timeline | navigation history |
| Provenance/grade | verified Passport and Manifest | public listing projection | AI estimate alone |
| Marketplace availability/terms | Listing/Offer/Transaction commands | public/API views | cached UI after conflict |
| Wallet balance | posted Wallet Transactions | computed balance | mutable balance field or estimate |
| Credit/payout status | typed ledger/payment records/provider references | dashboard status | scan display total |
| Audit/consent | append-only Audit/Consent records | reports | application logs alone |

**[Verified]** repository/live authority currently includes Supabase tables, triggers, RLS, and SECURITY DEFINER lifecycle RPCs; their exact deployment differs from local migration history. Any implementation must reconcile live truth before migration and must preserve independent wallet, token-reserve, payout, event, manifest, and marketplace side effects.

## 18. Audit and Consent Model

Every meaningful state change records: event ID, occurred/recorded time, Account/Person, active role, organization/location context, capability, session/device risk reference, action, resource type/ID/version, source and resulting state, idempotency/correlation ID, result, reason, and safe metadata. Audit content excludes secrets and unnecessary raw payloads. Domain events and security audit events may share correlation but serve different retention/access rules.

Mandatory audits include authentication assurance changes; context switch into privileged workspaces; role/membership grant/revoke; collection stage; pickup request/cancel; Job claim/advance/cancel; Intake/Passport/Manifest/List publication; Offer acceptance; Transaction/Wallet/Credit/Payout changes; evidence access/export; consent grant/withdrawal; and all administrator/founder-private access.

Consent is versioned and purpose-specific: camera/image capture, evidence retention, precise-location sharing, notifications/marketing, marketplace provenance publication, and optional analytics/model improvement. Withdrawal stops future optional processing but does not erase lawful transaction, provenance, financial, safety, or audit obligations. Consent is not a substitute for authorization or contractual/legal basis.

## 19. Basic vs Rosetta Recommendation

**[Founder Decision]** Basic and Rosetta are product experience modes, not roles, capability bundles, authority levels, operational maturity levels, or subscription tiers.

- **Basic** is a narrow single-context experience for a Resident-only or Field-Partner-only user. It minimizes navigation and displays only that context's permitted workflow. A person stops qualifying for Basic presentation when they need routine multi-context switching; Basic never strips server-required permissions or safety information.
- **Rosetta** is the context-aware multi-role experience for a Person who acts across two or more contexts. It provides the visible context switcher, context-scoped navigation, and cross-role orientation. It grants no capability and cannot elevate an Account.

**[Recommendation]** Determine mode from the set of eligible contexts, with a user preference only where both experiences are safe. Authorization is calculated identically in both modes. Commercial packaging, if any, must use separate terminology.

## 20. Unresolved Questions

| # | Open architectural/founder question | Why it matters | Safe default pending decision |
|---:|---|---|---|
| 1 | Is Person-to-Account strictly one-to-one? | recovery, duplicate identity, enterprise SSO | one active Account per Person |
| 2 | Which legal party owns a Resource/Material/Asset after Intake and after sale? | terms, accounting, disputes | explicit transfer terms; never infer from custody or Asset approval |
| 3 | Is Pickup Request a durable first-class entity or a Scan projection? | status history, rescheduling, multiple attempts | model domain entity; initial API may project from Scan/Job |
| 4 | Can one Resource or Material entry join multiple Collections over time? | regrouping and chain of custody | yes historically, one active unstaged membership |
| 5 | What estimate/rate authority sets WTWR and dollars at stage? | financial trust and replay | server-versioned rules; estimates clearly non-settled |
| 6 | May automation create a Passport draft, and which exact Operator/Admin step verifies it? | separation of duties and provenance | Field Partner submits evidence; Operator/Admin verification is authoritative |
| 7 | When is a Manifest required? | current listing path mandates one | server policy based on listing/provenance, not UI guess |
| 8 | Which operator actions require four-eyes approval? | payouts, exceptions, corrections | payouts and high-risk corrections require separate approver |
| 9 | Business Owner versus beneficial/legal owner semantics? | membership and compliance | use “Organization Owner” for access; legal claims separate |
| 10 | Buyer identity: individual, organization, or both? | offers/contracts/wallet | support both through active context |
| 11 | Exact retention periods by evidence and jurisdiction? | privacy/compliance/storage | purpose-bound policy; no indefinite raw imagery by default |
| 12 | Offline capture support and threat model? | draft recovery/device loss | local pending drafts only, encrypted where feasible; no offline stage |
| 13 | Are founder records in the same Supabase project/schema? | separation and blast radius | separate protected schema/project/service boundary |
| 14 | Canonical dispatch model versus legacy runs/stops? | competing operational authority | Jobs/RPCs canonical; legacy route planning is non-authoritative |
| 15 | Should users eligible for Rosetta be allowed to select Basic temporarily? | navigation and support | allow only if no required context/action is hidden; no permission effect |
| 16 | When does Stage Bounty request pickup automatically, if ever? | user consent and duplicate Jobs | separate explicit pickup action by default |
| 17 | Can collections be collaboratively edited? | concurrency/membership UX | organization members only with optimistic versioning |
| 18 | What public Asset Passport fields meet privacy/commercial policy? | marketplace trust vs source privacy | allowlisted projection only |
| 19 | Which Field Partner specializations launch first, and what exact work/state transitions does each permit? | assignment, training, safety, payouts | implement only Driver-compatible behavior until separately approved |
| 20 | What is the Watchtower Champion sponsor, landing page, recognition policy, and referral compensation contract? | prevents recognition from becoming implicit authority | no operational capability without explicit grant |
| 21 | What constitutes sufficient processing and “increased value” for Asset approval by material class? | consistent Operator verification | no Asset declaration until versioned criteria exist |
| 22 | How is the single Accountable Principal transferred during dispute, departure, or business sale? | billing/access continuity | Founder/Admin-supervised verified transfer with audit |
| 23 | Smart Yard Operator, processor variants, territory management, and yard-specific roles? | future operating model | unresolved extensions; do not invent role/capability semantics |

## 21. Consequences for SQL, RPCs, APIs, and UI

These are architectural consequences, not implementation authorization.

### SQL/RLS

- Represent identity grants, Organization Membership scope, and Access Context inputs without using user-editable metadata for authorization.
- Add durable Collection/Resource/Material/Collection Item/estimate/evidence contracts only through a reconciled forward migration; add Asset Candidate, Processing Contribution, Operator approval, and Asset/Passport boundaries only after their contracts are approved. RLS applies to every exposed table with policies by ownership/membership/assignment.
- Represent exactly one active Accountable Principal per Business and explicit Business Worker scopes; encode Founder-only Administrator grants and Founder/Admin-only Operator grants without trusting editable client claims.
- Enforce one Scan per staged Collection, item idempotency, collection version checks, one active Job per Scan, and one Intake/Passport per Job with database constraints in addition to commands.
- Treat audit, consent, ledger, provenance, and lifecycle facts as append-only or compensating-entry records.
- Separate founder-private data through a stronger schema/project and explicit grant boundary; do not rely on an Operator policy exclusion alone.
- Preserve verified independent side effects while removing legacy duplicate lifecycle ownership; never assume local migrations are live.

### RPC/API

- One server command owns each transition. Commands accept context, record ID, expected version/source state, and idempotency key; they authenticate actor/membership/capability internally.
- Atomic Stage Bounty validates the full item ledger, derives totals, locks it, and returns the single Scan. Retry returns the same result.
- Pickup opening and all Job transitions remain canonical server operations. Clients do not write `jobs.status` or `scans.bounty_status` independently.
- Marketplace acceptance atomically resolves listing/offer state and creates one Transaction; payment providers remain authoritative for settlement.
- Return normalized success/conflict/forbidden/validation/retryable errors and safe projections, never unrestricted rows.

### UI

- Introduce Basic single-context and Rosetta multi-context shells around the same server authorization. Rosetta must show a visible, server-validated context selector; namespace drafts and navigation by context.
- Build pages from the contracts in section 11 and server capability/state projections. Do not render forbidden actions; do explain disabled actions when useful.
- Preserve root `scanner.html` until a tested replacement owns the canonical route. Multi-capture UI must use the durable collection contract before claiming reload recovery or staging authority.
- Quarantine or retire overlapping entry points only after incoming links, deployment exposure, and replacement journeys are verified. Do not let legacy `dispatch_runs/stops`, direct table updates, or experimental `app/` state become canonical.

## 22. Recommended Implementation Order

1. **Ratify remaining decisions.** The role hierarchy, Field Partner umbrella, Business principal/worker model, Champion, Basic/Rosetta, and Resource-to-Asset vocabulary are settled. Resolve ownership transfer, pickup representation, approval criteria, Manifest policy, estimate authority, specialization launch scope, and founder-data boundary implementation.
2. **Inventory authorization truth.** Map every live policy, function grant, API, page, and direct Supabase call to capabilities and contexts; identify every current `driver` assumption and broad Operator/Admin path; close anonymous/broad grants before adding features.
3. **Establish identity/context foundation.** Add explicit Founder-only Administrator governance, Founder/Admin Operator governance, Field Partner approvals/specializations, Accountable Principal/Business Worker scopes, Basic/Rosetta selection, server context validation, privileged MFA, and context-aware projections without changing lifecycle ownership.
4. **Harden the verified product spine.** Finish duplicate-lifecycle remediation, constraints/idempotency, lifecycle RPC authorization, and side-effect regression tests; reconcile live migration ledger first.
5. **Implement durable pre-stage collections.** Add Collection, Resource/Material Collection Item ledger, evidence references, estimates, versioning, RLS, retention, and pgTAP tests; do not create Assets at capture.
6. **Implement atomic Stage Bounty.** Produce exactly one Scan and a durable snapshot with server-derived totals; add retry/concurrency/database tests.
7. **Converge resident UI.** Extend canonical `scanner.html` into Scanner/Open Collection/Staged Bounty/Pickup Status contracts, including reload recovery and Playwright coverage.
8. **Converge Field Partner and Operator workspaces.** Preserve Driver pages as the Driver specialization while routing Job/Intake/evidence through canonical commands. Add processing proposals, Operator material/uplift/Asset verification, and Asset Passport review; isolate legacy dispatch and eliminate direct lifecycle writes.
9. **Converge marketplace and finance.** Use public projections, party contexts, atomic offer acceptance, immutable wallet transactions, payout separation of duties, and Stripe boundary tests.
10. **Add Administration and Founder separation.** Build separately authorized workspaces, audited privileged access, and private-data isolation; never derive them from Operator.
11. **Add notifications, consent, audit review, and retention jobs.** Make domain transitions observable without leaking cross-context information.
12. **Retire duplicate surfaces deliberately.** Verify routes, deploy allowlists, links, rollback, and telemetry before moving or removing any entry point.

The smallest high-value implementation checkpoint remains: server-validated Access Context and capability projection around the existing canonical lifecycle, with the settled grant hierarchy and explicit Field Partner specialization, followed by the durable Resource/Material Collection and atomic Stage contract. It preserves the product spine while preventing UI convergence from hard-coding another authorization or lifecycle model or prematurely declaring Assets.
