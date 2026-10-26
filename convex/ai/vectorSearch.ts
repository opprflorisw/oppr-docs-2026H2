import { v } from "convex/values"
import { NamedTableInfo, VectorSearchQuery } from "convex/server"
import { ActionCtx, internalQuery } from "../_generated/server"
import { internal } from "../_generated/api"
import { DataModel, Id } from "../_generated/dataModel"

// Vector search over chunkVectors / imageVectors, answered in chunk and image
// ids, so callers keep working with the rows they know. Order and scores are
// kept; vectors whose chunk or image is gone are dropped.

type ChunkQuery = VectorSearchQuery<NamedTableInfo<DataModel, "chunkVectors">, "by_embedding">
type ImageQuery = VectorSearchQuery<NamedTableInfo<DataModel, "imageVectors">, "by_embedding">

type Hit<T extends "chunks" | "images"> = { _id: Id<T>; _score: number }

/** Pairs each vector hit with the row it maps to, dropping hits with none. */
function mapHits<T extends "chunks" | "images">(hits: { _score: number }[], ids: (Id<T> | null)[]): Hit<T>[] {
  const out: Hit<T>[] = []
  hits.forEach((h, i) => {
    const id = ids[i]
    if (id) out.push({ _id: id, _score: h._score })
  })
  return out
}

export async function searchChunks(ctx: ActionCtx, query: ChunkQuery): Promise<Hit<"chunks">[]> {
  const hits = await ctx.vectorSearch("chunkVectors", "by_embedding", query)
  if (hits.length === 0) return []
  const ids = await ctx.runQuery(internal.ai.vectorSearch.chunkIdsFor, { ids: hits.map((h) => h._id) })
  return mapHits(hits, ids)
}

export async function searchImages(ctx: ActionCtx, query: ImageQuery): Promise<Hit<"images">[]> {
  const hits = await ctx.vectorSearch("imageVectors", "by_embedding", query)
  if (hits.length === 0) return []
  const ids = await ctx.runQuery(internal.ai.vectorSearch.imageIdsFor, { ids: hits.map((h) => h._id) })
  return mapHits(hits, ids)
}

export const chunkIdsFor = internalQuery({
  args: { ids: v.array(v.id("chunkVectors")) },
  handler: async (ctx, args): Promise<(Id<"chunks"> | null)[]> => {
    return await Promise.all(
      args.ids.map(async (id) => {
        const chunk = await ctx.db
          .query("chunks")
          .withIndex("by_vectorId", (q) => q.eq("vectorId", id))
          .first()
        return chunk?._id ?? null
      }),
    )
  },
})

export const imageIdsFor = internalQuery({
  args: { ids: v.array(v.id("imageVectors")) },
  handler: async (ctx, args): Promise<(Id<"images"> | null)[]> => {
    return await Promise.all(
      args.ids.map(async (id) => {
        const image = await ctx.db
          .query("images")
          .withIndex("by_vectorId", (q) => q.eq("vectorId", id))
          .first()
        return image?._id ?? null
      }),
    )
  },
})
