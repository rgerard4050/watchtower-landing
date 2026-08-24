'use strict';

const { randomUUID } = require('node:crypto');
const { AppError } = require('../server/errors');
const { createCheckout, paymentMode, resolveOrigin } = require('../server/stripe-payments');

module.exports = async function checkoutHandler(req, res) {
  const requestId = randomUUID();
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED', request_id: requestId });
  }
  try {
    const mode = paymentMode(process.env);
    const session = await createCheckout({
      key: process.env.STRIPE_SECRET_KEY,
      origin: resolveOrigin(process.env, mode),
      mode,
    });
    return res.status(200).json({ checkout_url: session.url, session_id: session.id, payment_mode: mode });
  } catch (error) {
    const known = error instanceof AppError;
    if (!known) console.error('[submittal-checkout] unexpected failure', { requestId, error: String(error) });
    return res.status(known ? error.status : 500).json({
      error: known ? error.message : 'Checkout could not be started.',
      code: known ? error.code : 'INTERNAL_ERROR',
      request_id: requestId,
    });
  }
};
