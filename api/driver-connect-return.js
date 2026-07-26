// Watchtower — Driver Stripe Connect Return
// Called by driver-board.html after a driver finishes Stripe's hosted
// onboarding. Re-reads the account from Stripe and syncs
// drivers.stripe_payouts_enabled so the app knows whether transfers can
// actually be sent to this driver yet.

const Stripe = require('stripe');

const SUPABASE_URL = 'https://eypovuxuddiqgncjdpkq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZlykauNc-3YY80w6nxzsKw_Z2lgAgU1';

async function getAuthedUser(accessToken) {
  if (!accessToken) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function serviceRequest(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {}),
    },
  });
  return res;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY.' });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { access_token } = body;

  const user = await getAuthedUser(access_token);
  if (!user || !user.id) {
    return res.status(401).json({ error: 'Not signed in.' });
  }

  const driverRes = await serviceRequest(`drivers?user_id=eq.${user.id}&select=user_id,stripe_account_id`);
  const drivers = await driverRes.json();
  const driver = Array.isArray(drivers) ? drivers[0] : null;

  if (!driver || !driver.stripe_account_id) {
    return res.status(400).json({ error: 'No Stripe account on file yet. Start onboarding first.' });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const account = await stripe.accounts.retrieve(driver.stripe_account_id);

    const patchRes = await serviceRequest(`drivers?user_id=eq.${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ stripe_payouts_enabled: !!account.payouts_enabled }),
    });
    if (!patchRes.ok) {
      const err = await patchRes.text();
      return res.status(500).json({ error: 'Could not save payout status.', detail: err });
    }

    return res.status(200).json({ payouts_enabled: !!account.payouts_enabled });
  } catch (err) {
    console.error('Stripe Connect return-sync error:', err);
    return res.status(502).json({ error: 'Could not check Stripe account status.', detail: err.message });
  }
};
