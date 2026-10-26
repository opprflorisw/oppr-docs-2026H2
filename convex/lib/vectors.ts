import { MutationCtx } from "../_generated/server"
import { Doc, Id } from "../_generated/dataModel"

// Vectors live in chunkVectors / imageVectors, apart from the rows they
// describe; chunks.vectorId and images.vectorId point at them. Every write or
// delete of a vector goes through here so the two never drift apart.

export async function setChunkVector(ctx: MutationCtx, chunk: Doc<"chunks">, embedding: number[], model: string) {
  let vectorId = chunk.vectorId
  if (vectorId && (await ctx.db.get(vectorId))) {
    await ctx.db.patch(vectorId, { embedding })
  } else {
    vectorId = await ctx.db.insert("chunkVectors", { chunkId: chunk._id, documentId: chunk.documentId, embedding })
  }
  await ctx.db.patch(chunk._id, { vectorId, embeddingModel: model, embeddedAt: Date.now() })
}

/** Drops a chunk's vector and marks it as not embedded. */
export async function clearChunkVector(ctx: MutationCtx, chunk: Doc<"chunks">) {
  if (chunk.vectorId && (await ctx.db.get(chunk.vectorId))) await ctx.db.delete(chunk.vectorId)
  await ctx.db.patch(chunk._id, { vectorId: undefined, embeddingModel: null })
}

/** Deletes a chunk and its vector. Use this instead of ctx.db.delete on chunks. */
export async function deleteChunk(ctx: MutationCtx, chunkOrId: Doc<"chunks"> | Id<"chunks">) {
  const chunk = typeof chunkOrId === "string" ? await ctx.db.get(chunkOrId) : chunkOrId
  if (!chunk) return
  if (chunk.vectorId && (await ctx.db.get(chunk.vectorId))) await ctx.db.delete(chunk.vectorId)
  await ctx.db.delete(chunk._id)
}

export async function setImageVector(ctx: MutationCtx, image: Doc<"images">, embedding: number[]) {
  const fields = { embedding, kind: image.kind, embedSource: image.embedSource }
  let vectorId = image.vectorId
  if (vectorId && (await ctx.db.get(vectorId))) {
    await ctx.db.patch(vectorId, fields)
  } else {
    vectorId = await ctx.db.insert("imageVectors", { imageId: image._id, ...fields })
  }
  if (vectorId !== image.vectorId) await ctx.db.patch(image._id, { vectorId })
}

export async function deleteImageVector(ctx: MutationCtx, image: Doc<"images">) {
  if (image.vectorId && (await ctx.db.get(image.vectorId))) await ctx.db.delete(image.vectorId)
}

/** Copies the image's filter fields onto its vector after kind or embedSource change. */
export async function syncImageVectorFilters(ctx: MutationCtx, imageId: Id<"images">) {
  const image = await ctx.db.get(imageId)
  if (!image?.vectorId) return
  const row = await ctx.db.get(image.vectorId)
  if (row && (row.kind !== image.kind || row.embedSource !== image.embedSource)) {
    await ctx.db.patch(row._id, { kind: image.kind, embedSource: image.embedSource })
  }
}

/**
 * Replaces the chunks of one document version with `next`, keeping every chunk
 * whose text is unchanged (same id, same vector) so a save re-embeds only the
 * passages that were actually edited.
 */
export async function reconcileChunks(
  ctx: MutationCtx,
  documentId: Id<"documents">,
  version: number,
  next: { text: string; section: string | null }[],
): Promise<void> {
  const old = await ctx.db
    .query("chunks")
    .withIndex("by_documentId_and_version", (q) => q.eq("documentId", documentId).eq("version", version))
    .collect()
  const byText = new Map<string, Doc<"chunks">[]>()
  for (const c of old) byText.set(c.text, [...(byText.get(c.text) ?? []), c])
  const kept = new Set<string>()
  for (const [i, c] of next.entries()) {
    const seq = i + 1
    const match = byText.get(c.text)?.shift()
    if (match) {
      kept.add(match._id)
      if (match.seq !== seq || match.pageOrSection !== c.section) {
        await ctx.db.patch(match._id, { seq, pageOrSection: c.section })
      }
    } else {
      await ctx.db.insert("chunks", { documentId, version, seq, text: c.text, pageOrSection: c.section, embeddingModel: null })
    }
  }
  for (const c of old) if (!kept.has(c._id)) await deleteChunk(ctx, c)
}
