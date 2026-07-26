// Watchtower — Pay Driver
// Operator-triggered real Stripe transfer of a driver's 10% share for one
// completed bounty. Deliberately not automatic: an operator reviews and
// clicks Pay for each scan. scans.driver_payout_cents is computed by the
// record_driver_payout_on_bounty_completion DB trigger at completion time;
// this endpoint only ever pays a scan once (driver_transfer_id gates it).

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
  const { access_token, scan_id } = body;

  if (!scan_id) {
    return res.status(400).json({ error: 'scan_id is required.' });
  }

  const user = await getAuthedUser(access_token);
  if (!user || !user.id) {
    return res.status(401).json({ error: 'Not signed in.' });
  }

  const operatorRes = await serviceRequest(`operators?id=eq.${user.id}&select=id`);
  const operators = await operatorRes.json();
  if (!Array.isArray(operators) || operators.length === 0) {
    return res.status(403).json({ error: 'Only operators can pay drivers.' });
  }

  const scanRes = await serviceRequest(
    `scans?id=eq.${scan_id}&select=id,bounty_status,claimed_by,driver_payout_cents,driver_transfer_id`
  );
  const scans = await scanRes.json();
  const scan = Array.isArray(scans) ? scans[0] : null;

  if (!scan) {
    return res.status(404).json({ error: 'Scan not found.' });
  }
  if (scan.driver_transfer_id) {
    return res.status(409).json({ error: 'This bounty has already been paid.' });
  }
  if (scan.bounty_status !== 'completed' || !scan.driver_payout_cents || scan.driver_payout_cents <= 0) {
    return res.status(400).json({ error: 'This bounty has no payout owed.' });
  }
  if (!scan.claimed_by) {
    return res.status(400).json({ error: 'No driver on file for this bounty.' });
  }

  const driverRes = await serviceRequest(`drivers?user_id=eq.${scan.claimed_by}&select=stripe_account_id,stripe_payouts_enabled`);
  const drivers = await driverRes.json();
  const driver = Array.isArray(drivers) ? drivers[0] : null;

  if (!driver || !driver.stripe_account_id || !driver.stripe_payouts_enabled) {
    return res.status(400).json({ error: 'Driver has not finished setting up payouts yet.' });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const transfer = await stripe.transfers.create({
      amount: scan.driver_payout_cents,
      currency: 'usd',
      destination: driver.stripe_account_id,
      transfer_group: `scan_${scan.id}`,
    });

    const patchRes = await serviceRequest(`scans?id=eq.${scan.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ driver_transfer_id: transfer.id }),
    });
    if (!patchRes.ok) {
      const err = await patchRes.text();
      console.error('Transfer succeeded but scans update failed:', err);
      return res.status(500).json({
        error: 'Payment sent, but could not record it. Check Stripe transfer ' + transfer.id + ' manually.',
      });
    }

    return res.status(200).json({ transfer_id: transfer.id, amount_cents: scan.driver_payout_cents });
  } catch (err) {
    console.error('Stripe transfer error:', err);
    return res.status(502).json({ error: 'Stripe could not send the payout.', detail: err.message });
  }
};
