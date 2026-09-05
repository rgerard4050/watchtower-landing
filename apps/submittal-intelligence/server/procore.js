'use strict';

const crypto = require('node:crypto');
const { AppError } = require('./errors');

const COOKIE_STATE = 'wt_procore_state';
const COOKIE_SESSION = 'wt_procore_session';
const LOGIN_BASE = 'https://login-sandbox.procore.com';
const API_BASE = 'https://api-sandbox.procore.com';

function requireConfig(env = process.env) {
  const clientId = String(env.PROCORE_CLIENT_ID || '').trim();
  const clientSecret = String(env.PROCORE_CLIENT_SECRET || '').trim();
  const redirectUri = String(env.PROCORE_REDIRECT_URI || '').trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new AppError(503, 'PROCORE_NOT_CONFIGURED', 'Procore sandbox connection is not configured.');
  }
  if (!redirectUri.startsWith('https://') && !redirectUri.startsWith('http://localhost')) {
    throw new AppError(503, 'PROCORE_REDIRECT_INVALID', 'Procore redirect URI must use HTTPS.');
  }
  return { clientId, clientSecret, redirectUri };
}

function cookieMap(header = '') {
  return Object.fromEntries(String(header).split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? [part.trim(), ''] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }).filter(([key]) => key));
}

function baseCookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function stateDigest(state, secret) {
  return crypto.createHmac('sha256', secret).update(state).digest('base64url');
}

function stateCookieName(state) {
  const suffix = crypto.createHash('sha256').update(String(state || '')).digest('hex').slice(0, 16);
  return `${COOKIE_STATE}_${suffix}`;
}

function createStateCookie(secret) {
  const state = crypto.randomBytes(24).toString('base64url');
  const signed = `${state}.${stateDigest(state, secret)}`;
  return { state, cookie: baseCookie(stateCookieName(state), signed, 600) };
}

function verifyState(req, receivedState, secret) {
  const cookies = cookieMap(req.headers && req.headers.cookie);
  const signed = cookies[stateCookieName(receivedState)] || cookies[COOKIE_STATE] || '';
  const [state, digest] = signed.split('.');
  if (!state || !digest || !receivedState || state !== receivedState) return false;
  const expected = stateDigest(state, secret);
  return expected.length === digest.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(digest));
}

function encryptionKey(secret) {
  return crypto.createHash('sha256').update(`watchtower-procore-session:${secret}`).digest();
}

function sealSession(payload, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function openSession(value, secret) {
  try {
    const packed = Buffer.from(value, 'base64url');
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const encrypted = packed.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(secret), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

function readSession(req, secret) {
  const raw = cookieMap(req.headers && req.headers.cookie)[COOKIE_SESSION];
  const session = raw && openSession(raw, secret);
  if (!session || !session.accessToken || Number(session.expiresAt || 0) <= Date.now()) {
    throw new AppError(401, 'PROCORE_NOT_CONNECTED', 'Connect the Procore sandbox to continue.');
  }
  return session;
}

function sessionCookie(token, secret) {
  const expiresIn = Math.max(60, Math.min(Number(token.expires_in || 7200), 7200));
  const value = sealSession({
    accessToken: token.access_token,
    refreshToken: token.refresh_token || null,
    expiresAt: Date.now() + (expiresIn * 1000),
  }, secret);
  return baseCookie(COOKIE_SESSION, value, expiresIn);
}

async function exchangeCode(code, config, fetchImpl = fetch) {
  const response = await fetchImpl(`${LOGIN_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new AppError(502, 'PROCORE_TOKEN_FAILED', 'Procore did not complete the sandbox connection.');
  }
  return body;
}

async function apiRequest(session, path, { companyId, fetchImpl = fetch } = {}) {
  const headers = { Authorization: `Bearer ${session.accessToken}`, Accept: 'application/json' };
  if (companyId) headers['Procore-Company-Id'] = String(companyId);
  const response = await fetchImpl(`${API_BASE}${path}`, { headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw new AppError(401, 'PROCORE_SESSION_EXPIRED', 'The Procore connection expired. Connect again.');
    throw new AppError(502, 'PROCORE_API_FAILED', 'Procore sandbox data could not be loaded.');
  }
  return body;
}

function handlerError(res, error) {
  const known = error instanceof AppError;
  return res.status(known ? error.status : 500).json({
    error: known ? error.message : 'The Procore connection could not be completed.',
    code: known ? error.code : 'INTERNAL_ERROR',
  });
}

module.exports = {
  API_BASE, COOKIE_SESSION, COOKIE_STATE, LOGIN_BASE, apiRequest, createStateCookie,
  exchangeCode, handlerError, readSession, requireConfig, sessionCookie, stateCookieName, verifyState,
};
