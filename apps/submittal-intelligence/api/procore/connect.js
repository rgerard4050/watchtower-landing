'use strict';

const { LOGIN_BASE, createStateCookie, handlerError, requireConfig } = require('../../server/procore');

module.exports = async function connectHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
  }
  try {
    const config = requireConfig(process.env);
    const { state, cookie } = createStateCookie(config.clientSecret);
    const url = new URL('/oauth/authorize', LOGIN_BASE);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('state', state);
    res.setHeader('Set-Cookie', cookie);
    res.setHeader('Location', url.toString());
    return res.status(302).json({ redirect: url.toString() });
  } catch (error) {
    return handlerError(res, error);
  }
};
