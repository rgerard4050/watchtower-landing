'use strict';

const { runtimeStatus } = require('../server/stripe-payments');

module.exports = async function configHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
  }
  return res.status(200).json(runtimeStatus(process.env));
};
