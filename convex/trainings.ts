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
import { bodyChunks } from "./lib/chunking"
import { createAssignments } from "./assignments"
import { readOrgSettings } from "./orgSettings"
import { isEngineerOrAdmin } from "./lib/roles"

const DAY = 24 * 60 * 60 * 1000
export const DEFAULT_PASS_MARK = 80
export const MAX_OBJECTIVES = 12
export const MAX_QUESTIONS_PER_OBJECTIVE = 3

type Ctx = QueryCtx | MutationCtx

// ---- Validators ---------------------------------------------------------------

export const evidenceValidator = v.union(v.literal("none"), v.literal("photo"), v.literal("note"))

export const citationValidator = v.object({
  documentId: v.id("documents"),
  namingCode: v.string(),
  version: v.number(),
  chunkId: v.union(v.id("chunks"), v.null()),
  quote: v.string(),
})

export const keyPointKindValidator = v.union(v.literal("safety"), v.literal("quality"), v.literal("knack"))

/** One row of the TWI Job breakdown: important step, key points (with kind) and reasons. */
export const breakdownRowValidator = v.object({
  id: v.optional(v.string()),
  step: v.string(),
  keyPoints: v.array(v.string()),
  keyPointKinds: v.optional(v.array(keyPointKindValidator)),
  reasons: v.array(v.string()),
  objectiveIds: v.array(v.string()),
  citation: v.optional(citationValidator),
})

/**
 * One question of the Engineer-controlled question bank. The citation is set
 * by the server from the objective, so every question cites its passage.
 */
export const bankItemValidator = v.object({
  id: v.optional(v.string()),
  objectiveId: v.string(),
  kind: v.union(v.literal("choice"), v.literal("open")),
  prompt: v.string(),
  options: v.array(v.string()),
  correctIndex: v.number(),
  keyPoints: v.optional(v.array(v.string())),
  modelAnswer: v.optional(v.string()),
  explanation: v.string(),
  whyWrong: v.optional(v.array(v.string())),
  source: v.optional(v.union(v.literal("ai"), v.literal("engineer"))),
  stopIndex: v.optional(v.union(v.number(), v.null())),
  imageId: v.optional(v.id("images")),
  answerByPhoto: v.optional(v.boolean()),
})
export type BankItemInput = Infer<typeof bankItemValidator>
export type BankItem = NonNullable<Doc<"trainingVersions">["questionBank"]>[number]
export type BreakdownRow = NonNullable<Doc<"trainingVersions">["breakdown"]>[number]

export const audienceValidator = v.object({
  profileIds: v.array(v.id("skillProfiles")),
  personIds: v.array(v.id("people")),
  dueDays: v.number(),
})

export const tryOutValidator = v.object({ required: v.boolean(), checklist: v.array(v.string()) })

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
      critical: v.optional(v.boolean()),
      keyPointId: v.optional(v.string()),
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
  // TWI and builder fields. Left out = keep what is stored (update) or none (create).
  breakdown: v.optional(v.array(breakdownRowValidator)),
  questionBank: v.optional(v.array(bankItemValidator)),
  audience: v.optional(v.union(audienceValidator, v.null())),
  skillIds: v.optional(v.array(v.id("skills"))),
  tryOut: v.optional(v.union(tryOutValidator, v.null())),
  refreshMonths: v.optional(v.union(v.number(), v.null())),
  changeNote: v.optional(v.string()),
})
export type TrainingDraft = Infer<typeof draftValidator>

type StoredObjective = Doc<"trainingVersions">["objectives"][number]

/** Plain Operator copy for a Training that cannot be done right now. */
export const BLOCKED_REASON = "This Training is being updated. You can do it once an Engineer has checked it."
export const FOUR_EYES = "You wrote this version. Another Engineer must review it."

// ---- Helpers ------------------------------------------------------------------

/** A Training counts (Attempts, Skills) only while it has a live version. */
export function isTrainingLive(t: Doc<"trainings">): boolean {
  return t.liveVersion != null && t.status !== "archived"
}

export async function requireEngineerPerson(ctx: Ctx, personId: Id<"people">) {
  const person = await ctx.db.get(personId)
  if (!person || !isEngineerOrAdmin(person))
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
  const defaults = (await readOrgSettings(ctx)).training
  const passMark = Math.round(draft.passMark ?? defaults.passMark)
  if (passMark < 50 || passMark > 100) throw new ConvexError("The pass mark must be between 50 and 100 percent.")
  const perObjective = Math.round(draft.questionsPerObjective ?? defaults.questionsPerObjective)
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
      ...(o.critical ? { critical: true } : {}),
      ...(o.keyPointId?.trim() ? { keyPointId: o.keyPointId.trim() } : {}),
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

const uid = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8)}`

function citationOf(o: StoredObjective) {
  return {
    documentId: o.documentId,
    namingCode: o.namingCode,
    version: o.documentVersion,
    chunkId: o.chunkId,
    quote: o.quote,
  }
}

/**
 * Checks one question of the bank against the version's objectives. The
 * citation always comes from the objective, so a question cannot cite
 * anything but the passage its objective is traceable to.
 */
export async function cleanBankItem(
  ctx: Ctx,
  item: BankItemInput,
  objectives: StoredObjective[],
  kind: "course" | "round",
  stops: Doc<"trainingVersions">["stops"],
  n: number,
): Promise<BankItem> {
  const o = objectives.find((x) => x.id === item.objectiveId)
  if (!o) throw new ConvexError(`Question ${n} tests a Learning objective that is not in this Training.`)
  const prompt = item.prompt.trim()
  if (!prompt) throw new ConvexError(`Question ${n} has no question text.`)
  const explanation = item.explanation.trim()
  let options: string[] = []
  let correctIndex = 0
  let whyWrong: string[] | undefined
  let keyPoints: string[] | undefined
  if (item.kind === "choice") {
    options = item.options.map((x) => x.trim()).filter(Boolean)
    if (options.length < 2) throw new ConvexError(`Question ${n} needs at least 2 answer options.`)
    if (new Set(options.map((x) => x.toLowerCase())).size !== options.length)
      throw new ConvexError(`Question ${n} has the same answer option twice.`)
    if (!Number.isInteger(item.correctIndex) || item.correctIndex < 0 || item.correctIndex >= options.length)
      throw new ConvexError(`Question ${n}: mark which option is right.`)
    correctIndex = item.correctIndex
    if (item.whyWrong && item.whyWrong.length > 0) {
      whyWrong = item.whyWrong.map((x) => x.trim()).slice(0, options.length - 1)
      while (whyWrong.length < options.length - 1) whyWrong.push("")
    }
  } else {
    keyPoints = (item.keyPoints ?? []).map((x) => x.trim()).filter(Boolean)
    if (keyPoints.length === 0)
      throw new ConvexError(`Question ${n} is an open question: add at least one key point a good answer names.`)
  }
  if (item.imageId && !(await ctx.db.get(item.imageId))) throw new ConvexError(`Question ${n}: its picture no longer exists.`)
  let stopIndex: number | null = null
  if (kind === "round") {
    const own = item.stopIndex ?? null
    stopIndex = own != null && own >= 0 && own < stops.length ? own : stops.findIndex((s) => s.objectiveIds.includes(o.id))
    if (stopIndex < 0) stopIndex = null
  }
  if (item.answerByPhoto && item.kind !== "open")
    throw new ConvexError(`Question ${n}: only an open question can be answered with a photo.`)
  return {
    id: item.id?.trim() || uid("qb"),
    objectiveId: o.id,
    kind: item.kind,
    prompt,
    options,
    correctIndex,
    ...(keyPoints ? { keyPoints } : {}),
    ...(item.modelAnswer?.trim() ? { modelAnswer: item.modelAnswer.trim() } : {}),
    explanation,
    citation: citationOf(o),
    source: item.source ?? "engineer",
    stopIndex,
    ...(item.imageId ? { imageId: item.imageId } : {}),
    ...(item.answerByPhoto ? { answerByPhoto: true } : {}),
    ...(whyWrong ? { whyWrong } : {}),
  }
}

/** Checks one breakdown row: text, kinds parallel to key points, objectives that exist. */
export function cleanBreakdownRow(row: Infer<typeof breakdownRowValidator>, objectives: StoredObjective[], n: number): BreakdownRow {
  const step = row.step.trim()
  if (!step) throw new ConvexError(`Step ${n} of the breakdown has no text.`)
  const keyPoints = row.keyPoints.map((x) => x.trim())
  const kinds = keyPoints.map((_, i) => row.keyPointKinds?.[i] ?? "quality")
  const keep = keyPoints.map((k) => k !== "")
  const ids = new Set(objectives.map((o) => o.id))
  const objectiveIds = row.objectiveIds.filter((x) => ids.has(x))
  const first = objectives.find((o) => objectiveIds.includes(o.id))
  return {
    id: row.id?.trim() || uid("b"),
    step,
    keyPoints: keyPoints.filter((_, i) => keep[i]),
    keyPointKinds: kinds.filter((_, i) => keep[i]),
    reasons: row.reasons.map((x) => x.trim()).filter(Boolean),
    objectiveIds,
    ...(row.citation ? { citation: row.citation } : first ? { citation: citationOf(first) } : {}),
  }
}

/** The builder fields of a Draft, checked. Undefined fields are left as they are. */
async function cleanExtras(
  ctx: Ctx,
  draft: TrainingDraft,
  clean: { kind: "course" | "round"; objectives: StoredObjective[]; stops: Doc<"trainingVersions">["stops"] },
) {
  const out: Partial<
    Pick<
      Doc<"trainingVersions">,
      "breakdown" | "questionBank" | "audience" | "skillIds" | "tryOut" | "refreshMonths" | "changeNote"
    >
  > = {}
  if (draft.breakdown) out.breakdown = draft.breakdown.map((r, i) => cleanBreakdownRow(r, clean.objectives, i + 1))
  if (draft.questionBank) {
    const bank: BankItem[] = []
    for (const [i, q] of draft.questionBank.entries())
      bank.push(await cleanBankItem(ctx, q, clean.objectives, clean.kind, clean.stops, i + 1))
    out.questionBank = bank
  }
  if (draft.audience !== undefined) {
    if (draft.audience === null) out.audience = undefined
    else {
      const due = Math.round(draft.audience.dueDays)
      if (due < 1 || due > 365) throw new ConvexError("The due date is 1 to 365 days after publishing.")
      out.audience = {
        profileIds: [...new Set(draft.audience.profileIds)],
        personIds: [...new Set(draft.audience.personIds)],
        dueDays: due,
      }
    }
  }
  if (draft.skillIds) {
    for (const id of draft.skillIds) if (!(await ctx.db.get(id))) throw new ConvexError("A Skill this Training proves no longer exists.")
    out.skillIds = [...new Set(draft.skillIds)]
  }
  if (draft.tryOut !== undefined)
    out.tryOut = draft.tryOut
      ? { required: draft.tryOut.required, checklist: draft.tryOut.checklist.map((x) => x.trim()).filter(Boolean) }
      : undefined
  if (draft.refreshMonths !== undefined) {
    const m = draft.refreshMonths
    if (m != null && (!Number.isInteger(m) || m < 1 || m > 60))
      throw new ConvexError("The refresher is 1 to 60 months after passing, or none.")
    out.refreshMonths = m ?? undefined
  }
  if (draft.changeNote !== undefined) out.changeNote = draft.changeNote.trim() || undefined
  return out
}

/** True when the breakdown has a safety key point: the try-out is then required. */
export function hasSafetyKeyPoint(row: Pick<Doc<"trainingVersions">, "breakdown">) {
  return (row.breakdown ?? []).some((b) => (b.keyPointKinds ?? []).includes("safety"))
}

/** What must hold before a Training goes to review or is published. */
function assertComplete(
  kind: "course" | "round",
  row: { objectives: StoredObjective[]; stops: Doc<"trainingVersions">["stops"]; questionBank?: BankItem[] },
) {
  if (row.objectives.length === 0) throw new ConvexError("Add at least one Learning objective first.")
  if (row.questionBank && row.questionBank.length > 0) {
    const asked = new Set(row.questionBank.map((q) => q.objectiveId))
    const untested = row.objectives.findIndex((o) => !asked.has(o.id))
    if (untested >= 0)
      throw new ConvexError(
        `Learning objective ${untested + 1} has no question in the question bank. Add one, or let the AI write it.`,
      )
  }
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
    const extras = await cleanExtras(ctx, args.draft, clean)
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
      ...extras,
      signoffs: [{ role: "author", personId: await personOrNull(ctx, args.personId), userId, at: now }],
      publishedAt: null,
    })
    return trainingId
  },
})

/** Sends a Training that is in review or approved back to draft when it changes. */
async function editable(ctx: MutationCtx, id: Id<"trainings">) {
  const t = await loadTraining(ctx, id)
  if (t.status === "published" || t.status === "archived")
    throw new ConvexError("A published Training is not edited in place. Start a new version first.")
  const row = await currentVersionRow(ctx, t)
  return { t, row }
}

/** After an edit: back to draft, and review sign-offs drop (they were for other content). */
async function touched(ctx: MutationCtx, t: Doc<"trainings">, row: Doc<"trainingVersions">) {
  const backToDraft = t.status === "in_review" || t.status === "approved"
  await ctx.db.patch(t._id, { status: backToDraft ? "draft" : t.status, updatedAt: Date.now() })
  if (backToDraft) await ctx.db.patch(row._id, { signoffs: row.signoffs.filter((s) => s.role === "author") })
  return { backToDraft }
}

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
    const extras = await cleanExtras(ctx, args.draft, clean)
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
      ...extras,
      // Review sign-offs were given for other content.
      signoffs: authors,
    })
    return { backToDraft }
  },
})

/** Every open Finding on a cited passage must be settled or acknowledged with a reason. */
async function assertFindingsAcked(ctx: MutationCtx, row: Doc<"trainingVersions">) {
  const open = await openFindingsByObjective(ctx, row)
  const acks = row.findingAcks ?? []
  for (const [i, o] of row.objectives.entries()) {
    for (const f of open.get(o.id) ?? []) {
      if (acks.some((a) => a.objectiveId === o.id && a.findingId === f.findingId)) continue
      throw new ConvexError(
        `Learning objective ${i + 1} cites a passage with an open contradiction (${f.otherCode}). Settle the Finding first, or tick "I checked this, keep it" and give a reason.`,
      )
    }
  }
}

function authorsOf(row: Doc<"trainingVersions">) {
  return new Set(row.signoffs.filter((s) => s.role === "author" && s.personId).map((s) => String(s.personId)))
}

export const submitForReview = mutation({
  args: {
    id: v.id("trainings"),
    reviewerPersonId: v.optional(v.id("people")),
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const t = await loadTraining(ctx, args.id)
    if (t.status !== "draft") throw new ConvexError("Only a draft can be sent for review.")
    const row = await currentVersionRow(ctx, t)
    assertComplete(t.kind, row)
    await assertSourcesLive(ctx, row)
    if (row.version > 1 && !row.changeNote?.trim())
      throw new ConvexError("Say what changed and why before sending version 2 or later for review.")
    await assertFindingsAcked(ctx, row)
    if (args.reviewerPersonId) {
      const reviewer = await ctx.db.get(args.reviewerPersonId)
      if (!reviewer || !isEngineerOrAdmin(reviewer)) throw new ConvexError("The reviewer must be an Engineer.")
      if (authorsOf(row).has(String(reviewer._id)) || reviewer._id === args.personId)
        throw new ConvexError("The reviewer cannot be an author of this version. Pick another Engineer.")
    }
    await ctx.db.patch(row._id, { reviewerPersonId: args.reviewerPersonId ?? undefined })
    await ctx.db.patch(t._id, { status: "in_review", updatedAt: Date.now() })
  },
})

/** In review or approved, back to draft. Needs a checked-in Engineer and a reason. */
export const revertToDraft = mutation({
  args: { id: v.id("trainings"), personId: v.optional(v.id("people")), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    if (!args.personId) throw new ConvexError("Check in as an Engineer to send this Training back to draft.")
    await requireEngineerPerson(ctx, args.personId)
    const reason = args.reason?.trim()
    if (!reason) throw new ConvexError("Say why it goes back to draft.")
    const t = await loadTraining(ctx, args.id)
    if (t.status !== "in_review" && t.status !== "approved")
      throw new ConvexError("Only a Training in review or approved can go back to draft.")
    const row = await currentVersionRow(ctx, t)
    await ctx.db.patch(row._id, { signoffs: row.signoffs.filter((s) => s.role === "author") })
    await ctx.db.patch(t._id, { status: "draft", updatedAt: Date.now(), needsReviewReason: t.needsReview ? t.needsReviewReason : null })
    return { reason }
  },
})

/** in_review -> approved. A sign-off by a checked-in Engineer who did not write this version. */
export const approve = mutation({
  args: { id: v.id("trainings"), personId: v.id("people") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await requireEngineerPerson(ctx, args.personId)
    const t = await loadTraining(ctx, args.id)
    if (t.status !== "in_review") throw new ConvexError("Only a Training in review can be approved.")
    const row = await currentVersionRow(ctx, t)
    if (authorsOf(row).has(String(args.personId))) throw new ConvexError(FOUR_EYES)
    assertComplete(t.kind, row)
    await assertSourcesLive(ctx, row)
    await assertFindingsAcked(ctx, row)
    const noReason = (row.breakdown ?? []).findIndex((b) => b.keyPoints.length > 0 && b.reasons.length === 0)
    if (noReason >= 0)
      throw new ConvexError(`Step ${noReason + 1} of the breakdown has no reason. Fill it in or remove the step first.`)
    await ctx.db.patch(t._id, { status: "approved", updatedAt: Date.now() })
    await ctx.db.patch(row._id, {
      signoffs: [...row.signoffs, { role: "reviewer", personId: args.personId, userId, at: Date.now() }],
    })
  },
})

/** People in an audience: named people plus everyone holding one of the profiles. */
async function audiencePeople(ctx: Ctx, audience: NonNullable<Doc<"trainingVersions">["audience"]>) {
  const ids = new Set<string>(audience.personIds.map(String))
  if (audience.profileIds.length > 0)
    for (const p of await ctx.db.query("people").take(500))
      if ((p.profileIds ?? []).some((x) => audience.profileIds.includes(x))) ids.add(String(p._id))
  const out: Id<"people">[] = []
  for (const id of ids) {
    const nid = ctx.db.normalizeId("people", id)
    if (nid && (await ctx.db.get(nid))) out.push(nid)
  }
  return out
}

/** approved -> published. Attempts use this version from now on. */
export const publish = mutation({
  args: { id: v.id("trainings"), personId: v.id("people"), sendToAudience: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await requireEngineerPerson(ctx, args.personId)
    const t = await loadTraining(ctx, args.id)
    if (t.status !== "approved") throw new ConvexError("A Training must be approved before it is published.")
    const row = await currentVersionRow(ctx, t)
    if (authorsOf(row).has(String(args.personId))) throw new ConvexError(FOUR_EYES)
    assertComplete(t.kind, row)
    await assertSourcesLive(ctx, row)
    const now = Date.now()
    // A safety key point locks the try-out on, with a checklist from the breakdown.
    const tryOut =
      hasSafetyKeyPoint(row) && !row.tryOut?.required
        ? { required: true, checklist: row.tryOut?.checklist?.length ? row.tryOut.checklist : checklistFrom(row) }
        : row.tryOut
    await ctx.db.patch(row._id, {
      publishedAt: now,
      tryOut,
      signoffs: [...row.signoffs, { role: "approver", personId: args.personId, userId, at: now }],
    })
    await ctx.db.patch(t._id, {
      status: "published",
      liveVersion: t.currentVersion,
      needsReview: false,
      needsReviewReason: null,
      updatedAt: now,
    })
    // Explicit Skill links: the Skills chosen in the draft now count this Training.
    let linked = 0
    for (const skillId of row.skillIds ?? []) {
      const skill = await ctx.db.get(skillId)
      if (!skill || skill.trainingIds.includes(t._id)) continue
      await ctx.db.patch(skill._id, { trainingIds: [...skill.trainingIds, t._id] })
      linked++
    }
    // Who must do it, by when.
    let assigned = 0
    if (row.audience && args.sendToAudience !== false && !t.isPractice) {
      const people = await audiencePeople(ctx, row.audience)
      const r = await createAssignments(ctx, {
        trainingId: t._id,
        personIds: people,
        dueAt: now + row.audience.dueDays * DAY,
        source: "publish",
        reason: `${t.code} v${t.currentVersion} published`,
        assignedBy: args.personId,
      })
      assigned = r.created + r.updated
    }
    return { linked, assigned }
  },
})

/** The try-out checklist from a breakdown: each step, its key points, then the reason. */
export function checklistFrom(row: Pick<Doc<"trainingVersions">, "breakdown" | "tryOut" | "objectives">): string[] {
  if (row.breakdown && row.breakdown.length > 0) {
    const out: string[] = []
    for (const b of row.breakdown) {
      out.push(b.step)
      for (const k of b.keyPoints) out.push(k)
    }
    out.push("Explained the reason for each key point")
    return out
  }
  if (row.tryOut?.checklist?.length) return row.tryOut.checklist
  return row.objectives.map((o) => o.text)
}

/**
 * Starts the next version as a draft, copied from the live one. The live
 * version stays in use. Authoring a controlled Training needs a checked-in
 * Engineer and a change note.
 */
export const newVersion = mutation({
  args: { id: v.id("trainings"), personId: v.id("people"), changeNote: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await requireEngineerPerson(ctx, args.personId)
    const changeNote = args.changeNote?.trim()
    if (!changeNote) throw new ConvexError("Say what will change and why before starting a new version.")
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
      // Builder content carries over; citations move with their objective.
      breakdown: live.breakdown,
      questionBank: live.questionBank?.map((q) => {
        const o = objectives.find((x) => x.id === q.objectiveId)
        return o ? { ...q, citation: citationOf(o) } : q
      }),
      refreshMonths: live.refreshMonths,
      tryOut: live.tryOut,
      audience: live.audience,
      skillIds: live.skillIds,
      changeNote,
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
 * Called inside the publishing transaction. A live Training that cites this
 * Document goes back to review (needsReview, with a reason naming the
 * Document and version) when the change is Significant, or when a passage one
 * of its objectives cites is gone from the new version. Returns true when a
 * cited passage was removed: the change then counts as Significant for the
 * linked Skills too, whatever the author chose.
 */
export async function markAffectedByPublish(ctx: MutationCtx, event: PublishEvent): Promise<boolean> {
  const doc = await ctx.db.get(event.documentId)
  if (!doc) return false
  const live = await loadLiveDoc(ctx, event.documentId)
  let removed = false
  for (const t of await ctx.db.query("trainings").take(1000)) {
    if (!isTrainingLive(t)) continue
    const row = await getVersion(ctx, t._id, t.liveVersion!)
    const cited = row?.objectives.filter((o) => o.documentId === event.documentId) ?? []
    if (cited.length === 0) continue
    const gone = cited.filter((o) => resolveObjective(live, o).check === "missing" || !live)
    if (gone.length > 0) removed = true
    if (!event.significantChange && gone.length === 0) continue
    const reason =
      gone.length > 0
        ? `${doc.namingCode} v${event.version} no longer has the passage ${gone.length === 1 ? "an objective cites" : `${gone.length} objectives cite`}`
        : `${doc.namingCode} v${event.version} was published with a Significant change`
    await ctx.db.patch(t._id, { needsReview: true, needsReviewReason: reason, updatedAt: Date.now() })
  }
  return removed
}

/** Kept for callers of the old name. */
export const trainingsAfterPublish = markAffectedByPublish

/** A Document was withdrawn: every live Training citing it goes back to review. */
export async function markAffectedByWithdraw(ctx: MutationCtx, documentId: Id<"documents">, reason?: string) {
  const doc = await ctx.db.get(documentId)
  let count = 0
  for (const t of await ctx.db.query("trainings").take(1000)) {
    if (!isTrainingLive(t)) continue
    const row = await getVersion(ctx, t._id, t.liveVersion!)
    if (!row?.objectives.some((o) => o.documentId === documentId)) continue
    await ctx.db.patch(t._id, {
      needsReview: true,
      needsReviewReason: reason ?? `${doc?.namingCode ?? "A source document"} was withdrawn`,
      updatedAt: Date.now(),
    })
    count++
  }
  return count
}

/**
 * What publishing a version of a Document does to Trainings: which live
 * Trainings cite it, which objectives, whether a cited passage is gone in
 * the new version, and how many people hold a Skill linked to the Document.
 */
export const impactOfPublish = query({
  args: { documentId: v.id("documents"), fromVersion: v.optional(v.union(v.number(), v.null())), toVersion: v.number() },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_documentId_and_version", (q) => q.eq("documentId", args.documentId).eq("version", args.toVersion))
      .take(1000)
    let texts = chunks.map((c) => ({ text: c.text, section: c.pageOrSection }))
    if (texts.length === 0) {
      const dv = await ctx.db
        .query("documentVersions")
        .withIndex("by_documentId_and_version", (q) => q.eq("documentId", args.documentId).eq("version", args.toVersion))
        .unique()
      if (dv?.bodyKind === "tiptap") texts = bodyChunks(dv.bodyJson)
    }
    const display = withTableHeaders(texts)
    const has = (quote: string) => texts.some((p, i) => quoteIn(quote, p.text) || quoteIn(quote, display[i]))
    const trainings: {
      trainingId: Id<"trainings">
      code: string
      title: string
      objectiveIds: string[]
      passageRemoved: boolean
    }[] = []
    for (const t of await ctx.db.query("trainings").take(1000)) {
      if (!isTrainingLive(t)) continue
      const row = await getVersion(ctx, t._id, t.liveVersion!)
      const cited = row?.objectives.filter((o) => o.documentId === args.documentId) ?? []
      if (cited.length === 0) continue
      trainings.push({
        trainingId: t._id,
        code: t.code,
        title: t.title,
        objectiveIds: cited.map((o) => o.id),
        passageRemoved: cited.some((o) => !has(o.quote)),
      })
    }
    const holders = new Set<string>()
    const skills: { _id: Id<"skills">; name: string; holders: number }[] = []
    for (const s of await ctx.db.query("skills").take(500)) {
      if (!s.documentIds.includes(args.documentId)) continue
      const rows = await ctx.db
        .query("skillLevels")
        .withIndex("by_skillId", (q) => q.eq("skillId", s._id))
        .take(1000)
      const held = rows.filter((r) => r.level >= 1)
      held.forEach((r) => holders.add(String(r.personId)))
      skills.push({ _id: s._id, name: s.name, holders: held.length })
    }
    return {
      trainings: trainings.sort((a, b) => a.code.localeCompare(b.code)),
      holders: holders.size,
      skills,
      passageRemoved: trainings.some((x) => x.passageRemoved),
    }
  },
})

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
        isPractice: t.isPractice ?? false,
        openFindings: row ? [...(await openFindingsByObjective(ctx, row)).values()].reduce((n, l) => n + l.length, 0) : 0,
        signals: await signalSummaryFor(ctx, t),
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
  const findings = await openFindingsByObjective(ctx, row)
  const acks = row.findingAcks ?? []
  const questionBank = []
  for (const q of row.questionBank ?? []) questionBank.push({ ...q, imageUrl: await imageUrl(ctx, q.imageId) })
  const skills = []
  for (const id of row.skillIds ?? []) {
    const s = await ctx.db.get(id)
    if (s) skills.push({ _id: s._id, name: s.name, validityMonths: s.validityMonths })
  }
  const audience = row.audience
    ? {
        ...row.audience,
        profiles: (await Promise.all(row.audience.profileIds.map((id) => ctx.db.get(id))))
          .filter((p): p is Doc<"skillProfiles"> => !!p)
          .map((p) => ({ _id: p._id, name: p.name })),
        people: (await Promise.all(row.audience.personIds.map((id) => ctx.db.get(id))))
          .filter((p): p is Doc<"people"> => !!p)
          .map((p) => ({ _id: p._id, name: p.name })),
        count: (await audiencePeople(ctx, row.audience)).length,
      }
    : null
  return {
    _id: row._id,
    version: row.version,
    purpose: row.purpose,
    passMark: row.passMark,
    questionsPerObjective: row.questionsPerObjective,
    publishedAt: row.publishedAt,
    objectives: objectives.map((o) => ({
      ...o,
      openFindings: (findings.get(o.id) ?? []).map((f) => ({
        ...f,
        acked: acks.find((a) => a.objectiveId === o.id && a.findingId === f.findingId) ?? null,
      })),
    })),
    stops,
    signoffs,
    breakdown: row.breakdown ?? [],
    questionBank,
    refreshMonths: row.refreshMonths ?? null,
    tryOut: row.tryOut ?? null,
    tryOutChecklist: checklistFrom(row),
    tryOutLocked: hasSafetyKeyPoint(row),
    audience,
    skills,
    changeNote: row.changeNote ?? null,
    reviewerPersonId: row.reviewerPersonId ?? null,
    reviewerName: await nameOf(row.reviewerPersonId ?? null),
    authorPersonIds: [...authorsOf(row)],
    findingAcks: row.findingAcks ?? [],
    mustBeRight: row.objectives.filter((o) => o.critical).map((o) => o.id),
  }
}

export async function imageUrl(ctx: Ctx, imageId: Id<"images"> | undefined | null): Promise<string | null> {
  if (!imageId) return null
  const img = await ctx.db.get(imageId)
  if (!img) return null
  if (img.storageId) return await ctx.storage.getUrl(img.storageId)
  return img.externalUrl
}

export interface OpenFindingRef {
  findingId: Id<"findings">
  summary: string
  /** The other side of the contradiction. */
  otherCode: string
  otherDocumentId: Id<"documents">
  otherQuote: string
}

/**
 * Open contradiction Findings on the passage each objective cites: a side
 * of the Finding is the objective's Document, and its chunk or quote is the
 * cited passage.
 */
export async function openFindingsByObjective(ctx: Ctx, row: Pick<Doc<"trainingVersions">, "objectives">) {
  const out = new Map<string, OpenFindingRef[]>()
  const byDoc = new Map<string, Doc<"findings">[]>()
  for (const o of row.objectives) {
    const k = String(o.documentId)
    if (!byDoc.has(k)) {
      const a = await ctx.db
        .query("findings")
        .withIndex("by_documentA_and_status", (q) => q.eq("documentA", o.documentId).eq("status", "open"))
        .take(100)
      const b = await ctx.db
        .query("findings")
        .withIndex("by_documentB_and_status", (q) => q.eq("documentB", o.documentId).eq("status", "open"))
        .take(100)
      byDoc.set(k, [...a, ...b].filter((f) => f.kind === "contradiction"))
    }
    for (const f of byDoc.get(k)!) {
      for (const [side, other] of [
        [f.a, f.b],
        [f.b, f.a],
      ] as const) {
        if (side.documentId !== o.documentId) continue
        const same =
          (side.chunkId != null && side.chunkId === o.chunkId) || quoteIn(side.quote, o.quote) || quoteIn(o.quote, side.quote)
        if (!same) continue
        const list = out.get(o.id) ?? []
        if (!list.some((x) => x.findingId === f._id))
          list.push({
            findingId: f._id,
            summary: f.summary,
            otherCode: other.namingCode,
            otherDocumentId: other.documentId,
            otherQuote: other.quote,
          })
        out.set(o.id, list)
      }
    }
  }
  return out
}

/** Open contradiction Findings per objective of the working version. */
export const openFindingsForObjectives = query({
  args: { trainingId: v.id("trainings") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const t = await ctx.db.get(args.trainingId)
    if (!t) return []
    const row = await getVersion(ctx, t._id, t.currentVersion)
    if (!row) return []
    const map = await openFindingsByObjective(ctx, row)
    const acks = row.findingAcks ?? []
    return row.objectives
      .filter((o) => (map.get(o.id) ?? []).length > 0)
      .map((o) => ({
        objectiveId: o.id,
        objectiveText: o.text,
        findings: (map.get(o.id) ?? []).map((f) => ({
          ...f,
          acked: acks.find((a) => a.objectiveId === o.id && a.findingId === f.findingId) ?? null,
        })),
      }))
  },
})

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
          changeNote: r.changeNote ?? null,
        })),
      stats: await statsFor(ctx, t._id),
      signals: await signalSummaryFor(ctx, t),
      blockedReason: t.needsReview ? BLOCKED_REASON : null,
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

// ---- Training builder: acknowledging an open Finding --------------------------
//
// The builder saves its content with the Draft (create/update). The one
// item it edits on its own is the acknowledgement of an open contradiction
// Finding, which needs a checked-in Engineer and a reason.

async function builderEdit(ctx: MutationCtx, id: Id<"trainings">, personId: Id<"people">) {
  await requireUserId(ctx)
  await requireEngineerPerson(ctx, personId)
  return await editable(ctx, id)
}

/** "I checked this, keep it": an open Finding on a cited passage, acknowledged with a reason. */
export const ackFinding = mutation({
  args: {
    id: v.id("trainings"),
    personId: v.id("people"),
    objectiveId: v.string(),
    findingId: v.id("findings"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { t, row } = await builderEdit(ctx, args.id, args.personId)
    const reason = args.reason.trim()
    if (reason.length < 10) throw new ConvexError("Say in a sentence why the passage can stay as it is.")
    const acks = (row.findingAcks ?? []).filter((a) => !(a.objectiveId === args.objectiveId && a.findingId === args.findingId))
    acks.push({ objectiveId: args.objectiveId, findingId: args.findingId, reason, by: args.personId, at: Date.now() })
    await ctx.db.patch(row._id, { findingAcks: acks })
    await touched(ctx, t, row)
  },
})

/** Marks a Training as practice (never offered "for you", never assigned) or not. */
export const setPractice = mutation({
  args: { id: v.id("trainings"), personId: v.id("people"), isPractice: v.boolean() },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerPerson(ctx, args.personId)
    const t = await loadTraining(ctx, args.id)
    await ctx.db.patch(t._id, { isPractice: args.isPractice, updatedAt: Date.now() })
  },
})

export const setPracticeByCode = internalMutation({
  args: { code: v.string(), isPractice: v.boolean() },
  handler: async (ctx, args) => {
    let n = 0
    for (const t of await ctx.db
      .query("trainings")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .collect()) {
      await ctx.db.patch(t._id, { isPractice: args.isPractice })
      n++
    }
    return n
  },
})

/** How many questions one Attempt asks: per objective, and two for each must-be-right one. */
export function questionCount(row: Pick<Doc<"trainingVersions">, "objectives" | "questionsPerObjective" | "questionBank">) {
  const bankUsed = (row.questionBank?.length ?? 0) > 0
  let n = 0
  for (const o of row.objectives) {
    const per = o.critical ? Math.max(2, row.questionsPerObjective) : row.questionsPerObjective
    if (!bankUsed) {
      n += per
      continue
    }
    const inBank = row.questionBank!.filter((q) => q.objectiveId === o.id).length
    n += inBank > 0 ? Math.min(per, inBank) : per
  }
  return n
}

/** The pass rule in plain words, for the Prepare card and the preview. */
export function passRule(passMark: number, criticalObjectives: number, total: number) {
  const allowedWrong = Math.max(0, Math.floor(total * (1 - passMark / 100) + 1e-9))
  if (criticalObjectives > 0)
    return allowedWrong === 0
      ? "Every question right, the safety questions included."
      : `All safety questions right, and at most ${allowedWrong} other ${allowedWrong === 1 ? "question" : "questions"} wrong.`
  return allowedWrong === 0
    ? "Every question right."
    : `At most ${allowedWrong} ${allowedWrong === 1 ? "question" : "questions"} wrong.`
}

// ---- "Still on point?": training signals ----------------------------------------

const ATTENTION_KINDS = new Set(["misconception", "unclear_question", "document_gap", "practice_differs"])

async function latestSignals(ctx: Ctx, trainingId: Id<"trainings">, version: number) {
  return await ctx.db
    .query("trainingSignals")
    .withIndex("by_trainingId_and_version", (q) => q.eq("trainingId", trainingId).eq("version", version))
    .order("desc")
    .first()
}

/**
 * The one source of "Still on point?" (the builder tab, the Training page
 * signal, the Trainings list and Knowledge health all read this): the latest
 * analysis of the version in use (the live one, else the working one). A new
 * version without its own analysis falls back to the latest older one, and
 * says from which version it is (fromVersion).
 */
export async function signalStateFor(ctx: Ctx, t: Doc<"trainings">) {
  const version = t.liveVersion ?? t.currentVersion
  let fromVersion = version
  let row = await latestSignals(ctx, t._id, version)
  for (let n = version - 1; n >= 1 && !row; n--) {
    row = await latestSignals(ctx, t._id, n)
    if (row) fromVersion = n
  }
  const attentionItems = row?.status === "ready" ? row.items.filter((i) => ATTENTION_KINDS.has(i.kind)) : []
  return { version, fromVersion, row, attentionItems }
}

/** A cheap summary of the latest analysis, for the Training page, the list and Knowledge health. */
export async function signalSummaryFor(ctx: Ctx, t: Doc<"trainings">) {
  const { fromVersion, row, attentionItems } = await signalStateFor(ctx, t)
  if (!row) return null
  const top = [...attentionItems].sort((a, b) => b.count - a.count)[0] ?? null
  return {
    status: row.status,
    at: row.at,
    version: fromVersion,
    attemptsAnalysed: row.attemptsAnalysed,
    needsAttention: attentionItems.length,
    documentGaps: attentionItems.filter((i) => i.kind === "document_gap").length,
    headline: top ? top.text : null,
  }
}

/** Knowledge health: live Trainings whose latest analysis has something that needs attention. */
export const signalsOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx)
    const out = []
    for (const t of await ctx.db.query("trainings").take(500)) {
      if (t.status === "archived") continue
      const s = await signalSummaryFor(ctx, t)
      if (!s || s.needsAttention === 0) continue
      out.push({ trainingId: t._id, code: t.code, title: t.title, ...s })
    }
    return {
      needsAttention: out.length,
      trainings: out.sort((a, b) => b.needsAttention - a.needsAttention || a.code.localeCompare(b.code)),
    }
  },
})

export interface SampleQuestion {
  objectiveId: string
  kind: "choice" | "open"
  prompt: string
  options: string[]
  correctIndex: number
  explanation: string
  whyWrong: string[]
  keyPoints: string[]
  source: "model" | "fallback" | "bank"
  citation: { documentId: Id<"documents">; namingCode: string; version: number; chunkId: Id<"chunks"> | null; quote: string }
}

/** Existing Trainings built on these Documents (for the duplicate warning in step 1). */
export const existingForDocuments = internalQuery({
  args: { documentIds: v.array(v.id("documents")) },
  handler: async (ctx, args) => {
    const out: { _id: Id<"trainings">; code: string; title: string; kind: "course" | "round"; status: string }[] = []
    if (args.documentIds.length === 0) return out
    for (const t of await ctx.db.query("trainings").take(500)) {
      if (t.status === "archived") continue
      const row = await getVersion(ctx, t._id, t.liveVersion ?? t.currentVersion)
      if (row?.objectives.some((o) => args.documentIds.includes(o.documentId)))
        out.push({ _id: t._id, code: t.code, title: t.title, kind: t.kind, status: t.status })
    }
    return out
  },
})
