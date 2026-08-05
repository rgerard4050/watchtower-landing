const crypto = require('node:crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://eypovuxuddiqgncjdpkq.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function cors(req, res, methods = 'GET,POST,DELETE,OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
  res.setHeader('Access-Control-Allow-Methods', methods);
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

function fail(res, status, code, message, details) {
  return res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}

function bearer(req) {
  const value = req.headers.authorization || '';
  return /^Bearer\s+(.+)$/i.exec(value)?.[1] || null;
}

async function auth(req) {
  const token = bearer(req);
  if (!token || !ANON_KEY) throw Object.assign(new Error('Authentication required.'), { status: 401, code: 'unauthorized' });
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!response.ok) throw Object.assign(new Error('Authentication required.'), { status: 401, code: 'unauthorized' });
  const user = await response.json();
  return { token, user };
}

async function rpc(token, name, body = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const status = data.code === '40001' ? 409 : data.code === '42501' ? 403 : data.code === '22023' ? 422 : 500;
    const code = status === 409 ? 'version_conflict' : status === 403 ? 'forbidden' : status === 422 ? 'validation_error' : 'server_failure';
    throw Object.assign(new Error(data.message || 'Resident operation failed.'), { status, code });
  }
  return data;
}

async function serviceRpc(name, body = {}) {
  if (!SERVICE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY.');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const status = data.code === '40001' ? 409 : data.code === '42501' ? 403 : data.code === '22023' || data.code === '23505' ? 422 : 500;
    const code = status === 409 ? 'version_conflict' : status === 403 ? 'forbidden' : status === 422 ? 'validation_error' : 'server_failure';
    throw Object.assign(new Error(data.message || 'Resident operation failed.'), { status, code });
  }
  return data;
}

function signAnalysis(payload) {
  const secret = process.env.ANALYSIS_SIGNING_SECRET;
  if (!secret) throw new Error('Missing ANALYSIS_SIGNING_SECRET.');
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyAnalysis(token) {
  const secret = process.env.ANALYSIS_SIGNING_SECRET;
  const [encoded, signature] = String(token || '').split('.');
  if (!secret || !encoded || !signature) throw Object.assign(new Error('Invalid analysis reference.'), { status: 422, code: 'validation_error' });
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) throw Object.assign(new Error('Invalid analysis reference.'), { status: 422, code: 'validation_error' });
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
  if (payload.expiresAt < Date.now()) throw Object.assign(new Error('Analysis reference expired.'), { status: 422, code: 'validation_error' });
  return payload;
}

async function uploadEvidence(path, imageBase64) {
  if (!SERVICE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY.');
  const bytes = Buffer.from(imageBase64, 'base64');
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw Object.assign(new Error('Evidence image is invalid or too large.'), { status: 422, code: 'validation_error' });
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/collection-evidence/${path}`, {
    method: 'POST', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: bytes,
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    if (response.status !== 409 && !/duplicate|already exists/i.test(message)) throw new Error('Evidence upload failed.');
  }
}

async function signedPreview(path) {
  if (!SERVICE_KEY) return null;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/collection-evidence/${path}`, {
    method: 'POST', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 300 }),
  });
  const data = await response.json().catch(() => ({}));
  return response.ok && data.signedURL ? `${SUPABASE_URL}/storage/v1${data.signedURL}` : null;
}

async function projectPreviews(projection) {
  if (!projection?.items) return projection;
  projection.items = await Promise.all(projection.items.map(async ({ evidenceObjectPath, ...item }) => ({ ...item, previewUrl: await signedPreview(evidenceObjectPath) })));
  return projection;
}

module.exports = { auth, cors, fail, projectPreviews, rpc, serviceRpc, signAnalysis, uploadEvidence, verifyAnalysis };
