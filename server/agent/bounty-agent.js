'use strict';

const { ApiError, readJsonResponse } = require('./agent-http');
const { formatDate } = require('./sam-agent');

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function dateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value, now = new Date()) {
  const date = dateOnly(value);
  if (!date) return null;
  return Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function normalizeState(place) {
  if (!place || typeof place !== 'object') return null;
  const state = place.state;
  if (state && typeof state === 'object') return cleanText(state.code || state.name) || null;
  return cleanText(state) || null;
}

function normalizeOpportunity(record, now = new Date()) {
  const noticeId = cleanText(record.noticeId);
  return {
    notice_id: noticeId || null,
    title: cleanText(record.title) || null,
    solicitation_number: cleanText(record.solicitationNumber) || null,
    department: cleanText(record.department) || null,
    sub_tier: cleanText(record.subTier) || null,
    office: cleanText(record.office) || null,
    posted_date: cleanText(record.postedDate) || null,
    response_deadline: cleanText(record.responseDeadLine) || null,
    days_until_due: daysUntil(record.responseDeadLine, now),
    notice_type: cleanText(record.type) || null,
    set_aside: cleanText(record.typeOfSetAsideDescription || record.typeOfSetAside) || null,
    naics_code: cleanText(record.naicsCode) || null,
    classification_code: cleanText(record.classificationCode) || null,
    state: normalizeState(record.placeOfPerformance),
    place_of_performance: record.placeOfPerformance || null,
    public_url: cleanText(record.uiLink) || (noticeId ? `https://sam.gov/opp/${noticeId}/view` : null),
    source: 'SAM.gov',
  };
}

function tokenize(value) {
  return cleanText(value).toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length >= 2);
}

function scoreOpportunity(opportunity, query) {
  const tokens = tokenize(query);
  if (!tokens.length) return 0;
  const haystack = [
    opportunity.title,
    opportunity.solicitation_number,
    opportunity.department,
    opportunity.sub_tier,
    opportunity.office,
    opportunity.naics_code,
    opportunity.classification_code,
    opportunity.set_aside,
  ].filter(Boolean).join(' ').toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += 10;
    if ((opportunity.title || '').toLowerCase().includes(token)) score += 8;
  }
  if (opportunity.days_until_due !== null && opportunity.days_until_due >= 0) {
    score += Math.max(0, 10 - Math.min(10, opportunity.days_until_due));
  }
  return score;
}

function validateInput(input = {}) {
  const query = cleanText(input.query);
  const state = cleanText(input.state).toUpperCase();
  const dueWithinDays = Number.parseInt(input.due_within_days, 10);
  const limit = Math.min(5, Math.max(1, Number.parseInt(input.limit, 10) || 5));

  if (query.length > 120) throw new ApiError(413, 'INPUT_TOO_LARGE', 'query exceeds 120 characters.');
  if (state && !/^[A-Z]{2}$/.test(state)) throw new ApiError(400, 'INVALID_STATE', 'state must be a two-letter code such as FL.');
  if (!query && !state) throw new ApiError(400, 'MISSING_FILTER', 'Provide a query or state.');

  return {
    query,
    state,
    due_within_days: Number.isFinite(dueWithinDays) ? Math.min(90, Math.max(1, dueWithinDays)) : 30,
    limit,
  };
}

function buildSearchUrl(filters, apiKey, now = new Date()) {
  const postedTo = now;
  const postedFrom = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const deadlineTo = new Date(now.getTime() + filters.due_within_days * 24 * 60 * 60 * 1000);
  const url = new URL('https://api.sam.gov/opportunities/v2/search');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('postedFrom', formatDate(postedFrom));
  url.searchParams.set('postedTo', formatDate(postedTo));
  url.searchParams.set('rdlfrom', formatDate(now));
  url.searchParams.set('rdlto', formatDate(deadlineTo));
  url.searchParams.set('limit', '50');
  url.searchParams.set('offset', '0');
  if (filters.query) url.searchParams.set('title', filters.query);
  if (filters.state) url.searchParams.set('state', filters.state);
  for (const type of ['p', 'r', 'o', 'k']) url.searchParams.append('ptype', type);
  return url;
}

async function searchSamOpportunities(input, fetchImpl = fetch, now = new Date()) {
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) throw new ApiError(503, 'SAM_NOT_CONFIGURED', 'Bounty Hunter is not configured for SAM.gov yet.');

  const filters = validateInput(input);
  const cacheKey = JSON.stringify(filters);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cached: true };

  const url = buildSearchUrl(filters, apiKey, now);
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
  const data = await readJsonResponse(response);
  if (!response.ok || !data) {
    throw new ApiError(502, 'SAM_SEARCH_FAILED', 'SAM.gov opportunity search failed.', { provider_status: response.status });
  }

  const raw = Array.isArray(data.opportunitiesData) ? data.opportunitiesData : [];
  const normalized = raw
    .map(record => normalizeOpportunity(record, now))
    .filter(item => item.notice_id && item.title)
    .filter(item => item.days_until_due === null || item.days_until_due >= 0)
    .map(item => ({ ...item, match_score: scoreOpportunity(item, filters.query) }))
    .sort((a, b) => b.match_score - a.match_score || (a.days_until_due ?? 999) - (b.days_until_due ?? 999));

  const value = {
    generated_at: now.toISOString(),
    source: 'SAM.gov Get Opportunities Public API v2',
    filters,
    total_provider_records: Number(data.totalRecords || raw.length || 0),
    returned: Math.min(filters.limit, normalized.length),
    opportunities: normalized.slice(0, filters.limit),
    note: 'Free preview only. Ranking is a screening signal, not a prediction of award or eligibility.',
  };
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

module.exports = {
  buildSearchUrl,
  daysUntil,
  normalizeOpportunity,
  scoreOpportunity,
  searchSamOpportunities,
  validateInput,
};
