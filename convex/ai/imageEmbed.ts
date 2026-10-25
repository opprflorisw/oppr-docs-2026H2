// Multimodal embeddings for the image library. The image bytes themselves
// are embedded (inline_data part) with IMAGE_EMBEDDING_MODEL, into the same
// 768-dim space as the chunk text embeddings, so a typed query, a photo and a
// passage can all find a picture. When the model refuses the image (an SVG,
// an unreachable URL, an API error) the caption is embedded instead and the
// row is marked embedSource "caption".
//
//   npx convex run ai/imageEmbed:backfill      # embed every image that is missing or stale
import { v } from "convex/values"
import {
  ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import { requireUser } from "../lib/auth"
import { requireEngineerOrAdmin } from "../lib/roles"
import { EMBEDDING_DIM, IMAGE_EMBEDDING_MODEL, IMAGE_EMBEDDING_MODEL_VERSION } from "./constants"

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
// Larger images are sent as their caption; the API limit for inline data is ~20 MB.
const MAX_INLINE_BYTES = 15 * 1024 * 1024
const EMBEDDABLE = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"])

type Part = { text: string } | { inline_data: { mime_type: string; data: string } }

export function toBase64(bytes: Uint8Array): string {
  let bin = ""
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

async function embedParts(parts: Part[], apiKey: string): Promise<number[]> {
  const url = `${GEMINI_BASE}/models/${IMAGE_EMBEDDING_MODEL}:embedContent?key=${apiKey}`
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { parts }, outputDimensionality: EMBEDDING_DIM }),
    })
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
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
    return values
  }
}

export function embeddableMime(mime: string): boolean {
  return EMBEDDABLE.has(mime.toLowerCase())
}

export async function embedImageBytes(bytes: Uint8Array, mime: string, apiKey: string): Promise<number[]> {
  if (!embeddableMime(mime)) throw new Error(`Image type ${mime} cannot be embedded`)
  if (bytes.byteLength > MAX_INLINE_BYTES) throw new Error("Image too large to embed")
  return embedParts([{ inline_data: { mime_type: mime.toLowerCase(), data: toBase64(bytes) } }], apiKey)
}

export async function embedText(text: string, apiKey: string): Promise<number[]> {
  return embedParts([{ text }], apiKey)
}

/** Bytes of a library image, from storage or its external URL; null when unreachable. */
export async function loadImageBytes(
  ctx: ActionCtx,
  row: { storageId: Id<"_storage"> | null; externalUrl: string | null; contentType: string },
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    if (row.storageId) {
      const blob = await ctx.storage.get(row.storageId)
      if (!blob) return null
      return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || row.contentType }
    }
    if (row.externalUrl) {
      const res = await fetch(row.externalUrl)
      if (!res.ok) return null
      const mime = res.headers.get("content-type")?.split(";")[0] || row.contentType
      return { bytes: new Uint8Array(await res.arrayBuffer()), mime }
    }
  } catch {
    return null
  }
  return null
}

export function captionOf(row: Pick<Doc<"images">, "altText" | "description" | "tags" | "filename">): string {
  const parts = [row.altText, row.description ?? "", (row.tags ?? []).join(", ")].filter((s) => s.trim())
  return parts.length ? parts.join(". ") : row.filename.replace(/[-_.]+/g, " ")
}

// ---- One image ------------------------------------------------------------------

export const getForEmbed = internalQuery({
  args: { imageId: v.id("images") },
  handler: async (ctx, { imageId }) => {
    const row = await ctx.db.get(imageId)
    if (!row) return null
    return {
      storageId: row.storageId,
      externalUrl: row.externalUrl,
      contentType: row.contentType,
      altText: row.altText,
      description: row.description,
      tags: row.tags,
      filename: row.filename,
    }
  },
})

export const writeImageEmbedding = internalMutation({
  args: {
    imageId: v.id("images"),
    embedding: v.array(v.float64()),
    source: v.union(v.literal("image"), v.literal("caption")),
  },
  handler: async (ctx, args) => {
    if (!(await ctx.db.get(args.imageId))) return
    await ctx.db.patch(args.imageId, {
      embedding: args.embedding,
      embeddingModel: IMAGE_EMBEDDING_MODEL_VERSION,
      embeddedAt: Date.now(),
      embedSource: args.source,
    })
  },
})

async function embedOneImage(ctx: ActionCtx, imageId: Id<"images">, apiKey: string): Promise<"image" | "caption" | null> {
  const row = await ctx.runQuery(internal.ai.imageEmbed.getForEmbed, { imageId })
  if (!row) return null
  let vector: number[] | null = null
  let source: "image" | "caption" = "image"
  const loaded = await loadImageBytes(ctx, row)
  if (loaded && embeddableMime(loaded.mime)) {
    try {
      vector = await embedImageBytes(loaded.bytes, loaded.mime, apiKey)
    } catch (e) {
      console.warn(`image embed failed for ${imageId}, using the caption:`, e instanceof Error ? e.message : e)
    }
  }
  if (!vector) {
    source = "caption"
    vector = await embedText(captionOf(row), apiKey)
  }
  await ctx.runMutation(internal.ai.imageEmbed.writeImageEmbedding, { imageId, embedding: vector, source })
  return source
}

export const embedImage = internalAction({
  args: { imageId: v.id("images") },
  handler: async (ctx, { imageId }): Promise<"image" | "caption" | null> => {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return null
    return await embedOneImage(ctx, imageId, apiKey)
  },
})

// ---- Backfill -------------------------------------------------------------------

export const listUnembedded = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const out: Id<"images">[] = []
    for await (const row of ctx.db.query("images")) {
      if (row.embeddingModel !== IMAGE_EMBEDDING_MODEL_VERSION || !row.embedding) out.push(row._id)
      if (out.length >= limit) break
    }
    return out
  },
})

const BATCH = 8

/** Embeds a batch of missing images, then schedules itself until none are left. */
export const backfill = internalAction({
  args: { round: v.optional(v.number()) },
  handler: async (ctx, { round = 0 }): Promise<{ embedded: number; image: number; caption: number; failed: number; more: boolean }> => {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set on this deployment")
    const ids: Id<"images">[] = await ctx.runQuery(internal.ai.imageEmbed.listUnembedded, { limit: BATCH })
    let image = 0
    let caption = 0
    let failed = 0
    for (const id of ids) {
      try {
        const s = await embedOneImage(ctx, id, apiKey)
        if (s === "image") image++
        else if (s === "caption") caption++
      } catch (e) {
        failed++
        console.error(`image embed ${id} failed:`, e instanceof Error ? e.message : e)
      }
    }
    // Stop when a whole batch failed (API down) so the job cannot loop forever.
    const more = ids.length === BATCH && failed < ids.length && round < 200
    if (more) await ctx.scheduler.runAfter(1000, internal.ai.imageEmbed.backfill, { round: round + 1 })
    return { embedded: image + caption, image, caption, failed, more }
  },
})

/** Settings / library button: start the backfill. Engineer or Admin only. */
export const startBackfill = mutation({
  args: { personId: v.optional(v.id("people")), reembedAll: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    if (args.reembedAll) {
      for await (const row of ctx.db.query("images")) {
        if (row.embeddingModel) await ctx.db.patch(row._id, { embeddingModel: undefined })
      }
    }
    await ctx.scheduler.runAfter(0, internal.ai.imageEmbed.backfill, {})
    return null
  },
})

export const embedStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    let total = 0
    let byImage = 0
    let byCaption = 0
    let lastEmbeddedAt: number | null = null
    for await (const row of ctx.db.query("images")) {
      total++
      if (row.embedding && row.embeddingModel === IMAGE_EMBEDDING_MODEL_VERSION) {
        if (row.embedSource === "caption") byCaption++
        else byImage++
        if (row.embeddedAt && (lastEmbeddedAt === null || row.embeddedAt > lastEmbeddedAt)) lastEmbeddedAt = row.embeddedAt
      }
    }
    return {
      total,
      embedded: byImage + byCaption,
      byImage,
      byCaption,
      outstanding: total - byImage - byCaption,
      lastEmbeddedAt,
      model: IMAGE_EMBEDDING_MODEL_VERSION,
    }
  },
})
