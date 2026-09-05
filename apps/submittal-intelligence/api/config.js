'use strict';

const { runtimeStatus } = require('../server/stripe-payments');
const { requireConfig } = require('../server/procore');

module.exports = async function configHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
  }
  let procoreReady = true;
  try { requireConfig(process.env); } catch { procoreReady = false; }
  return res.status(200).json({ ...runtimeStatus(process.env), procore_sandbox_ready: procoreReady });
};
