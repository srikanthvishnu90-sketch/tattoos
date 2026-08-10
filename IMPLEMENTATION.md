# Stencil try-on implementation

## What ships in this repository

The hero preview card contains two honest modes:

- **Sample mode:** maps a visitor's prompt and style choice to one of the bundled Stencil previews. It demonstrates the interaction without claiming the result uses the visitor's body.
- **Live mode:** when `OPENAI_API_KEY` is configured on Vercel, a visitor can consent, upload a body-area photo, describe a tattoo, and send the compressed image to the server-side image-edit endpoint. Provider credentials never enter browser code.

`GET /api/capabilities` tells the client which mode is available. `POST /api/generate` validates a data URL and prompt, builds the provider request, and returns a temporary generated image as a data URL. The current small-payload transport is intentionally an MVP; private direct-to-blob uploads and async jobs are the production path.

## End-to-end flow

1. The hero renders immediately with the bundled fine-line rose preview.
2. The visitor types a tattoo idea and optionally chooses a style.
3. Without a photo, Generate selects a clearly labeled prepared sample using prompt keywords and style.
4. The visitor can choose a local JPEG, PNG, or WebP after accepting the consent statement.
5. Browser code decodes the photo, removes original metadata by redrawing it to a canvas, limits the longest edge to 1,536px, and exports a compressed JPEG.
6. The browser checks `/api/capabilities`. If live generation is unavailable, it does not upload the photo and explains that the visitor can continue with a sample.
7. In live mode, `/api/generate` validates content type, payload size, prompt length, and the presence of the server-only API key.
8. The function sends a multipart image-edit request to the configured provider and asks it to preserve the person, anatomy, lighting, background, and body photo while adding only the requested tattoo.
9. The interface exposes real stepped progress without inventing a percentage.
10. The result replaces the preview, is labeled personalized, and can be downloaded. The original local photo can be removed at any time.

## Environment variables

- `OPENAI_API_KEY`: enables live image editing.
- `OPENAI_IMAGE_MODEL`: optional model override; defaults to `gpt-image-2`.

Configure these independently for Vercel Preview and Production. Never prefix either variable with `NEXT_PUBLIC_` or expose it in client JavaScript.

## Production hardening roadmap

### Phase 1 — current essential sample

- Compact prompt, style selection, consent, local photo preparation, sample fallback, live capability detection, generated result, download, keyboard and screen-reader states.
- Validate locally and on a Vercel Preview deployment.

### Phase 2 — controllable placement

- Generate a transparent tattoo asset separately.
- Add a canvas editor with move, scale, rotate, mirror, opacity, undo, redo, numeric keyboard alternatives, and optional size calibration.
- Flatten a placement composite before the realism pass so the model receives an explicit target rather than guessing.

### Phase 3 — private media and async jobs

- Upload directly to private Vercel Blob with short-lived client tokens.
- Store jobs in Postgres with `queued`, `running`, `succeeded`, `failed`, `canceled`, and `expired` states.
- Normalize providers behind `createGeneration`, `getGenerationStatus`, `cancelGeneration`, and `deleteGenerationAssets`.
- Use signed webhooks where supported, idempotency keys, rate limits, retries, cancellation, and expiring result URLs.

### Phase 4 — quality and commercial readiness

- Benchmark OpenAI image editing against mask-capable fal or Replicate models using consented test images.
- Score design fidelity, placement accuracy, identity/background preservation, contour realism, latency, accepted-result cost, and deletion compliance.
- Add accounts, credits, refunds on provider failure, artist briefs, expiring share links, abuse review, monitoring, and verified retention deletion.

## Provider decision

OpenAI image editing is the first adapter because its current image-edit API supports image inputs and high-fidelity editing. fal and Replicate are strong evaluation candidates because their async queue and webhook models fit a production job system. Higgsfield should be reconsidered only after public technical documentation establishes authentication, endpoint contracts, webhook verification, retention controls, pricing, and service limits.

## Privacy and safety gates

- Consent before any personal photo leaves the device.
- No personal images or prompt text in analytics.
- No persistent browser storage for body photos or generated results.
- EXIF is removed during browser-side recompression.
- Enforce private storage and tested deletion before claiming a specific deletion window.
- Add rate limits, content moderation, age policy, and abuse controls before public live generation.
- Keep the disclaimer visible: this is a visualization, not a guarantee of healed appearance or tattoo-ready line work.

## Release checklist

1. Run static syntax and reference checks.
2. Test sample prompts for rose, panther, script, and blackwork mappings.
3. Test upload rejection, consent, file removal, offline/server failure, and no-key fallback.
4. Test keyboard navigation, focus visibility, screen-reader status announcements, reduced motion, 200% zoom, and 320px width.
5. Configure the key only in Vercel Preview and run a real consented image-edit smoke test.
6. Confirm result fidelity and that no request body or image content is logged.
7. Promote to Production only after the Preview deployment is approved.
8. Verify the exact Vercel production alias from the authenticated project; do not assume `tattoos.vercel.app`, which belongs to another site.
