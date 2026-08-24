'use strict';

const { randomUUID } = require('node:crypto');
const { AppError } = require('../server/errors');
const { runMorrowPreflight } = require('../server/morrow-preflight');
const { claimCheckout, completeCheckout, paymentMode, releaseCheckout } = require('../server/stripe-payments');
const { normalizeReviewRequest } = require('../server/validation');

function parseBody(value) {
  if (typeof value !== 'string') return value || {};
  try {
    return JSON.parse(value);
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'The request body is not valid JSON.');
  }
}

module.exports = async function reviewHandler(req, res) {
  const requestId = randomUUID();
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED', request_id: requestId });
  }
  const mode = paymentMode(process.env);
  let claimedSessionId = '';
  try {
    const input = normalizeReviewRequest(parseBody(req.body));
    await claimCheckout(input.sessionId, {
      key: process.env.STRIPE_SECRET_KEY,
      mode,
      requestId,
    });
    claimedSessionId = input.sessionId;
    const result = await runMorrowPreflight(input);
    await completeCheckout(input.sessionId, {
      key: process.env.STRIPE_SECRET_KEY,
      mode,
      requestId,
    });
    return res.status(200).json({
      report: result.report,
      model: result.model,
      usage: result.usage,
      request_id: requestId,
      temporary_files_deleted: result.temporaryFilesDeleted,
    });
  } catch (error) {
    if (claimedSessionId) {
      await releaseCheckout(claimedSessionId, {
        key: process.env.STRIPE_SECRET_KEY,
        mode,
        requestId,
      });
    }
    const known = error instanceof AppError;
    if (!known) console.error('[submittal-review] unexpected failure', { requestId, error: String(error) });
    return res.status(known ? error.status : 500).json({
      error: known ? error.message : 'The preflight review could not be completed.',
      code: known ? error.code : 'INTERNAL_ERROR',
      request_id: requestId,
    });
  }
};
