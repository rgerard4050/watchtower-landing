'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { app, rewriteToCanonicalPath } = require('../api/agent-hub');
const { summarizePrices } = require('../server/agent/ebay-agent');
const { sanitizeSchema, verifyEvidenceQuotes } = require('../server/agent/gemini-agent');
const { buildRoutes, publicCatalog } = require('../server/agent/x402-agent');
const { validateBazaarRouteExtensions } = require('@x402/extensions/bazaar');

function withServer(run) {
  const server = http.createServer(app);
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', async () => {
      try {
        const address = server.address();
        await run(`http://127.0.0.1:${address.port}`);
        server.close(resolve);
      } catch (error) {
        server.close(() => reject(error));
      }
    });
  });
}

function requestJson(urlValue, options = {}) {
  const url = new URL(urlValue);
  const body = options.body || null;
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: options.method || 'GET',
      headers: {
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        ...(options.headers || {}),
      },
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: response.statusCode,
          json: () => JSON.parse(text),
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('catalog exposes three production paid resources', () => {
  const catalog = publicCatalog();
  assert.equal(catalog.protocol, 'x402-v2');
  assert.deepEqual(Object.keys(catalog.endpoints), ['refine', 'asset', 'matrix']);
  assert.equal(catalog.payment_assets.WTWR.decimals, 18);
});

test('rewrite normalizes consolidated Vercel function paths before x402 matching', () => {
  const req = { url: '/api/agent-hub?resource=matrix' };
  rewriteToCanonicalPath(req);
  assert.equal(req.url, '/api/v1/procurement/matrix');
});

test('Bazaar declarations validate and WTWR uses Permit2', () => {
  const routes = buildRoutes('0x1111111111111111111111111111111111111111');
  validateBazaarRouteExtensions(routes);
  const wtwr = routes['POST /api/v1/refine-data'].accepts[1];
  assert.equal(wtwr.price.amount, '5000000000000000000');
  assert.equal(wtwr.extra.assetTransferMethod, 'permit2');
});

test('eBay statistics are calculated from active asking prices by currency', () => {
  const summary = summarizePrices([
    { price: { value: '10.00', currency: 'USD' } },
    { price: { value: '20.00', currency: 'USD' } },
    { price: { value: '30.00', currency: 'USD' } },
    { price: { value: '99.00', currency: 'EUR' } },
  ]);
  assert.equal(summary.USD.median, 20);
  assert.equal(summary.USD.p25, 15);
  assert.equal(summary.EUR.count, 1);
});

test('evidence verifier rejects quotes absent from the source', () => {
  const data = {
    requirements: [
      { source_quote: 'Responses are due Friday.' },
      { source_quote: 'Invented sentence.' },
    ],
    risks: [],
    submission_checklist: [],
  };
  const evidence = verifyEvidenceQuotes('Responses are due Friday.', data);
  assert.deepEqual(evidence, { verified: 1, unverified: 1 });
  assert.equal(data.requirements[0].source_verified, true);
  assert.equal(data.requirements[1].source_quote, '');
});

test('schema sanitizer removes unsupported model controls', () => {
  const schema = sanitizeSchema({
    type: 'object',
    properties: { name: { type: 'string', pattern: '.*' } },
    unevaluatedProperties: false,
  });
  assert.equal(schema.type, 'object');
  assert.equal(schema.properties.name.type, 'string');
  assert.equal('pattern' in schema.properties.name, false);
  assert.equal('unevaluatedProperties' in schema, false);
});

test('public catalog is reachable without payment', async () => {
  await withServer(async origin => {
    const response = await requestJson(`${origin}/api/v1/catalog`);
    assert.equal(response.status, 200);
    const body = response.json();
    assert.equal(body.status, 'production');
  });
});

test('paid provider work fails closed when x402 credentials are absent', async () => {
  const previous = {
    payTo: process.env.X402_PAY_TO,
    id: process.env.CDP_API_KEY_ID,
    secret: process.env.CDP_API_KEY_SECRET,
  };
  delete process.env.X402_PAY_TO;
  delete process.env.CDP_API_KEY_ID;
  delete process.env.CDP_API_KEY_SECRET;

  try {
    await withServer(async origin => {
      const response = await requestJson(`${origin}/api/v1/asset/value`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'Fluke 87V' }),
      });
      assert.equal(response.status, 503);
      const body = response.json();
      assert.equal(body.code, 'X402_NOT_CONFIGURED');
    });
  } finally {
    if (previous.payTo) process.env.X402_PAY_TO = previous.payTo;
    if (previous.id) process.env.CDP_API_KEY_ID = previous.id;
    if (previous.secret) process.env.CDP_API_KEY_SECRET = previous.secret;
  }
});

test('malformed JSON is rejected before provider or payment work', async () => {
  await withServer(async origin => {
    const response = await requestJson(`${origin}/api/v1/refine-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    assert.equal(response.status, 400);
    const body = response.json();
    assert.equal(body.code, 'INVALID_JSON');
  });
});
