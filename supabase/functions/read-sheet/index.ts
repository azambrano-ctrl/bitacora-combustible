// Supabase Edge Function: sends a photo of a filled sheet to OCR.space and returns the text.
// The OCR.space key lives in the function's secrets (OCR_SPACE_API_KEY), never in the web page.
// Only signed-in users of the app can call it: the user's login token is checked against Supabase Auth.

const OCR_KEY = Deno.env.get("OCR_SPACE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

async function isSignedIn(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: req.headers.get("apikey") || SUPABASE_ANON_KEY },
  });
  return r.ok;
}
// Engine 2 reads numbers and symbols best; set OCR_SPACE_ENGINE=3 to try the handwriting engine.
const OCR_ENGINE = Deno.env.get("OCR_SPACE_ENGINE") ?? "2";
const MAX_BYTES = 1_000_000; // OCR.space free plan limit per file

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Usa POST." }, 405);
  if (!(await isSignedIn(req))) return reply({ error: "Inicia sesión para leer fotos." }, 401);
  if (!OCR_KEY) return reply({ error: "Falta la clave de OCR.space en el servidor (OCR_SPACE_API_KEY)." }, 500);

  let image: unknown;
  try {
    ({ image } = await req.json());
  } catch {
    return reply({ error: "La solicitud no trae una foto." }, 400);
  }
  if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(image)) {
    return reply({ error: "Manda la foto como JPG o PNG." }, 400);
  }
  const bytes = Math.floor((image.length - image.indexOf(",") - 1) * 0.75);
  if (bytes > MAX_BYTES) return reply({ error: "La foto pesa más de 1 MB. Prueba con una foto más pequeña." }, 413);

  const form = new FormData();
  form.append("base64Image", image);
  form.append("language", "eng");
  form.append("isTable", "true"); // one line of text per table row
  form.append("scale", "true");
  form.append("detectOrientation", "true");
  form.append("OCREngine", OCR_ENGINE);

  let out: {
    IsErroredOnProcessing?: boolean;
    ErrorMessage?: string | string[];
    ParsedResults?: { ParsedText?: string }[];
  };
  try {
    const r = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: OCR_KEY },
      body: form,
    });
    if (!r.ok) return reply({ error: `OCR.space respondió ${r.status}. Intenta de nuevo en un momento.` }, 502);
    out = await r.json();
  } catch {
    return reply({ error: "No se pudo conectar con OCR.space. Intenta de nuevo." }, 502);
  }

  if (out.IsErroredOnProcessing) {
    const msg = ([] as string[]).concat(out.ErrorMessage ?? []).join(" ");
    return reply({ error: msg || "OCR.space no pudo leer la foto." }, 502);
  }
  const text = (out.ParsedResults ?? []).map((p) => p.ParsedText ?? "").join("\n");
  return reply({ text });
});
