// CONTRACT (shared by the images lane and the guided-writer lane).
// Search the image library by text, by a photo, or both. The signature and
// the ImageHit shape below must stay as they are.
//
// How it works: the query text and/or the photo are embedded with
// IMAGE_EMBEDDING_MODEL (multimodal, same space as the image embeddings) and
// matched against images.by_embedding. Words are also matched against the
// file name, alt text, description and tags, which keeps search working
// while images are still being embedded or when the API is unavailable.
// areaCodes and assetIds boost images linked to that context; they do not
// hide the rest. With neither query nor photo, the context's images and the
// recently used ones are returned (the picker's "Suggested").
import { v } from "convex/values"
import { action, internalQuery } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { requireUserId } from "./lib/auth"
import { embedImageBytes } from "./ai/imageEmbed"
import { embedText, geminiConfigured } from "./ai/gemini"
import { searchImages } from "./ai/vectorSearch"

export type ImageHit = {
  imageId: Id<"images">
  url: string | null
  altText: string
  description: string | null
  tags: string[]
  score: number
  /** How it matched: on the image itself, on its description, or on words. */
  matchedBy: "image" | "caption" | "text"
}

// Cosine scores below this are noise for gemini-embedding-2 (measured on the
// seeded library; see MIN_VECTOR_SCORE notes in the images lane report).
const MIN_VECTOR_SCORE = 0.3
const CONTEXT_BOOST = 0.05
const TEXT_BOOST = 0.15
// Vector scores shift a lot per query (a good "company logo" hit scores 0.35,
// a weak "extruder" hit 0.57), so weak matches are cut relative to the best
// hit instead of by one fixed number. Hits whose caption or tags contain every
// search word always stay.
const MAX_GAP_FROM_BEST = 0.12

export const search = action({
  args: {
    query: v.optional(v.string()),
    /** A photo uploaded via generateUploadUrl to search by image. */
    storageId: v.optional(v.id("_storage")),
    limit: v.optional(v.number()),
    areaCodes: v.optional(v.array(v.string())),
    assetIds: v.optional(v.array(v.id("assets"))),
    /** The checked-in person, so the search's embedding is counted to them, not to system jobs. */
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, args): Promise<ImageHit[]> => {
    await requireUserId(ctx)
    const limit = Math.max(1, Math.min(args.limit ?? 12, 48))
    const query = (args.query ?? "").trim()
    const context = { areaCodes: args.areaCodes ?? [], assetIds: args.assetIds ?? [] }

    if (!query && !args.storageId) {
      return await ctx.runQuery(internal.imageSearch.contextHits, { ...context, limit })
    }

    const vectorScores = new Map<string, number>()
    if (geminiConfigured()) {
      const m = { ctx, feature: "embed.query" as const, personId: args.personId ?? null }
      const vectors: number[][] = []
      try {
        if (args.storageId) {
          const blob = await ctx.storage.get(args.storageId)
          if (blob) {
            vectors.push(
              await embedImageBytes(m, new Uint8Array(await blob.arrayBuffer()), blob.type || "image/jpeg"),
            )
          }
        }
        if (query) vectors.push(await embedText(m, query))
      } catch (e) {
        console.warn("image search embed failed, words only:", e instanceof Error ? e.message : e)
      }
      for (const vector of vectors) {
        const results = await searchImages(ctx, { vector, limit: Math.min(limit * 3, 64) })
        for (const r of results) {
          if (r._score < MIN_VECTOR_SCORE) continue
          const prev = vectorScores.get(r._id) ?? 0
          if (r._score > prev) vectorScores.set(r._id, r._score)
        }
      }
    }

    return await ctx.runQuery(internal.imageSearch.rank, {
      query,
      vectorHits: Array.from(vectorScores, ([id, score]) => ({ id: id as Id<"images">, score })),
      ...context,
      limit,
    })
  },
})

function words(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9À-ɏ-]+/)
    .filter((w) => w.length > 2)
}

function textScore(r: Doc<"images">, ws: string[]): number {
  if (ws.length === 0) return 0
  const hay = `${r.filename} ${r.altText} ${r.description ?? ""} ${(r.tags ?? []).join(" ")}`.toLowerCase()
  return ws.filter((w) => hay.includes(w)).length / ws.length
}

function inContext(r: Doc<"images">, ctx: { areaCodes: string[]; assetIds: Id<"assets">[] }): boolean {
  return (
    (r.areaCodes ?? []).some((a) => ctx.areaCodes.includes(a)) ||
    (r.assetIds ?? []).some((a) => ctx.assetIds.includes(a))
  )
}

const contextArgs = {
  areaCodes: v.array(v.string()),
  assetIds: v.array(v.id("assets")),
  limit: v.number(),
}

export const rank = internalQuery({
  args: {
    query: v.string(),
    vectorHits: v.array(v.object({ id: v.id("images"), score: v.number() })),
    ...contextArgs,
  },
  handler: async (ctx, args): Promise<ImageHit[]> => {
    const ws = words(args.query)
    const scored = new Map<
      string,
      { r: Doc<"images">; score: number; matchedBy: ImageHit["matchedBy"]; mentionsAllWords: boolean }
    >()
    for (const h of args.vectorHits) {
      const r = await ctx.db.get(h.id)
      if (!r) continue
      const t = textScore(r, ws)
      scored.set(r._id, {
        r,
        score: h.score + TEXT_BOOST * t,
        matchedBy: r.embedSource === "caption" ? "caption" : "image",
        mentionsAllWords: t === 1,
      })
    }
    if (ws.length > 0) {
      for await (const r of ctx.db.query("images").order("desc")) {
        if (scored.has(r._id)) continue
        const t = textScore(r, ws)
        if (t > 0) scored.set(r._id, { r, score: 0.2 + TEXT_BOOST * t, matchedBy: "text", mentionsAllWords: t === 1 })
      }
    }
    const hits = Array.from(scored.values()).map((s) => ({
      ...s,
      score: s.score + (inContext(s.r, args) ? CONTEXT_BOOST : 0),
    }))
    hits.sort((a, b) => b.score - a.score)
    const floor = (hits[0]?.score ?? 0) - MAX_GAP_FROM_BEST
    const kept = hits.filter((h) => h.mentionsAllWords || h.score >= floor)
    return await Promise.all(kept.slice(0, args.limit).map((h) => toHit(ctx, h.r, h.score, h.matchedBy)))
  },
})

/** No query: images linked to the context first, then the recently used, then the newest. */
export const contextHits = internalQuery({
  args: contextArgs,
  handler: async (ctx, args): Promise<ImageHit[]> => {
    const out: Doc<"images">[] = []
    const seen = new Set<string>()
    const push = (r: Doc<"images">) => {
      if (seen.has(r._id) || out.length >= args.limit) return
      seen.add(r._id)
      out.push(r)
    }
    if (args.areaCodes.length || args.assetIds.length) {
      for await (const r of ctx.db.query("images").order("desc")) {
        if (inContext(r, args)) push(r)
        if (out.length >= args.limit) break
      }
    }
    const recent = await ctx.db.query("images").withIndex("by_lastUsedAt").order("desc").take(args.limit)
    for (const r of recent) if (r.lastUsedAt) push(r)
    if (out.length < args.limit) {
      for (const r of await ctx.db.query("images").order("desc").take(args.limit * 2)) push(r)
    }
    return await Promise.all(out.map((r, i) => toHit(ctx, r, 1 - i / (out.length + 1), "text")))
  },
})

async function toHit(
  ctx: { storage: { getUrl: (id: Id<"_storage">) => Promise<string | null> } },
  r: Doc<"images">,
  score: number,
  matchedBy: ImageHit["matchedBy"],
): Promise<ImageHit> {
  return {
    imageId: r._id,
    url: r.storageId ? await ctx.storage.getUrl(r.storageId) : r.externalUrl,
    altText: r.altText,
    description: r.description ?? null,
    tags: r.tags ?? [],
    score: Math.round(score * 1000) / 1000,
    matchedBy,
  }
}
