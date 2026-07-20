// api/grade.js — Watchtower operator intake grading
// Replace the whole file with this. Deploy, scan once, then check Vercel runtime logs.

const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You are the Watchtower operator intake grading instrument.
You are NOT a coach and NOT an educator. You are a cold, precise grading tool
used by an operator at intake to price a load.

Rules:
- No encouragement, no fluff, no praise, no hedging language.
- If you cannot see enough to grade confidently, say so plainly and lower confidence.
- Flag contamination explicitly. Contamination changes payout.
- Flag safety hazards explicitly: lithium cells, sealed capacitors, leaking batteries,
  mercury switches, CRT glass, freon-bearing appliances.
- Never invent a weight. If weight is not provided, estimate a range and mark it estimated.

Respond with ONLY a raw JSON object. No markdown, no backticks, no preamble.
Use exactly this shape:

{
  "material": "short name of the dominant material",
  "grade": "the trade grade designation",
  "confidence": "high | medium | low",
  "estimated_weight_lbs": { "low": 0, "high": 0, "estimated": true },
  "contamination": ["each contaminant found, empty array if clean"],
  "safety_flags": ["each hazard found, empty array if none"],
  "downgrade_reasons": ["why this is not a higher grade, empty array if top grade"],
  "price_per_lb_usd": { "low": 0, "high": 0 },
  "load_value_usd": { "low": 0, "high": 0 },
  "payout": {
    "platform_usd": { "low": 0, "high": 0 },
    "resident_usd": { "low": 0, "high": 0 },
    "driver_usd": { "low": 0, "high": 0 },
    "resident_wtwr": { "low": 0, "high": 0 }
  },
  "operator_notes": "one or two sentences, blunt, actionable at the scale"
}

Payout math is fixed: platform 50%, resident 40%, driver 10% of load_value_usd.
resident_wtwr = resident_usd * 100 (peg is 100 WTWR per $1).`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("GRADE: ANTHROPIC_API_KEY is not set in this environment");
    return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY" });
  }

  try {
    const body = req.body || {};

    // Accept whatever key the front end happens to send.
    const rawImage =
      body.image || body.imageBase64 || body.photo || body.data || body.base64;

    if (!rawImage) {
      console.error("GRADE: no image in body. Keys received:", Object.keys(body));
      return res.status(400).json({ error: "No image received" });
    }

    // THE FIX: strip the data URL prefix. Anthropic wants raw base64 only.
    // "data:image/jpeg;base64,/9j/4AAQ..." -> "/9j/4AAQ..."
    let base64 = String(rawImage);
    let mediaType = "image/jpeg";

    const dataUrlMatch = base64.match(/^data:(image\/[a-zA-Z+]+);base64,(.*)$/s);
    if (dataUrlMatch) {
      mediaType = dataUrlMatch[1];
      base64 = dataUrlMatch[2];
    }
    base64 = base64.replace(/\s/g, "");

    if (mediaType === "image/jpg") mediaType = "image/jpeg";

    const userText = body.notes
      ? `Operator notes from the scale: ${body.notes}`
      : "Grade this intake load.";

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              { type: "text", text: userText },
            ],
          },
        ],
      }),
    });

    // THE DIAGNOSTIC: read the body as text first so a failure is always readable.
    const rawBody = await anthropicRes.text();

    if (!anthropicRes.ok) {
      console.error(
        "GRADE: Anthropic returned",
        anthropicRes.status,
        "->",
        rawBody
      );
      return res.status(502).json({
        error: "Grading service rejected the request",
        status: anthropicRes.status,
        detail: rawBody,
      });
    }

    const data = JSON.parse(rawBody);

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();

    let grade;
    try {
      grade = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("GRADE: model did not return clean JSON ->", cleaned);
      return res.status(200).json({ raw: cleaned, parse_failed: true });
    }

    return res.status(200).json(grade);
  } catch (err) {
    console.error("GRADE: unhandled failure ->", err && err.stack ? err.stack : err);
    return res.status(500).json({ error: "Grading failed", detail: String(err) });
  }
}
