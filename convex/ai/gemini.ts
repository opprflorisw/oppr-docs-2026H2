// The one place that talks to the Gemini API (chat, JSON, streaming, image
// generation, embeddings). Every call is metered through convex/lib/aiMeter.ts:
// callers pass a `MeterSpec` (feature, person, target) and get one `aiUsage`
// row per call with the tokens Gemini reports. The key stays on the server.
import { GoogleGenerativeAI, type GenerateContentRequest, type ResponseSchema } from "@google/generative-ai"
import { estimateTokens, meter, type MeterSpec, type usageTally } from "../lib/aiMeter"
import { CHAT_MODEL, EMBEDDING_DIM, EMBEDDING_MODEL, IMAGE_MODEL } from "./constants"

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { inline_data: { mime_type: string; data: string } }

export interface GeminiContent {
  role?: string
  parts: GeminiPart[]
}

interface UsageMetadata {
  promptTokenCount?: number
  candidatesTokenCount?: number
  thoughtsTokenCount?: number
}

export interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; inlineData?: { mimeType?: string; data?: string } }[] }
    finishReason?: string
  }[]
  usageMetadata?: UsageMetadata
}

const usageOf = (u: UsageMetadata | undefined) => ({
  tokensIn: u?.promptTokenCount ?? 0,
  // Thinking tokens are billed as output.
  tokensOut: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
})

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

export function geminiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set on this deployment.")
  return apiKey
}

export function toBase64(bytes: Uint8Array): string {
  let s = ""
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(s)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

class RetryableError extends Error {}

async function postJson(model: string, method: string, body: unknown): Promise<Response> {
  return await fetch(`${GEMINI_BASE}/models/${model}:${method}?key=${geminiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

/** One generateContent call, metered. Throws on an HTTP error. */
export async function geminiGenerate(
  m: MeterSpec,
  body: { contents: GeminiContent[]; systemInstruction?: { parts: { text: string }[] }; generationConfig?: Record<string, unknown> },
  opts: { model?: string; units?: (r: GeminiResponse) => number } = {},
): Promise<GeminiResponse> {
  const model = opts.model ?? CHAT_MODEL
  return await meter(m.ctx, { ...m, provider: "google", model }, async () => {
    const res = await postJson(model, "generateContent", body)
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 200)
      const msg = `Gemini ${res.status}: ${text}`
      throw res.status === 429 || res.status >= 500 ? new RetryableError(msg) : new Error(msg)
    }
    const json = (await res.json()) as GeminiResponse
    return { value: json, usage: { ...usageOf(json.usageMetadata), units: opts.units?.(json) ?? 0 } }
  })
}

function textOf(json: GeminiResponse): string {
  return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim()
}

/** One chat call with the cheap model; returns its text. */
export async function geminiText(
  m: MeterSpec,
  parts: GeminiPart[],
  opts: { json?: boolean; system?: string; maxOutputTokens?: number; temperature?: number; model?: string } = {},
): Promise<string> {
  const json = await geminiGenerate(
    m,
    {
      ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: opts.temperature ?? 0.2,
        ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
        ...(opts.json ? { responseMimeType: "application/json" } : {}),
      },
    },
    { model: opts.model },
  )
  const text = textOf(json)
  if (!text) throw new Error(`Gemini returned no text (${json.candidates?.[0]?.finishReason ?? "no candidate"}).`)
  return text
}

/** A JSON answer constrained by a response schema (the SDK path the Wiki and writer fallbacks use). */
export async function geminiSchemaJson(
  m: MeterSpec,
  cfg: { system: string; schema: ResponseSchema; temperature?: number; model?: string },
  request: GenerateContentRequest | string,
): Promise<string> {
  const model = cfg.model ?? CHAT_MODEL
  return await meter(m.ctx, { ...m, provider: "google", model }, async () => {
    const result = await new GoogleGenerativeAI(geminiKey())
      .getGenerativeModel({
        model,
        systemInstruction: cfg.system,
        generationConfig: { responseMimeType: "application/json", responseSchema: cfg.schema, temperature: cfg.temperature ?? 0.2 },
      })
      .generateContent(request)
    return { value: result.response.text(), usage: usageOf(result.response.usageMetadata) }
  })
}

/** A streamed answer (Ask). `onDelta` gets each piece; resolves to the full text. Metered once, at the end. */
export async function geminiStream(
  m: MeterSpec,
  cfg: { system: string; contents: GeminiContent[]; model?: string },
  onDelta: (text: string) => void,
): Promise<string> {
  const model = cfg.model ?? CHAT_MODEL
  return await meter(m.ctx, { ...m, provider: "google", model }, async () => {
    const result = await new GoogleGenerativeAI(geminiKey())
      .getGenerativeModel({ model, systemInstruction: cfg.system })
      .generateContentStream({ contents: cfg.contents as GenerateContentRequest["contents"] })
    let full = ""
    for await (const chunk of result.stream) {
      const delta = chunk.text()
      if (delta) {
        full += delta
        onDelta(delta)
      }
    }
    const response = await result.response
    return { value: full, usage: usageOf(response.usageMetadata) }
  })
}

/**
 * Draws one image. Each attempt is its own metered call (a failed attempt is
 * a failed call); retries on 429, 5xx and text-only answers.
 */
export async function geminiImage(
  m: MeterSpec,
  prompt: string,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<{ bytes: Uint8Array; mimeType: string | null }> {
  const attempts = opts.attempts ?? 3
  const base = opts.baseDelayMs ?? 1500
  let lastError = ""
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(base * 2 ** (attempt - 1) + Math.random() * 300)
    let json: GeminiResponse
    try {
      json = await geminiGenerate(
        m,
        { contents: [{ parts: [{ text: prompt }] }] },
        { model: IMAGE_MODEL, units: (r) => (r.candidates?.[0]?.content?.parts ?? []).filter((p) => p.inlineData?.data).length },
      )
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      if (e instanceof RetryableError || e instanceof TypeError) continue
      throw e
    }
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
    if (!part?.inlineData?.data) {
      // The model sometimes answers with text only; asking again usually works.
      lastError = `no image in the response (${json.candidates?.[0]?.finishReason ?? "no reason"})`
      continue
    }
    const bin = atob(part.inlineData.data)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { bytes, mimeType: part.inlineData.mimeType ?? null }
  }
  throw new Error(lastError || "image generation failed")
}

// Inline image data counts as about this many tokens for the estimate.
const IMAGE_TOKENS_ESTIMATE = 560

/**
 * One embedding with EMBEDDING_MODEL (768 values; text or an inline image).
 * Gemini reports no token count for embeddings, so tokens are estimated.
 * Pass `tally` (from `usageTally`) in bulk jobs to write one row per batch.
 */
export async function geminiEmbed(
  m: MeterSpec,
  parts: GeminiPart[],
  opts: { tally?: ReturnType<typeof usageTally>; retries?: number } = {},
): Promise<number[]> {
  const tokensIn = parts.reduce((n, p) => n + ("text" in p ? estimateTokens(p.text) : IMAGE_TOKENS_ESTIMATE), 0)
  const call = async () => {
    for (let attempt = 0; ; attempt++) {
      const res = await postJson(EMBEDDING_MODEL, "embedContent", {
        content: { parts },
        outputDimensionality: EMBEDDING_DIM,
      })
      if (res.status === 429 && attempt < (opts.retries ?? 0)) {
        await sleep(2000 * (attempt + 1))
        continue
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new Error(`Gemini embed ${res.status}: ${body.slice(0, 200)}`)
      }
      const json = (await res.json()) as { embedding?: { values?: number[] } }
      const values = json.embedding?.values
      if (!Array.isArray(values) || values.length !== EMBEDDING_DIM) {
        throw new Error("Gemini embed response missing embedding.values")
      }
      return { value: values, usage: { tokensIn, units: 1 } }
    }
  }
  if (opts.tally) return await opts.tally.run(call)
  return await meter(m.ctx, { ...m, provider: "google", model: EMBEDDING_MODEL }, call)
}

/** A text embedding (queries and passages); long text is cut at 8,000 characters. */
export async function embedText(m: MeterSpec, text: string, opts: { tally?: ReturnType<typeof usageTally> } = {}): Promise<number[]> {
  return await geminiEmbed(m, [{ text: text.slice(0, 8000) }], opts)
}
