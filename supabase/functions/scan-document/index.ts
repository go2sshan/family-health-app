// Supabase Edge Function: scan-document
// Reads photos of a prescription, bill, lab report or other medical document with Claude
// and returns suggested history entries. The app shows them for review before anything is saved.
//
// Secrets (set with `supabase secrets set ...`):
//   ANTHROPIC_API_KEY   required
//   ANTHROPIC_MODEL     optional, defaults to claude-sonnet-5-5
//
// The function requires a signed-in user (Supabase verifies the JWT before this code runs).

const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 4_500_000; // base64 payload per image after the app downsizes it
const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type ScanRequest = {
  images: { data: string; mediaType: string }[];
  hint?: "prescription" | "bill" | null;
  country?: string | null;
  knownLabs?: string[];
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function prompt(req: ScanRequest) {
  const labs = (req.knownLabs ?? []).slice(0, 40).join("; ") || "none yet";
  const hint =
    req.hint === "bill"
      ? `This photo is a payment bill or receipt (hospital, clinic, lab or pharmacy). Create one entry per charged service or medicine, with amountPaid and currency on each line. Use "medicine" for pharmacy items, "lab" only when a test result value is printed (otherwise "procedure" with the test name), and "visit" for consultation fees. Put the bill or receipt number in notes.\n`
      : req.hint === "prescription"
        ? `This photo is a prescription. Create one "medicine" entry per medicine with dose, timing (for example 1-0-1 means morning and night) and duration in notes, one "diagnosis" entry if a diagnosis is written, and one "visit" entry for the consultation.\n`
        : "";
  return `${hint}You are reading photos of one personal medical document: a prescription, lab report, discharge summary, vaccination card, bill, receipt or doctor's note. It may come from any country${req.country ? ` (the person says ${req.country})` : ""} and be in English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Spanish or another language, printed or handwritten.
Extract every distinct medical fact as a history entry and translate everything into plain English. Do not guess: if something is unreadable, leave it out or use null, and lower the confidence.
Reply with only JSON in this shape:
{"documentType": string, "documentDate": "YYYY-MM-DD" or null, "facility": string or null, "doctor": string or null, "country": string or null, "language": string,
 "items": [{"kind": "visit"|"diagnosis"|"lab"|"medicine"|"vaccination"|"procedure"|"allergy", "date": "YYYY-MM-DD" or null, "title": string, "value": number or null, "unit": string or null, "ongoing": boolean, "notes": string, "confidence": "high"|"medium"|"low", "amountPaid": number or null, "currency": ISO 4217 code or null}]}
Rules:
- Medicines: title is the name and strength as written, then the generic name in parentheses if known, e.g. "Glycomet 500 mg (metformin)". Dose, timing and duration go in notes. ongoing is true unless a short course is stated.
- Lab results: one item per test; title is the standard English test name, e.g. "Hemoglobin A1c", "LDL cholesterol". value and unit exactly as printed; reference range in notes. Reuse one of these existing names when it is the same test: ${labs}.
- Add one "visit" item when the document records a consultation or admission; its title is the reason for the visit.
- Dates on Indian and most non-US documents are day/month/year. Convert to YYYY-MM-DD.
- amountPaid and currency only when the document shows a fee or charge for that entry. Use INR for rupees.
- notes are short and factual. Never add medical advice.`;
}

function extractJson(text: string): unknown {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* fall through */ } }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1));
  throw new Error("no json");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "Scanning isn't set up yet: the ANTHROPIC_API_KEY secret is missing." }, 500);

  let body: ScanRequest;
  try { body = await req.json(); } catch { return json({ error: "The request wasn't valid JSON." }, 400); }

  const images = Array.isArray(body.images) ? body.images : [];
  if (!images.length) return json({ error: "Add at least one photo." }, 400);
  if (images.length > MAX_IMAGES) return json({ error: `Use up to ${MAX_IMAGES} pages per document.` }, 400);
  for (const im of images) {
    if (!MEDIA_TYPES.has(im?.mediaType) || typeof im?.data !== "string") return json({ error: "Photos must be JPEG, PNG or WebP." }, 400);
    if (im.data.length > MAX_IMAGE_BYTES) return json({ error: "A photo is too large. Try again; the app shrinks photos before sending." }, 413);
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: [
          ...images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.mediaType, data: im.data } })),
          { type: "text", text: prompt(body) },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("anthropic error", res.status, detail.slice(0, 500));
    const msg = res.status === 429 ? "Too many scans right now. Try again in a minute." : "The document couldn't be read right now. Try again.";
    return json({ error: msg }, res.status === 429 ? 429 : 502);
  }

  const out = await res.json();
  const text = (out.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  try {
    const parsed = extractJson(text) as Record<string, unknown>;
    if (!Array.isArray(parsed.items)) parsed.items = [];
    return json(parsed);
  } catch {
    return json({ error: "The reading came back incomplete. Try a clearer photo or fewer pages." }, 422);
  }
});
