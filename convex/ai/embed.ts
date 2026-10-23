import { v } from "convex/values"
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "../_generated/server"
import { internal } from "../_generated/api"
import { Id } from "../_generated/dataModel"
import { requireUser } from "../lib/auth"
import {
  EMBEDDING_DIM,
  EMBEDDING_MODEL,
  EMBEDDING_MODEL_VERSION,
} from "./constants"

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

async function embedOne(text: string, apiKey: string): Promise<number[]> {
  const url = `${GEMINI_BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIM,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Gemini embed ${res.status}: ${body.slice(0, 200)}`)
  }
  const json = (await res.json()) as {
    embedding?: { values?: number[] }
  }
  const values = json.embedding?.values
  if (!Array.isArray(values)) {
    throw new Error("Gemini embed response missing embedding.values")
  }
  return values
}

export const listMissingChunks = internalQuery({
  args: { documentId: v.optional(v.id("documents")) },
  handler: async (ctx, args) => {
    const all = args.documentId
      ? await ctx.db
          .query("chunks")
          .withIndex("by_documentId_and_version", (q) =>
            q.eq("documentId", args.documentId!),
          )
          .take(2000)
      : await ctx.db.query("chunks").take(2000)
    return all
      .filter(
        (c) =>
          c.embedding === null ||
          c.embeddingModel !== EMBEDDING_MODEL_VERSION,
      )
      .map((c) => ({ _id: c._id, text: c.text }))
  },
})

export const writeEmbedding = internalMutation({
  args: {
    chunkId: v.id("chunks"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    // The chunk may have been deleted meanwhile (a new version published, or
    // a reseed on dev); then there is nothing to write.
    if (!(await ctx.db.get(args.chunkId))) return
    await ctx.db.patch(args.chunkId, {
      embedding: args.embedding,
      embeddingModel: EMBEDDING_MODEL_VERSION,
      embeddedAt: Date.now(),
    })
  },
})

// Coverage for the Settings AI panel: how many chunks are indexed, how many
// are still outstanding (same predicate listMissingChunks uses), and when the
// last embedding was written. requireUser so it's signed-in only.
export const embedStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const all = await ctx.db.query("chunks").take(5000)
    let embedded = 0
    let outstanding = 0
    let lastEmbeddedAt: number | null = null
    for (const c of all) {
      const isCurrent =
        c.embedding !== null && c.embeddingModel === EMBEDDING_MODEL_VERSION
      if (isCurrent) {
        embedded += 1
        if (c.embeddedAt != null && (lastEmbeddedAt === null || c.embeddedAt > lastEmbeddedAt)) {
          lastEmbeddedAt = c.embeddedAt
        }
      } else {
        outstanding += 1
      }
    }
    return {
      total: all.length,
      embedded,
      outstanding,
      lastEmbeddedAt,
      model: EMBEDDING_MODEL_VERSION,
    }
  },
})

export const clearAllEmbeddings = internalMutation({
  args: {},
  handler: async (ctx) => {
    let cleared = 0
    const all = await ctx.db.query("chunks").take(5000)
    for (const c of all) {
      if (c.embedding !== null) {
        await ctx.db.patch(c._id, { embedding: null, embeddingModel: null })
        cleared += 1
      }
    }
    return cleared
  },
})

export const embedMissing = action({
  args: { documentId: v.optional(v.id("documents")) },
  handler: async (ctx, args): Promise<{ embedded: number; total: number }> => {
    await requireUser(ctx)
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set on this deployment")

    const missing: { _id: Id<"chunks">; text: string }[] = await ctx.runQuery(
      internal.ai.embed.listMissingChunks,
      { documentId: args.documentId },
    )
    if (missing.length === 0) return { embedded: 0, total: 0 }

    const CONCURRENCY = 4
    let next = 0
    let done = 0

    async function worker() {
      while (true) {
        const i = next++
        if (i >= missing.length) return
        const row = missing[i]
        const vector = await embedOne(row.text, apiKey!)
        await ctx.runMutation(internal.ai.embed.writeEmbedding, {
          chunkId: row._id,
          embedding: vector,
        })
        done += 1
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(CONCURRENCY, missing.length) },
        () => worker(),
      ),
    )

    return { embedded: done, total: missing.length }
  },
})

export const reembedAll = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ cleared: number; embedded: number; total: number }> => {
    await requireUser(ctx)
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set on this deployment")
    const cleared: number = await ctx.runMutation(
      internal.ai.embed.clearAllEmbeddings,
      {},
    )
    const result: { embedded: number; total: number } = await ctx.runAction(
      internal.ai.embed.embedMissingInternal,
      {},
    )
    return { cleared, ...result }
  },
})

export const embedMissingInternal = internalAction({
  args: { documentId: v.optional(v.id("documents")) },
  handler: async (ctx, args): Promise<{ embedded: number; total: number }> => {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set on this deployment")

    const missing: { _id: Id<"chunks">; text: string }[] = await ctx.runQuery(
      internal.ai.embed.listMissingChunks,
      { documentId: args.documentId },
    )
    if (missing.length === 0) return { embedded: 0, total: 0 }

    const CONCURRENCY = 4
    let next = 0
    let done = 0

    async function worker() {
      while (true) {
        const i = next++
        if (i >= missing.length) return
        const row = missing[i]
        const vector = await embedOne(row.text, apiKey!)
        await ctx.runMutation(internal.ai.embed.writeEmbedding, {
          chunkId: row._id,
          embedding: vector,
        })
        done += 1
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(CONCURRENCY, missing.length) },
        () => worker(),
      ),
    )

    return { embedded: done, total: missing.length }
  },
})
