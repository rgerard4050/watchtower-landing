'use strict';

const { ApiError, readJsonResponse } = require('./agent-http');

function formatDate(date) {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${month}/${day}/${date.getUTCFullYear()}`;
}

function stripMarkup(value) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchDescription(urlValue, apiKey, fetchImpl) {
  if (typeof urlValue !== 'string' || !urlValue.startsWith('https://')) return '';
  const url = new URL(urlValue);
  if (url.hostname !== 'api.sam.gov') return '';
  url.searchParams.set('api_key', apiKey);
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) return '';
  return stripMarkup((await response.text()).slice(0, 80_000));
}

async function fetchSamOpportunity(noticeId, fetchImpl = fetch) {
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) {
    throw new ApiError(503, 'SAM_NOT_CONFIGURED', 'SAM.gov lookup is not configured; provide text directly or configure SAM_GOV_API_KEY.');
  }

  const end = new Date();
  const start = new Date(end.getTime() - 364 * 24 * 60 * 60 * 1000);
  const url = new URL('https://api.sam.gov/opportunities/v2/search');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('noticeid', noticeId);
  url.searchParams.set('postedFrom', formatDate(start));
  url.searchParams.set('postedTo', formatDate(end));
  url.searchParams.set('limit', '1');
  url.searchParams.set('offset', '0');

  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
  const data = await readJsonResponse(response);
  if (!response.ok || !data) {
    throw new ApiError(502, 'SAM_LOOKUP_FAILED', 'SAM.gov opportunity lookup failed.', {
      provider_status: response.status,
    });
  }
  const records = Array.isArray(data.opportunitiesData) ? data.opportunitiesData : [];
  if (!records.length) {
    throw new ApiError(404, 'SAM_NOTICE_NOT_FOUND', 'No current SAM.gov opportunity matched that notice ID.');
  }

  const opportunity = records[0];
  const description = await fetchDescription(opportunity.description, apiKey, fetchImpl);
  const metadata = {
    notice_id: opportunity.noticeId || noticeId,
    solicitation_number: opportunity.solicitationNumber || null,
    title: opportunity.title || null,
    department: opportunity.department || null,
    sub_tier: opportunity.subTier || null,
    office: opportunity.office || null,
    posted_date: opportunity.postedDate || null,
    response_deadline: opportunity.responseDeadLine || null,
    notice_type: opportunity.type || null,
    set_aside: opportunity.typeOfSetAsideDescription || opportunity.typeOfSetAside || null,
    naics_code: opportunity.naicsCode || null,
    classification_code: opportunity.classificationCode || null,
    place_of_performance: opportunity.placeOfPerformance || null,
    resource_links: Array.isArray(opportunity.resourceLinks) ? opportunity.resourceLinks : [],
    public_url: opportunity.uiLink || `https://sam.gov/opp/${noticeId}/view`,
  };

  return {
    metadata,
    sourceText: `SAM.gov opportunity metadata:\n${JSON.stringify(metadata, null, 2)}\n\nOpportunity description:\n${description}`,
  };
}

module.exports = { fetchSamOpportunity, formatDate, stripMarkup };
