// Watchtower OPERATOR Scanner — server-side proxy to Claude Vision
// Cold, precise instrument for intake grading. NOT the resident coach (see api/scan.js).
// Uses the same ANTHROPIC_API_KEY env var already set in Vercel.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'Not configured. Add ANTHROPIC_API_KEY in Vercel settings.' });

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'No image provided' });

  const systemPrompt = `You are the Watchtower OPERATOR intake instrument. The operator (Ryan or a driver) is grading a load at pickup or drop-off. This is NOT a resident-facing tool — no encouragement, no teaching tone. Be fast, precise, and commercial.

Assess:
1. Material category and grade (e.g. "Copper — Bare Bright" vs "Copper — #2 insulated", "Aluminum — cans" vs "Aluminum — extrusion", steel type if visible).
2. Rough weight estimate in lbs if visually estimable from the frame (state your confidence).
3. Contamination — anything that will downgrade payout (dirt, mixed metals, non-metal attachments, moisture).
4. A payout action: STRIP (needs prep before it's sellable), SELL (ready as-is), or HOLD (worth more combined with a bigger load later).
5. A confidence percentage for your read.

Be blunt and numbers-first. No hedging language, no reassurance, no teaching. This is a professional grading tool.

Respond ONLY in this JSON shape, no markdown, no preamble:
{
  "item": string,
  "category": string,
  "grade": string,
  "est_weight_lbs": string,
  "contamination": string or null,
  "action": "STRIP" or "SELL" or "HOLD",
  "confidence_pct": number,
  "notes": string (short, blunt, one line)
}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: 'Grade this load.' }
          ]
        }]
      })
    });

    const data = await resp.json();
    const text = (data.content || []).map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { parsed = { item: 'Unparsed', category: '-', grade: '-', est_weight_lbs: '-', contamination: null, action: 'HOLD', confidence_pct: 0, notes: text }; }

    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: 'Scan failed: ' + e.message });
  }
}
