'use strict';

const { ApiError, readJsonResponse } = require('./agent-http');

const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const OAUTH_SCOPE = 'https://api.ebay.com/oauth/api_scope';
const tokenCache = { value: null, expiresAt: 0 };

async function getAccessToken(fetchImpl = fetch) {
  if (tokenCache.value && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new ApiError(503, 'EBAY_NOT_CONFIGURED', 'The eBay evidence provider is not configured.');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: OAUTH_SCOPE }),
    signal: AbortSignal.timeout(12_000),
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !data || !data.access_token) {
    throw new ApiError(502, 'EBAY_AUTH_FAILED', 'eBay authentication failed.', {
      provider_status: response.status,
    });
  }

  tokenCache.value = data.access_token;
  tokenCache.expiresAt = Date.now() + Math.max(60, Number(data.expires_in) || 7200) * 1000;
  return tokenCache.value;
}

function numericPrice(item) {
  const value = Number(item && item.price && item.price.value);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function quantile(sorted, position) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function roundCurrency(value) {
  return value === null ? null : Math.round(value * 100) / 100;
}

function summarizePrices(items) {
  const byCurrency = new Map();
  for (const item of items) {
    const value = numericPrice(item);
    const currency = item && item.price && item.price.currency;
    if (value === null || typeof currency !== 'string') continue;
    if (!byCurrency.has(currency)) byCurrency.set(currency, []);
    byCurrency.get(currency).push(value);
  }

  const summaries = {};
  for (const [currency, values] of byCurrency.entries()) {
    values.sort((a, b) => a - b);
    summaries[currency] = {
      count: values.length,
      min: roundCurrency(values[0]),
      p25: roundCurrency(quantile(values, 0.25)),
      median: roundCurrency(quantile(values, 0.5)),
      p75: roundCurrency(quantile(values, 0.75)),
      max: roundCurrency(values[values.length - 1]),
    };
  }
  return summaries;
}

function normalizeItem(item) {
  return {
    item_id: item.itemId || null,
    title: item.title || null,
    condition: item.condition || null,
    price: item.price || null,
    shipping_cost: item.shippingOptions && item.shippingOptions[0]
      ? item.shippingOptions[0].shippingCost || null
      : null,
    buying_options: Array.isArray(item.buyingOptions) ? item.buyingOptions : [],
    seller: item.seller
      ? {
          username: item.seller.username || null,
          feedback_percentage: item.seller.feedbackPercentage || null,
          feedback_score: item.seller.feedbackScore || null,
        }
      : null,
    item_location: item.itemLocation || null,
    image_url: item.image && item.image.imageUrl ? item.image.imageUrl : null,
    listing_url: item.itemWebUrl || null,
  };
}

async function searchActiveListings({ query, limit }, fetchImpl = fetch) {
  const token = await getAccessToken(fetchImpl);
  const url = new URL(SEARCH_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('filter', 'buyingOptions:{FIXED_PRICE|AUCTION}');

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': process.env.EBAY_MARKETPLACE_ID || 'EBAY_US',
    },
    signal: AbortSignal.timeout(15_000),
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !data) {
    throw new ApiError(502, 'EBAY_SEARCH_FAILED', 'eBay Browse search failed.', {
      provider_status: response.status,
    });
  }

  const rawItems = Array.isArray(data.itemSummaries) ? data.itemSummaries : [];
  return {
    query,
    evidence_type: 'active_asking_prices',
    valuation_note: 'Statistics are based on active eBay asking prices, not completed-sale prices.',
    marketplace: process.env.EBAY_MARKETPLACE_ID || 'EBAY_US',
    observed_at: new Date().toISOString(),
    total_provider_results: Number(data.total) || rawItems.length,
    returned_results: rawItems.length,
    price_summary: summarizePrices(rawItems),
    listings: rawItems.map(normalizeItem),
  };
}

module.exports = { normalizeItem, searchActiveListings, summarizePrices };
