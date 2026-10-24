import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"
import { ConvexError, v } from "convex/values"
import { internal } from "./_generated/api"
import { Doc, Id } from "./_generated/dataModel"
import { afterPublish } from "./lib/onPublish"
import { requireUser, requireUserId } from "./lib/auth"
import { allocateNamingCode, parseNamingCode } from "./naming"
import { walkBodyAssetIds } from "./lib/assetWalker"
import { regenerateWikisForDocument } from "./wikis"
import { isPublished, publishedVersion } from "./lib/published"
import { scheduleStamp } from "./manuals"
import { getVersion, quoteIn } from "./trainings"

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
  // A version without a TipTap body (a Wrapped manual's PDF) carries no asset
  // pills: its links are kept as they are (manuals.ts manages them).
  if (body == null) return
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

// A sign-off as people read it (CONTEXT.md: Checked in): the named Engineer
// who signed, with their role, falling back to the login account only for
// sign-offs recorded without a person.
export type SignerView = {
  role: "author" | "reviewer" | "approver"
  name: string | null
  title: string | null
  at: number
}

function signerResolver(ctx: QueryCtx) {
  const cache = new Map<string, { name: string | null; title: string | null }>()
  return async (s: {
    role: SignerView["role"]
    userId: Id<"users">
    at: number
    personId?: Id<"people">
  }): Promise<SignerView> => {
    const key = s.personId ?? s.userId
    if (!cache.has(key)) {
      const person = s.personId ? await ctx.db.get(s.personId) : null
      if (person) cache.set(key, { name: person.name, title: person.role })
      else {
        const u = await ctx.db.get(s.userId)
        cache.set(key, { name: u ? (u.name ?? u.email ?? null) : null, title: null })
      }
    }
    return { role: s.role, at: s.at, ...cache.get(key)! }
  }
}

/** The latest sign-off per role of one version, resolved to names. */
async function signersOf(
  ctx: QueryCtx,
  row: Doc<"documentVersions"> | null,
): Promise<SignerView[]> {
  if (!row) return []
  const resolve = signerResolver(ctx)
  const latest = new Map<string, NonNullable<Doc<"documentVersions">["signoffs"]>[number]>()
  for (const s of row.signoffs ?? []) latest.set(s.role, s)
  return await Promise.all([...latest.values()].map(resolve))
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
    // "In review" also finds a Published Document whose next version is in
    // review: that is the work a reviewer is looking for.
    if (args.status)
      docs = docs.filter(
        (d) =>
          effectiveStatus(d) === args.status ||
          (args.status === "in_review" && d.status === "in_review"),
      )
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

    // Master-list columns: owner, who approved the version in use, and when
    // it became effective. Names are the people who signed (check-in).
    const people = await ctx.db.query("people").take(500)
    const personName = new Map(people.map((p) => [String(p._id), p.name]))
    const userName = new Map<string, string | null>()
    async function nameOfUser(uid: Id<"users"> | null | undefined) {
      if (!uid) return null
      if (!userName.has(uid)) {
        const u = await ctx.db.get(uid)
        userName.set(uid, u ? (u.name ?? u.email ?? null) : null)
      }
      return userName.get(uid) ?? null
    }
    const metaByDoc: Record<
      string,
      {
        owner: string | null
        approvedBy: string | null
        effectiveAt: number | null
        archiveReason: string | null
        archivedAt: number | null
      }
    > = {}
    for (const d of docs) {
      const live = d.liveVersion ?? null
      const row =
        live != null
          ? await ctx.db
              .query("documentVersions")
              .withIndex("by_documentId_and_version", (q) =>
                q.eq("documentId", d._id).eq("version", live),
              )
              .unique()
          : null
      const approval = [...(row?.signoffs ?? [])].reverse().find((s) => s.role === "approver")
      const author = [...(row?.signoffs ?? [])].find((s) => s.role === "author")
      metaByDoc[d._id] = {
        owner:
          (d.ownerPersonId ? personName.get(String(d.ownerPersonId)) : null) ??
          (author?.personId ? personName.get(String(author.personId)) : null) ??
          (await nameOfUser(d.ownerId)),
        approvedBy: approval
          ? ((approval.personId ? personName.get(String(approval.personId)) : null) ??
            (await nameOfUser(approval.userId)))
          : null,
        effectiveAt: row?.publishedAt ?? null,
        archiveReason: d.archiveReason ?? null,
        archivedAt: d.archivedAt ?? null,
      }
    }

    return { docs, assetsByDoc, metaByDoc }
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
    const versionRow = async (n: number | undefined) =>
      n != null && n >= 1
        ? await ctx.db
            .query("documentVersions")
            .withIndex("by_documentId_and_version", (q) =>
              q.eq("documentId", args.id).eq("version", n),
            )
            .unique()
        : null
    // Sign-offs name the Engineer who gave them, from the version in use (or
    // the working version before a first publish).
    const serving = await versionRow(doc.liveVersion ?? doc.currentVersion)
    const signers = await signersOf(ctx, serving)
    const signer = (role: SignerView["role"]) => signers.find((s) => s.role === role) ?? null
    const label = (s: SignerView | null) =>
      s?.name ? (s.title ? `${s.name} (${s.title})` : s.name) : null
    const personOf = async (pid: Id<"people"> | null | undefined) =>
      pid ? await ctx.db.get(pid) : null
    const [ownerPerson, reviewerPerson, approverPerson] = await Promise.all([
      personOf(doc.ownerPersonId),
      personOf(doc.reviewerPersonId),
      personOf(doc.approverPersonId),
    ])
    const roles = {
      owner: ownerPerson?.name ?? signer("author")?.name ?? (await nameOf(doc.ownerId)),
      author: label(signer("author")),
      reviewer: label(signer("reviewer")),
      approver: label(signer("approver")),
    }
    // The people named for the working version (Owner, Reviewer, Approver),
    // and the authors of it: four-eyes is checked against these on the server.
    const working = doc.currentVersion === serving?.version ? serving : await versionRow(doc.currentVersion)
    const assigned = {
      owner: ownerPerson ? { _id: ownerPerson._id, name: ownerPerson.name } : null,
      reviewer: reviewerPerson ? { _id: reviewerPerson._id, name: reviewerPerson.name } : null,
      approver: approverPerson ? { _id: approverPerson._id, name: approverPerson.name } : null,
      authorPersonIds: (working?.signoffs ?? [])
        .filter((s) => s.role === "author" && s.personId)
        .map((s) => s.personId as Id<"people">),
      reviewedByPersonId:
        [...(working?.signoffs ?? [])].reverse().find((s) => s.role === "reviewer")?.personId ?? null,
      changeNote: working?.changeNote ?? null,
    }
    const replacedBy = doc.replacedById ? await ctx.db.get(doc.replacedById) : null
    const archivedBy = doc.archivedByPersonId ? await ctx.db.get(doc.archivedByPersonId) : null
    // Created: when the first version was started, which can predate this
    // row (seeded or imported history). Effective: when the version in use
    // was published.
    const first = serving?.version === 1 ? serving : await versionRow(1)
    const firstAuthored = first?.signoffs?.find((s) => s.role === "author")?.at
    const createdAt = Math.min(
      doc._creationTime,
      firstAuthored ?? Infinity,
      first?.publishedAt ?? Infinity,
    )
    const live =
      doc.liveVersion == null
        ? null
        : doc.liveVersion === serving?.version
          ? serving
          : await versionRow(doc.liveVersion)
    return {
      doc,
      assets,
      roles,
      assigned,
      createdAt,
      effectiveAt: live?.publishedAt ?? null,
      withdrawal:
        doc.status === "archived"
          ? {
              reason: doc.archiveReason ?? null,
              at: doc.archivedAt ?? null,
              by: archivedBy?.name ?? null,
              replacedBy: replacedBy
                ? { _id: replacedBy._id, namingCode: replacedBy.namingCode, title: replacedBy.title }
                : null,
            }
          : null,
    }
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
    // Each version with its sign-offs resolved to the named Engineers.
    const resolve = signerResolver(ctx)
    return await Promise.all(
      versions.map(async (row) => ({
        ...row,
        signers: await Promise.all((row.signoffs ?? []).map(resolve)),
      })),
    )
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
    // The checked-in person writing it (the author), and the people named
    // for Owner, Reviewer and Approver.
    personId: v.optional(v.id("people")),
    ownerPersonId: v.optional(v.union(v.id("people"), v.null())),
    reviewerPersonId: v.optional(v.union(v.id("people"), v.null())),
    approverPersonId: v.optional(v.union(v.id("people"), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const author = args.personId ? await ctx.db.get(args.personId) : null

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
      ownerPersonId:
        args.ownerPersonId !== undefined
          ? args.ownerPersonId
          : author?.kind === "engineer"
            ? author._id
            : null,
      reviewerPersonId: args.reviewerPersonId ?? null,
      approverPersonId: args.approverPersonId ?? null,
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
      signoffs: [{ role: "author", userId, at: now, ...(author ? { personId: author._id } : {}) }],
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
    // The checked-in person saving (recorded as an author of this version),
    // and the people named for the roles.
    personId: v.optional(v.id("people")),
    ownerPersonId: v.optional(v.union(v.id("people"), v.null())),
    reviewerPersonId: v.optional(v.union(v.id("people"), v.null())),
    approverPersonId: v.optional(v.union(v.id("people"), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")

    const now = Date.now()
    if (args.ownerPersonId !== undefined || args.reviewerPersonId !== undefined || args.approverPersonId !== undefined)
      await checkRolePeople(ctx, args)

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
    if (args.ownerPersonId !== undefined) patch.ownerPersonId = args.ownerPersonId
    if (args.reviewerPersonId !== undefined) patch.reviewerPersonId = args.reviewerPersonId
    if (args.approverPersonId !== undefined) patch.approverPersonId = args.approverPersonId
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

    // Upsert the target version's content row.
    const existing = await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.id).eq("version", targetVersion),
      )
      .unique()

    // Review and approval apply to the exact content that was reviewed. A
    // change to the text or title after that sends the edition back to draft
    // and clears its review sign-offs, so it cannot be published unreviewed.
    const reviewed = doc.status === "in_review" || doc.status === "approved"
    // A Wrapped manual's body is the supplier PDF: it is never edited here
    // (only replaced through manuals.replacePdf), so its PDF, page chunks and
    // asset links are left untouched and only the title can change.
    const pdfBody = existing?.bodyKind === "pdf"
    const changed =
      args.title.trim() !== doc.title ||
      (!pdfBody &&
        JSON.stringify(existing?.bodyJson ?? null) !== JSON.stringify(args.body))
    if (reviewed && changed) {
      patch.status = "draft"
      patch.history = [
        ...(doc.history ?? []),
        {
          kind: "sent_back" as const,
          at: now,
          personId: args.personId ?? null,
          version: targetVersion,
          note: "Edited after review: back to draft",
        },
      ]
      if (existing) {
        await ctx.db.patch(existing._id, {
          signoffs: (existing.signoffs ?? []).filter((s) => s.role === "author"),
        })
      }
    }

    // Whoever changes the text is an author of this version: four-eyes
    // checks the reviewer and approver against every author.
    if (existing && changed && args.personId) {
      const fresh = await ctx.db.get(existing._id)
      const signoffs = fresh?.signoffs ?? []
      if (!signoffs.some((s) => s.role === "author" && s.personId === args.personId)) {
        await ctx.db.patch(existing._id, {
          signoffs: [...signoffs, { role: "author", userId, at: now, personId: args.personId }],
        })
      }
    }

    await ctx.db.patch(args.id, patch)

    if (existing && pdfBody) {
      if (doc.origin === "wrapped" && (changed || patch.status !== undefined))
        await scheduleStamp(ctx, args.id, [targetVersion])
      return { version: targetVersion }
    }

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
        signoffs: [{ role: "author", userId, at: now, ...(args.personId ? { personId: args.personId } : {}) }],
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

    // Asset links follow the Published version: while a Published document
    // has a draft edition, its links change only when that edition publishes.
    if (doc.liveVersion == null) {
      await syncDocumentAssetsFromBody(ctx, args.id, args.body)
    }

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
  personId?: Id<"people">,
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
    signoffs: [...signoffs, { role, userId, at: Date.now(), ...(personId ? { personId } : {}) }],
  })
}

// ---- Four-eyes ------------------------------------------------------------------
// People act through check-in (CONTEXT.md). The reviewer is never an author of
// the version, and the approver is never its reviewer, compared by personId.

/** The version row being worked on (the working edition). */
async function workingRow(ctx: QueryCtx, doc: Doc<"documents">) {
  return await ctx.db
    .query("documentVersions")
    .withIndex("by_documentId_and_version", (q) =>
      q.eq("documentId", doc._id).eq("version", doc.currentVersion),
    )
    .unique()
}

function authorsOf(row: Doc<"documentVersions"> | null): Set<string> {
  return new Set(
    (row?.signoffs ?? [])
      .filter((s) => s.role === "author" && s.personId)
      .map((s) => String(s.personId)),
  )
}

/** Owner, Reviewer and Approver are Engineers, and Reviewer is not Approver. */
async function checkRolePeople(
  ctx: MutationCtx,
  roles: {
    ownerPersonId?: Id<"people"> | null
    reviewerPersonId?: Id<"people"> | null
    approverPersonId?: Id<"people"> | null
  },
) {
  for (const [label, pid] of [
    ["Owner", roles.ownerPersonId],
    ["Reviewer", roles.reviewerPersonId],
    ["Approver", roles.approverPersonId],
  ] as const) {
    if (!pid) continue
    const p = await ctx.db.get(pid)
    if (!p || p.kind !== "engineer") throw new ConvexError(`The ${label} must be an Engineer.`)
  }
  if (roles.reviewerPersonId && roles.reviewerPersonId === roles.approverPersonId)
    throw new ConvexError("The reviewer and the approver must be two different Engineers.")
}

// draft → in_review. Requires a reviewer. Who reviews and approves is chosen
// here; for v2 and later the change note "What changed and why" is required.
export const submitForReview = mutation({
  args: {
    id: v.id("documents"),
    personId: v.optional(v.id("people")),
    reviewerPersonId: v.optional(v.id("people")),
    approverPersonId: v.optional(v.id("people")),
    changeNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")
    if (doc.status !== "draft")
      throw new ConvexError("Only a draft can be submitted for review.")
    const reviewerPersonId = args.reviewerPersonId ?? doc.reviewerPersonId ?? null
    const approverPersonId = args.approverPersonId ?? doc.approverPersonId ?? null
    if (!reviewerPersonId && !doc.reviewerId)
      throw new ConvexError("Choose who reviews it before submitting for review.")
    await checkRolePeople(ctx, { reviewerPersonId, approverPersonId })

    const row = await workingRow(ctx, doc)
    const authors = authorsOf(row)
    if (args.personId) authors.add(String(args.personId))
    if (reviewerPersonId && authors.has(String(reviewerPersonId)))
      throw new ConvexError("You wrote this version. Another Engineer must review it.")

    const note = args.changeNote?.trim() || row?.changeNote?.trim() || ""
    if (doc.liveVersion != null && !note)
      throw new ConvexError("Write what changed and why before submitting a new version.")

    const now = Date.now()
    if (row) {
      const signoffs = row.signoffs ?? []
      const addAuthor =
        args.personId && !signoffs.some((s) => s.role === "author" && s.personId === args.personId)
      await ctx.db.patch(row._id, {
        ...(note ? { changeNote: note } : {}),
        ...(addAuthor
          ? { signoffs: [...signoffs, { role: "author" as const, userId, at: now, personId: args.personId! }] }
          : {}),
      })
    }
    await ctx.db.patch(args.id, {
      status: "in_review",
      updatedAt: now,
      reviewerPersonId,
      approverPersonId,
      history: [
        ...(doc.history ?? []),
        { kind: "submitted", at: now, personId: args.personId ?? null, version: doc.currentVersion, note: note || null },
      ],
    })
    if (doc.origin === "wrapped") await scheduleStamp(ctx, doc._id, [doc.currentVersion])
  },
})

/** Approving and publishing are sign-offs: they need a checked-in Engineer. */
export async function requireEngineer(
  ctx: import("./_generated/server").MutationCtx,
  personId: Id<"people">,
) {
  const person = await ctx.db.get(personId)
  if (!person || person.kind !== "engineer")
    throw new ConvexError("Check in as an Engineer to sign this off.")
  return person
}

async function nameOfPerson(ctx: QueryCtx, pid: Id<"people"> | null | undefined) {
  if (!pid) return "the named Engineer"
  return (await ctx.db.get(pid))?.name ?? "the named Engineer"
}

/** Why this person cannot give the review sign-off now, or null (four-eyes). */
async function approveBlocker(
  ctx: QueryCtx,
  doc: Doc<"documents">,
  personId: Id<"people">,
): Promise<string | null> {
  if (doc.status !== "in_review") return "Only a document in review can be approved."
  if (!doc.approverId && !doc.approverPersonId) return "Choose who approves it before approving."
  if (doc.reviewerPersonId && doc.reviewerPersonId === doc.approverPersonId)
    return "The reviewer and the approver must be two different Engineers."
  if (doc.approverPersonId && personId === doc.approverPersonId)
    return "You are the approver of this version. Another Engineer must review it."
  if (doc.reviewerPersonId && personId !== doc.reviewerPersonId)
    return `Waiting for ${await nameOfPerson(ctx, doc.reviewerPersonId)}, the named reviewer.`
  const row = await workingRow(ctx, doc)
  if (authorsOf(row).has(String(personId))) return "You wrote this version. Another Engineer must review it."
  return null
}

// in_review → approved. The review sign-off: only the named reviewer gives
// it, never an author of the version and never the named approver.
export const approve = mutation({
  args: { id: v.id("documents"), personId: v.id("people") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await requireEngineer(ctx, args.personId)
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")
    const blocker = await approveBlocker(ctx, doc, args.personId)
    if (blocker) throw new ConvexError(blocker)
    await ctx.db.patch(args.id, { status: "approved", updatedAt: Date.now() })
    await recordSignoff(ctx, doc, "reviewer", userId, args.personId)
    if (doc.origin === "wrapped") await scheduleStamp(ctx, doc._id, [doc.currentVersion])
  },
})

// approved → published. This edition becomes the live one served to operators,
// QR, and RAG (liveVersion). If a previous edition was live, it is replaced here.
// For v2 and later the publisher must decide whether it is a Significant change;
// it is forced when a passage a Training cites is gone.
export const publish = mutation({
  args: {
    id: v.id("documents"),
    personId: v.id("people"),
    // CONTEXT.md: Significant change. Required for a new version of a
    // document that was Published before; ignored for a first publish.
    significantChange: v.optional(v.boolean()),
    changeNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await requireEngineer(ctx, args.personId)
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")
    if (doc.status !== "approved")
      throw new ConvexError("A document must be approved before publishing.")
    if (doc.approverPersonId && args.personId !== doc.approverPersonId)
      throw new ConvexError(`Waiting for ${await nameOfPerson(ctx, doc.approverPersonId)}, the named approver.`)
    const row = await workingRow(ctx, doc)
    const reviewer = [...(row?.signoffs ?? [])].reverse().find((s) => s.role === "reviewer")
    if (reviewer?.personId && reviewer.personId === args.personId)
      throw new ConvexError("You reviewed this version. Another Engineer must approve it.")
    if (authorsOf(row).has(String(args.personId)))
      throw new ConvexError("You wrote this version. Another Engineer must approve it.")

    let significantChange = false
    if (doc.liveVersion != null) {
      if (args.significantChange === undefined)
        throw new ConvexError("Choose what kind of change this is before publishing.")
      const impact = await computeImpact(ctx, doc)
      if (impact.forcedSignificant && !args.significantChange)
        throw new ConvexError(
          "A passage that a Training cites was removed, so this is a Significant change.",
        )
      significantChange = args.significantChange
    }
    await publishApproved(ctx, doc, userId, args.personId, {
      significantChange,
      changeNote: args.changeNote?.trim() || row?.changeNote?.trim() || null,
    })
  },
})

// ---- Publish impact -------------------------------------------------------------

const NUMBER_RE = /\d+(?:[.,]\d+)?\s*(?:°\s?[CF]|%|[a-zA-Zµ/]+)?/g
const HAZARD_RE = /\b(warning|danger|caution|waarschuwing|gevaar)\b/i

/** The text of each block (paragraph, heading, list item, cell) of a TipTap body. */
function bodyBlocks(body: unknown): string[] {
  const out: string[] = []
  type Node = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Node[] }
  const textOf = (n: Node): string => n.text ?? (n.content ?? []).map(textOf).join("")
  const clean = (t: string) => t.replace(/\s+/g, " ").trim()
  const walk = (n: Node | null | undefined) => {
    if (!n || typeof n !== "object") return
    // A safety callout counts as one passage, labelled with its kind.
    if (n.type === "callout") {
      const t = clean(textOf(n))
      if (t) out.push(`${String(n.attrs?.kind ?? "note").toUpperCase()}: ${t}`)
      return
    }
    // A block that holds text directly (paragraph, heading, step, cell).
    if ((n.content ?? []).some((c) => c.type === "text")) {
      const t = clean(textOf(n))
      if (t) out.push(t)
      return
    }
    for (const c of n.content ?? []) walk(c)
  }
  walk(body as Node)
  return out
}

function numberTokens(texts: string[]): Set<string> {
  const out = new Set<string>()
  for (const t of texts) for (const m of t.matchAll(NUMBER_RE)) out.add(m[0].replace(/\s+/g, "").toLowerCase())
  return out
}

function sameSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

/**
 * What publishing the working version does: Trainings that cite this
 * Document go back to review, holders of linked Skills are flagged for
 * re-training (both only for a Significant change), and Wikis are rebuilt.
 */
async function computeImpact(ctx: QueryCtx, doc: Doc<"documents">) {
  const live = doc.liveVersion ?? null
  const isNewVersion = live != null && doc.currentVersion > live
  // Compare the version bodies, not the passages: passages are re-cut on
  // every save, so the same text can be split differently.
  const textsOf = async (version: number): Promise<string[]> => {
    const row = await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) => q.eq("documentId", doc._id).eq("version", version))
      .unique()
    if (row?.bodyKind === "tiptap") return bodyBlocks(row.bodyJson)
    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_documentId_and_version", (q) => q.eq("documentId", doc._id).eq("version", version))
      .take(2000)
    return chunks.map((c) => c.text)
  }
  const curTexts = await textsOf(doc.currentVersion)
  const liveTexts = isNewVersion && live != null ? await textsOf(live) : []
  const curWhole = curTexts.join(" ")

  const trainings: {
    _id: Id<"trainings">
    code: string
    title: string
    passageRemoved: boolean
    removedQuotes: string[]
  }[] = []
  for (const t of await ctx.db.query("trainings").take(1000)) {
    if (t.status === "archived") continue
    const row = await getVersion(ctx, t._id, t.liveVersion ?? t.currentVersion)
    const cited = (row?.objectives ?? []).filter((o) => o.documentId === doc._id)
    if (cited.length === 0) continue
    const removedQuotes = isNewVersion
      ? cited.filter((o) => o.quote.trim() && !quoteIn(o.quote, curWhole)).map((o) => o.quote)
      : []
    trainings.push({ _id: t._id, code: t.code, title: t.title, passageRemoved: removedQuotes.length > 0, removedQuotes })
  }

  const trainingIds = new Set(trainings.map((t) => String(t._id)))
  const skills = (await ctx.db.query("skills").take(500)).filter(
    (s) => s.documentIds.includes(doc._id) || s.trainingIds.some((id) => trainingIds.has(String(id))),
  )
  const holderIds = new Set<string>()
  const skillRows: { _id: Id<"skills">; name: string; holders: number }[] = []
  for (const s of skills) {
    const rows = await ctx.db
      .query("skillLevels")
      .withIndex("by_skillId", (q) => q.eq("skillId", s._id))
      .take(1000)
    const held = rows.filter((r) => r.level >= 1)
    held.forEach((r) => holderIds.add(String(r.personId)))
    skillRows.push({ _id: s._id, name: s.name, holders: held.length })
  }

  const wikis = await wikisCiting(ctx, doc._id)

  const reasons: string[] = []
  if (isNewVersion) {
    if (!sameSet(numberTokens(liveTexts), numberTokens(curTexts)))
      reasons.push("A number or unit changed.")
    const hazards = (texts: string[]) => new Set(texts.filter((t) => HAZARD_RE.test(t)).map((t) => t.trim()))
    if (!sameSet(hazards(liveTexts), hazards(curTexts)))
      reasons.push("A WARNING, DANGER or CAUTION passage changed.")
  }
  const forcedSignificant = trainings.some((t) => t.passageRemoved)
  if (forcedSignificant) reasons.unshift("A passage that a Training cites was removed.")

  return {
    isNewVersion,
    liveVersion: live,
    version: doc.currentVersion,
    trainings,
    skills: skillRows,
    holders: holderIds.size,
    wikis,
    forcedSignificant,
    suggestedSignificant: forcedSignificant || reasons.length > 0,
    reasons,
  }
}

/** Wikis built on (or scoped to) this Document. */
async function wikisCiting(ctx: QueryCtx, documentId: Id<"documents">) {
  const all = await ctx.db.query("wikis").take(500)
  return all
    .filter(
      (w) =>
        w.sources.some((s) => s.documentId === documentId) || w.scope.documentIds.includes(documentId),
    )
    .map((w) => ({ _id: w._id, title: w.title, status: w.status }))
}

/** The impact preview shown in the publish dialog. */
export const publishImpact = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc) return null
    return await computeImpact(ctx, doc)
  },
})

/** The rail card "In Wikis (N)" on a Document. */
export const wikisForDocument = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    return await wikisCiting(ctx, args.id)
  },
})

/** "Made from Captures": the Capture set and Captures a Draft was made from. */
export const captureSourcesOf = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc || doc.origin !== "capture") return null
    let setId = doc.captureSources?.setId ?? null
    let captureIds = doc.captureSources?.captureIds ?? []
    if (!setId) {
      // Fall back to the set that lists this Draft (captures-backend writes it).
      const sets = await ctx.db.query("captureSets").take(500)
      const owner = sets.find((s) => (s.draftDocumentIds ?? []).includes(doc._id))
      if (owner) {
        setId = owner._id
        if (captureIds.length === 0) captureIds = owner.captureIds
      }
    }
    const set = setId ? await ctx.db.get(setId) : null
    const captures = []
    for (const id of captureIds) {
      const c = await ctx.db.get(id)
      if (!c) continue
      const author = await ctx.db.get(c.authorId)
      captures.push({ _id: c._id, title: c.title, author: author?.name ?? null, at: c.handedInAt ?? c.startedAt })
    }
    return { set: set ? { _id: set._id, title: set.title } : null, captures }
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
  personId?: Id<"people">,
  change?: { significantChange: boolean; changeNote: string | null },
) {
  const now = Date.now()
  const previousLive = doc.liveVersion ?? null
  // A first publish is never a "change"; only a new version can be significant.
  const significantChange = previousLive != null && (change?.significantChange ?? false)
  await ctx.db.patch(doc._id, {
    status: "published",
    liveVersion: doc.currentVersion,
    updatedAt: now,
    nextReviewAt: addMonths(now, doc.reviewIntervalMonths ?? DEFAULT_REVIEW_MONTHS),
    lastReviewedAt: now,
  })
  await recordSignoff(ctx, doc, "approver", userId, personId)
  // The version row is created when its draft starts; stamp the real
  // publication date so history, PDF exports and Wiki provenance show when
  // this version became the truth, not when its draft was begun.
  const versionRow = await ctx.db
    .query("documentVersions")
    .withIndex("by_documentId_and_version", (q) =>
      q.eq("documentId", doc._id).eq("version", doc.currentVersion),
    )
    .unique()
  if (versionRow)
    await ctx.db.patch(versionRow._id, {
      publishedAt: now,
      significantChange,
      changeNote: change?.changeNote ?? null,
    })
  // Asset links now follow the newly Published body.
  if (versionRow) await syncDocumentAssetsFromBody(ctx, doc._id, versionRow.bodyJson)

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

  // Everything else that follows a publish: stamping a Wrapped manual,
  // Findings, the Consistency check, Trainings and Skills.
  await afterPublish(ctx, {
    documentId: doc._id,
    version: doc.currentVersion,
    previousVersion: previousLive,
    significantChange,
  })
}

// Periodic review outcome "still valid": the Published version is confirmed
// as-is and the next review moves one interval forward. Changing the content
// goes through createNewVersion instead.
export const confirmReview = mutation({
  // Confirming a review is a sign-off, so it produces proof: the person must be
  // checked in, and must be an Engineer (CONTEXT.md: Checked in, Engineer).
  args: { id: v.id("documents"), personId: v.id("people") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const person = await ctx.db.get(args.personId)
    if (!person || person.kind !== "engineer")
      throw new Error("Check in as an Engineer to confirm a periodic review.")
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
        reviewConfirmations: [
          ...(row.reviewConfirmations ?? []),
          { userId, at: now, personId: args.personId },
        ],
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
    // The named Engineer (with their role); the login account only when a
    // sign-off was recorded without a person.
    const resolve = signerResolver(ctx)
    const byLine = (s: SignerView) => (s.name && s.title ? `${s.name} (${s.title})` : s.name)
    const approval = [...(row.signoffs ?? [])].reverse().find((s) => s.role === "approver")
    const events: { kind: "published" | "confirmed"; at: number; by: string | null }[] = [
      {
        kind: "published",
        at: approval?.at ?? row.publishedAt,
        by: approval ? byLine(await resolve(approval)) : null,
      },
    ]
    for (const c of row.reviewConfirmations ?? []) {
      events.push({
        kind: "confirmed",
        at: c.at,
        by: byLine(await resolve({ ...c, role: "reviewer" })),
      })
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
  args: { id: v.id("documents"), personId: v.optional(v.id("people")) },
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

    const wrapped = doc.origin === "wrapped" && liveRow?.bodyKind === "pdf"
    await ctx.db.insert("documentVersions", {
      documentId: args.id,
      version: newVersion,
      bodyKind: liveRow?.bodyKind ?? "tiptap",
      bodyJson: liveRow?.bodyJson ?? null,
      // A Wrapped manual's new version starts from the same supplier original
      // and gets its own stamp ("Draft vN"), so it never shares the live copy.
      pdfStorageId: wrapped ? null : (liveRow?.pdfStorageId ?? null),
      ...(wrapped
        ? {
            sourcePdfStorageId: liveRow?.sourcePdfStorageId ?? null,
            pdfPageCount: liveRow?.pdfPageCount,
            stampLabel: null,
          }
        : {}),
      publishedAt: now,
      signoffs: [{ role: "author", userId, at: now, ...(args.personId ? { personId: args.personId } : {}) }],
    })
    if (wrapped) await scheduleStamp(ctx, args.id, [newVersion])

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

    const wrapped = doc.origin === "wrapped" && versionRow?.bodyKind === "pdf"
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
      ...(wrapped ? { origin: "wrapped" as const, supplier: doc.supplier ?? null } : {}),
    })

    // A Wrapped manual keeps its supplier original and gets a fresh stamp with
    // the new naming code. The stored file is copied (by manuals.copySource,
    // which then stamps), never shared, so deleting either Document cannot
    // break the other.
    await ctx.db.insert("documentVersions", {
      documentId: newId,
      version: 1,
      bodyKind: versionRow?.bodyKind ?? "tiptap",
      bodyJson: versionRow?.bodyJson ?? null,
      pdfStorageId: wrapped ? null : (versionRow?.pdfStorageId ?? null),
      ...(wrapped
        ? {
            sourcePdfStorageId: null,
            pdfPageCount: versionRow?.pdfPageCount,
            stampLabel: null,
          }
        : {}),
      publishedAt: now,
      signoffs: [{ role: "author", userId, at: now }],
    })
    if (wrapped) {
      const links = await ctx.db
        .query("documentAssets")
        .withIndex("by_documentId", (q) => q.eq("documentId", args.id))
        .take(500)
      for (const l of links)
        await ctx.db.insert("documentAssets", { documentId: newId, assetId: l.assetId })
      if (versionRow?.sourcePdfStorageId)
        await ctx.scheduler.runAfter(0, internal.manuals.copySource, {
          documentId: newId,
          version: 1,
          fromStorageId: versionRow.sourcePdfStorageId,
        })
    }

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
      await ctx.db.patch(args.id, {
        status: "archived",
        updatedAt: now,
        archiveReason: `Refiled as ${namingCode}`,
        archivedAt: now,
        replacedById: newId,
        history: [
          ...(doc.history ?? []),
          {
            kind: "withdrawn",
            at: now,
            personId: null,
            version: doc.liveVersion ?? doc.currentVersion,
            note: `Refiled as ${namingCode}`,
          },
        ],
      })
      await regenerateWikisForDocument(ctx, args.id, `archived ${doc.namingCode}`)
      await ctx.scheduler.runAfter(0, internal.findings.resolveStale, {})
    }

    return { id: newId, namingCode }
  },
})

// Send a document back to draft (reviewer/approver requests changes).
export const revertToDraft = mutation({
  args: {
    id: v.id("documents"),
    personId: v.optional(v.id("people")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")
    if (doc.status !== "in_review" && doc.status !== "approved")
      throw new ConvexError("Only an in-review or approved document can be sent back to draft.")
    const now = Date.now()
    await ctx.db.patch(args.id, {
      status: "draft",
      updatedAt: now,
      history: [
        ...(doc.history ?? []),
        {
          kind: "sent_back",
          at: now,
          personId: args.personId ?? null,
          version: doc.currentVersion,
          note: args.reason?.trim() || null,
        },
      ],
    })
    if (doc.origin === "wrapped") await scheduleStamp(ctx, doc._id, [doc.currentVersion])
  },
})

/**
 * A withdrawn Document can no longer be trusted: Trainings built on it go back
 * to review with the reason, so nobody is trained on withdrawn knowledge.
 */
async function flagTrainingsForWithdrawal(ctx: MutationCtx, doc: Doc<"documents">, reason: string) {
  for (const t of await ctx.db.query("trainings").take(1000)) {
    if (t.status === "archived") continue
    const row = await getVersion(ctx, t._id, t.liveVersion ?? t.currentVersion)
    if (!row?.objectives.some((o) => o.documentId === doc._id)) continue
    await ctx.db.patch(t._id, { needsReview: true, needsReviewReason: reason, updatedAt: Date.now() })
  }
}

/** Why this withdrawal cannot happen, or null: an Engineer and a reason are required. */
async function withdrawBlocker(
  ctx: QueryCtx,
  doc: Doc<"documents">,
  args: { personId?: Id<"people">; reason?: string; replacedById?: Id<"documents"> | null },
): Promise<string | null> {
  if (!args.personId) return "Check in as an Engineer to withdraw a document."
  const person = await ctx.db.get(args.personId)
  if (!person || person.kind !== "engineer") return "Check in as an Engineer to withdraw a document."
  if (!args.reason?.trim()) return "Write why this document is withdrawn."
  if (doc.status === "archived") return `${doc.namingCode} is already withdrawn.`
  if (args.replacedById) {
    if (args.replacedById === doc._id) return "A document cannot replace itself."
    if (!(await ctx.db.get(args.replacedById))) return "The replacing document was not found."
  }
  return null
}

/**
 * Document-control checks, run against the dev data without writing:
 * `npx convex run documents:controlSelfTest`. Each line says what was
 * tried and the refusal the server gives (null would mean it was allowed).
 */
export const controlSelfTest = internalQuery({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query("documents").take(500)
    const people = await ctx.db.query("people").take(200)
    const engineers = people.filter((p) => p.kind === "engineer")
    const published = docs.find((d) => d.liveVersion != null && d.status !== "archived")
    if (!published || engineers.length < 2) return { error: "Seed data missing" }
    const [a, b] = engineers
    // An in-review document whose reviewer is also named as approver.
    const sameReviewer: Doc<"documents"> = {
      ...published,
      status: "in_review",
      reviewerPersonId: a._id,
      approverPersonId: a._id,
    }
    const results = {
      removePublished: await deleteBlocker(ctx, published),
      archiveAnonymous: await withdrawBlocker(ctx, published, { reason: "Line rebuilt" }),
      archiveEngineerNoReason: await withdrawBlocker(ctx, published, { personId: a._id, reason: "  " }),
      archiveEngineerWithReason: await withdrawBlocker(ctx, published, { personId: a._id, reason: "Line rebuilt" }),
      approveApproverIsReviewer: await approveBlocker(ctx, sameReviewer, a._id),
      approveByApprover: await approveBlocker(
        ctx,
        { ...published, status: "in_review", reviewerPersonId: a._id, approverPersonId: b._id },
        b._id,
      ),
    }
    // The publish impact of every working draft of a Published document.
    const drafts = []
    for (const d of docs.filter((x) => x.liveVersion != null && x.currentVersion > x.liveVersion)) {
      const i = await computeImpact(ctx, d)
      drafts.push({
        document: d.namingCode,
        forcedSignificant: i.forcedSignificant,
        reasons: i.reasons,
        removed: i.trainings.flatMap((t) => t.removedQuotes.map((q) => `${t.code}: ${q.slice(0, 80)}`)),
      })
    }
    return { document: published.namingCode, results, drafts }
  },
})

// Withdraw a Document (status "archived"). A sign-off: a checked-in Engineer
// with a reason. Optionally names the Document that replaces it.
export const archive = mutation({
  args: {
    id: v.id("documents"),
    personId: v.optional(v.id("people")),
    reason: v.optional(v.string()),
    replacedById: v.optional(v.union(v.id("documents"), v.null())),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")
    const blocker = await withdrawBlocker(ctx, doc, args)
    if (blocker) throw new ConvexError(blocker)
    const person = (await ctx.db.get(args.personId!))!
    const reason = args.reason!.trim()
    const now = Date.now()
    await ctx.db.patch(args.id, {
      status: "archived",
      updatedAt: now,
      archivedByPersonId: person._id,
      archiveReason: reason,
      archivedAt: now,
      replacedById: args.replacedById ?? null,
      history: [
        ...(doc.history ?? []),
        { kind: "withdrawn", at: now, personId: person._id, version: doc.liveVersion ?? doc.currentVersion, note: reason },
      ],
    })
    await flagTrainingsForWithdrawal(ctx, doc, `${doc.namingCode} was withdrawn: ${reason}`)
    // Every copy of an archived Wrapped manual says it is not for use.
    if (doc.origin === "wrapped")
      await scheduleStamp(ctx, doc._id, [doc.liveVersion, doc.currentVersion])
    await regenerateWikisForDocument(ctx, args.id, `archived ${doc.namingCode}`)
    // Findings on an archived document close now, not at the next check.
    await ctx.scheduler.runAfter(0, internal.findings.resolveStale, {})
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

/**
 * Why a Document cannot be deleted permanently, or null when it can. Only a
 * draft that was never Published and that nothing cites may go: everything
 * else is withdrawn instead, so the record stays (ISO 9001 7.5.3).
 */
async function deleteBlocker(ctx: QueryCtx, doc: Doc<"documents">): Promise<string | null> {
  const versions = await ctx.db
    .query("documentVersions")
    .withIndex("by_documentId_and_version", (q) => q.eq("documentId", doc._id))
    .take(500)
  const everPublished =
    doc.liveVersion != null ||
    doc.status === "published" ||
    versions.some((row) => (row.signoffs ?? []).some((s) => s.role === "approver"))
  if (everPublished)
    return `${doc.namingCode} was Published, so it stays on record. Withdraw it instead.`
  for (const t of await ctx.db.query("trainings").take(1000)) {
    const row = await getVersion(ctx, t._id, t.currentVersion)
    if (row?.objectives.some((o) => o.documentId === doc._id))
      return `Training ${t.code} cites ${doc.namingCode}. Withdraw it instead.`
  }
  const wikis = await wikisCiting(ctx, doc._id)
  if (wikis.length > 0) return `The Wiki "${wikis[0].title}" uses ${doc.namingCode}. Withdraw it instead.`
  const skill = (await ctx.db.query("skills").take(500)).find((s) => s.documentIds.includes(doc._id))
  if (skill) return `The Skill "${skill.name}" is linked to ${doc.namingCode}. Withdraw it instead.`
  const citingDraft = (await ctx.db.query("documents").take(500)).find((d) => d.replacedById === doc._id)
  if (citingDraft) return `${citingDraft.namingCode} names ${doc.namingCode} as its replacement.`
  return null
}

/** Whether "Delete permanently" is offered for a Document, and why not. */
export const deletability = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc) return null
    const blocker = await deleteBlocker(ctx, doc)
    return { deletable: blocker == null, reason: blocker }
  },
})

export const remove = mutation({
  args: { id: v.id("documents"), personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    if (!args.personId) throw new ConvexError("Check in as an Engineer to delete a document.")
    const person = await ctx.db.get(args.personId)
    if (!person || person.kind !== "engineer")
      throw new ConvexError("Check in as an Engineer to delete a document.")
    const doc = await ctx.db.get(args.id)
    if (!doc) throw new Error("Document not found")
    const blocker = await deleteBlocker(ctx, doc)
    if (blocker) throw new ConvexError(blocker)

    const versions = await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.id),
      )
      .take(500)
    // Versions can share a file (a Wrapped manual's supplier original), so
    // each stored file is deleted once.
    const files = new Set<Id<"_storage">>()
    for (const v of versions) {
      if (v.pdfStorageId) files.add(v.pdfStorageId)
      if (v.sourcePdfStorageId) files.add(v.sourcePdfStorageId)
      await ctx.db.delete(v._id)
    }
    for (const f of files) {
      try {
        await ctx.storage.delete(f)
      } catch {
        // best-effort; orphan file is harmless
      }
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
    await ctx.scheduler.runAfter(0, internal.findings.resolveStale, {})
    if (doc.liveVersion != null) {
      await regenerateWikisForDocument(ctx, args.id, `deleted ${doc.namingCode}`)
    }
  },
})

// Next periodic review per Published Document, for the library's "Next
// review" column. Documents without a version in use have none.
export const nextReviews = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const docs = await ctx.db.query("documents").take(500)
    const out: Record<string, number | null> = {}
    for (const d of docs) out[d._id] = isPublished(d) ? (d.nextReviewAt ?? null) : null
    return out
  },
})
