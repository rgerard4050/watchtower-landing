'use strict';

const { apiRequest, handlerError, readSession, requireConfig } = require('../../server/procore');
const { normalizeSubmittal } = require('../../server/procore-submittal');

module.exports = async function submittalHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
  }
  try {
    const companyId = String((req.query && req.query.company_id) || '').trim();
    const projectId = String((req.query && req.query.project_id) || '').trim();
    const submittalId = String((req.query && req.query.submittal_id) || '').trim();
    if (!/^\d+$/.test(companyId)) return res.status(400).json({ error: 'Choose a Procore company.', code: 'PROCORE_COMPANY_REQUIRED' });
    if (!/^\d+$/.test(projectId)) return res.status(400).json({ error: 'Choose a Procore project.', code: 'PROCORE_PROJECT_REQUIRED' });
    if (!/^\d+$/.test(submittalId)) return res.status(400).json({ error: 'Choose a Procore submittal.', code: 'PROCORE_SUBMITTAL_REQUIRED' });

    const config = requireConfig(process.env);
    const session = readSession(req, config.clientSecret);
    const record = await apiRequest(session, `/rest/v1.0/projects/${encodeURIComponent(projectId)}/submittals/${encodeURIComponent(submittalId)}`, { companyId });
    return res.status(200).json({ submittal: normalizeSubmittal(record) });
  } catch (error) {
    return handlerError(res, error);
  }
};
