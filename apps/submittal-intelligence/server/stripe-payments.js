'use strict';

const crypto = require('node:crypto');
const { AppError } = require('./errors');

const STRIPE_API = 'https://api.stripe.com/v1';
const STRIPE_VERSION = '2026-07-29.dahlia';
const PRODUCT_CODE = 'morrow_submittal_preflight_pilot';
const PILOT_PRICE_CENTS = 4900;
const MODES = new Set(['test', 'live']);

function paymentMode(env = process.env) {
  const mode = String(env.SUBMITTAL_PAYMENTS_MODE || 'disabled').toLowerCase();
  return MODES.has(mode) ? mode : 'disabled';
}

function requirePaymentKey(value, mode) {
  if (!MODES.has(mode)) {
    throw new AppError(503, 'PAYMENTS_DISABLED', 'Paid checkout is not enabled.');
  }
  const key = String(value || '');
  const expected = mode === 'live' ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/;
  if (!expected.test(key)) {
    throw new AppError(503, 'PAYMENT_MODE_KEY_MISMATCH', `Stripe ${mode} checkout is not configured.`);
  }
  return key;
}

function randomLetters(length = 8) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function resolveOrigin(env = process.env, mode = paymentMode(env)) {
  const candidate = env.SUBMITTAL_APP_ORIGIN
    || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
    || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : '')
    || 'http://localhost:4175';
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new AppError(500, 'INVALID_APP_ORIGIN', 'The submittal application origin is invalid.');
  }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) {
    throw new AppError(500, 'INVALID_APP_ORIGIN', 'The submittal application origin must use HTTPS.');
  }
  if (mode === 'live' && url.protocol !== 'https:') {
    throw new AppError(500, 'LIVE_HTTPS_REQUIRED', 'Live checkout requires an HTTPS application origin.');
  }
  return url.origin;
}

async function stripeRequest(path, options, key, fetchImpl = fetch) {
  const response = await fetchImpl(`${STRIPE_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      'Stripe-Version': STRIPE_VERSION,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AppError(502, 'STRIPE_ERROR', 'Stripe could not complete the payment request.');
  }
  return data;
}

function sessionPrefix(mode) {
  return mode === 'live' ? 'cs_live_' : 'cs_test_';
}

function validatePaidSession(session, mode) {
  const paid = session
    && session.livemode === (mode === 'live')
    && session.payment_status === 'paid'
    && session.metadata
    && session.metadata.product === PRODUCT_CODE
    && session.metadata.payment_mode === mode;
  if (!paid) {
    throw new AppError(402, 'PAYMENT_NOT_VERIFIED', 'The package payment could not be verified.');
  }
  if (session.metadata.review_status === 'consumed') {
    throw new AppError(409, 'PACKAGE_ALREADY_REVIEWED', 'This package purchase has already been used.');
  }
  return session;
}

async function createCheckout({ key, origin, mode, fetchImpl = fetch }) {
  const paymentKey = requirePaymentKey(key, mode);
  const appOrigin = resolveOrigin({ SUBMITTAL_APP_ORIGIN: origin }, mode);
  const form = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(PILOT_PRICE_CENTS),
    'line_items[0][price_data][product_data][name]': 'Morrow Submittal Preflight',
    'line_items[0][price_data][product_data][description]': 'Human-reviewed preflight for one specification and one contractor submittal package',
    'line_items[0][quantity]': '1',
    success_url: `${appOrigin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appOrigin}/?checkout=cancelled`,
    customer_creation: 'always',
    'metadata[product]': PRODUCT_CODE,
    'metadata[payment_mode]': mode,
    'metadata[fulfillment_mode]': 'human_review',
    'metadata[review_status]': 'available',
    integration_identifier: `watchtower_submittal_${randomLetters()}`,
  });
  const session = await stripeRequest('/checkout/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  }, paymentKey, fetchImpl);
  if (!session.url || !String(session.id || '').startsWith(sessionPrefix(mode))) {
    throw new AppError(502, 'INVALID_STRIPE_SESSION', `Stripe did not return a ${mode} Checkout Session.`);
  }
  return { id: session.id, url: session.url };
}

async function retrieveCheckout(sessionId, { key, mode, fetchImpl = fetch }) {
  if (!String(sessionId || '').startsWith(sessionPrefix(mode))) {
    throw new AppError(402, 'PAYMENT_REQUIRED', `A paid Stripe ${mode} Checkout Session is required.`);
  }
  const paymentKey = requirePaymentKey(key, mode);
  const session = await stripeRequest(`/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
  }, paymentKey, fetchImpl);
  return validatePaidSession(session, mode);
}

async function updateCheckoutMetadata(sessionId, metadata, { key, mode, fetchImpl = fetch }) {
  const paymentKey = requirePaymentKey(key, mode);
  const form = new URLSearchParams();
  Object.entries(metadata).forEach(([name, value]) => form.set(`metadata[${name}]`, String(value)));
  return stripeRequest(`/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  }, paymentKey, fetchImpl);
}

async function claimCheckout(sessionId, { key, mode, requestId, fetchImpl = fetch }) {
  const session = await retrieveCheckout(sessionId, { key, mode, fetchImpl });
  if (session.metadata.review_status === 'processing') {
    throw new AppError(409, 'PACKAGE_REVIEW_IN_PROGRESS', 'This package review is already in progress.');
  }
  await updateCheckoutMetadata(sessionId, {
    review_status: 'processing',
    review_token: requestId,
    review_started_at: Math.floor(Date.now() / 1000),
  }, { key, mode, fetchImpl });
  const claimed = await retrieveCheckout(sessionId, { key, mode, fetchImpl });
  if (claimed.metadata.review_token !== requestId || claimed.metadata.review_status !== 'processing') {
    throw new AppError(409, 'PACKAGE_CLAIM_CONFLICT', 'This package purchase was claimed by another request.');
  }
  return claimed;
}

async function completeCheckout(sessionId, { key, mode, requestId, fetchImpl = fetch }) {
  const session = await retrieveCheckout(sessionId, { key, mode, fetchImpl });
  if (session.metadata.review_token !== requestId) {
    throw new AppError(409, 'PACKAGE_CLAIM_CONFLICT', 'This package purchase belongs to another request.');
  }
  return updateCheckoutMetadata(sessionId, {
    review_status: 'consumed',
    review_completed_at: Math.floor(Date.now() / 1000),
  }, { key, mode, fetchImpl });
}

async function releaseCheckout(sessionId, { key, mode, requestId, fetchImpl = fetch }) {
  try {
    const session = await retrieveCheckout(sessionId, { key, mode, fetchImpl });
    if (session.metadata.review_token !== requestId) return false;
    await updateCheckoutMetadata(sessionId, {
      review_status: 'available',
      review_token: '',
      review_started_at: '',
    }, { key, mode, fetchImpl });
    return true;
  } catch (error) {
    console.error('[submittal-payment-release] failed', { error: String(error && error.message || error) });
    return false;
  }
}

function runtimeStatus(env = process.env) {
  const mode = paymentMode(env);
  const key = String(env.STRIPE_SECRET_KEY || '');
  const checkoutReady = (mode === 'test' && /^(sk|rk)_test_/.test(key))
    || (mode === 'live' && /^(sk|rk)_live_/.test(key));
  const analysisReady = Boolean(String(env.OPENAI_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY || env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN || ''));
  return {
    payment_mode: mode,
    checkout_ready: checkoutReady,
    analysis_ready: analysisReady,
    paid_intake_ready: checkoutReady && analysisReady,
    analysis_provider: env.OPENAI_API_KEY
      ? 'openai'
      : (env.GOOGLE_GENERATIVE_AI_API_KEY
        ? 'google_ai_studio'
        : (env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN ? 'vercel_ai_gateway' : 'disabled')),
    fulfillment_mode: 'human_review',
    price_cents: PILOT_PRICE_CENTS,
  };
}

function requireCheckoutReadiness(env = process.env) {
  const status = runtimeStatus(env);
  requirePaymentKey(env.STRIPE_SECRET_KEY, status.payment_mode);
  if (!status.analysis_ready) {
    throw new AppError(
      503,
      'FULFILLMENT_UNAVAILABLE',
      'Paid checkout is temporarily unavailable until report fulfillment is configured.',
    );
  }
  return status;
}

module.exports = {
  PILOT_PRICE_CENTS,
  PRODUCT_CODE,
  STRIPE_VERSION,
  claimCheckout,
  completeCheckout,
  createCheckout,
  paymentMode,
  releaseCheckout,
  requireCheckoutReadiness,
  requirePaymentKey,
  resolveOrigin,
  retrieveCheckout,
  runtimeStatus,
  updateCheckoutMetadata,
};
