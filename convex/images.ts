import { v } from "convex/values"
import { Doc, Id } from "./_generated/dataModel"
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from "./_generated/server"
import { internal } from "./_generated/api"
import { requireUser, requireUserId } from "./lib/auth"
import { requireEngineerOrAdmin } from "./lib/roles"
import { walkBodyDiagrams, walkBodyImages } from "./lib/imageWalker"
import { imageKindValidator as kindValidator, normTag } from "./ai/imageDescribe"

const sourceValidator = v.union(v.literal("upload"), v.literal("url"))
const personArg = { personId: v.optional(v.id("people")) }
const EDIT_MESSAGE = "Check in as an Engineer to change the image library."

type ImageDocRef = {
  documentId: Id<"documents">
  namingCode: string
  title: string
  status: Doc<"documents">["status"]
}

/** The row without its embedding (768 numbers nobody on the client needs). */
function publicRow(img: Doc<"images">) {
  const { embedding, ...rest } = img
  return { ...rest, embedded: Boolean(embedding) }
}
type LibraryImage = ReturnType<typeof publicRow> & {
  usageCount: number
  documentRefs: ImageDocRef[]
  assets: { _id: Id<"assets">; code: string; name: string }[]
}

async function docRefsFor(ctx: QueryCtx, imageId: Id<"images">): Promise<ImageDocRef[]> {
  const usages = await ctx.db
    .query("imageUsages")
    .withIndex("by_imageId", (q) => q.eq("imageId", imageId))
    .take(200)
  const seen = new Set<string>()
  const out: ImageDocRef[] = []
  for (const u of usages) {
    const key = String(u.documentId)
    if (seen.has(key)) continue
    seen.add(key)
    const doc = await ctx.db.get(u.documentId)
    if (!doc) continue
    out.push({ documentId: doc._id, namingCode: doc.namingCode, title: doc.title, status: doc.status })
  }
  out.sort((a, b) => a.namingCode.localeCompare(b.namingCode))
  return out
}

async function decorate(ctx: QueryCtx, images: Doc<"images">[]): Promise<LibraryImage[]> {
  const assetCache = new Map<string, { _id: Id<"assets">; code: string; name: string } | null>()
  return await Promise.all(
    images.map(async (img) => {
      const refs = await docRefsFor(ctx, img._id)
      const assets: { _id: Id<"assets">; code: string; name: string }[] = []
      for (const id of img.assetIds ?? []) {
        if (!assetCache.has(id)) {
          const a = await ctx.db.get(id)
          assetCache.set(id, a ? { _id: a._id, code: a.code, name: a.name } : null)
        }
        const a = assetCache.get(id)
        if (a) assets.push(a)
      }
      return { ...publicRow(img), usageCount: refs.length, documentRefs: refs, assets }
    }),
  )
}

function matchesWords(img: Doc<"images">, q: string): boolean {
  const hay = `${img.filename} ${img.altText} ${img.description ?? ""} ${(img.tags ?? []).join(" ")}`.toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w))
}

export const list = query({
  args: {
    source: v.optional(sourceValidator),
    onlyOrphans: v.optional(v.boolean()),
    search: v.optional(v.string()),
    kind: v.optional(kindValidator),
    tag: v.optional(v.string()),
    favorite: v.optional(v.boolean()),
    collectionId: v.optional(v.id("imageCollections")),
    assetId: v.optional(v.id("assets")),
    areaCode: v.optional(v.string()),
    sort: v.optional(v.union(v.literal("newest"), v.literal("recentlyUsed"), v.literal("mostUsed"), v.literal("name"))),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    let rows = await ctx.db.query("images").order("desc").take(1000)
    if (args.source) rows = rows.filter((r) => r.source === args.source)
    if (args.kind) rows = rows.filter((r) => r.kind === args.kind)
    if (args.tag) rows = rows.filter((r) => (r.tags ?? []).includes(args.tag!))
    if (args.favorite) rows = rows.filter((r) => r.favorite)
    if (args.collectionId) rows = rows.filter((r) => (r.collectionIds ?? []).includes(args.collectionId!))
    if (args.assetId) rows = rows.filter((r) => (r.assetIds ?? []).includes(args.assetId!))
    if (args.areaCode) rows = rows.filter((r) => (r.areaCodes ?? []).includes(args.areaCode!))
    if (args.search?.trim()) rows = rows.filter((r) => matchesWords(r, args.search!.trim()))
    const sort = args.sort ?? "newest"
    rows.sort((a, b) => {
      if (sort === "recentlyUsed") return (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || b.createdAt - a.createdAt
      if (sort === "mostUsed") return (b.useCount ?? 0) - (a.useCount ?? 0) || b.createdAt - a.createdAt
      if (sort === "name") return a.filename.localeCompare(b.filename)
      return b.createdAt - a.createdAt
    })
    const withRefs = await decorate(ctx, rows)
    return args.onlyOrphans ? withRefs.filter((r) => r.usageCount === 0) : withRefs
  },
})

/** Counts for the library's filter rail. */
export const facets = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const rows = await ctx.db.query("images").take(1000)
    const tags = new Map<string, number>()
    const kinds = new Map<string, number>()
    const areas = new Map<string, number>()
    const assets = new Map<string, number>()
    const collections = new Map<string, number>()
    let favorites = 0
    let unembedded = 0
    let undescribed = 0
    const bump = (counts: Map<string, number>, key: string) => counts.set(key, (counts.get(key) ?? 0) + 1)
    for (const r of rows) {
      for (const t of r.tags ?? []) bump(tags, t)
      bump(kinds, r.kind ?? "unsorted")
      for (const a of r.areaCodes ?? []) bump(areas, a)
      for (const a of r.assetIds ?? []) bump(assets, a)
      for (const c of r.collectionIds ?? []) bump(collections, c)
      if (r.favorite) favorites++
      if (!r.embedding) unembedded++
      if (!r.description) undescribed++
    }
    const collectionRows = await ctx.db.query("imageCollections").take(200)
    const assetRows = await Promise.all(Array.from(assets.keys()).map((id) => ctx.db.get(id as Id<"assets">)))
    const locations = await ctx.db.query("namingLocations").take(100)
    return {
      total: rows.length,
      favorites,
      unembedded,
      undescribed,
      tags: Array.from(tags, ([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
      kinds: Object.fromEntries(kinds),
      areas: locations.map((l) => ({ code: l.code, label: l.label, count: areas.get(l.code) ?? 0 })),
      assets: assetRows
        .filter((a): a is Doc<"assets"> => a !== null)
        .map((a) => ({ _id: a._id, code: a.code, name: a.name, count: assets.get(a._id) ?? 0 }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      collections: collectionRows
        .map((c) => ({ _id: c._id, name: c.name, count: collections.get(c._id) ?? 0 }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }
  },
})

/** Picker tabs: the most recently inserted images. */
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const rows = await ctx.db
      .query("images")
      .withIndex("by_lastUsedAt")
      .order("desc")
      .take(Math.min(args.limit ?? 24, 60))
    return await Promise.all(rows.filter((r) => r.lastUsedAt).map((r) => pickerRow(ctx, r)))
  },
})

export const favorites = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const rows = await ctx.db
      .query("images")
      .withIndex("by_favorite", (q) => q.eq("favorite", true))
      .take(100)
    return await Promise.all(rows.map((r) => pickerRow(ctx, r)))
  },
})

async function pickerRow(ctx: QueryCtx, r: Doc<"images">) {
  return {
    imageId: r._id,
    url: r.storageId ? await ctx.storage.getUrl(r.storageId) : r.externalUrl,
    altText: r.altText,
    description: r.description ?? null,
    tags: r.tags ?? [],
    kind: r.kind ?? null,
    favorite: r.favorite ?? false,
    useCount: r.useCount ?? 0,
  }
}

export const get = query({
  args: { id: v.id("images") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const img = await ctx.db.get(args.id)
    if (!img) return null
    const usages = await ctx.db
      .query("imageUsages")
      .withIndex("by_imageId", (q) => q.eq("imageId", args.id))
      .take(200)
    const docs = await Promise.all(
      usages.map(async (u) => {
        const doc = await ctx.db.get(u.documentId)
        return doc ? { usage: u, doc } : null
      }),
    )
    const [decorated] = await decorate(ctx, [img])
    return {
      image: decorated,
      url: img.storageId ? await ctx.storage.getUrl(img.storageId) : img.externalUrl,
      uploader: img.uploadedBy ? await ctx.db.get(img.uploadedBy) : null,
      usages: docs
        .filter((d): d is NonNullable<typeof d> => d !== null)
        .map((d) => ({
          documentId: d.doc._id,
          namingCode: d.doc.namingCode,
          title: d.doc.title,
          status: d.doc.status,
          version: d.usage.documentVersion,
          context: d.usage.context,
        })),
    }
  },
})

export const urlFor = query({
  args: { id: v.id("images") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const img = await ctx.db.get(args.id)
    if (!img) return null
    if (img.source === "url") return img.externalUrl
    if (img.storageId) return await ctx.storage.getUrl(img.storageId)
    return null
  },
})

export const urlsFor = query({
  args: { ids: v.array(v.id("images")) },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const result: Record<string, string | null> = {}
    for (const id of args.ids) {
      const img = await ctx.db.get(id)
      if (!img) {
        result[id] = null
        continue
      }
      if (img.source === "url") {
        result[id] = img.externalUrl
        continue
      }
      result[id] = img.storageId ? await ctx.storage.getUrl(img.storageId) : null
    }
    return result
  },
})

// Walks each document's current-version tiptap body for diagram nodes. The
// diagram SVG is cached in the node attrs (rendered by renderDiagramSvg, the
// app's trust boundary) so no re-rendering is needed here. Background images
// are referenced inside the SVG by their storage URL, so the SVG is
// self-contained; backgroundUrl is surfaced separately for the UI.
export const listDiagrams = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const docs = await ctx.db.query("documents").take(500)
    const out: Array<{
      key: string
      svg: string
      caption: string
      backgroundUrl: string | null
      documentId: Id<"documents">
      namingCode: string
      title: string
      status: Doc<"documents">["status"]
    }> = []
    for (const doc of docs) {
      const ver = await ctx.db
        .query("documentVersions")
        .withIndex("by_documentId_and_version", (q) =>
          q.eq("documentId", doc._id).eq("version", doc.currentVersion),
        )
        .first()
      if (!ver || ver.bodyKind !== "tiptap" || !ver.bodyJson) continue
      const refs = walkBodyDiagrams(ver.bodyJson)
      refs.forEach((d, i) => {
        out.push({
          key: `${doc._id}:${i}`,
          svg: d.svg,
          caption: d.caption,
          backgroundUrl: d.backgroundUrl,
          documentId: doc._id,
          namingCode: doc.namingCode,
          title: doc.title,
          status: doc.status,
        })
      })
    }
    out.sort(
      (a, b) =>
        a.namingCode.localeCompare(b.namingCode) || a.key.localeCompare(b.key),
    )
    return out
  },
})

// Uploads stay open to every signed-in author (the editor, the importer and
// the guided writer all add images); managing the library needs an Engineer.
export const createFromUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    filename: v.string(),
    contentType: v.string(),
    byteSize: v.number(),
    width: v.union(v.number(), v.null()),
    height: v.union(v.number(), v.null()),
    sha256: v.string(),
    altText: v.string(),
    // Optional library metadata, e.g. from the guided writer's image maker.
    kind: v.optional(kindValidator),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    generatedPrompt: v.optional(v.string()),
    assetIds: v.optional(v.array(v.id("assets"))),
    areaCodes: v.optional(v.array(v.string())),
    /** Skip the automatic AI description (the embedding still runs). */
    skipDescribe: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)

    const existing = await ctx.db
      .query("images")
      .withIndex("by_sha256", (q) => q.eq("sha256", args.sha256))
      .first()
    if (existing) {
      // De-dup: drop the duplicate upload, keep the existing record.
      await ctx.storage.delete(args.storageId)
      const url = existing.storageId
        ? await ctx.storage.getUrl(existing.storageId)
        : existing.externalUrl
      return { id: existing._id, deduped: true as const, url }
    }

    const id = await ctx.db.insert("images", {
      source: "upload",
      storageId: args.storageId,
      externalUrl: null,
      filename: args.filename,
      contentType: args.contentType,
      byteSize: args.byteSize,
      width: args.width,
      height: args.height,
      sha256: args.sha256,
      altText: args.altText,
      uploadedBy: userId,
      createdAt: Date.now(),
      ...(args.kind ? { kind: args.kind } : {}),
      ...(args.description ? { description: args.description } : {}),
      ...(args.tags?.length ? { tags: uniqTags(args.tags) } : {}),
      ...(args.generatedPrompt ? { generatedPrompt: args.generatedPrompt } : {}),
      ...(args.assetIds?.length ? { assetIds: args.assetIds } : {}),
      ...(args.areaCodes?.length ? { areaCodes: args.areaCodes } : {}),
    })
    await scheduleEnrich(ctx, id, !args.skipDescribe && !args.description)
    const url = await ctx.storage.getUrl(args.storageId)
    return { id, deduped: false as const, url }
  },
})

async function scheduleEnrich(ctx: MutationCtx, imageId: Id<"images">, describe: boolean) {
  if (describe) await ctx.scheduler.runAfter(0, internal.ai.imageDescribe.describe, { imageId, thenEmbed: true })
  else await ctx.scheduler.runAfter(0, internal.ai.imageEmbed.embedImage, { imageId })
}

function uniqTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map(normTag).filter(Boolean))).slice(0, 24)
}

export const createFromUrl = mutation({
  args: {
    externalUrl: v.string(),
    filename: v.string(),
    contentType: v.string(),
    altText: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const id = await ctx.db.insert("images", {
      source: "url",
      storageId: null,
      externalUrl: args.externalUrl,
      filename: args.filename,
      contentType: args.contentType,
      byteSize: null,
      width: null,
      height: null,
      sha256: null,
      altText: args.altText,
      uploadedBy: userId,
      createdAt: Date.now(),
    })
    await scheduleEnrich(ctx, id, true)
    return { id, url: args.externalUrl }
  },
})

/** Called by the picker whenever an image is inserted somewhere. */
export const markUsed = mutation({
  args: { id: v.id("images") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const img = await ctx.db.get(args.id)
    if (!img) return
    await ctx.db.patch(args.id, { lastUsedAt: Date.now(), useCount: (img.useCount ?? 0) + 1 })
  },
})

export const update = mutation({
  args: {
    id: v.id("images"),
    ...personArg,
    filename: v.optional(v.string()),
    altText: v.optional(v.string()),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    kind: v.optional(v.union(kindValidator, v.null())),
    assetIds: v.optional(v.array(v.id("assets"))),
    areaCodes: v.optional(v.array(v.string())),
    collectionIds: v.optional(v.array(v.id("imageCollections"))),
    favorite: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId, EDIT_MESSAGE)
    const img = await ctx.db.get(args.id)
    if (!img) throw new Error("Image not found")
    const patch: Partial<Doc<"images">> = {}
    if (args.filename !== undefined) patch.filename = args.filename.trim() || img.filename
    if (args.altText !== undefined) patch.altText = args.altText.trim()
    if (args.description !== undefined) patch.description = args.description.trim()
    if (args.tags !== undefined) patch.tags = uniqTags(args.tags)
    if (args.kind !== undefined) patch.kind = args.kind ?? undefined
    if (args.assetIds !== undefined) patch.assetIds = Array.from(new Set(args.assetIds))
    if (args.areaCodes !== undefined) patch.areaCodes = Array.from(new Set(args.areaCodes))
    if (args.collectionIds !== undefined) patch.collectionIds = Array.from(new Set(args.collectionIds))
    if (args.favorite !== undefined) patch.favorite = args.favorite
    if (Object.keys(patch).length === 0) return
    await ctx.db.patch(args.id, patch)
    // A caption-embedded image must be re-embedded when its words change.
    const captionChanged = args.altText !== undefined || args.description !== undefined || args.tags !== undefined
    if (captionChanged && img.embedSource !== "image") {
      await ctx.scheduler.runAfter(0, internal.ai.imageEmbed.embedImage, { imageId: args.id })
    }
  },
})

/** Library bulk actions on the selected images. */
export const bulkUpdate = mutation({
  args: {
    ids: v.array(v.id("images")),
    ...personArg,
    addTags: v.optional(v.array(v.string())),
    removeTags: v.optional(v.array(v.string())),
    kind: v.optional(v.union(kindValidator, v.null())),
    favorite: v.optional(v.boolean()),
    addAssetIds: v.optional(v.array(v.id("assets"))),
    addAreaCodes: v.optional(v.array(v.string())),
    addToCollection: v.optional(v.id("imageCollections")),
    removeFromCollection: v.optional(v.id("imageCollections")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId, EDIT_MESSAGE)
    const remove = new Set((args.removeTags ?? []).map(normTag))
    let changed = 0
    for (const id of args.ids.slice(0, 500)) {
      const img = await ctx.db.get(id)
      if (!img) continue
      const patch: Partial<Doc<"images">> = {}
      if (args.addTags?.length || remove.size) {
        patch.tags = uniqTags([...(img.tags ?? []), ...(args.addTags ?? [])]).filter((t) => !remove.has(t))
      }
      if (args.kind !== undefined) patch.kind = args.kind ?? undefined
      if (args.favorite !== undefined) patch.favorite = args.favorite
      if (args.addAssetIds?.length) patch.assetIds = Array.from(new Set([...(img.assetIds ?? []), ...args.addAssetIds]))
      if (args.addAreaCodes?.length) patch.areaCodes = Array.from(new Set([...(img.areaCodes ?? []), ...args.addAreaCodes]))
      if (args.addToCollection || args.removeFromCollection) {
        const set = new Set(img.collectionIds ?? [])
        if (args.addToCollection) set.add(args.addToCollection)
        if (args.removeFromCollection) set.delete(args.removeFromCollection)
        patch.collectionIds = Array.from(set)
      }
      if (Object.keys(patch).length) {
        await ctx.db.patch(id, patch)
        changed++
      }
    }
    return { changed }
  },
})

export const replace = mutation({
  args: {
    id: v.id("images"),
    ...personArg,
    storageId: v.id("_storage"),
    filename: v.string(),
    contentType: v.string(),
    byteSize: v.number(),
    width: v.union(v.number(), v.null()),
    height: v.union(v.number(), v.null()),
    sha256: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId, EDIT_MESSAGE)
    const img = await ctx.db.get(args.id)
    if (!img) throw new Error("Image not found")

    const collision = await ctx.db
      .query("images")
      .withIndex("by_sha256", (q) => q.eq("sha256", args.sha256))
      .first()
    if (collision && collision._id !== args.id) {
      await ctx.storage.delete(args.storageId)
      throw new Error("That picture is already in the library. Use that image instead.")
    }

    const oldStorage = img.storageId
    await ctx.db.patch(args.id, {
      source: "upload",
      storageId: args.storageId,
      externalUrl: null,
      filename: args.filename,
      contentType: args.contentType,
      byteSize: args.byteSize,
      width: args.width,
      height: args.height,
      sha256: args.sha256,
      embedding: undefined,
      embeddingModel: undefined,
      embedSource: undefined,
    })
    if (oldStorage) await ctx.storage.delete(oldStorage)
    await ctx.scheduler.runAfter(0, internal.ai.imageEmbed.embedImage, { imageId: args.id })
  },
})

async function deleteIfUnused(
  ctx: MutationCtx,
  id: Id<"images">,
): Promise<string | null> {
  const img = await ctx.db.get(id)
  if (!img) return "not found"
  const usages = await ctx.db
    .query("imageUsages")
    .withIndex("by_imageId", (q) => q.eq("imageId", id))
    .take(200)
  if (usages.length > 0) {
    return `used in ${usages.length} document${usages.length === 1 ? "" : "s"}`
  }
  if (img.storageId && !(await blobShared(ctx, img.storageId))) await ctx.storage.delete(img.storageId)
  await ctx.db.delete(id)
  return null
}

/** An Asset photo or the seed's media cache may share an image's blob. */
async function blobShared(ctx: MutationCtx, storageId: Id<"_storage">): Promise<boolean> {
  for await (const a of ctx.db.query("assets")) if (a.imageStorageId === storageId) return true
  for await (const m of ctx.db.query("seedMedia")) if (m.storageId === storageId) return true
  return false
}

export const remove = mutation({
  args: { id: v.id("images"), ...personArg },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId, EDIT_MESSAGE)
    const reason = await deleteIfUnused(ctx, args.id)
    if (reason && reason !== "not found") throw new Error(`Cannot delete: image is ${reason}.`)
  },
})

export const removeMany = mutation({
  args: { ids: v.array(v.id("images")), ...personArg },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId, EDIT_MESSAGE)
    const ok: Id<"images">[] = []
    const refused: Array<{ id: Id<"images">; reason: string }> = []
    for (const id of args.ids) {
      const reason = await deleteIfUnused(ctx, id)
      if (reason) refused.push({ id, reason })
      else ok.push(id)
    }
    return { ok, refused }
  },
})

// ---- Collections ------------------------------------------------------------------

export const createCollection = mutation({
  args: { name: v.string(), ...personArg, imageIds: v.optional(v.array(v.id("images"))) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId, EDIT_MESSAGE)
    const name = args.name.trim()
    if (!name) throw new Error("Give the collection a name.")
    const existing = await ctx.db
      .query("imageCollections")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first()
    const id = existing?._id ?? (await ctx.db.insert("imageCollections", { name, createdAt: Date.now() }))
    for (const imageId of args.imageIds ?? []) {
      const img = await ctx.db.get(imageId)
      if (img) await ctx.db.patch(imageId, { collectionIds: Array.from(new Set([...(img.collectionIds ?? []), id])) })
    }
    return id
  },
})

export const renameCollection = mutation({
  args: { id: v.id("imageCollections"), name: v.string(), ...personArg },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId, EDIT_MESSAGE)
    if (!args.name.trim()) throw new Error("Give the collection a name.")
    await ctx.db.patch(args.id, { name: args.name.trim() })
  },
})

export const deleteCollection = mutation({
  args: { id: v.id("imageCollections"), ...personArg },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId, EDIT_MESSAGE)
    for await (const img of ctx.db.query("images")) {
      if (img.collectionIds?.includes(args.id)) {
        await ctx.db.patch(img._id, { collectionIds: img.collectionIds.filter((c) => c !== args.id) })
      }
    }
    await ctx.db.delete(args.id)
  },
})

// ---- Duplicates -------------------------------------------------------------------

export const embeddedIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const out: { id: Id<"images">; embedding: number[] }[] = []
    for await (const r of ctx.db.query("images")) {
      if (r.embedding && r.embedSource === "image") out.push({ id: r._id, embedding: r.embedding })
    }
    return out
  },
})

/**
 * Pairs of images that look the same (near-identical image embeddings), for
 * the library's "Possible duplicates" filter. Exact copies never get this far:
 * uploads are de-duplicated on their SHA-256.
 */
export const possibleDuplicates = action({
  args: { threshold: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ a: Id<"images">; b: Id<"images">; score: number }[]> => {
    await requireUser(ctx)
    const threshold = args.threshold ?? 0.95
    const rows: { id: Id<"images">; embedding: number[] }[] = await ctx.runQuery(internal.images.embeddedIds, {})
    const pairs = new Map<string, { a: Id<"images">; b: Id<"images">; score: number }>()
    for (const row of rows.slice(0, 400)) {
      const hits = await ctx.vectorSearch("images", "by_embedding", {
        vector: row.embedding,
        limit: 4,
        filter: (q) => q.eq("embedSource", "image"),
      })
      for (const h of hits) {
        if (h._id === row.id || h._score < threshold) continue
        const [a, b] = [row.id, h._id].sort() as [Id<"images">, Id<"images">]
        pairs.set(`${a}|${b}`, { a, b, score: Math.round(h._score * 1000) / 1000 })
      }
    }
    return Array.from(pairs.values()).sort((x, y) => y.score - x.score)
  },
})

// Internal helper called from documents.savePublish + create. Diffs the
// imageUsages rows for a given (documentId, version) against the image refs
// found in the body. Inserts missing rows; deletes stale ones. For external
// URLs that lack a data-image-id we synthesise an `images` row on the fly so
// the repo can still see them.
export const recomputeUsagesForVersion = internalMutation({
  args: {
    documentId: v.id("documents"),
    documentVersion: v.number(),
    body: v.any(),
  },
  handler: async (ctx, args) => {
    const refs = walkBodyImages(args.body)

    const resolvedIds: Id<"images">[] = []
    for (const ref of refs) {
      if (ref.imageId) {
        // Validate the imageId still exists; skip if it's stale.
        const exists = await ctx.db.get(ref.imageId as Id<"images">)
        if (exists) resolvedIds.push(ref.imageId as Id<"images">)
        continue
      }
      if (ref.externalUrl) {
        // Legacy / url-source. Either find an existing url-source row by
        // exact externalUrl or create one.
        const existing = await ctx.db
          .query("images")
          .filter((q) =>
            q.and(
              q.eq(q.field("source"), "url"),
              q.eq(q.field("externalUrl"), ref.externalUrl),
            ),
          )
          .first()
        if (existing) {
          resolvedIds.push(existing._id)
        } else {
          const filename = filenameFromUrl(ref.externalUrl)
          const id = await ctx.db.insert("images", {
            source: "url",
            storageId: null,
            externalUrl: ref.externalUrl,
            filename,
            contentType: contentTypeFromFilename(filename),
            byteSize: null,
            width: null,
            height: null,
            sha256: null,
            altText: ref.altText,
            uploadedBy: null,
            createdAt: Date.now(),
          })
          resolvedIds.push(id)
        }
      }
    }

    const existingUsages = await ctx.db
      .query("imageUsages")
      .withIndex("by_documentId_and_version", (q) =>
        q
          .eq("documentId", args.documentId)
          .eq("documentVersion", args.documentVersion),
      )
      .collect()
    const existingByImageId = new Map<string, Doc<"imageUsages">>()
    for (const u of existingUsages) existingByImageId.set(u.imageId, u)

    const desired = new Set<string>(resolvedIds)
    for (const u of existingUsages) {
      if (!desired.has(u.imageId)) await ctx.db.delete(u._id)
    }
    for (const imageId of resolvedIds) {
      if (!existingByImageId.has(imageId)) {
        await ctx.db.insert("imageUsages", {
          imageId,
          documentId: args.documentId,
          documentVersion: args.documentVersion,
          context: "body",
          createdAt: Date.now(),
        })
      }
    }
  },
})

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split("/").pop()
    if (last && last.includes(".")) return last
    return u.hostname + u.pathname
  } catch {
    return url.slice(0, 60)
  }
}

function contentTypeFromFilename(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? ""
  if (ext === "png") return "image/png"
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "gif") return "image/gif"
  if (ext === "webp") return "image/webp"
  if (ext === "svg") return "image/svg+xml"
  return "application/octet-stream"
}
