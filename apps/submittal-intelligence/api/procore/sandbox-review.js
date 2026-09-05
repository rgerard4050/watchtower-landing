'use strict';

const { randomUUID } = require('node:crypto');
const { AppError } = require('../../server/errors');
const { runMorrowPreflight } = require('../../server/morrow-preflight');
const { apiRequest, downloadFile, handlerError, readSession, requireConfig } = require('../../server/procore');
const { preparePackage } = require('../../server/procore-submittal');

const TEST_COMPANY_ID = '4289092';
const TEST_PROJECT_ID = '364046';

module.exports = async function sandboxReviewHandler(req, res) {
  const requestId = randomUUID();
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED', request_id: requestId });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const procore = body.procore || {};
    const companyId = String(procore.company_id || '');
    const projectId = String(procore.project_id || '');
    const submittalId = String(procore.submittal_id || '');
    if (companyId !== TEST_COMPANY_ID || projectId !== TEST_PROJECT_ID || !/^\d+$/.test(submittalId)) {
      throw new AppError(403, 'SANDBOX_REVIEW_ONLY', 'Free testing is limited to the Watchtower Procore sandbox project.');
    }
    const config = requireConfig(process.env);
    const session = readSession(req, config.clientSecret);
    const record = await apiRequest(session, `/rest/v1.0/projects/${projectId}/submittals/${submittalId}`, { companyId });
    let prepared;
    try {
      prepared = await preparePackage(record, (url) => downloadFile(session, url));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(400, error.code || 'PROCORE_PACKAGE_INVALID', error.message || 'The Procore package is not ready.');
    }
    const result = await runMorrowPreflight({
      project: String(body.project || '1234 - Sandbox Test Project').slice(0, 160),
      trade: String(body.trade || 'Door Hardware').slice(0, 120),
      files: prepared.files,
    });
    return res.status(200).json({
      report: result.report,
      model: result.model,
      usage: result.usage,
      request_id: requestId,
      sandbox_test: true,
    });
  } catch (error) {
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'The request body is invalid.', code: 'INVALID_JSON', request_id: requestId });
    return handlerError(res, error);
  }
};
