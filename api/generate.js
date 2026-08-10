const MAX_IMAGE_BYTES = 3_500_000;
const MAX_PROMPT_LENGTH = 500;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function parseImage(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i.exec(dataUrl || "");
  if (!match || !ALLOWED_TYPES.has(match[1].toLowerCase())) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null;
  return { type: match[1].toLowerCase(), bytes };
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }
  if (!process.env.OPENAI_API_KEY) {
    return response.status(503).json({ error: "Live generation is not configured.", code: "DEMO_ONLY" });
  }

  const prompt = String(request.body?.prompt || "").trim();
  const style = String(request.body?.style || "fine-line").trim().slice(0, 40);
  const placement = String(request.body?.placement || "visible bare-skin area").trim().slice(0, 80);
  const image = parseImage(request.body?.image);
  if (prompt.length < 3 || prompt.length > MAX_PROMPT_LENGTH) {
    return response.status(400).json({ error: `Describe the tattoo in 3–${MAX_PROMPT_LENGTH} characters.` });
  }
  if (!image) {
    return response.status(400).json({ error: "Choose a JPEG, PNG, or WebP body photo under 3.5 MB after processing." });
  }

  const extension = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
  const form = new FormData();
  form.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-2");
  form.append("image", new Blob([image.bytes], { type: image.type }), `body-photo.${extension}`);
  form.append("input_fidelity", "high");
  form.append("quality", "medium");
  form.append("prompt", [
    "This is a precise tattoo try-on image edit. Edit the supplied body photo; do not create a different person or a new scene.",
    `Tattoo request (follow literally): ${prompt}`,
    `Target body placement: ${placement}. Tattoo style: ${style}.`,
    "Every requested count, shape, color, arrangement, orientation, and size is a hard constraint. For example, if the request says three red diamonds, render exactly three distinct red diamonds—not two, four, gems, flowers, or unrelated marks.",
    "Preserve the person's identity, anatomy, skin tone, body contours, lighting, clothing, camera angle, and background.",
    `Place the tattoo only on the visible ${placement.toLowerCase()}, following its curvature, perspective, pores, and lighting. Use healed ink. Preserve explicitly requested colors; otherwise use realistic black ink.`,
    "Do not add text, objects, jewelry, extra tattoos, wounds, redness, or changes outside the tattoo itself."
  ].join(" "));

  try {
    const providerResponse = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form
    });
    const payload = await providerResponse.json();
    if (!providerResponse.ok) {
      console.error("Image provider error", providerResponse.status, payload?.error?.code || "unknown");
      return response.status(providerResponse.status >= 500 ? 502 : 400).json({
        error: payload?.error?.message || "The preview could not be generated."
      });
    }
    const encoded = payload?.data?.[0]?.b64_json;
    const url = payload?.data?.[0]?.url;
    if (!encoded && !url) return response.status(502).json({ error: "The provider returned no preview image." });
    return response.status(200).json({ image: encoded ? `data:image/png;base64,${encoded}` : url, mode: "live" });
  } catch (error) {
    console.error("Generation request failed", error?.name || "Error");
    return response.status(502).json({ error: "The generation service is temporarily unavailable." });
  }
}
