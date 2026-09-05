'use strict';

const { apiRequest, handlerError, readSession, requireConfig } = require('../../server/procore');

module.exports = async function submittalsHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
  }
  try {
    const companyId = String((req.query && req.query.company_id) || '').trim();
    const projectId = String((req.query && req.query.project_id) || '').trim();
    if (!/^\d+$/.test(companyId)) return res.status(400).json({ error: 'Choose a Procore company.', code: 'PROCORE_COMPANY_REQUIRED' });
    if (!/^\d+$/.test(projectId)) return res.status(400).json({ error: 'Choose a Procore project.', code: 'PROCORE_PROJECT_REQUIRED' });

    const config = requireConfig(process.env);
    const session = readSession(req, config.clientSecret);
    const records = await apiRequest(session, `/rest/v1.1/projects/${encodeURIComponent(projectId)}/submittals`, { companyId });
    const submittals = Array.isArray(records) ? records.map((record) => {
      const number = record.number || record.submittal_number || record.formatted_number || '';
      const title = record.title || record.description || 'Untitled submittal';
      const status = (record.status && (record.status.name || record.status.label)) || record.status_name || '';
      const spec = record.specification_section || {};
      const specNumber = spec.number || spec.label || record.specification_section_number || '';
      return {
        id: record.id,
        name: [number, title].filter(Boolean).join(' — '),
        number,
        title,
        status,
        specification_section: specNumber,
      };
    }).filter((record) => record.id) : [];
    return res.status(200).json({ submittals });
  } catch (error) {
    return handlerError(res, error);
  }
};
