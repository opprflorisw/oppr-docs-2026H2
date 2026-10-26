// Findings (CONTEXT.md: Consistency check, Finding).
//
// A Finding is a contradiction or a duplicate between two passages of
// Published Knowledge, each quoted verbatim. The Consistency check
// (convex/ai/consistency.ts) produces them; this module stores them, closes
// them, and serves them to the Findings page, the Document banner, Home and
// Ask. A Finding closes in one of two ways only:
//   - resolved: one side gets a newer Published version (findingsAfterPublish),
//     or stops being Published (archived or deleted);
//   - dismissed: a checked-in Engineer dismisses it with a reason. A dismissed
//     pair is never reported again until one side changes (pairKey carries the
//     versions).
import { ConvexError, v } from "convex/values"
import {
  internalMutation,
  internalQuery,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from "./_generated/server"
import { internal } from "./_generated/api"
import { Doc, Id } from "./_generated/dataModel"
import type { PublishEvent } from "./lib/onPublish"
import { publishedVersion } from "./lib/published"
import { allPoints, isContentV2 } from "./lib/wikiTypes"
import { requireUser, requireUserId } from "./lib/auth"
import { requireEngineer } from "./documents"
import { factTokens, normalise, withTableHeaders } from "./ai/grounding"

const trigger = v.union(
  v.literal("publish"),
  v.literal("weekly"),
  v.literal("manual"),
  v.literal("seed"),
)

const side = v.object({
  documentId: v.id("documents"),
  namingCode: v.string(),
  title: v.string(),
  version: v.number(),
  chunkId: v.union(v.id("chunks"), v.null()),
  section: v.union(v.string(), v.null()),
  quote: v.string(),
})
type Side = Doc<"findings">["a"]

// A run that has not finished after this long is treated as crashed, so a new
// one may start.
const RUN_STALE_MS = 15 * 60 * 1000

// ---- Pair identity -------------------------------------------------------------

/** Small stable hash (FNV-1a, base 36). */
export function shortHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** The two sides in a stable order (by document id), so A/B never matters. */
export function orderSides<T extends { documentId: string }>(a: T, b: T): [T, T] {
  return a.documentId <= b.documentId ? [a, b] : [b, a]
}

/**
 * The facts on which two quotes differ (codes and quantities found in one but
 * not the other): "40 NM|45 NM" for the die bolt torque. Empty when the quotes
 * carry the same facts (a wording or frequency conflict).
 */
export function factSignature(quoteA: string, quoteB: string): string {
  const a = new Set(factTokens(quoteA))
  const b = new Set(factTokens(quoteB))
  const diff = [...[...a].filter((t) => !b.has(t)), ...[...b].filter((t) => !a.has(t))]
  return Array.from(new Set(diff)).sort().join("|")
}

/**
 * Stable identity of a Finding: both documents at their versions, the kind,
 * and for a contradiction a short hash of what disagrees. A duplicate is one
 * per pair of document versions.
 */
export function pairKeyFor(
  kind: "contradiction" | "duplicate",
  a: { documentId: string; version: number; quote: string },
  b: { documentId: string; version: number; quote: string },
): string {
  const [x, y] = orderSides(a, b)
  const base = `${x.documentId}@v${x.version}|${y.documentId}@v${y.version}|${kind}`
  if (kind === "duplicate") return base
  const sig = factSignature(x.quote, y.quote) || `${normalise(x.quote)}#${normalise(y.quote)}`
  return `${base}|${shortHash(sig)}`
}

// ---- Publish hook --------------------------------------------------------------

export async function openFindingsTouching(ctx: QueryCtx, documentId: Id<"documents">) {
  const [asA, asB] = await Promise.all([
    ctx.db
      .query("findings")
      .withIndex("by_documentA_and_status", (q) => q.eq("documentA", documentId).eq("status", "open"))
      .take(200),
    ctx.db
      .query("findings")
      .withIndex("by_documentB_and_status", (q) => q.eq("documentB", documentId).eq("status", "open"))
      .take(200),
  ])
  const seen = new Set<string>()
  const out: Doc<"findings">[] = []
  for (const f of [...asA, ...asB]) {
    if (seen.has(f._id)) continue
    seen.add(f._id)
    out.push(f)
  }
  return out
}

/**
 * Resolves the open Findings in which this Document appears at a version older
 * than the one just Published. Returns how many were resolved. Split from
 * findingsAfterPublish so it can be tested without scheduling a check.
 */
export async function resolveForPublish(
  ctx: MutationCtx,
  event: { documentId: Id<"documents">; version: number },
): Promise<number> {
  const doc = await ctx.db.get(event.documentId)
  const code = doc?.namingCode ?? "the document"
  const now = Date.now()
  let resolved = 0
  for (const f of await openFindingsTouching(ctx, event.documentId)) {
    const mine = [f.a, f.b].filter((s) => s.documentId === event.documentId)
    if (!mine.some((s) => s.version < event.version)) continue
    await ctx.db.patch(f._id, {
      status: "resolved",
      resolvedAt: now,
      resolution: `Resolved by publishing ${code} v${event.version}`,
    })
    resolved += 1
  }
  return resolved
}

/**
 * Called inside the publishing transaction. Resolves open Findings that
 * involve an older version of this Document ("resolved by publishing a
 * revision"), and schedules the Consistency check of the new version.
 */
export async function findingsAfterPublish(ctx: MutationCtx, event: PublishEvent) {
  const resolved = await resolveForPublish(ctx, event)
  if (resolved > 0) {
    console.log(`Findings: ${resolved} resolved by publishing ${event.documentId} v${event.version}`)
  }
  // A short delay lets a just-saved version finish embedding; the check
  // itself also waits for embeddings.
  await ctx.scheduler.runAfter(5_000, internal.ai.consistency.checkDocument, {
    documentId: event.documentId,
    version: event.version,
  })
}

/**
 * Resolves open Findings whose side is no longer the Published version: the
 * document was archived, deleted, or got a newer version some other way. Runs
 * at the start of every Consistency check.
 */
export const resolveStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const open = await ctx.db
      .query("findings")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(500)
    const now = Date.now()
    let resolved = 0
    for (const f of open) {
      let resolution: string | null = null
      for (const s of [f.a, f.b]) {
        const d = await ctx.db.get(s.documentId)
        if (!d) {
          resolution = `Resolved: ${s.namingCode} was deleted`
        } else if (d.status === "archived") {
          resolution = `Resolved: ${s.namingCode} was archived`
        } else if (d.liveVersion != null && d.liveVersion > s.version) {
          resolution = `Resolved by publishing ${d.namingCode} v${d.liveVersion}`
        }
        if (resolution) break
      }
      if (!resolution) continue
      await ctx.db.patch(f._id, { status: "resolved", resolvedAt: now, resolution })
      resolved += 1
    }
    return resolved
  },
})

// ---- Input for the check -------------------------------------------------------

export interface CorpusChunk {
  chunkId: Id<"chunks">
  seq: number
  /** As stored. */
  raw: string
  /** Table rows carry their column headers (grounding.withTableHeaders). */
  text: string
  section: string | null
  embedded: boolean
}
export interface CorpusDoc {
  documentId: Id<"documents">
  namingCode: string
  title: string
  version: number
  wrapped: boolean
  chunks: CorpusChunk[]
}

async function liveChunks(ctx: QueryCtx, doc: Doc<"documents">): Promise<CorpusDoc | null> {
  // Published-only (convex/lib/published.ts): the live version, never a draft.
  const version = publishedVersion(doc)
  if (version == null) return null
  const rows = (
    await ctx.db
      .query("chunks")
      .withIndex("by_documentId_and_version", (q) => q.eq("documentId", doc._id).eq("version", version))
      .take(1000)
  ).sort((x, y) => x.seq - y.seq)
  const headed = withTableHeaders(rows.map((c) => ({ text: c.text, section: c.pageOrSection })))
  return {
    documentId: doc._id,
    namingCode: doc.namingCode,
    title: doc.title,
    version,
    wrapped: doc.origin === "wrapped",
    chunks: rows.map((c, i) => ({
      chunkId: c._id,
      seq: c.seq,
      raw: c.text,
      text: headed[i],
      section: c.pageOrSection,
      embedded: !!c.vectorId,
    })),
  }
}

/** Every Published document with the text of its live version. No embeddings. */
export const publishedCorpus = internalQuery({
  args: {},
  handler: async (ctx): Promise<CorpusDoc[]> => {
    const docs = await ctx.db.query("documents").take(2000)
    const out: CorpusDoc[] = []
    for (const d of docs) {
      const c = await liveChunks(ctx, d)
      if (c && c.chunks.length > 0) out.push(c)
    }
    return out
  },
})

/** Embedding status of one document version, for the publish-time check. */
export const versionState = internalQuery({
  args: { documentId: v.id("documents"), version: v.number() },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId)
    if (!doc) return { state: "gone" as const, chunks: 0, missing: 0 }
    if (publishedVersion(doc) !== args.version) return { state: "superseded" as const, chunks: 0, missing: 0 }
    const rows = await ctx.db
      .query("chunks")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.documentId).eq("version", args.version),
      )
      .take(1000)
    const missing = rows.filter((c) => !c.vectorId).length
    return { state: "live" as const, chunks: rows.length, missing }
  },
})

/** The embeddings of one document's live chunks, for the vector search. */
export const chunkEmbeddings = internalQuery({
  args: { documentId: v.id("documents"), version: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("chunks")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", args.documentId).eq("version", args.version),
      )
      .take(1000)
    const out: { chunkId: Id<"chunks">; embedding: number[] }[] = []
    for (const c of rows) {
      const vec = c.vectorId ? await ctx.db.get(c.vectorId) : null
      if (vec) out.push({ chunkId: c._id, embedding: vec.embedding })
    }
    return out
  },
})

// ---- Runs ----------------------------------------------------------------------

export const startRun = internalMutation({
  args: { trigger, documentId: v.union(v.id("documents"), v.null()) },
  handler: async (ctx, args) => {
    return await ctx.db.insert("consistencyRuns", {
      trigger: args.trigger,
      documentId: args.documentId,
      status: "running",
      pairsChecked: 0,
      findingsNew: 0,
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
    })
  },
})

export const finishRun = internalMutation({
  args: {
    runId: v.id("consistencyRuns"),
    status: v.union(v.literal("done"), v.literal("failed")),
    pairsChecked: v.number(),
    findingsNew: v.number(),
    error: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) return
    await ctx.db.patch(args.runId, {
      status: args.status,
      pairsChecked: args.pairsChecked,
      findingsNew: args.findingsNew,
      error: args.error,
      finishedAt: Date.now(),
    })
  },
})

async function runningRun(ctx: QueryCtx) {
  const recent = await ctx.db.query("consistencyRuns").withIndex("by_startedAt").order("desc").take(10)
  const now = Date.now()
  return recent.find((r) => r.status === "running" && now - r.startedAt < RUN_STALE_MS) ?? null
}

/** True when a library-wide run is already going (never two at once). */
export const isLibraryRunActive = internalQuery({
  args: {},
  handler: async (ctx) => {
    const recent = await ctx.db.query("consistencyRuns").withIndex("by_startedAt").order("desc").take(10)
    const now = Date.now()
    return recent.some((r) => r.status === "running" && r.documentId == null && now - r.startedAt < RUN_STALE_MS)
  },
})

// ---- Saving ----------------------------------------------------------------------

/**
 * Stores verified Findings. Skips a pair that is already open, was dismissed
 * or resolved at these versions, or whose sides are no longer the Published
 * versions. Returns the number of new Findings.
 */
export const saveFindings = internalMutation({
  args: {
    trigger,
    findings: v.array(
      v.object({
        kind: v.union(v.literal("contradiction"), v.literal("duplicate")),
        summary: v.string(),
        a: side,
        b: side,
      }),
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0
    const contradicted = new Set<Id<"documents">>()
    const now = Date.now()
    for (const f of args.findings) {
      const [a, b] = orderSides(f.a, f.b)
      if (a.documentId === b.documentId) continue
      // Published-only: both sides must still be the live version.
      const [da, db] = await Promise.all([ctx.db.get(a.documentId), ctx.db.get(b.documentId)])
      if (!da || !db) continue
      if (publishedVersion(da) !== a.version || publishedVersion(db) !== b.version) continue

      const pairKey = pairKeyFor(f.kind, a, b)
      const existing = await ctx.db
        .query("findings")
        .withIndex("by_pairKey", (q) => q.eq("pairKey", pairKey))
        .first()
      if (existing) continue

      // The same disagreement found through other passages of the same two
      // versions (another page of the manual saying 45 Nm, say) is not new.
      const sig = factSignature(a.quote, b.quote)
      if (f.kind === "contradiction" && sig) {
        const siblings = await ctx.db
          .query("findings")
          .withIndex("by_documentA_and_status", (q) => q.eq("documentA", a.documentId))
          .take(300)
        const same = siblings.some(
          (s) =>
            s.kind === "contradiction" &&
            s.documentB === b.documentId &&
            s.a.version === a.version &&
            s.b.version === b.version &&
            factSignature(s.a.quote, s.b.quote) === sig,
        )
        if (same) continue
      }

      await ctx.db.insert("findings", {
        kind: f.kind,
        status: "open",
        summary: f.summary,
        a,
        b,
        documentA: a.documentId,
        documentB: b.documentId,
        pairKey,
        detectedBy: args.trigger,
        detectedAt: now,
        resolvedAt: null,
        resolution: null,
        dismissedReason: null,
        dismissedBy: null,
      })
      inserted += 1
      if (f.kind === "contradiction") {
        contradicted.add(a.documentId)
        contradicted.add(b.documentId)
      }
    }
    // A Wiki built before this contradiction was found must now show both
    // sides: recompose (code only, no AI) every Wiki citing either Document.
    if (contradicted.size > 0) {
      for (const w of await ctx.db.query("wikis").take(200)) {
        if (!isContentV2(w.content)) continue
        if (allPoints(w.content).some((p) => p.citations.some((c) => contradicted.has(c.documentId)))) {
          await ctx.scheduler.runAfter(0, internal.wikiBlocks.compose, { wikiId: w._id, mode: "normal" })
        }
      }
    }
    return inserted
  },
})

// ---- Engineer actions ------------------------------------------------------------

/** Starts a library-wide Consistency check now. Engineer check-in required. */
export const runCheckNow = mutation({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    try {
      await requireEngineer(ctx, args.personId)
    } catch {
      throw new ConvexError("Check in as an Engineer to run the Consistency check.")
    }
    const running = await runningRun(ctx)
    if (running && running.documentId == null) {
      throw new ConvexError("A Consistency check is already running. New Findings appear here when it is done.")
    }
    await ctx.scheduler.runAfter(0, internal.ai.consistency.runAll, { trigger: "manual" })
    return null
  },
})

/** Dismisses an open Finding with a reason. Engineer check-in required. */
export const dismiss = mutation({
  args: { findingId: v.id("findings"), personId: v.id("people"), reason: v.string() },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    let person: Doc<"people">
    try {
      person = await requireEngineer(ctx, args.personId)
    } catch {
      throw new ConvexError("Check in as an Engineer to dismiss a Finding.")
    }
    const reason = args.reason.trim()
    if (reason.length < 3) throw new ConvexError("Say why this Finding is dismissed.")
    if (reason.length > 500) throw new ConvexError("Keep the reason under 500 characters.")
    const f = await ctx.db.get(args.findingId)
    if (!f) throw new ConvexError("This Finding no longer exists.")
    if (f.status !== "open") throw new ConvexError("Only an open Finding can be dismissed.")
    await ctx.db.patch(f._id, {
      status: "dismissed",
      dismissedReason: reason,
      dismissedBy: person._id,
      resolvedAt: Date.now(),
    })
    return null
  },
})

// ---- Reading -----------------------------------------------------------------------

/** An open Finding still stands only while both sides are the Published versions. */
export async function stillStands(ctx: QueryCtx, f: Doc<"findings">): Promise<boolean> {
  for (const s of [f.a, f.b]) {
    const d = await ctx.db.get(s.documentId)
    if (!d || publishedVersion(d) !== s.version) return false
  }
  return true
}

async function present(ctx: QueryCtx, f: Doc<"findings">) {
  const sideOut = async (s: Side) => {
    const d = await ctx.db.get(s.documentId)
    return {
      ...s,
      // Wrapped manuals are replaced, never revised (CONTEXT.md).
      wrapped: d?.origin === "wrapped",
      exists: d != null,
      liveVersion: d ? publishedVersion(d) : null,
      // A revision of this document is already being drafted.
      revisionInProgress: d != null && d.liveVersion != null && d.currentVersion !== d.liveVersion,
      workingVersion: d?.currentVersion ?? null,
    }
  }
  const dismissedBy = f.dismissedBy ? await ctx.db.get(f.dismissedBy) : null
  const revision = f.proposedRevisionId ? await ctx.db.get(f.proposedRevisionId) : null
  return {
    _id: f._id,
    kind: f.kind,
    status: f.status,
    summary: f.summary,
    a: await sideOut(f.a),
    b: await sideOut(f.b),
    detectedBy: f.detectedBy,
    detectedAt: f.detectedAt,
    resolvedAt: f.resolvedAt,
    resolution: f.resolution,
    dismissedReason: f.dismissedReason,
    dismissedByName: dismissedBy?.name ?? null,
    proposedRevision: revision
      ? { _id: revision._id, documentId: revision.documentId, state: revision.state }
      : null,
  }
}

/** Findings, newest first. Open ones that no longer stand are left out. */
export const list = query({
  args: {
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"), v.literal("dismissed"))),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const status = args.status
    const rows = status
      ? await ctx.db
          .query("findings")
          .withIndex("by_status", (q) => q.eq("status", status))
          .order("desc")
          .take(200)
      : await ctx.db.query("findings").order("desc").take(300)
    const out = []
    for (const f of rows) {
      if (f.status === "open" && !(await stillStands(ctx, f))) continue
      out.push(await present(ctx, f))
    }
    // Open: contradictions before duplicates, then newest first. Closed:
    // most recently closed first.
    return out.sort((x, y) => {
      if (x.status === "open" && y.status === "open" && x.kind !== y.kind) {
        return x.kind === "contradiction" ? -1 : 1
      }
      return (y.resolvedAt ?? y.detectedAt) - (x.resolvedAt ?? x.detectedAt)
    })
  },
})

/** Open Findings on one Document, each with the other side. */
export const forDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const out = []
    for (const f of await openFindingsTouching(ctx, args.documentId)) {
      if (!(await stillStands(ctx, f))) continue
      const p = await present(ctx, f)
      const mineIsA = f.a.documentId === args.documentId
      out.push({ ...p, mine: mineIsA ? p.a : p.b, other: mineIsA ? p.b : p.a })
    }
    return out.sort((x, y) =>
      x.kind === y.kind ? y.detectedAt - x.detectedAt : x.kind === "contradiction" ? -1 : 1,
    )
  },
})

/** Counts per status (open counts only Findings that still stand). */
export const counts = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const byStatus = async (status: "open" | "resolved" | "dismissed") =>
      ctx.db
        .query("findings")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(500)
    const [openRows, resolved, dismissed] = await Promise.all([
      byStatus("open"),
      byStatus("resolved"),
      byStatus("dismissed"),
    ])
    const open: Doc<"findings">[] = []
    for (const f of openRows) if (await stillStands(ctx, f)) open.push(f)
    const contradictions = open.filter((f) => f.kind === "contradiction").length
    return {
      open: open.length,
      openContradictions: contradictions,
      openDuplicates: open.length - contradictions,
      resolved: resolved.length,
      dismissed: dismissed.length,
    }
  },
})

/** The latest finished run, and the one going now, if any. */
export const latestRun = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const recent = await ctx.db.query("consistencyRuns").withIndex("by_startedAt").order("desc").take(10)
    const now = Date.now()
    const running = recent.find((r) => r.status === "running" && now - r.startedAt < RUN_STALE_MS) ?? null
    const last = recent.find((r) => r.status !== "running") ?? null
    const codeOf = async (r: Doc<"consistencyRuns"> | null) =>
      r?.documentId ? ((await ctx.db.get(r.documentId))?.namingCode ?? null) : null
    return {
      running: running
        ? {
            trigger: running.trigger,
            startedAt: running.startedAt,
            library: running.documentId == null,
            namingCode: await codeOf(running),
          }
        : null,
      last: last
        ? {
            trigger: last.trigger,
            status: last.status,
            startedAt: last.startedAt,
            finishedAt: last.finishedAt,
            pairsChecked: last.pairsChecked,
            findingsNew: last.findingsNew,
            error: last.error,
            library: last.documentId == null,
            namingCode: await codeOf(last),
          }
        : null,
    }
  },
})

async function openContradictionsFor(ctx: QueryCtx, documentIds: Id<"documents">[]) {
  const seen = new Set<string>()
  const out: Doc<"findings">[] = []
  for (const id of documentIds.slice(0, 20)) {
    for (const f of await openFindingsTouching(ctx, id)) {
      if (f.kind !== "contradiction" || seen.has(f._id)) continue
      seen.add(f._id)
      if (await stillStands(ctx, f)) out.push(f)
    }
  }
  return out
}

/** Open contradictions touching any of these Documents (Ask warns on them). */
export const openConflictsFor = query({
  args: { documentIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const ids = args.documentIds
      .map((id) => ctx.db.normalizeId("documents", id))
      .filter((id): id is Id<"documents"> => id != null)
    const rows = await openContradictionsFor(ctx, ids)
    return rows.map((f) => ({
      _id: f._id,
      summary: f.summary,
      a: { documentId: f.a.documentId, chunkId: f.a.chunkId, namingCode: f.a.namingCode, title: f.a.title, quote: f.a.quote },
      b: { documentId: f.b.documentId, chunkId: f.b.chunkId, namingCode: f.b.namingCode, title: f.b.title, quote: f.b.quote },
    }))
  },
})

/** Same, for the Ask context (the Ask httpAction has checked auth already). */
export const openConflictsForAsk = internalQuery({
  args: { documentIds: v.array(v.id("documents")) },
  handler: async (ctx, args) => {
    const rows = await openContradictionsFor(ctx, args.documentIds)
    return rows.map((f) => ({
      findingId: f._id,
      summary: f.summary,
      a: { documentId: f.a.documentId, code: f.a.namingCode, title: f.a.title, quote: f.a.quote },
      b: { documentId: f.b.documentId, code: f.b.namingCode, title: f.b.title, quote: f.b.quote },
    }))
  },
})

// ---- Dev and test helpers -----------------------------------------------------------

/**
 * Unit-style test of the publish resolution rule, on throwaway rows that are
 * deleted again: a Finding whose side is at an older version is resolved (as
 * side A or B), one at the new version and one on other documents stay open,
 * and a dismissed one is untouched.
 * Run: npx convex run findings:testPublishResolution
 */
export const testPublishResolution = internalMutation({
  args: {},
  handler: async (ctx) => {
    const docs = (await ctx.db.query("documents").take(200)).filter((d) => d.liveVersion != null)
    if (docs.length < 3) return { ok: false, reason: "needs three Published documents" }
    const [x, y, z] = docs
    const mk = (d: Doc<"documents">, version: number): Side => ({
      documentId: d._id,
      namingCode: d.namingCode,
      title: d.title,
      version,
      chunkId: null,
      section: null,
      quote: `test quote ${version}`,
    })
    const insert = async (a: Side, b: Side, status: "open" | "dismissed", tag: string) =>
      ctx.db.insert("findings", {
        kind: "contradiction",
        status,
        summary: `TEST ${tag}`,
        a,
        b,
        documentA: a.documentId,
        documentB: b.documentId,
        pairKey: `test-${tag}-${Date.now()}`,
        detectedBy: "manual",
        detectedAt: Date.now(),
        resolvedAt: null,
        resolution: null,
        dismissedReason: status === "dismissed" ? "test" : null,
        dismissedBy: null,
      })
    const ver = x.liveVersion as number
    const yv = y.liveVersion as number
    const zv = z.liveVersion as number
    const ids = {
      olderAsA: await insert(mk(x, ver), mk(y, yv), "open", "older-as-a"),
      olderAsB: await insert(mk(z, zv), mk(x, ver), "open", "older-as-b"),
      newVersion: await insert(mk(x, ver + 1), mk(y, yv), "open", "new-version"),
      otherDocs: await insert(mk(y, yv), mk(z, zv), "open", "other-docs"),
      dismissed: await insert(mk(x, ver), mk(z, zv), "dismissed", "dismissed"),
    }
    const resolvedCount = await resolveForPublish(ctx, { documentId: x._id, version: ver + 1 })
    const after: Record<string, { status: string; resolution: string | null }> = {}
    for (const [k, id] of Object.entries(ids)) {
      const f = await ctx.db.get(id)
      after[k] = { status: f!.status, resolution: f!.resolution }
      await ctx.db.delete(id)
    }
    const ok =
      resolvedCount === 2 &&
      after.olderAsA.status === "resolved" &&
      after.olderAsB.status === "resolved" &&
      after.olderAsA.resolution === `Resolved by publishing ${x.namingCode} v${ver + 1}` &&
      after.newVersion.status === "open" &&
      after.otherDocs.status === "open" &&
      after.dismissed.status === "dismissed"
    return { ok, resolvedCount, after }
  },
})

/** Deletes all Findings (and runs). Dev only: for tests and reseeding. */
export const clearAll = internalMutation({
  args: { runsToo: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    let findings = 0
    for (const f of await ctx.db.query("findings").take(1000)) {
      await ctx.db.delete(f._id)
      findings += 1
    }
    let runs = 0
    if (args.runsToo) {
      for (const r of await ctx.db.query("consistencyRuns").take(1000)) {
        await ctx.db.delete(r._id)
        runs += 1
      }
    }
    return { findings, runs }
  },
})
