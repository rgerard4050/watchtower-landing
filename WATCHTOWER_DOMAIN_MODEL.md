# Watchtower Domain Model

Status: Proposed product-domain authority. This document describes business meaning, ownership, access, lifecycle, page responsibility, and navigation. It is not a database schema and does not claim that recommendations below are deployed.

Evidence labels used throughout:

- **[Verified]** observed in repository code or the read-only live-schema audit.
- **[Direction]** stated in founder, architecture, RFC, or approved planning documents.
- **[Recommendation]** the target domain model proposed here.
- **[Decision]** an unresolved founder/product decision.

## 1. Executive Summary

Watchtower converts an owner-controlled collection of assets into a traceable recovery and exchange lifecycle:

`Collection -> Asset membership -> Materials -> staged Scan -> Pickup Request -> Job -> Intake -> Passport -> optional Manifest -> Marketplace Listing -> Offer -> Transaction -> Wallet consequences`

**[Verified]** The deployed product spine begins at `scans`, opens one active `job`, and continues through `intakes`, `passports`, `material_listings`, `offers`, and `marketplace_transactions`. `jobs.status` and `scans.bounty_status` are both active state; job lifecycle RPCs synchronize them. Root `scanner.html` is the provisional canonical scanner. Existing role pages are static entry points with uneven authorization and overlapping operational implementations.

**[Direction]** True multi-capture collection work happens before the canonical scan. Staging a complete item ledger atomically creates exactly one scan. The jobs RPC lifecycle remains canonical after staging.

**[Recommendation]** A person may hold many roles, but every request executes in exactly one visible **Access Context**. Effective permission is the intersection of account status, active role, organization membership, explicit grants, record state, and assurance requirements. Roles never accumulate invisibly across contexts. Ownership, custody, access, and administrative authority remain separate.

The immediate design consequence is that pages must be contracts over context and lifecycle state, not collections of links. The server authorizes every meaningful transition; the UI merely exposes authorized actions and renders authoritative results.

## 2. Domain Language

### Identity and access vocabulary

| Term | Permanent meaning |
|---|---|
| Person | A human being. One Person may control multiple Accounts only under an explicit recovery/enterprise policy; normally one active Account maps to one Person. |
| Account | Authentication principal and security boundary: credentials, sessions, assurance, status, and role grants. It is not a business asset owner. |
| Profile | Context-neutral presentation data for a Person, separated from role-specific Resident, Driver, Buyer, or staff records. |
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
- **Asset** is a captured business object such as a device or recoverable unit. **Collection Item** is that Asset's membership in one Collection, carrying order and collection-specific acceptance metadata.
- **Material** is a normalized component/classification of an Asset. It is not a capture unless independently treated as an Asset.
- **Estimate** is a time-stamped, model/rate-versioned prediction. It is never a settled financial fact.
- **Stage Bounty** atomically freezes an open Collection ledger and creates its one canonical Scan.
- **Pickup Request** is the owner's durable request to move a staged Scan into pickup workflow.
- **Job** is the operational custody-transfer case. **Job Event** is its immutable history.
- **Intake** records physical acquisition. **Passport** records provenance/grade. **Manifest** aggregates or packages provenance when required.
- **Listing** offers verified recoverable value; **Offer** proposes terms; **Transaction** records an accepted exchange.
- **Wallet** is a ledger account; its balance is derived from immutable Wallet Transactions, including WTWR Credits and payout-related entries.

## 3. Identity, Roles, and Access Context

### Role model

A Person may concurrently be Resident, Business Owner, Business Employee, Driver, Buyer, Operator, Administrator, and Founder. **[Recommendation]** roles are separately granted and activated; they are never unioned implicitly. Resident + Driver does not imply Operator. Owner does not imply Administrator. Operator does not imply Founder. Administrator does not own customer assets.

| Role | Grant authority | Verification/approval | Revocation |
|---|---|---|---|
| Resident | Self-enrollment plus identity/contact policy | Email/phone; stronger assurance for payout or pickup changes | Self-close or trust/safety suspension, preserving records |
| Business Owner | Verified organization authority or approved invitation | Legal/business and beneficial-authority checks as policy requires | Transfer by another verified owner/admin with audit |
| Business Employee | Organization owner/member manager | Invitation acceptance; location scope | Organization membership revocation |
| Driver | Watchtower operations approval | Identity, eligibility, training, payment readiness | Operator/admin suspension; assigned work safely reassigned |
| Buyer | Self/organization enrollment | Contact/payment/business verification according to transaction risk | Self-close, org removal, or marketplace suspension |
| Operator | Explicit platform grant | Training, employment/contract status, MFA | Administrator revocation; no self-grant |
| Administrator | Separate privileged grant | MFA, security approval, periodic review | Peer/founder-controlled revocation; emergency break-glass process |
| Founder | Explicit governance grant | Strong MFA and governance approval | Governance-controlled; never inferred from Administrator |

### Effective authorization

**[Recommendation]** For each server request:

`effective capabilities = account grants ∩ active-role bundle ∩ membership scope ∩ route/resource scope ∩ lifecycle permissions ∩ assurance policy − explicit denials`

Explicit denial, suspension, expired membership, or missing verification wins. The active context supplies one role and at most one organization/location scope; cross-context reads require a purpose-built capability. A UI context switch cannot elevate the server session without server validation.

### Active-context communication

Every authenticated workspace shows a persistent context chip containing icon, context name, active role, and organization/location where applicable. Destructive, financial, publication, role-management, and cross-context actions repeat the acting context in their confirmation. Page headers identify when a record is owned by another context.

### Conflicting roles and least privilege

- A Driver cannot claim a Job belonging to an Organization they control where self-dealing rules apply; route to operator review.
- A Buyer cannot accept their own seller Listing or approve both sides of a controlled transaction.
- An Operator handling an exception cannot approve their own payout or role grant.
- An Administrator may administer access without acquiring domain ownership or routine content visibility.
- A Founder uses Founder Workspace only for founder-private records; routine operations occur in Operator/Admin contexts.
- UI hides unavailable actions, but server authorization remains decisive.

### Re-authentication and confirmation

Require fresh authentication/MFA for role grants, privileged membership changes, payout approval, wallet redemption destination changes, publication with financial effect, sensitive export, founder-private access, session revocation, and destructive archive. Require explicit confirmation (not necessarily re-authentication) for Stage Bounty, pickup cancellation, Job cancellation, offer acceptance, and context-switching with unsaved work.

### Information private even from Operators

Authentication secrets and recovery material; full payment instruments; founder strategy/cap-table/governance and privileged legal records; security keys and incident details outside assigned duty; unrelated employee records; another organization's confidential financials; resident precise location outside an active need-to-know Job; raw evidence after its operational retention window; private communications and consent choices not needed for the task. Operators receive purpose-limited projections, not blanket table access.

## 4. Organizations and Memberships

**[Recommendation]** Organization is the common parent for businesses, Watchtower Operations, Watchtower Administration, and buyer organizations. Business is an organization subtype/domain record; Business Location is an operational scope beneath it. Founder Workspace is not an Organization membership shortcut—it requires a separate Founder grant.

A Membership has person, organization, membership role, location scope, capability additions/removals, status (`invited`, `active`, `suspended`, `ended`), effective dates, inviter, approver, and audit references. Membership changes affect future authorization immediately but do not rewrite historical actor context.

Organization ownership grants organization-governance capabilities, not platform administration. Staff may be limited to one or more locations. Financial capabilities are separately scoped from operational capabilities. Removing a member revokes new access and sessions/context tokens; historical records retain their actor identity.

## 5. Core Entity Definitions

The following compact catalog covers definition/purpose; canonical owner and custodian; view/create/change/archive; creation, lifecycle, transitions and lock; producers, consumers and references; authoritative/derived/private/shared data; and retention. “Archive” never means erasing required financial, consent, provenance, or audit history.

| Entity | Definition and purpose | Owner / custodian | Access and mutation | Creation, lifecycle, transitions, lock | Producers, consumers, references | Authority, privacy, sharing, retention |
|---|---|---|---|---|---|---|
| Person | Human identity behind platform participation | Person / trust team | Person views profile; authorized support limited; account processes create/change; never hard-delete linked history | `active, restricted, deceased/closed`; identity facts lock after verification except reviewed correction | Account/Profile/Roles/Memberships consume | Verified identity authoritative; display derived; PII private; retain while obligations persist |
| Account | Authentication/security principal | Person / identity service | Person and security admins; auth system creates; Person changes safe settings; security archives | `pending, active, locked, closed`; security events immutable | Person, Sessions, role grants | Auth provider authoritative; secrets never shared; security retention policy |
| Resident | Role-specific participant who stages owned/presented assets | Person / resident service | Self and need-to-know operations; self-enrollment; verified edits; archive after obligations | `pending, active, suspended, closed`; history locks | Account, Collections, Scans, Wallet | Resident linkage authoritative; contact/location private; share minimum with assigned Driver |
| Organization | Legal/operational group | Legal organization / designated admins | Members by scoped capability; verified admins create/change; archive only after obligations | `pending, verified, active, suspended, closed` | Memberships, Locations, Wallets, Listings | Legal identity authoritative; public trading identity shareable; sensitive governance retained |
| Business | Organization participating as service customer/source | Organization / owners | Scoped members and operations; approved owner creates/changes | organization lifecycle plus service status | Locations, Collections, recovered value | Business record authoritative; analytics derived; contracts/financials private |
| Business Location | Physical/service site within Business | Business / location managers | Scoped staff, assigned operations; authorized member creates/changes | `active, paused, closed`; address changes audited | Collections, pickups, Jobs, staff memberships | Verified address authoritative; routing derived; precise access instructions restricted |
| Membership | Person-to-Organization authorization relationship | Organization / membership managers | Member sees own; managers manage; no destructive delete | `invited -> active -> suspended/ended`; grant history immutable | Context and authorization engine | Scope and dates authoritative; derived capabilities; limited sharing; retain audit term |
| Driver | Verified custody-transfer worker | Person or employer / operations | Driver own; operators job-relevant; ops approves/changes | `applicant, approved, active, suspended, ended` | Jobs, Intakes, Payouts | approval authoritative; availability derived; identity/payment private |
| Operator | Platform operations worker | Watchtower / administration | Self and admins; admin grants; restricted edits | `pending, active, suspended, ended` | Jobs, Intakes, Passports, exceptions | grants authoritative; actions auditable; personnel data restricted |
| Buyer | Person/org marketplace actor | Person or buyer Organization / marketplace | Own context; seller sees transaction minimum; approved enrollment | `pending, active, restricted, closed` | Offers, Transactions | verification authoritative; preferences derived; payment data private |
| Administrator | Privileged access-management actor | Watchtower / security governance | Only admins/founder as policy; never self-create | `nominated, active, suspended, ended`; grants immutable history | Accounts, Memberships, audits | grant authoritative; privileged activity retained and reviewed |
| Founder | Governance actor with separate private scope | Governance body / founder-security function | Explicit founders only; operators/admins excluded absent separate grant | `active, emeritus, revoked`; governance changes immutable | Founder Workspace/private records | founder grant authoritative; private corpus separately encrypted/retained |
| Collection | Editable pre-stage container of Assets | Resident or Business context / owner until staging | Owner/context staff edit; service sees only when submitted/consented | `open -> staging -> staged`; `open -> abandoned`; staged locks; correction creates new version/workflow | Collection Items; Stage RPC creates Scan | Item ledger/version authoritative; totals server-derived at stage; drafts private; abandoned retention bounded |
| Collection Item | Membership linking one Asset to one Collection | Collection owner / owner | Owner adds/removes/reorders while open; never mutate after stage | `pending -> accepted -> removed`; accepted ledger locks at stage | Collection, Asset, estimates/evidence | membership/order authoritative; display totals derived; follows collection privacy/retention |
| Asset | Independently identifiable captured object | Presenting owner until legal transfer / current custodian | Owner and lifecycle participants by need; create on accepted capture; corrections append | `identified -> staged -> in_custody -> processed/disposed/sold`; identity/provenance append-only after stage | Materials, Evidence, Passport, listing lineage | identity/provenance authoritative as observed; estimate derived; sensitive imagery restricted; provenance long-lived |
| Material | Normalized component/classification vocabulary or observed component | Vocabulary: Watchtower; occurrence: Asset owner / operator | Public vocabulary read; qualified systems/operators curate; no transactional delete | taxonomy lifecycle; asset assertion `estimated -> verified/corrected`; verified record append-only | Asset, Estimates, Passport, Listing | controlled code/name authoritative; quantities/grade verified later; shareable where non-sensitive |
| Material Estimate | Model/rate-versioned prediction per Asset/material | Asset owner / estimation service | Owner and operational reviewers; service creates; qualified correction/versioning | `generated -> accepted/review -> superseded/verified`; never overwrite provenance | AI scan, rate card; totals and planning consume | inputs/model/rate/version authoritative; value/confidence derived; share only appropriate estimate |
| Image / Evidence | Stored capture supporting identity, pickup, grade, or custody | Underlying record owner; custody by secure storage | Owner before submission; assigned actors by purpose; signed access only; no arbitrary delete | `captured -> attached -> retained -> expired`; hash/metadata immutable; redaction creates derivative | Asset/Scan/Job/Intake/Passport/Audit | object hash/reference authoritative; thumbnails derived; high privacy; lifecycle retention by evidence purpose |
| Scan | One staged bounty record bridging collection to pickup/job spine | Staging Resident/Business / Watchtower lifecycle | Owner views/opens/cancels where allowed; server creates at stage; RPCs mutate | bounty state **[Verified]** `null/open/claimed/completed/cancelled` (exact legacy vocabulary remains migration-defined); stage identity locks | Collection stage creates; Pickup/Job consume; references owner/evidence | staged snapshot authoritative; UI summaries derived; shared minimum with assigned actors; provenance retention |
| Pickup Request | Intent to collect a staged Scan; concept may currently be represented by Scan transition | Scan owner / operations | Owner create/view/cancel pre-claim; assigned actors view; server state change | `requested -> dispatched/claimed -> fulfilled` or `cancelled`; locks after custody milestones | Scan, Job; notifications consume | request time/location/instructions authoritative; ETA derived; location private/need-to-know; operational retention |
| Job | Canonical operational custody-transfer case | Watchtower operations; asset ownership unchanged / assigned Driver then intake facility | Drivers scoped available/assigned; Operators broad; lifecycle RPCs create/change; archive only terminal | **[Verified]** canonical server statuses include open/claimed and downstream milestones through intake/completion/cancel; transitions only RPC; terminal locked | Scan trigger/RPC creates; Job Events, Intake, Passport, Payout consume | `jobs.status` authoritative for operations while synchronized to Scan resident state; route/ETA derived; retain provenance |
| Job Event | Immutable statement of Job transition/action | Job history / Watchtower | Job participants see projections; server/triggers create; no change/delete | append-only event types; corrections append compensating event | Job RPCs/triggers create; timelines/audit consume | actor/context/time/type authoritative; presentation derived; privacy follows Job; long retention |
| Intake | Record of physical acquisition and custody acceptance | Receiving Watchtower/business entity / operator facility | Assigned Driver/Operator create via canonical RPC; participants view projections; correction controlled | `created/received -> graded/processed` plus exceptions; creation/chain facts lock | Job creates; Passport and payout consequences consume | measured intake facts authoritative; estimates derived; facility/private notes scoped; provenance retention |
| Passport | Durable provenance and grading record for recovered Asset/material | Watchtower provenance service / qualified Operator | Public/marketplace projection where approved; qualified creation/correction; no destructive delete | `draft -> verified -> published/superseded`; source facts immutable, corrections versioned | Intake/Job create; Manifest/Listing consume | provenance/grade authoritative; market valuation derived; redact personal source data; long-lived |
| Manifest | Aggregation/package of one or more provenance units when required | Watchtower or seller Organization / operations | Operators manage; buyers see approved projection; no casual edit after approval | `draft -> review -> approved/passed/completed` or rejected; approved membership locks | Passports aggregate; Listing/dispatch may consume | membership/approval authoritative; summaries derived; commercial/private fields scoped; long retention |
| Marketplace Listing | Published offer of recoverable value | Seller Organization / marketplace custodian | Public/buyers view published; listing-capable operator/seller creates; publisher changes state | `draft -> published -> reserved/sold/withdrawn/expired`; material/provenance snapshot locks at publish | Passport/Manifest creates; Offers/Transactions consume | terms/quantity/status authoritative; display metrics derived; public projection only; commercial retention |
| Offer | Buyer's proposed terms on Listing | Buyer context / marketplace | Buyer and authorized seller/marketplace; Buyer creates; parties act through commands | `submitted -> countered/accepted/rejected/withdrawn/expired`; accepted immutable | Listing/Buyer; Transaction consumes accepted offer | terms/time/actor authoritative; ranking derived; private to parties until policy allows; transaction retention |
| Transaction | Accepted exchange and settlement record | Contracting parties / marketplace and payment provider | Parties see scoped record; server creates from accepted terms; controlled settlement transitions | `pending -> authorized -> settled/fulfilled` or failed/refunded/disputed; settled facts immutable | Offer/Listing; Wallet/notifications consume | contract/payment references authoritative; fees derived; financial privacy; statutory retention |
| Wallet | Ledger account for Person or Organization | Account holder / ledger service | Owner/context financial capability; support gets limited projection; system creates | `active, restricted, closed`; balance never directly edited | Wallet Transactions, Credits, Payouts | ledger entries authoritative; balance derived; private financial record; statutory retention |
| Wallet Transaction | Immutable debit/credit ledger entry | Wallet owner / ledger service | Owner views; system creates; finance correction by reversing entry only | `pending -> posted/reversed`; posted immutable | Transaction, credit/payout/redemption events | amount/unit/reason/idempotency authoritative; balance derived; private; statutory retention |
| WTWR Credit | Typed Wallet Transaction awarding WTWR | Recipient / ledger service | Recipient views; server-side lifecycle creates; finance may reverse with reason | `pending -> posted/reversed`; no overwrite | Scan/intake/approved incentive events; Wallet consumes | award rule/version and amount authoritative; fiat display derived; private unless consented; financial retention |
| Driver Payout | Compensation obligation/payment for completed eligible work | Driver / finance custodian | Driver sees own; operations sees status minimum; finance approves | `eligible -> approved -> submitted -> paid` or held/failed/reversed; paid immutable | Job/Intake creates eligibility; payment provider/Wallet consume | eligibility and provider reference authoritative; estimates derived; highly private; statutory retention |
| Notification | Purpose-bound message about domain state | Recipient / notification service | Recipient only plus support metadata; system/authorized actor creates; mark read/preferences change | `queued -> sent/delivered/read` or failed/expired; content snapshot immutable | Domain events create; devices/channels consume | delivery status authoritative; localized rendering derived; minimize sensitive content; short content retention |
| Audit Event | Tamper-evident record of security/business action | Watchtower governance / audit service | Restricted audit capability; server creates; no change/delete | append-only; legal hold as needed | Every meaningful mutation/context elevation; review consumes | actor/context/action/resource/result/time authoritative; sensitive; policy/statutory retention |
| Consent Record | Versioned evidence of informed authorization | Person granting consent / compliance custodian | Subject and compliance roles; explicit action creates/withdraws; no overwrite | `granted -> withdrawn/expired/superseded`; historical grants immutable | Evidence use, communications, data sharing processes | text/policy version/scope/time authoritative; current status derived; private; legal retention |

## 6. Collection–Asset–Material Model

**[Direction]** The hierarchy is:

```text
Collection
  └─ Collection Item (membership, ordering, acceptance)
       └─ Asset (captured recoverable object)
            ├─ Image / Evidence
            ├─ Material Estimate
            └─ identified Materials
```

Asset and Collection Item are not synonyms. An Asset is the enduring business object; Collection Item expresses inclusion in a particular Collection and carries collection-specific order, accepted-at, and idempotency data. This permits future regrouping without falsifying asset identity. For the first implementation an Asset may belong to only one active pre-stage Collection, but that is a product constraint, not vocabulary collapse.

Every accepted capture produces one Asset and one Collection Item. Its ledger includes stable item ID, capture timestamp, image reference, AI summary, normalized materials, estimated WTWR, estimated dollars, confidence/review state, estimation/version metadata, and idempotency key. Totals are server-recomputed from item estimates at staging; duplicated description text is never a calculation source.

Before staging, owners may add/remove/reorder items, replace only the pending photo, or supersede an estimate. `Scan Another Item` preserves accepted items. `Stage Bounty` uses expected collection version and idempotency key to atomically validate the ledger, calculate totals, lock the Collection, and create exactly one Scan. No partial Scan is valid.

## 7. Canonical Product Spine

| Step | Domain event | Ownership/custody consequence | Canonical authority |
|---|---|---|---|
| 1 | Collection opened | Owner retains ownership/custody | **[Recommendation]** Collection service |
| 2 | Assets accepted and materials estimated | No transfer | **[Recommendation]** item ledger; estimates explicitly non-final |
| 3 | Stage Bounty | Collection freezes; one Scan snapshot created | **[Direction]** atomic Stage RPC |
| 4 | Pickup requested | Owner requests service; no custody transfer yet | **[Verified/Recommendation]** Scan transition, with explicit Pickup Request projection/entity |
| 5 | Job opened/claimed/advanced | Assigned Driver gains operational custody duties, not ownership | **[Verified]** job lifecycle RPCs and events |
| 6 | Intake created | Physical acquisition recorded | **[Verified]** `job_create_intake()` canonical path |
| 7 | Passport created/graded | Provenance becomes durable | **[Verified]** job lifecycle/passport path |
| 8 | Manifest formed if required | Provenance aggregated, not re-owned | **[Verified]** marketplace path may create required Manifest |
| 9 | Listing published | Seller offers verified value | **[Verified]** `material_listings`; publication controls recommended |
| 10 | Offer accepted and Transaction settled | Contractual ownership/value exchange according to terms | **[Verified]** offers/marketplace transactions; settlement boundary remains provider-authoritative |
| 11 | Wallet consequences posted | Financial obligation/value recorded | **[Verified]** credits/payout events exist; immutable unified ledger is target |

`jobs.status` is the operational authority after Job creation; `scans.bounty_status` is the resident-facing correlated state and must be updated only through canonical server transitions. **[Verified]** both are live today. **[Recommendation]** clients never independently reconcile them.

## 8. Entity Lifecycles

| Entity | Start | Allowed forward path | Alternate/terminal | Lock boundary |
|---|---|---|---|---|
| Membership | invited | active | suspended, ended | ended history immutable |
| Collection | open | staging -> staged | abandoned | successful atomic stage |
| Collection Item | pending | accepted | removed before stage | parent stage |
| Asset | identified | staged -> in custody -> processed -> listed/sold/disposed | exception | provenance append-only after stage |
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
- Driver: `job:view-available`, `job:view-assigned`, `job:claim`, `job:advance-own`, `evidence:add-job`, `intake:create`, `passport:create` (only where workflow/training permits).
- Operations: `job:view-any`, `job:assign`, `job:advance-any`, `job:cancel`, `intake:view`, `intake:correct`, `passport:create`, `passport:grade`, `manifest:manage`, `listing:create`, `listing:publish`, `exception:manage`.
- Marketplace: `listing:view-public`, `offer:create`, `offer:manage-own`, `offer:accept`, `transaction:view-own`.
- Financial: `wallet:view-own`, `wallet:view-organization`, `wallet:redeem`, `payout:view-own`, `payout:approve`.
- Governance: `membership:manage`, `role:grant`, `audit:view`, `admin:configure`, `founder-private:view`.

Capabilities may be narrowed by `own`, `assigned`, location, organization, or `any`; broader variants never follow automatically from narrower ones. Organization membership may add organization-scoped capabilities or explicitly deny defaults. Explicit individual grants must have issuer, reason, scope, start/end, and review date.

## 10. Role and Capability Matrix

Legend: `O` own/personal, `G` organization/location scoped, `A` assigned records, `P` platform scoped, `—` none by default. Conditional capabilities require verification and lifecycle state.

| Capability group | Resident | Biz Owner | Biz Employee | Driver | Buyer | Operator | Admin | Founder |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Collection create/edit/stage | O | G | G* | — | — | P* | — | — |
| Pickup request/view | O | G | G* | A view | — | P | — | — |
| Job available/claim/advance-own | — | — | — | P/A | — | P | — | — |
| Job assign/advance-any/exception | — | — | — | — | — | P | P* | — |
| Intake create/view/correct | — | — | — | A create | — | P | P* | — |
| Passport create/grade | own projection | G projection | G projection | A create* | public projection | P | P* | — |
| Listing create/publish | — | G* | G* | — | — | P | P* | — |
| Offer create/manage-own | — | G buyer* | G buyer* | — | O/G | marketplace exception | — | — |
| Wallet own/organization | O | G | G* | O | O/G | status-only* | admin support* | — |
| Payout approve | — | — | — | own view | — | P* | P* | — |
| Membership manage | — | G | G* | — | G* | Watchtower G* | P | — |
| Role grant | — | org roles only | — | — | — | — | P | governance* |
| Audit view | own events* | G* | G* | own job* | own transaction* | P operational | P security | founder scope* |
| Admin configure | — | — | — | — | — | — | P | — |
| Founder-private view | — | — | — | — | — | — | — | P |

`*` means explicit capability/approval beyond merely holding the role.

### Role-to-page matrix

| Page | Resident | Business | Driver | Buyer | Operator | Admin | Founder |
|---|---:|---:|---:|---:|---:|---:|---:|
| Context Selector/Settings/Notifications | own | own/G | own | own/G | own | own | own |
| Resident Home/Scanner/Open Collection/Staged Bounty/Pickup Status | primary | source-mode | assigned status only | — | support projection | — | — |
| Driver Board/Driver Job | — | — | primary | — | oversight | limited | — |
| Business Dashboard/Location | — | primary | — | buyer-org only* | service projection | access admin* | — |
| Operator Dashboard/Dispatch/Intake/Passport | own-record projection | org projection | assigned | public passport | primary | exception/access* | — |
| Marketplace/Listing Detail/Offers | browse | seller/buyer | browse | primary | manage | support* | — |
| Wallet | own | organization | own payout | own/G | limited status | support* | — |
| Administration | — | — | — | — | — | primary | — |
| Founder Workspace | — | — | — | — | — | — | primary |

## 11. Page and Workspace Contracts

The following rows encode all page contract fields. `Req/Opt/Never` are content rules; `Entry -> Exit` defines route logic; `States` covers empty/loading/error/offline; `M/D` gives mobile priority and desktop enhancement.

| Page | Roles / active context / category | Primary question; Req / Opt / Never | Actions | Entry -> allowed exit; forbidden | States; M/D; privacy |
|---|---|---|---|---|
| Context Selector | Any multi-context Account / authenticated / administrative | “Who am I acting as?” Req contexts, role, org, verification; Opt recent; Never unavailable grants | Select context; manage account | login/current chip -> context landing/settings; never deep-link into unauthorized context | Empty single-context bypass; loading validation; error safe logout; offline last context read-only; M prominent list/D org detail; private memberships |
| Resident Home | Resident / Personal / operational | “What needs attention?” Req open collection/staged pickup status; Opt wallet summary; Never operator queues | Scan/add; view pickup/wallet | selector/login -> Scanner, Collection, Pickup, Wallet; no Driver/Operator shortcut | Empty start scan; skeleton; recoverable error; offline cached status/no mutation; M next action/D history; own data |
| Scanner | Resident or scoped Business / source context / operational | “Can this asset be analyzed?” Req camera readiness/pending result; Opt guidance; Never fake value or authoritative lifecycle claims | Capture/analyze; retake/add item | Home/Open Collection -> Open Collection; never Stage without accepted item/server validation | Empty camera; readiness loading; camera/API/persistence errors; offline capture draft only if safe; M camera-first/D guidance; images private |
| Open Collection | Resident/Business member / owner context / operational | “What is in this bounty?” Req clickable item ledger/materials/totals/status/version; Opt notes; Never duplicate summaries | Add/retake pending/remove/stage | Home/Scanner/reload -> Scanner, Staged Bounty after success; no Pickup before stage | Empty scan CTA; loading recovery; conflict/error retains draft; offline view/local draft but no stage; M total+items+stage/D drawer/table; owner-private |
| Staged Bounty | Owner context / operational | “What was locked and can pickup open?” Req immutable snapshot/scan/status; Opt estimates; Never edit controls | Request pickup; view evidence | Stage success/status link -> Pickup Status/Home; never return to editable collection | Empty invalid route; loading; transition error retry idempotently; offline read-only; M status/action/D provenance; owner + minimum service |
| Pickup Status | Owner; assigned Driver/Operator projections / operational | “Where is pickup now?” Req correlated Job/Scan state, next step; Opt ETA/driver public details; Never unrelated driver PII/internal notes | Cancel if allowed/contact/view timeline | Staged/Home/notification -> Home/Job projection; no direct state skip | Empty no request; loading; retry error; offline cached stale label; M status/next action/D timeline; location need-to-know |
| Driver Board | Driver / Driver / operational | “Which jobs can I take or continue?” Req available/assigned authorized Jobs; Opt distance/earnings estimate; Never resident details pre-claim | Claim/open assigned | context landing -> Driver Job/context selector; no arbitrary Job IDs | Empty no work; loading; auth/GPS errors; offline assigned cache only/no claim; M assigned first/D filters/map; minimized resident data |
| Driver Job | Driver assigned / Driver / operational | “What is the next legal milestone?” Req job status, pickup facts, action/evidence; Opt route; Never future actions or full wallet | Advance own/add evidence/create intake/passport as authorized | Board/notification -> Board/Pickup/Intake; no skipped milestone | Empty inaccessible; loading; conflict refresh; offline queue only if server contract supports—otherwise read-only; M single next action/D timeline; assigned need-to-know |
| Business Dashboard | Owner/Employee / Business org / analytical-operational | “How is this business recovering value?” Req locations, service/collection status; Opt trends/wallet; Never other org data/founder metrics | Select location/create collection/manage allowed staff | context landing -> Location/Wallet/Marketplace/Membership; no Admin | Empty onboarding; loading; scoped error; offline cached analytics; M alerts/value/D comparisons; org confidential |
| Business Location | Scoped members / Business+location / operational | “What is happening here?” Req collections/pickups/staff scope; Opt history; Never other locations absent grant | Open collection/request service/manage location | Dashboard -> Collection/Pickup/Dashboard; no cross-location write | Empty create collection; loading/error; offline read-only; M current work/D history; location confidential |
| Operator Dashboard | Operator / Watchtower Operations / analytical-operational | “What requires intervention?” Req job/intake/passport/exception queues; Opt network metrics; Never founder/private payment or unrelated raw PII | Open queue/exception | operator landing -> Dispatch/Job/Intake/Passport/Marketplace; no Founder/Admin implicit | Empty healthy state; loading; partial-data error labeled; offline no mutations; M exceptions/D command metrics; purpose-limited |
| Dispatch | Operator with dispatch / Operations / operational | “How should authorized work be assigned?” Req open Jobs/drivers/state; Opt route optimization; Never legacy manifest-route mutation presented as canonical Job dispatch | Assign/reassign/cancel by command | Dashboard/Job -> Job/Dashboard; no direct Scan completion | Empty no work; loading; conflict/error refresh; offline read-only; M exceptions/assign/D map; minimum resident location |
| Intake | Assigned Driver/Operator / Operations / operational | “Was custody accepted?” Req Job/evidence/measures/idempotent result; Opt notes; Never listing controls before intake success | Create/confirm intake; exception | Driver Job/Operator queue -> Passport/Job; no orphan intake | Empty invalid job; loading; validation/conflict error; offline not authoritative; M form/confirm/D evidence comparison; custody-sensitive |
| Passport | Operator/assigned creator; public projection / Operations / operational | “What provenance and grade are verified?” Req source lineage/materials/status; Opt evidence/market readiness; Never resident identity in public view | Create/grade/verify; create listing when eligible | Intake/Job/market listing -> Manifest/Listing/Job; no publish from unverified provenance | Empty missing prerequisite; loading/error; offline read-only; M grade/status/D provenance; projections separate private source |
| Marketplace | Public/Buyer/Seller/Operator / public or buyer/seller context / analytical-financial | “What verified value is available?” Req published listings; Opt filters; Never drafts/private seller economics | Browse/filter/create listing only in seller/ops workspace | public/home/context -> Listing Detail/ops manager; no edit from public route | Empty no supply; loading/API error; offline cache labeled; M cards/D tables; public projection |
| Listing Detail | Public/Buyer/Seller projection / selected context / financial | “What exactly is offered?” Req terms/material/provenance projection/status; Opt documents; Never private source/payment data | Submit offer; seller manage via proper workspace | Marketplace/link -> Offers/Marketplace; no offer if self-dealing/closed | Missing 404; loading; stale/conflict; offline read-only; M terms/action/D provenance; public/party split |
| Offers | Buyer, authorized seller, marketplace Operator / buyer or seller org / financial | “What terms are pending?” Req offers/status/parties' allowed projection; Opt comparison; Never competitor/private payment data | Create/counter/accept/reject/withdraw as permitted | Listing/notification -> Transaction/Listing; no accept own offer/expired terms | Empty CTA; loading; conflict refresh; offline no accept; M pending action/D comparison; party-confidential |
| Wallet | Resident/Driver/Buyer/Business finance / owner context / financial | “What posted value is mine/ours?” Req ledger-derived balance/transactions; Opt estimates separated; Never other holders/full instruments | Redeem/manage destination with reauth; inspect entry | home/dashboard/context -> transaction/settings; no balance edit | Empty zero balance; loading; provider error; offline cached balance stale; M balance+recent/D export/reconcile; financial private |
| Notifications | Any / active context filter / operational | “What changed for this context?” Req recipient/context/type/read state; Opt preferences; Never cross-context sensitive content | Open target/mark read | global -> authorized record/back; no target without capability | Empty all caught up; loading/error; offline cached; M chronological/D filters; recipient-private |
| Settings | Any / account or active context / administrative | “How is this account/context configured?” Req security/context/preferences/consents; Opt devices; Never raw secrets | Update safe settings/revoke session/consent | context menu -> selector/workspace; no self-grant | Empty defaults; loading/error; offline view only; M security first/D device history; private |
| Administration | Administrator / Watchtower Administration / administrative | “Who may access/configure the platform?” Req grants/memberships/security audits; Opt operational health; Never founder-private or routine customer content | Grant/revoke/suspend/configure with reauth | explicit context -> audit/account; no Founder shortcut or domain ownership mutation | Empty scoped queues; loading; fail closed; offline unavailable; M urgent security/D review tools; privileged segregated |
| Founder Workspace | Founder / Founder / administrative-analytical | “What governance/strategy requires founder action?” Req founder-private records and governance; Opt approved aggregate metrics; Never routine raw customer/employee data absent separate lawful purpose | Governance actions/private review | explicit context+reauth -> founder records/context selector; no implicit operational mutation | Empty governance state; loading; fail closed; offline unavailable; M approvals/D strategic analysis; separately protected |

**[Verified entry-point mapping]** `scanner.html`, `resident.html`, `driver-board.html`, `job.html`, `business.html`, `intake.html`, `marketplace.html`, and `marketplace-listing.html` approximate several contracts. `operations/` provides command/jobs/passport/manifest/marketplace pages but includes both canonical Job views and legacy `dispatch_runs`/`dispatch_stops` flows. `operator.html`, `operator-scanner.html`, `terminal*.html`, `dispatch.html`, and `console.html` overlap. `app/` is an experimental hash-routed shell. Context Selector, dedicated Open Collection/Staged Bounty/Pickup Status/Notifications/Settings/Administration/Founder Workspace contracts are not verified implementations.

### Page entry/exit matrix

| Workflow area | Valid entry | Valid next | Forbidden shortcut |
|---|---|---|---|
| Collection | Resident/Business Home -> Scanner/Open Collection | Scanner <-> Open Collection -> Staged Bounty | Open Collection -> Pickup before stage |
| Pickup | Staged Bounty -> Pickup Status | Pickup Status -> Home; assigned Driver Job | Client writes claimed/completed state |
| Driver | Driver Board -> claimed Driver Job | milestone-by-milestone -> Intake -> Passport | Board -> Intake without assigned eligible Job |
| Operator | Dashboard -> Dispatch/Job/Intake/Passport/Exception | verified Passport -> Listing manager | Manifest/legacy dispatch writes substituting for Job RPC |
| Buyer | Marketplace -> Listing Detail -> Offers | accepted Offer -> Transaction | Listing -> Transaction without accepted terms |
| Business | Dashboard -> Location -> Collection | Staged/Pickup/Recovered Value/Wallet | cross-location or platform-admin link without grant |
| Privileged | Context Selector + reauth -> Administration or Founder Workspace | scoped records -> selector | Operator -> Admin/Founder by URL |

## 12. Navigation and Transition Rules

Each row is a state-aware command contract.

| Origin -> destination | Actor/context | Capability and required state | Side effect and audit | Return / forbidden shortcut |
|---|---|---|---|---|
| Resident Home -> Open Collection | Resident personal | `collection:create/view-own`; none/open | create/resume draft; `collection.opened/viewed` | Home; no foreign collection ID |
| Scanner -> Open Collection | Resident/business source | `collection:item:add`; pending analyzed capture, open version | append exactly one Asset membership via idempotency; `collection_item.accepted` | Scanner/Open Collection; double-submit no duplicate |
| Open Collection -> Staged Bounty | Owner source context | `collection:stage`; nonempty open collection, expected version | atomic lock, server totals, one Scan; `collection.staged` | Staged Bounty; no client Scan insert/bypass |
| Staged Bounty -> Pickup Status | Owner | `pickup:request`; staged Scan not already active | open pickup and exactly one active Job by canonical boundary; `pickup.requested` | status/home; no second active Job |
| Driver Board -> Driver Job | verified Driver | `job:claim`; available Job | canonical `claim_job`, correlated states/event; `job.claimed` | board/job; no direct update |
| Driver Job -> next milestone | assigned Driver | `job:advance-own`; exact source status | lifecycle RPC + Job Event; milestone audit | job/board; no skipped or retrograde status |
| Driver Job -> Intake | assigned Driver/Operator | `intake:create`; eligible arrived/graded Job | idempotent `job_create_intake`, one Intake, required independent side effects; audit | Passport/Job; no orphan/duplicate Intake |
| Intake -> Passport | authorized creator | `passport:create`; eligible Intake/Job | idempotent passport creation, one Passport; audit | Passport/Job; no second Passport on retry |
| Dispatch -> Driver Job | Operator | `job:assign/advance-any`; valid Job/Driver | server assignment command/event; audit | Dispatch/Job; no legacy route as Job authority |
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
| Business name / Owner | building+owner | Business Owner / selected Business | business, locations, org collections, staff, org wallet | Business Dashboard | Writes become organization-owned; confirm location |
| Business name / Employee | building | Business Employee / selected org/location | granted location/work routes only | Business Location | Capabilities may differ by location |
| Driver | vehicle | Driver / employer if applicable | Driver Board/Job/own payout | Driver Board | Operational duty and location sharing activate |
| Buyer or buyer org | cart | Buyer / optional buyer org | marketplace/offers/transactions/wallet | Marketplace | Offers bind selected legal party |
| Watchtower Operations | shield | Operator / Watchtower Ops | dashboard/dispatch/intake/passport/listing exceptions | Operator Dashboard | Privileged actions are audited; no founder data |
| Watchtower Administration | key | Administrator / Watchtower Admin | access/security/audit/config | Administration | Fresh MFA; no domain ownership |
| Founder Workspace | crown/lock | Founder / no implied ops org | founder-private/governance | Founder Workspace | Fresh MFA; separately logged; no routine customer access |

Switching with unsaved data prompts to stay, discard only the pending capture, or save a permitted local draft. Draft keys are namespaced by Account + context + Collection. Server commands include context ID; a stale/mismatched context is rejected. Tabs do not silently overwrite each other's active context—prefer per-tab context with session-bound validation.

## 14. Privacy and Sensitive Data

| Data class | Resident/subject | Business org | Driver | Buyer | Operator | Admin | Founder |
|---|---:|---:|---:|---:|---:|---:|---:|
| Identity/contact | own | member minimum | own + assigned contact minimum | own/party minimum | task minimum | security-support minimum | no default |
| Precise pickup location/instructions | own | scoped source | assigned active Job | — | dispatch need | emergency/support* | — |
| Raw asset/pickup evidence | own/source | scoped | assigned task | approved provenance projection only | review purpose | security incident only | — |
| Wallet/payout/payment | own | org finance | own payout | own transaction | status minimum | support/finance explicit | aggregates only by default |
| Organization financial/recovery analytics | — | scoped | — | transaction terms only | operational need | access admin does not imply view | approved aggregate |
| Job/intake/passport | own projection | source projection | assigned | public/party projection | operational scope | exceptional support | aggregates only |
| Security/audit records | own session subset | membership subset | own subset | own subset | operational subset | security scope | governance subset |
| Founder-private | — | — | — | — | — | — | explicit only |

Sensitive data is minimized in routes, notifications, logs, analytics, and public views. Evidence uses non-public storage and short-lived authorized references. Service credentials never enter browser code. Public marketplace projections exclude source identity, precise location, internal notes, raw evidence, and private economics. Export and bulk access are separate capabilities and auditable.

### Entity ownership and visibility matrix

| Entity family | Canonical owner | Normal visibility | Mutation authority |
|---|---|---|---|
| Account/Profile/Consent | Person | subject; security/compliance minimum | subject-safe commands; security/compliance controls |
| Organization/Membership/Location | Organization | scoped members; service minimum | membership/location capabilities |
| Collection/Item/Asset draft | Resident or Business | owning context | owning context before stage |
| Scan/Pickup | source owner | owner, assigned Driver, Operations projections | canonical transition commands |
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
| Driver Board | assigned Job then available Jobs | distance/eligibility | analytics |
| Driver Job | one valid next action/status | location/evidence/contact minimum | full event history |
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

**[Verified]** The inspected repository and source-of-truth documents do not establish a stable, implemented meaning for “Basic” or “Rosetta.” They must not become roles or authorization shortcuts.

**[Recommendation]** Separate two concepts:

- **Basic Experience**: a presentation/onboarding mode that exposes the minimum guided workflow for a context. It changes information density and guidance, never capabilities, lifecycle rules, prices, or data authority.
- **Rosetta Operational Maturity**: an organization-level readiness designation describing integration/provenance sophistication (for example richer taxonomy, evidence, reconciliation, and API integration). It may unlock features only through explicit capabilities and verified prerequisites; the label itself grants nothing.

They should not be subscription tiers without a separate commercial decision, nor combined into one progression. **[Decision]** Founder/product must choose the precise Rosetta criteria, assessor, renewal cadence, customer promise, and whether it is externally marketed. Until then, treat both labels as reserved vocabulary and implement neither in authorization.

## 20. Unresolved Questions

| # | Open architectural/founder question | Why it matters | Safe default pending decision |
|---:|---|---|---|
| 1 | Is Person-to-Account strictly one-to-one? | recovery, duplicate identity, enterprise SSO | one active Account per Person |
| 2 | Which legal party owns an Asset after Intake and after sale? | terms, accounting, disputes | explicit transfer terms; never infer from custody |
| 3 | Is Pickup Request a durable first-class entity or a Scan projection? | status history, rescheduling, multiple attempts | model domain entity; initial API may project from Scan/Job |
| 4 | Can one Asset join multiple Collections over time? | regrouping and chain of custody | yes historically, one active unstaged membership |
| 5 | What estimate/rate authority sets WTWR and dollars at stage? | financial trust and replay | server-versioned rules; estimates clearly non-settled |
| 6 | Who may create Passports: Drivers, Operators, or automation? | separation of duties and field UX | Driver submits evidence; qualified server/Operator verifies |
| 7 | When is a Manifest required? | current listing path mandates one | server policy based on listing/provenance, not UI guess |
| 8 | Which operator actions require four-eyes approval? | payouts, exceptions, corrections | payouts and high-risk corrections require separate approver |
| 9 | Business Owner versus beneficial/legal owner semantics? | membership and compliance | use “Organization Owner” for access; legal claims separate |
| 10 | Buyer identity: individual, organization, or both? | offers/contracts/wallet | support both through active context |
| 11 | Exact retention periods by evidence and jurisdiction? | privacy/compliance/storage | purpose-bound policy; no indefinite raw imagery by default |
| 12 | Offline capture support and threat model? | draft recovery/device loss | local pending drafts only, encrypted where feasible; no offline stage |
| 13 | Are founder records in the same Supabase project/schema? | separation and blast radius | separate protected schema/project/service boundary |
| 14 | Canonical dispatch model versus legacy runs/stops? | competing operational authority | Jobs/RPCs canonical; legacy route planning is non-authoritative |
| 15 | Basic and Rosetta product/commercial definitions? | navigation, packaging, authorization risk | reserved labels; no permission effect |
| 16 | When does Stage Bounty request pickup automatically, if ever? | user consent and duplicate Jobs | separate explicit pickup action by default |
| 17 | Can collections be collaboratively edited? | concurrency/membership UX | organization members only with optimistic versioning |
| 18 | What public Passport fields meet privacy/commercial policy? | marketplace trust vs source privacy | allowlisted projection only |

## 21. Consequences for SQL, RPCs, APIs, and UI

These are architectural consequences, not implementation authorization.

### SQL/RLS

- Represent identity grants, Organization Membership scope, and Access Context inputs without using user-editable metadata for authorization.
- Add durable Collection/Asset/Collection Item/estimate/evidence contracts only through a reconciled forward migration; RLS on every exposed table; explicit grants and policies by ownership/membership/assignment.
- Enforce one Scan per staged Collection, item idempotency, collection version checks, one active Job per Scan, and one Intake/Passport per Job with database constraints in addition to commands.
- Treat audit, consent, ledger, provenance, and lifecycle facts as append-only or compensating-entry records.
- Separate founder-private data through a stronger schema/project and explicit grant boundary; do not rely on an Operator policy exclusion alone.
- Preserve verified independent side effects while removing legacy duplicate lifecycle ownership; never assume local migrations are live.

### RPC/API

- One server command owns each transition. Commands accept context, resource ID, expected version/source state, and idempotency key; they authenticate actor/membership/capability internally.
- Atomic Stage Bounty validates the full item ledger, derives totals, locks it, and returns the single Scan. Retry returns the same result.
- Pickup opening and all Job transitions remain canonical server operations. Clients do not write `jobs.status` or `scans.bounty_status` independently.
- Marketplace acceptance atomically resolves listing/offer state and creates one Transaction; payment providers remain authoritative for settlement.
- Return normalized success/conflict/forbidden/validation/retryable errors and safe projections, never unrestricted rows.

### UI

- Introduce a visible, server-validated context selector before converging shells. Namespace drafts and navigation by context.
- Build pages from the contracts in section 11 and server capability/state projections. Do not render forbidden actions; do explain disabled actions when useful.
- Preserve root `scanner.html` until a tested replacement owns the canonical route. Multi-capture UI must use the durable collection contract before claiming reload recovery or staging authority.
- Quarantine or retire overlapping entry points only after incoming links, deployment exposure, and replacement journeys are verified. Do not let legacy `dispatch_runs/stops`, direct table updates, or experimental `app/` state become canonical.

## 22. Recommended Implementation Order

1. **Ratify vocabulary and decisions.** Approve ownership-transfer semantics, Pickup Request representation, Passport verification authority, Manifest policy, financial estimate authority, and Founder boundary.
2. **Inventory authorization truth.** Map every live policy, function grant, API, page, and direct Supabase call to capabilities and contexts; close anonymous/broad grants before adding features.
3. **Establish identity/context foundation.** Add explicit role grants, Organization Membership scope, server context validation, privileged MFA rules, and context-aware projections without changing lifecycle ownership.
4. **Harden the verified product spine.** Finish duplicate-lifecycle remediation, constraints/idempotency, lifecycle RPC authorization, and side-effect regression tests; reconcile live migration ledger first.
5. **Implement durable pre-stage collections.** Add Collection, Asset/Collection Item ledger, evidence references, estimates, versioning, RLS, retention, and pgTAP tests.
6. **Implement atomic Stage Bounty.** Produce exactly one Scan and a durable snapshot with server-derived totals; add retry/concurrency/database tests.
7. **Converge resident UI.** Extend canonical `scanner.html` into Scanner/Open Collection/Staged Bounty/Pickup Status contracts, including reload recovery and Playwright coverage.
8. **Converge Driver and Operator workspaces.** Route Driver Board/Job/Intake/Passport through canonical commands; isolate legacy dispatch and eliminate direct lifecycle writes.
9. **Converge marketplace and finance.** Use public projections, party contexts, atomic offer acceptance, immutable wallet transactions, payout separation of duties, and Stripe boundary tests.
10. **Add Administration and Founder separation.** Build separately authorized workspaces, audited privileged access, and private-data isolation; never derive them from Operator.
11. **Add notifications, consent, audit review, and retention jobs.** Make domain transitions observable without leaking cross-context information.
12. **Retire duplicate surfaces deliberately.** Verify routes, deploy allowlists, links, rollback, and telemetry before moving or removing any entry point.

The smallest high-value implementation checkpoint remains: server-validated Access Context and capability projection around the existing canonical lifecycle, followed by the durable Collection/atomic Stage contract. It preserves the product spine while preventing UI convergence from hard-coding another authorization or lifecycle model.
