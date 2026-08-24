'use strict';

const { randomUUID } = require('node:crypto');
const { AppError } = require('./errors');
const { normalizeDemoReviewRequest } = require('./validation');

function parseBody(value) {
  if (typeof value !== 'string') return value || {};
  try {
    return JSON.parse(value);
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'The request body is not valid JSON.');
  }
}

function source(file, page, section, quote) {
  return { file, page, section, quote };
}

function buildLocalDemoReport(input) {
  const specification = input.files.find((file) => file.role === 'specification');
  const submittal = input.files.find((file) => file.role === 'submittal');
  const samplePair = /sample-01-project-specification/i.test(specification.name)
    && /sample-02-contractor-submittal/i.test(submittal.name);

  if (!samplePair) {
    return {
      decision: 'demo_only',
      summary: 'The local demo accepted and validated both PDFs, but it only has a prebuilt comparison for the two Watchtower sample files.',
      requirements: [],
      risks: [],
      missing_documents: [],
      limitations: [
        'No document content was sent outside this computer.',
        'Connect an OpenAI API key to analyze arbitrary project documents.',
        'Use the two Watchtower sample PDFs to see the complete demonstration report.',
      ],
      review_notice: 'LOCAL DEMO ONLY - no AI analysis occurred. Human professional review is still required.',
    };
  }

  return {
    decision: 'revise_before_review',
    summary: `${input.project} / ${input.trade}: the proposed heat-pump package conflicts with multiple governing requirements and is incomplete for professional review.`,
    requirements: [
      {
        id: 'R-1', requirement: 'Provide a 3-ton system with at least 34,000 Btu/h cooling capacity.', status: 'conflict',
        source: source(specification.name, 1, '2. Performance Requirements', '3 tons; cooling capacity not less than 34,000 Btu/h'),
        package_evidence: 'The proposed BPX-42R / BAH-42C system is listed as 3.5 tons and 40,200 Btu/h.',
        recommended_fix: 'Select a compliant 3-ton matched system or submit an approved design-change request with load calculations.',
      },
      {
        id: 'R-2', requirement: 'Meet minimum 15.0 SEER2 and 8.0 HSPF2.', status: 'conflict',
        source: source(specification.name, 1, '2. Performance Requirements', 'Minimum 15.0 SEER2 and 8.0 HSPF2'),
        package_evidence: 'The proposed system lists 14.3 SEER2 and 7.5 HSPF2.',
        recommended_fix: 'Provide a certified matched selection meeting both minimum efficiency ratings.',
      },
      {
        id: 'R-3', requirement: 'Use factory-charged R-32 refrigerant.', status: 'conflict',
        source: source(specification.name, 1, '2. Performance Requirements', 'R-32, factory charged'),
        package_evidence: 'The proposed outdoor unit lists R-410A.',
        recommended_fix: 'Replace the selection with an R-32 system; transition adapters are not acceptable.',
      },
      {
        id: 'R-4', requirement: 'Outdoor sound rating must not exceed 72 dBA.', status: 'conflict',
        source: source(specification.name, 1, '2. Performance Requirements', 'not greater than 72 dBA'),
        package_evidence: 'The submitted sound rating is 74 dBA.',
        recommended_fix: 'Select quieter equipment or obtain written approval for the deviation.',
      },
      {
        id: 'R-5', requirement: 'MCA must not exceed 24 A and MOCP must not exceed 35 A.', status: 'conflict',
        source: source(specification.name, 1, '2. Performance Requirements', 'MCA not greater than 24 A; MOCP 35 A maximum'),
        package_evidence: 'The submitted values are MCA 26 A and MOCP 40 A; feeder coordination is unverified.',
        recommended_fix: 'Coordinate the feeder and disconnect, then submit compliant nameplate data.',
      },
      {
        id: 'R-6', requirement: 'Include low-ambient operation, coastal coating, BACnet gateway, and specified warranty.', status: 'missing',
        source: source(specification.name, 2, '3. Required Accessories and Quality', 'Factory-approved operation down to 20 degrees F'),
        package_evidence: 'Required kit, coating, gateway, and 10-year compressor coverage are not included.',
        recommended_fix: 'Add every required accessory and provide option codes plus written warranty documentation.',
      },
    ],
    risks: [
      {
        severity: 'high', finding: 'The proposed system is not a compliant equivalent.',
        source: source(submittal.name, 2, 'Contractor notes and exceptions', 'selected due to distributor availability'),
        suggested_action: 'Revise and resubmit before forwarding for design-professional review.',
      },
      {
        severity: 'high', finding: 'Electrical coordination may require feeder or disconnect changes.',
        source: source(submittal.name, 2, 'Contractor notes and exceptions', 'have not yet been rechecked'),
        suggested_action: 'Have the responsible contractor verify branch-circuit requirements before approval.',
      },
      {
        severity: 'medium', finding: 'The required deviation comparison is absent.',
        source: source(submittal.name, 2, 'Contractor notes and exceptions', 'No point-by-point deviation comparison is attached'),
        suggested_action: 'Attach a complete requirement-by-requirement comparison with every exception identified.',
      },
    ],
    missing_documents: [
      {
        document: 'AHRI certificate for the exact matched system',
        requirement_source: source(specification.name, 2, '3. Required Accessories and Quality', 'AHRI certified matched indoor/outdoor combination'),
        why_needed: 'Confirms the proposed indoor/outdoor pairing and certified efficiency.',
      },
      {
        document: 'Dimensional drawing and selected accessory schedule',
        requirement_source: source(specification.name, 1, '1.1 Submittal Requirements', 'dimensions, weight, accessories'),
        why_needed: 'Supports field coordination and verifies required options.',
      },
      {
        document: 'Written compressor and parts warranty',
        requirement_source: source(specification.name, 2, '3. Required Accessories and Quality', 'Minimum 10-year compressor and 5-year parts warranty'),
        why_needed: 'The standard submitted warranty does not meet the specified compressor term.',
      },
    ],
    limitations: [
      'This is a deterministic report built only for the Watchtower sample pair.',
      'No PDF content left this computer and no external AI service was called.',
      'Field conditions, code compliance, calculations, and manufacturer authenticity were not verified.',
    ],
    review_notice: 'LOCAL DEMO ONLY - NO AI ANALYSIS. This preflight is not approval and must be checked by the responsible contractor and design professional.',
  };
}

async function localDemoHandler(req, res) {
  const requestId = randomUUID();
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED', request_id: requestId });
  }
  try {
    const body = parseBody(req.body);
    if (body.use_sample_pair === true) {
      const samplePdf = Buffer.from('%PDF-1.4\n% Watchtower local demo sample').toString('base64');
      body.project = String(body.project || '').trim() || 'Pine Street Community Center';
      body.trade = String(body.trade || '').trim() || 'HVAC equipment';
      body.files = [
        { role: 'specification', name: 'sample-01-project-specification.pdf', data_base64: samplePdf },
        { role: 'submittal', name: 'sample-02-contractor-submittal.pdf', data_base64: samplePdf },
      ];
    }
    const input = normalizeDemoReviewRequest(body);
    return res.status(200).json({
      report: buildLocalDemoReport(input),
      model: 'LOCAL DEMO - NO AI',
      local_only: true,
      request_id: requestId,
    });
  } catch (error) {
    const known = error instanceof AppError;
    if (!known) console.error('[submittal-local-demo] unexpected failure', { requestId, error: String(error) });
    return res.status(known ? error.status : 500).json({
      error: known ? error.message : 'The local demonstration could not be completed.',
      code: known ? error.code : 'INTERNAL_ERROR',
      request_id: requestId,
    });
  }
}

module.exports = { buildLocalDemoReport, localDemoHandler };
