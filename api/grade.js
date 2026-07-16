// Watchtower — OPERATOR intake scanner API
// Compatible with Vercel serverless routes in /api.

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `You are the Watchtower OPERATOR intake scanner — a cold, precise grading instrument for a scrap and e-waste operator at intake. No encouragement, no coaching, no fluff. Identify and grade the material accurately for payout.

Grade against standard scrap grades:
- Copper: Bare Bright, #1 Copper, #2 Copper, insulated wire (note recovery %).
- Aluminum: extrusion, sheet, cast, UBC (used beverage cans).
- Brass: yellow brass, red brass.
- Steel: light iron / shred; Stainless 304 vs 316 (note magnet test).
- Batteries: lead-acid, lithium, alkaline.
- Electric motors, sealed units / compressors.
- E-scrap / PCBs: gold-finger boards, CPUs, RAM, telecom-grade vs low-grade boards.
- Plastics: resin code #1 through #7.
- Glass by color.

Flag contamination and any downgrade reason: attachments, coatings, mixed metals, moisture, non-target material. Give a rough US $/lb range as a STARTING estimate only — the operator sets the real price.

Respond with ONLY a JSON object, no markdown, no backticks, no extra words:
{
  "material": "material family",
  "grade": "specific grade",
  "confidence": "high | medium | low",
  "contamination": "downgrade or contamination notes, or 'none'",
  "price_per_lb_low": number,
  "price_per_lb_high": number,
  "notes": "short technical note, e.g. verify with magnet / strip insulation"
}`;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: "Missing ANTHROPIC_API_KEY. Add it in Vercel > Settings > Environment Variables, then redeploy.",
    });
  }

  try {
    const { imageBase64, mediaType } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: "No image received." });
    }

    const apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 },
              },
              { type: "text", text: "Grade this material. Reply with the JSON only." },
            ],
          },
        ],
      }),
    });

    const data = await apiResponse.json();
    if (data.error) {
      return res.status(502).json({ error: data.error.message || "API error" });
    }

    const textBlock = (data.content || []).find((b) => b.type === "text");
    const raw = textBlock ? textBlock.text : "";
    const clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(200).json({ error: "Unreadable result. Re-shoot the material." });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
