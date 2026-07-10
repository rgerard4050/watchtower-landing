// Watchtower — Resident Scanner API
// Lives at:  /api/scan   (Vercel builds this endpoint from the /api folder)
//
// This version is matched to YOUR scanner.html:
//  - it reads the photo from "imageBase64"
//  - it returns summary / value / coaching_tip / items_seen / safety_warning
//
// Your API key never touches the browser. It stays here, read from a
// Vercel Environment Variable named ANTHROPIC_API_KEY.

const MODEL = "claude-haiku-4-5-20251001"; // cheapest vision model. Swap this ONE line for more accuracy.

const SYSTEM = `You are the Watchtower resident recycling scanner — a friendly, honest coach for everyday residents, not a dealer.
You look at a photo of a pile of materials and help the person understand what they have.

Rules:
- Be honest and encouraging. Never overstate value. If it's basically worthless, say so kindly and use low numbers or 0.
- Value estimates are in US dollars for the whole pile in the photo, as a rough range — not a promise.
- Teach ONE small prep or separation tip that would earn them more.
- Safety first: if you see a lithium battery, aerosol can, sharp metal, or any chemical/hazard, warn clearly in safety_warning. Otherwise leave it empty.
- Never use the words trash, garbage, waste, or refuse. Use recyclables, materials, resources, or scrap.
- items_seen is a short list of the materials you can identify in plain words.

Respond with ONLY a JSON object, no markdown, no backticks, no extra words:
{
  "summary": "friendly plain-English sentence about what's in the photo",
  "estimated_value_low": number,
  "estimated_value_high": number,
  "coaching_tip": "one prep or separation tip to earn more",
  "items_seen": ["material one", "material two"],
  "safety_warning": "hazard warning, or empty string if none"
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
    const { imageBase64, mediaType } = req.body;

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
                source: {
                  type: "base64",
                  media_type: mediaType || "image/jpeg",
                  data: imageBase64,
                },
              },
              { type: "text", text: "What materials are in this photo? Reply with the JSON only." },
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

    // Pull the text out, strip any stray code fences, then parse the JSON.
    const textBlock = (data.content || []).find((b) => b.type === "text");
    const raw = textBlock ? textBlock.text : "";
    const clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(200).json({ error: "Couldn't read a clean result. Try the photo again." });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
