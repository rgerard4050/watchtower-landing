'use strict';

async function logSettlement(context) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !context || !context.result || !context.result.success) return;

  const request = context.transportContext && context.transportContext.request;
  const payload = {
    method: request && request.method ? request.method : null,
    route: request && request.path ? request.path : 'unknown',
    phase: context.phase,
    network: context.requirements.network,
    scheme: context.requirements.scheme,
    asset: context.requirements.asset,
    amount_atomic: context.result.amount || context.requirements.amount,
    payer: context.result.payer || null,
    transaction_hash: context.result.transaction || null,
    status: 'SETTLED',
  };

  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/x402_events`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal,resolution=ignore-duplicates',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok && response.status !== 409) {
      console.error('x402 settlement audit insert failed', response.status);
    }
  } catch (error) {
    console.error('x402 settlement audit unavailable', error && error.message);
  }
}

module.exports = { logSettlement };
