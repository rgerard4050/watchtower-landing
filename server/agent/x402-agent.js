'use strict';

const { createX402Server } = require('@coinbase/cdp-sdk/x402');
const { paymentMiddlewareFromHTTPServer } = require('@x402/express');
const { declareDiscoveryExtension } = require('@x402/extensions/bazaar');
const { ApiError } = require('./agent-http');
const { logSettlement } = require('./x402-events');

const BASE_MAINNET = 'eip155:8453';
const WTWR_CONTRACT = '0x5852BC4A0afd2fBcd15C8261bDf30dc91585cb07';
const PUBLIC_ORIGIN = (process.env.PUBLIC_API_ORIGIN || 'https://app.ocalaassetsecurity.com').replace(/\/$/, '');

const PRODUCTS = {
  refine: {
    path: '/api/v1/refine-data',
    usdc: '$0.10',
    wtwrAtomic: '5000000000000000000',
    wtwrDisplay: '5 WTWR',
    description: 'Extract source-supported JSON from up to 10,000 characters using a caller-supplied JSON Schema.',
    tags: ['data-refinement', 'structured-output', 'agent-tool'],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string', description: 'Raw source text to refine; maximum 10,000 characters.' },
        schema: { type: 'object', description: 'JSON Schema for the desired object output.' },
        instructions: { type: 'string', description: 'Optional extraction instructions; maximum 1,000 characters.' },
      },
      required: ['text', 'schema'],
    },
    inputExample: {
      text: 'asset_id=123; condition=used',
      schema: {
        type: 'object',
        properties: { asset_id: { type: 'string' }, condition: { type: 'string' } },
        required: ['asset_id', 'condition'],
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        data: { type: 'object' },
        provenance: { type: 'object' },
      },
      required: ['data', 'provenance'],
    },
  },
  asset: {
    path: '/api/v1/asset/value',
    usdc: '$0.25',
    wtwrAtomic: '10000000000000000000',
    wtwrDisplay: '10 WTWR',
    description: 'Return live eBay Browse evidence and active asking-price statistics for an asset query.',
    tags: ['asset-value', 'ebay', 'market-evidence', 'agent-tool'],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: 'Specific asset make, model, and condition query.' },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Maximum active listings to return.' },
      },
      required: ['query'],
    },
    inputExample: { query: 'Fluke 87V multimeter used', limit: 20 },
    outputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        evidence_type: { type: 'string' },
        price_summary: { type: 'object' },
        listings: { type: 'array', items: { type: 'object' } },
      },
      required: ['query', 'evidence_type', 'price_summary', 'listings'],
    },
  },
  matrix: {
    path: '/api/v1/procurement/matrix',
    usdc: '$1.00',
    wtwrAtomic: '25000000000000000000',
    wtwrDisplay: '25 WTWR',
    description: 'Convert solicitation text or a SAM.gov notice ID into an evidence-checked submission matrix.',
    tags: ['procurement', 'sam-gov', 'requirement-matrix', 'agent-tool'],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string', description: 'Solicitation source text; maximum 50,000 characters.' },
        sam_notice_id: { type: 'string', description: 'SAM.gov notice ID to retrieve when text is omitted.' },
      },
      anyOf: [{ required: ['text'] }, { required: ['sam_notice_id'] }],
    },
    inputExample: { sam_notice_id: 'NOTICE_ID' },
    outputSchema: {
      type: 'object',
      properties: {
        matrix: { type: 'object' },
        provenance: { type: 'object' },
        source: { type: 'object' },
      },
      required: ['matrix', 'provenance', 'source'],
    },
  },
};

function paymentOptions(product, payTo) {
  return [
    {
      scheme: 'exact',
      price: product.usdc,
      network: BASE_MAINNET,
      payTo,
    },
    {
      scheme: 'exact',
      price: { asset: WTWR_CONTRACT, amount: product.wtwrAtomic },
      network: BASE_MAINNET,
      payTo,
      extra: { assetTransferMethod: 'permit2' },
    },
  ];
}

function buildRoutes(payTo) {
  const routes = {};
  for (const product of Object.values(PRODUCTS)) {
    routes[`POST ${product.path}`] = {
      accepts: paymentOptions(product, payTo),
      resource: `${PUBLIC_ORIGIN}${product.path}`,
      description: product.description,
      mimeType: 'application/json',
      serviceName: 'Ocala Asset Security Agent API',
      tags: product.tags,
      unpaidResponseBody: () => ({
        contentType: 'application/json',
        body: {
          error: 'Payment Required',
          code: 'PAYMENT_REQUIRED',
          x402_version: 2,
          endpoint: product.path,
          accepted_prices: { usdc: product.usdc, wtwr: product.wtwrDisplay },
          documentation: `${PUBLIC_ORIGIN}/openapi.json`,
        },
      }),
      extensions: {
        ...declareDiscoveryExtension({
          bodyType: 'json',
          input: product.inputExample,
          inputSchema: product.inputSchema,
          output: { schema: product.outputSchema },
        }),
      },
    };
  }
  return routes;
}

let middlewarePromise;

function missingPaymentConfiguration() {
  return ['X402_PAY_TO', 'CDP_API_KEY_ID', 'CDP_API_KEY_SECRET'].filter(name => !process.env[name]);
}

async function createMiddleware() {
  const missing = missingPaymentConfiguration();
  if (missing.length) {
    throw new ApiError(503, 'X402_NOT_CONFIGURED', 'The x402 payment receiver is not configured.', {
      missing,
    });
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(process.env.X402_PAY_TO)) {
    throw new ApiError(503, 'X402_PAY_TO_INVALID', 'X402_PAY_TO must be a valid EVM address.');
  }

  const server = await createX402Server({
    environment: 'production',
    apiKeyId: process.env.CDP_API_KEY_ID,
    apiKeySecret: process.env.CDP_API_KEY_SECRET,
    payToConfig: { type: 'address', evm: process.env.X402_PAY_TO },
    builderCode: 'watchtower_agent',
    routes: buildRoutes(process.env.X402_PAY_TO),
  });
  server.onAfterSettle(logSettlement);
  return paymentMiddlewareFromHTTPServer(server);
}

async function x402PaymentGate(req, res, next) {
  try {
    if (!middlewarePromise) middlewarePromise = createMiddleware();
    const middleware = await middlewarePromise;
    return middleware(req, res, next);
  } catch (error) {
    middlewarePromise = null;
    return next(error);
  }
}

function publicCatalog() {
  return {
    service: 'Ocala Asset Security Agent API',
    status: 'production',
    protocol: 'x402-v2',
    network: BASE_MAINNET,
    payment_assets: {
      USDC: { mode: 'exact', asset: 'network-default USDC' },
      WTWR: { mode: 'exact-permit2', asset: WTWR_CONTRACT, decimals: 18 },
    },
    endpoints: Object.fromEntries(Object.entries(PRODUCTS).map(([key, value]) => [key, {
      method: 'POST',
      url: `${PUBLIC_ORIGIN}${value.path}`,
      description: value.description,
      price: { usdc: value.usdc, wtwr: value.wtwrDisplay },
    }])),
    discovery: {
      openapi: `${PUBLIC_ORIGIN}/openapi.json`,
      agent_card: `${PUBLIC_ORIGIN}/.well-known/agent.json`,
      llms: `${PUBLIC_ORIGIN}/llms.txt`,
    },
  };
}

module.exports = {
  BASE_MAINNET,
  PRODUCTS,
  PUBLIC_ORIGIN,
  WTWR_CONTRACT,
  buildRoutes,
  missingPaymentConfiguration,
  publicCatalog,
  x402PaymentGate,
};
