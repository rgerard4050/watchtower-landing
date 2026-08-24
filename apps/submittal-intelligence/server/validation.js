'use strict';

const path = require('node:path');
const { AppError } = require('./errors');

const MAX_FILE_BYTES = 1_500_000;
const MAX_TOTAL_BYTES = 3_000_000;
const REQUIRED_ROLES = new Set(['specification', 'submittal']);

function cleanName(value, role) {
  const base = path.basename(String(value || `${role}.pdf`)).replace(/[^a-zA-Z0-9._ -]/g, '_');
  if (!base.toLowerCase().endsWith('.pdf')) {
    throw new AppError(400, 'PDF_REQUIRED', `${role} must be a PDF file.`);
  }
  return base.slice(0, 120);
}

function decodePdf(item, role) {
  const raw = String(item.data_base64 || '').replace(/^data:application\/pdf;base64,/i, '');
  if (!raw || !/^[a-zA-Z0-9+/]*={0,2}$/.test(raw)) {
    throw new AppError(400, 'INVALID_FILE_DATA', `${role} contains invalid file data.`);
  }

  const estimatedBytes = Math.floor((raw.length * 3) / 4);
  if (estimatedBytes > MAX_FILE_BYTES) {
    throw new AppError(413, 'FILE_TOO_LARGE', `${role} exceeds the 1.5 MB pilot limit.`);
  }

  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new AppError(400, 'INVALID_PDF', `${role} is not a valid PDF file.`);
  }

  return {
    role,
    name: cleanName(item.name, role),
    buffer,
    bytes: buffer.length,
  };
}

function normalizePackage(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_JSON', 'A JSON request body is required.');
  }
  if (!Array.isArray(body.files) || body.files.length !== 2) {
    throw new AppError(400, 'TWO_PDFS_REQUIRED', 'Provide one specification PDF and one submittal PDF.');
  }

  const byRole = new Map();
  for (const item of body.files) {
    const role = String(item && item.role || '').toLowerCase();
    if (!REQUIRED_ROLES.has(role) || byRole.has(role)) {
      throw new AppError(400, 'INVALID_FILE_ROLES', 'Provide exactly one specification and one submittal.');
    }
    byRole.set(role, decodePdf(item, role));
  }

  const files = ['specification', 'submittal'].map((role) => byRole.get(role));
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new AppError(413, 'PACKAGE_TOO_LARGE', 'The combined package exceeds the 3 MB pilot limit.');
  }

  const project = String(body.project || '').trim().slice(0, 160);
  const trade = String(body.trade || '').trim().slice(0, 120);
  if (!project || !trade) {
    throw new AppError(400, 'PROJECT_DETAILS_REQUIRED', 'Project name and trade are required.');
  }

  return { project, trade, files };
}

function normalizeReviewRequest(body) {
  if (!/^cs_(test|live)_[a-zA-Z0-9_]+$/.test(String(body && body.session_id || ''))) {
    throw new AppError(402, 'PAYMENT_REQUIRED', 'A paid Stripe Checkout Session is required.');
  }
  return { sessionId: String(body.session_id), ...normalizePackage(body) };
}

function normalizeDemoReviewRequest(body) {
  return normalizePackage(body);
}

module.exports = {
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  normalizeDemoReviewRequest,
  normalizeReviewRequest,
};
