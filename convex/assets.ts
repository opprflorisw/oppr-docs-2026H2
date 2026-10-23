import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { Doc } from "./_generated/dataModel"
import { requireUser, requireUserId } from "./lib/auth"
import { isPublished, publishedVersion } from "./lib/published"

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const assets = await ctx.db.query("assets").take(500)
    assets.sort((a, b) => a.code.localeCompare(b.code))
    return assets
  },
})

export const listWithLogs = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const assets = await ctx.db.query("assets").take(500)
    assets.sort((a, b) => a.code.localeCompare(b.code))

    const allLogs = await ctx.db.query("assetLogs").take(2000)
    const logsByAsset: Record<string, Doc<"assetLogs">[]> = {}
    for (const l of allLogs) {
      const list = logsByAsset[l.assetId] ?? []
      list.push(l)
      logsByAsset[l.assetId] = list
    }
    for (const k of Object.keys(logsByAsset)) {
      logsByAsset[k].sort((x, y) => x.code.localeCompare(y.code))
    }
    return { assets, logsByAsset }
  },
})

// publishedOnly: floor readers (mobile Scan) see only Published Documents,
// at their Published version. Desktop authoring lists everything.
export const listForAssetsPage = query({
  args: { publishedOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const assets = await ctx.db.query("assets").take(500)
    assets.sort((a, b) => a.code.localeCompare(b.code))

    const allLogs = await ctx.db.query("assetLogs").take(2000)
    const logsByAsset: Record<string, Doc<"assetLogs">[]> = {}
    for (const l of allLogs) {
      const list = logsByAsset[l.assetId] ?? []
      list.push(l)
      logsByAsset[l.assetId] = list
    }
    for (const k of Object.keys(logsByAsset)) {
      logsByAsset[k].sort((x, y) => x.code.localeCompare(y.code))
    }

    const docAssets = await ctx.db.query("documentAssets").take(2000)
    const docIds = Array.from(new Set(docAssets.map((da) => da.documentId)))
    const documents = await Promise.all(docIds.map((id) => ctx.db.get(id)))
    const docById = new Map<string, Doc<"documents">>()
    for (const d of documents) if (d) docById.set(d._id, d)

    const docsByAsset: Record<
      string,
      Array<{
        id: string
        naming_code: string
        title: string
        current_version: number
      }>
    > = {}
    for (const da of docAssets) {
      const d = docById.get(da.documentId)
      if (!d) continue
      if (args.publishedOnly && !isPublished(d)) continue
      const list = docsByAsset[da.assetId] ?? []
      list.push({
        id: d._id,
        naming_code: d.namingCode,
        title: d.title,
        current_version: args.publishedOnly
          ? (publishedVersion(d) as number)
          : d.currentVersion,
      })
      docsByAsset[da.assetId] = list
    }
    for (const k of Object.keys(docsByAsset)) {
      docsByAsset[k].sort((x, y) =>
        x.naming_code.localeCompare(y.naming_code),
      )
    }

    return { assets, logsByAsset, docsByAsset }
  },
})

export const get = query({
  args: { id: v.id("assets") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    return await ctx.db.get(args.id)
  },
})

// Resolve a batch of arbitrary string ids against the assets table without
// throwing on malformed input. See documents.resolveMany for context.
export const resolveMany = query({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const results: Array<{
      id: string
      exists: boolean
      code?: string
      name?: string
    }> = []
    for (const raw of args.ids) {
      const typed = ctx.db.normalizeId("assets", raw)
      if (!typed) {
        results.push({ id: raw, exists: false })
        continue
      }
      const asset = await ctx.db.get(typed)
      if (!asset) {
        results.push({ id: raw, exists: false })
        continue
      }
      results.push({
        id: raw,
        exists: true,
        code: asset.code,
        name: asset.name,
      })
    }
    return results
  },
})

export const getByQrToken = query({
  args: { qrToken: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    return await ctx.db
      .query("assets")
      .withIndex("by_qrToken", (q) => q.eq("qrToken", args.qrToken))
      .unique()
  },
})

export const getWithDocs = query({
  args: { id: v.id("assets"), publishedOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const asset = await ctx.db.get(args.id)
    if (!asset) return null
    const links = await ctx.db
      .query("documentAssets")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.id))
      .take(500)
    const documents = (
      await Promise.all(links.map((l) => ctx.db.get(l.documentId)))
    ).filter(
      (d): d is Doc<"documents"> =>
        d !== null && (!args.publishedOnly || isPublished(d)),
    )
    documents.sort((a, b) => a.title.localeCompare(b.title))
    const logs = await ctx.db
      .query("assetLogs")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.id))
      .take(500)
    logs.sort((a, b) => a.code.localeCompare(b.code))
    return { asset, documents, logs }
  },
})

export const listAssetLogs = query({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const logs = await ctx.db
      .query("assetLogs")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId))
      .take(500)
    logs.sort((a, b) => a.code.localeCompare(b.code))
    return logs
  },
})

const DEFAULT_SITE = "HOL"

export const create = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    description: v.optional(v.union(v.string(), v.null())),
    imageStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const code = args.code.trim()
    const name = args.name.trim()
    if (!code) throw new Error("Asset ID is required")
    if (!name) throw new Error("Asset name is required")
    const dupe = await ctx.db
      .query("assets")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique()
    if (dupe) throw new Error(`Asset code ${code} is already in use.`)

    return await ctx.db.insert("assets", {
      code,
      name,
      site: DEFAULT_SITE,
      location: null,
      qrToken: `qr-${code.toLowerCase()}`,
      description: args.description ?? null,
      level: 1,
      floorplan: null,
      isLinked: false,
      linkedLogCode: null,
      linkedLogName: null,
      linkedLogDescription: null,
      pinNumber: null,
      pinX: null,
      pinY: null,
      imageStorageId: args.imageStorageId ?? null,
    })
  },
})

// Resolve a signed URL for an asset's photo. Returns null when there is none.
export const imageUrlFor = query({
  args: { id: v.id("assets") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const asset = await ctx.db.get(args.id)
    if (!asset || !asset.imageStorageId) return null
    return await ctx.storage.getUrl(asset.imageStorageId)
  },
})

export const update = mutation({
  args: {
    id: v.id("assets"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    level: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const asset = await ctx.db.get(args.id)
    if (!asset) throw new Error("Asset not found")

    if (args.code !== undefined && args.code !== asset.code) {
      const dupe = await ctx.db
        .query("assets")
        .withIndex("by_code", (q) => q.eq("code", args.code as string))
        .unique()
      if (dupe && dupe._id !== args.id) {
        throw new Error(`Asset code ${args.code} is already in use.`)
      }
    }

    const patch: Partial<Doc<"assets">> = {}
    if (args.name !== undefined) patch.name = args.name
    if (args.code !== undefined) patch.code = args.code
    if (args.description !== undefined) patch.description = args.description
    if (args.level !== undefined) patch.level = args.level
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.id, patch)
    }
  },
})
