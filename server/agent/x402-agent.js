'use strict';

const { paymentMiddlewareFromHTTPServer } = require('@x402/express');
const { declareDiscoveryExtension } = require('@x402/extensions/bazaar');
const { ApiError } = require('./agent-http');
const {
  CAPABILITIES,
  CAPABILITY_STATUS,
  WTWR_CONTRACT,
  listCapabilities,
  publicCapabilityRecord,
} = require('./capability-registry');
const { logSettlement } = require('./x402-events');

const BASE_MAINNET = 'eip155:8453';
const PUBLIC_ORIGIN = (process.env.PUBLIC_API_ORIGIN || 'https://app.ocalaassetsecurity.com').replace(/\/$/, '');

function asX402Product(capability) {
  if (capability.status !== CAPABILITY_STATUS.LIVE) {
    throw new Error(`Capability ${capability.id} is not live and cannot be sold.`);
  }
  if (!capability.economics.usdcPrice || !capability.economics.wtwrAtomic || !capability.economics.wtwrDisplay) {
    throw new Error(`Capability ${capability.id} has incomplete live pricing.`);
  }

  return {
    capabilityId: capability.id,
    path: capability.path,
    usdc: capability.economics.usdcPrice,
    wtwrAtomic: capability.economics.wtwrAtomic,
    wtwrDisplay: capability.economics.wtwrDisplay,
    description: capability.description,
    tags: capability.tags,
    inputSchema: capability.inputSchema,
    inputExample: capability.inputExample,
    outputSchema: capability.outputSchema,
  };
}

const PRODUCTS = Object.freeze({
  refine: asX402Product(CAPABILITIES.refine_data),
  asset: asX402Product(CAPABILITIES.asset_value),
  matrix: asX402Product(CAPABILITIES.procurement_matrix),
});

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
          capability_id: product.capabilityId,
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

  const { createX402Server } = await import('@coinbase/cdp-sdk/x402');
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
  const planned = listCapabilities({ status: CAPABILITY_STATUS.PLANNED }).map(publicCapabilityRecord);
  return {
    service: 'Ocala Asset Security Agent API',
    router: 'Compass Economic Router',
    status: 'production',
    protocol: 'x402-v2',
    network: BASE_MAINNET,
    payment_assets: {
      USDC: { mode: 'exact', asset: 'network-default USDC' },
      WTWR: { mode: 'exact-permit2', asset: WTWR_CONTRACT, decimals: 18 },
    },
    endpoints: Object.fromEntries(Object.entries(PRODUCTS).map(([key, value]) => [key, {
      capability_id: value.capabilityId,
      method: 'POST',
      url: `${PUBLIC_ORIGIN}${value.path}`,
      description: value.description,
      price: { usdc: value.usdc, wtwr: value.wtwrDisplay },
    }])),
    seller_factory: {
      live_capability_count: Object.keys(PRODUCTS).length,
      planned_capability_count: planned.length,
      planned,
      rule: 'planned capabilities are discovery metadata only until implementation, tests, pricing, and payment gating are complete',
    },
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
