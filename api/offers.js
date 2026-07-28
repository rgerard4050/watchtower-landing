// Watchtower — Marketplace Offers
// Operator-only, service-role backed, same shape as api/listings.js. No
// buyer self-service auth exists yet (Phase 2 scope is the internal
// control panel), so operators submit offers on a buyer's behalf here.
//
// 'accept' calls the accept_offer() Postgres RPC rather than doing the
// offer/listing/transaction writes itself -- that function is
// SECURITY DEFINER and its EXECUTE grant is service_role-only (see
// supabase/migrations/20260728100300_marketplace_transactions.sql), so
// this endpoint is the only thing in the system that can ever call it.
// The function re-checks operator identity internally (p_operator_id
// against public.operators) as defense in depth, independent of the check
// this endpoint already does.

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

async function serviceRpc(fn, args) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  return res;
}

async function requireOperator(access_token) {
  const user = await getAuthedUser(access_token);
  if (!user || !user.id) return { error: { status: 401, message: 'Not signed in.' } };
  const opRes = await serviceRequest(`operators?id=eq.${user.id}&select=id`);
  const operators = await opRes.json();
  if (!Array.isArray(operators) || operators.length === 0) {
    return { error: { status: 403, message: 'Only operators can manage marketplace offers.' } };
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

  const { user, error } = await requireOperator(access_token);
  if (error) return res.status(error.status).json({ error: error.message });

  try {
    if (action === 'list') {
      const { listing_id, status } = body;
      const filters = [];
      if (listing_id) filters.push(`listing_id=eq.${listing_id}`);
      if (status) filters.push(`status=eq.${encodeURIComponent(status)}`);
      const query = `offers?${filters.length ? filters.join('&') + '&' : ''}select=*&order=created_at.desc`;
      const listRes = await serviceRequest(query, { method: 'GET' });
      const data = await listRes.json();
      if (!listRes.ok) return res.status(400).json({ error: data.message || 'Could not fetch offers.', detail: data });
      return res.status(200).json({ offers: data });
    }

    if (action === 'submit') {
      const { listing_id, buyer_id, offered_price, offered_weight } = body;
      if (!listing_id || !buyer_id || !offered_price || !offered_weight) {
        return res.status(400).json({ error: 'listing_id, buyer_id, offered_price, and offered_weight are required.' });
      }
      const insertRes = await serviceRequest('offers', {
        method: 'POST',
        body: JSON.stringify({ listing_id, buyer_id, offered_price, offered_weight }),
      });
      const data = await insertRes.json();
      if (!insertRes.ok) return res.status(400).json({ error: data.message || 'Could not submit offer.', detail: data });
      return res.status(200).json({ offer: Array.isArray(data) ? data[0] : data });
    }

    if (action === 'accept') {
      const { offer_id } = body;
      if (!offer_id) return res.status(400).json({ error: 'offer_id is required.' });
      const rpcRes = await serviceRpc('accept_offer', { p_operator_id: user.id, p_offer_id: offer_id });
      const data = await rpcRes.json();
      if (!rpcRes.ok) return res.status(400).json({ error: data.message || 'Could not accept offer.', detail: data });
      return res.status(200).json({ transaction: data });
    }

    if (action === 'reject') {
      const { offer_id } = body;
      if (!offer_id) return res.status(400).json({ error: 'offer_id is required.' });
      const patchRes = await serviceRequest(`offers?id=eq.${offer_id}&status=eq.PENDING`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'REJECTED' }),
      });
      const data = await patchRes.json();
      if (!patchRes.ok) return res.status(400).json({ error: data.message || 'Could not reject offer.', detail: data });
      if (Array.isArray(data) && data.length === 0) {
        return res.status(409).json({ error: 'Offer is not pending (already accepted, rejected, or withdrawn).' });
      }
      return res.status(200).json({ offer: Array.isArray(data) ? data[0] : data });
    }

    return res.status(400).json({ error: "Unknown action. Use 'list', 'submit', 'accept', or 'reject'." });
  } catch (err) {
    console.error('OFFERS: unhandled failure ->', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Offer operation failed.', detail: String(err) });
  }
};
