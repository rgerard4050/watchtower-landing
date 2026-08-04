// Watchtower marketplace control plane.
// Compatibility rewrites in vercel.json route the former buyers, listings,
// offers, and transactions endpoints here with a server-selected resource.

const SUPABASE_URL = 'https://eypovuxuddiqgncjdpkq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZlykauNc-3YY80w6nxzsKw_Z2lgAgU1';
const RESOURCES = new Set(['buyers', 'listings', 'offers', 'transactions']);

class HttpError extends Error {
  constructor(status, code, message, detail) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function sendError(res, status, code, message, detail) {
  const payload = { error: message, code };
  if (detail !== undefined) payload.detail = detail;
  return res.status(status).json(payload);
}

function parseResource(req) {
  const value = req.query && req.query.resource;
  return typeof value === 'string' && RESOURCES.has(value) ? value : null;
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (_) {
      // Return the normalized invalid-body error below.
    }
  }
  throw new HttpError(400, 'INVALID_JSON', 'Request body must be a JSON object.');
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

async function getAuthedUser(accessToken) {
  if (!accessToken) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) return null;
  return readResponse(response);
}

async function serviceRequest(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { prefer, headers, ...fetchOptions } = options;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...fetchOptions,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: prefer || 'return=representation',
      ...(headers || {}),
    },
  });
  return { response, data: await readResponse(response) };
}

async function serviceRpc(fn, args) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  return { response, data: await readResponse(response) };
}

function databaseError(data, fallback) {
  return data && typeof data.message === 'string' ? data.message : fallback;
}

async function requireOperator(accessToken) {
  const user = await getAuthedUser(accessToken);
  if (!user || !user.id) {
    throw new HttpError(401, 'NOT_SIGNED_IN', 'Not signed in.');
  }

  const { response, data } = await serviceRequest(
    `operators?id=eq.${encodeURIComponent(user.id)}&select=id`,
    { method: 'GET' }
  );
  if (!response.ok) {
    throw new HttpError(500, 'OPERATOR_LOOKUP_FAILED', 'Could not verify operator access.');
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new HttpError(403, 'OPERATOR_REQUIRED', 'Only operators can manage marketplace records.');
  }
  return user;
}

async function handleBuyers(body) {
  if (body.action === 'create') {
    const { company_name, contact_name, email, phone, location, buyer_type } = body;
    if (!company_name) {
      throw new HttpError(400, 'MISSING_FIELD', 'company_name is required.');
    }
    const { response, data } = await serviceRequest('buyers', {
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
    if (!response.ok) {
      throw new HttpError(400, 'BUYER_CREATE_FAILED', databaseError(data, 'Could not create buyer.'), data);
    }
    return { buyer: Array.isArray(data) ? data[0] : data };
  }

  if (body.action === 'list') {
    const { response, data } = await serviceRequest('buyers?select=*&order=company_name.asc', { method: 'GET' });
    if (!response.ok) {
      throw new HttpError(400, 'BUYER_LIST_FAILED', databaseError(data, 'Could not fetch buyers.'), data);
    }
    return { buyers: data };
  }

  throw new HttpError(400, 'UNKNOWN_ACTION', "Unknown action. Use 'create' or 'list'.");
}

async function handleListings(body, user) {
  if (body.action === 'create') {
    const { manifest_id, material_type, grade, available_weight, asking_price } = body;
    if (!manifest_id || !material_type || !available_weight) {
      throw new HttpError(400, 'MISSING_FIELD', 'manifest_id, material_type, and available_weight are required.');
    }
    const { response, data } = await serviceRequest('material_listings', {
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
    if (!response.ok) {
      throw new HttpError(400, 'LISTING_CREATE_FAILED', databaseError(data, 'Could not create listing.'), data);
    }
    return { listing: Array.isArray(data) ? data[0] : data };
  }

  if (body.action === 'list') {
    const query = body.status
      ? `material_listings?status=eq.${encodeURIComponent(body.status)}&select=*&order=created_at.desc`
      : 'material_listings?select=*&order=created_at.desc';
    const { response, data } = await serviceRequest(query, { method: 'GET' });
    if (!response.ok) {
      throw new HttpError(400, 'LISTING_LIST_FAILED', databaseError(data, 'Could not fetch listings.'), data);
    }
    return { listings: data };
  }

  if (body.action === 'update_status') {
    const { listing_id, status } = body;
    if (!listing_id || !status) {
      throw new HttpError(400, 'MISSING_FIELD', 'listing_id and status are required.');
    }
    const { response, data } = await serviceRequest(`material_listings?id=eq.${listing_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      throw new HttpError(400, 'LISTING_STATUS_FAILED', databaseError(data, 'Could not update listing status.'), data);
    }
    return { listing: Array.isArray(data) ? data[0] : data };
  }

  throw new HttpError(400, 'UNKNOWN_ACTION', "Unknown action. Use 'create', 'list', or 'update_status'.");
}

async function handleOffers(body, user) {
  if (body.action === 'list') {
    const filters = [];
    if (body.listing_id) filters.push(`listing_id=eq.${body.listing_id}`);
    if (body.status) filters.push(`status=eq.${encodeURIComponent(body.status)}`);
    const query = `offers?${filters.length ? `${filters.join('&')}&` : ''}select=*&order=created_at.desc`;
    const { response, data } = await serviceRequest(query, { method: 'GET' });
    if (!response.ok) {
      throw new HttpError(400, 'OFFER_LIST_FAILED', databaseError(data, 'Could not fetch offers.'), data);
    }
    return { offers: data };
  }

  if (body.action === 'submit') {
    const { listing_id, buyer_id, offered_price, offered_weight } = body;
    if (!listing_id || !buyer_id || !offered_price || !offered_weight) {
      throw new HttpError(400, 'MISSING_FIELD', 'listing_id, buyer_id, offered_price, and offered_weight are required.');
    }
    const { response, data } = await serviceRequest('offers', {
      method: 'POST',
      body: JSON.stringify({ listing_id, buyer_id, offered_price, offered_weight }),
    });
    if (!response.ok) {
      throw new HttpError(400, 'OFFER_SUBMIT_FAILED', databaseError(data, 'Could not submit offer.'), data);
    }
    return { offer: Array.isArray(data) ? data[0] : data };
  }

  if (body.action === 'accept') {
    if (!body.offer_id) throw new HttpError(400, 'MISSING_FIELD', 'offer_id is required.');
    const { response, data } = await serviceRpc('accept_offer', {
      p_operator_id: user.id,
      p_offer_id: body.offer_id,
    });
    if (!response.ok) {
      throw new HttpError(400, 'OFFER_ACCEPT_FAILED', databaseError(data, 'Could not accept offer.'), data);
    }
    return { transaction: data };
  }

  if (body.action === 'reject') {
    if (!body.offer_id) throw new HttpError(400, 'MISSING_FIELD', 'offer_id is required.');
    const { response, data } = await serviceRequest(`offers?id=eq.${body.offer_id}&status=eq.PENDING`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'REJECTED' }),
    });
    if (!response.ok) {
      throw new HttpError(400, 'OFFER_REJECT_FAILED', databaseError(data, 'Could not reject offer.'), data);
    }
    if (Array.isArray(data) && data.length === 0) {
      throw new HttpError(409, 'OFFER_NOT_PENDING', 'Offer is not pending (already accepted, rejected, or withdrawn).');
    }
    return { offer: Array.isArray(data) ? data[0] : data };
  }

  throw new HttpError(400, 'UNKNOWN_ACTION', "Unknown action. Use 'list', 'submit', 'accept', or 'reject'.");
}

async function handleTransactions(body, user) {
  if (body.action === 'list') {
    const query = body.status
      ? `marketplace_transactions?status=eq.${encodeURIComponent(body.status)}&select=*&order=created_at.desc`
      : 'marketplace_transactions?select=*&order=created_at.desc';
    const { response, data } = await serviceRequest(query, { method: 'GET' });
    if (!response.ok) {
      throw new HttpError(400, 'TRANSACTION_LIST_FAILED', databaseError(data, 'Could not fetch transactions.'), data);
    }
    return { transactions: data };
  }

  if (body.action === 'complete') {
    if (!body.transaction_id) throw new HttpError(400, 'MISSING_FIELD', 'transaction_id is required.');
    const { response, data } = await serviceRpc('complete_transaction', {
      p_operator_id: user.id,
      p_transaction_id: body.transaction_id,
    });
    if (!response.ok) {
      throw new HttpError(400, 'TRANSACTION_COMPLETE_FAILED', databaseError(data, 'Could not complete transaction.'), data);
    }
    return { transaction: data };
  }

  throw new HttpError(400, 'UNKNOWN_ACTION', "Unknown action. Use 'list' or 'complete'.");
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  }

  const resource = parseResource(req);
  if (!resource) {
    return sendError(res, 400, 'INVALID_RESOURCE', 'A valid marketplace resource is required.');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return sendError(res, 500, 'SERVER_MISCONFIGURED', 'Missing SUPABASE_SERVICE_ROLE_KEY.');
  }

  try {
    const body = parseBody(req);
    const user = await requireOperator(body.access_token);

    let payload;
    if (resource === 'buyers') payload = await handleBuyers(body);
    if (resource === 'listings') payload = await handleListings(body, user);
    if (resource === 'offers') payload = await handleOffers(body, user);
    if (resource === 'transactions') payload = await handleTransactions(body, user);

    return res.status(200).json(payload);
  } catch (error) {
    if (error instanceof HttpError) {
      return sendError(res, error.status, error.code, error.message, error.detail);
    }
    console.error('MARKETPLACE: unhandled failure', error && error.stack ? error.stack : error);
    return sendError(res, 500, 'MARKETPLACE_FAILED', 'Marketplace operation failed.');
  }
};
