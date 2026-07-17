const STRIPE_API = 'https://api.stripe.com/v1/checkout/sessions';

function getBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      return {};
    }
  }
  return {};
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;

  if (!stripeSecretKey || !priceId) {
    return res.status(500).json({ error: 'Stripe payment configuration is incomplete.' });
  }

  const { name, email, address, zip } = getBody(req);
  if (!name || !email || !address) {
    return res.status(400).json({ error: 'Name, email, and address are required.' });
  }

  const origin = `https://${req.headers.host || 'app.ocalaassetsecurity.com'}`;
  const form = new URLSearchParams({
    mode: 'subscription',
    customer_email: email,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'metadata[name]': name,
    'metadata[address]': address,
    'metadata[zip]': zip || '',
    success_url: `${process.env.STRIPE_SUCCESS_URL || `${origin}/?checkout=success`}`,
    cancel_url: `${process.env.STRIPE_CANCEL_URL || `${origin}/?checkout=cancelled`}`,
  }).toString();

  try {
    const stripeResponse = await fetch(STRIPE_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });

    const session = await stripeResponse.json();
    if (!stripeResponse.ok) {
      console.error('Stripe checkout error:', session);
      return res.status(502).json({ error: 'Stripe could not create a checkout session.' });
    }

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Stripe request failed:', error);
    return res.status(502).json({ error: 'Could not reach Stripe. Please try again.' });
  }
};
