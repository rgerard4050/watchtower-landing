# Watchtower Submittal Intelligence

Status: verified founding-pilot slice. This app is isolated from the canonical
Resident/Driver deployment and does not use or mutate either Supabase project.

## Product flow

1. A contractor purchases one `$49` package through Stripe-hosted Checkout.
2. The contractor selects one specification PDF and one submittal PDF.
3. The server verifies and claims the paid Checkout Session for one report.
4. Morrow sends both PDFs inline through Vercel AI Gateway using project-scoped
   OIDC authentication; no provider key is required on Vercel.
5. Gemini 2.5 Flash produces a strict, source-cited preflight report. Direct
   OpenAI and Google AI Studio adapters remain available as explicit fallbacks.
6. Morrow builds a printable correction packet with an issue log, supporting-
   document checklist, and contractor response draft.
7. Gateway PDFs are request-scoped and are not written to application storage.
   The direct OpenAI fallback deletes uploaded files after every request.

The report is decision support only. It never represents an architect, engineer,
code official, or owner approval.

## Local commands

```powershell
Set-Location 'C:\Users\rdg83\watchtower-landing\apps\submittal-intelligence'
npm test
npm run dev
```

Open `http://localhost:4175`. The built-in sample demonstrates the complete
report and correction-packet flow with no charge, external upload, or AI call.
The live review endpoint remains payment-locked until a mode-matched Stripe key
is supplied. Vercel AI Gateway uses the deployment's automatic OIDC token.

## Runtime configuration

- `SUBMITTAL_PAYMENTS_MODE=disabled|test|live` is explicit; there is no implicit
  live billing.
- The checkout API independently fails closed unless both mode-matched Stripe
  configuration and report analysis fulfillment are available.
- Test mode accepts only `rk_test_` or `sk_test_` keys. Live mode accepts only
  `rk_live_` or `sk_live_` keys and requires an HTTPS public origin.
- Prefer a restricted Stripe key limited to Checkout Session create, retrieve,
  and update. Never place either Stripe or OpenAI keys in browser code.
- AI Gateway is the production default and is cost-isolated to this Vercel
  project. `MORROW_GATEWAY_MODEL` may override the verified default.
- Direct Google AI Studio is an optional founding-pilot fallback. Starter Tier
  may permit Google to use submitted content to improve products, so it is
  restricted to sanitized documents with no confidential or personal data.
- Each successful report marks the Checkout Session consumed. This is adequate
  for the founding pilot, but a durable database lock is required before higher-
  volume or multi-instance processing.

`/pilot` is the contractor-facing sales page. `/` is the paid intake and working
demonstration.

## Deployment boundary

Create a separate Vercel project whose Root Directory is
`apps/submittal-intelligence`. Do not deploy this directory through the existing
Watchtower production project. A custom domain, durable single-use database
lock, and changes to financial logic remain separate approvals.
