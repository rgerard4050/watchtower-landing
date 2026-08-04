# RFC-0001: Canonical Lifecycle Ownership

## Status

Proposed

## Date

2026-08-04

## Decision Owners

- Ryan Gerard — Founder
- ChatGPT — Architecture Lead
- Codex — Implementation Engineer

## Context

Watchtower currently has two competing lifecycle writers:

1. The canonical jobs RPC lifecycle.
2. The legacy scan-completion trigger.

When `job_create_intake()` marks a scan as completed, the legacy trigger can create an additional intake and passport. A later call to `job_create_passport()` can then create another passport.

This allows one job to create duplicate lifecycle records.

## Decision

The jobs RPC lifecycle is the canonical owner of:

- intake creation
- passport creation
- job state transitions
- job-linked provenance

The legacy scan-completion function will remain temporarily as a compatibility path only for scans that do not have an active job.

For scans with an active, non-cancelled job, the legacy function must exit without creating an intake or passport.

## Canonical Flow

```text
Scan
→ Job
→ Intake
→ Passport
→ Manifest compatibility bridge
→ Marketplace Listing
→ Offer
→ Transaction