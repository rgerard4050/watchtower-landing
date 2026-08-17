'use strict';

const MODEL = 'claude-sonnet-5';

const SYSTEM_PROMPT = `You write short, honest collector-group marketplace posts for a scrap and
collectibles reseller. You are not an appraiser.

Rules:
- State only the submitted item, condition, and asking price.
- Never imply authentication, certification, grading, or expert verification.
- Do not use hype language or exclamation points.
- Always end with: "Cash, local pickup, Ocala."
- Return only JSON with string fields "title" and "body".`;

function send(res, status, body) {
  return res.status(status).json(body);
}

async function generateLegacyListing(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  if (!process.env.ANTHROPIC_API_KEY) {
    return send(res, 503, { error: 'Listing generation is not configured.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
  const category = typeof body.category === 'string' ? body.category.trim().slice(0, 100) : 'unspecified';
  const description = typeof body.description === 'string'
    ? body.description.trim().slice(0, 2_000)
    : 'no additional description provided';
  const askPrice = Number(body.ask_price);
  if (!name || !Number.isFinite(askPrice) || askPrice <= 0) {
    return send(res, 400, { error: 'Item name and a positive asking price are required.' });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Item: ${name}\nCategory: ${category}\nCondition: ${description}\nAsking price: $${askPrice.toFixed(2)}`,
        }],
      }),
    });
    if (!upstream.ok) return send(res, 502, { error: 'Listing generation service rejected the request.' });

    const payload = await upstream.json();
    const text = (payload.content || [])
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .replace(/```json|```/gi, '')
      .trim();
    const listing = JSON.parse(text);
    if (typeof listing.title !== 'string' || typeof listing.body !== 'string') {
      throw new Error('Invalid listing response shape.');
    }
    return send(res, 200, { title: listing.title.slice(0, 200), body: listing.body.slice(0, 3_000) });
  } catch (error) {
    console.error('listing-agent error', error);
    return send(res, 502, { error: 'Listing generation failed.' });
  }
}

module.exports = { generateLegacyListing };
