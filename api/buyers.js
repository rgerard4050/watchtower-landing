// Watchtower — Marketplace Buyers
// Operator-only, service-role backed, same shape as api/listings.js,
// api/offers.js, and api/transactions.js -- so marketplace.html never
// writes to any marketplace table (buyers included) directly.
//
// Kept consistent with those three files rather than a from-scratch REST
// design: POST + an `action` field (not separate GET/PATCH routes),
// because access_token has to travel in the request body for
// requireOperator() to work -- every existing /api file in this repo
// authenticates that way, none read an Authorization header or accept an
// unauthenticated GET. Also uses the same raw-fetch-to-PostgREST helpers
// as its siblings rather than the @supabase/supabase-js server SDK, since
// that package isn't a dependency of this project (only `stripe` is, per
// package.json) -- importing it here would fail at runtime.
//
// Table fields match supabase/migrations/20260728100000_marketplace_buyers.sql
// exactly (company_name/contact_name/email/phone/location/buyer_type) --
// already applied to the live project with that schema.

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

async function requireOperator(access_token) {
  const user = await getAuthedUser(access_token);
  if (!user || !user.id) return { error: { status: 401, message: 'Not signed in.' } };
  const opRes = await serviceRequest(`operators?id=eq.${user.id}&select=id`);
  const operators = await opRes.json();
  if (!Array.isArray(operators) || operators.length === 0) {
    return { error: { status: 403, message: 'Only operators can manage marketplace buyers.' } };
  }
  return { user };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { access_token, action } = body;

  const { error } = await requireOperator(access_token);
  if (error) return res.status(error.status).json({ error: error.message });

  try {
    if (action === 'create') {
      const { company_name, contact_name, email, phone, location, buyer_type } = body;
      if (!company_name) {
        return res.status(400).json({ error: 'company_name is required.' });
      }
      const insertRes = await serviceRequest('buyers', {
        method: 'POST',
        body: JSON.stringify({
          company_name,
          contact_name: contact_name || null,
          email: email || null,
          phone: phone || null,
          location: location || null,
          buyer_type: buyer_type || null,
        }),
      });
      const data = await insertRes.json();
      if (!insertRes.ok) return res.status(400).json({ error: data.message || 'Could not create buyer.', detail: data });
      return res.status(200).json({ buyer: Array.isArray(data) ? data[0] : data });
    }

    if (action === 'list') {
      const listRes = await serviceRequest('buyers?select=*&order=company_name.asc', { method: 'GET' });
      const data = await listRes.json();
      if (!listRes.ok) return res.status(400).json({ error: data.message || 'Could not fetch buyers.', detail: data });
      return res.status(200).json({ buyers: data });
    }

    return res.status(400).json({ error: "Unknown action. Use 'create' or 'list'." });
  } catch (err) {
    console.error('BUYERS: unhandled failure ->', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Buyer operation failed.', detail: String(err) });
  }
};
