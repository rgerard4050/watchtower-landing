// api/generate-listing.js — Watchtower Revenue Console listing generator
// Same pattern as api/grade.js: Vercel serverless route, Anthropic call,
// strict JSON-only response.

const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You write short, honest collector-group marketplace posts for a scrap and
collectibles reseller. You are NOT a hype copywriter and NOT an appraiser.

Rules:
- State facts only: what the item is, its condition exactly as described, and the asking price.
- Never claim authentication, certification, grading, or expert verification that hasn't
  actually happened. If the description doesn't say it was verified, don't imply it was.
- No hype language: no "rare", "must-have", "incredible deal", "won't last", exclamation points.
- Always end with: "Cash, local pickup, Ocala."
- Keep the body short enough to paste directly into a Facebook group post as-is.

Respond with ONLY a raw JSON object. No markdown, no backticks, no preamble.
{
  "title": "short listing title",
  "body": "the full post text, ready to copy-paste, including price and the pickup line"
}`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("GENERATE-LISTING: ANTHROPIC_API_KEY is not set in this environment");
    return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY" });
  }

  try {
    const body = req.body || {};
    const name = body.name;
    const category = body.category;
    const description = body.description;
    const askPrice = body.ask_price;

    if (!name || !askPrice) {
      return res.status(400).json({ error: "Item name and asking price are required" });
    }

    const userText = `Item: ${name}
Category: ${category || "unspecified"}
Condition/description as given by the seller: ${description || "no additional description provided"}
Asking price: $${askPrice}`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: userText },
        ],
      }),
    });

    const rawBody = await anthropicRes.text();

    if (!anthropicRes.ok) {
      console.error("GENERATE-LISTING: Anthropic returned", anthropicRes.status, "->", rawBody);
      return res.status(502).json({
        error: "Listing generation service rejected the request",
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

    let listing;
    try {
      listing = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("GENERATE-LISTING: model did not return clean JSON ->", cleaned);
      return res.status(200).json({ raw: cleaned, parse_failed: true });
    }

    return res.status(200).json(listing);
  } catch (err) {
    console.error("GENERATE-LISTING: unhandled failure ->", err && err.stack ? err.stack : err);
    return res.status(500).json({ error: "Listing generation failed", detail: String(err) });
  }
}
