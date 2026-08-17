'use strict';

const { createHash } = require('node:crypto');

class ApiError extends Error {
  constructor(status, code, message, detail) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function asObject(body) {
  if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (_) {
      // The normalized error below is intentionally returned for malformed JSON.
    }
  }
  throw new ApiError(400, 'INVALID_JSON', 'Request body must be a JSON object.');
}

function requiredString(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, 'MISSING_FIELD', `${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ApiError(413, 'INPUT_TOO_LARGE', `${field} exceeds ${maxLength} characters.`);
  }
  return normalized;
}

function optionalString(value, field, maxLength) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new ApiError(400, 'INVALID_FIELD', `${field} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ApiError(413, 'INPUT_TOO_LARGE', `${field} exceeds ${maxLength} characters.`);
  }
  return normalized || null;
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sendError(res, error) {
  const status = error instanceof ApiError ? error.status : 500;
  const payload = {
    error: error instanceof ApiError ? error.message : 'The request could not be completed.',
    code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
  };
  if (error instanceof ApiError && error.detail !== undefined) payload.detail = error.detail;
  if (!(error instanceof ApiError)) console.error('agent-api error', error);
  return res.status(status).json(payload);
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

module.exports = {
  ApiError,
  asObject,
  clampInteger,
  optionalString,
  readJsonResponse,
  requiredString,
  sendError,
  sha256,
};
