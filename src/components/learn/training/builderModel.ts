// The Training builder's Draft: what the Engineer edits in the builder and
// what trainings.create/update store. Pure types and helpers, shared by the
// builder's tabs (TrainingGuidedCreation, JobBreakdownEditor,
// QuestionBankEditor, TrainingPreview) and the Training page.
import type { Id } from "../../../../convex/_generated/dataModel"
import type { TrainingKind } from "./lib"

export type KeyPointKind = "safety" | "quality" | "knack"

export interface Citation {
  documentId: Id<"documents">
  namingCode: string
  version: number
  chunkId: Id<"chunks"> | null
  quote: string
}

export interface DraftObjective {
  id: string
  text: string
  documentId: Id<"documents">
  chunkId: Id<"chunks"> | null
  quote: string
  /** Must be right: a wrong answer on it fails the Attempt. */
  critical?: boolean
}

export interface DraftBreakdownRow {
  id: string
  step: string
  keyPoints: string[]
  keyPointKinds: KeyPointKind[]
  reasons: string[]
  objectiveIds: string[]
  citation?: Citation
}

export interface DraftQuestion {
  id: string
  objectiveId: string
  kind: "choice" | "open"
  prompt: string
  options: string[]
  correctIndex: number
  keyPoints?: string[]
  modelAnswer?: string
  explanation: string
  whyWrong?: string[]
  source: "ai" | "engineer"
  stopIndex?: number | null
  imageId?: Id<"images">
  answerByPhoto?: boolean
  /** Builder only: code wrote it because the AI was not available. */
  byCode?: boolean
}

export interface TrainingDraft {
  title: string
  kind: TrainingKind
  area: string | null
  purpose: string
  documentIds: Id<"documents">[]
  objectives: DraftObjective[]
  stops: {
    assetId: Id<"assets">
    objectiveIds: string[]
    hint: string
    evidence: "none" | "photo" | "note"
  }[]
  passMark: number
  questionsPerObjective: number
  breakdown: DraftBreakdownRow[]
  questionBank: DraftQuestion[]
  tryOut: { required: boolean; checklist: string[] } | null
  refreshMonths: number | null
  audience: { profileIds: Id<"skillProfiles">[]; personIds: Id<"people">[]; dueDays: number } | null
  skillIds: Id<"skills">[]
  changeNote: string
}

export const EMPTY_TRAINING_DRAFT: TrainingDraft = {
  title: "",
  kind: "course",
  area: null,
  purpose: "",
  documentIds: [],
  objectives: [],
  stops: [],
  passMark: 80,
  questionsPerObjective: 1,
  breakdown: [],
  questionBank: [],
  tryOut: null,
  refreshMonths: null,
  audience: null,
  skillIds: [],
  changeNote: "",
}

export const uid = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8)}`

/** Field labels, shared by "Changed in the draft" and the field highlights. */
export const F = {
  title: "Title",
  kind: "Kind",
  area: "Area",
  purpose: "Purpose",
  documents: "Source documents",
  objectives: "Learning objectives",
  stops: "Stops",
  passMark: "Pass mark",
  questions: "Questions per objective",
  breakdown: "Job breakdown",
  bank: "Questions",
  tryOut: "Try-out",
  refresh: "Refresher",
  audience: "Audience",
  skills: "Skills proved",
  changeNote: "What changed",
} as const

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x))
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function trainingDraftChanges(a: TrainingDraft, b: TrainingDraft): string[] {
  const out: string[] = []
  if (a.title !== b.title) out.push(F.title)
  if (a.kind !== b.kind) out.push(F.kind)
  if (a.area !== b.area) out.push(F.area)
  if (a.purpose !== b.purpose) out.push(F.purpose)
  if (!sameSet(a.documentIds, b.documentIds)) out.push(F.documents)
  if (!same(a.objectives, b.objectives)) out.push(F.objectives)
  if (!same(a.stops, b.stops)) out.push(F.stops)
  if (a.passMark !== b.passMark) out.push(F.passMark)
  if (a.questionsPerObjective !== b.questionsPerObjective) out.push(F.questions)
  if (!same(a.breakdown, b.breakdown)) out.push(F.breakdown)
  if (!same(a.questionBank, b.questionBank)) out.push(F.bank)
  if (!same(a.tryOut, b.tryOut)) out.push(F.tryOut)
  if (a.refreshMonths !== b.refreshMonths) out.push(F.refresh)
  if (!same(a.audience, b.audience)) out.push(F.audience)
  if (!sameSet(a.skillIds, b.skillIds)) out.push(F.skills)
  if (a.changeNote !== b.changeNote) out.push(F.changeNote)
  return out
}

export function hasSafety(d: Pick<TrainingDraft, "breakdown">) {
  return d.breakdown.some((r) => r.keyPointKinds.includes("safety"))
}

/** The try-out checklist from the breakdown: each step, its key points, then the reason. */
export function checklistFromBreakdown(rows: DraftBreakdownRow[]): string[] {
  const out: string[] = []
  for (const r of rows) {
    out.push(r.step)
    for (const k of r.keyPoints) out.push(`  ${k}`)
  }
  if (rows.some((r) => r.reasons.length > 0)) out.push("Explained the reason for each key point")
  return out.map((x) => x.trim()).filter(Boolean)
}

export type CheckTab = "source" | "breakdown" | "questions" | "tryout" | "people"

export interface Check {
  tab: CheckTab
  text: string
  /** Blocks saving (the server would refuse). Others only block Send for review. */
  blocksSave: boolean
  /** Two or three words for the tab badge: "Needs: title". */
  short?: string
}

/** What is missing, per tab, before the Draft can be saved or sent for review. */
export function builderChecks(d: TrainingDraft, opts: { version: number }): Check[] {
  const out: Check[] = []
  if (!d.title.trim()) out.push({ tab: "source", text: "Give the Training a title.", blocksSave: true, short: "title" })
  if (d.objectives.length === 0)
    out.push({ tab: "source", text: "Add at least one Learning objective.", blocksSave: true, short: "an objective" })
  const noText = d.objectives.findIndex((o) => !o.text.trim())
  if (noText >= 0) out.push({ tab: "source", text: `Learning objective ${noText + 1} needs a text.`, blocksSave: true, short: "objective text" })
  const noSource = d.objectives.findIndex((o) => !o.chunkId)
  if (noSource >= 0)
    out.push({ tab: "source", text: `Learning objective ${noSource + 1} needs a source passage.`, blocksSave: true, short: "a passage" })
  if (d.kind === "round") {
    if (d.stops.length === 0) out.push({ tab: "source", text: "A Round needs at least one stop.", blocksSave: false, short: "a stop" })
    const covered = new Set(d.stops.flatMap((s) => s.objectiveIds))
    const loose = d.objectives.findIndex((o) => !covered.has(o.id))
    if (d.stops.length > 0 && loose >= 0)
      out.push({ tab: "source", text: `Learning objective ${loose + 1} is not tested at any stop.`, blocksSave: false, short: "a stop per objective" })
  }
  const emptyStep = d.breakdown.findIndex((r) => !r.step.trim())
  if (emptyStep >= 0) out.push({ tab: "breakdown", text: `Step ${emptyStep + 1} has no text.`, blocksSave: true, short: "step text" })
  const noReason = d.breakdown.findIndex((r) => r.keyPoints.some((k) => k.trim()) && r.reasons.every((x) => !x.trim()))
  if (noReason >= 0)
    out.push({
      tab: "breakdown",
      text: `Step ${noReason + 1} has no reason. Ask the author, or remove the step.`,
      blocksSave: false,
      short: "a reason",
    })
  for (const [i, q] of d.questionBank.entries()) {
    const n = i + 1
    if (!q.prompt.trim()) out.push({ tab: "questions", text: `Question ${n} has no text.`, blocksSave: true, short: "question text" })
    else if (q.kind === "choice") {
      const opts = q.options.map((x) => x.trim())
      if (opts.filter(Boolean).length < 2 || opts.some((x) => !x))
        out.push({ tab: "questions", text: `Question ${n} needs at least two filled answer options.`, blocksSave: true, short: "answer options" })
      else if (new Set(opts.map((x) => x.toLowerCase())).size !== opts.length)
        out.push({ tab: "questions", text: `Question ${n} has the same answer twice.`, blocksSave: true, short: "different answers" })
      else if (q.correctIndex < 0 || q.correctIndex >= opts.length)
        out.push({ tab: "questions", text: `Question ${n}: mark which answer is right.`, blocksSave: true, short: "right answer" })
    } else if (!(q.keyPoints ?? []).some((k) => k.trim()))
      out.push({ tab: "questions", text: `Open question ${n} needs a key point a good answer names.`, blocksSave: true, short: "a key point" })
    if (!d.objectives.some((o) => o.id === q.objectiveId))
      out.push({ tab: "questions", text: `Question ${n} tests an objective that was removed.`, blocksSave: true, short: "an objective" })
  }
  if (d.questionBank.length > 0) {
    const asked = new Set(d.questionBank.map((q) => q.objectiveId))
    const untested = d.objectives.findIndex((o) => !asked.has(o.id))
    if (untested >= 0)
      out.push({ tab: "questions", text: `Learning objective ${untested + 1} has no question yet.`, blocksSave: false, short: "a question" })
  }
  if (hasSafety(d) && !d.tryOut?.required)
    out.push({ tab: "tryout", text: "A safety key point needs a try-out at the line.", blocksSave: false, short: "try-out" })
  if (d.tryOut?.required && d.tryOut.checklist.length === 0)
    out.push({ tab: "tryout", text: "The try-out needs a checklist.", blocksSave: false, short: "a checklist" })
  if (opts.version > 1 && !d.changeNote.trim())
    out.push({ tab: "source", text: "Say what changed in this version and why.", blocksSave: false, short: "change note" })
  return out
}

/** What trainings.create/update store: the Draft without builder-only fields. */
export function toServerDraft(d: TrainingDraft) {
  return {
    title: d.title,
    kind: d.kind,
    area: d.area,
    purpose: d.purpose,
    objectives: d.objectives.map((o) => ({
      id: o.id,
      text: o.text,
      documentId: o.documentId,
      chunkId: o.chunkId,
      quote: o.quote,
      ...(o.critical ? { critical: true } : {}),
    })),
    stops: d.kind === "round" ? d.stops : [],
    passMark: d.passMark,
    questionsPerObjective: d.questionsPerObjective,
    breakdown: d.breakdown.map((r) => ({
      id: r.id,
      step: r.step,
      keyPoints: r.keyPoints,
      keyPointKinds: r.keyPointKinds,
      reasons: r.reasons,
      objectiveIds: r.objectiveIds,
      ...(r.citation ? { citation: r.citation } : {}),
    })),
    questionBank: d.questionBank.map((q) => ({
      id: q.id,
      objectiveId: q.objectiveId,
      kind: q.kind,
      prompt: q.prompt,
      options: q.kind === "choice" ? q.options : [],
      correctIndex: q.kind === "choice" ? q.correctIndex : 0,
      ...(q.kind === "open" ? { keyPoints: q.keyPoints ?? [] } : {}),
      ...(q.kind === "open" && q.modelAnswer ? { modelAnswer: q.modelAnswer } : {}),
      explanation: q.explanation,
      ...(q.kind === "choice" && q.whyWrong ? { whyWrong: q.whyWrong } : {}),
      source: q.source,
      ...(q.stopIndex != null ? { stopIndex: q.stopIndex } : {}),
      ...(q.imageId ? { imageId: q.imageId } : {}),
      ...(q.kind === "open" && q.answerByPhoto ? { answerByPhoto: true } : {}),
    })),
    tryOut: d.tryOut,
    refreshMonths: d.refreshMonths,
    audience: d.audience,
    skillIds: d.skillIds,
    ...(d.changeNote.trim() ? { changeNote: d.changeNote.trim() } : {}),
  }
}

/** The part of the Draft the conversation assistant (ai.training.guide) works on. */
export function toGuideDraft(d: TrainingDraft) {
  return {
    title: d.title,
    kind: d.kind,
    area: d.area,
    purpose: d.purpose,
    documentIds: d.documentIds,
    objectives: d.objectives.map((o) => ({
      id: o.id,
      text: o.text,
      documentId: o.documentId,
      chunkId: o.chunkId,
      quote: o.quote,
    })),
    stops: d.stops,
    passMark: d.passMark,
    questionsPerObjective: d.questionsPerObjective,
  }
}

/**
 * The assistant's answer folded back into the full Draft: what it does not
 * know (breakdown, questions, try-out, people) is kept, minus links to
 * objectives it removed. An explicit kind choice stays locked.
 */
export function mergeGuide(
  before: TrainingDraft,
  next: ReturnType<typeof toGuideDraft>,
  lockedKind: boolean,
): TrainingDraft {
  const critical = new Set(before.objectives.filter((o) => o.critical).map((o) => o.id))
  const objectives = next.objectives.map((o) => ({ ...o, ...(critical.has(o.id) ? { critical: true } : {}) }))
  const ids = new Set(objectives.map((o) => o.id))
  const kind = lockedKind ? before.kind : next.kind
  return {
    ...before,
    ...next,
    kind,
    stops: kind === "round" ? next.stops : [],
    objectives,
    breakdown: before.breakdown.map((r) => ({ ...r, objectiveIds: r.objectiveIds.filter((x) => ids.has(x)) })),
    questionBank: before.questionBank.filter((q) => ids.has(q.objectiveId)),
  }
}

/** The plain-words pass rule, as the Operator reads it. */
export function passRuleText(total: number, passMark: number, critical: number): string {
  const allowedWrong = Math.max(0, Math.floor(total * (1 - passMark / 100) + 1e-9))
  if (critical > 0)
    return allowedWrong === 0
      ? "Every question right, the safety questions included."
      : `All must-be-right questions right, and at most ${allowedWrong} other ${allowedWrong === 1 ? "question" : "questions"} wrong.`
  return allowedWrong === 0 ? "Every question right." : `At most ${allowedWrong} ${allowedWrong === 1 ? "question" : "questions"} wrong.`
}

/** How many questions one Attempt asks (same rule as trainings.questionCount on the server). */
export function questionCount(d: Pick<TrainingDraft, "questionBank" | "objectives" | "questionsPerObjective">) {
  const bankUsed = d.questionBank.length > 0
  let n = 0
  for (const o of d.objectives) {
    const per = o.critical ? Math.max(2, d.questionsPerObjective) : d.questionsPerObjective
    if (!bankUsed) {
      n += per
      continue
    }
    const inBank = d.questionBank.filter((q) => q.objectiveId === o.id).length
    n += inBank > 0 ? Math.min(per, inBank) : per
  }
  return n
}

const STOP = new Set(
  "a an the and or of to in on at for with by is are be do you your what how when which who why it its this that from as if then than not no".split(" "),
)
function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\u00c0-\u024f ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => w.replace(/(ing|es|s)$/, "")),
  )
}

/**
 * Questions that ask nearly the same thing as an earlier question on the same
 * objective (word overlap of the prompts). Maps the later question id to the
 * bank number (1-based) of the earlier one.
 */
export function nearDuplicates(bank: DraftQuestion[]): Map<string, number> {
  const out = new Map<string, number>()
  const sets = bank.map((q) => words(q.prompt))
  for (let i = 0; i < bank.length; i++) {
    if (sets[i].size < 2) continue
    for (let j = 0; j < i; j++) {
      if (bank[j].objectiveId !== bank[i].objectiveId || sets[j].size < 2) continue
      let shared = 0
      for (const w of sets[i]) if (sets[j].has(w)) shared++
      const overlap = shared / Math.min(sets[i].size, sets[j].size)
      if (overlap >= 0.6) {
        out.set(bank[i].id, j + 1)
        break
      }
    }
  }
  return out
}
