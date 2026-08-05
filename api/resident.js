const { auth, cors, fail, projectPreviews, rpc, serviceRpc, uploadEvidence, verifyAnalysis } = require('../server/resident');

async function collection(req, res) {
  if (cors(req, res)) return;
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS');
    return fail(res, 405, 'method_not_allowed', 'Method not allowed.');
  }
  try {
    const { token, user } = await auth(req);
    if (req.method === 'GET') return res.status(200).json(await projectPreviews(await rpc(token, 'resident_collection_open_or_recover')));
    const body = req.body || {};
    if (req.method === 'DELETE') {
      const result = await rpc(token, 'resident_collection_remove_item', { p_collection_id: body.collectionId, p_item_id: body.itemId, p_expected_version: body.expectedVersion });
      return res.status(200).json(await projectPreviews(result));
    }
    if (body.action === 'stage') {
      const result = await rpc(token, 'resident_collection_stage', { p_collection_id: body.collectionId, p_expected_version: body.expectedVersion, p_idempotency_key: body.idempotencyKey });
      return res.status(200).json(await projectPreviews(result));
    }
    if (body.action !== 'add_item' || !body.clientItemId || !body.analysisToken || !body.imageBase64) return fail(res, 422, 'validation_error', 'Invalid item request.');
    const analysis = verifyAnalysis(body.analysisToken);
    const itemId = body.clientItemId;
    const evidenceId = analysis.analysisId;
    let result = await serviceRpc('resident_collection_add_item', {
      p_resident_user_id: user.id, p_collection_id: body.collectionId, p_item_id: itemId,
      p_client_item_id: body.clientItemId, p_evidence_id: evidenceId, p_expected_version: body.expectedVersion,
      p_analysis_id: analysis.analysisId, p_analysis_model: analysis.model, p_summary: analysis.summary,
      p_materials: analysis.itemsSeen, p_estimated_low: analysis.estimatedValueLow,
      p_estimated_high: analysis.estimatedValueHigh, p_confidence: analysis.confidence || null,
    });
    const item = result.items.find((candidate) => candidate.clientItemId === body.clientItemId);
    if (!item) return fail(res, 500, 'server_failure', 'Collection item was not returned.');
    await uploadEvidence(`${user.id}/${result.collectionId}/${item.id}/${item.evidenceId}.jpg`, body.imageBase64);
    result = await serviceRpc('resident_collection_attach_evidence', {
      p_resident_user_id: user.id, p_collection_id: result.collectionId,
      p_item_id: item.id, p_evidence_id: item.evidenceId,
    });
    return res.status(200).json(await projectPreviews(result));
  } catch (error) {
    return fail(res, error.status || 500, error.code || 'server_failure', error.status ? error.message : 'Resident operation failed.');
  }
}

async function pickup(req, res) {
  if (cors(req, res, 'GET,POST,OPTIONS')) return;
  if (!['GET', 'POST'].includes(req.method)) return fail(res, 405, 'method_not_allowed', 'Method not allowed.');
  try {
    const { token } = await auth(req);
    const body = req.body || {};
    const name = req.method === 'POST' ? 'resident_collection_request_pickup' : 'resident_collection_pickup_status';
    return res.status(200).json(await rpc(token, name, {
      p_collection_id: body.collectionId || req.query?.collectionId,
      ...(req.method === 'POST' ? { p_pickup_lat: body.latitude, p_pickup_lng: body.longitude, p_location_accuracy_m: body.locationAccuracyM, p_idempotency_key: body.idempotencyKey } : {}),
    }));
  } catch (error) {
    return fail(res, error.status || 500, error.code || 'server_failure', error.status ? error.message : 'Pickup operation failed.');
  }
}

async function progression(req, res) {
  if (cors(req, res, 'GET,POST,OPTIONS')) return;
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return fail(res, 405, 'method_not_allowed', 'Method not allowed.');
  }
  try {
    const { token } = await auth(req);
    if (req.method === 'GET') {
      return res.status(200).json(await rpc(token, 'resident_gamification_projection'));
    }
    const body = req.body || {};
    if (('activeContext' in body && body.activeContext !== 'resident')
      || 'recipientUserId' in body || 'residentUserId' in body || 'organizationId' in body) {
      return fail(res, 403, 'forbidden', 'Cross-context progression attribution is not allowed.');
    }
    if ('xp' in body || 'xpAmount' in body || 'amount' in body) {
      return fail(res, 422, 'validation_error', 'XP amounts are server-derived.');
    }
    if (body.action !== 'complete_learning' || typeof body.moduleId !== 'string'
      || !Number.isInteger(body.moduleVersion) || !body.idempotencyKey) {
      return fail(res, 422, 'validation_error', 'Invalid learning completion request.');
    }
    return res.status(200).json(await rpc(token, 'resident_complete_learning_module', {
      p_module_id: body.moduleId,
      p_module_version: body.moduleVersion,
      p_idempotency_key: body.idempotencyKey,
    }));
  } catch (error) {
    return fail(res, error.status || 500, error.code || 'server_failure', error.status ? error.message : 'Progression operation failed.');
  }
}

module.exports = async function handler(req, res) {
  const resource = String(req.query?.resource || '').toLowerCase();
  if (resource === 'collection') return collection(req, res);
  if (resource === 'pickup') return pickup(req, res);
  if (resource === 'progression') return progression(req, res);
  return fail(res, 404, 'not_found', 'Resident resource not found.');
};
