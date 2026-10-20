// Supabase Edge Function "read-sheet": reads a photo of a filled MONTHLY LOG MILES sheet or FUEL TAXES report.
//
// - With ANTHROPIC_API_KEY set, Claude looks at the photo (whole sheet + zoomed top and bottom halves) and returns
//   every dated row already split into its columns: { data: {...} }.
// - Without it, the photo goes to OCR.space (OCR_SPACE_API_KEY) and the app sorts the raw text: { text: "..." }.
//
// Keys live in the function's secrets, never in the web page. Only signed-in users of the app can call it.

import Anthropic from "npm:@anthropic-ai/sdk";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const OCR_KEY = Deno.env.get("OCR_SPACE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// Engine 2 reads numbers and symbols best; set OCR_SPACE_ENGINE=3 to try the handwriting engine.
const OCR_ENGINE = Deno.env.get("OCR_SPACE_ENGINE") ?? "2";
const OCR_MAX_BYTES = 1_000_000; // OCR.space free plan limit per file
const MAX_IMAGE_BYTES = 4_500_000; // per image sent to Claude

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function isSignedIn(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: req.headers.get("apikey") || SUPABASE_ANON_KEY },
  });
  return r.ok;
}

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,(.+)$/s;
const bytesOf = (dataUrl: string) => Math.floor((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);

// ---------------------------------------------------------------- Claude

const PROMPT = `These photos show one paper form from a US trucking company, filled in partly by hand.
The first photo is the whole sheet; the next ones (if any) are zoomed crops of its top and bottom halves, to help you read small handwriting. Transcribe the sheet once.

The form is one of:
1. "monthly_log" — a MONTHLY LOG MILES sheet. Header boxes: New Oil Change (date and odometer, left), COMPANY NAME, TRUCK #, MONTH OF, YEAR, Last Oil Change (date and odometer, right). Table columns, left to right: DAY, DATE, DRIVER NAME, DASHBOARD MILES, TOTAL MILES DRIVEN, FUEL MILES, FUEL GLNS., FUEL COST, and a handwritten price per gallon outside the table on the right. Dates and the driver name are often pre-printed on every row.
2. "fuel_report" — a FUEL TAXES report: per month, rows of DATE, FUELING PRICE (total paid), FUELING GALLONS, PRICE PER GALLON; possibly a quarter summary (MONTH, FUELING COST, FUELING GALLONS, PRICE PER GALLON) and a quarter miles table (closing and opening odometer with dates).

How to transcribe:
- Read each row by its own printed DATE and keep every value in the column it is written under. Follow the row lines; handwriting may lean into the row above or below — assign it to the row whose line it sits on.
- Include every row that has at least one value besides the printed date and driver. Skip rows that are empty apart from the date and driver.
- "OFF DUTY" written in DASHBOARD MILES means offDuty true (dashboard null).
- If DASHBOARD MILES is empty but FUEL MILES has a number, leave dashboard null and put the number in fuelMiles. Never move a value to another column.
- Odometers: write the whole number as written, without separators (1'096,060 → 1096060; 120,217 → 120217). This fleet has 6- and 7-digit odometers.
- Money and gallons as plain numbers: "$452.50" → 452.5, "83.812" → 83.812. A gallons or price value written with a comma ("95,158", "5,499") is a decimal comma: 95.158 and 5.499. The "$" sign is often written loosely; do not read it as a digit.
- When a value is crossed out and rewritten, use the rewritten value.
- Dates as YYYY-MM-DD. If a row's printed month is an obvious slip (2/28 on an August sheet), use the sheet's month.
- Placeholder marks such as "XXXXX" or a row of x's mean empty.
- Copy what is written even if the arithmetic doesn't add up; never compute or invent values. Leave a field null when the cell is empty or unreadable, and set "unclear": true on any row where you had to guess a digit.
- notes: in Spanish, anything you could not read or that the reviewer should check.`;

const nul = (t: string) => ({ type: [t, "null"] });
const SHEET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "truck", "company", "month", "year", "newOilChange", "lastOilChange", "rows", "monthTotals", "quarterMiles", "notes"],
  properties: {
    kind: { type: "string", enum: ["monthly_log", "fuel_report", "other"] },
    truck: nul("string"),
    company: nul("string"),
    month: nul("integer"),
    year: nul("integer"),
    newOilChange: { type: "object", additionalProperties: false, required: ["date", "miles"], properties: { date: nul("string"), miles: nul("number") } },
    lastOilChange: { type: "object", additionalProperties: false, required: ["date", "miles"], properties: { date: nul("string"), miles: nul("number") } },
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "driver", "dashboard", "offDuty", "milesDriven", "fuelMiles", "gallons", "cost", "pricePerGallon", "unclear"],
        properties: {
          date: { type: "string" },
          driver: nul("string"),
          dashboard: nul("number"),
          offDuty: { type: "boolean" },
          milesDriven: nul("number"),
          fuelMiles: nul("number"),
          gallons: nul("number"),
          cost: nul("number"),
          pricePerGallon: nul("number"),
          unclear: { type: "boolean" },
        },
      },
    },
    monthTotals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["month", "year", "cost", "gallons", "pricePerGallon"],
        properties: { month: { type: "integer" }, year: { type: "integer" }, cost: nul("number"), gallons: nul("number"), pricePerGallon: nul("number") },
      },
    },
    quarterMiles: {
      type: "object",
      additionalProperties: false,
      required: ["closingDate", "closing", "openingDate", "opening"],
      properties: { closingDate: nul("string"), closing: nul("number"), openingDate: nul("string"), opening: nul("number") },
    },
    notes: { type: "string" },
  },
};

async function readWithClaude(images: string[]) {
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const content: Anthropic.Beta.BetaContentBlockParam[] = images.map((url) => {
    const m = url.match(DATA_URL)!;
    return { type: "image", source: { type: "base64", media_type: `image/${m[1]}` as "image/jpeg", data: m[2] } };
  });
  content.push({ type: "text", text: PROMPT });

  const base = { model: "claude-opus-5-5", max_tokens: 16000, messages: [{ role: "user", content }] };
  const schemaFormat = { type: "json_schema", schema: SHEET_SCHEMA };
  // 1) structured output + server-side fallback on refusals; 2) without the fallback beta; 3) plain JSON reply
  const attempts = [
    () => client.beta.messages.create({ ...base, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "high", format: schemaFormat } } as Anthropic.Beta.MessageCreateParamsNonStreaming),
    () => client.messages.create({ ...base, output_config: { effort: "high", format: schemaFormat } } as Anthropic.MessageCreateParamsNonStreaming),
    () => client.messages.create({ ...base, output_config: { effort: "high" },
      messages: [{ role: "user", content: [...content.slice(0, -1), { type: "text", text: PROMPT + "\n\nReply with only one JSON object that follows this JSON Schema:\n" + JSON.stringify(SHEET_SCHEMA) }] }] } as Anthropic.MessageCreateParamsNonStreaming),
  ];
  let response: { stop_reason: string | null; content: { type: string; text?: string }[] } | null = null;
  for (let i = 0; i < attempts.length; i++) {
    try { response = await attempts[i]() as typeof response; break; }
    catch (e) { if (!(e instanceof Anthropic.BadRequestError) || i === attempts.length - 1) throw e; console.warn("read-sheet attempt", i + 1, "rejected:", e.message); }
  }
  if (!response) throw new Error("Claude no devolvió datos. Sube la foto otra vez.");
  if (response.stop_reason === "refusal") throw new Error("Claude no pudo leer esta foto. Prueba con otra foto de la hoja.");
  if (response.stop_reason === "max_tokens") throw new Error("La hoja tiene demasiados datos para una sola lectura. Sube la foto otra vez.");
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try { return JSON.parse(json); }
  catch { throw new Error("Claude no devolvió los datos en el formato esperado. Sube la foto otra vez."); }
}

// ---------------------------------------------------------------- OCR.space (fallback)

async function readWithOcrSpace(image: string) {
  if (bytesOf(image) > OCR_MAX_BYTES) throw Object.assign(new Error("La foto pesa más de 1 MB. Prueba con una foto más pequeña."), { status: 413 });
  const form = new FormData();
  form.append("base64Image", image);
  form.append("language", "eng");
  form.append("isTable", "true"); // one line of text per table row
  form.append("scale", "true");
  form.append("detectOrientation", "true");
  form.append("OCREngine", OCR_ENGINE);
  const r = await fetch("https://api.ocr.space/parse/image", { method: "POST", headers: { apikey: OCR_KEY! }, body: form });
  if (!r.ok) throw new Error(`OCR.space respondió ${r.status}. Intenta de nuevo en un momento.`);
  const out: { IsErroredOnProcessing?: boolean; ErrorMessage?: string | string[]; ParsedResults?: { ParsedText?: string }[] } = await r.json();
  if (out.IsErroredOnProcessing) throw new Error(([] as string[]).concat(out.ErrorMessage ?? []).join(" ") || "OCR.space no pudo leer la foto.");
  return (out.ParsedResults ?? []).map((p) => p.ParsedText ?? "").join("\n");
}

// ---------------------------------------------------------------- handler

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Usa POST." }, 405);
  if (!(await isSignedIn(req))) return reply({ error: "Inicia sesión para leer fotos." }, 401);
  if (!ANTHROPIC_KEY && !OCR_KEY) return reply({ error: "Falta configurar el lector de fotos en el servidor (ANTHROPIC_API_KEY u OCR_SPACE_API_KEY)." }, 500);

  let body: { image?: unknown; images?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "La solicitud no trae una foto." }, 400);
  }
  const images = (Array.isArray(body.images) ? body.images : [body.image]).filter((x): x is string => typeof x === "string" && DATA_URL.test(x));
  if (!images.length) return reply({ error: "Manda la foto como JPG o PNG." }, 400);
  if (images.some((x) => bytesOf(x) > MAX_IMAGE_BYTES)) return reply({ error: "La foto es demasiado grande. Prueba con una foto más pequeña." }, 413);

  try {
    if (ANTHROPIC_KEY) return reply({ data: await readWithClaude(images.slice(0, 3)), engine: "claude" });
    const small = typeof body.image === "string" ? body.image : images[0];
    return reply({ text: await readWithOcrSpace(small), engine: "ocrspace" });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return reply({ error: "La clave de Anthropic no es válida. Revisa ANTHROPIC_API_KEY en Supabase." }, 500);
    if (e instanceof Anthropic.RateLimitError) return reply({ error: "Se hicieron muchas lecturas seguidas. Espera un minuto y vuelve a intentar." }, 429);
    if (e instanceof Anthropic.APIError) return reply({ error: `El servicio de Claude respondió ${e.status}. Intenta de nuevo en un momento.` }, 502);
    const status = (e as { status?: number }).status ?? 502;
    return reply({ error: (e as Error).message || "No se pudo leer la foto." }, status);
  }
});
