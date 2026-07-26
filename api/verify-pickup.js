// Watchtower — Pickup Photo Verification API
// Lightweight AI content check on a resident's pickup-spot photo: does this
// look like a real staged pile of recyclable material, or something else?
// This is a FLAG only, never a blocker -- the resident's upload always
// succeeds regardless of what this returns. Same pattern as api/scan.js.

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `You are a quick fraud-signal check for Watchtower, a recycling pickup network.
You look at a photo a resident submitted as "where I left my material for pickup."

Your only job: does this photo actually show a staged pile of recyclable material
(metal, cans, wire, cardboard, electronics, appliances, etc.) sitting somewhere
like a driveway, yard, or porch -- the kind of thing a driver could show up and
collect?

Flag it if the photo shows something else entirely: an empty space, plain grass
or foliage with nothing on it, water, a wall, a person, an unrelated object, a
screenshot, or anything that isn't recognizably a pile of material staged for
pickup. Be lenient on photo quality (blurry, dark, odd angle is fine) -- only
flag when the CONTENT doesn't match "recyclable material staged for pickup" at
all.

Respond with ONLY a JSON object, no markdown, no backticks, no extra words:
{
  "looks_like_staged_material": true or false,
  "note": "one short plain-English sentence explaining what you see"
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
        max_tokens: 300,
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
              { type: "text", text: "Does this look like staged recyclable material? Reply with the JSON only." },
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
      // A verification flag that fails to parse should never block the
      // resident -- just report "couldn't tell" rather than erroring out.
      return res.status(200).json({ looks_like_staged_material: true, note: "Could not analyze photo automatically." });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ looks_like_staged_material: true, note: "Verification check failed: " + String(err) });
  }
};
