// Captures (CONTEXT.md "Capturing work on the floor", docs/adr/0005).
//
// An Operator starts a Capture on the phone and adds Entries while walking the
// floor: typed notes, voice notes, photos, videos and Scans of Assets. A Scan
// sets the current Asset; later Entries are tagged with it. Hand-in schedules
// the AI (convex/ai/captures.ts), which turns the Entries into Moments.
//
// A Capture is raw input, never Knowledge: Ask, Wiki and MCP never read these
// tables. Privacy rules live in ./access.ts.
import { ConvexError, v } from "convex/values"
import { internalMutation, internalQuery, mutation, query, QueryCtx } from "../_generated/server"
import { internal } from "../_generated/api"
import { Doc, Id } from "../_generated/dataModel"
import { requireUser, requireUserId } from "../lib/auth"
import {
  canSee,
  isEngineer,
  loadOwnRecording,
  loadVisible,
  recordedMs,
  requirePerson,
  visibleCapture,
} from "./access"

/** Largest media file accepted for one Entry. */
export const MAX_MEDIA_BYTES = 200 * 1024 * 1024
const MAX_TEXT = 4000
const MAX_ENTRIES = 1000

const entryKind = v.union(v.literal("note"), v.literal("voice"), v.literal("photo"), v.literal("video"), v.literal("scan"))

// ---- shared read helpers ------------------------------------------------------------

async function assetInfo(ctx: QueryCtx, id: Id<"assets"> | undefined, cache: Map<string, { code: string; name: string } | null>) {
  if (!id) return null
  if (!cache.has(id)) {
    const a = await ctx.db.get(id)
    cache.set(id, a ? { code: a.code, name: a.name } : null)
  }
  return cache.get(id) ?? null
}

async function entriesOf(ctx: QueryCtx, captureId: Id<"captures">) {
  return await ctx.db
    .query("captureEntries")
    .withIndex("by_captureId_and_at", (q) => q.eq("captureId", captureId))
    .take(MAX_ENTRIES)
}

async function momentsOf(ctx: QueryCtx, captureId: Id<"captures">) {
  return await ctx.db
    .query("captureMoments")
    .withIndex("by_captureId_and_order", (q) => q.eq("captureId", captureId))
    .take(500)
}

/** One row for a list: counts by kind, the first photo as thumbnail. */
export async function captureSummary(ctx: QueryCtx, c: Doc<"captures">, authors: Map<string, Doc<"people"> | null>) {
  if (!authors.has(c.authorId)) authors.set(c.authorId, await ctx.db.get(c.authorId))
  const author = authors.get(c.authorId) ?? null
  const entries = await entriesOf(ctx, c._id)
  const counts = { note: 0, voice: 0, photo: 0, video: 0, scan: 0 }
  for (const e of entries) counts[e.kind] += 1
  const firstPhoto = entries.find((e) => e.kind === "photo" && e.storageId && !e.mediaDeletedAt)
  const moments = c.status === "ready" ? await momentsOf(ctx, c._id) : []
  const assetIds = [...new Set(entries.map((e) => e.assetId).filter((a): a is Id<"assets"> => !!a))]
  const cache = new Map<string, { code: string; name: string } | null>()
  const assets = []
  for (const id of assetIds.slice(0, 8)) {
    const a = await assetInfo(ctx, id, cache)
    if (a) assets.push(a)
  }
  return {
    _id: c._id,
    title: c.title,
    job: c.job ?? null,
    status: c.status,
    startedAt: c.startedAt,
    endedAt: c.endedAt ?? null,
    handedInAt: c.handedInAt ?? null,
    recordedMs: recordedMs(c),
    paused: c.pausedAt != null,
    summary: c.summary ?? null,
    tags: c.tags ?? [],
    error: c.error ?? null,
    seeded: c.seeded ?? false,
    author: author ? { _id: author._id, name: author.name, role: author.role } : null,
    entryCount: entries.length,
    counts,
    momentCount: moments.length,
    momentCounts: moments.reduce<Record<string, number>>((acc, m) => ((acc[m.kind] = (acc[m.kind] ?? 0) + 1), acc), {}),
    assets,
    thumbnailUrl: firstPhoto?.storageId ? await ctx.storage.getUrl(firstPhoto.storageId) : null,
  }
}

// ---- recording ------------------------------------------------------------------------

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

export const start = mutation({
  args: { personId: v.id("people"), title: v.string(), job: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requirePerson(ctx, args.personId)
    const running = await ctx.db
      .query("captures")
      .withIndex("by_authorId", (q) => q.eq("authorId", args.personId))
      .order("desc")
      .take(50)
    if (running.some((c) => c.status === "recording"))
      throw new ConvexError("You already have a Capture running. Hand it in or discard it first.")
    const title = args.title.replace(/\s+/g, " ").trim().slice(0, 200)
    const job = args.job?.replace(/\s+/g, " ").trim().slice(0, 200)
    return await ctx.db.insert("captures", {
      title: title || job || "Capture",
      job: job || title || undefined,
      authorId: args.personId,
      status: "recording",
      startedAt: Date.now(),
    })
  },
})

export const addEntry = mutation({
  args: {
    captureId: v.id("captures"),
    personId: v.id("people"),
    kind: entryKind,
    text: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    mimeType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    assetId: v.optional(v.id("assets")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const c = await loadOwnRecording(ctx, args.captureId, args.personId)
    const text = args.text?.trim().slice(0, MAX_TEXT) || undefined
    const now = Date.now()

    if (args.kind === "note" && !text) throw new ConvexError("Type a note first.")
    if (args.kind === "scan") {
      if (!args.assetId) throw new ConvexError("A Scan needs the Asset that was scanned.")
      if (!(await ctx.db.get(args.assetId))) throw new ConvexError("This Asset no longer exists.")
    }
    let mimeType = args.mimeType
    let sizeBytes = args.sizeBytes
    if (args.kind === "voice" || args.kind === "photo" || args.kind === "video") {
      if (!args.storageId) throw new ConvexError("Upload the file first.")
      const meta = await ctx.db.system.get(args.storageId)
      if (!meta) throw new ConvexError("The upload was not found. Try again.")
      if (meta.size > MAX_MEDIA_BYTES) {
        await ctx.storage.delete(args.storageId)
        throw new ConvexError(`This file is too large (${Math.round(meta.size / 1048576)} MB). The limit is ${MAX_MEDIA_BYTES / 1048576} MB.`)
      }
      mimeType = meta.contentType ?? mimeType
      sizeBytes = meta.size
    } else if (args.storageId) {
      throw new ConvexError("Only voice notes, photos and videos carry a file.")
    }
    if (args.assetId && args.kind !== "scan" && !(await ctx.db.get(args.assetId)))
      throw new ConvexError("This Asset no longer exists.")

    const count = (await entriesOf(ctx, c._id)).length
    if (count >= MAX_ENTRIES) throw new ConvexError(`A Capture holds at most ${MAX_ENTRIES} Entries. Hand this one in and start a new one.`)

    const assetId = args.kind === "scan" ? args.assetId : (args.assetId ?? c.currentAssetId)
    const id = await ctx.db.insert("captureEntries", {
      captureId: c._id,
      kind: args.kind,
      at: now,
      text,
      storageId: args.storageId,
      mimeType: mimeType?.slice(0, 100),
      sizeBytes,
      durationMs: args.durationMs != null ? Math.max(0, Math.round(args.durationMs)) : undefined,
      assetId,
    })
    // Adding an Entry while paused resumes the Capture.
    const patch: Partial<Doc<"captures">> = {}
    if (args.kind === "scan") patch.currentAssetId = args.assetId
    if (c.pausedAt != null) {
      patch.pausedMs = (c.pausedMs ?? 0) + (now - c.pausedAt)
      patch.pausedAt = undefined
    }
    if (Object.keys(patch).length > 0) await ctx.db.patch(c._id, patch)
    return id
  },
})

/** Removes one Entry while still recording (an accidental photo, a wrong Scan). */
export const removeEntry = mutation({
  args: { entryId: v.id("captureEntries"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const e = await ctx.db.get(args.entryId)
    if (!e) return
    const c = await loadOwnRecording(ctx, e.captureId, args.personId)
    if (e.storageId) await ctx.storage.delete(e.storageId)
    await ctx.db.delete(e._id)
    if (e.kind === "scan" && c.currentAssetId === e.assetId) {
      const rest = await entriesOf(ctx, c._id)
      const lastScan = [...rest].reverse().find((x) => x.kind === "scan")
      await ctx.db.patch(c._id, { currentAssetId: lastScan?.assetId })
    }
  },
})

export const pause = mutation({
  args: { captureId: v.id("captures"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const c = await loadOwnRecording(ctx, args.captureId, args.personId)
    if (c.pausedAt == null) await ctx.db.patch(c._id, { pausedAt: Date.now() })
  },
})

export const resume = mutation({
  args: { captureId: v.id("captures"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const c = await loadOwnRecording(ctx, args.captureId, args.personId)
    if (c.pausedAt != null)
      await ctx.db.patch(c._id, { pausedMs: (c.pausedMs ?? 0) + (Date.now() - c.pausedAt), pausedAt: undefined })
  },
})

/** Edits the title or job of a Capture. The author while recording; the author or an Engineer afterwards. */
export const rename = mutation({
  args: { captureId: v.id("captures"), personId: v.id("people"), title: v.optional(v.string()), job: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const person = await requirePerson(ctx, args.personId)
    const c = await loadVisible(ctx, args.captureId, person)
    const patch: Partial<Doc<"captures">> = {}
    const title = args.title?.replace(/\s+/g, " ").trim().slice(0, 200)
    const job = args.job?.replace(/\s+/g, " ").trim().slice(0, 200)
    if (title) patch.title = title
    if (args.job !== undefined) patch.job = job || undefined
    await ctx.db.patch(c._id, patch)
  },
})

export const handIn = mutation({
  args: { captureId: v.id("captures"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const c = await loadOwnRecording(ctx, args.captureId, args.personId)
    const entries = await entriesOf(ctx, c._id)
    if (entries.length === 0) throw new ConvexError("This Capture has no Entries yet. Add a note, a photo or a voice note first.")
    const now = Date.now()
    await ctx.db.patch(c._id, {
      status: "handed_in",
      endedAt: c.pausedAt ?? now,
      handedInAt: now,
      pausedMs: c.pausedAt != null ? (c.pausedMs ?? 0) : c.pausedMs,
      error: undefined,
    })
    await ctx.scheduler.runAfter(0, internal.ai.captures.processCapture, { captureId: c._id })
    return c._id
  },
})

/** Deletes a Capture with its Entries, Moments and media. */
export const discard = mutation({
  args: { captureId: v.id("captures"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const person = await requirePerson(ctx, args.personId)
    const c = await ctx.db.get(args.captureId)
    if (!c) return
    const allowed = c.authorId === person._id || (c.status !== "recording" && isEngineer(person))
    if (!allowed) throw new ConvexError("Only the author or an Engineer can delete this Capture.")
    for (const e of await entriesOf(ctx, c._id)) {
      if (e.storageId && !(await storageInDocuments(ctx, e.storageId))) await ctx.storage.delete(e.storageId)
      await ctx.db.delete(e._id)
    }
    for (const m of await momentsOf(ctx, c._id)) await ctx.db.delete(m._id)
    // Leave Capture sets consistent: drop it and mark the combination stale.
    const sets = await ctx.db.query("captureSets").withIndex("by_createdAt").order("desc").take(500)
    for (const s of sets) {
      if (!s.captureIds.includes(c._id)) continue
      await ctx.db.patch(s._id, {
        captureIds: s.captureIds.filter((id) => id !== c._id),
        ...(s.combined ? { combined: undefined, status: "idle" as const } : {}),
      })
    }
    await ctx.db.delete(c._id)
  },
})

/** True when a Draft embeds this file as an image (the Draft is the Engineer's now). */
async function storageInDocuments(ctx: QueryCtx, storageId: Id<"_storage">): Promise<boolean> {
  const rows = await ctx.db.query("images").order("desc").take(2000)
  return rows.some((r) => r.storageId === storageId)
}

/**
 * Removes the photo, video or audio of one Entry (privacy). The Entry stays as
 * a trace with its text. Allowed for the author, and for Engineers once the
 * Capture is handed in. A file a Draft already embeds stays with that Draft.
 */
export const deleteEntryMedia = mutation({
  args: { entryId: v.id("captureEntries"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const person = await requirePerson(ctx, args.personId)
    const e = await ctx.db.get(args.entryId)
    if (!e) throw new ConvexError("This Entry no longer exists.")
    const c = await ctx.db.get(e.captureId)
    if (!c) throw new ConvexError("This Capture no longer exists.")
    const allowed = c.authorId === person._id || (c.status !== "recording" && isEngineer(person))
    if (!allowed) throw new ConvexError("Only the author or an Engineer can delete this media.")
    if (!e.storageId) return
    if (!(await storageInDocuments(ctx, e.storageId))) await ctx.storage.delete(e.storageId)
    await ctx.db.patch(e._id, { storageId: undefined, mediaDeletedAt: Date.now() })
  },
})

/** Runs the AI again on a handed-in Capture. */
export const reprocess = mutation({
  args: { captureId: v.id("captures"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const person = await requirePerson(ctx, args.personId)
    const c = await loadVisible(ctx, args.captureId, person)
    if (c.status === "recording") throw new ConvexError("Hand the Capture in first.")
    if (c.status === "processing" && c.handedInAt && Date.now() - c.handedInAt < 5 * 60 * 1000)
      throw new ConvexError("The AI is still working on this Capture.")
    await ctx.db.patch(c._id, { status: "handed_in", error: undefined })
    await ctx.scheduler.runAfter(0, internal.ai.captures.processCapture, { captureId: c._id, force: true })
  },
})

// ---- reading --------------------------------------------------------------------------

/** The person's running Capture, or null. Drives the "Capture running" pill. */
export const active = query({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const person = await ctx.db.get(args.personId)
    if (!person) return null
    const rows = await ctx.db
      .query("captures")
      .withIndex("by_authorId", (q) => q.eq("authorId", args.personId))
      .order("desc")
      .take(50)
    const c = rows.find((r) => r.status === "recording")
    if (!c) return null
    const entries = await entriesOf(ctx, c._id)
    const asset = c.currentAssetId ? await ctx.db.get(c.currentAssetId) : null
    const last = entries[entries.length - 1]
    return {
      _id: c._id,
      title: c.title,
      job: c.job ?? null,
      startedAt: c.startedAt,
      pausedAt: c.pausedAt ?? null,
      pausedMs: c.pausedMs ?? 0,
      entryCount: entries.length,
      lastEntryAt: last?.at ?? null,
      currentAsset: asset ? { _id: asset._id, code: asset.code, name: asset.name } : null,
    }
  },
})

/** The person's own Captures, newest first. */
export const mine = query({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const person = await ctx.db.get(args.personId)
    if (!person) return []
    const rows = await ctx.db
      .query("captures")
      .withIndex("by_authorId", (q) => q.eq("authorId", args.personId))
      .order("desc")
      .take(100)
    const authors = new Map<string, Doc<"people"> | null>([[person._id, person]])
    const out = []
    for (const c of rows) out.push(await captureSummary(ctx, c, authors))
    return out
  },
})

/**
 * Jobs people have recorded, for the "Which job?" picker on the phone: the
 * person's own jobs first (newest first), then jobs of handed-in Captures by
 * others, most recorded first. Only the job names, never the Captures.
 */
export const knownJobs = query({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const own = await ctx.db
      .query("captures")
      .withIndex("by_authorId", (q) => q.eq("authorId", args.personId))
      .order("desc")
      .take(50)
    const seen = new Set<string>()
    const out: { job: string; mine: boolean; count: number }[] = []
    for (const c of own) {
      const j = c.job?.trim()
      if (!j || seen.has(j.toLowerCase())) continue
      seen.add(j.toLowerCase())
      out.push({ job: j, mine: true, count: 0 })
    }
    const counts = new Map<string, { job: string; count: number }>()
    for (const status of ["handed_in", "processing", "ready"] as const) {
      const rows = await ctx.db
        .query("captures")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(300)
      for (const c of rows) {
        const j = c.job?.trim()
        if (!j) continue
        const k = j.toLowerCase()
        const row = counts.get(k) ?? { job: j, count: 0 }
        row.count += 1
        counts.set(k, row)
      }
    }
    for (const o of out) o.count = counts.get(o.job.toLowerCase())?.count ?? 0
    const others = [...counts.entries()]
      .filter(([k]) => !seen.has(k))
      .sort((a, b) => b[1].count - a[1].count)
      .map(([, r]) => ({ job: r.job, mine: false, count: r.count }))
    return [...out, ...others].slice(0, 8)
  },
})

/**
 * Captures the person may see: their own, and for Engineers every handed-in
 * Capture. Newest first.
 */
export const list = query({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const person = await ctx.db.get(args.personId)
    if (!person) return []
    const own = await ctx.db
      .query("captures")
      .withIndex("by_authorId", (q) => q.eq("authorId", args.personId))
      .order("desc")
      .take(200)
    const byId = new Map(own.map((c) => [c._id as string, c]))
    if (isEngineer(person)) {
      for (const status of ["handed_in", "processing", "ready", "failed"] as const) {
        const rows = await ctx.db
          .query("captures")
          .withIndex("by_status", (q) => q.eq("status", status))
          .order("desc")
          .take(300)
        for (const c of rows) byId.set(c._id, c)
      }
    }
    const rows = [...byId.values()].filter((c) => canSee(c, person))
    rows.sort((a, b) => (b.handedInAt ?? b.startedAt) - (a.handedInAt ?? a.startedAt))
    const authors = new Map<string, Doc<"people"> | null>()
    const out = []
    for (const c of rows.slice(0, 300)) out.push(await captureSummary(ctx, c, authors))
    return out
  },
})

/** One Capture with its timeline of Entries and its Moments. Null when not visible. */
export const get = query({
  args: { captureId: v.id("captures"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const person = await ctx.db.get(args.personId)
    if (!person) return null
    const c = await visibleCapture(ctx, args.captureId, person)
    if (!c) return null
    const author = await ctx.db.get(c.authorId)
    const cache = new Map<string, { code: string; name: string } | null>()
    const rawEntries = await entriesOf(ctx, c._id)
    const entries = []
    for (const e of rawEntries) {
      entries.push({
        ...e,
        url: e.storageId && !e.mediaDeletedAt ? await ctx.storage.getUrl(e.storageId) : null,
        asset: await assetInfo(ctx, e.assetId, cache),
        offsetMs: Math.max(0, e.at - c.startedAt),
      })
    }
    const moments = []
    for (const m of await momentsOf(ctx, c._id)) {
      moments.push({ ...m, asset: await assetInfo(ctx, m.assetId, cache) })
    }
    const sets = (await ctx.db.query("captureSets").withIndex("by_createdAt").order("desc").take(500))
      .filter((s) => s.captureIds.includes(c._id))
      .map((s) => ({ _id: s._id, title: s.title, status: s.status }))
    const draftLinks = await ctx.db
      .query("captureDrafts")
      .withIndex("by_captureId", (q) => q.eq("captureId", c._id))
      .take(50)
    const drafts = []
    for (const l of draftLinks) {
      const d = await ctx.db.get(l.documentId)
      if (d) drafts.push({ _id: d._id, namingCode: d.namingCode, title: d.title, status: d.status, typeCode: l.typeCode })
    }
    const isAuthor = c.authorId === person._id
    const engineer = isEngineer(person)
    return {
      capture: { ...c, recordedMs: recordedMs(c) },
      author: author ? { _id: author._id, name: author.name, role: author.role, kind: author.kind } : null,
      entries,
      moments,
      sets,
      drafts,
      viewer: {
        isAuthor,
        isEngineer: engineer,
        canDeleteMedia: isAuthor || (engineer && c.status !== "recording"),
        canMakeDraft: engineer && c.status === "ready",
      },
    }
  },
})

/** The Captures and Capture set a Draft was made from (for the document page). */
export const sourcesForDocument = query({
  args: { documentId: v.id("documents"), personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const links = await ctx.db
      .query("captureDrafts")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .take(10)
    if (links.length === 0) return null
    const person = args.personId ? await ctx.db.get(args.personId) : null
    const ids = [...new Set(links.flatMap((l) => l.captureIds))]
    const captures = []
    for (const id of ids) {
      const c = await ctx.db.get(id)
      if (!c) continue
      const author = await ctx.db.get(c.authorId)
      captures.push({
        _id: c._id,
        title: c.title,
        authorName: author?.name ?? "Unknown",
        handedInAt: c.handedInAt ?? null,
        // Titles and authors are shown to everyone; opening needs access.
        canOpen: person ? canSee(c, person) : false,
      })
    }
    const setId = links.find((l) => l.setId)?.setId
    const set = setId ? await ctx.db.get(setId) : null
    return {
      typeCode: links[0].typeCode,
      set: set ? { _id: set._id, title: set.title } : null,
      captures,
    }
  },
})

// ---- internal, for the AI ---------------------------------------------------------------

export const loadForProcessing = internalQuery({
  args: { captureId: v.id("captures") },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.captureId)
    if (!c) return null
    const author = await ctx.db.get(c.authorId)
    const cache = new Map<string, { code: string; name: string } | null>()
    const entries = []
    for (const e of await entriesOf(ctx, c._id)) {
      entries.push({ ...e, asset: await assetInfo(ctx, e.assetId, cache) })
    }
    return { capture: c, authorName: author?.name ?? "an operator", authorRole: author?.role ?? "", entries }
  },
})

export const markProcessing = internalMutation({
  args: { captureId: v.id("captures"), force: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.captureId)
    if (!c || c.status === "recording") return false
    if (c.status === "processing" && !args.force) return false
    await ctx.db.patch(c._id, { status: "processing", error: undefined })
    for (const e of await entriesOf(ctx, c._id)) {
      const needsAi = (e.kind === "voice" || e.kind === "photo" || e.kind === "video") && e.storageId && !e.mediaDeletedAt
      const done = e.kind === "voice" ? !!e.transcript : !!e.description
      if (needsAi && (!done || args.force)) await ctx.db.patch(e._id, { analysis: "pending", analysisNote: undefined })
    }
    return true
  },
})

export const saveEntryAnalysis = internalMutation({
  args: {
    entryId: v.id("captureEntries"),
    analysis: v.union(v.literal("done"), v.literal("skipped"), v.literal("failed")),
    transcript: v.optional(v.string()),
    description: v.optional(v.string()),
    analysisNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const e = await ctx.db.get(args.entryId)
    if (!e) return
    const patch: Partial<Doc<"captureEntries">> = { analysis: args.analysis, analysisNote: args.analysisNote }
    if (args.transcript !== undefined) patch.transcript = args.transcript
    if (args.description !== undefined) patch.description = args.description
    await ctx.db.patch(e._id, patch)
  },
})

export const saveMoments = internalMutation({
  args: {
    captureId: v.id("captures"),
    summary: v.string(),
    tags: v.array(v.string()),
    moments: v.array(
      v.object({
        kind: v.union(v.literal("step"), v.literal("safety"), v.literal("quality"), v.literal("tip"), v.literal("problem"), v.literal("question")),
        title: v.string(),
        detail: v.string(),
        assetId: v.optional(v.id("assets")),
        entryIds: v.array(v.id("captureEntries")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.captureId)
    if (!c) return
    for (const m of await momentsOf(ctx, c._id)) await ctx.db.delete(m._id)
    for (const [i, m] of args.moments.entries()) {
      await ctx.db.insert("captureMoments", { captureId: c._id, order: i, ...m })
    }
    await ctx.db.patch(c._id, {
      status: "ready",
      summary: args.summary,
      tags: args.tags,
      error: undefined,
      processedAt: Date.now(),
    })
  },
})

export const markFailed = internalMutation({
  args: { captureId: v.id("captures"), error: v.string() },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.captureId)
    if (!c) return
    await ctx.db.patch(c._id, { status: "failed", error: args.error.slice(0, 400) })
  },
})
