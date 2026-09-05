'use strict';

const { handlerError, readSession, requireConfig } = require('../../server/procore');

module.exports = async function statusHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
  }
  try {
    const config = requireConfig(process.env);
    const session = readSession(req, config.clientSecret);
    return res.status(200).json({ connected: true, environment: 'sandbox', expires_at: new Date(session.expiresAt).toISOString() });
  } catch (error) {
    if (error.code === 'PROCORE_NOT_CONNECTED') return res.status(200).json({ connected: false, environment: 'sandbox' });
    return handlerError(res, error);
  }
};
