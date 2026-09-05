'use strict';

const { apiRequest, handlerError, readSession, requireConfig } = require('../../server/procore');

module.exports = async function companiesHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
  }
  try {
    const config = requireConfig(process.env);
    const companies = await apiRequest(readSession(req, config.clientSecret), '/rest/v1.0/companies');
    return res.status(200).json({ companies: Array.isArray(companies) ? companies.map(({ id, name }) => ({ id, name })) : [] });
  } catch (error) {
    return handlerError(res, error);
  }
};
