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
import { requireEngineerOrAdmin } from "../lib/roles"
import { usageTally } from "../lib/aiMeter"
import { EMBEDDING_MODEL, EMBEDDING_MODEL_VERSION } from "./constants"
import { embedText, geminiKey } from "./gemini"

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

/** Settings button: index passages that have no embedding yet. Engineer or Admin only. */
export const embedMissing = action({
  args: { personId: v.id("people"), documentId: v.optional(v.id("documents")) },
  handler: async (ctx, args): Promise<{ embedded: number; total: number }> => {
    await requireUser(ctx)
    await ctx.runQuery(internal.ai.embed.checkEditor, { personId: args.personId })
    return await ctx.runAction(internal.ai.embed.embedMissingInternal, { documentId: args.documentId })
  },
})

export const checkEditor = internalQuery({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireEngineerOrAdmin(ctx, args.personId, "Check in as an Engineer or Admin to rebuild the search index.")
    return null
  },
})

export const reembedAll = action({
  args: { personId: v.id("people") },
  handler: async (
    ctx,
    args,
  ): Promise<{ cleared: number; embedded: number; total: number }> => {
    await requireUser(ctx)
    await ctx.runQuery(internal.ai.embed.checkEditor, { personId: args.personId })
    geminiKey()
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
    geminiKey()

    const missing: { _id: Id<"chunks">; text: string }[] = await ctx.runQuery(
      internal.ai.embed.listMissingChunks,
      { documentId: args.documentId },
    )
    if (missing.length === 0) return { embedded: 0, total: 0 }
    const spec = {
      ctx,
      feature: "embed.passage" as const,
      personId: null,
      ...(args.documentId ? { target: { kind: "document", id: args.documentId as string } } : {}),
    }
    const tally = usageTally(ctx, { ...spec, provider: "google", model: EMBEDDING_MODEL })

    const CONCURRENCY = 4
    let next = 0
    let done = 0

    async function worker() {
      while (true) {
        const i = next++
        if (i >= missing.length) return
        const row = missing[i]
        const vector = await embedText(spec, row.text, { tally })
        await ctx.runMutation(internal.ai.embed.writeEmbedding, {
          chunkId: row._id,
          embedding: vector,
        })
        done += 1
      }
    }

    try {
      await Promise.all(
        Array.from(
          { length: Math.min(CONCURRENCY, missing.length) },
          () => worker(),
        ),
      )
    } finally {
      await tally.flush()
    }

    return { embedded: done, total: missing.length }
  },
})
