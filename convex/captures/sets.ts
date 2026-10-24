// Capture sets (CONTEXT.md, docs/adr/0005): several handed-in Captures of the
// same job. Combining them (convex/ai/captures.ts combine) gives one step
// list, which Captures support each step, Variations (different, skipped,
// extra) and conflicts with Published Knowledge. An Engineer decides the
// standard per Variation; then makes a Draft (./drafts.ts).
//
// Capture sets are Engineer work: every function needs a checked-in Engineer.
import { ConvexError, v } from "convex/values"
import { internalMutation, internalQuery, mutation, query, QueryCtx } from "../_generated/server"
import { internal } from "../_generated/api"
import { Doc, Id } from "../_generated/dataModel"
import { requireUser, requireUserId } from "../lib/auth"
import { isPublished } from "../lib/published"
import { isEngineer, jobKey, requireEngineerPerson } from "./access"
import { captureSummary } from "./captures"
import { momentKind } from "./schema"

const MAX_CAPTURES = 12

/** decide(): this decision leaves the step out of the Draft. */
export const OMIT = "omit"

async function checkCaptures(ctx: QueryCtx, ids: Id<"captures">[]) {
  const unique = [...new Set(ids)]
  if (unique.length < 2) throw new ConvexError("Pick at least 2 Captures to make a Capture set.")
  if (unique.length > MAX_CAPTURES) throw new ConvexError(`A Capture set holds at most ${MAX_CAPTURES} Captures.`)
  const out: Doc<"captures">[] = []
  for (const id of unique) {
    const c = await ctx.db.get(id)
    if (!c) throw new ConvexError("One of the Captures no longer exists.")
    if (c.status === "recording") throw new ConvexError(`"${c.title}" is still being recorded. Only handed-in Captures can be combined.`)
    out.push(c)
  }
  return out
}

export const create = mutation({
  args: { personId: v.id("people"), title: v.string(), job: v.optional(v.string()), captureIds: v.array(v.id("captures")) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerPerson(ctx, args.personId)
    const captures = await checkCaptures(ctx, args.captureIds)
    const job = args.job?.replace(/\s+/g, " ").trim() || captures.find((c) => c.job)?.job
    const title = args.title.replace(/\s+/g, " ").trim().slice(0, 200) || job || "Capture set"
    return await ctx.db.insert("captureSets", {
      title,
      job: job?.slice(0, 200),
      captureIds: captures.map((c) => c._id),
      createdBy: args.personId,
      createdAt: Date.now(),
      status: "idle",
    })
  },
})

/** Renames a set or changes its Captures. Changing the Captures clears the combination. */
export const update = mutation({
  args: {
    setId: v.id("captureSets"),
    personId: v.id("people"),
    title: v.optional(v.string()),
    job: v.optional(v.string()),
    captureIds: v.optional(v.array(v.id("captures"))),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerPerson(ctx, args.personId)
    const s = await ctx.db.get(args.setId)
    if (!s) throw new ConvexError("This Capture set no longer exists.")
    const patch: Partial<Doc<"captureSets">> = {}
    const title = args.title?.replace(/\s+/g, " ").trim().slice(0, 200)
    if (title) patch.title = title
    if (args.job !== undefined) patch.job = args.job.replace(/\s+/g, " ").trim().slice(0, 200) || undefined
    if (args.captureIds) {
      if (s.status === "combining") throw new ConvexError("Wait until combining has finished.")
      const captures = await checkCaptures(ctx, args.captureIds)
      const changed =
        captures.length !== s.captureIds.length || captures.some((c) => !s.captureIds.includes(c._id))
      patch.captureIds = captures.map((c) => c._id)
      if (changed) {
        patch.combined = undefined
        patch.status = "idle"
        patch.error = undefined
      }
    }
    await ctx.db.patch(s._id, patch)
  },
})

export const remove = mutation({
  args: { setId: v.id("captureSets"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerPerson(ctx, args.personId)
    const s = await ctx.db.get(args.setId)
    if (s) await ctx.db.delete(s._id)
  },
})

export const list = query({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const person = await ctx.db.get(args.personId)
    if (!isEngineer(person)) return []
    const rows = await ctx.db.query("captureSets").withIndex("by_createdAt").order("desc").take(200)
    const out = []
    for (const s of rows) {
      const creator = await ctx.db.get(s.createdBy)
      const authors = new Set<string>()
      for (const id of s.captureIds) {
        const c = await ctx.db.get(id)
        if (c) authors.add(c.authorId)
      }
      const steps = s.combined?.steps ?? []
      out.push({
        _id: s._id,
        title: s.title,
        job: s.job ?? null,
        status: s.status,
        error: s.error ?? null,
        createdAt: s.createdAt,
        createdBy: creator?.name ?? "Unknown",
        captureCount: s.captureIds.length,
        authorCount: authors.size,
        combinedAt: s.combined?.combinedAt ?? null,
        stepCount: steps.length,
        variationCount: steps.reduce((n, st) => n + st.variations.length, 0),
        conflictCount: steps.filter((st) => st.conflict).length,
        openDecisions: steps.filter((st) => (st.variations.length > 0 || st.conflict) && !st.decision).length,
        draftCount: s.draftDocumentIds?.length ?? 0,
      })
    }
    return out
  },
})

export const get = query({
  args: { setId: v.id("captureSets"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const person = await ctx.db.get(args.personId)
    if (!isEngineer(person)) return null
    const s = await ctx.db.get(args.setId)
    if (!s) return null
    const authors = new Map<string, Doc<"people"> | null>()
    const captures = []
    for (const id of s.captureIds) {
      const c = await ctx.db.get(id)
      if (c) captures.push(await captureSummary(ctx, c, authors))
    }
    const capInfo = new Map(captures.map((c) => [c._id as string, { _id: c._id, title: c.title, authorName: c.author?.name ?? "Unknown" }]))

    let combined = null
    if (s.combined) {
      const steps = []
      for (const [index, st] of s.combined.steps.entries()) {
        const evidence = []
        for (const eid of (st.evidenceEntryIds ?? []).slice(0, 8)) {
          const e = await ctx.db.get(eid)
          if (!e) continue
          evidence.push({
            _id: e._id,
            captureId: e.captureId,
            kind: e.kind,
            text: e.text ?? e.transcript ?? e.description ?? null,
            url: e.storageId && !e.mediaDeletedAt ? await ctx.storage.getUrl(e.storageId) : null,
          })
        }
        const conflictDoc = st.conflict ? await ctx.db.get(st.conflict.documentId) : null
        steps.push({
          ...st,
          index,
          supportedBy: st.supportedBy.map((id) => capInfo.get(id) ?? { _id: id, title: "Removed Capture", authorName: "" }),
          variations: st.variations.map((vr) => ({ ...vr, capture: capInfo.get(vr.captureId) ?? null })),
          conflict: st.conflict
            ? { ...st.conflict, documentTitle: conflictDoc?.title ?? null, published: conflictDoc ? isPublished(conflictDoc) : false }
            : null,
          evidence,
          needsDecision: (st.variations.length > 0 || !!st.conflict) && !st.decision,
          omitted: st.decision === OMIT,
        })
      }
      combined = { summary: s.combined.summary, combinedAt: s.combined.combinedAt, steps }
    }

    const drafts = []
    for (const id of s.draftDocumentIds ?? []) {
      const d = await ctx.db.get(id)
      if (d) drafts.push({ _id: d._id, namingCode: d.namingCode, title: d.title, status: d.status, type: d.type })
    }
    const creator = await ctx.db.get(s.createdBy)
    return {
      set: { ...s, combined: undefined },
      createdByName: creator?.name ?? "Unknown",
      captures,
      combined,
      drafts,
      notReady: captures.filter((c) => c.status !== "ready").map((c) => ({ _id: c._id, title: c.title, status: c.status })),
    }
  },
})

/** Starts the AI combination. All Captures must be processed (status ready). */
export const combine = mutation({
  args: { setId: v.id("captureSets"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerPerson(ctx, args.personId)
    const s = await ctx.db.get(args.setId)
    if (!s) throw new ConvexError("This Capture set no longer exists.")
    if (s.captureIds.length < 2) throw new ConvexError("A Capture set needs at least 2 Captures to combine.")
    for (const id of s.captureIds) {
      const c = await ctx.db.get(id)
      if (!c) throw new ConvexError("One of the Captures no longer exists. Remove it from the set first.")
      if (c.status !== "ready")
        throw new ConvexError(`"${c.title}" is not processed yet (${c.status.replace("_", " ")}). Wait for it or process it again.`)
    }
    await ctx.db.patch(s._id, { status: "combining", error: undefined })
    await ctx.scheduler.runAfter(0, internal.ai.captures.combine, { setId: s._id })
  },
})

/**
 * The Engineer's choice for one step: the text that becomes the standard in
 * the Draft. "omit" leaves the step out; an empty string clears the decision.
 */
export const decide = mutation({
  args: { setId: v.id("captureSets"), personId: v.id("people"), stepIndex: v.number(), decision: v.string() },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerPerson(ctx, args.personId)
    const s = await ctx.db.get(args.setId)
    if (!s?.combined) throw new ConvexError("Combine the Capture set first.")
    const steps = [...s.combined.steps]
    const st = steps[args.stepIndex]
    if (!st) throw new ConvexError("This step no longer exists. Combine again if the set changed.")
    const decision = args.decision.replace(/\s+/g, " ").trim().slice(0, 2000)
    steps[args.stepIndex] = { ...st, decision: decision || undefined }
    await ctx.db.patch(s._id, { combined: { ...s.combined, steps } })
  },
})

/** Handed-in, processed Captures grouped by job: candidates for a Capture set. */
export const suggestSets = query({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const person = await ctx.db.get(args.personId)
    if (!isEngineer(person)) return []
    const rows = await ctx.db
      .query("captures")
      .withIndex("by_status", (q) => q.eq("status", "ready"))
      .order("desc")
      .take(500)
    const groups = new Map<string, Doc<"captures">[]>()
    for (const c of rows) {
      const key = jobKey(c.job ?? c.title)
      if (!key) continue
      groups.set(key, [...(groups.get(key) ?? []), c])
    }
    const sets = await ctx.db.query("captureSets").withIndex("by_createdAt").order("desc").take(500)
    const out = []
    for (const group of groups.values()) {
      if (group.length < 2) continue
      const ids = group.map((c) => c._id as string)
      const existing = sets.find((s) => jobKey(s.job ?? s.title) === jobKey(group[0].job ?? group[0].title))
      const notInSet = existing ? ids.filter((id) => !existing.captureIds.includes(id as Id<"captures">)) : ids
      const captures = []
      for (const c of group) {
        const author = await ctx.db.get(c.authorId)
        captures.push({ _id: c._id, title: c.title, authorName: author?.name ?? "Unknown", handedInAt: c.handedInAt ?? null })
      }
      out.push({
        job: group[0].job ?? group[0].title,
        captureIds: group.map((c) => c._id),
        captures,
        authorCount: new Set(group.map((c) => c.authorId)).size,
        existingSetId: existing?._id ?? null,
        newSinceSet: existing ? notInSet.length : group.length,
      })
    }
    out.sort((a, b) => b.captureIds.length - a.captureIds.length)
    return out
  },
})

// ---- internal, for the AI -------------------------------------------------------------

export const loadForCombine = internalQuery({
  args: { setId: v.id("captureSets") },
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.setId)
    if (!s) return null
    const captures = []
    for (const id of s.captureIds) {
      const c = await ctx.db.get(id)
      if (!c) continue
      const author = await ctx.db.get(c.authorId)
      const moments = await ctx.db
        .query("captureMoments")
        .withIndex("by_captureId_and_order", (q) => q.eq("captureId", c._id))
        .take(300)
      const out = []
      for (const m of moments) {
        const a = m.assetId ? await ctx.db.get(m.assetId) : null
        out.push({ kind: m.kind, title: m.title, detail: m.detail, assetCode: a?.code ?? null, entryIds: m.entryIds })
      }
      captures.push({
        _id: c._id,
        title: c.title,
        authorName: author?.name ?? "Unknown",
        authorRole: author?.role ?? "",
        handedInAt: c.handedInAt ?? c.startedAt,
        summary: c.summary ?? "",
        moments: out,
      })
    }
    return { set: { _id: s._id, title: s.title, job: s.job ?? null }, captures }
  },
})

const stepValidator = v.object({
  title: v.string(),
  detail: v.string(),
  kind: momentKind,
  supportedBy: v.array(v.id("captures")),
  variations: v.array(
    v.object({
      captureId: v.id("captures"),
      kind: v.union(v.literal("different"), v.literal("skipped"), v.literal("extra")),
      text: v.string(),
    }),
  ),
  conflict: v.optional(v.object({ documentId: v.id("documents"), namingCode: v.string(), quote: v.string(), note: v.string() })),
  suggestion: v.optional(v.string()),
  evidenceEntryIds: v.optional(v.array(v.id("captureEntries"))),
})

export const saveCombined = internalMutation({
  args: { setId: v.id("captureSets"), summary: v.string(), steps: v.array(stepValidator) },
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.setId)
    if (!s) return
    const allowed = new Set<string>(s.captureIds)
    const steps = args.steps.map((st) => ({
      ...st,
      supportedBy: st.supportedBy.filter((id) => allowed.has(id)),
      variations: st.variations.filter((vr) => allowed.has(vr.captureId)),
    }))
    await ctx.db.patch(s._id, {
      status: "ready",
      error: undefined,
      combined: { summary: args.summary, steps, combinedAt: Date.now() },
    })
  },
})

export const markCombineFailed = internalMutation({
  args: { setId: v.id("captureSets"), error: v.string() },
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.setId)
    if (s) await ctx.db.patch(s._id, { status: "failed", error: args.error.slice(0, 400) })
  },
})

/** Vector hits → Published passages only: live version of a non-archived Document. */
export const publishedPassages = internalQuery({
  args: { hits: v.array(v.object({ id: v.id("chunks"), score: v.number() })) },
  handler: async (ctx, args) => {
    const out = []
    const docs = new Map<string, Doc<"documents"> | null>()
    for (const h of args.hits) {
      const c = await ctx.db.get(h.id)
      if (!c) continue
      if (!docs.has(c.documentId)) docs.set(c.documentId, await ctx.db.get(c.documentId))
      const d = docs.get(c.documentId)
      if (!d || !isPublished(d) || c.version !== d.liveVersion) continue
      out.push({
        chunkId: c._id,
        documentId: d._id,
        namingCode: d.namingCode,
        title: d.title,
        section: c.pageOrSection,
        text: c.text,
        score: h.score,
      })
    }
    return out
  },
})
