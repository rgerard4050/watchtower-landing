'use strict';

const WTWR_CONTRACT = '0x5852BC4A0afd2fBcd15C8261bDf30dc91585cb07';

const CAPABILITY_STATUS = Object.freeze({
  LIVE: 'live',
  PLANNED: 'planned',
});

function capability(input) {
  return Object.freeze({
    ...input,
    tags: Object.freeze([...input.tags]),
    economics: Object.freeze({ ...input.economics }),
    inputSchema: Object.freeze(input.inputSchema),
    outputSchema: Object.freeze(input.outputSchema),
  });
}

const CAPABILITIES = Object.freeze({
  refine_data: capability({
    id: 'refine_data',
    status: CAPABILITY_STATUS.LIVE,
    family: 'data',
    name: 'Structured data refinery',
    method: 'POST',
    path: '/api/v1/refine-data',
    description: 'Extract source-supported JSON from supplied text under a caller-defined JSON Schema.',
    tags: ['data-refinement', 'structured-output', 'agent-tool'],
    economics: {
      usdcPrice: '$0.10',
      wtwrAtomic: '5000000000000000000',
      wtwrDisplay: '5 WTWR',
      pricingMode: 'fixed',
      costClass: 'model-assisted',
    },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string', maxLength: 10000 },
        schema: { type: 'object' },
        instructions: { type: 'string', maxLength: 1000 },
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
  }),

  asset_value: capability({
    id: 'asset_value',
    status: CAPABILITY_STATUS.LIVE,
    family: 'asset',
    name: 'Active market evidence',
    method: 'POST',
    path: '/api/v1/asset/value',
    description: 'Return live eBay active-listing evidence and asking-price statistics for an asset query.',
    tags: ['asset-value', 'ebay', 'market-evidence', 'agent-tool'],
    economics: {
      usdcPrice: '$0.25',
      wtwrAtomic: '10000000000000000000',
      wtwrDisplay: '10 WTWR',
      pricingMode: 'fixed',
      costClass: 'external-api',
    },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', maxLength: 200 },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
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
  }),

  procurement_matrix: capability({
    id: 'procurement_matrix',
    status: CAPABILITY_STATUS.LIVE,
    family: 'procurement',
    name: 'Procurement matrix extraction',
    method: 'POST',
    path: '/api/v1/procurement/matrix',
    description: 'Build an evidence-checked requirements matrix from supplied solicitation text or a SAM.gov notice ID.',
    tags: ['sam-gov', 'procurement', 'requirements', 'agent-tool'],
    economics: {
      usdcPrice: '$1.00',
      wtwrAtomic: '25000000000000000000',
      wtwrDisplay: '25 WTWR',
      pricingMode: 'fixed',
      costClass: 'model-assisted',
    },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string', maxLength: 50000 },
        sam_notice_id: { type: 'string', maxLength: 80 },
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
  }),

  bounty_search: capability({
    id: 'bounty_search',
    status: CAPABILITY_STATUS.PLANNED,
    family: 'bounty',
    name: 'Bounty opportunity search',
    method: 'POST',
    path: '/api/v1/bounty/search',
    description: 'Search normalized public opportunities using Watchtower Bounty Hunter evidence and filters.',
    tags: ['bounty', 'opportunity-search', 'procurement', 'agent-tool'],
    economics: { usdcPrice: null, wtwrAtomic: null, wtwrDisplay: null, pricingMode: 'pending-validation', costClass: 'database' },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', maxLength: 500 },
        state: { type: 'string', maxLength: 40 },
        due_within_days: { type: 'integer', minimum: 1, maximum: 120 },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
    },
    inputExample: { query: 'fence security upgrades', state: 'FL', due_within_days: 30, limit: 20 },
    outputSchema: {
      type: 'object',
      properties: { opportunities: { type: 'array', items: { type: 'object' } }, provenance: { type: 'object' } },
      required: ['opportunities', 'provenance'],
    },
  }),

  bounty_due_soon: capability({
    id: 'bounty_due_soon',
    status: CAPABILITY_STATUS.PLANNED,
    family: 'bounty',
    name: 'Due-soon opportunity feed',
    method: 'POST',
    path: '/api/v1/bounty/due-soon',
    description: 'Return open opportunities ranked by deadline pressure and fit signals.',
    tags: ['bounty', 'deadline', 'opportunities', 'agent-tool'],
    economics: { usdcPrice: null, wtwrAtomic: null, wtwrDisplay: null, pricingMode: 'pending-validation', costClass: 'database' },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        state: { type: 'string', maxLength: 40 },
        within_days: { type: 'integer', minimum: 1, maximum: 60 },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      required: ['within_days'],
    },
    inputExample: { state: 'FL', within_days: 14, limit: 25 },
    outputSchema: {
      type: 'object',
      properties: { opportunities: { type: 'array', items: { type: 'object' } }, generated_at: { type: 'string' } },
      required: ['opportunities', 'generated_at'],
    },
  }),

  contractor_fit: capability({
    id: 'contractor_fit',
    status: CAPABILITY_STATUS.PLANNED,
    family: 'bounty',
    name: 'Contractor opportunity fit',
    method: 'POST',
    path: '/api/v1/bounty/contractor-fit',
    description: 'Compare a contractor capability profile against an opportunity and return evidence-backed fit and gaps.',
    tags: ['contractor-fit', 'bounty', 'qualification', 'agent-tool'],
    economics: { usdcPrice: null, wtwrAtomic: null, wtwrDisplay: null, pricingMode: 'pending-validation', costClass: 'model-assisted' },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        opportunity: { type: 'object' },
        contractor_profile: { type: 'object' },
      },
      required: ['opportunity', 'contractor_profile'],
    },
    inputExample: { opportunity: { title: 'Security fence replacement' }, contractor_profile: { trades: ['fence'] } },
    outputSchema: {
      type: 'object',
      properties: { fit: { type: 'object' }, gaps: { type: 'array', items: { type: 'object' } }, provenance: { type: 'object' } },
      required: ['fit', 'gaps', 'provenance'],
    },
  }),

  submittal_preflight: capability({
    id: 'submittal_preflight',
    status: CAPABILITY_STATUS.PLANNED,
    family: 'submittal',
    name: 'Submittal pre-flight',
    method: 'POST',
    path: '/api/v1/submittal/preflight',
    description: 'Check supplied submittal content for completeness against an explicit requirement set without making legal or engineering approval decisions.',
    tags: ['submittal', 'preflight', 'construction', 'completeness', 'agent-tool'],
    economics: { usdcPrice: null, wtwrAtomic: null, wtwrDisplay: null, pricingMode: 'pending-validation', costClass: 'model-assisted' },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requirements: { type: 'array', items: { type: 'object' } },
        submitted_documents: { type: 'array', items: { type: 'object' } },
      },
      required: ['requirements', 'submitted_documents'],
    },
    inputExample: { requirements: [{ id: 'R1', text: 'Provide product data' }], submitted_documents: [{ name: 'product-data.pdf', extracted_text: '...' }] },
    outputSchema: {
      type: 'object',
      properties: {
        complete: { type: 'boolean' },
        missing: { type: 'array', items: { type: 'object' } },
        conflicts: { type: 'array', items: { type: 'object' } },
        provenance: { type: 'object' },
      },
      required: ['complete', 'missing', 'conflicts', 'provenance'],
    },
  }),

  submittal_spec_extract: capability({
    id: 'submittal_spec_extract',
    status: CAPABILITY_STATUS.PLANNED,
    family: 'submittal',
    name: 'Submittal specification extraction',
    method: 'POST',
    path: '/api/v1/submittal/spec-extract',
    description: 'Extract submittal-related requirements, products, documents, certifications, and source quotes from supplied specification text.',
    tags: ['submittal', 'specification', 'requirements', 'construction', 'agent-tool'],
    economics: { usdcPrice: null, wtwrAtomic: null, wtwrDisplay: null, pricingMode: 'pending-validation', costClass: 'model-assisted' },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { text: { type: 'string', maxLength: 100000 } },
      required: ['text'],
    },
    inputExample: { text: 'SECTION 323113 ... SUBMITTALS ...' },
    outputSchema: {
      type: 'object',
      properties: { requirements: { type: 'array', items: { type: 'object' } }, provenance: { type: 'object' } },
      required: ['requirements', 'provenance'],
    },
  }),

  submittal_conflict_check: capability({
    id: 'submittal_conflict_check',
    status: CAPABILITY_STATUS.PLANNED,
    family: 'submittal',
    name: 'Submittal conflict check',
    method: 'POST',
    path: '/api/v1/submittal/conflict-check',
    description: 'Detect conflicting supplied requirements across specification, addendum, drawing-note, and product-data text.',
    tags: ['submittal', 'conflict-detection', 'addendum', 'construction', 'agent-tool'],
    economics: { usdcPrice: null, wtwrAtomic: null, wtwrDisplay: null, pricingMode: 'pending-validation', costClass: 'model-assisted' },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { sources: { type: 'array', items: { type: 'object' }, minItems: 2 } },
      required: ['sources'],
    },
    inputExample: { sources: [{ label: 'spec', text: '...' }, { label: 'addendum-2', text: '...' }] },
    outputSchema: {
      type: 'object',
      properties: { conflicts: { type: 'array', items: { type: 'object' } }, provenance: { type: 'object' } },
      required: ['conflicts', 'provenance'],
    },
  }),

  submittal_resubmittal_delta: capability({
    id: 'submittal_resubmittal_delta',
    status: CAPABILITY_STATUS.PLANNED,
    family: 'submittal',
    name: 'Resubmittal delta',
    method: 'POST',
    path: '/api/v1/submittal/resubmittal-delta',
    description: 'Compare prior and revised submittal text to identify changed, added, removed, and unresolved items.',
    tags: ['submittal', 'resubmittal', 'diff', 'construction', 'agent-tool'],
    economics: { usdcPrice: null, wtwrAtomic: null, wtwrDisplay: null, pricingMode: 'pending-validation', costClass: 'deterministic-plus-model' },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { previous: { type: 'string', maxLength: 100000 }, revised: { type: 'string', maxLength: 100000 } },
      required: ['previous', 'revised'],
    },
    inputExample: { previous: '...', revised: '...' },
    outputSchema: {
      type: 'object',
      properties: { changes: { type: 'array', items: { type: 'object' } }, unresolved: { type: 'array', items: { type: 'object' } }, provenance: { type: 'object' } },
      required: ['changes', 'unresolved', 'provenance'],
    },
  }),
});

function listCapabilities(options = {}) {
  const status = options.status;
  return Object.values(CAPABILITIES).filter(item => !status || item.status === status);
}

function getLiveCapabilities() {
  return listCapabilities({ status: CAPABILITY_STATUS.LIVE });
}

function publicCapabilityRecord(item) {
  return {
    id: item.id,
    status: item.status,
    family: item.family,
    name: item.name,
    method: item.method,
    path: item.path,
    description: item.description,
    tags: item.tags,
    price: {
      usdc: item.economics.usdcPrice,
      wtwr: item.economics.wtwrDisplay,
    },
    pricing_mode: item.economics.pricingMode,
    cost_class: item.economics.costClass,
    input_schema: item.inputSchema,
    output_schema: item.outputSchema,
  };
}

module.exports = {
  CAPABILITIES,
  CAPABILITY_STATUS,
  WTWR_CONTRACT,
  getLiveCapabilities,
  listCapabilities,
  publicCapabilityRecord,
};
