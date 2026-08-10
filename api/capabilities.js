export default function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    generation: Boolean(process.env.OPENAI_API_KEY),
    mode: process.env.OPENAI_API_KEY ? "live" : "demo"
  });
}
