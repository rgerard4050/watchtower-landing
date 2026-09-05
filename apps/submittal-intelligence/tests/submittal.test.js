'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const checkoutHandler = require('../api/checkout');
const procorePackageHandler = require('../api/procore/package');
const reviewHandler = require('../api/review');
const { INSTRUCTIONS, runMorrowPreflight } = require('../server/morrow-preflight');
const { buildLocalDemoReport, localDemoHandler } = require('../server/local-demo');
const {
  STRIPE_VERSION,
  claimCheckout,
  completeCheckout,
  createCheckout,
  requireCheckoutReadiness,
  retrieveCheckout,
  runtimeStatus,
} = require('../server/stripe-payments');
const { normalizeDemoReviewRequest, normalizeReviewRequest } = require('../server/validation');
const { normalizeSubmittal, preparePackage } = require('../server/procore-submittal');
const {
  apiRequest, createStateCookie, downloadFile, exchangeCode, readSession, requireConfig, sessionCookie, verifyState,
} = require('../server/procore');

function response(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function pdf(role) {
  return {
    role,
    name: `${role}.pdf`,
    data_base64: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj').toString('base64'),
  };
}

const validReport = {
  decision: 'revise_before_review',
  summary: 'One explicit requirement is not supported.',
  requirements: [{
    id: 'R-1', requirement: 'Provide product data.', status: 'missing',
    source: { file: 'specification', page: 4, section: '1.4', quote: 'Submit product data.' },
    package_evidence: 'No matching document found.', recommended_fix: 'Add the product data sheet.',
  }],
  risks: [], missing_documents: [], limitations: [],
};

test('PDF intake requires one real PDF for each role and a test Checkout Session', () => {
  const normalized = normalizeReviewRequest({
    session_id: 'cs_test_example_123', project: 'Project A', trade: 'HVAC',
    files: [pdf('specification'), pdf('submittal')],
  });
  assert.equal(normalized.files.length, 2);
  assert.equal(normalized.files[0].buffer.subarray(0, 5).toString(), '%PDF-');
  const liveNormalized = normalizeReviewRequest({
    session_id: 'cs_live_example_123', project: 'A', trade: 'B', files: [pdf('specification'), pdf('submittal')],
  });
  assert.equal(liveNormalized.sessionId, 'cs_live_example_123');
  assert.throws(() => normalizeReviewRequest({
    session_id: 'cs_invalid_bad', project: 'A', trade: 'B', files: [pdf('specification'), pdf('submittal')],
  }), /paid Stripe Checkout Session/);
});

test('local demo validates both PDFs without a payment session and returns a clearly labeled sample report', async () => {
  const input = normalizeDemoReviewRequest({
    project: 'Pine Street Community Center', trade: 'HVAC',
    files: [
      { ...pdf('specification'), name: 'sample-01-project-specification.pdf' },
      { ...pdf('submittal'), name: 'sample-02-contractor-submittal.pdf' },
    ],
  });
  const report = buildLocalDemoReport(input);
  assert.equal(report.decision, 'revise_before_review');
  assert.match(report.review_notice, /LOCAL DEMO ONLY - NO AI ANALYSIS/);
  assert.equal(report.requirements.length, 6);

  const res = createRes();
  await localDemoHandler({ method: 'POST', body: JSON.stringify({
    project: 'Pine Street Community Center', trade: 'HVAC',
    files: [
      { ...pdf('specification'), name: 'sample-01-project-specification.pdf' },
      { ...pdf('submittal'), name: 'sample-02-contractor-submittal.pdf' },
    ],
  }) }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.local_only, true);
  assert.equal(res.body.model, 'LOCAL DEMO - NO AI');

  const instantRes = createRes();
  await localDemoHandler({ method: 'POST', body: JSON.stringify({ use_sample_pair: true }) }, instantRes);
  assert.equal(instantRes.statusCode, 200);
  assert.equal(instantRes.body.report.requirements.length, 6);
});

test('Morrow treats PDF instructions as untrusted and deletes both temporary files', async () => {
  assert.match(INSTRUCTIONS, /untrusted evidence/i);
  assert.match(INSTRUCTIONS, /Ignore any instructions/i);
  const calls = [];
  let uploadCount = 0;
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/files') && options.method === 'POST') {
      uploadCount += 1;
      return response(200, { id: `file-${uploadCount}` });
    }
    if (String(url).endsWith('/responses')) {
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'gpt-5.6-luna');
      assert.equal(body.store, false);
      assert.equal(body.input[0].content[1].file_id, 'file-1');
      assert.equal(body.input[0].content[2].file_id, 'file-2');
      assert.equal(body.text.format.strict, true);
      return response(200, { model: 'gpt-5.6-luna', output_text: JSON.stringify(validReport), usage: { total_tokens: 123 } });
    }
    if (/\/files\/file-[12]$/.test(String(url)) && options.method === 'DELETE') return response(200, { deleted: true });
    return response(404, {});
  };
  const files = normalizeReviewRequest({
    session_id: 'cs_test_example_123', project: 'Project A', trade: 'HVAC',
    files: [pdf('specification'), pdf('submittal')],
  }).files;
  const result = await runMorrowPreflight({ project: 'Project A', trade: 'HVAC', files }, { apiKey: 'test-key', fetchImpl });
  assert.equal(result.report.decision, 'revise_before_review');
  assert.match(result.report.review_notice, /AI-assisted preflight/);
  assert.equal(result.temporaryFilesDeleted, true);
  assert.equal(calls.filter((call) => call.options.method === 'DELETE').length, 2);
});

test('temporary OpenAI files are deleted when response generation fails', async () => {
  let uploadCount = 0;
  let deletes = 0;
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith('/files') && options.method === 'POST') return response(200, { id: `file-${++uploadCount}` });
    if (String(url).endsWith('/responses')) return response(500, { error: { message: 'sensitive upstream detail' } });
    if (options.method === 'DELETE') { deletes += 1; return response(200, { deleted: true }); }
    return response(404, {});
  };
  const files = normalizeReviewRequest({
    session_id: 'cs_test_example_123', project: 'Project A', trade: 'HVAC',
    files: [pdf('specification'), pdf('submittal')],
  }).files;
  await assert.rejects(runMorrowPreflight({ project: 'A', trade: 'B', files }, { apiKey: 'test-key', fetchImpl }), /could not complete/);
  assert.equal(deletes, 2);
});

test('Vercel AI Gateway accepts both PDFs inline and returns the same report contract', async () => {
  const files = normalizeReviewRequest({
    session_id: 'cs_test_example_123', project: 'Project A', trade: 'HVAC',
    files: [pdf('specification'), pdf('submittal')],
  }).files;
  const result = await runMorrowPreflight({ project: 'Project A', trade: 'HVAC', files }, {
    gateway: true,
    gatewayGenerate: async ({ model, project, trade, files: gatewayFiles }) => {
      assert.equal(model, 'google/gemini-2.5-flash');
      assert.equal(project, 'Project A');
      assert.equal(trade, 'HVAC');
      assert.equal(gatewayFiles.length, 2);
      assert.equal(gatewayFiles[0].buffer.subarray(0, 5).toString(), '%PDF-');
      return { output: validReport, usage: { totalTokens: 88 }, response: { modelId: model } };
    },
  });
  assert.equal(result.report.decision, 'revise_before_review');
  assert.equal(result.model, 'google/gemini-2.5-flash');
  assert.equal(result.temporaryFilesDeleted, true);
});

test('direct Google fallback accepts both PDFs and preserves the report contract', async () => {
  const files = normalizeReviewRequest({
    session_id: 'cs_test_example_123', project: 'Project A', trade: 'HVAC',
    files: [pdf('specification'), pdf('submittal')],
  }).files;
  const result = await runMorrowPreflight({ project: 'Project A', trade: 'HVAC', files }, {
    google: true,
    googleGenerate: async ({ model, project, trade, files: googleFiles }) => {
      assert.equal(model, 'gemini-2.5-flash');
      assert.equal(project, 'Project A');
      assert.equal(trade, 'HVAC');
      assert.equal(googleFiles.length, 2);
      assert.equal(googleFiles[1].buffer.subarray(0, 5).toString(), '%PDF-');
      return { output: validReport, usage: { totalTokens: 81 }, response: { modelId: model } };
    },
  });
  assert.equal(result.report.decision, 'revise_before_review');
  assert.equal(result.model, 'gemini-2.5-flash');
  assert.equal(result.temporaryFilesDeleted, true);
});

test('Stripe uses hosted Checkout, explicit mode matching, dynamic methods, and the current API version', async () => {
  let posted;
  const fetchImpl = async (url, options) => {
    posted = { url: String(url), options };
    return response(200, { id: 'cs_test_created_123', url: 'https://checkout.stripe.com/c/pay/test' });
  };
  const session = await createCheckout({ key: 'rk_test_example', mode: 'test', origin: 'https://preview.example.test', fetchImpl });
  assert.equal(session.id, 'cs_test_created_123');
  assert.match(posted.options.body, /mode=payment/);
  assert.match(posted.options.body, /unit_amount%5D=4900/);
  assert.doesNotMatch(posted.options.body, /payment_method_types/);
  assert.match(posted.options.body, /integration_identifier=watchtower_submittal_/);
  assert.match(posted.options.body, /metadata%5Bpayment_mode%5D=test/);
  assert.match(posted.options.body, /metadata%5Bfulfillment_mode%5D=human_review/);
  assert.match(posted.options.body, /success_url=https%3A%2F%2Fpreview.example.test%2F%3Fcheckout%3Dsuccess/);
  assert.match(posted.options.body, /Human-reviewed/);
  assert.equal(posted.options.headers['Stripe-Version'], STRIPE_VERSION);
  await assert.rejects(createCheckout({ key: 'sk_live_wrong_mode', mode: 'test', origin: 'https://example.test', fetchImpl }), /test checkout is not configured/);
  await assert.rejects(createCheckout({ key: 'rk_live_example', mode: 'live', origin: 'http://localhost:4175', fetchImpl }), /requires an HTTPS/);
});

test('paid intake fails closed when report fulfillment is unavailable', () => {
  const unavailable = {
    SUBMITTAL_PAYMENTS_MODE: 'live',
    STRIPE_SECRET_KEY: 'rk_live_example',
    SUBMITTAL_APP_ORIGIN: 'https://pilot.example.test',
  };
  assert.equal(runtimeStatus(unavailable).checkout_ready, true);
  assert.equal(runtimeStatus(unavailable).analysis_ready, false);
  assert.equal(runtimeStatus(unavailable).paid_intake_ready, false);
  assert.throws(
    () => requireCheckoutReadiness(unavailable),
    (error) => error.status === 503 && error.code === 'FULFILLMENT_UNAVAILABLE',
  );

  const ready = { ...unavailable, AI_GATEWAY_API_KEY: 'gateway_example' };
  assert.equal(runtimeStatus(ready).paid_intake_ready, true);
  assert.equal(requireCheckoutReadiness(ready).payment_mode, 'live');
});

test('checkout API refuses to create a paid session without fulfillment', async () => {
  const names = [
    'SUBMITTAL_PAYMENTS_MODE',
    'STRIPE_SECRET_KEY',
    'OPENAI_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'AI_GATEWAY_API_KEY',
    'VERCEL_OIDC_TOKEN',
  ];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.SUBMITTAL_PAYMENTS_MODE = 'test';
    process.env.STRIPE_SECRET_KEY = 'rk_test_example';
    names.slice(2).forEach((name) => delete process.env[name]);
    const res = createRes();
    await checkoutHandler({ method: 'POST' }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'FULFILLMENT_UNAVAILABLE');
    assert.equal(res.headers['cache-control'], 'no-store');
  } finally {
    names.forEach((name) => {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    });
  }
});

test('Stripe verification accepts paid mode-matched sessions and rejects cross-mode sessions', async () => {
  const fetchImpl = async () => response(200, {
    id: 'cs_test_paid_123', livemode: false, payment_status: 'paid',
    metadata: { product: 'morrow_submittal_preflight_pilot', payment_mode: 'test', review_status: 'available' },
  });
  const session = await retrieveCheckout('cs_test_paid_123', { key: 'sk_test_example', mode: 'test', fetchImpl });
  assert.equal(session.payment_status, 'paid');
  await assert.rejects(retrieveCheckout('cs_test_paid_123', { key: 'sk_live_example', mode: 'live', fetchImpl }), /paid Stripe live Checkout Session/);
});

test('one package purchase is claimed and marked consumed after one report', async () => {
  const state = {
    id: 'cs_test_paid_123', livemode: false, payment_status: 'paid',
    metadata: { product: 'morrow_submittal_preflight_pilot', payment_mode: 'test', review_status: 'available' },
  };
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      const form = new URLSearchParams(options.body);
      for (const [key, value] of form) {
        const match = key.match(/^metadata\[(.+)\]$/);
        if (match) state.metadata[match[1]] = value;
      }
    }
    return response(200, state);
  };
  await claimCheckout(state.id, { key: 'rk_test_example', mode: 'test', requestId: 'request-1', fetchImpl });
  assert.equal(state.metadata.review_status, 'processing');
  await completeCheckout(state.id, { key: 'rk_test_example', mode: 'test', requestId: 'request-1', fetchImpl });
  assert.equal(state.metadata.review_status, 'consumed');
  await assert.rejects(retrieveCheckout(state.id, { key: 'rk_test_example', mode: 'test', fetchImpl }), /already been used/);
});

test('API handlers preserve method and configuration boundaries', async () => {
  const checkoutRes = createRes();
  await checkoutHandler({ method: 'GET' }, checkoutRes);
  assert.equal(checkoutRes.statusCode, 405);
  assert.equal(checkoutRes.headers.allow, 'POST');

  const originalStripe = process.env.STRIPE_SECRET_KEY;
  const originalOpenAI = process.env.OPENAI_API_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const reviewRes = createRes();
    await reviewHandler({ method: 'POST', body: '{}' }, reviewRes);
    assert.equal(reviewRes.statusCode, 402);
    assert.equal(reviewRes.body.code, 'PAYMENT_REQUIRED');
    assert.equal(reviewRes.headers['cache-control'], 'no-store');
  } finally {
    if (originalStripe === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = originalStripe;
    if (originalOpenAI === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalOpenAI;
  }
});

test('public sample API returns the complete no-charge demonstration', async () => {
  const sampleHandler = require('../api/local-demo-review');
  const sampleRes = createRes();
  await sampleHandler({ method: 'POST', body: { use_sample_pair: true } }, sampleRes);
  assert.equal(sampleRes.statusCode, 200);
  assert.equal(sampleRes.body.local_only, true);
  assert.equal(sampleRes.body.report.requirements.length, 6);
  assert.equal(sampleRes.body.report.missing_documents.length, 3);
});

test('Procore sandbox configuration fails closed and requires an HTTPS callback', () => {
  assert.throws(() => requireConfig({}), /not configured/);
  assert.throws(() => requireConfig({
    PROCORE_CLIENT_ID: 'client', PROCORE_CLIENT_SECRET: 'secret', PROCORE_REDIRECT_URI: 'http://example.test/callback',
  }), /must use HTTPS/);
  assert.deepEqual(requireConfig({
    PROCORE_CLIENT_ID: 'client', PROCORE_CLIENT_SECRET: 'secret', PROCORE_REDIRECT_URI: 'https://pilot.example.test/api/procore/callback',
  }), { clientId: 'client', clientSecret: 'secret', redirectUri: 'https://pilot.example.test/api/procore/callback' });
});

test('Procore OAuth state is signed and token sessions are encrypted cookies', () => {
  const secret = 'sandbox-secret';
  const state = createStateCookie(secret);
  const req = { headers: { cookie: state.cookie.split(';')[0] } };
  assert.equal(verifyState(req, state.state, secret), true);
  assert.equal(verifyState(req, `${state.state}x`, secret), false);

  const cookie = sessionCookie({ access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 600 }, secret);
  assert.doesNotMatch(cookie, /access-token|refresh-token/);
  const session = readSession({ headers: { cookie: cookie.split(';')[0] } }, secret);
  assert.equal(session.accessToken, 'access-token');
});

test('Procore OAuth state remains valid across concurrent login attempts', () => {
  const secret = 'sandbox-secret';
  const first = createStateCookie(secret);
  const second = createStateCookie(secret);
  const req = { headers: { cookie: `${first.cookie.split(';')[0]}; ${second.cookie.split(';')[0]}` } };

  assert.equal(verifyState(req, first.state, secret), true);
  assert.equal(verifyState(req, second.state, secret), true);
});

test('Procore OAuth exchanges authorization code and API imports use sandbox hosts', async () => {
  let tokenCall;
  const token = await exchangeCode('authorization-code', {
    clientId: 'client', clientSecret: 'secret', redirectUri: 'https://pilot.example.test/api/procore/callback',
  }, async (url, options) => {
    tokenCall = { url, options };
    return response(200, { access_token: 'token', expires_in: 7200 });
  });
  assert.equal(token.access_token, 'token');
  assert.equal(tokenCall.url, 'https://login-sandbox.procore.com/oauth/token');
  assert.equal(JSON.parse(tokenCall.options.body).code, 'authorization-code');

  let apiCall;
  const companies = await apiRequest({ accessToken: 'token' }, '/rest/v1.0/companies', {
    companyId: 42,
    fetchImpl: async (url, options) => {
      apiCall = { url, options };
      return response(200, [{ id: 42, name: 'information exchange' }]);
    },
  });
  assert.equal(companies[0].name, 'information exchange');
  assert.equal(apiCall.url, 'https://sandbox.procore.com/rest/v1.0/companies');
  assert.equal(apiCall.options.headers['Procore-Company-Id'], '42');

  await apiRequest({ accessToken: 'token' }, '/rest/v1.1/projects/1234/submittals', {
    companyId: 42,
    fetchImpl: async (url, options) => {
      apiCall = { url, options };
      return response(200, [{ id: 9, number: '08 71 00-1', title: 'Door Hardware' }]);
    },
  });
  assert.equal(apiCall.url, 'https://sandbox.procore.com/rest/v1.1/projects/1234/submittals');
  assert.equal(apiCall.options.headers['Procore-Company-Id'], '42');
});

test('Procore submittal details normalize review context without exposing download URLs', () => {
  const item = normalizeSubmittal({
    id: 9,
    formatted_number: '08 71 00-1.0',
    title: 'Door Hardware',
    description: 'Mechanical-only hardware was submitted.',
    status: { name: 'Open' },
    specification_section: { number: '08 71 00', description: 'Door Hardware' },
    submittal_manager: { name: 'Test Architect' },
    attachments: [{ id: 2, name: 'product-data.pdf', url: 'https://example.test/private' }],
    workflow_data: [{ responder: { name: 'Architect' }, response: { name: 'Revise and Resubmit' }, comments: 'Provide electrified hardware.' }],
  });
  assert.equal(item.number, '08 71 00-1.0');
  assert.equal(item.attachments[0].name, 'product-data.pdf');
  assert.equal(item.attachments[0].url, undefined);
  assert.equal(item.responses[0].response, 'Revise and Resubmit');
});

test('Procore attachment download keeps bearer token on Procore domains and validates the PDF', async () => {
  const calls = [];
  const file = await downloadFile({ accessToken: 'private-token' }, 'https://sandbox.procore.com/files/secure', {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1) {
        return new Response(null, { status: 302, headers: { location: 'https://signed-storage.example.test/file.pdf' } });
      }
      return new Response(Buffer.from('%PDF-1.4\ntest'), { status: 200, headers: { 'content-type': 'application/pdf' } });
    },
  });
  assert.equal(file.buffer.subarray(0, 5).toString(), '%PDF-');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer private-token');
  assert.equal(calls[1].options.headers.Authorization, undefined);
  assert.equal(calls.every((call) => call.options.redirect === 'manual'), true);
  await assert.rejects(
    downloadFile({ accessToken: 'token' }, 'https://attacker.example/file.pdf', { fetchImpl: async () => response(200, {}) }),
    /untrusted attachment link/,
  );
});

test('Procore package assigns named PDFs to review roles without exposing file URLs', async () => {
  const downloaded = [];
  const prepared = await preparePackage({
    attachments: [
      { id: 1, name: 'watchtower-test-submitted-product-data.pdf', url: 'https://sandbox.procore.com/files/product' },
      { id: 2, name: 'watchtower-test-project-requirements.pdf', url: 'https://sandbox.procore.com/files/spec' },
    ],
  }, async (url) => {
    downloaded.push(url);
    return { buffer: Buffer.from('%PDF-1.4\ntest') };
  });
  assert.deepEqual(prepared.files.map((file) => file.role), ['specification', 'submittal']);
  assert.match(prepared.files[0].name, /requirements/);
  assert.match(prepared.files[1].name, /submitted/);
  assert.equal(prepared.files.some((file) => Object.hasOwn(file, 'url')), false);
  assert.equal(downloaded.length, 2);
});

test('free Procore review is restricted to the configured sandbox company and project', async () => {
  const methodRes = createRes();
  await procorePackageHandler({ method: 'PATCH' }, methodRes);
  assert.equal(methodRes.statusCode, 405);
  assert.equal(methodRes.headers.allow, 'GET, POST');

  const scopeRes = createRes();
  await procorePackageHandler({ method: 'POST', body: { procore: { company_id: '1', project_id: '2', submittal_id: '3' } } }, scopeRes);
  assert.equal(scopeRes.statusCode, 403);
  assert.equal(scopeRes.body.code, 'SANDBOX_REVIEW_ONLY');
});
