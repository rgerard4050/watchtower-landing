'use strict';

const express = require('express');
const { ApiError, asObject, clampInteger, optionalString, requiredString, sendError } = require('../server/agent/agent-http');
const { searchSamOpportunities } = require('../server/agent/bounty-agent');
const { searchActiveListings } = require('../server/agent/ebay-agent');
const { extractProcurementMatrix, refineData } = require('../server/agent/gemini-agent');
const { fetchSamOpportunity } = require('../server/agent/sam-agent');
const { generateLegacyListing } = require('../server/agent/listing-agent');
const { publicCatalog, x402PaymentGate } = require('../server/agent/x402-agent');

const RESOURCE_PATHS = {
  catalog: '/api/v1/catalog',
  bounty_preview: '/api/v1/bounty/preview',
  refine: '/api/v1/refine-data',
  asset: '/api/v1/asset/value',
  matrix: '/api/v1/procurement/matrix',
};

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb', strict: true }));

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, PAYMENT-SIGNATURE, X-PAYMENT');
  res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED, PAYMENT-RESPONSE');
  next();
});

app.options('*splat', (_req, res) => res.status(204).end());
app.get('/api/v1/catalog', (_req, res) => res.status(200).json(publicCatalog()));
app.get('/api/v1/bounty/preview', async (req, res, next) => {
  try {
    const result = await searchSamOpportunities({
      query: req.query.query,
      state: req.query.state,
      due_within_days: req.query.due_within_days,
      limit: req.query.limit,
    });
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

app.use(x402PaymentGate);

app.post('/api/v1/refine-data', async (req, res, next) => {
  try {
    const body = asObject(req.body);
    const text = requiredString(body.text, 'text', 10_000);
    const instructions = optionalString(body.instructions, 'instructions', 1_000);
    const result = await refineData(text, body.schema, instructions);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

app.post('/api/v1/asset/value', async (req, res, next) => {
  try {
    const body = asObject(req.body);
    const query = requiredString(body.query, 'query', 200);
    const limit = clampInteger(body.limit, 20, 1, 50);
    const result = await searchActiveListings({ query, limit });
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

app.post('/api/v1/procurement/matrix', async (req, res, next) => {
  try {
    const body = asObject(req.body);
    const providedText = optionalString(body.text, 'text', 50_000);
    const noticeId = optionalString(body.sam_notice_id, 'sam_notice_id', 80);
    if (!providedText && !noticeId) {
      throw new ApiError(400, 'MISSING_SOURCE', 'Provide text or sam_notice_id.');
    }

    let sourceText = providedText;
    let source = { type: 'provided_text', sam_notice_id: noticeId };
    if (!providedText && noticeId) {
      const sam = await fetchSamOpportunity(noticeId);
      sourceText = sam.sourceText.slice(0, 50_000);
      source = { type: 'sam_gov', ...sam.metadata };
    } else if (noticeId) {
      sourceText = `Submitted SAM.gov notice ID: ${noticeId}\n\n${providedText}`;
    }

    const result = await extractProcurementMatrix(sourceText);
    return res.status(200).json({ matrix: result.data, provenance: result.provenance, source });
  } catch (error) {
    return next(error);
  }
});

app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.', code: 'NOT_FOUND' }));
app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.parse.failed') {
    return sendError(res, new ApiError(400, 'INVALID_JSON', 'Request body must contain valid JSON.'));
  }
  if (error?.type === 'entity.too.large') {
    return sendError(res, new ApiError(413, 'INPUT_TOO_LARGE', 'Request body exceeds 64kb.'));
  }
  return sendError(res, error);
});

function rewriteToCanonicalPath(req) {
  const parsed = new URL(req.url || '/', 'http://localhost');
  const resource = parsed.searchParams.get('resource');
  const canonical = RESOURCE_PATHS[resource];
  if (!canonical) return;
  const passthrough = new URLSearchParams(parsed.searchParams);
  passthrough.delete('resource');
  const query = passthrough.toString();
  req.url = query ? `${canonical}?${query}` : canonical;
}

module.exports = function handler(req, res) {
  const parsed = new URL(req.url || '/', 'http://localhost');
  if (parsed.searchParams.get('resource') === 'legacy-listing') {
    return generateLegacyListing(req, res);
  }
  rewriteToCanonicalPath(req);
  return app(req, res);
};

module.exports.app = app;
module.exports.rewriteToCanonicalPath = rewriteToCanonicalPath;
