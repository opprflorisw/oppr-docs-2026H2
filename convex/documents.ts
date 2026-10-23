import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import { Doc, Id } from "./_generated/dataModel"
import { requireUser, requireUserId } from "./lib/auth"
import { allocateNamingCode, parseNamingCode } from "./naming"
import { walkBodyAssetIds } from "./lib/assetWalker"
import { regenerateWikisForDocument } from "./wikis"
import { isPublished, publishedVersion } from "./lib/published"

// Periodic review (CONTEXT.md): every Published Document is due for review
// this many months after it was published or last confirmed.
export const DEFAULT_REVIEW_MONTHS = 12

export function addMonths(at: number, months: number): number {
  const d = new Date(at)
  d.setMonth(d.getMonth() + months)
  return d.getTime()
}

// Recompute the documentAssets links for a document from the asset pills present
// in its body. The body is the single source of truth — there is no manual asset
// field any more. Diffs against existing links so we only insert/delete deltas.
async function syncDocumentAssetsFromBody(
  ctx: import("./_generated/server").MutationCtx,
  documentId: Id<"documents">,
  body: unknown,
) {
  const wantedRaw = walkBodyAssetIds(body)
  const wanted = new Set<string>()
  for (const raw of wantedRaw) {
    const typed = ctx.db.normalizeId("assets", raw)
    if (typed) wanted.add(typed)
  }
  const existingLinks = await ctx.db
    .query("documentAssets")
    .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
    .take(500)
  const existing = new Set(existingLinks.map((l) => String(l.assetId)))
  for (const link of existingLinks) {
    if (!wanted.has(String(link.assetId))) await ctx.db.delete(link._id)
  }
  for (const id of wanted) {
    if (!existing.has(id)) {
      await ctx.db.insert("documentAssets", {
        documentId,
        assetId: id as Id<"assets">,
      })
    }
  }
}

// Type is now an editable vocabulary (namingTypes); accept any slug string.
const docTypeValidator = v.string()
const docStatusValidator = v.union(
  v.literal("pre_draft"),
  v.literal("draft"),
  v.literal("in_review"),
  v.literal("approved"),
  v.literal("published"),
  v.literal("archived"),
)

// Most senior status for counting/filtering: a document with a live version is
// "published" even while its next edition is being drafted; archived stays
// archived. Mirrors src/lib/docStatus.ts.
function effectiveStatus(d: Doc<"documents">): Doc<"documents">["status"] {
  if (d.status === "archived") return "archived"
  return d.liveVersion != null ? "published" : d.status
}

export const list = query({
  args: {
    status: v.optional(docStatusValidator),
    type: v.optional(docTypeValidator),
    search: v.optional(v.string()),
    // Floor readers (mobile, Ask auto-links) pass true: only Published
    // Documents are Knowledge (convex/lib/published.ts).
    publishedOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    let docs = await ctx.db.query("documents").take(500)

    if (args.publishedOnly) docs = docs.filter(isPublished)
    if (args.status) docs = docs.filter((d) => effectiveStatus(d) === args.status)
    if (args.type) docs = docs.filter((d) => d.type === args.type)
    if (args.search) {
      const needle = args.search.toLowerCase()
      docs = docs.filter(
        (d) =>
          d.title.toLowerCase().includes(needle) ||
          d.namingCode.toLowerCase().includes(needle),
      )
    }

    docs.sort((a, b) => b.updatedAt - a.updatedAt)
    return docs
  },
})

export const listWithAssetPreviews = query({
  args: {
    status: v.optional(docStatusValidator),
    type: v.optional(docTypeValidator),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    let docs = await ctx.db.query("documents").take(500)
    if (args.status) docs = docs.filter((d) => effectiveStatus(d) === args.status)
    if (args.type) docs = docs.filter((d) => d.type === args.type)
    if (args.search) {
      const needle = args.search.toLowerCase()
      docs = docs.filter(
        (d) =>
          d.title.toLowerCase().includes(needle) ||
          d.namingCode.toLowerCase().includes(needle),
      )
    }
    docs.sort((a, b) => b.updatedAt - a.updatedAt)

    const docAssets = await ctx.db.query("documentAssets").take(2000)
    const assetIds = Array.from(new Set(docAssets.map((da) => da.assetId)))
    const assets = await Promise.all(assetIds.map((id) => ctx.db.get(id)))
    const byAssetId = new Map<string, Doc<"assets">>()
    for (const a of assets) if (a) byAssetId.set(a._id, a)

    const assetsByDoc: Record<
      string,
      Array<{ id: string; code: string; name: string }>
    > = {}
    for (const da of docAssets) {
      const a = byAssetId.get(da.assetId)
      if (!a) continue
      const list = assetsByDoc[da.documentId] ?? []
      list.push({ id: a._id, code: a.code, name: a.name })
      assetsByDoc[da.documentId] = list
    }
    for (const k of Object.keys(assetsByDoc)) {
      assetsByDoc[k].sort((x, y) => x.code.localeCompare(y.code))
    }

    return { docs, assetsByDoc }
  },
})

export const get = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    return await ctx.db.get(args.id)
  },
})

// Resolve a batch of arbitrary string ids against the documents table without
// throwing on malformed input. Used by the mobile home to detect Pinned /
// Recent entries that point at deleted (or pre-Convex) documents and surface
// a Remove affordance instead of crashing the reader. Returns one entry per
// input id in the same order.
export const resolveMany = query({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const results: Array<{
      id: string
      exists: boolean
      namingCode?: string
      title?: string
    }> = []
    for (const raw of args.ids) {
      const typed = ctx.db.normalizeId("documents", raw)
      if (!typed) {
        results.push({ id: raw, exists: false })
        continue
      }
      const doc = await ctx.db.get(typed)
      if (!doc) {
        results.push({ id: raw, exists: false })
        continue
      }
      results.push({
        id: raw,
        exists: true,
        namingCode: doc.namingCode,
        title: doc.title,
      })
    }
    return results
  },
})

export const getWithAssets = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc) return null
    const links = await ctx.db
      .query("documentAssets")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.id))
      .take(500)
    const assets = (
      await Promise.all(links.map((l) => ctx.db.get(l.assetId)))
    ).filter((a): a is Doc<"assets"> => a !== null)
    assets.sort((a, b) => a.code.localeCompare(b.code))

    async function nameOf(uid: Id<"users"> | null | undefined) {
      if (!uid) return null
      const u = await ctx.db.get(uid)
      if (!u) return null
      return u.name ?? u.email ?? null
    }
    const roles = {
      owner: await nameOf(doc.ownerId),
      author: await nameOf(doc.authorId),
      reviewer: await nameOf(doc.reviewerId),
      approver: await nameOf(doc.approverId),
    }
    return { doc, assets, roles }
  },
})

export const getCurrentVersion = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const doc = await ctx.db.get(args.documentId)
    if (!doc) return null
    if (doc.currentVersion < 1) return null
    return await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.documentId).eq("version", doc.currentVersion),
      )
      .unique()
  },
})

// The version readers should see: the live (published) edition while a newer
// edition is being drafted, falling back to the working version for documents
// that have never been published. Operators / QR / mobile use this, not
// getCurrentVersion (which is the authoring edition).
export const getServingVersion = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const doc = await ctx.db.get(args.documentId)
    if (!doc) return null
    const serving = doc.liveVersion ?? doc.currentVersion
    if (serving < 1) return null
    return await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.documentId).eq("version", serving),
      )
      .unique()
  },
})

// The Published version and nothing else: null for a draft that was never
// published and for an archived Document. Floor readers (mobile Scan and
// reading) use this so an Operator can never mistake a draft or an obsolete
// version for the truth (ISO 9001 7.5.3).
export const getPublishedVersion = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const doc = await ctx.db.get(args.documentId)
    if (!doc) return null
    const version = publishedVersion(doc)
    if (version == null) return null
    return await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.documentId).eq("version", version),
      )
      .unique()
  },
})

// Fetch one specific edition by number. The read page's version override and
// the PDF export use this so "the version you are viewing" is exactly what
// renders/exports.
export const getVersionByNumber = query({
  args: { documentId: v.id("documents"), version: v.number() },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    return await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.documentId).eq("version", args.version),
      )
      .unique()
  },
})

export const listVersions = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const versions = await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.documentId),
      )
      .take(500)
    versions.sort((a, b) => b.version - a.version)
    return versions
  },
})

export const listForAsset = query({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const links = await ctx.db
      .query("documentAssets")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId))
      .take(500)
    const docs = (
      await Promise.all(links.map((l) => ctx.db.get(l.documentId)))
    ).filter((d): d is Doc<"documents"> => d !== null)
    docs.sort((a, b) => a.title.localeCompare(b.title))
    return docs
  },
})

const chunkInputValidator = v.array(
  v.object({
    text: v.string(),
    section: v.union(v.string(), v.null()),
  }),
)

const docTypeArg = v.string()
async function ensureUniqueNamingCode(
  ctx: import("./_generated/server").MutationCtx,
  namingCode: string,
  ignoreId?: Id<"documents">,
) {
  const existing = await ctx.db
    .query("documents")
    .withIndex("by_namingCode", (q) => q.eq("namingCode", namingCode))
    .unique()
  if (existing && existing._id !== ignoreId) {
    throw new Error(`Naming code ${namingCode} is already in use.`)
  }
}

export const create = mutation({
  args: {
    location: v.string(),
    discipline: v.string(),
    title: v.string(),
    type: docTypeArg,
    ownerId: v.optional(v.union(v.id("users"), v.null())),
    reviewerId: v.optional(v.union(v.id("users"), v.null())),
    approverId: v.optional(v.union(v.id("users"), v.null())),
    body: v.any(),
    chunks: chunkInputValidator,
    // Optional storageId when the body embeds an imported PDF attachment.
    pdfStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)

    const namingCode = await allocateNamingCode(
      ctx,
      args.location,
      args.discipline,
      args.type,
    )

    const now = Date.now()
    const docId = await ctx.db.insert("documents", {
      namingCode,
      location: args.location,
      discipline: args.discipline,
      title: args.title.trim(),
      type: args.type,
      status: "draft",
      currentVersion: 1,
      // Owner defaults to the author (creator) unless explicitly set.
      ownerId: args.ownerId === undefined ? userId : args.ownerId,
      authorId: userId,
      reviewerId: args.reviewerId ?? null,
      approverId: args.approverId ?? null,
      tags: [],
      updatedAt: now,
    })

    await ctx.db.insert("documentVersions", {
      documentId: docId,
      version: 1,
      bodyKind: "tiptap",
      bodyJson: args.body,
      pdfStorageId: args.pdfStorageId ?? null,
      publishedAt: now,
      signoffs: [{ role: "author", userId, at: now }],
    })

    for (const [i, c] of args.chunks.entries()) {
      await ctx.db.insert("chunks", {
        documentId: docId,
        version: 1,
        seq: i + 1,
        text: c.text,
        pageOrSection: c.section,
        embedding: null,
        embeddingModel: null,
      })
    }

    await syncDocumentAssetsFromBody(ctx, docId, args.body)

    await ctx.runMutation(internal.images.recomputeUsagesForVersion, {
      documentId: docId,
      documentVersion: 1,
      body: args.body,
    })

    await ctx.scheduler.runAfter(0, internal.ai.embed.embedMissingInternal, {
      documentId: docId,
    })

    return docId
  },
})

// Save the working content. Saving NEVER bumps the version or changes the
// lifecycle status — the version number is the *published edition* count and
// only advances through createNewVersion (forking a published document). So:
//   - pre_draft  → promote to draft (allocates the naming code), overwrite v1.
//   - published  → rejected. A published edition is read-only; editing it must
//                  go through createNewVersion, which forks the next draft.
//   - otherwise  → overwrite the current (working) version's content in place.
// Status only advances through the gated transition mutations below. The naming
// code is immutable after creation. Linked assets are derived from the body.
export const saveContent = mutation({
  args: {
    id: v.id("documents"),
    title: v.string(),
    type: docTypeArg,
    // Only used to promote a pre_draft: location + discipline allocate the code.
    location: v.optional(v.string()),
    discipline: v.optional(v.string()),
    ownerId: v.optional(v.union(v.id("users"), v.null())),
    reviewerId: v.optional(v.union(v.id("users"), v.null())),
    approverId: v.optional(v.union(v.id("users"), v.null())),
    body: v.any(),
    chunks: chunkInputValidator,
    pdfStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")

    const now = Date.now()

    // Once a naming code exists, the type is part of it and can't drift; the
    // refile mutation is the only way to change filing (it mints a new doc).
    const lockedType = doc.namingCode ? doc.type : args.type

    const patch: Partial<Doc<"documents">> = {
      title: args.title.trim(),
      type: lockedType,
      updatedAt: now,
    }
    if (args.ownerId !== undefined) patch.ownerId = args.ownerId
    if (args.reviewerId !== undefined) patch.reviewerId = args.reviewerId
    if (args.approverId !== undefined) patch.approverId = args.approverId
    if (!doc.authorId) patch.authorId = userId

    // Backfill filing for documents created before location/discipline were
    // stored — the naming code is the source of truth.
    if (doc.namingCode && (!doc.location || !doc.discipline)) {
      const parsed = parseNamingCode(doc.namingCode)
      if (parsed) {
        patch.location = doc.location ?? parsed.location
        patch.discipline = doc.discipline ?? parsed.discipline
      }
    }

    // A published edition is locked. Editing it must fork a new draft edition
    // via createNewVersion, so v1 stays live until v2 completes the cycle.
    if (doc.status === "published") {
      throw new Error(
        "Published documents are read-only. Create a new version to edit.",
      )
    }

    // Overwrite the current (working) version's content in place — never a bump.
    const targetVersion = doc.currentVersion

    if (doc.status === "pre_draft") {
      // Promote a pre-draft to a real draft: this is when it first claims a
      // naming code from the per-triplet counter. Before this, imports carry no
      // code and never burn a number. Content overwrites the existing v1 row.
      const location = (args.location ?? doc.location ?? "").trim()
      const discipline = (args.discipline ?? doc.discipline ?? "").trim()
      if (!location || !discipline) {
        throw new Error(
          "Set a location and discipline before saving — that allocates the document's naming code.",
        )
      }
      patch.location = location
      patch.discipline = discipline
      patch.status = "draft"
      patch.namingCode = await allocateNamingCode(
        ctx,
        location,
        discipline,
        args.type,
      )
    }

    await ctx.db.patch(args.id, patch)

    // Upsert the target version's content row.
    const existing = await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.id).eq("version", targetVersion),
      )
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        bodyKind: "tiptap",
        bodyJson: args.body,
        pdfStorageId: args.pdfStorageId ?? existing.pdfStorageId ?? null,
      })
    } else {
      await ctx.db.insert("documentVersions", {
        documentId: args.id,
        version: targetVersion,
        bodyKind: "tiptap",
        bodyJson: args.body,
        pdfStorageId: args.pdfStorageId ?? null,
        publishedAt: now,
        signoffs: [{ role: "author", userId, at: now }],
      })
    }

    // Reconcile chunks for the target version (delete then reinsert).
    const oldChunks = await ctx.db
      .query("chunks")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.id).eq("version", targetVersion),
      )
      .collect()
    for (const c of oldChunks) await ctx.db.delete(c._id)
    for (const [i, c] of args.chunks.entries()) {
      await ctx.db.insert("chunks", {
        documentId: args.id,
        version: targetVersion,
        seq: i + 1,
        text: c.text,
        pageOrSection: c.section,
        embedding: null,
        embeddingModel: null,
      })
    }

    await syncDocumentAssetsFromBody(ctx, args.id, args.body)

    await ctx.runMutation(internal.images.recomputeUsagesForVersion, {
      documentId: args.id,
      documentVersion: targetVersion,
      body: args.body,
    })

    await ctx.scheduler.runAfter(0, internal.ai.embed.embedMissingInternal, {
      documentId: args.id,
    })

    return { version: targetVersion }
  },
})

// Append a sign-off to the current version's trail.
async function recordSignoff(
  ctx: import("./_generated/server").MutationCtx,
  doc: Doc<"documents">,
  role: "author" | "reviewer" | "approver",
  userId: Id<"users">,
) {
  const version = await ctx.db
    .query("documentVersions")
    .withIndex("by_documentId_and_version", (q) =>
      q.eq("documentId", doc._id).eq("version", doc.currentVersion),
    )
    .unique()
  if (!version) return
  const signoffs = version.signoffs ?? []
  await ctx.db.patch(version._id, {
    signoffs: [...signoffs, { role, userId, at: Date.now() }],
  })
}

// draft → in_review. Requires a reviewer to be assigned. The author sign-off
// for this version is already recorded by saveContent, so we don't add another.
export const submitForReview = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")
    if (doc.status !== "draft")
      throw new Error("Only a draft can be submitted for review.")
    if (!doc.reviewerId)
      throw new Error("Assign a reviewer before submitting for review.")
    await ctx.db.patch(args.id, { status: "in_review", updatedAt: Date.now() })
  },
})

// in_review → approved. Requires an approver to be assigned; records approval.
export const approve = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")
    if (doc.status !== "in_review")
      throw new Error("Only a document in review can be approved.")
    if (!doc.approverId)
      throw new Error("Assign an approver before approving.")
    await ctx.db.patch(args.id, { status: "approved", updatedAt: Date.now() })
    await recordSignoff(ctx, doc, "reviewer", userId)
  },
})

// approved → published. This edition becomes the live one served to operators,
// QR, and RAG (liveVersion). If a previous edition was live, it is replaced here.
export const publish = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")
    if (doc.status !== "approved")
      throw new Error("A document must be approved before publishing.")
    await publishApproved(ctx, doc, userId)
  },
})

/**
 * approved → published. Shared by the publish mutation and the dev checks.
 * This edition becomes the live one served to operators, QR codes, Ask and
 * Wikis; the periodic review restarts; Wikis built on it are regenerated.
 */
export async function publishApproved(
  ctx: import("./_generated/server").MutationCtx,
  doc: Doc<"documents">,
  userId: Id<"users">,
) {
  const now = Date.now()
  await ctx.db.patch(doc._id, {
    status: "published",
    liveVersion: doc.currentVersion,
    updatedAt: now,
    nextReviewAt: addMonths(now, doc.reviewIntervalMonths ?? DEFAULT_REVIEW_MONTHS),
    lastReviewedAt: now,
  })
  await recordSignoff(ctx, doc, "approver", userId)
  // The version row is created when its draft starts; stamp the real
  // publication date so history, PDF exports and Wiki provenance show when
  // this version became the truth, not when its draft was begun.
  const versionRow = await ctx.db
    .query("documentVersions")
    .withIndex("by_documentId_and_version", (q) =>
      q.eq("documentId", doc._id).eq("version", doc.currentVersion),
    )
    .unique()
  if (versionRow) await ctx.db.patch(versionRow._id, { publishedAt: now })

  // Drop chunks belonging to superseded editions: only the now-live version
  // is served. Version bodies stay in documentVersions for history.
  const staleChunks = await ctx.db
    .query("chunks")
    .withIndex("by_documentId_and_version", (q) => q.eq("documentId", doc._id))
    .collect()
  for (const c of staleChunks) {
    if (c.version !== doc.currentVersion) await ctx.db.delete(c._id)
  }

  // Wikis built on this Document must follow the new Published version.
  await regenerateWikisForDocument(ctx, doc._id, `published ${doc.namingCode} v${doc.currentVersion}`)
}

// Periodic review outcome "still valid": the Published version is confirmed
// as-is and the next review moves one interval forward. Changing the content
// goes through createNewVersion instead.
export const confirmReview = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")
    const live = publishedVersion(doc)
    if (live == null)
      throw new Error("Only a published document has a periodic review.")
    const now = Date.now()
    await ctx.db.patch(args.id, {
      lastReviewedAt: now,
      nextReviewAt: addMonths(now, doc.reviewIntervalMonths ?? DEFAULT_REVIEW_MONTHS),
    })
    // Audit trail: who confirmed which version, and when.
    const row = await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.id).eq("version", live),
      )
      .unique()
    if (row) {
      await ctx.db.patch(row._id, {
        reviewConfirmations: [...(row.reviewConfirmations ?? []), { userId, at: now }],
      })
    }
  },
})

// The periodic review record of the Published version, newest first: when it
// was published and by whom, and every "still valid" confirmation since.
export const reviewRecord = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const doc = await ctx.db.get(args.documentId)
    if (!doc) return null
    const live = publishedVersion(doc)
    if (live == null) return null
    const row = await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.documentId).eq("version", live),
      )
      .unique()
    if (!row) return null
    const names = new Map<string, string | null>()
    async function nameOf(uid: Id<"users">) {
      if (!names.has(uid)) {
        const u = await ctx.db.get(uid)
        names.set(uid, u ? (u.name ?? u.email ?? null) : null)
      }
      return names.get(uid) ?? null
    }
    const approval = [...(row.signoffs ?? [])].reverse().find((s) => s.role === "approver")
    const events: { kind: "published" | "confirmed"; at: number; by: string | null }[] = [
      {
        kind: "published",
        at: approval?.at ?? row.publishedAt,
        by: approval ? await nameOf(approval.userId) : null,
      },
    ]
    for (const c of row.reviewConfirmations ?? []) {
      events.push({ kind: "confirmed", at: c.at, by: await nameOf(c.userId) })
    }
    events.sort((a, b) => b.at - a.at)
    return { version: live, events }
  },
})

export const setReviewInterval = mutation({
  args: { id: v.id("documents"), months: v.number() },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")
    const months = Math.round(args.months)
    if (months < 1 || months > 60)
      throw new Error("The review interval must be between 1 and 60 months.")
    // The due date counts from the last review (publish or confirmation), so
    // shortening the interval can make a review due or overdue at once. That
    // is intended: the new interval applies to the version in use today.
    const base = doc.lastReviewedAt ?? null
    await ctx.db.patch(args.id, {
      reviewIntervalMonths: months,
      nextReviewAt:
        isPublished(doc) && base != null ? addMonths(base, months) : doc.nextReviewAt ?? null,
    })
  },
})

// Fork a published document into the next draft edition. The live edition stays
// pinned (liveVersion) and keeps serving operators/QR/RAG until this new draft
// runs the full author → review → approve → publish cycle. The new version row
// starts as a copy of the live content so the author edits forward from it.
export const createNewVersion = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")
    if (doc.status !== "published")
      throw new Error(
        "Only a published document can be forked into a new version.",
      )

    const liveVersion = doc.liveVersion ?? doc.currentVersion
    const liveRow = await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.id).eq("version", liveVersion),
      )
      .unique()

    const newVersion = doc.currentVersion + 1
    const now = Date.now()

    await ctx.db.patch(args.id, {
      // Pin liveVersion (covers docs published before this field existed) and
      // start the working edition; status drops to draft for the new cycle.
      liveVersion,
      currentVersion: newVersion,
      status: "draft",
      authorId: doc.authorId ?? userId,
      updatedAt: now,
    })

    await ctx.db.insert("documentVersions", {
      documentId: args.id,
      version: newVersion,
      bodyKind: liveRow?.bodyKind ?? "tiptap",
      bodyJson: liveRow?.bodyJson ?? null,
      pdfStorageId: liveRow?.pdfStorageId ?? null,
      publishedAt: now,
      signoffs: [{ role: "author", userId, at: now }],
    })

    // Mirror the live edition's chunks + image usages onto the new version so
    // editing and (eventually) re-publishing start from the same content. RAG
    // still serves the live version (see lookupAfterSearch).
    const liveChunks = await ctx.db
      .query("chunks")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.id).eq("version", liveVersion),
      )
      .collect()
    for (const c of liveChunks) {
      await ctx.db.insert("chunks", {
        documentId: args.id,
        version: newVersion,
        seq: c.seq,
        text: c.text,
        pageOrSection: c.pageOrSection,
        embedding: null,
        embeddingModel: null,
      })
    }

    await ctx.runMutation(internal.images.recomputeUsagesForVersion, {
      documentId: args.id,
      documentVersion: newVersion,
      body: liveRow?.bodyJson ?? null,
    })

    await ctx.scheduler.runAfter(0, internal.ai.embed.embedMissingInternal, {
      documentId: args.id,
    })

    return { version: newVersion }
  },
})

// Change a document's filing (location/discipline/type). The naming code is
// immutable, so this mints a NEW document with a freshly allocated code,
// copying the current content and roles, and optionally archives the old one.
export const refile = mutation({
  args: {
    id: v.id("documents"),
    location: v.string(),
    discipline: v.string(),
    type: docTypeArg,
    archiveOld: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")
    const location = args.location.trim()
    const discipline = args.discipline.trim()
    if (!location || !discipline)
      throw new Error("Location and discipline are required")

    const parsed = doc.namingCode ? parseNamingCode(doc.namingCode) : null
    const currentLocation = doc.location ?? parsed?.location ?? ""
    const currentDiscipline = doc.discipline ?? parsed?.discipline ?? ""
    if (
      location === currentLocation &&
      discipline === currentDiscipline &&
      args.type === doc.type
    ) {
      throw new Error(
        "That is the document's current filing — pick a different location, discipline, or type.",
      )
    }

    const versionRow = await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.id).eq("version", doc.currentVersion),
      )
      .unique()

    const namingCode = await allocateNamingCode(
      ctx,
      location,
      discipline,
      args.type,
    )
    const now = Date.now()

    const newId = await ctx.db.insert("documents", {
      namingCode,
      location,
      discipline,
      title: doc.title,
      type: args.type,
      status: "draft",
      currentVersion: 1,
      ownerId: doc.ownerId ?? userId,
      authorId: doc.authorId ?? userId,
      reviewerId: doc.reviewerId ?? null,
      approverId: doc.approverId ?? null,
      tags: doc.tags,
      updatedAt: now,
    })

    await ctx.db.insert("documentVersions", {
      documentId: newId,
      version: 1,
      bodyKind: versionRow?.bodyKind ?? "tiptap",
      bodyJson: versionRow?.bodyJson ?? null,
      pdfStorageId: versionRow?.pdfStorageId ?? null,
      publishedAt: now,
      signoffs: [{ role: "author", userId, at: now }],
    })

    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.id).eq("version", doc.currentVersion),
      )
      .collect()
    for (const c of chunks) {
      await ctx.db.insert("chunks", {
        documentId: newId,
        version: 1,
        seq: c.seq,
        text: c.text,
        pageOrSection: c.pageOrSection,
        embedding: null,
        embeddingModel: null,
      })
    }

    await syncDocumentAssetsFromBody(ctx, newId, versionRow?.bodyJson ?? null)

    await ctx.runMutation(internal.images.recomputeUsagesForVersion, {
      documentId: newId,
      documentVersion: 1,
      body: versionRow?.bodyJson ?? null,
    })

    await ctx.scheduler.runAfter(0, internal.ai.embed.embedMissingInternal, {
      documentId: newId,
    })

    if (args.archiveOld) {
      await ctx.db.patch(args.id, { status: "archived", updatedAt: now })
      await regenerateWikisForDocument(ctx, args.id, `archived ${doc.namingCode}`)
    }

    return { id: newId, namingCode }
  },
})

// Send a document back to draft (reviewer/approver requests changes).
export const revertToDraft = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")
    if (doc.status !== "in_review" && doc.status !== "approved")
      throw new Error("Only an in-review or approved document can be reverted.")
    await ctx.db.patch(args.id, { status: "draft", updatedAt: Date.now() })
  },
})

export const archive = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")
    await ctx.db.patch(args.id, {
      status: "archived",
      updatedAt: Date.now(),
    })
    await regenerateWikisForDocument(ctx, args.id, `archived ${doc.namingCode}`)
  },
})

export const relatedTo = query({
  args: { documentIds: v.array(v.id("documents")) },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    if (args.documentIds.length === 0) {
      return { otherDocs: [], assets: [], logs: [] }
    }
    const citedSet = new Set(args.documentIds.map(String))

    const assetIdSet = new Set<string>()
    for (const docId of args.documentIds) {
      const links = await ctx.db
        .query("documentAssets")
        .withIndex("by_documentId", (q) => q.eq("documentId", docId))
        .take(200)
      for (const l of links) assetIdSet.add(String(l.assetId))
    }
    const assetIds = Array.from(assetIdSet) as Id<"assets">[]
    const assets = (
      await Promise.all(assetIds.map((id) => ctx.db.get(id)))
    ).filter((a): a is Doc<"assets"> => a !== null)
    assets.sort((a, b) => a.code.localeCompare(b.code))

    const otherDocIdSet = new Set<string>()
    for (const aid of assetIds) {
      const links = await ctx.db
        .query("documentAssets")
        .withIndex("by_assetId", (q) => q.eq("assetId", aid))
        .take(200)
      for (const l of links) {
        const id = String(l.documentId)
        if (!citedSet.has(id)) otherDocIdSet.add(id)
      }
    }
    const otherDocIds = Array.from(otherDocIdSet) as Id<"documents">[]
    const otherDocs = (
      await Promise.all(otherDocIds.map((id) => ctx.db.get(id)))
    ).filter((d): d is Doc<"documents"> => d !== null && isPublished(d))
    otherDocs.sort((a, b) => a.title.localeCompare(b.title))

    const logs: Doc<"assetLogs">[] = []
    for (const aid of assetIds) {
      const rows = await ctx.db
        .query("assetLogs")
        .withIndex("by_assetId", (q) => q.eq("assetId", aid))
        .take(50)
      for (const r of rows) logs.push(r)
    }
    logs.sort((a, b) => a.code.localeCompare(b.code))

    return { otherDocs, assets, logs }
  },
})

export const remove = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")

    const versions = await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.id),
      )
      .take(500)
    for (const v of versions) {
      if (v.pdfStorageId) {
        try {
          await ctx.storage.delete(v.pdfStorageId)
        } catch {
          // best-effort; orphan file is harmless
        }
      }
      await ctx.db.delete(v._id)
    }

    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.id),
      )
      .take(5000)
    for (const c of chunks) await ctx.db.delete(c._id)

    const links = await ctx.db
      .query("documentAssets")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.id))
      .take(500)
    for (const l of links) await ctx.db.delete(l._id)

    const logRefs = await ctx.db
      .query("documentLogRefs")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.id),
      )
      .take(500)
    for (const r of logRefs) await ctx.db.delete(r._id)

    const usages = await ctx.db
      .query("imageUsages")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.id),
      )
      .take(2000)
    for (const u of usages) await ctx.db.delete(u._id)

    await ctx.db.delete(args.id)
    if (doc.liveVersion != null) {
      await regenerateWikisForDocument(ctx, args.id, `deleted ${doc.namingCode}`)
    }
  },
})
