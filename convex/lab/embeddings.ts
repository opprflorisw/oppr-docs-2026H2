// Embedding lab (analysis page /analysis/backend-gcp-and-gemma).
//
// Read-only helpers for the in-browser EmbeddingGemma experiment:
//   sample        a spread of up to 300 Published passages for the browser to embed
//   geminiSearch  the current production search (gemini-embedding-2 @ 768 over
//                 chunks.by_embedding) for the same query, for a side-by-side
//
// Both are actions the page calls on a button press, never reactive queries:
// a subscription over chunks would re-run on every chunk write and read the
// inline 768-dim embeddings each time, which is the very usage we are trying
// to cut. Nothing here writes; experimental vectors stay in the browser.

import { v } from "convex/values"
import { action, internalQuery } from "../_generated/server"
import { internal } from "../_generated/api"
import { Doc, Id } from "../_generated/dataModel"
import { requireUser } from "../lib/auth"
import { isPublished, publishedVersion } from "../lib/published"
import { embedText } from "../mcp/embedding"
import { EMBEDDING_MODEL_VERSION } from "../ai/constants"

const MAX_SAMPLE = 300

export interface LabPassage {
  chunkId: Id<"chunks">
  documentId: Id<"documents">
  namingCode: string
  title: string
  section: string | null
  text: string
}

/** Up to `limit` live passages, spread evenly over the Published documents. */
export const samplePassages = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args): Promise<{ passages: LabPassage[]; publishedDocs: number }> => {
    const limit = Math.max(1, Math.min(MAX_SAMPLE, Math.floor(args.limit)))
    const docs = (await ctx.db.query("documents").take(500)).filter(isPublished)
    if (docs.length === 0) return { passages: [], publishedDocs: 0 }
    const perDoc = Math.max(1, Math.ceil(limit / docs.length))
    const passages: LabPassage[] = []
    for (const d of docs) {
      if (passages.length >= limit) break
      const version = publishedVersion(d) as number
      const chunks: Doc<"chunks">[] = await ctx.db
        .query("chunks")
        .withIndex("by_documentId_and_version", (q) =>
          q.eq("documentId", d._id).eq("version", version),
        )
        .take(perDoc)
      for (const c of chunks) {
        if (passages.length >= limit) break
        passages.push({
          chunkId: c._id,
          documentId: d._id,
          namingCode: d.namingCode,
          title: d.title,
          section: c.pageOrSection,
          // The browser model runs on the user's GPU; keep each passage
          // well under the WebGPU batch budget (about 2,700 tokens).
          text: c.text.slice(0, 2000),
        })
      }
    }
    return { passages, publishedDocs: docs.length }
  },
})

export const sample = action({
  args: { limit: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ passages: LabPassage[]; publishedDocs: number }> => {
    await requireUser(ctx)
    return await ctx.runQuery(internal.lab.embeddings.samplePassages, {
      limit: args.limit ?? MAX_SAMPLE,
    })
  },
})

export interface LabHit {
  chunkId: Id<"chunks">
  namingCode: string
  title: string
  section: string | null
  text: string
  score: number
}

/**
 * The production search for a query: embed with gemini-embedding-2 at 768,
 * vector search over every chunk, keep only live Published passages (the
 * same filter the MCP server and Find use).
 */
export const geminiSearch = action({
  args: { query: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ hits: LabHit[]; model: string; embedMs: number; searchMs: number }> => {
    await requireUser(ctx)
    const query = args.query.trim().slice(0, 500)
    if (!query) return { hits: [], model: EMBEDDING_MODEL_VERSION, embedMs: 0, searchMs: 0 }
    const t0 = Date.now()
    const vector = await embedText(query)
    const t1 = Date.now()
    const results = await ctx.vectorSearch("chunks", "by_embedding", { vector, limit: 256 })
    const score = new Map(results.map((r) => [String(r._id), r._score]))
    const rows: {
      chunkId: Id<"chunks">
      namingCode: string
      title: string
      section: string | null
      text: string
    }[] = await ctx.runQuery(internal.mcp.data.passages, {
      chunkIds: results.map((r) => r._id),
      areas: [],
    })
    const hits = rows
      .map((r) => ({
        chunkId: r.chunkId,
        namingCode: r.namingCode,
        title: r.title,
        section: r.section,
        text: r.text.slice(0, 400),
        score: score.get(String(r.chunkId)) ?? 0,
      }))
      .sort((a, b) => b.score - a.score)
    return { hits, model: EMBEDDING_MODEL_VERSION, embedMs: t1 - t0, searchMs: Date.now() - t1 }
  },
})
