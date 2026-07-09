// Watchtower Resident Scanner — server-side proxy to Claude Vision
// Keeps the Anthropic API key private. Never expose it in scanner.html.
// SETUP (one time, in Vercel): Project Settings -> Environment Variables ->
//   add ANTHROPIC_API_KEY = your key from console.anthropic.com

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'Scanner not configured yet. Add ANTHROPIC_API_KEY in Vercel project settings.' });

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'No image provided' });

  const systemPrompt = `You are the Watchtower resident recycling coach — friendly, honest, encouraging. A neighbor in Ocala, FL just photographed a pile of recyclable/scrap material on their phone. Your job:

1. Look at the pile and give an honest ballpark read of its collective value RIGHT NOW (be real — most mixed piles are low value, that's normal, say so kindly).
2. Coach them on separation to earn MORE — e.g. "put cords/wires in their own pile", "line up cans so we can count them (doesn't need to be perfect)", "plastic and cardboard can stay together". Only give tips relevant to what you actually see.
3. SAFETY FIRST, always check for: lithium batteries (may not be safe to transport as-is, don't puncture/crush/wet), chemical bottles (may need to be kept separate from metals), anything that shouldn't be crushed or get wet. If you see ANY of these, say so clearly and calmly BEFORE anything else.
4. If you spot something that looks like it could carry real value (copper, aluminum, car battery, appliance, brass) call it out with a genuine dollar estimate range so they feel it.
5. Keep the tone warm, plain-English, never condescending. This is a teaching moment as much as a pricing moment — celebrate good separation.

Respond ONLY in this JSON shape, no markdown, no preamble:
{
  "safety_warning": string or null,
  "items_seen": [string],
  "estimated_value_low": number,
  "estimated_value_high": number,
  "coaching_tip": string,
  "summary": string (2-3 friendly sentences, this is what the resident reads first)
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
        max_tokens: 700,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: 'Read this pile.' }
          ]
        }]
      })
    });

    const data = await resp.json();
    const text = (data.content || []).map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { parsed = { summary: text, safety_warning: null, items_seen: [], estimated_value_low: 0, estimated_value_high: 0, coaching_tip: '' }; }

    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: 'Scan failed: ' + e.message });
  }
}
