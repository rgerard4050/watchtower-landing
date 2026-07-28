// Watchtower — Marketplace Listings
// Operator-only CRUD over material_listings, service-role backed. Per
// explicit decision, operations/marketplace.html never writes to
// marketplace tables directly -- every listing create/read/status-change
// goes through this endpoint. Verification (is this manifest's material
// ACQUIRED + passported?) is enforced by the trg_validate_listing_verified
// trigger on material_listings; this endpoint just surfaces whatever
// Postgres error that trigger raises.

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
    return { error: { status: 403, message: 'Only operators can manage marketplace listings.' } };
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
    if (action === 'create') {
      const { manifest_id, material_type, grade, available_weight, asking_price } = body;
      if (!manifest_id || !material_type || !available_weight) {
        return res.status(400).json({ error: 'manifest_id, material_type, and available_weight are required.' });
      }
      const insertRes = await serviceRequest('material_listings', {
        method: 'POST',
        body: JSON.stringify({
          manifest_id,
          seller_id: user.id,
          material_type,
          grade: grade || null,
          available_weight,
          asking_price: asking_price || null,
        }),
      });
      const data = await insertRes.json();
      if (!insertRes.ok) return res.status(400).json({ error: data.message || 'Could not create listing.', detail: data });
      return res.status(200).json({ listing: Array.isArray(data) ? data[0] : data });
    }

    if (action === 'list') {
      const { status } = body;
      const query = status
        ? `material_listings?status=eq.${encodeURIComponent(status)}&select=*&order=created_at.desc`
        : `material_listings?select=*&order=created_at.desc`;
      const listRes = await serviceRequest(query, { method: 'GET' });
      const data = await listRes.json();
      if (!listRes.ok) return res.status(400).json({ error: data.message || 'Could not fetch listings.', detail: data });
      return res.status(200).json({ listings: data });
    }

    if (action === 'update_status') {
      const { listing_id, status } = body;
      if (!listing_id || !status) {
        return res.status(400).json({ error: 'listing_id and status are required.' });
      }
      const patchRes = await serviceRequest(`material_listings?id=eq.${listing_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      const data = await patchRes.json();
      if (!patchRes.ok) {
        // Surfaces the trg_validate_listing_verified exception message as-is
        // when an operator tries to publish unverified material.
        return res.status(400).json({ error: data.message || 'Could not update listing status.', detail: data });
      }
      return res.status(200).json({ listing: Array.isArray(data) ? data[0] : data });
    }

    return res.status(400).json({ error: "Unknown action. Use 'create', 'list', or 'update_status'." });
  } catch (err) {
    console.error('LISTINGS: unhandled failure ->', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Listing operation failed.', detail: String(err) });
  }
};
