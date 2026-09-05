'use strict';

const { randomUUID } = require('node:crypto');
const { AppError } = require('../../server/errors');
const { runMorrowPreflight } = require('../../server/morrow-preflight');
const { apiRequest, downloadFile, handlerError, readSession, requireConfig } = require('../../server/procore');
const { preparePackage } = require('../../server/procore-submittal');

module.exports = async function procorePackageHandler(req, res) {
  const requestId = randomUUID();
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED', request_id: requestId });
  }
  try {
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})) : {};
    const source = req.method === 'POST' ? (body.procore || {}) : (req.query || {});
    const companyId = String(source.company_id || '').trim();
    const projectId = String(source.project_id || '').trim();
    const submittalId = String(source.submittal_id || '').trim();
    if (![companyId, projectId, submittalId].every((value) => /^\d+$/.test(value))) {
      throw new AppError(400, 'PROCORE_SELECTION_REQUIRED', 'Choose a Procore company, project, and submittal.');
    }
    if (req.method === 'POST' && (companyId !== '4289092' || projectId !== '364046')) {
      throw new AppError(403, 'SANDBOX_REVIEW_ONLY', 'Free testing is limited to the Watchtower Procore sandbox project.');
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
    if (req.method === 'GET') {
      return res.status(200).json({
        ready: true,
        files: prepared.files.map(({ role, name, bytes }) => ({ role, name, bytes })),
      });
    }
    const result = await runMorrowPreflight({
      project: String(body.project || '1234 - Sandbox Test Project').slice(0, 160),
      trade: String(body.trade || 'Door Hardware').slice(0, 120),
      files: prepared.files,
    });
    return res.status(200).json({ report: result.report, model: result.model, usage: result.usage, request_id: requestId, sandbox_test: true });
  } catch (error) {
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'The request body is invalid.', code: 'INVALID_JSON', request_id: requestId });
    return handlerError(res, error);
  }
};
