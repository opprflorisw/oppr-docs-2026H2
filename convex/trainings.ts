// Trainings (CONTEXT.md: Training, Learning objective, Round; ADR 0002).
//
// A Training is a controlled definition: its Learning objectives (each one
// traceable to a passage of a Published Document), its stops for a Round and
// its pass mark. It follows the Document lifecycle: draft -> in review ->
// approved -> published, versioned, with Engineer sign-offs by a checked-in
// person. Attempts (convex/attempts.ts) always use the live version.
import { ConvexError, v } from "convex/values"
import type { Infer } from "convex/values"
import { internalMutation, internalQuery, mutation, MutationCtx, query, QueryCtx } from "./_generated/server"
import { Doc, Id } from "./_generated/dataModel"
import { requireUserId } from "./lib/auth"
import { publishedVersion } from "./lib/published"
import { normalise, withTableHeaders } from "./ai/grounding"
import type { PublishEvent } from "./lib/onPublish"

export const DEFAULT_PASS_MARK = 80
export const MAX_OBJECTIVES = 12
export const MAX_QUESTIONS_PER_OBJECTIVE = 3

type Ctx = QueryCtx | MutationCtx

// ---- Validators ---------------------------------------------------------------

export const evidenceValidator = v.union(v.literal("none"), v.literal("photo"), v.literal("note"))

/** The Draft that Guided creation and the edit form produce. */
export const draftValidator = v.object({
  title: v.string(),
  kind: v.union(v.literal("course"), v.literal("round")),
  area: v.union(v.string(), v.null()),
  purpose: v.string(),
  objectives: v.array(
    v.object({
      id: v.optional(v.string()),
      text: v.string(),
      documentId: v.id("documents"),
      chunkId: v.union(v.id("chunks"), v.null()),
      quote: v.string(),
    }),
  ),
  stops: v.array(
    v.object({
      assetId: v.id("assets"),
      objectiveIds: v.array(v.string()),
      hint: v.string(),
      evidence: evidenceValidator,
    }),
  ),
  passMark: v.optional(v.number()),
  questionsPerObjective: v.optional(v.number()),
})
export type TrainingDraft = Infer<typeof draftValidator>

type StoredObjective = Doc<"trainingVersions">["objectives"][number]

// ---- Helpers ------------------------------------------------------------------

/** A Training counts (Attempts, Skills) only while it has a live version. */
export function isTrainingLive(t: Doc<"trainings">): boolean {
  return t.liveVersion != null && t.status !== "archived"
}

export async function requireEngineerPerson(ctx: Ctx, personId: Id<"people">) {
  const person = await ctx.db.get(personId)
  if (!person || person.kind !== "engineer")
    throw new ConvexError("Check in as an Engineer to sign this off.")
  return person
}

export async function getVersion(ctx: Ctx, trainingId: Id<"trainings">, version: number) {
  return await ctx.db
    .query("trainingVersions")
    .withIndex("by_trainingId_and_version", (q) => q.eq("trainingId", trainingId).eq("version", version))
    .unique()
}

export interface LivePassage {
  chunkId: Id<"chunks">
  text: string
  /** Text with table headers in front of table cells, for the model and the check. */
  display: string
  section: string | null
}

export interface LiveDoc {
  doc: Doc<"documents">
  version: number
  passages: LivePassage[]
}

/** The Published version's passages of a Document, or null when not Published. */
export async function loadLiveDoc(ctx: Ctx, documentId: Id<"documents">): Promise<LiveDoc | null> {
  const doc = await ctx.db.get(documentId)
  if (!doc) return null
  const version = publishedVersion(doc)
  if (version == null) return null
  const chunks = await ctx.db
    .query("chunks")
    .withIndex("by_documentId_and_version", (q) => q.eq("documentId", documentId).eq("version", version))
    .take(1000)
  chunks.sort((a, b) => a.seq - b.seq)
  const display = withTableHeaders(chunks.map((c) => ({ text: c.text, section: c.pageOrSection })))
  return {
    doc,
    version,
    passages: chunks.map((c, i) => ({
      chunkId: c._id,
      text: c.text,
      display: display[i],
      section: c.pageOrSection,
    })),
  }
}

export function makeDocCache(ctx: Ctx) {
  const cache = new Map<string, Promise<LiveDoc | null>>()
  return (id: Id<"documents">) => {
    const key = String(id)
    if (!cache.has(key)) cache.set(key, loadLiveDoc(ctx, id))
    return cache.get(key)!
  }
}

const squash = (s: string) => normalise(s).replace(/\s+/g, " ").trim()

export function quoteIn(quote: string, text: string): boolean {
  const q = squash(quote)
  return q.length > 0 && squash(text).includes(q)
}

export type ObjectiveCheck =
  /** The quoted passage is in the version the objective was written against, which is still live. */
  | "current"
  /** The Document has a newer Published version, and the quoted passage is still in it. */
  | "moved"
  /** The Document has a newer Published version, and the quoted passage is gone. */
  | "missing"
  /** The Document is no longer Published. */
  | "unpublished"

/** Where an objective's passage is in the Published version today. */
export function resolveObjective(
  live: LiveDoc | null,
  obj: { chunkId: Id<"chunks"> | null; quote: string; documentVersion: number },
): { check: ObjectiveCheck; passage: LivePassage | null; liveVersion: number | null } {
  if (!live) return { check: "unpublished", passage: null, liveVersion: null }
  let passage = obj.chunkId ? live.passages.find((p) => p.chunkId === obj.chunkId) ?? null : null
  if (passage && !quoteIn(obj.quote, passage.text) && !quoteIn(obj.quote, passage.display)) passage = null
  if (!passage) {
    passage =
      live.passages.find((p) => quoteIn(obj.quote, p.text)) ??
      live.passages.find((p) => quoteIn(obj.quote, p.display)) ??
      null
  }
  if (!passage) return { check: "missing", passage: null, liveVersion: live.version }
  return {
    check: obj.documentVersion === live.version ? "current" : "moved",
    passage,
    liveVersion: live.version,
  }
}

async function allocateTrainingCode(ctx: MutationCtx, area: string): Promise<string> {
  const key = `TRN|${area}`
  const counter = await ctx.db
    .query("namingCounters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique()
  let next = (counter?.value ?? 0) + 1
  // A seeded code may sit ahead of the counter: never hand out a code twice.
  for (;;) {
    const code = `${area}-TRN-${String(next).padStart(4, "0")}`
    const taken = await ctx.db
      .query("trainings")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first()
    if (!taken) break
    next += 1
  }
  if (counter) await ctx.db.patch(counter._id, { value: next })
  else await ctx.db.insert("namingCounters", { key, value: next })
  return `${area}-TRN-${String(next).padStart(4, "0")}`
}

/**
 * Checks a Draft against the Published Knowledge and returns what is stored:
 * every objective cites a passage of its Document's live version and the
 * quote occurs in that passage. Throws a readable ConvexError otherwise.
 */
export async function validateDraft(ctx: MutationCtx, draft: TrainingDraft) {
  const title = draft.title.trim()
  if (!title) throw new ConvexError("Give the Training a title.")
  if (draft.objectives.length > MAX_OBJECTIVES)
    throw new ConvexError(`A Training has at most ${MAX_OBJECTIVES} Learning objectives. Split it in two.`)
  const passMark = Math.round(draft.passMark ?? DEFAULT_PASS_MARK)
  if (passMark < 50 || passMark > 100) throw new ConvexError("The pass mark must be between 50 and 100 percent.")
  const perObjective = Math.round(draft.questionsPerObjective ?? 1)
  if (perObjective < 1 || perObjective > MAX_QUESTIONS_PER_OBJECTIVE)
    throw new ConvexError(`Questions per objective must be 1 to ${MAX_QUESTIONS_PER_OBJECTIVE}.`)

  const docs = makeDocCache(ctx)
  const usedIds = new Set<string>()
  const objectives: StoredObjective[] = []
  for (const [i, o] of draft.objectives.entries()) {
    const n = i + 1
    const text = o.text.trim()
    if (!text) throw new ConvexError(`Learning objective ${n} has no text.`)
    const live = await docs(o.documentId)
    if (!live) {
      const doc = await ctx.db.get(o.documentId)
      throw new ConvexError(
        `Learning objective ${n} cites ${doc?.namingCode ?? "a document"}, which is not published. Trainings use published knowledge only.`,
      )
    }
    const quote = o.quote.trim()
    let passage = o.chunkId ? live.passages.find((p) => p.chunkId === o.chunkId) ?? null : null
    // A chunk of an older version, or no chunk: find the quote in the live version.
    if (!passage && quote) passage = live.passages.find((p) => quoteIn(quote, p.text)) ?? null
    if (!passage)
      throw new ConvexError(
        `Learning objective ${n}: pick a passage of ${live.doc.namingCode} v${live.version} as its source.`,
      )
    const finalQuote = quote || passage.text
    if (!quoteIn(finalQuote, passage.text) && !quoteIn(finalQuote, passage.display))
      throw new ConvexError(
        `Learning objective ${n}: the quote does not occur in the cited passage of ${live.doc.namingCode} v${live.version}.`,
      )
    let id = (o.id ?? "").trim() || `o${n}`
    while (usedIds.has(id)) id = `${id}x`
    usedIds.add(id)
    objectives.push({
      id,
      text,
      documentId: live.doc._id,
      namingCode: live.doc.namingCode,
      documentVersion: live.version,
      chunkId: passage.chunkId,
      quote: finalQuote,
    })
  }

  const stops = []
  if (draft.kind === "round") {
    const seen = new Set<string>()
    for (const [i, s] of draft.stops.entries()) {
      const asset = await ctx.db.get(s.assetId)
      if (!asset) throw new ConvexError(`Stop ${i + 1} points to an Asset that no longer exists.`)
      if (seen.has(String(s.assetId)))
        throw new ConvexError(`${asset.code} is a stop twice. A Round visits each Asset once.`)
      seen.add(String(s.assetId))
      stops.push({
        assetId: s.assetId,
        objectiveIds: Array.from(new Set(s.objectiveIds.filter((x) => usedIds.has(x)))),
        hint: s.hint.trim(),
        evidence: s.evidence,
      })
    }
  }

  return {
    title,
    kind: draft.kind,
    area: draft.area?.trim() ? draft.area.trim().toUpperCase() : null,
    purpose: draft.purpose.trim(),
    objectives,
    stops,
    passMark,
    questionsPerObjective: perObjective,
  }
}

/** What must hold before a Training goes to review or is published. */
function assertComplete(
  kind: "course" | "round",
  row: { objectives: StoredObjective[]; stops: Doc<"trainingVersions">["stops"] },
) {
  if (row.objectives.length === 0) throw new ConvexError("Add at least one Learning objective first.")
  if (kind === "round") {
    if (row.stops.length === 0) throw new ConvexError("A Round needs at least one stop.")
    const covered = new Set(row.stops.flatMap((s) => s.objectiveIds))
    const loose = row.objectives.findIndex((o) => !covered.has(o.id))
    if (loose >= 0)
      throw new ConvexError(`Learning objective ${loose + 1} is not tested at any stop. Add it to a stop.`)
    const empty = row.stops.findIndex((s) => s.objectiveIds.length === 0 && s.evidence === "none")
    if (empty >= 0)
      throw new ConvexError(`Stop ${empty + 1} has nothing to do. Add an objective or ask for a photo or note.`)
  }
}

/** Every objective's passage must still be in its Document's Published version. */
async function assertSourcesLive(ctx: MutationCtx, row: Doc<"trainingVersions">) {
  const docs = makeDocCache(ctx)
  for (const [i, o] of row.objectives.entries()) {
    const r = resolveObjective(await docs(o.documentId), o)
    if (r.check === "unpublished")
      throw new ConvexError(`Learning objective ${i + 1} cites ${o.namingCode}, which is no longer published.`)
    if (r.check === "missing")
      throw new ConvexError(
        `Learning objective ${i + 1}: its quote is no longer in ${o.namingCode} v${r.liveVersion}. Pick a new passage.`,
      )
  }
}

async function loadTraining(ctx: Ctx, id: Id<"trainings">) {
  const t = await ctx.db.get(id)
  if (!t) throw new ConvexError("This Training no longer exists.")
  return t
}

async function currentVersionRow(ctx: Ctx, t: Doc<"trainings">) {
  const row = await getVersion(ctx, t._id, t.currentVersion)
  if (!row) throw new ConvexError("This Training's working version is missing.")
  return row
}

async function personOrNull(ctx: Ctx, personId: Id<"people"> | undefined) {
  if (!personId) return null
  return (await ctx.db.get(personId)) ? personId : null
}

// ---- Lifecycle ----------------------------------------------------------------

/** Creates a draft Training from a Draft. Never published here (ADR 0003). */
export const create = mutation({
  args: { draft: draftValidator, personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const clean = await validateDraft(ctx, args.draft)
    let area = clean.area
    if (!area) {
      const first = clean.objectives[0] ? await ctx.db.get(clean.objectives[0].documentId) : null
      area = first?.location ?? "GEN"
    }
    const code = await allocateTrainingCode(ctx, area)
    const now = Date.now()
    const trainingId = await ctx.db.insert("trainings", {
      code,
      title: clean.title,
      kind: clean.kind,
      status: "draft",
      currentVersion: 1,
      liveVersion: null,
      needsReview: false,
      needsReviewReason: null,
      area,
      createdBy: userId,
      updatedAt: now,
    })
    await ctx.db.insert("trainingVersions", {
      trainingId,
      version: 1,
      purpose: clean.purpose,
      objectives: clean.objectives,
      stops: clean.stops,
      passMark: clean.passMark,
      questionsPerObjective: clean.questionsPerObjective,
      signoffs: [{ role: "author", personId: await personOrNull(ctx, args.personId), userId, at: now }],
      publishedAt: null,
    })
    return trainingId
  },
})

/** Saves a Draft over the working version. A change after review sends it back to draft. */
export const update = mutation({
  args: { id: v.id("trainings"), draft: draftValidator, personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const t = await loadTraining(ctx, args.id)
    if (t.status === "published" || t.status === "archived")
      throw new ConvexError("A published Training is not edited in place. Start a new version first.")
    const row = await currentVersionRow(ctx, t)
    const clean = await validateDraft(ctx, args.draft)
    if (clean.kind !== t.kind && t.liveVersion != null)
      throw new ConvexError("A published Training cannot switch between course and Round.")
    const now = Date.now()
    const backToDraft = t.status === "in_review" || t.status === "approved"
    await ctx.db.patch(t._id, {
      title: clean.title,
      kind: clean.kind,
      status: backToDraft ? "draft" : t.status,
      updatedAt: now,
    })
    const authors = row.signoffs.filter((s) => s.role === "author")
    const personId = await personOrNull(ctx, args.personId)
    if (personId && !authors.some((s) => s.personId === personId))
      authors.push({ role: "author", personId, userId, at: now })
    await ctx.db.patch(row._id, {
      purpose: clean.purpose,
      objectives: clean.objectives,
      stops: clean.stops,
      passMark: clean.passMark,
      questionsPerObjective: clean.questionsPerObjective,
      // Review sign-offs were given for other content.
      signoffs: authors,
    })
    return { backToDraft }
  },
})

export const submitForReview = mutation({
  args: { id: v.id("trainings") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const t = await loadTraining(ctx, args.id)
    if (t.status !== "draft") throw new ConvexError("Only a draft can be sent for review.")
    const row = await currentVersionRow(ctx, t)
    assertComplete(t.kind, row)
    await assertSourcesLive(ctx, row)
    await ctx.db.patch(t._id, { status: "in_review", updatedAt: Date.now() })
  },
})

export const revertToDraft = mutation({
  args: { id: v.id("trainings") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const t = await loadTraining(ctx, args.id)
    if (t.status !== "in_review" && t.status !== "approved")
      throw new ConvexError("Only a Training in review or approved can go back to draft.")
    await ctx.db.patch(t._id, { status: "draft", updatedAt: Date.now() })
  },
})

/** in_review -> approved. A sign-off by a checked-in Engineer. */
export const approve = mutation({
  args: { id: v.id("trainings"), personId: v.id("people") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await requireEngineerPerson(ctx, args.personId)
    const t = await loadTraining(ctx, args.id)
    if (t.status !== "in_review") throw new ConvexError("Only a Training in review can be approved.")
    const row = await currentVersionRow(ctx, t)
    assertComplete(t.kind, row)
    await assertSourcesLive(ctx, row)
    await ctx.db.patch(t._id, { status: "approved", updatedAt: Date.now() })
    await ctx.db.patch(row._id, {
      signoffs: [...row.signoffs, { role: "reviewer", personId: args.personId, userId, at: Date.now() }],
    })
  },
})

/** approved -> published. Attempts use this version from now on. */
export const publish = mutation({
  args: { id: v.id("trainings"), personId: v.id("people") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await requireEngineerPerson(ctx, args.personId)
    const t = await loadTraining(ctx, args.id)
    if (t.status !== "approved") throw new ConvexError("A Training must be approved before it is published.")
    const row = await currentVersionRow(ctx, t)
    assertComplete(t.kind, row)
    await assertSourcesLive(ctx, row)
    const now = Date.now()
    await ctx.db.patch(row._id, {
      publishedAt: now,
      signoffs: [...row.signoffs, { role: "approver", personId: args.personId, userId, at: now }],
    })
    await ctx.db.patch(t._id, {
      status: "published",
      liveVersion: t.currentVersion,
      needsReview: false,
      needsReviewReason: null,
      updatedAt: now,
    })
  },
})

/**
 * Starts the next version as a draft, copied from the live one. The live
 * version stays in use. Authoring a controlled Training needs a checked-in
 * Engineer.
 */
export const newVersion = mutation({
  args: { id: v.id("trainings"), personId: v.id("people") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await requireEngineerPerson(ctx, args.personId)
    const t = await loadTraining(ctx, args.id)
    if (t.status !== "published" || t.liveVersion == null)
      throw new ConvexError("A new version starts from the published one. Finish the version in progress first.")
    const live = await getVersion(ctx, t._id, t.liveVersion)
    if (!live) throw new ConvexError("The published version is missing.")
    const next = t.currentVersion + 1
    const docs = makeDocCache(ctx)
    // Objectives whose passage is still there move onto today's Published version.
    const objectives: StoredObjective[] = []
    for (const o of live.objectives) {
      const r = resolveObjective(await docs(o.documentId), o)
      objectives.push(
        r.passage && r.liveVersion != null ? { ...o, documentVersion: r.liveVersion, chunkId: r.passage.chunkId } : o,
      )
    }
    await ctx.db.insert("trainingVersions", {
      trainingId: t._id,
      version: next,
      purpose: live.purpose,
      objectives,
      stops: live.stops,
      passMark: live.passMark,
      questionsPerObjective: live.questionsPerObjective,
      signoffs: [{ role: "author", personId: args.personId, userId, at: Date.now() }],
      publishedAt: null,
    })
    await ctx.db.patch(t._id, { status: "draft", currentVersion: next, updatedAt: Date.now() })
    return next
  },
})

/**
 * After a Significant change: an Engineer checked the Training against the
 * new Published version and it still holds. Objectives move onto the new
 * version; the check is recorded as a reviewer sign-off on the live version.
 */
export const confirmStillValid = mutation({
  args: { id: v.id("trainings"), personId: v.id("people") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await requireEngineerPerson(ctx, args.personId)
    const t = await loadTraining(ctx, args.id)
    if (!t.needsReview || t.liveVersion == null) throw new ConvexError("This Training does not need a review.")
    const live = await getVersion(ctx, t._id, t.liveVersion)
    if (!live) throw new ConvexError("The published version is missing.")
    const docs = makeDocCache(ctx)
    const objectives: StoredObjective[] = []
    for (const [i, o] of live.objectives.entries()) {
      const r = resolveObjective(await docs(o.documentId), o)
      if (!r.passage || r.liveVersion == null)
        throw new ConvexError(
          `Learning objective ${i + 1}'s passage is no longer in ${o.namingCode}. Start a new version and pick a new passage.`,
        )
      objectives.push({ ...o, documentVersion: r.liveVersion, chunkId: r.passage.chunkId })
    }
    const now = Date.now()
    await ctx.db.patch(live._id, {
      objectives,
      signoffs: [...live.signoffs, { role: "reviewer", personId: args.personId, userId, at: now }],
    })
    await ctx.db.patch(t._id, { needsReview: false, needsReviewReason: null, updatedAt: now })
  },
})

export const archive = mutation({
  args: { id: v.id("trainings"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerPerson(ctx, args.personId)
    const t = await loadTraining(ctx, args.id)
    if (t.status === "archived") return
    await ctx.db.patch(t._id, {
      status: "archived",
      needsReview: false,
      needsReviewReason: null,
      updatedAt: Date.now(),
    })
  },
})

/** Deletes a Training that was never published and has no Attempts. */
export const removeDraft = mutation({
  args: { id: v.id("trainings") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const t = await loadTraining(ctx, args.id)
    if (t.liveVersion != null) throw new ConvexError("A Training that was published is archived, not deleted.")
    const attempt = await ctx.db
      .query("trainingAttempts")
      .withIndex("by_trainingId", (q) => q.eq("trainingId", t._id))
      .first()
    if (attempt) throw new ConvexError("This Training has Attempts. Archive it instead.")
    const versions = await ctx.db
      .query("trainingVersions")
      .withIndex("by_trainingId_and_version", (q) => q.eq("trainingId", t._id))
      .collect()
    for (const row of versions) await ctx.db.delete(row._id)
    await ctx.db.delete(t._id)
  },
})

// ---- Significant change -------------------------------------------------------

/**
 * Called inside the publishing transaction. On a Significant change, every
 * Training whose live version uses this Document goes back to review
 * (needsReview = true, with a reason naming the Document and version).
 */
export async function trainingsAfterPublish(ctx: MutationCtx, event: PublishEvent) {
  if (!event.significantChange) return
  const doc = await ctx.db.get(event.documentId)
  if (!doc) return
  const reason = `${doc.namingCode} v${event.version} was published with a Significant change`
  for (const t of await ctx.db.query("trainings").take(1000)) {
    if (!isTrainingLive(t)) continue
    const live = await getVersion(ctx, t._id, t.liveVersion!)
    if (!live?.objectives.some((o) => o.documentId === event.documentId)) continue
    await ctx.db.patch(t._id, { needsReview: true, needsReviewReason: reason, updatedAt: Date.now() })
  }
}

// ---- Queries ------------------------------------------------------------------

async function statsFor(ctx: QueryCtx, trainingId: Id<"trainings">) {
  const attempts = await ctx.db
    .query("trainingAttempts")
    .withIndex("by_trainingId", (q) => q.eq("trainingId", trainingId))
    .take(2000)
  const passed = attempts.filter((a) => a.status === "passed").length
  const failed = attempts.filter((a) => a.status === "failed").length
  const records = await ctx.db
    .query("trainingRecords")
    .withIndex("by_trainingId", (q) => q.eq("trainingId", trainingId))
    .take(2000)
  return {
    attempts: attempts.length,
    finished: passed + failed,
    passed,
    failed,
    inProgress: attempts.filter((a) => a.status === "in_progress" || a.status === "generating").length,
    passRate: passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) : null,
    records: records.length,
    people: new Set(records.map((r) => String(r.personId))).size,
  }
}

/** The Trainings library, with how each is used. */
export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const all = await ctx.db.query("trainings").take(500)
    const rows = []
    for (const t of all) {
      if (t.status === "archived" && !args.includeArchived) continue
      const row = await getVersion(ctx, t._id, t.currentVersion)
      rows.push({
        _id: t._id,
        code: t.code,
        title: t.title,
        kind: t.kind,
        status: t.status,
        area: t.area,
        currentVersion: t.currentVersion,
        liveVersion: t.liveVersion,
        needsReview: t.needsReview,
        needsReviewReason: t.needsReviewReason,
        updatedAt: t.updatedAt,
        objectives: row?.objectives.length ?? 0,
        stops: row?.stops.length ?? 0,
        passMark: row?.passMark ?? DEFAULT_PASS_MARK,
        documentCodes: Array.from(new Set(row?.objectives.map((o) => o.namingCode) ?? [])),
        stats: await statsFor(ctx, t._id),
      })
    }
    return rows.sort((a, b) => a.code.localeCompare(b.code))
  },
})

async function versionView(ctx: QueryCtx, row: Doc<"trainingVersions">) {
  const docs = makeDocCache(ctx)
  const names = new Map<string, string>()
  const nameOf = async (id: Id<"people"> | null) => {
    if (!id) return null
    if (!names.has(String(id))) names.set(String(id), (await ctx.db.get(id))?.name ?? "Unknown person")
    return names.get(String(id))!
  }
  const objectives = []
  for (const o of row.objectives) {
    const live = await docs(o.documentId)
    const r = resolveObjective(live, o)
    const doc = live?.doc ?? (await ctx.db.get(o.documentId))
    objectives.push({
      ...o,
      documentTitle: doc?.title ?? "Deleted document",
      section: r.passage?.section ?? null,
      check: r.check,
      liveVersion: r.liveVersion,
    })
  }
  const stops = []
  for (const s of row.stops) {
    const asset = await ctx.db.get(s.assetId)
    stops.push({ ...s, code: asset?.code ?? "?", name: asset?.name ?? "Deleted Asset" })
  }
  const signoffs = []
  for (const s of row.signoffs) signoffs.push({ ...s, name: await nameOf(s.personId) })
  return {
    _id: row._id,
    version: row.version,
    purpose: row.purpose,
    passMark: row.passMark,
    questionsPerObjective: row.questionsPerObjective,
    publishedAt: row.publishedAt,
    objectives,
    stops,
    signoffs,
  }
}

/** One Training with its working version, its live version (when different) and history. */
export const get = query({
  args: { id: v.id("trainings") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const t = await ctx.db.get(args.id)
    if (!t) return null
    const rows = await ctx.db
      .query("trainingVersions")
      .withIndex("by_trainingId_and_version", (q) => q.eq("trainingId", t._id))
      .collect()
    const current = rows.find((r) => r.version === t.currentVersion)
    const live = t.liveVersion != null ? rows.find((r) => r.version === t.liveVersion) : undefined
    return {
      training: t,
      current: current ? await versionView(ctx, current) : null,
      live: live && live.version !== t.currentVersion ? await versionView(ctx, live) : null,
      versions: rows
        .sort((a, b) => b.version - a.version)
        .map((r) => ({
          version: r.version,
          publishedAt: r.publishedAt,
          isLive: r.version === t.liveVersion,
          isCurrent: r.version === t.currentVersion,
        })),
      stats: await statsFor(ctx, t._id),
    }
  },
})

function brief(t: Doc<"trainings">) {
  return {
    _id: t._id,
    code: t.code,
    title: t.title,
    kind: t.kind,
    status: t.status,
    liveVersion: t.liveVersion,
    currentVersion: t.currentVersion,
    needsReview: t.needsReview,
  }
}

/** Trainings whose live or working version has an objective from this Document. */
export const forDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const out = []
    for (const t of await ctx.db.query("trainings").take(500)) {
      if (t.status === "archived") continue
      const versions = new Set([t.currentVersion, t.liveVersion].filter((x): x is number => x != null))
      let objectives = 0
      for (const n of versions) {
        const row = await getVersion(ctx, t._id, n)
        objectives = Math.max(objectives, row?.objectives.filter((o) => o.documentId === args.documentId).length ?? 0)
      }
      if (objectives > 0) out.push({ ...brief(t), objectives })
    }
    return out.sort((a, b) => a.code.localeCompare(b.code))
  },
})

/** Rounds that stop at this Asset, and Trainings built on its Documents. */
export const forAsset = query({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const links = await ctx.db
      .query("documentAssets")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId))
      .take(200)
    const docIds = new Set(links.map((l) => String(l.documentId)))
    const rounds = []
    const trainings = []
    for (const t of await ctx.db.query("trainings").take(500)) {
      if (t.status === "archived") continue
      const row = await getVersion(ctx, t._id, t.liveVersion ?? t.currentVersion)
      if (!row) continue
      const stopIndex = row.stops.findIndex((s) => s.assetId === args.assetId)
      if (t.kind === "round" && stopIndex >= 0) {
        rounds.push({ ...brief(t), stopIndex, stops: row.stops.length, hint: row.stops[stopIndex].hint })
        continue
      }
      const codes = Array.from(
        new Set(row.objectives.filter((o) => docIds.has(String(o.documentId))).map((o) => o.namingCode)),
      )
      if (codes.length > 0) trainings.push({ ...brief(t), documentCodes: codes })
    }
    return {
      rounds: rounds.sort((a, b) => a.code.localeCompare(b.code)),
      trainings: trainings.sort((a, b) => a.code.localeCompare(b.code)),
    }
  },
})

/** Engineer work on Home: reviews, publishes and reviews after a Significant change. */
export const inbox = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx)
    const out = []
    for (const t of await ctx.db.query("trainings").take(500)) {
      if (t.status === "archived") continue
      if (t.status === "in_review" || t.status === "approved" || t.needsReview) {
        out.push({ ...brief(t), needsReviewReason: t.needsReviewReason, updatedAt: t.updatedAt })
      }
    }
    // Reviews after a change first: a published Training may be out of date.
    return out.sort((a, b) => Number(b.needsReview) - Number(a.needsReview) || b.updatedAt - a.updatedAt)
  },
})

export async function loadDraftOptions(ctx: QueryCtx) {
  const areas = await ctx.db.query("namingLocations").take(100)
  const assets = await ctx.db.query("assets").take(500)
  const documents = []
  for (const d of await ctx.db.query("documents").take(2000)) {
    const version = publishedVersion(d)
    if (version == null) continue
    documents.push({
      _id: d._id,
      namingCode: d.namingCode,
      title: d.title,
      version,
      area: d.location ?? null,
      discipline: d.discipline ?? null,
    })
  }
  const links = await ctx.db.query("documentAssets").take(5000)
  const docsByAsset = new Map<string, Id<"documents">[]>()
  for (const l of links) {
    const k = String(l.assetId)
    docsByAsset.set(k, [...(docsByAsset.get(k) ?? []), l.documentId])
  }
  return {
    areas: areas.map((a) => ({ code: a.code, label: a.label })).sort((a, b) => a.code.localeCompare(b.code)),
    assets: assets
      .map((a) => ({ _id: a._id, code: a.code, name: a.name, documentIds: docsByAsset.get(String(a._id)) ?? [] }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    documents: documents.sort((a, b) => a.namingCode.localeCompare(b.namingCode)),
  }
}

/** Choices for the Training Draft: published documents, Assets and areas. */
export const draftOptions = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx)
    return await loadDraftOptions(ctx)
  },
})

/** The passages of a Document's Published version, to pick an objective's source. */
export const passages = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const live = await loadLiveDoc(ctx, args.documentId)
    if (!live) return null
    return {
      documentId: live.doc._id,
      namingCode: live.doc.namingCode,
      title: live.doc.title,
      version: live.version,
      passages: live.passages
        .filter((p) => p.text.trim() !== (p.section ?? "").trim())
        .map((p) => ({ chunkId: p.chunkId, text: p.text, section: p.section })),
    }
  },
})

// ---- Internal reads for the Guided creation assistant --------------------------

export const guideContext = internalQuery({
  args: { documentIds: v.array(v.id("documents")) },
  handler: async (ctx, args) => {
    const options = await loadDraftOptions(ctx)
    const docs = []
    for (const id of args.documentIds) {
      const live = await loadLiveDoc(ctx, id)
      if (!live) continue
      docs.push({
        documentId: live.doc._id,
        namingCode: live.doc.namingCode,
        title: live.doc.title,
        version: live.version,
        passages: live.passages.filter((p) => p.text.trim() !== (p.section ?? "").trim()),
      })
    }
    return { options, docs }
  },
})

/** Published Documents of the chunks a vector search found, in order of first hit. */
export const docsForChunks = internalQuery({
  args: { chunkIds: v.array(v.id("chunks")) },
  handler: async (ctx, args) => {
    const order: Id<"documents">[] = []
    for (const id of args.chunkIds) {
      const c = await ctx.db.get(id)
      if (!c) continue
      const doc = await ctx.db.get(c.documentId)
      if (!doc || publishedVersion(doc) !== c.version) continue
      if (!order.includes(doc._id)) order.push(doc._id)
    }
    return order
  },
})

/** Removes a Training by code with its versions; its Attempts must be purged first. Dev clean-up only. */
export const purgeByCode = internalMutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    let removed = 0
    for (const t of await ctx.db
      .query("trainings")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .collect()) {
      const attempt = await ctx.db
        .query("trainingAttempts")
        .withIndex("by_trainingId", (q) => q.eq("trainingId", t._id))
        .first()
      if (attempt) throw new ConvexError("Purge its Attempts first (attempts:purgeAttempt).")
      for (const row of await ctx.db
        .query("trainingVersions")
        .withIndex("by_trainingId_and_version", (q) => q.eq("trainingId", t._id))
        .collect()) {
        await ctx.db.delete(row._id)
        removed += 1
      }
      await ctx.db.delete(t._id)
      removed += 1
    }
    return { removed }
  },
})

/** Skills linked to this Document (read only; the Skills track owns them). */
export const skillsForDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const out = []
    for (const s of await ctx.db.query("skills").take(500)) {
      if (!s.documentIds.includes(args.documentId)) continue
      const holders = await ctx.db
        .query("skillLevels")
        .withIndex("by_skillId", (q) => q.eq("skillId", s._id))
        .take(500)
      out.push({
        _id: s._id,
        name: s.name,
        validityMonths: s.validityMonths,
        holders: holders.filter((h) => h.level >= 1).length,
      })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  },
})
