// Watchtower — Stripe Webhook (business billing)
// The only writer of businesses.stripe_customer_id, stripe_subscription_id,
// and billing_status. Runs as service_role, which bypasses RLS and grants
// entirely -- that, combined with the column-scoped grant added in
// 20260727130000_business_column_scoped_grants.sql (which removed owner
// UPDATE access to those three columns), makes this endpoint the only path
// that can set them. Signature-verified; raw body required, so body
// parsing is disabled below.

const Stripe = require('stripe');

const SUPABASE_URL = 'https://eypovuxuddiqgncjdpkq.supabase.co';

module.exports.config = {
  api: { bodyParser: false },
};

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
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
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({ error: 'Missing STRIPE_WEBHOOK_SECRET.' });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY.' });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  const rawBody = await buffer(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Signature verification failed: ${err.message}` });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const businessId = session.metadata && session.metadata.business_id;

      if (session.mode === 'subscription' && businessId) {
        const patchRes = await serviceRequest(`businesses?id=eq.${businessId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            billing_status: 'active',
          }),
        });
        if (!patchRes.ok) {
          const err = await patchRes.text();
          console.error('Failed to write checkout.session.completed to businesses:', err);
          return res.status(500).json({ error: 'Failed to update business billing record.' });
        }
      } else {
        console.warn('checkout.session.completed missing business_id metadata or not a subscription; ignoring.', session.id);
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const status = event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status;

      const patchRes = await serviceRequest(`businesses?stripe_customer_id=eq.${subscription.customer}`, {
        method: 'PATCH',
        body: JSON.stringify({
          stripe_subscription_id: subscription.id,
          billing_status: status,
        }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.text();
        console.error(`Failed to write ${event.type} to businesses:`, err);
        return res.status(500).json({ error: 'Failed to update business billing record.' });
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handling error:', err);
    return res.status(500).json({ error: 'Webhook handling failed.', detail: err.message });
  }
};
