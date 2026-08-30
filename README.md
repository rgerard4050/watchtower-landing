# Watchtower

**AI-assisted recycling and resource-recovery platform connecting residents, operators, dispatch, and buyers through one auditable workflow.**

[Live demo](https://watchtower-landing-lime.vercel.app)

## Why this project exists

Most recycling workflows stop at "identify the item." Watchtower is designed around the harder operational problem: turning a real-world material capture into durable state, verified custody, routing, and settlement.

The product combines a camera-first resident experience with backend APIs, persistent records, operator workflows, payment infrastructure, and automated testing.

## What this repository demonstrates

- Camera/photo capture and AI-assisted material analysis
- Durable scan / collection records backed by Supabase
- Resident, operator, dispatch, and marketplace surfaces
- Server-side API handlers and protected secret configuration
- Stripe payment integration
- x402 / USDC payment-gating experiments
- AI integrations using Gemini and Anthropic
- PWA behavior for field/mobile use
- End-to-end browser testing with Playwright
- Vercel deployment and environment-based configuration
- Explicit lifecycle and provenance design for real-world assets

## Core workflow

```text
Capture
  ↓
AI-assisted observation
  ↓
Persistent collection / scan
  ↓
Review + staging evidence
  ↓
Operator / dispatch workflow
  ↓
Verified asset / routing
  ↓
Marketplace or settlement
```

The AI layer is advisory. Durable application state and permitted next actions are handled by the product workflow rather than being trusted directly from model output.

## Tech stack

**Frontend / field experience**
- HTML, CSS, JavaScript
- Progressive Web App patterns
- Browser camera and file capture
- Supabase JavaScript client

**Backend / data**
- Node.js
- Express
- Supabase / PostgreSQL
- Vercel Functions

**AI / integrations**
- Google Gemini
- Anthropic
- Structured API workflows

**Payments**
- Stripe
- Coinbase CDP
- x402
- USDC / EVM integration experiments

**Testing / deployment**
- Playwright
- Node test runner
- Vercel

## Engineering focus

This repository is intentionally more than a landing page. Current engineering work centers on the reliability boundaries that matter when software touches physical operations:

- idempotent capture and reload recovery
- durable state instead of browser-only state
- authenticated database access
- authoritative policy decisions outside the AI model
- staging and custody evidence
- safe server-side secret handling
- end-to-end workflow verification
- failure-state handling for camera, network, and API paths

The repository also includes architecture and convergence documents that record decisions around the scanner, asset lifecycle, API reduction, and deployment boundaries.

## Tests

Run the automated suite:

```bash
npm install
npm test
```

Targeted commands include:

```bash
npm run test:api-marketplace
npm run test:api-resident
npm run test:agent-hub
npm run test:scanner-checkpoint
```

The scanner checkpoint uses Playwright for browser-level verification.

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to your local environment configuration and supply only the services you intend to exercise.

**Never expose service-role keys or signing secrets in browser code.**

## Selected project surfaces

- `scanner.html` — resident camera / material capture
- `resident.html` — resident workflow
- `operator.html` — operator experience
- `dispatch.html` — dispatch workflow
- `terminal.html` — operational console
- `api/` — server-side application endpoints
- `supabase/` — database-related project assets
- `tests/` — API and browser workflow tests

## About the developer

Built by **Ryan Gerard**, a full-stack developer focused on AI-enabled applications, operational software, API integrations, payment flows, and taking partially built products through production-readiness.

Current client-facing focus: **Next.js / React, Supabase / PostgreSQL, AI integrations, Stripe, APIs, automation, debugging, and launch-readiness work.**

---

This repository represents an actively developed product and engineering portfolio project. Some product flows may be staged, experimental, or under active hardening.
