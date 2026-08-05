const { auth, cors, fail, rpc } = require('../server/resident');

module.exports = async function handler(req, res) {
  if (cors(req, res, 'GET,POST,OPTIONS')) return;
  if (!['GET', 'POST'].includes(req.method)) return fail(res, 405, 'method_not_allowed', 'Method not allowed.');
  try {
    const { token } = await auth(req);
    const body = req.body || {};
    const name = req.method === 'POST' ? 'resident_collection_request_pickup' : 'resident_collection_pickup_status';
    return res.status(200).json(await rpc(token, name, { p_collection_id: body.collectionId || req.query?.collectionId, ...(req.method === 'POST' ? { p_pickup_lat: body.latitude, p_pickup_lng: body.longitude, p_location_accuracy_m: body.locationAccuracyM, p_idempotency_key: body.idempotencyKey } : {}) }));
  } catch (error) { return fail(res, error.status || 500, error.code || 'server_failure', error.status ? error.message : 'Pickup operation failed.'); }
};
