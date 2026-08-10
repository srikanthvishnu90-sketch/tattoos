const MAX_IMAGE_BYTES = 3_500_000;
const MAX_PROMPT_LENGTH = 500;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function openAI(path, options) {
  const result = await fetch(`https://api.openai.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      ...(options.headers || {})
    }
  });
  const payload = await result.json();
  if (!result.ok) {
    const error = new Error(payload?.error?.message || "The image provider could not complete the request.");
    error.status = result.status;
    error.code = payload?.error?.code;
    throw error;
  }
  return payload;
}

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
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  const designPrompt = [
    "Create a clean, isolated tattoo design reference on a plain white background.",
    `Design request (follow literally): ${prompt}`,
    `Style: ${style}. Intended placement: ${placement}.`,
    "Every requested count, object, symbol, flag detail, color, arrangement, orientation, and relative size is a hard constraint.",
    "Show tattoo artwork only: no body, skin, person, frame, studio, paper texture, mockup, text labels, watermark, or extra decorative objects.",
    "Use crisp tattoo-ready composition and retain explicitly requested colors."
  ].join(" ");

  let tattooReference;
  try {
    const artwork = await openAI("/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: designPrompt, quality: "low", size: "1024x1024" })
    });
    tattooReference = artwork?.data?.[0]?.b64_json;
    if (!tattooReference) throw new Error("The provider returned no tattoo artwork.");
  } catch (error) {
    console.error("Tattoo artwork generation failed", error.status || "network", error.code || error.name || "Error");
    return response.status(error.status >= 500 ? 502 : 400).json({ error: error.message });
  }

  const form = new FormData();
  form.append("model", model);
  form.append("image[]", new Blob([image.bytes], { type: image.type }), `body-photo.${extension}`);
  form.append("image[]", new Blob([Buffer.from(tattooReference, "base64")], { type: "image/png" }), "tattoo-reference.png");
  form.append("quality", "medium");
  form.append("prompt", [
    "Image 1 is the original body photo and must remain the base image. Image 2 is the exact tattoo artwork reference.",
    `Render the tattoo from Image 2 as real healed ink embedded in the visible ${placement.toLowerCase()} in Image 1. This is not a sticker, decal, floating graphic, printed overlay, or separate layer.`,
    `Original user request: ${prompt}. Style: ${style}.`,
    "Preserve the exact motif, count, flag or symbol details, colors, arrangement, orientation, and relative proportions from the tattoo reference.",
    "Make ink conform to anatomy: wrap across curvature, deform with perspective, settle into pores and fine skin texture, inherit local highlights and shadows, and become partially occluded by natural creases or hair where appropriate.",
    "Keep tattoo edges healed and realistic rather than digitally sharp. Preserve colored ink when requested; otherwise use realistic black tattoo ink.",
    "Preserve the person's identity, anatomy, fingers and limbs, skin tone, pores, lighting, clothing, jewelry, camera angle, crop, depth of field, and background from Image 1.",
    "Change only the skin pixels needed for the tattoo. Do not add or remove body parts, objects, wounds, redness, extra tattoos, text labels, or background details."
  ].join(" "));

  try {
    const payload = await openAI("/images/edits", { method: "POST", body: form });
    const encoded = payload?.data?.[0]?.b64_json;
    const url = payload?.data?.[0]?.url;
    if (!encoded && !url) return response.status(502).json({ error: "The provider returned no preview image." });
    return response.status(200).json({ image: encoded ? `data:image/png;base64,${encoded}` : url, mode: "live" });
  } catch (error) {
    console.error("Skin rendering failed", error.status || "network", error.code || error.name || "Error");
    return response.status(error.status >= 500 ? 502 : 400).json({ error: error.message || "The skin rendering service is temporarily unavailable." });
  }
}
