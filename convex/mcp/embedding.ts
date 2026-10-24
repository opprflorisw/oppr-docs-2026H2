// Query embeddings for the MCP endpoint, with the same model and size as the
// chunk index (convex/ai/embed.ts, convex/ai/ask.ts), so vector search over
// chunks compares like with like.
import { EMBEDDING_DIM, EMBEDDING_MODEL } from "../ai/constants"

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set on this deployment")
  const res = await fetch(`${GEMINI_BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text: text.slice(0, 8000) }] },
      outputDimensionality: EMBEDDING_DIM,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Gemini embed ${res.status}: ${body.slice(0, 200)}`)
  }
  const json = (await res.json()) as { embedding?: { values?: number[] } }
  const values = json.embedding?.values
  if (!Array.isArray(values)) throw new Error("Gemini embed response missing embedding.values")
  return values
}
