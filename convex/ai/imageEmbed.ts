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
import { IMAGE_EMBEDDING_MODEL, IMAGE_EMBEDDING_MODEL_VERSION } from "./constants"
import { usageTally, type MeterSpec } from "../lib/aiMeter"
import { setImageVector } from "../lib/vectors"
import { embedText, geminiConfigured, geminiEmbed, geminiKey, toBase64 } from "./gemini"

// Larger images are sent as their caption; the API limit for inline data is ~20 MB.
const MAX_INLINE_BYTES = 15 * 1024 * 1024
const EMBEDDABLE = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"])

export function embeddableMime(mime: string): boolean {
  return EMBEDDABLE.has(mime.toLowerCase())
}

type Tally = ReturnType<typeof usageTally>

export async function embedImageBytes(m: MeterSpec, bytes: Uint8Array, mime: string, tally?: Tally): Promise<number[]> {
  if (!embeddableMime(mime)) throw new Error(`Image type ${mime} cannot be embedded`)
  if (bytes.byteLength > MAX_INLINE_BYTES) throw new Error("Image too large to embed")
  return await geminiEmbed(m, [{ inline_data: { mime_type: mime.toLowerCase(), data: toBase64(bytes) } }], { retries: 2, tally })
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

function captionOf(row: Pick<Doc<"images">, "altText" | "description" | "tags" | "filename">): string {
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
      embeddingModel: IMAGE_EMBEDDING_MODEL_VERSION,
      embeddedAt: Date.now(),
      embedSource: args.source,
    })
    await setImageVector(ctx, (await ctx.db.get(args.imageId))!, args.embedding)
  },
})

async function embedOneImage(ctx: ActionCtx, imageId: Id<"images">, tally?: Tally): Promise<"image" | "caption" | null> {
  const m: MeterSpec = { ctx, feature: "embed.image", personId: null, target: { kind: "image", id: imageId } }
  const row = await ctx.runQuery(internal.ai.imageEmbed.getForEmbed, { imageId })
  if (!row) return null
  let vector: number[] | null = null
  let source: "image" | "caption" = "image"
  const loaded = await loadImageBytes(ctx, row)
  if (loaded && embeddableMime(loaded.mime)) {
    try {
      vector = await embedImageBytes(m, loaded.bytes, loaded.mime, tally)
    } catch (e) {
      console.warn(`image embed failed for ${imageId}, using the caption:`, e instanceof Error ? e.message : e)
    }
  }
  if (!vector) {
    source = "caption"
    vector = await embedText(m, captionOf(row), { tally })
  }
  await ctx.runMutation(internal.ai.imageEmbed.writeImageEmbedding, { imageId, embedding: vector, source })
  return source
}

export const embedImage = internalAction({
  args: { imageId: v.id("images") },
  handler: async (ctx, { imageId }): Promise<"image" | "caption" | null> => {
    if (!geminiConfigured()) return null
    return await embedOneImage(ctx, imageId)
  },
})

// ---- Backfill -------------------------------------------------------------------

export const listUnembedded = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const out: Id<"images">[] = []
    for await (const row of ctx.db.query("images")) {
      if (row.embeddingModel !== IMAGE_EMBEDDING_MODEL_VERSION || !row.vectorId) out.push(row._id)
      if (out.length >= limit) break
    }
    return out
  },
})

const BATCH = 8
// Work through batches inside one run for up to this long, then hand over to
// a fresh run, instead of scheduling a new run for every batch.
const RUN_BUDGET_MS = 4 * 60_000

/** Embeds missing images batch by batch until none are left. */
export const backfill = internalAction({
  args: { round: v.optional(v.number()) },
  handler: async (ctx, { round = 0 }): Promise<{ embedded: number; image: number; caption: number; failed: number; more: boolean }> => {
    geminiKey()
    const started = Date.now()
    const tally = usageTally(ctx, { feature: "embed.image", personId: null, provider: "google", model: IMAGE_EMBEDDING_MODEL })
    let image = 0
    let caption = 0
    let failed = 0
    let more = false
    const failedIds = new Set<string>()
    try {
      while (true) {
        const ids: Id<"images">[] = (
          await ctx.runQuery(internal.ai.imageEmbed.listUnembedded, { limit: BATCH + failedIds.size })
        ).filter((id: Id<"images">) => !failedIds.has(id)).slice(0, BATCH)
        let batchFailed = 0
        for (const id of ids) {
          try {
            const s = await embedOneImage(ctx, id, tally)
            if (s === "image") image++
            else if (s === "caption") caption++
          } catch (e) {
            failed++
            batchFailed++
            failedIds.add(id)
            console.error(`image embed ${id} failed:`, e instanceof Error ? e.message : e)
          }
        }
        // Stop when a whole batch failed (API down) so the job cannot loop forever.
        if (ids.length < BATCH || batchFailed === ids.length) break
        if (Date.now() - started > RUN_BUDGET_MS) {
          more = round < 20
          break
        }
      }
    } finally {
      await tally.flush()
    }
    if (more) await ctx.scheduler.runAfter(0, internal.ai.imageEmbed.backfill, { round: round + 1 })
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
      if (row.vectorId && row.embeddingModel === IMAGE_EMBEDDING_MODEL_VERSION) {
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
