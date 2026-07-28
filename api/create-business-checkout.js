// Watchtower — Business Checkout
// Creates a Stripe Checkout session for a partner business's subscription
// tier (+ optional ad add-ons). Price IDs are read from environment
// variables so switching test -> live mode is a Vercel config change, not
// a code change. Mirrors the auth pattern from driver-connect-onboarding.js.

const Stripe = require('stripe');

const SUPABASE_URL = 'https://eypovuxuddiqgncjdpkq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZlykauNc-3YY80w6nxzsKw_Z2lgAgU1';

const TIERS = ['Signal', 'Enforcer', 'Sentinel'];
const INTERVALS = ['monthly', 'annual'];
const ADDONS = ['boost', 'featured'];

const PRICE_ENV_VARS = {
  Signal: { monthly: 'STRIPE_PRICE_SIGNAL_MONTHLY', annual: 'STRIPE_PRICE_SIGNAL_ANNUAL' },
  Enforcer: { monthly: 'STRIPE_PRICE_ENFORCER_MONTHLY', annual: 'STRIPE_PRICE_ENFORCER_ANNUAL' },
  Sentinel: { monthly: 'STRIPE_PRICE_SENTINEL_MONTHLY', annual: 'STRIPE_PRICE_SENTINEL_ANNUAL' },
};

const ADDON_ENV_VARS = {
  boost: 'STRIPE_PRICE_AD_BOOST',
  featured: 'STRIPE_PRICE_AD_FEATURED',
};

async function getAuthedUser(accessToken) {
  if (!accessToken) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function serviceRequest(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {}),
    },
  });
  return res;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY.' });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { access_token, tier, interval, addons } = body;

  if (!TIERS.includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier.' });
  }
  if (!INTERVALS.includes(interval)) {
    return res.status(400).json({ error: 'Invalid billing interval.' });
  }
  const selectedAddons = Array.isArray(addons) ? addons.filter((a) => ADDONS.includes(a)) : [];

  const user = await getAuthedUser(access_token);
  if (!user || !user.id) {
    return res.status(401).json({ error: 'Not signed in.' });
  }

  const bizRes = await serviceRequest(`businesses?auth_id=eq.${user.id}&select=id,stripe_customer_id`);
  const businesses = await bizRes.json();
  const business = Array.isArray(businesses) ? businesses[0] : null;

  if (!business) {
    return res.status(403).json({ error: 'No business profile found for this account.' });
  }

  const tierPriceId = process.env[PRICE_ENV_VARS[tier][interval]];
  if (!tierPriceId) {
    return res.status(500).json({ error: `Missing price config: ${PRICE_ENV_VARS[tier][interval]}` });
  }

  const lineItems = [{ price: tierPriceId, quantity: 1 }];
  for (const addon of selectedAddons) {
    const addonPriceId = process.env[ADDON_ENV_VARS[addon]];
    if (!addonPriceId) {
      return res.status(500).json({ error: `Missing price config: ${ADDON_ENV_VARS[addon]}` });
    }
    lineItems.push({ price: addonPriceId, quantity: 1 });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const origin = `https://${req.headers.host || 'app.ocalaassetsecurity.com'}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: business.stripe_customer_id || undefined,
      customer_email: business.stripe_customer_id ? undefined : user.email,
      line_items: lineItems,
      success_url: `${origin}/business.html?checkout=success`,
      cancel_url: `${origin}/business.html?checkout=cancelled`,
      metadata: { business_id: business.id, tier, interval, addons: selectedAddons.join(',') },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Business checkout error:', err);
    return res.status(502).json({ error: 'Could not start checkout.', detail: err.message });
  }
};
