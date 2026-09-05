'use strict';

const { AppError } = require('../../server/errors');
const { apiRequest, downloadFile, handlerError, readSession, requireConfig } = require('../../server/procore');
const { preparePackage } = require('../../server/procore-submittal');

module.exports = async function procorePackageHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
  }
  try {
    const companyId = String((req.query && req.query.company_id) || '').trim();
    const projectId = String((req.query && req.query.project_id) || '').trim();
    const submittalId = String((req.query && req.query.submittal_id) || '').trim();
    if (![companyId, projectId, submittalId].every((value) => /^\d+$/.test(value))) {
      throw new AppError(400, 'PROCORE_SELECTION_REQUIRED', 'Choose a Procore company, project, and submittal.');
    }
    const config = requireConfig(process.env);
    const session = readSession(req, config.clientSecret);
    const record = await apiRequest(session, `/rest/v1.0/projects/${encodeURIComponent(projectId)}/submittals/${encodeURIComponent(submittalId)}`, { companyId });
    let prepared;
    try {
      prepared = await preparePackage(record, (url) => downloadFile(session, url));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(400, error.code || 'PROCORE_PACKAGE_INVALID', error.message || 'The Procore package is not ready.');
    }
    return res.status(200).json({
      ready: true,
      files: prepared.files.map(({ role, name, bytes }) => ({ role, name, bytes })),
    });
  } catch (error) {
    return handlerError(res, error);
  }
};
