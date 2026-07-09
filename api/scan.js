// Watchtower — Resident Scanner API
// Lives at:  /api/scan   (Vercel auto-creates this endpoint from the /api folder)
//
// Your API key NEVER touches the browser. It stays here on the server,
// pulled from a Vercel Environment Variable named ANTHROPIC_API_KEY.
//
// The browser sends a photo -> this function asks Claude what it is
// -> Claude answers in strict JSON -> we hand that JSON back to the page.

const MODEL = "claude-haiku-4-5-20251001"; // cheapest vision model. Swap this ONE line for more accuracy.

const SYSTEM = `You are the Watchtower resident recycling scanner.
You are a friendly, encouraging coach for everyday residents — NOT a dealer.
Rules:
- Be honest. Never overstate value. If something is basically worthless, say so kindly and set wtwr_estimate to 0.
- Teach one small, useful prep or separation tip.
- Safety first: if you see a lithium battery, aerosol can, or any chemical/hazard, warn clearly in "safety".
- Never use the words trash, garbage, waste, or refuse. Use recyclables, materials, resources, or scrap.
- wtwr_estimate is a rough WTWR reward guess for a typical single item, not a promise.
- If you are not confident, set verify_needed to true.

Respond with ONLY a JSON object, no markdown, no backticks, no extra words:
{
  "material": "short plain name of the item",
  "detail": "honest grade or specifics",
  "confidence": "high | medium | low",
  "wtwr_estimate": number,
  "tip": "one friendly prep or separation tip",
  "safety": "hazard warning, or empty string if none",
  "verify_needed": true or false
}`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: "Missing ANTHROPIC_API_KEY. Add it in Vercel > Settings > Environment Variables, then redeploy.",
    });
  }

  try {
    const { image, mediaType } = req.body; // image = base64 string (no data: prefix)

    if (!image) {
      return res.status(400).json({ error: "No image sent." });
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
                source: {
                  type: "base64",
                  media_type: mediaType || "image/jpeg",
                  data: image,
                },
              },
              { type: "text", text: "What is this material? Reply with the JSON only." },
            ],
          },
        ],
      }),
    });

    const data = await apiResponse.json();

    // Surface Anthropic errors (bad key, wrong model, out of credit, etc.)
    if (data.error) {
      return res.status(502).json({ error: data.error.message || "API error" });
    }

    // Pull the text block out, strip any stray code fences, then parse the JSON.
    const textBlock = (data.content || []).find((b) => b.type === "text");
    const raw = textBlock ? textBlock.text : "";
    const clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      // If Claude ever replies with non-JSON, don't crash — send the raw text back.
      return res.status(200).json({ parse_error: true, raw });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
