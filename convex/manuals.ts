// Wrapped manuals (CONTEXT.md: Wrapped manual). A supplier PDF, such as a
// machine manufacturer's manual, is embedded unchanged as a controlled
// Document. Oppr adds the outline around it: naming code, Assets, review and
// status. It is never edited, only replaced by a newer PDF.
//
// Data model (the seed writes exactly this):
//   documents.origin = "wrapped", documents.supplier
//   documentVersions: bodyKind "pdf", bodyJson null,
//     sourcePdfStorageId = the supplier's original (never modified),
//     pdfStorageId       = the copy stamped with code, version and status,
//     stampLabel, pdfPageCount
//   chunks: one or more per page, pageOrSection "Page N", so a citation opens
//   the PDF at that page.
import { v } from "convex/values"
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  MutationCtx,
  QueryCtx,
} from "./_generated/server"
import { internal } from "./_generated/api"
import { Doc, Id } from "./_generated/dataModel"
import { requireUser, requireUserId } from "./lib/auth"
import { pdfPageChunks } from "./lib/chunking"
import { stampLabel, stampPdf } from "./lib/pdfStamp"
import { allocateNamingCode } from "./naming"

// ---------------------------------------------------------------------------
// What a version's stamp should say

/**
 * The status a version's stamp must show, or null for a superseded version
 * (it keeps the stamp it had when it was replaced).
 */
export function stampStatusFor(doc: Doc<"documents">, version: number): string | null {
  const isLive = doc.liveVersion != null && version === doc.liveVersion
  const isCurrent = version === doc.currentVersion
  if (doc.status === "archived") return isLive || isCurrent ? "archived" : null
  if (isLive && (!isCurrent || doc.status === "published")) return "published"
  if (isCurrent) return doc.status === "pre_draft" ? "draft" : doc.status
  return null
}

function isoDate(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}

/** Everything printed on the stamp, as one comparable key. */
function stampKey(doc: Doc<"documents">, status: string, version: number): string {
  return JSON.stringify([doc.namingCode, doc.title, doc.supplier ?? null, status, version])
}

async function versionRow(
  ctx: QueryCtx | MutationCtx,
  documentId: Id<"documents">,
  version: number,
) {
  return await ctx.db
    .query("documentVersions")
    .withIndex("by_documentId_and_version", (q) =>
      q.eq("documentId", documentId).eq("version", version),
    )
    .unique()
}

/** Delete a stored PDF unless another version of the Document still uses it. */
async function deleteFileIfUnused(
  ctx: MutationCtx,
  documentId: Id<"documents">,
  storageId: Id<"_storage"> | null | undefined,
  exceptVersionRow: Id<"documentVersions">,
) {
  if (!storageId) return
  const rows = await ctx.db
    .query("documentVersions")
    .withIndex("by_documentId_and_version", (q) => q.eq("documentId", documentId))
    .take(500)
  const inUse = rows.some(
    (r) =>
      r._id !== exceptVersionRow &&
      (r.pdfStorageId === storageId || r.sourcePdfStorageId === storageId),
  )
  if (inUse) return
  try {
    await ctx.storage.delete(storageId)
  } catch {
    // Already gone: nothing to clean up.
  }
}

async function replaceChunks(
  ctx: MutationCtx,
  documentId: Id<"documents">,
  version: number,
  pageTexts: string[],
) {
  const old = await ctx.db
    .query("chunks")
    .withIndex("by_documentId_and_version", (q) =>
      q.eq("documentId", documentId).eq("version", version),
    )
    .collect()
  for (const c of old) await ctx.db.delete(c._id)
  const chunks = pdfPageChunks(pageTexts)
  for (const [i, c] of chunks.entries()) {
    await ctx.db.insert("chunks", {
      documentId,
      version,
      seq: i + 1,
      text: c.text,
      pageOrSection: c.section,
      embedding: null,
      embeddingModel: null,
    })
  }
  return chunks.length
}

async function requirePdfFile(ctx: MutationCtx, storageId: Id<"_storage">) {
  const file = await ctx.db.system.get(storageId)
  if (!file) throw new Error("The uploaded PDF was not found. Try the upload again.")
  if (file.contentType && !file.contentType.includes("pdf"))
    throw new Error("That file is not a PDF.")
}

const MAX_PAGES = 2000
const MAX_PAGE_TEXT = 20_000

function cleanPageTexts(pageTexts: string[]): string[] {
  if (pageTexts.length === 0) throw new Error("That PDF has no pages.")
  if (pageTexts.length > MAX_PAGES) throw new Error(`A manual can have at most ${MAX_PAGES} pages.`)
  return pageTexts.map((t) => t.slice(0, MAX_PAGE_TEXT))
}

/** Schedule a fresh stamp for these versions (also used by documents.ts). */
export async function scheduleStamp(
  ctx: MutationCtx,
  documentId: Id<"documents">,
  versions: Array<number | null | undefined>,
) {
  const unique = new Set(versions.filter((n): n is number => typeof n === "number" && n > 0))
  for (const version of unique) {
    await ctx.scheduler.runAfter(0, internal.manuals.stampVersion, { documentId, version })
  }
}

// ---------------------------------------------------------------------------
// Create

export const create = mutation({
  args: {
    storageId: v.id("_storage"),
    filename: v.string(),
    // Text of each page, extracted in the browser (pdf.js), in page order.
    pageTexts: v.array(v.string()),
    title: v.string(),
    supplier: v.string(),
    location: v.string(),
    discipline: v.string(),
    assetIds: v.array(v.id("assets")),
    reviewerId: v.optional(v.union(v.id("users"), v.null())),
    approverId: v.optional(v.union(v.id("users"), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const title = args.title.trim()
    const supplier = args.supplier.trim()
    const location = args.location.trim()
    const discipline = args.discipline.trim()
    if (!title) throw new Error("Give the manual a title.")
    if (!supplier) throw new Error("Name the supplier of this manual.")
    if (!location || !discipline)
      throw new Error("Pick an area and a discipline: they make the naming code.")
    await requirePdfFile(ctx, args.storageId)
    const pageTexts = cleanPageTexts(args.pageTexts)

    const namingCode = await allocateNamingCode(ctx, location, discipline, "manual")
    const now = Date.now()
    const documentId = await ctx.db.insert("documents", {
      namingCode,
      location,
      discipline,
      title,
      type: "manual",
      status: "draft",
      currentVersion: 1,
      ownerId: userId,
      authorId: userId,
      reviewerId: args.reviewerId ?? null,
      approverId: args.approverId ?? null,
      tags: [],
      updatedAt: now,
      origin: "wrapped",
      supplier,
    })
    await ctx.db.insert("documentVersions", {
      documentId,
      version: 1,
      bodyKind: "pdf",
      bodyJson: null,
      sourcePdfStorageId: args.storageId,
      // Filled in by stampVersion; readers show the original meanwhile.
      pdfStorageId: null,
      stampLabel: null,
      pdfPageCount: pageTexts.length,
      publishedAt: now,
      signoffs: [{ role: "author", userId, at: now }],
    })
    const chunkCount = await replaceChunks(ctx, documentId, 1, pageTexts)

    for (const assetId of Array.from(new Set(args.assetIds))) {
      if (!(await ctx.db.get(assetId))) continue
      await ctx.db.insert("documentAssets", { documentId, assetId })
    }

    await scheduleStamp(ctx, documentId, [1])
    await ctx.scheduler.runAfter(0, internal.ai.embed.embedMissingInternal, { documentId })
    return { id: documentId, namingCode, chunkCount }
  },
})

// ---------------------------------------------------------------------------
// Replace: never edited, only replaced

export const replacePdf = mutation({
  args: {
    documentId: v.id("documents"),
    storageId: v.id("_storage"),
    filename: v.string(),
    pageTexts: v.array(v.string()),
    changeNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const doc = await ctx.db.get(args.documentId)
    if (!doc) throw new Error("Document not found")
    if (doc.origin !== "wrapped") throw new Error("Only a Wrapped manual can have its PDF replaced.")
    if (doc.status === "archived") throw new Error("This manual is archived. It can no longer change.")
    await requirePdfFile(ctx, args.storageId)
    const pageTexts = cleanPageTexts(args.pageTexts)
    const changeNote =
      args.changeNote?.trim() ||
      `Replaced the PDF with ${args.filename.trim() || "a newer supplier file"}.`
    const now = Date.now()

    if (doc.status === "published") {
      // Like createNewVersion: the live version keeps serving the floor until
      // the new one has been reviewed, approved and Published.
      const liveVersion = doc.liveVersion ?? doc.currentVersion
      const newVersion = doc.currentVersion + 1
      await ctx.db.patch(doc._id, {
        liveVersion,
        currentVersion: newVersion,
        status: "draft",
        authorId: doc.authorId ?? userId,
        updatedAt: now,
      })
      await ctx.db.insert("documentVersions", {
        documentId: doc._id,
        version: newVersion,
        bodyKind: "pdf",
        bodyJson: null,
        sourcePdfStorageId: args.storageId,
        pdfStorageId: null,
        stampLabel: null,
        pdfPageCount: pageTexts.length,
        changeNote,
        publishedAt: now,
        signoffs: [{ role: "author", userId, at: now }],
      })
      await replaceChunks(ctx, doc._id, newVersion, pageTexts)
      await scheduleStamp(ctx, doc._id, [newVersion])
      await ctx.scheduler.runAfter(0, internal.ai.embed.embedMissingInternal, {
        documentId: doc._id,
      })
      return { version: newVersion, forked: true }
    }

    // A working version (draft, in review or approved): its PDF is replaced.
    // New content was not reviewed, so review and approval start again.
    const row = await versionRow(ctx, doc._id, doc.currentVersion)
    if (!row) throw new Error("This manual has no working version.")
    const oldSource = row.sourcePdfStorageId ?? null
    const oldStamp = row.pdfStorageId
    await ctx.db.patch(row._id, {
      bodyKind: "pdf",
      bodyJson: null,
      sourcePdfStorageId: args.storageId,
      pdfStorageId: null,
      stampLabel: null,
      pdfPageCount: pageTexts.length,
      changeNote,
      signoffs: (row.signoffs ?? []).filter((s) => s.role === "author"),
    })
    if (oldSource && oldSource !== args.storageId)
      await deleteFileIfUnused(ctx, doc._id, oldSource, row._id)
    if (oldStamp && oldStamp !== args.storageId)
      await deleteFileIfUnused(ctx, doc._id, oldStamp, row._id)
    await ctx.db.patch(doc._id, {
      status: doc.status === "pre_draft" ? "pre_draft" : "draft",
      updatedAt: now,
    })
    await replaceChunks(ctx, doc._id, doc.currentVersion, pageTexts)
    await scheduleStamp(ctx, doc._id, [doc.currentVersion])
    await ctx.scheduler.runAfter(0, internal.ai.embed.embedMissingInternal, {
      documentId: doc._id,
    })
    return { version: doc.currentVersion, forked: false }
  },
})

// ---------------------------------------------------------------------------
// The outline Oppr adds: title, supplier, Assets, review roles

export const updateDetails = mutation({
  args: {
    documentId: v.id("documents"),
    title: v.string(),
    supplier: v.string(),
    assetIds: v.array(v.id("assets")),
    ownerId: v.optional(v.union(v.id("users"), v.null())),
    reviewerId: v.optional(v.union(v.id("users"), v.null())),
    approverId: v.optional(v.union(v.id("users"), v.null())),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const doc = await ctx.db.get(args.documentId)
    if (!doc) throw new Error("Document not found")
    if (doc.origin !== "wrapped") throw new Error("This is not a Wrapped manual.")
    if (doc.status === "published" || doc.status === "archived")
      throw new Error("Start a new version to change a Published manual.")
    const title = args.title.trim()
    const supplier = args.supplier.trim()
    if (!title) throw new Error("Give the manual a title.")
    if (!supplier) throw new Error("Name the supplier of this manual.")

    // Title and supplier are printed on every page: changing them after
    // review changes what was reviewed, so review starts again.
    const stampChanged = title !== doc.title || supplier !== (doc.supplier ?? "")
    const reviewed = doc.status === "in_review" || doc.status === "approved"
    const patch: Partial<Doc<"documents">> = { title, supplier, updatedAt: Date.now() }
    if (args.ownerId !== undefined) patch.ownerId = args.ownerId
    if (args.reviewerId !== undefined) patch.reviewerId = args.reviewerId
    if (args.approverId !== undefined) patch.approverId = args.approverId
    let backToDraft = false
    if (reviewed && stampChanged) {
      patch.status = "draft"
      backToDraft = true
      const row = await versionRow(ctx, doc._id, doc.currentVersion)
      if (row)
        await ctx.db.patch(row._id, {
          signoffs: (row.signoffs ?? []).filter((s) => s.role === "author"),
        })
    }
    await ctx.db.patch(doc._id, patch)

    // Assets are part of the outline Oppr adds, not of the supplier's PDF.
    const wanted = new Set<string>()
    for (const id of args.assetIds) if (await ctx.db.get(id)) wanted.add(id)
    const links = await ctx.db
      .query("documentAssets")
      .withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
      .take(500)
    const have = new Set(links.map((l) => String(l.assetId)))
    for (const l of links) if (!wanted.has(String(l.assetId))) await ctx.db.delete(l._id)
    for (const id of wanted)
      if (!have.has(id))
        await ctx.db.insert("documentAssets", { documentId: doc._id, assetId: id as Id<"assets"> })

    // The working version shows the new title; the live one keeps its stamp
    // until the new version is Published.
    if (stampChanged) await scheduleStamp(ctx, doc._id, [doc.currentVersion])
    return { backToDraft }
  },
})

/** Ask for a fresh stamp, e.g. when the reader shows the stamp is late. */
export const restamp = mutation({
  args: { documentId: v.id("documents"), version: v.number() },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const doc = await ctx.db.get(args.documentId)
    if (!doc || doc.origin !== "wrapped") throw new Error("This is not a Wrapped manual.")
    await ctx.db.patch(doc._id, { updatedAt: Date.now() })
    await scheduleStamp(ctx, doc._id, [args.version])
  },
})

// ---------------------------------------------------------------------------
// Stamping

export const stampContext = internalQuery({
  args: { documentId: v.id("documents"), version: v.number() },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId)
    if (!doc || doc.origin !== "wrapped") return null
    const row = await versionRow(ctx, doc._id, args.version)
    if (!row || !row.sourcePdfStorageId) return null
    const status = effectiveStamp(doc, row)
    if (status == null) return null
    return {
      sourcePdfStorageId: row.sourcePdfStorageId,
      key: stampKey(doc, status, args.version),
      info: {
        namingCode: doc.namingCode,
        title: doc.title,
        version: args.version,
        status,
        date: isoDate(status === "published" ? row.publishedAt : Date.now()),
        supplier: doc.supplier ?? null,
      },
    }
  },
})

// A superseded version keeps the stamp it had; it is stamped only if it never
// got one (as "archived": it is not for use any more).
function effectiveStamp(doc: Doc<"documents">, row: Doc<"documentVersions">): string | null {
  return stampStatusFor(doc, row.version) ?? (row.pdfStorageId ? null : "archived")
}

/**
 * Re-stamp the supplier PDF of one version with its current naming code,
 * version and status (lib/pdfStamp.ts), store it as the version's
 * pdfStorageId (the old stamped blob is deleted, the supplier original in
 * sourcePdfStorageId is never touched) and record stampLabel.
 */
export const stampVersion = internalAction({
  args: { documentId: v.id("documents"), version: v.number() },
  handler: async (ctx, args): Promise<string | null> => {
    const plan = await ctx.runQuery(internal.manuals.stampContext, args)
    if (!plan) return null
    const blob = await ctx.storage.get(plan.sourcePdfStorageId)
    if (!blob) {
      console.error(`stampVersion: supplier PDF missing for ${plan.info.namingCode} v${args.version}`)
      return null
    }
    const stamped = await stampPdf(await blob.arrayBuffer(), plan.info)
    const storageId = await ctx.storage.store(
      new Blob([stamped.bytes as BlobPart], { type: "application/pdf" }),
    )
    const saved: boolean = await ctx.runMutation(internal.manuals.saveStamp, {
      documentId: args.documentId,
      version: args.version,
      storageId,
      sourcePdfStorageId: plan.sourcePdfStorageId,
      key: plan.key,
      label: stamped.label,
      pageCount: stamped.pageCount,
    })
    return saved ? stamped.label : null
  },
})

export const saveStamp = internalMutation({
  args: {
    documentId: v.id("documents"),
    version: v.number(),
    storageId: v.id("_storage"),
    sourcePdfStorageId: v.id("_storage"),
    key: v.string(),
    label: v.string(),
    pageCount: v.number(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const discard = async () => {
      await ctx.storage.delete(args.storageId)
      return false
    }
    const doc = await ctx.db.get(args.documentId)
    if (!doc) return await discard()
    const row = await versionRow(ctx, doc._id, args.version)
    // The PDF was replaced or the Document deleted while we were stamping.
    if (!row || row.sourcePdfStorageId !== args.sourcePdfStorageId) return await discard()
    // The Document moved on (status, title) while we were stamping: a newer
    // stamp job is already scheduled, and only that one may land.
    const status = effectiveStamp(doc, row)
    if (status == null || stampKey(doc, status, args.version) !== args.key) return await discard()

    const previous = row.pdfStorageId
    await ctx.db.patch(row._id, {
      pdfStorageId: args.storageId,
      stampLabel: args.label,
      pdfPageCount: args.pageCount,
    })
    if (previous && previous !== args.storageId && previous !== row.sourcePdfStorageId)
      await deleteFileIfUnused(ctx, doc._id, previous, row._id)
    return true
  },
})

/**
 * Refiling a Wrapped manual mints a new Document: it gets its own copy of the
 * supplier original (mutations cannot copy files), then its first stamp.
 */
export const copySource = internalAction({
  args: {
    documentId: v.id("documents"),
    version: v.number(),
    fromStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const blob = await ctx.storage.get(args.fromStorageId)
    if (!blob) {
      console.error(`copySource: supplier PDF ${args.fromStorageId} is missing`)
      return
    }
    const storageId = await ctx.storage.store(blob)
    await ctx.runMutation(internal.manuals.adoptSource, {
      documentId: args.documentId,
      version: args.version,
      storageId,
    })
  },
})

export const adoptSource = internalMutation({
  args: { documentId: v.id("documents"), version: v.number(), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const row = await versionRow(ctx, args.documentId, args.version)
    if (!row || row.sourcePdfStorageId) {
      await ctx.storage.delete(args.storageId)
      return
    }
    await ctx.db.patch(row._id, { sourcePdfStorageId: args.storageId })
    await scheduleStamp(ctx, args.documentId, [args.version])
  },
})

// ---------------------------------------------------------------------------
// Reading

/** What a reader needs to show one version of a Wrapped manual. */
export const getWrapped = query({
  args: { documentId: v.id("documents"), version: v.number() },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const doc = await ctx.db.get(args.documentId)
    if (!doc || doc.origin !== "wrapped") return null
    const row = await versionRow(ctx, doc._id, args.version)
    if (!row) return null
    const status = stampStatusFor(doc, args.version)
    const expectedLabel = status ? stampLabel({ status, version: args.version }) : null
    const hasStamp = row.pdfStorageId != null
    // The stamp shows an older status or title than the Document has now.
    const outdated = hasStamp && expectedLabel != null && row.stampLabel !== expectedLabel
    const base = `${doc.namingCode} v${args.version}`
    return {
      namingCode: doc.namingCode,
      title: doc.title,
      supplier: doc.supplier ?? null,
      version: args.version,
      // What the stamp shows once stamping is done; "superseded" keeps its old stamp.
      stampStatus: status ?? "superseded",
      stampLabel: row.stampLabel ?? null,
      expectedLabel,
      pageCount: row.pdfPageCount ?? null,
      changeNote: row.changeNote ?? null,
      stampedUrl: row.pdfStorageId ? await ctx.storage.getUrl(row.pdfStorageId) : null,
      sourceUrl: row.sourcePdfStorageId ? await ctx.storage.getUrl(row.sourcePdfStorageId) : null,
      stampedFilename: `${base} controlled copy.pdf`,
      sourceFilename: `${base} supplier original.pdf`,
      // While true, readers show the original (or the older stamp) and say so.
      stamping: !hasStamp || outdated,
      // Since when the stamp has been pending; the client decides when it is late.
      waitingSince: Math.max(row._creationTime, doc.updatedAt),
    }
  },
})

/**
 * The page of a version that holds a passage, for links that cite a passage
 * by its text (Wiki sources use ?hl=). Null when it can't be found.
 */
export const findPage = query({
  args: { documentId: v.id("documents"), version: v.number(), text: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase()
    const needle = norm(args.text).slice(0, 60)
    if (!needle) return null
    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.documentId).eq("version", args.version),
      )
      .take(4000)
    const hit = chunks.find((c) => norm(c.text).includes(needle))
    const m = hit?.pageOrSection?.match(/^Page (\d+)$/)
    return m ? Number(m[1]) : null
  },
})
