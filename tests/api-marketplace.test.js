const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const handler = require('../api/marketplace.js');
const repositoryRoot = path.resolve(__dirname, '..');

function response(status, body) {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function invoke(options = {}) {
  const { method = 'POST', body = {} } = options;
  const resource = Object.prototype.hasOwnProperty.call(options, 'resource')
    ? options.resource
    : 'buyers';
  const res = createRes();
  await handler({ method, query: resource === undefined ? {} : { resource }, body }, res);
  return res;
}

function installOperatorFetch(finalBody, finalStatus = 200) {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return response(200, { id: 'operator-1', email: 'operator@example.test' });
    if (calls.length === 2) return response(200, [{ id: 'operator-1' }]);
    return response(finalStatus, finalBody);
  };
  return calls;
}

test.beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
});

test.afterEach(() => {
  delete global.fetch;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

test('all legacy route forms rewrite to the correct marketplace resource', () => {
  const config = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'vercel.json'), 'utf8'));
  const actual = new Map(config.rewrites.map(({ source, destination }) => [source, destination]));
  const expected = {
    '/api/buyers': '/api/marketplace?resource=buyers',
    '/api/buyers.js': '/api/marketplace?resource=buyers',
    '/api/listings': '/api/marketplace?resource=listings',
    '/api/listings.js': '/api/marketplace?resource=listings',
    '/api/offers': '/api/marketplace?resource=offers',
    '/api/offers.js': '/api/marketplace?resource=offers',
    '/api/transactions': '/api/marketplace?resource=transactions',
    '/api/transactions.js': '/api/marketplace?resource=transactions',
    '/api/resident-collection': '/api/resident?resource=collection',
    '/api/resident-collection.js': '/api/resident?resource=collection',
    '/api/resident-pickup': '/api/resident?resource=pickup',
    '/api/resident-pickup.js': '/api/resident?resource=pickup',
    '/api/resident-progression': '/api/resident?resource=progression',
    '/api/resident-progression.js': '/api/resident?resource=progression',
  };
  for (const [source, destination] of Object.entries(expected)) {
    assert.equal(actual.get(source), destination);
  }
});

test('method and same-origin CORS posture are preserved', async () => {
  const res = await invoke({ method: 'OPTIONS' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
  assert.equal(res.headers['access-control-allow-origin'], undefined);
  assert.equal(res.body.error, 'Method not allowed.');
});

test('invalid resource and malformed JSON return normalized errors before Supabase', async () => {
  let fetchCalled = false;
  global.fetch = async () => { fetchCalled = true; return response(500, {}); };

  const missing = await invoke({ resource: undefined, body: {} });
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.body.code, 'INVALID_RESOURCE');

  const repeated = await invoke({ resource: ['buyers', 'offers'], body: {} });
  assert.equal(repeated.statusCode, 400);

  const malformed = await invoke({ resource: 'buyers', body: '{bad json' });
  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.body.code, 'INVALID_JSON');
  assert.equal(fetchCalled, false);
});

test('invalid session remains 401', async () => {
  global.fetch = async () => response(401, { message: 'invalid token' });
  const res = await invoke({ body: { access_token: 'invalid', action: 'list' } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Not signed in.');
  assert.equal(res.body.code, 'NOT_SIGNED_IN');
});

test('authenticated non-operator remains 403', async () => {
  let call = 0;
  global.fetch = async () => {
    call += 1;
    return call === 1 ? response(200, { id: 'user-1' }) : response(200, []);
  };
  const res = await invoke({ body: { access_token: 'valid', action: 'list' } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'OPERATOR_REQUIRED');
});

for (const scenario of [
  { resource: 'buyers', key: 'buyers', result: [{ id: 1 }], path: '/rest/v1/buyers?select=' },
  { resource: 'listings', key: 'listings', result: [{ id: 2 }], path: '/rest/v1/material_listings?select=' },
  { resource: 'offers', key: 'offers', result: [{ id: 3 }], path: '/rest/v1/offers?select=' },
  { resource: 'transactions', key: 'transactions', result: [{ id: 4 }], path: '/rest/v1/marketplace_transactions?select=' },
]) {
  test(`${scenario.resource} list preserves response shape and dispatch target`, async () => {
    const calls = installOperatorFetch(scenario.result);
    const res = await invoke({
      resource: scenario.resource,
      body: { access_token: 'valid', action: 'list' },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { [scenario.key]: scenario.result });
    assert.match(calls[2].url, new RegExp(scenario.path.replace(/[?]/g, '\\?')));
  });
}

test('listing create uses the authenticated operator and preserves listing shape', async () => {
  const calls = installOperatorFetch([{ id: 8, status: 'DRAFT' }]);
  const res = await invoke({
    resource: 'listings',
    body: {
      access_token: 'valid',
      action: 'create',
      manifest_id: 7,
      material_type: 'Copper',
      available_weight: 20,
      seller_id: 'attacker-controlled',
    },
  });
  assert.deepEqual(res.body, { listing: { id: 8, status: 'DRAFT' } });
  const inserted = JSON.parse(calls[2].options.body);
  assert.equal(inserted.seller_id, 'operator-1');
});

test('offer accept preserves RPC name, actor, arguments, and response shape', async () => {
  const transaction = { id: 9, status: 'PENDING' };
  const calls = installOperatorFetch(transaction);
  const res = await invoke({
    resource: 'offers',
    body: { access_token: 'valid', action: 'accept', offer_id: 12 },
  });
  assert.deepEqual(res.body, { transaction });
  assert.match(calls[2].url, /\/rest\/v1\/rpc\/accept_offer$/);
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    p_operator_id: 'operator-1',
    p_offer_id: 12,
  });
});

test('transaction completion preserves RPC name, actor, arguments, and response shape', async () => {
  const transaction = { id: 9, status: 'COMPLETED' };
  const calls = installOperatorFetch(transaction);
  const res = await invoke({
    resource: 'transactions',
    body: { access_token: 'valid', action: 'complete', transaction_id: 9 },
  });
  assert.deepEqual(res.body, { transaction });
  assert.match(calls[2].url, /\/rest\/v1\/rpc\/complete_transaction$/);
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    p_operator_id: 'operator-1',
    p_transaction_id: 9,
  });
});

test('stale offer rejection remains 409 with a string error', async () => {
  installOperatorFetch([]);
  const res = await invoke({
    resource: 'offers',
    body: { access_token: 'valid', action: 'reject', offer_id: 11 },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(typeof res.body.error, 'string');
  assert.equal(res.body.code, 'OFFER_NOT_PENDING');
});

test('deployable API set excludes duplicates and includes twelve canonical handlers', () => {
  const ignored = new Set(
    fs.readFileSync(path.join(repositoryRoot, '.vercelignore'), 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
  );
  const requiredExclusions = [
    'api/create-checkout/route.js',
    'api/scan-operator.js',
    'api/buyers.js',
    'api/listings.js',
    'api/offers.js',
    'api/transactions.js',
    'api/resident-collection.js',
    'api/resident-pickup.js',
  ];
  for (const file of requiredExclusions) assert.equal(ignored.has(file), true, file);

  function apiFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? apiFiles(absolute) : [absolute];
    });
  }
  const deployable = apiFiles(path.join(repositoryRoot, 'api'))
    .filter((file) => file.endsWith('.js'))
    .map((file) => path.relative(repositoryRoot, file).replaceAll(path.sep, '/'))
    .filter((file) => !ignored.has(file));

  assert.equal(deployable.length, 12);
  assert.equal(deployable.includes('api/marketplace.js'), true);
  assert.equal(deployable.includes('api/resident.js'), true);
  assert.equal(deployable.includes('api/resident-collection.js'), false);
  assert.equal(deployable.includes('api/resident-pickup.js'), false);
  for (const file of requiredExclusions) assert.equal(deployable.includes(file), false, file);
});
