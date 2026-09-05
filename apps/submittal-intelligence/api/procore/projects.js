'use strict';

const { apiRequest, handlerError, readSession, requireConfig } = require('../../server/procore');

module.exports = async function projectsHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
  }
  try {
    const companyId = String((req.query && req.query.company_id) || '').trim();
    if (!/^\d+$/.test(companyId)) return res.status(400).json({ error: 'Choose a Procore company.', code: 'PROCORE_COMPANY_REQUIRED' });
    const config = requireConfig(process.env);
    const session = readSession(req, config.clientSecret);
    const projects = await apiRequest(session, `/rest/v1.1/projects?company_id=${encodeURIComponent(companyId)}`, { companyId });
    return res.status(200).json({ projects: Array.isArray(projects) ? projects.map(({ id, name, display_name }) => ({ id, name: display_name || name })) : [] });
  } catch (error) {
    return handlerError(res, error);
  }
};
