// CONTRACT (shared by the images lane and the guided-writer lane).
// Search the image library by text, by a photo, or both. The images lane
// owns this file and replaces the implementation with multimodal embeddings
// (convex/ai/constants.ts IMAGE_EMBEDDING_MODEL); the signature and the
// ImageHit shape below must stay as they are.
import { v } from "convex/values"
import { action, internalQuery } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { requireUserId } from "./lib/auth"

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

export const search = action({
  args: {
    query: v.optional(v.string()),
    /** A photo uploaded via generateUploadUrl to search by image. */
    storageId: v.optional(v.id("_storage")),
    limit: v.optional(v.number()),
    areaCodes: v.optional(v.array(v.string())),
    assetIds: v.optional(v.array(v.id("assets"))),
  },
  handler: async (ctx, args): Promise<ImageHit[]> => {
    await requireUserId(ctx)
    return await ctx.runQuery(internal.imageSearch.textMatch, {
      query: args.query ?? "",
      limit: Math.min(args.limit ?? 12, 48),
    })
  },
})

export const textMatch = internalQuery({
  args: { query: v.string(), limit: v.number() },
  handler: async (ctx, { query, limit }): Promise<ImageHit[]> => {
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
    const rows = await ctx.db.query("images").order("desc").take(1000)
    const scored = rows
      .map((r) => {
        const hay = `${r.filename} ${r.altText}`.toLowerCase()
        const hits = words.filter((w) => hay.includes(w)).length
        return { r, score: words.length ? hits / words.length : 0 }
      })
      .filter((x) => x.score > 0 || words.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
    return await Promise.all(
      scored.map(async ({ r, score }) => ({
        imageId: r._id,
        url: r.storageId ? await ctx.storage.getUrl(r.storageId) : r.externalUrl,
        altText: r.altText,
        description: null,
        tags: [],
        score,
        matchedBy: "text" as const,
      })),
    )
  },
})
