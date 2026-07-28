// Watchtower — Marketplace Transactions
// Operator-only, service-role backed, same shape as api/listings.js and
// api/offers.js.
//
// There is no separate 'create' action here: a marketplace_transactions
// row is only ever created atomically inside accept_offer() (see
// api/offers.js), never as a standalone step -- a transaction without an
// accepted offer behind it isn't a state this system allows. 'complete'
// calls the complete_transaction() RPC, which is service_role-only and
// re-checks operator identity internally, same as accept_offer().

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
    return { error: { status: 403, message: 'Only operators can manage marketplace transactions.' } };
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
      const { status } = body;
      const query = status
        ? `marketplace_transactions?status=eq.${encodeURIComponent(status)}&select=*&order=created_at.desc`
        : `marketplace_transactions?select=*&order=created_at.desc`;
      const listRes = await serviceRequest(query, { method: 'GET' });
      const data = await listRes.json();
      if (!listRes.ok) return res.status(400).json({ error: data.message || 'Could not fetch transactions.', detail: data });
      return res.status(200).json({ transactions: data });
    }

    if (action === 'complete') {
      const { transaction_id } = body;
      if (!transaction_id) return res.status(400).json({ error: 'transaction_id is required.' });
      const rpcRes = await serviceRpc('complete_transaction', { p_operator_id: user.id, p_transaction_id: transaction_id });
      const data = await rpcRes.json();
      if (!rpcRes.ok) return res.status(400).json({ error: data.message || 'Could not complete transaction.', detail: data });
      return res.status(200).json({ transaction: data });
    }

    return res.status(400).json({ error: "Unknown action. Use 'list' or 'complete'." });
  } catch (err) {
    console.error('TRANSACTIONS: unhandled failure ->', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Transaction operation failed.', detail: String(err) });
  }
};
