'use strict';

const { GoogleGenAI } = require('@google/genai');
const { ApiError, sha256 } = require('./agent-http');

const MODEL = process.env.GOOGLE_GENAI_MODEL || 'gemini-2.5-flash';
const ALLOWED_SCHEMA_KEYS = new Set([
  '$id', '$defs', '$ref', '$anchor', 'type', 'format', 'title', 'description', 'enum',
  'items', 'prefixItems', 'minItems', 'maxItems', 'minimum', 'maximum', 'anyOf', 'oneOf',
  'properties', 'additionalProperties', 'required', 'propertyOrdering',
]);

let client;

function parseServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    return parsed;
  } catch (_) {
    throw new ApiError(503, 'GOOGLE_CREDENTIALS_INVALID', 'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }
}

function getClient() {
  if (client) return client;
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  const project = process.env.GOOGLE_CLOUD_PROJECT;

  if (project) {
    const credentials = parseServiceAccount();
    client = new GoogleGenAI({
      vertexai: true,
      project,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
      googleAuthOptions: credentials ? { credentials } : undefined,
      httpOptions: { timeout: 45_000 },
    });
    return client;
  }

  if (!apiKey) {
    throw new ApiError(503, 'GOOGLE_AI_NOT_CONFIGURED', 'Google AI is not configured.');
  }
  client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 45_000 } });
  return client;
}

function sanitizeSchema(value, depth = 0) {
  if (depth > 10) throw new ApiError(400, 'SCHEMA_TOO_DEEP', 'Output schema exceeds 10 levels.');
  if (Array.isArray(value)) return value.map(item => sanitizeSchema(item, depth + 1));
  if (!value || typeof value !== 'object') return value;

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (!ALLOWED_SCHEMA_KEYS.has(key)) continue;
    if (key === '$ref' && (typeof item !== 'string' || !item.startsWith('#/'))) {
      throw new ApiError(400, 'EXTERNAL_SCHEMA_REF', 'Only local JSON Schema references are supported.');
    }
    if ((key === 'properties' || key === '$defs') && item && typeof item === 'object' && !Array.isArray(item)) {
      output[key] = Object.fromEntries(
        Object.entries(item).map(([propertyName, propertySchema]) => [
          propertyName,
          sanitizeSchema(propertySchema, depth + 1),
        ])
      );
    } else {
      output[key] = sanitizeSchema(item, depth + 1);
    }
  }
  return output;
}

function validateRequestedSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) || schema.type !== 'object') {
    throw new ApiError(400, 'INVALID_SCHEMA', 'schema must be a JSON Schema object with type "object".');
  }
  const encoded = JSON.stringify(schema);
  if (encoded.length > 10_000) {
    throw new ApiError(413, 'SCHEMA_TOO_LARGE', 'schema exceeds 10,000 characters.');
  }
  return sanitizeSchema(schema);
}

async function generateStructured({ sourceText, responseSchema, taskInstruction }) {
  const ai = getClient();
  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: `SOURCE MATERIAL\n---\n${sourceText}\n---\n\nTASK\n${taskInstruction}`,
      config: {
        systemInstruction: [
          'You are a strict evidence extraction engine for autonomous software agents.',
          'Use only facts explicitly present in SOURCE MATERIAL.',
          'Never infer missing dates, requirements, identifiers, certifications, prices, or legal conclusions.',
          'Use empty strings or empty arrays when the source does not support a field.',
          'When asked for source_quote, copy an exact contiguous substring from SOURCE MATERIAL.',
        ].join(' '),
        responseMimeType: 'application/json',
        responseJsonSchema: responseSchema,
      },
    });
  } catch (error) {
    console.error('google-ai provider error', error);
    throw new ApiError(502, 'GOOGLE_AI_FAILED', 'Google AI could not complete the structured extraction.');
  }

  if (!response || !response.text) {
    throw new ApiError(502, 'GOOGLE_AI_EMPTY', 'Google AI returned no structured output.');
  }
  let data;
  try {
    data = JSON.parse(response.text);
  } catch (_) {
    throw new ApiError(502, 'GOOGLE_AI_INVALID_JSON', 'Google AI returned invalid structured output.');
  }

  return {
    data,
    provenance: {
      source_sha256: sha256(sourceText),
      source_characters: sourceText.length,
      model: MODEL,
      generated_at: new Date().toISOString(),
      provider: process.env.GOOGLE_CLOUD_PROJECT ? 'google_vertex_ai' : 'google_gemini_api',
      usage: response.usageMetadata || null,
    },
  };
}

function quoteIsPresent(sourceText, quote) {
  if (typeof quote !== 'string' || !quote.trim()) return false;
  return sourceText.includes(quote.trim());
}

function verifyEvidenceQuotes(sourceText, data) {
  const collections = ['requirements', 'risks', 'submission_checklist'];
  let verified = 0;
  let unverified = 0;

  for (const name of collections) {
    if (!Array.isArray(data[name])) continue;
    for (const item of data[name]) {
      if (!item || typeof item !== 'object') continue;
      const valid = quoteIsPresent(sourceText, item.source_quote);
      item.source_verified = valid;
      if (valid) {
        item.source_quote = item.source_quote.trim();
        verified += 1;
      } else {
        item.source_quote = '';
        unverified += 1;
      }
    }
  }
  return { verified, unverified };
}

const MATRIX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        solicitation_number: { type: 'string' },
        agency: { type: 'string' },
        response_deadline: { type: 'string' },
        set_aside: { type: 'string' },
        naics_code: { type: 'string' },
      },
      required: ['title', 'solicitation_number', 'agency', 'response_deadline', 'set_aside', 'naics_code'],
    },
    requirements: {
      type: 'array',
      maxItems: 120,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          requirement_id: { type: 'string' },
          category: { type: 'string' },
          requirement: { type: 'string' },
          response_action: { type: 'string' },
          mandatory: { type: 'boolean' },
          source_quote: { type: 'string' },
        },
        required: ['requirement_id', 'category', 'requirement', 'response_action', 'mandatory', 'source_quote'],
      },
    },
    submission_checklist: {
      type: 'array',
      maxItems: 80,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          deliverable: { type: 'string' },
          due: { type: 'string' },
          source_quote: { type: 'string' },
        },
        required: ['deliverable', 'due', 'source_quote'],
      },
    },
    risks: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          risk: { type: 'string' },
          impact: { type: 'string' },
          source_quote: { type: 'string' },
        },
        required: ['risk', 'impact', 'source_quote'],
      },
    },
    unresolved: { type: 'array', maxItems: 50, items: { type: 'string' } },
  },
  required: ['summary', 'requirements', 'submission_checklist', 'risks', 'unresolved'],
};

async function extractProcurementMatrix(sourceText) {
  const result = await generateStructured({
    sourceText,
    responseSchema: MATRIX_SCHEMA,
    taskInstruction: [
      'Extract a bid/no-bid and submission requirement matrix.',
      'Every requirements, risks, and submission_checklist item must carry an exact source_quote.',
      'Put ambiguities and missing critical information in unresolved.',
      'Do not provide legal advice and do not invent FAR or DFARS clauses.',
    ].join(' '),
  });
  result.provenance.evidence = verifyEvidenceQuotes(sourceText, result.data);
  return result;
}

async function refineData(sourceText, requestedSchema, instructions) {
  const responseSchema = validateRequestedSchema(requestedSchema);
  return generateStructured({
    sourceText,
    responseSchema,
    taskInstruction: instructions || 'Extract source-supported data into the requested JSON schema.',
  });
}

module.exports = {
  MATRIX_SCHEMA,
  extractProcurementMatrix,
  refineData,
  sanitizeSchema,
  validateRequestedSchema,
  verifyEvidenceQuotes,
};
