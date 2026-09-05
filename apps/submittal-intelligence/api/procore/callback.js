'use strict';

const {
  COOKIE_STATE, exchangeCode, handlerError, requireConfig, sessionCookie, stateCookieName, verifyState,
} = require('../../server/procore');

module.exports = async function callbackHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
  }
  try {
    const config = requireConfig(process.env);
    const query = req.query || Object.fromEntries(new URL(req.url, 'https://local.invalid').searchParams);
    if (query.error) throw new Error('Procore authorization was declined.');
    if (!verifyState(req, query.state, config.clientSecret)) {
      return res.status(400).json({ error: 'Procore connection verification failed. Start again.', code: 'PROCORE_STATE_INVALID' });
    }
    if (!query.code) return res.status(400).json({ error: 'Procore did not return an authorization code.', code: 'PROCORE_CODE_MISSING' });
    const token = await exchangeCode(query.code, config);
    res.setHeader('Set-Cookie', [
      sessionCookie(token, config.clientSecret),
      `${stateCookieName(query.state)}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      `${COOKIE_STATE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    ]);
    res.setHeader('Location', '/?procore=connected');
    return res.status(302).json({ connected: true });
  } catch (error) {
    return handlerError(res, error);
  }
};
