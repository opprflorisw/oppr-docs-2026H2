// Attempts and Training records (CONTEXT.md: Attempt, Round, Training record;
// ADR 0002: Trainings are controlled, Attempts are generated).
//
// An Attempt is one checked-in person doing the live version of a Training
// once. Its questions come from the Training's question bank when it has one,
// else they are generated fresh (convex/ai/training.ts); either way they test
// every Learning objective and cite their Published source. A pass writes a
// Training record: which version, which questions, which answers, when.
// Failed Attempts are kept too: they are proof of attempts.
//
// Scoring (the rule shown to people as the pass rule):
// - a choice question counts 1 when the right option was chosen, else 0;
// - an open question counts 1 when its grade is "good", 0.5 when "partly"
//   and 0 when "not yet" (or when it could not be graded yet);
// - score = points / questions, in percent;
// - passed = score >= pass mark AND every question on a must-be-right
//   (critical) objective counts 1. "partly" on a must-be-right question is
//   not enough.
//
// Every mutation takes the checked-in personId and checks it against the
// Attempt, so nobody answers in someone else's name.
import { ConvexError, v } from "convex/values"
import { internalMutation, internalQuery, mutation, MutationCtx, query, QueryCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import { Doc, Id } from "./_generated/dataModel"
import { requireUserId } from "./lib/auth"
import {
  BLOCKED_REASON,
  checklistFrom,
  getVersion,
  imageUrl,
  isTrainingLive,
  makeDocCache,
  passRule,
  questionCount,
  requireEngineerPerson,
  resolveObjective,
} from "./trainings"
import { completeAssignments } from "./assignments"
import { isEngineerOrAdmin } from "./lib/roles"
import { readOrgSettings } from "./orgSettings"

type Ctx = QueryCtx | MutationCtx
type Attempt = Doc<"trainingAttempts">
type Question = Attempt["questions"][number]
type Version = Doc<"trainingVersions">

/** Generation that has not finished after this long is started again. */
const STUCK_AFTER_MS = 4 * 60 * 1000
/** Grading of an open answer that has not finished after this long is shown as failed. */
const GRADE_STUCK_MS = 3 * 60 * 1000
/** A refresher asks at most this many questions. */
const REFRESHER_MAX = 5

async function requirePerson(ctx: Ctx, personId: Id<"people">) {
  const person = await ctx.db.get(personId)
  if (!person) throw new ConvexError("Check in first: an Attempt is proof, so it needs to know who you are.")
  return person
}

async function loadOwnAttempt(ctx: MutationCtx, id: Id<"trainingAttempts">, personId: Id<"people">) {
  await requirePerson(ctx, personId)
  const a = await ctx.db.get(id)
  if (!a) throw new ConvexError("This Attempt no longer exists.")
  if (a.personId !== personId) {
    const owner = await ctx.db.get(a.personId)
    throw new ConvexError(`This Attempt belongs to ${owner?.name ?? "someone else"}. Check in as them to continue.`)
  }
  return a
}

async function loadAttemptVersion(ctx: Ctx, a: Attempt) {
  const row = await getVersion(ctx, a.trainingId, a.trainingVersion)
  if (!row) throw new ConvexError("The Training version of this Attempt is missing.")
  return row
}

function requireInProgress(a: Attempt) {
  if (a.status === "generating") throw new ConvexError("Your questions are still being prepared.")
  if (a.status !== "in_progress") throw new ConvexError("This Attempt is finished.")
}

/** Answered: an option chosen, or an open answer given (typed, spoken or a photo). */
export function isAnswered(q: Question) {
  return q.answerIndex !== null || q.answeredAt !== null
}

/** An open answer is being graded: given, no grade yet, no grading error. */
function isGrading(q: Question) {
  return (q.kind ?? "choice") === "open" && q.answeredAt !== null && !q.grade && !q.gradeError
}

/** Points of one question: see the scoring rule at the top of this file. */
export function pointsOf(q: Question): number {
  if ((q.kind ?? "choice") === "open") {
    if (!q.grade) return 0
    return q.grade.verdict === "good" ? 1 : q.grade.verdict === "partly" ? 0.5 : 0
  }
  return q.answerIndex !== null && q.answerIndex === q.correctIndex ? 1 : 0
}

function isCorrect(q: Question) {
  return pointsOf(q) >= 1
}

/** Score, pass and the must-be-right objectives that were missed. */
export function scoreAttempt(questions: Question[], row: Pick<Version, "passMark" | "objectives">) {
  const critical = new Set(row.objectives.filter((o) => o.critical).map((o) => o.id))
  const total = questions.length
  const points = questions.reduce((n, q) => n + pointsOf(q), 0)
  const score = total === 0 ? 0 : Math.round((points / total) * 100)
  const missed = Array.from(
    new Set(questions.filter((q) => (q.critical || critical.has(q.objectiveId)) && pointsOf(q) < 1).map((q) => q.objectiveId)),
  )
  return {
    score,
    points,
    total,
    correct: questions.filter(isCorrect).length,
    mustBeRightMissed: missed,
    passed: total > 0 && score >= row.passMark && missed.length === 0,
  }
}

/** A stop is done when it was scanned, its questions are answered and its evidence is in. */
function stopDone(a: Attempt, stops: Version["stops"], i: number): boolean {
  const stop = stops[i]
  if (!stop || !a.round) return false
  if (!a.round.visited.includes(stop.assetId)) return false
  if (a.questions.some((q) => q.stopIndex === i && !isAnswered(q))) return false
  if (stop.evidence !== "none" && !a.round.evidence.some((e) => e.stopIndex === i)) return false
  return true
}

/** Moves the Round on past every stop that is done. */
function advance(a: Attempt, stops: Version["stops"]): Attempt["round"] {
  if (!a.round) return null
  let current = a.round.currentStop
  while (current < stops.length && stopDone(a, stops, current)) current += 1
  return { ...a.round, currentStop: current }
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Options shuffled by code, with each wrong option's "why wrong" moving with it. */
export function shuffleChoice(options: string[], correctIndex: number, whyWrong?: string[]) {
  const why = new Map<string, string>()
  let k = 0
  options.forEach((o, i) => {
    if (i === correctIndex) return
    why.set(o, whyWrong?.[k] ?? "")
    k++
  })
  const correct = options[correctIndex]
  const next = shuffle(options)
  return {
    options: next,
    correctIndex: next.indexOf(correct),
    whyWrong: whyWrong && whyWrong.length > 0 ? next.filter((o) => o !== correct).map((o) => why.get(o) ?? "") : undefined,
  }
}

/** Consecutive not-passed Attempts of this Training, counting back from the latest. */
/** PPE type order for the Prepare card: the LMRA says it first, then the SOP. */
const PPE_SOURCE_RANK: Record<string, number> = { lmra: 0, sop: 1, work_instruction: 2 }

/**
 * The PPE to wear, from the PPE blocks of the Published source documents
 * (LMRA first, then SOP, then the rest), as labels in the order they appear.
 */
async function ppeFor(ctx: QueryCtx, documentIds: Id<"documents">[]): Promise<string[]> {
  const docs = []
  for (const id of new Set(documentIds)) {
    const doc = await ctx.db.get(id)
    if (doc && doc.liveVersion != null) docs.push(doc)
  }
  docs.sort((x, y) => (PPE_SOURCE_RANK[x.type] ?? 9) - (PPE_SOURCE_RANK[y.type] ?? 9))
  const slugs: string[] = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return
    const node = n as { type?: string; attrs?: { items?: unknown }; content?: unknown[] }
    if (node.type === "ppe") {
      const items = Array.isArray(node.attrs?.items) ? node.attrs.items : String(node.attrs?.items ?? "").split(",")
      for (const x of items) {
        const slug = String(x).trim()
        if (slug && !slugs.includes(slug)) slugs.push(slug)
      }
    }
    for (const c of node.content ?? []) walk(c)
  }
  for (const doc of docs.slice(0, 6)) {
    const version = await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) => q.eq("documentId", doc._id).eq("version", doc.liveVersion as number))
      .first()
    if (version?.bodyKind === "tiptap") walk(version.bodyJson)
  }
  if (slugs.length === 0) return []
  const labels = new Map<string, string>()
  for (const item of await ctx.db.query("ppeItems").take(200)) labels.set(item.slug, item.labelEn || item.label)
  return slugs.map((s) => labels.get(s) ?? s)
}

function failStreakOf(attempts: Attempt[], trainingId: Id<"trainings">) {
  const done = attempts
    .filter((a) => a.trainingId === trainingId && (a.status === "passed" || a.status === "failed"))
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
  let n = 0
  for (const a of done) {
    if (a.status !== "failed") break
    n++
  }
  return n
}

/**
 * Questions drawn from the bank: per objective as many as asked (two for a
 * must-be-right objective when the bank has them), preferring what this
 * person was not asked before. Objectives the bank does not cover are left
 * for the generator.
 */
function drawFromBank(
  row: Version,
  kind: "course" | "round",
  objectiveIds: string[],
  askedBefore: Set<string>,
): { questions: Question[]; missing: string[] } {
  const bank = row.questionBank ?? []
  const out: Question[] = []
  const missing: string[] = []
  for (const o of row.objectives.filter((x) => objectiveIds.includes(x.id))) {
    const per = o.critical ? Math.max(2, row.questionsPerObjective) : row.questionsPerObjective
    const items = bank.filter((q) => q.objectiveId === o.id)
    if (items.length === 0) {
      missing.push(o.id)
      continue
    }
    const fresh = shuffle(items.filter((q) => !askedBefore.has(q.prompt)))
    const seen = shuffle(items.filter((q) => askedBefore.has(q.prompt)))
    for (const q of [...fresh, ...seen].slice(0, per)) {
      const stopIndex =
        kind === "round"
          ? q.stopIndex ?? (row.stops.findIndex((s) => s.objectiveIds.includes(o.id)) >= 0 ? row.stops.findIndex((s) => s.objectiveIds.includes(o.id)) : null)
          : null
      const choice = q.kind === "choice" ? shuffleChoice(q.options, q.correctIndex, q.whyWrong) : null
      out.push({
        id: "",
        objectiveId: o.id,
        stopIndex,
        prompt: q.prompt,
        options: choice?.options ?? [],
        correctIndex: choice?.correctIndex ?? 0,
        explanation: q.explanation,
        citation: q.citation,
        answerIndex: null,
        answeredAt: null,
        flag: null,
        kind: q.kind,
        ...(q.keyPoints ? { keyPoints: q.keyPoints } : {}),
        ...(q.imageId ? { imageId: q.imageId } : {}),
        ...(q.answerByPhoto ? { answerByPhoto: true } : {}),
        ...(choice?.whyWrong ? { whyWrong: choice.whyWrong } : {}),
        source: "bank",
        ...(o.critical ? { critical: true } : {}),
      })
    }
  }
  return { questions: out, missing }
}

/** Questions in the order they are asked: by stop, then objective order; ids q1, q2, ... */
function ordered(questions: Question[], row: Version): Question[] {
  const rank = new Map(row.objectives.map((o, i) => [o.id, i]))
  return [...questions]
    .map((q, i) => ({ q, i }))
    .sort(
      (a, b) =>
        (a.q.stopIndex ?? -1) - (b.q.stopIndex ?? -1) ||
        (rank.get(a.q.objectiveId) ?? 0) - (rank.get(b.q.objectiveId) ?? 0) ||
        a.i - b.i,
    )
    .map(({ q }, i) => ({ ...q, id: `q${i + 1}` }))
}

// ---- Start --------------------------------------------------------------------

/**
 * Starts an Attempt of the live version for the checked-in person, or returns
 * the one they already have in progress. With a question bank the questions
 * are drawn at once; otherwise (or for objectives the bank lacks) they are
 * generated in the background: status "generating", then "in_progress".
 * refresher: a short Attempt on the must-be-right objectives, before a level expires.
 */
export const start = mutation({
  args: { trainingId: v.id("trainings"), personId: v.id("people"), refresher: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<Id<"trainingAttempts">> => {
    await requireUserId(ctx)
    await requirePerson(ctx, args.personId)
    const t = await ctx.db.get(args.trainingId)
    if (!t) throw new ConvexError("This Training no longer exists.")
    if (!isTrainingLive(t))
      throw new ConvexError("This Training is not published yet. Attempts start once an Engineer publishes it.")
    if (t.needsReview) throw new ConvexError(BLOCKED_REASON)

    const mine = await ctx.db
      .query("trainingAttempts")
      .withIndex("by_personId", (q) => q.eq("personId", args.personId))
      .take(500)
    const open = mine.find(
      (a) =>
        a.trainingId === t._id &&
        (a.status === "in_progress" || a.status === "generating" || a.status === "error"),
    )
    if (open && open.trainingVersion === t.liveVersion) {
      const stuck = open.status === "generating" && Date.now() - open.startedAt > STUCK_AFTER_MS
      if (open.status === "error" || stuck) {
        await ctx.db.patch(open._id, { status: "generating", error: null, startedAt: Date.now() })
        await ctx.scheduler.runAfter(0, internal.ai.training.generateQuestions, { attemptId: open._id })
      }
      return open._id
    }
    // An open Attempt of an older version is closed: the Training changed.
    if (open) await ctx.db.patch(open._id, { status: "abandoned", finishedAt: Date.now() })

    const row = await getVersion(ctx, t._id, t.liveVersion!)
    if (!row || row.objectives.length === 0) throw new ConvexError("This Training has no Learning objectives.")
    const docs = makeDocCache(ctx)
    for (const o of row.objectives) {
      const r = resolveObjective(await docs(o.documentId), o)
      if (!r.passage) throw new ConvexError(BLOCKED_REASON)
    }

    // A refresher asks the must-be-right objectives (all when none is marked), at most 5 questions.
    let objectiveIds = row.objectives.map((o) => o.id)
    if (args.refresher) {
      const critical = row.objectives.filter((o) => o.critical).map((o) => o.id)
      objectiveIds = (critical.length > 0 ? critical : objectiveIds).slice(0, REFRESHER_MAX)
    }
    const askedBefore = new Set(
      mine.filter((x) => x.trainingId === t._id).flatMap((x) => x.questions.map((q) => q.prompt)),
    )
    const drawn = drawFromBank(row, t.kind, objectiveIds, askedBefore)
    const fromBank = (row.questionBank?.length ?? 0) > 0
    const needGeneration = !fromBank || drawn.missing.length > 0
    let questions = fromBank ? ordered(drawn.questions, row) : []
    if (args.refresher) questions = questions.slice(0, REFRESHER_MAX)

    const attemptId = await ctx.db.insert("trainingAttempts", {
      trainingId: t._id,
      trainingVersion: t.liveVersion!,
      personId: args.personId,
      status: needGeneration ? "generating" : "in_progress",
      questions,
      round: t.kind === "round" ? { currentStop: 0, visited: [], wrongScans: 0, evidence: [] } : null,
      score: null,
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
      ...(args.refresher ? { refresher: true } : {}),
    })
    if (needGeneration) await ctx.scheduler.runAfter(0, internal.ai.training.generateQuestions, { attemptId })
    return attemptId
  },
})

// ---- Reading ------------------------------------------------------------------

/**
 * One Attempt as the person (or a reviewer) sees it. Until a question is
 * answered, or the Attempt is finished, its correct option, explanation,
 * why-wrong notes, key points and source quote stay hidden: they would give
 * the answer away.
 */
export const get = query({
  args: { id: v.id("trainingAttempts") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const a = await ctx.db.get(args.id)
    if (!a) return null
    const t = await ctx.db.get(a.trainingId)
    const person = await ctx.db.get(a.personId)
    const row = await getVersion(ctx, a.trainingId, a.trainingVersion)
    // Only a scored Attempt shows every answer. An abandoned one keeps the
    // answers of its unanswered questions hidden: it can be started again.
    const finished = a.status === "passed" || a.status === "failed"
    const objectiveText = new Map((row?.objectives ?? []).map((o) => [o.id, o.text]))
    const critical = new Set((row?.objectives ?? []).filter((o) => o.critical).map((o) => o.id))
    const names = new Map<string, string | null>()
    const nameOf = async (id: Id<"people"> | null | undefined) => {
      if (!id) return null
      if (!names.has(String(id))) names.set(String(id), (await ctx.db.get(id))?.name ?? null)
      return names.get(String(id)) ?? null
    }

    const stops = []
    for (const [i, s] of (row?.stops ?? []).entries()) {
      const asset = await ctx.db.get(s.assetId)
      const evidence = []
      for (const e of a.round?.evidence.filter((x) => x.stopIndex === i) ?? []) {
        evidence.push({ ...e, url: e.storageId ? await ctx.storage.getUrl(e.storageId) : null })
      }
      stops.push({
        index: i,
        assetId: s.assetId,
        code: asset?.code ?? "?",
        name: asset?.name ?? "Deleted Asset",
        hint: s.hint,
        evidence: s.evidence,
        objectiveIds: s.objectiveIds,
        visited: a.round?.visited.includes(s.assetId) ?? false,
        done: stopDone(a, row?.stops ?? [], i),
        questions: a.questions.filter((q) => q.stopIndex === i).length,
        evidenceGiven: evidence,
      })
    }

    const questions = []
    for (const q of a.questions) {
      const answered = isAnswered(q)
      const open = finished || answered
      const kind = q.kind ?? "choice"
      questions.push({
        id: q.id,
        kind,
        objectiveId: q.objectiveId,
        objectiveText: objectiveText.get(q.objectiveId) ?? null,
        critical: !!q.critical || critical.has(q.objectiveId),
        stopIndex: q.stopIndex,
        prompt: q.prompt,
        options: q.options,
        imageUrl: await imageUrl(ctx, q.imageId),
        answerByPhoto: q.answerByPhoto ?? false,
        answerIndex: q.answerIndex,
        answeredAt: q.answeredAt,
        answerText: q.answerText ?? null,
        answerMode: q.answerMode ?? null,
        answerUrl: q.answerStorageId ? await ctx.storage.getUrl(q.answerStorageId) : null,
        flag: q.flag,
        correctIndex: open && kind === "choice" ? q.correctIndex : null,
        correct: !answered ? null : kind === "open" ? (q.grade ? pointsOf(q) >= 1 : null) : q.answerIndex === q.correctIndex,
        points: answered ? pointsOf(q) : null,
        explanation: open ? q.explanation : null,
        whyWrong: open ? q.whyWrong ?? [] : [],
        keyPoints: open ? q.keyPoints ?? [] : [],
        grade: q.grade ? { ...q.grade, overriddenByName: await nameOf(q.grade.overriddenBy) } : null,
        grading: isGrading(q) && Date.now() - (q.answeredAt ?? 0) < GRADE_STUCK_MS,
        gradeError: q.gradeError ?? (isGrading(q) && Date.now() - (q.answeredAt ?? 0) >= GRADE_STUCK_MS ? "Checking took too long." : null),
        source: q.source ?? null,
        citation: {
          documentId: q.citation.documentId,
          namingCode: q.citation.namingCode,
          version: q.citation.version,
          chunkId: open ? q.citation.chunkId : null,
          quote: open ? q.citation.quote : null,
        },
        // Round questions open once their stop is scanned.
        locked:
          q.stopIndex !== null &&
          !!row &&
          !(a.round?.visited.includes(row.stops[q.stopIndex]?.assetId) ?? false),
      })
    }

    const record = await ctx.db
      .query("trainingRecords")
      .withIndex("by_personId", (q) => q.eq("personId", a.personId))
      .filter((q) => q.eq(q.field("attemptId"), a._id))
      .first()

    // Skills this pass raised or renewed (written by the Skills track right after finish).
    const skillsRaised: { skillId: Id<"skills">; name: string; fromLevel: number; toLevel: number; renewed: boolean }[] = []
    if (a.status === "passed" && a.finishedAt) {
      const events = await ctx.db
        .query("skillEvents")
        .withIndex("by_personId", (q) => q.eq("personId", a.personId))
        .order("desc")
        .take(50)
      for (const e of events) {
        if (e.at < a.finishedAt - 1000 || e.at > a.finishedAt + 5 * 60 * 1000) continue
        if (e.toLevel < e.fromLevel || skillsRaised.some((x) => x.skillId === e.skillId)) continue
        const skill = await ctx.db.get(e.skillId)
        const renewed = e.toLevel === e.fromLevel
        if (renewed && skill?.validityMonths == null && !e.reason.startsWith("Re-trained")) continue
        skillsRaised.push({
          skillId: e.skillId,
          name: skill?.name ?? "Skill",
          fromLevel: e.fromLevel,
          toLevel: e.toLevel,
          renewed,
        })
      }
    }

    // Earlier Attempts of the same Training by this person, for "Passed on attempt 3".
    const mine = await ctx.db
      .query("trainingAttempts")
      .withIndex("by_personId", (q) => q.eq("personId", a.personId))
      .take(500)
    const sameTraining = mine
      .filter((x) => x.trainingId === a.trainingId && (x.status === "passed" || x.status === "failed" || x._id === a._id))
      .sort((x, y) => x.startedAt - y.startedAt)
    const attemptNumber = sameTraining.findIndex((x) => x._id === a._id) + 1
    const earlierFails = sameTraining.slice(0, Math.max(0, attemptNumber - 1)).filter((x) => x.status === "failed").length

    const requests = await ctx.db
      .query("tryOutRequests")
      .withIndex("by_personId", (q) => q.eq("personId", a.personId))
      .take(200)
    const req = requests
      .filter((r) => r.trainingId === a.trainingId && r.status !== "cancelled" && (r.kind ?? "tryout") === "tryout")
      .sort((x, y) => y.createdAt - x.createdAt)[0]
    const walkthrough = requests.find(
      (r) => r.trainingId === a.trainingId && r.status === "open" && r.kind === "walkthrough",
    )

    // Missed objectives with their passage, for "Read these first" after a fail.
    const missed = []
    if (finished) {
      const ids = Array.from(new Set(a.questions.filter((q) => pointsOf(q) < 1).map((q) => q.objectiveId)))
      for (const id of ids) {
        const o = row?.objectives.find((x) => x.id === id)
        const q = a.questions.find((x) => x.objectiveId === id)
        if (!o || !q) continue
        missed.push({
          objectiveId: id,
          text: o.text,
          critical: !!o.critical,
          documentId: q.citation.documentId,
          namingCode: q.citation.namingCode,
          version: q.citation.version,
          chunkId: q.citation.chunkId,
          quote: q.citation.quote,
        })
      }
    }

    const signoffs = []
    for (const s of row?.signoffs ?? []) signoffs.push({ role: s.role, at: s.at, name: await nameOf(s.personId) })
    const sources = new Map<string, { documentId: Id<"documents">; namingCode: string; version: number }>()
    for (const q of a.questions)
      sources.set(String(q.citation.documentId), {
        documentId: q.citation.documentId,
        namingCode: q.citation.namingCode,
        version: q.citation.version,
      })

    const answered = a.questions.filter(isAnswered).length
    const correct = a.questions.filter(isCorrect).length
    const total = a.questions.length || (row ? questionCount(row) : 0)
    const tryOut = a.tryOut
    return {
      _id: a._id,
      status: a.status,
      error: a.error,
      personId: a.personId,
      personName: person?.name ?? "Unknown person",
      personRole: person?.role ?? null,
      trainingId: a.trainingId,
      trainingVersion: a.trainingVersion,
      training: t
        ? { code: t.code, title: t.title, kind: t.kind, liveVersion: t.liveVersion, status: t.status }
        : null,
      purpose: row?.purpose ?? "",
      passMark: row?.passMark ?? 80,
      passRule: passRule(row?.passMark ?? 80, critical.size, total),
      minutes: Math.max(3, Math.round(total * 0.8 + (row?.breakdown?.length ?? 0) * 0.5)),
      mustBeRight: [...critical],
      mustBeRightMissed: a.mustBeRightMissed ?? [],
      refresher: a.refresher ?? false,
      objectives: (row?.objectives ?? []).map((o) => ({ id: o.id, text: o.text, namingCode: o.namingCode, critical: !!o.critical })),
      breakdown: row?.breakdown ?? [],
      presentSeenAt: a.presentSeenAt ?? null,
      missesReviewedAt: a.missesReviewedAt ?? null,
      missed,
      questions,
      stops,
      round: a.round
        ? { currentStop: a.round.currentStop, wrongScans: a.round.wrongScans, visited: a.round.visited }
        : null,
      progress: { answered, total: a.questions.length, correct, grading: a.questions.filter(isGrading).length },
      score: a.score,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      recordId: record?._id ?? null,
      skillsRaised,
      attemptNumber,
      earlierFails,
      failStreak: failStreakOf(mine, a.trainingId),
      walkthroughAfter: (await readOrgSettings(ctx)).training.failsBeforeWalkthrough,
      // What to wear, for the Prepare card (only before the Attempt is scored).
      ppe: finished ? [] : await ppeFor(ctx, (row?.objectives ?? []).map((o) => o.documentId)),
      tryOutRequired: row?.tryOut?.required ?? false,
      tryOutChecklist: row ? checklistFrom(row) : [],
      tryOutRequest: req
        ? {
            _id: req._id,
            status: req.status,
            result: req.result ?? null,
            trainerId: req.trainerId,
            trainerName: await nameOf(req.trainerId),
            createdAt: req.createdAt,
            doneAt: req.doneAt,
          }
        : null,
      walkthroughRequested: walkthrough ? { _id: walkthrough._id, createdAt: walkthrough.createdAt } : null,
      tryOut: tryOut
        ? {
            ...tryOut,
            signedByName: await nameOf(tryOut.signedBy),
            asset: tryOut.assetId ? await ctx.db.get(tryOut.assetId).then((x) => (x ? { code: x.code, name: x.name } : null)) : null,
            photoUrl: tryOut.photoStorageId ? await ctx.storage.getUrl(tryOut.photoStorageId) : null,
          }
        : null,
      signoffs,
      sources: [...sources.values()],
    }
  },
})

// ---- Doing --------------------------------------------------------------------

/**
 * A Scan during a Round. The right Asset opens its stop; any other Asset
 * gets "wrong machine, go to X" (and counts as a wrong scan).
 */
export const scanAt = mutation({
  args: { id: v.id("trainingAttempts"), personId: v.id("people"), assetId: v.id("assets") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const a = await loadOwnAttempt(ctx, args.id, args.personId)
    requireInProgress(a)
    if (!a.round) throw new ConvexError("This Attempt is not a Round.")
    const row = await loadAttemptVersion(ctx, a)
    const describe = async (assetId: Id<"assets">) => {
      const asset = await ctx.db.get(assetId)
      return { assetId, code: asset?.code ?? "?", name: asset?.name ?? "Deleted Asset" }
    }
    const current = a.round.currentStop
    if (current >= row.stops.length) {
      return { ok: false as const, reason: "round_complete" as const, expected: null }
    }
    const expected = row.stops[current]
    if (expected.assetId === args.assetId) {
      if (!a.round.visited.includes(args.assetId)) {
        const next = { ...a, round: { ...a.round, visited: [...a.round.visited, args.assetId] } }
        await ctx.db.patch(a._id, { round: advance(next, row.stops) })
      }
      return { ok: true as const, stopIndex: current }
    }
    const earlier = row.stops.findIndex((s, i) => i < current && s.assetId === args.assetId)
    if (earlier >= 0) return { ok: true as const, stopIndex: earlier, revisit: true }
    // Standing at the current stop with work left: no penalty, just a nudge.
    if (a.round.visited.includes(expected.assetId)) {
      return { ok: false as const, reason: "finish_here_first" as const, expected: await describe(expected.assetId) }
    }
    await ctx.db.patch(a._id, { round: { ...a.round, wrongScans: a.round.wrongScans + 1 } })
    return { ok: false as const, reason: "wrong_asset" as const, expected: await describe(expected.assetId) }
  },
})

async function assertStopScanned(ctx: MutationCtx, a: Attempt, row: Version, q: Question) {
  if (q.stopIndex !== null && a.round) {
    const stop = row.stops[q.stopIndex]
    if (stop && !a.round.visited.includes(stop.assetId)) {
      const asset = await ctx.db.get(stop.assetId)
      throw new ConvexError(`Scan ${asset?.code ?? "the Asset"} first: this question is asked there.`)
    }
  }
}

/** Answers one choice question. Returns the feedback, with its source passage. */
export const answer = mutation({
  args: {
    id: v.id("trainingAttempts"),
    personId: v.id("people"),
    questionId: v.string(),
    answerIndex: v.number(),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const a = await loadOwnAttempt(ctx, args.id, args.personId)
    requireInProgress(a)
    const qi = a.questions.findIndex((q) => q.id === args.questionId)
    if (qi < 0) throw new ConvexError("This question is not part of the Attempt.")
    const q = a.questions[qi]
    if ((q.kind ?? "choice") === "open") throw new ConvexError("This question is answered in your own words.")
    const feedback = (x: Question) => {
      // whyWrong is in option order without the correct one.
      const wrongIndex = x.answerIndex === null || x.answerIndex === x.correctIndex ? -1 : x.answerIndex - (x.answerIndex > x.correctIndex ? 1 : 0)
      return {
        correct: isCorrect(x),
        correctIndex: x.correctIndex,
        explanation: x.explanation,
        whyWrong: wrongIndex >= 0 ? x.whyWrong?.[wrongIndex] || null : null,
        citation: x.citation,
      }
    }
    // Answers are final: a second answer returns the first one's feedback.
    if (q.answerIndex !== null) return feedback(q)
    if (!Number.isInteger(args.answerIndex) || args.answerIndex < 0 || args.answerIndex >= q.options.length)
      throw new ConvexError("Choose one of the options.")
    const row = await loadAttemptVersion(ctx, a)
    await assertStopScanned(ctx, a, row, q)
    const answered: Question = { ...q, answerIndex: args.answerIndex, answeredAt: Date.now() }
    const questions = a.questions.map((x, i) => (i === qi ? answered : x))
    const next = { ...a, questions }
    await ctx.db.patch(a._id, { questions, round: advance(next, row.stops) })
    return feedback(answered)
  },
})

/**
 * Answers one open question in the person's own words: typed (text), spoken
 * (storageId of the recording, transcribed by Gemini) or, where the question
 * asks for it, a photo (storageId). The answer is final; grading runs in the
 * background (convex/ai/training.ts gradeOpenAnswer) and appears on the
 * question as grade, or gradeError when it could not be graded (then a
 * trainer grades it).
 */
export const answerOpen = mutation({
  args: {
    id: v.id("trainingAttempts"),
    personId: v.id("people"),
    questionId: v.string(),
    mode: v.union(v.literal("typed"), v.literal("voice"), v.literal("photo")),
    text: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const a = await loadOwnAttempt(ctx, args.id, args.personId)
    requireInProgress(a)
    const qi = a.questions.findIndex((q) => q.id === args.questionId)
    if (qi < 0) throw new ConvexError("This question is not part of the Attempt.")
    const q = a.questions[qi]
    if ((q.kind ?? "choice") !== "open") throw new ConvexError("Choose one of the options for this question.")
    if (q.answeredAt !== null) return { grading: isGrading(q) }
    const row = await loadAttemptVersion(ctx, a)
    await assertStopScanned(ctx, a, row, q)
    const text = args.text?.trim() ?? ""
    if (args.mode === "typed" && text.length < 3) throw new ConvexError("Write your answer first.")
    if (args.mode !== "typed" && !args.storageId)
      throw new ConvexError(args.mode === "voice" ? "Record your answer first." : "Take the photo first.")
    if (args.mode === "photo" && !q.answerByPhoto) throw new ConvexError("This question is answered in words, not with a photo.")
    const answered: Question = {
      ...q,
      answeredAt: Date.now(),
      answerMode: args.mode,
      ...(args.mode === "typed" ? { answerText: text.slice(0, 4000) } : {}),
      ...(args.storageId && args.mode !== "typed" ? { answerStorageId: args.storageId } : {}),
    }
    const questions = a.questions.map((x, i) => (i === qi ? answered : x))
    await ctx.db.patch(a._id, { questions, round: advance({ ...a, questions }, row.stops) })
    await ctx.scheduler.runAfter(0, internal.ai.training.gradeOpenAnswer, { attemptId: a._id, questionId: q.id })
    return { grading: true }
  },
})

/** Tries grading an open answer again after it failed. */
export const retryGrade = mutation({
  args: { id: v.id("trainingAttempts"), personId: v.id("people"), questionId: v.string() },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const a = await ctx.db.get(args.id)
    if (!a) throw new ConvexError("This Attempt no longer exists.")
    const me = await requirePerson(ctx, args.personId)
    if (a.personId !== me._id && !isEngineerOrAdmin(me)) throw new ConvexError("Only the person or an Engineer can do this.")
    const qi = a.questions.findIndex((q) => q.id === args.questionId)
    const q = a.questions[qi]
    if (!q || q.answeredAt === null || q.grade?.gradedBy === "engineer") return
    const questions = a.questions.map((x, i) => {
      if (i !== qi) return x
      const next = { ...x, answeredAt: Date.now() }
      delete next.gradeError
      delete next.grade
      return next
    })
    await ctx.db.patch(a._id, { questions })
    await ctx.scheduler.runAfter(0, internal.ai.training.gradeOpenAnswer, { attemptId: a._id, questionId: q.id })
  },
})

/**
 * An Engineer grades an open answer (or changes the AI's grade). On a
 * finished Attempt the score and the result are worked out again: a fail
 * that becomes a pass writes the Training record and raises the Skills.
 */
export const overrideGrade = mutation({
  args: {
    id: v.id("trainingAttempts"),
    personId: v.id("people"),
    questionId: v.string(),
    verdict: v.union(v.literal("good"), v.literal("partly"), v.literal("not_yet")),
    feedback: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const engineer = await requireEngineerPerson(ctx, args.personId)
    const a = await ctx.db.get(args.id)
    if (!a) throw new ConvexError("This Attempt no longer exists.")
    if (a.personId === engineer._id) throw new ConvexError("Another Engineer must grade your own answers.")
    const qi = a.questions.findIndex((q) => q.id === args.questionId)
    const q = a.questions[qi]
    if (!q || (q.kind ?? "choice") !== "open") throw new ConvexError("Only an open answer is graded by hand.")
    if (q.answeredAt === null) throw new ConvexError("This question has no answer yet.")
    const now = Date.now()
    const grade = {
      verdict: args.verdict,
      score: args.verdict === "good" ? 1 : args.verdict === "partly" ? 0.5 : 0,
      matched: q.grade?.matched ?? [],
      missing: q.grade?.missing ?? [],
      ...(q.grade?.misconception ? { misconception: q.grade.misconception } : {}),
      feedback: args.feedback?.trim() || q.grade?.feedback || `Graded by ${engineer.name}.`,
      gradedBy: "engineer" as const,
      gradedAt: now,
      overriddenBy: engineer._id,
    }
    const questions = a.questions.map((x, i) => {
      if (i !== qi) return x
      const next = { ...x, grade }
      delete next.gradeError
      return next
    })
    await ctx.db.patch(a._id, { questions })
    if (a.status !== "passed" && a.status !== "failed") return { status: a.status }
    // Finished: score again.
    const row = await loadAttemptVersion(ctx, a)
    const s = scoreAttempt(questions, row)
    const t = await ctx.db.get(a.trainingId)
    await ctx.db.patch(a._id, {
      score: s.score,
      status: s.passed ? "passed" : "failed",
      mustBeRightMissed: s.mustBeRightMissed,
    })
    const record = await ctx.db
      .query("trainingRecords")
      .withIndex("by_personId", (x) => x.eq("personId", a.personId))
      .filter((x) => x.eq(x.field("attemptId"), a._id))
      .first()
    if (s.passed && !record && t) {
      const recordId = await ctx.db.insert("trainingRecords", {
        personId: a.personId,
        trainingId: a.trainingId,
        trainingVersion: a.trainingVersion,
        attemptId: a._id,
        trainingCode: t.code,
        trainingTitle: t.title,
        score: s.score,
        passedAt: now,
      })
      await completeAssignments(ctx, a.personId, a.trainingId, now)
      await ctx.scheduler.runAfter(0, internal.skills.onTrainingPassed, {
        personId: a.personId,
        trainingId: a.trainingId,
        recordId,
      })
    } else if (record && s.passed) await ctx.db.patch(record._id, { score: s.score })
    else if (record && !s.passed) await ctx.db.delete(record._id)
    return { status: s.passed ? "passed" : "failed", score: s.score }
  },
})

/** The person read the breakdown steps (Present) and goes on to the questions. */
export const markPresentSeen = mutation({
  args: { id: v.id("trainingAttempts"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const a = await loadOwnAttempt(ctx, args.id, args.personId)
    if (!a.presentSeenAt) await ctx.db.patch(a._id, { presentSeenAt: Date.now() })
  },
})

/** After a fail: every missed key point was opened, so a new Attempt may start. */
export const markMissesReviewed = mutation({
  args: { id: v.id("trainingAttempts"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const a = await loadOwnAttempt(ctx, args.id, args.personId)
    if (a.status !== "failed") return
    if (!a.missesReviewedAt) await ctx.db.patch(a._id, { missesReviewedAt: Date.now() })
  },
})

/** A photo (storageId from files.generateUploadUrl) or a note at a Round stop. */
export const addEvidence = mutation({
  args: {
    id: v.id("trainingAttempts"),
    personId: v.id("people"),
    stopIndex: v.number(),
    kind: v.union(v.literal("photo"), v.literal("note")),
    text: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const a = await loadOwnAttempt(ctx, args.id, args.personId)
    requireInProgress(a)
    if (!a.round) throw new ConvexError("Evidence belongs to a Round.")
    const row = await loadAttemptVersion(ctx, a)
    const stop = row.stops[args.stopIndex]
    if (!stop) throw new ConvexError("This stop is not part of the Round.")
    if (!a.round.visited.includes(stop.assetId)) {
      const asset = await ctx.db.get(stop.assetId)
      throw new ConvexError(`Scan ${asset?.code ?? "the Asset"} first.`)
    }
    const text = args.text?.trim() || null
    if (args.kind === "photo" && !args.storageId) throw new ConvexError("Take or choose a photo first.")
    if (args.kind === "note" && !text) throw new ConvexError("Write a short note first.")
    const evidence = [
      ...a.round.evidence,
      {
        stopIndex: args.stopIndex,
        kind: args.kind,
        text,
        storageId: args.storageId ?? null,
        at: Date.now(),
      },
    ]
    const next = { ...a, round: { ...a.round, evidence } }
    await ctx.db.patch(a._id, { round: advance(next, row.stops) })
  },
})

/**
 * "Unclear or wrong?" on a question. Kept on the question (so it is part of
 * the record) and sent to Document insights as a content flag on the source.
 * Allowed before answering too.
 */
export const flag = mutation({
  args: {
    id: v.id("trainingAttempts"),
    personId: v.id("people"),
    questionId: v.string(),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const a = await loadOwnAttempt(ctx, args.id, args.personId)
    const qi = a.questions.findIndex((q) => q.id === args.questionId)
    if (qi < 0) throw new ConvexError("This question is not part of the Attempt.")
    const q = a.questions[qi]
    const note = args.note.trim().slice(0, 1000) || "Marked unclear or wrong."
    const questions = a.questions.map((x, i) => (i === qi ? { ...x, flag: note } : x))
    await ctx.db.patch(a._id, { questions })
    if (q.flag === null) {
      await ctx.db.insert("contentFlags", {
        documentId: q.citation.documentId,
        version: q.citation.version,
        chunkId: q.citation.chunkId,
        source: "attempt",
        attemptId: a._id,
        note: `Question: "${q.prompt}" Note: ${note}`,
        personId: a.personId,
        at: Date.now(),
      })
    }
  },
})

/**
 * Scores the Attempt (see the rule at the top). A pass writes the Training
 * record, closes the person's assignments of this Training and raises linked
 * Skills. A second fail in a row asks an Engineer for a walk-through at the line.
 */
export const finish = mutation({
  args: { id: v.id("trainingAttempts"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const a = await loadOwnAttempt(ctx, args.id, args.personId)
    requireInProgress(a)
    const row = await loadAttemptVersion(ctx, a)
    // Only the live version, while it is not under review, can be passed:
    // a record must prove what the Knowledge says today.
    const t = await ctx.db.get(a.trainingId)
    if (!t || !isTrainingLive(t)) throw new ConvexError("This Training is no longer published, so it cannot be passed.")
    if (t.needsReview) throw new ConvexError(BLOCKED_REASON)
    if (a.trainingVersion !== t.liveVersion)
      throw new ConvexError(
        `This Attempt is of v${a.trainingVersion}, and v${t.liveVersion} is now in use. Start the Training again to do the current version.`,
      )
    const open = a.questions.filter((q) => !isAnswered(q)).length
    if (open > 0) throw new ConvexError(`Answer every question first: ${open} still open.`)
    const grading = a.questions.filter((q) => isGrading(q) && Date.now() - (q.answeredAt ?? 0) < GRADE_STUCK_MS).length
    if (grading > 0) throw new ConvexError("Your answers are still being checked. Wait a moment, then finish.")
    if (a.round) {
      const missing = row.stops.findIndex((_, i) => !stopDone(a, row.stops, i))
      if (missing >= 0) {
        const asset = await ctx.db.get(row.stops[missing].assetId)
        throw new ConvexError(`Stop ${missing + 1} (${asset?.code ?? "?"}) is not done yet.`)
      }
    }
    const s = scoreAttempt(a.questions, row)
    const now = Date.now()
    await ctx.db.patch(a._id, {
      status: s.passed ? "passed" : "failed",
      score: s.score,
      finishedAt: now,
      mustBeRightMissed: s.mustBeRightMissed,
    })
    let recordId: Id<"trainingRecords"> | null = null
    if (s.passed) {
      recordId = await ctx.db.insert("trainingRecords", {
        personId: a.personId,
        trainingId: a.trainingId,
        trainingVersion: a.trainingVersion,
        attemptId: a._id,
        trainingCode: t.code,
        trainingTitle: t.title,
        score: s.score,
        passedAt: now,
      })
      await completeAssignments(ctx, a.personId, a.trainingId, now)
      await ctx.scheduler.runAfter(0, internal.skills.onTrainingPassed, {
        personId: a.personId,
        trainingId: a.trainingId,
        recordId,
      })
    } else {
      // Not passed this many times in a row (Settings, Training): ask an
      // Engineer for a walk-through at the line.
      const mine = await ctx.db
        .query("trainingAttempts")
        .withIndex("by_personId", (q) => q.eq("personId", a.personId))
        .take(500)
      const streak = failStreakOf(
        mine.map((x) => (x._id === a._id ? { ...x, status: "failed" as const, finishedAt: now } : x)),
        a.trainingId,
      )
      if (streak >= (await readOrgSettings(ctx)).training.failsBeforeWalkthrough) {
        const requests = await ctx.db
          .query("tryOutRequests")
          .withIndex("by_personId", (q) => q.eq("personId", a.personId))
          .take(200)
        if (!requests.some((r) => r.trainingId === a.trainingId && r.status === "open" && r.kind === "walkthrough"))
          await ctx.db.insert("tryOutRequests", {
            personId: a.personId,
            trainingId: a.trainingId,
            trainingVersion: a.trainingVersion,
            attemptId: a._id,
            skillIds: (await ctx.db.query("skills").take(500).then((r) => r.filter((s) => !s.archived))).filter((x) => x.trainingIds.includes(a.trainingId)).map((x) => x._id),
            trainerId: null,
            status: "open",
            createdAt: now,
            doneAt: null,
            kind: "walkthrough",
          })
      }
    }
    return {
      passed: s.passed,
      score: s.score,
      passMark: row.passMark,
      correct: s.correct,
      total: s.total,
      recordId,
      mustBeRightMissed: s.mustBeRightMissed,
      reason: s.mustBeRightMissed.length > 0 && !s.passed ? `mustBeRightMissed: [${s.mustBeRightMissed.join(", ")}]` : null,
    }
  },
})

/** Stops an Attempt without a score, so a fresh one can start. It is kept. */
export const abandon = mutation({
  args: { id: v.id("trainingAttempts"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const a = await loadOwnAttempt(ctx, args.id, args.personId)
    if (a.status === "passed" || a.status === "failed" || a.status === "abandoned") return
    await ctx.db.patch(a._id, { status: "abandoned", finishedAt: Date.now() })
  },
})

// ---- Lists --------------------------------------------------------------------

/** Attempt number and earlier fails per finished Attempt, per person and Training. */
function numbering(attempts: Attempt[]) {
  const out = new Map<string, { attemptNumber: number; earlierFails: number }>()
  const groups = new Map<string, Attempt[]>()
  for (const a of attempts) {
    if (a.status !== "passed" && a.status !== "failed") continue
    const k = `${a.personId}|${a.trainingId}`
    groups.set(k, [...(groups.get(k) ?? []), a])
  }
  for (const list of groups.values()) {
    list.sort((x, y) => x.startedAt - y.startedAt)
    let fails = 0
    list.forEach((a, i) => {
      out.set(String(a._id), { attemptNumber: i + 1, earlierFails: fails })
      if (a.status === "failed") fails++
    })
  }
  return out
}

async function attemptRow(ctx: QueryCtx, a: Attempt, nums: Map<string, { attemptNumber: number; earlierFails: number }>) {
  const t = await ctx.db.get(a.trainingId)
  const n = nums.get(String(a._id))
  return {
    _id: a._id,
    trainingId: a.trainingId,
    trainingVersion: a.trainingVersion,
    trainingCode: t?.code ?? "?",
    trainingTitle: t?.title ?? "Deleted Training",
    kind: t?.kind ?? "course",
    personId: a.personId,
    status: a.status,
    passed: a.status === "passed" ? true : a.status === "failed" ? false : null,
    score: a.score,
    answered: a.questions.filter(isAnswered).length,
    total: a.questions.length,
    startedAt: a.startedAt,
    finishedAt: a.finishedAt,
    attemptNumber: n?.attemptNumber ?? null,
    earlierFails: n?.earlierFails ?? 0,
    mustBeRightMissed: a.mustBeRightMissed ?? [],
    refresher: a.refresher ?? false,
  }
}

/** The checked-in person's Attempts, newest first, passed and not passed alike. */
export const listMine = query({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const rows = await ctx.db
      .query("trainingAttempts")
      .withIndex("by_personId", (q) => q.eq("personId", args.personId))
      .order("desc")
      .take(200)
    const nums = numbering(rows)
    const out = []
    for (const a of rows) out.push(await attemptRow(ctx, a, nums))
    return out
  },
})

/** Every Attempt of a Training, with who did it, newest first. */
export const listForTraining = query({
  args: { trainingId: v.id("trainings") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const rows = await ctx.db
      .query("trainingAttempts")
      .withIndex("by_trainingId", (q) => q.eq("trainingId", args.trainingId))
      .order("desc")
      .take(500)
    const nums = numbering(rows)
    const out = []
    for (const a of rows) {
      const person = await ctx.db.get(a.personId)
      out.push({ ...(await attemptRow(ctx, a, nums)), personName: person?.name ?? "Unknown person" })
    }
    return out
  },
})

/**
 * Training records (passes) and not-passed Attempts (passed: false), for the
 * Records tab. Filter by person and/or Training. viewerPersonId is the
 * checked-in person: an Operator sees their own records by default, and
 * nobody but an Engineer sees other people's not-passed Attempts.
 */
export const listRecords = query({
  args: {
    personId: v.optional(v.id("people")),
    trainingId: v.optional(v.id("trainings")),
    includeFailed: v.optional(v.boolean()),
    viewerPersonId: v.optional(v.union(v.id("people"), v.null())),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const viewer = args.viewerPersonId ? await ctx.db.get(args.viewerPersonId) : null
    const isEngineer = isEngineerOrAdmin(viewer)
    const personId = args.personId ?? (viewer && !isEngineer && !args.trainingId ? viewer._id : undefined)
    const includeFailed = args.includeFailed ?? true
    const records = personId
      ? await ctx.db
          .query("trainingRecords")
          .withIndex("by_personId", (q) => q.eq("personId", personId))
          .take(1000)
      : args.trainingId
        ? await ctx.db
            .query("trainingRecords")
            .withIndex("by_trainingId", (q) => q.eq("trainingId", args.trainingId!))
            .take(1000)
        : await ctx.db.query("trainingRecords").take(2000)
    const attempts = personId
      ? await ctx.db
          .query("trainingAttempts")
          .withIndex("by_personId", (q) => q.eq("personId", personId))
          .take(1000)
      : args.trainingId
        ? await ctx.db
            .query("trainingAttempts")
            .withIndex("by_trainingId", (q) => q.eq("trainingId", args.trainingId!))
            .take(1000)
        : await ctx.db.query("trainingAttempts").take(2000)
    const nums = numbering(attempts)
    const names = new Map<string, string>()
    const nameOf = async (id: Id<"people">) => {
      if (!names.has(String(id))) names.set(String(id), (await ctx.db.get(id))?.name ?? "Unknown person")
      return names.get(String(id))!
    }
    const trainings = new Map<string, Doc<"trainings"> | null>()
    const trainingOf = async (id: Id<"trainings">) => {
      if (!trainings.has(String(id))) trainings.set(String(id), await ctx.db.get(id))
      return trainings.get(String(id)) ?? null
    }
    const out = []
    for (const r of records) {
      if (args.trainingId && r.trainingId !== args.trainingId) continue
      const n = nums.get(String(r.attemptId))
      out.push({
        _id: r._id as string,
        attemptId: r.attemptId,
        personId: r.personId,
        personName: await nameOf(r.personId),
        trainingId: r.trainingId,
        trainingCode: r.trainingCode,
        trainingTitle: r.trainingTitle,
        trainingVersion: r.trainingVersion,
        kind: (await trainingOf(r.trainingId))?.kind ?? "course",
        score: r.score,
        at: r.passedAt,
        passed: true,
        attemptNumber: n?.attemptNumber ?? null,
        earlierFails: n?.earlierFails ?? 0,
      })
    }
    if (includeFailed) {
      for (const a of attempts) {
        if (a.status !== "failed") continue
        if (args.trainingId && a.trainingId !== args.trainingId) continue
        // Other people's not-passed Attempts are for Engineers only.
        if (viewer && !isEngineer && a.personId !== viewer._id) continue
        const t = await trainingOf(a.trainingId)
        const n = nums.get(String(a._id))
        out.push({
          _id: a._id as string,
          attemptId: a._id,
          personId: a.personId,
          personName: await nameOf(a.personId),
          trainingId: a.trainingId,
          trainingCode: t?.code ?? "?",
          trainingTitle: t?.title ?? "Deleted Training",
          trainingVersion: a.trainingVersion,
          kind: t?.kind ?? "course",
          score: a.score ?? 0,
          at: a.finishedAt ?? a.startedAt,
          passed: false,
          attemptNumber: n?.attemptNumber ?? null,
          earlierFails: n?.earlierFails ?? 0,
        })
      }
    }
    return out.sort((a, b) => b.at - a.at)
  },
})

/** One Training record; its Attempt holds the questions and answers. */
export const getRecord = query({
  args: { id: v.id("trainingRecords") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const r = await ctx.db.get(args.id)
    if (!r) return null
    const person = await ctx.db.get(r.personId)
    return { ...r, personName: person?.name ?? "Unknown person" }
  },
})

// ---- Question generation (internal) --------------------------------------------

/** Everything the question generator needs, read from the live Published versions. */
export const loadForGeneration = internalQuery({
  args: { attemptId: v.id("trainingAttempts") },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.attemptId)
    if (!a || a.status !== "generating") return null
    const t = await ctx.db.get(a.trainingId)
    const row = await getVersion(ctx, a.trainingId, a.trainingVersion)
    if (!t || !row) return null
    const docs = makeDocCache(ctx)
    const stopOf = new Map<string, number>()
    row.stops.forEach((s, i) => s.objectiveIds.forEach((id) => !stopOf.has(id) && stopOf.set(id, i)))
    // Objectives the bank already covered in this Attempt are not generated again.
    const covered = new Set(a.questions.map((q) => q.objectiveId))
    let wanted = row.objectives
    if (a.refresher) {
      const critical = row.objectives.filter((o) => o.critical)
      wanted = (critical.length > 0 ? critical : row.objectives).slice(0, REFRESHER_MAX)
    }
    const objectives = []
    for (const o of wanted) {
      if (covered.has(o.id)) continue
      const live = await docs(o.documentId)
      const r = resolveObjective(live, o)
      objectives.push({
        id: o.id,
        text: o.text,
        critical: !!o.critical,
        documentId: o.documentId,
        namingCode: o.namingCode,
        documentTitle: live?.doc.title ?? "",
        version: r.liveVersion,
        chunkId: r.passage?.chunkId ?? null,
        passage: r.passage?.display ?? null,
        section: r.passage?.section ?? null,
        quote: o.quote,
        stopIndex: t.kind === "round" ? stopOf.get(o.id) ?? null : null,
      })
    }
    // Other passages of the same Documents: true statements that a fallback
    // question's wrong options must never repeat.
    const pool: { text: string; section: string | null; namingCode: string }[] = []
    const seenDocs = new Set<string>()
    for (const o of row.objectives) {
      if (seenDocs.has(String(o.documentId))) continue
      seenDocs.add(String(o.documentId))
      const live = await docs(o.documentId)
      for (const p of live?.passages ?? []) {
        if (p.text.trim() === (p.section ?? "").trim() || p.text.length < 25 || p.text.includes(" | ")) continue
        pool.push({ text: p.text, section: p.section, namingCode: live!.doc.namingCode })
      }
    }
    // What this person was asked before in this Training: no repeats, and
    // the correct options already used, so the wording rotates.
    const earlier = await ctx.db
      .query("trainingAttempts")
      .withIndex("by_personId", (q) => q.eq("personId", a.personId))
      .take(200)
    const before = earlier.filter((x) => x.trainingId === a.trainingId && x._id !== a._id)
    const previousPrompts = before.flatMap((x) => x.questions.map((q) => q.prompt)).slice(-40)
    const previousCorrect = before
      .flatMap((x) => x.questions.filter((q) => (q.kind ?? "choice") === "choice").map((q) => q.options[q.correctIndex]))
      .filter((x): x is string => !!x)
      .slice(-40)
    // Objectives missed last time come first in a retry.
    const lastFailed = before
      .filter((x) => x.status === "failed")
      .sort((x, y) => (y.finishedAt ?? 0) - (x.finishedAt ?? 0))[0]
    const missedBefore = lastFailed ? Array.from(new Set(lastFailed.questions.filter((q) => pointsOf(q) < 1).map((q) => q.objectiveId))) : []
    const person = await ctx.db.get(a.personId)
    return {
      personRole: person?.role ?? "operator",
      training: { code: t.code, title: t.title, kind: t.kind, purpose: row.purpose },
      questionsPerObjective: a.refresher ? 1 : row.questionsPerObjective,
      objectives,
      pool: pool.slice(0, 200),
      previousPrompts,
      previousCorrect,
      missedBefore,
    }
  },
})

const questionValidator = v.object({
  id: v.string(),
  objectiveId: v.string(),
  stopIndex: v.union(v.number(), v.null()),
  prompt: v.string(),
  options: v.array(v.string()),
  correctIndex: v.number(),
  explanation: v.string(),
  citation: v.object({
    documentId: v.id("documents"),
    namingCode: v.string(),
    version: v.number(),
    chunkId: v.union(v.id("chunks"), v.null()),
    quote: v.string(),
  }),
  answerIndex: v.union(v.number(), v.null()),
  answeredAt: v.union(v.number(), v.null()),
  flag: v.union(v.string(), v.null()),
  whyWrong: v.optional(v.array(v.string())),
  source: v.optional(v.union(v.literal("model"), v.literal("fallback"), v.literal("bank"))),
  critical: v.optional(v.boolean()),
  kind: v.optional(v.union(v.literal("choice"), v.literal("open"))),
})

/** Generated questions join any drawn from the bank; then the Attempt starts. */
export const saveQuestions = internalMutation({
  args: { attemptId: v.id("trainingAttempts"), questions: v.array(questionValidator), missedFirst: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.attemptId)
    if (!a || a.status !== "generating") return
    const row = await getVersion(ctx, a.trainingId, a.trainingVersion)
    if (!row) return
    let all = ordered([...a.questions, ...args.questions], row)
    // A retry asks what was missed last time first (courses only: a Round follows its stops).
    if (a.round === null && args.missedFirst && args.missedFirst.length > 0) {
      const first = new Set(args.missedFirst)
      all = [...all.filter((q) => first.has(q.objectiveId)), ...all.filter((q) => !first.has(q.objectiveId))].map((q, i) => ({
        ...q,
        id: `q${i + 1}`,
      }))
    }
    if (a.refresher) all = all.slice(0, REFRESHER_MAX)
    await ctx.db.patch(a._id, { questions: all, status: "in_progress", error: null })
  },
})

export const failGeneration = internalMutation({
  args: { attemptId: v.id("trainingAttempts"), error: v.string() },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.attemptId)
    if (!a || a.status !== "generating") return
    await ctx.db.patch(a._id, { status: "error", error: args.error })
  },
})

// ---- Open answers: grading (internal) -------------------------------------------

/** One open answer with what grading needs: key points and the cited passage. */
export const loadForGrading = internalQuery({
  args: { attemptId: v.id("trainingAttempts"), questionId: v.string() },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.attemptId)
    if (!a) return null
    const q = a.questions.find((x) => x.id === args.questionId)
    if (!q || (q.kind ?? "choice") !== "open" || q.answeredAt === null) return null
    if (q.grade?.gradedBy === "engineer") return null
    const row = await getVersion(ctx, a.trainingId, a.trainingVersion)
    const o = row?.objectives.find((x) => x.id === q.objectiveId)
    const live = o ? await makeDocCache(ctx)(o.documentId) : null
    const r = o ? resolveObjective(live, o) : null
    const person = await ctx.db.get(a.personId)
    return {
      prompt: q.prompt,
      keyPoints: q.keyPoints ?? [],
      explanation: q.explanation,
      objective: o?.text ?? "",
      passage: r?.passage?.display ?? q.citation.quote,
      citation: { namingCode: q.citation.namingCode, version: q.citation.version, quote: q.citation.quote },
      answerMode: q.answerMode ?? "typed",
      answerText: q.answerText ?? null,
      answerStorageId: q.answerStorageId ?? null,
      personRole: person?.role ?? "operator",
    }
  },
})

/** The transcript of a spoken answer. */
export const saveTranscript = internalMutation({
  args: { attemptId: v.id("trainingAttempts"), questionId: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.attemptId)
    if (!a) return
    await ctx.db.patch(a._id, {
      questions: a.questions.map((q) => (q.id === args.questionId ? { ...q, answerText: args.text.slice(0, 4000) } : q)),
    })
  },
})

const gradeIn = v.object({
  verdict: v.union(v.literal("good"), v.literal("partly"), v.literal("not_yet")),
  score: v.number(),
  matched: v.array(v.string()),
  missing: v.array(v.string()),
  misconception: v.optional(v.string()),
  feedback: v.string(),
})

/** The AI grade of an open answer. Never overwrites an Engineer's grade. */
export const saveGrade = internalMutation({
  args: { attemptId: v.id("trainingAttempts"), questionId: v.string(), grade: gradeIn },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.attemptId)
    if (!a) return
    await ctx.db.patch(a._id, {
      questions: a.questions.map((q) => {
        if (q.id !== args.questionId || q.grade?.gradedBy === "engineer") return q
        const next = {
          ...q,
          grade: { ...args.grade, gradedBy: "ai" as const, gradedAt: Date.now() },
        }
        delete next.gradeError
        return next
      }),
    })
  },
})

/** Grading failed: the answer stays, and a trainer grades it (overrideGrade). */
export const failGrade = internalMutation({
  args: { attemptId: v.id("trainingAttempts"), questionId: v.string(), error: v.string() },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.attemptId)
    if (!a) return
    await ctx.db.patch(a._id, {
      questions: a.questions.map((q) =>
        q.id === args.questionId && !q.grade ? { ...q, gradeError: args.error.slice(0, 300) } : q,
      ),
    })
  },
})

// ---- Dev clean-up (internal only) ------------------------------------------------

/** Removes one Attempt with its Training record and flags. For dev test clean-up only. */
export const purgeAttempt = internalMutation({
  args: { id: v.id("trainingAttempts") },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.id)
    if (!a) return { removed: 0 }
    let removed = 1
    for (const r of await ctx.db
      .query("trainingRecords")
      .withIndex("by_personId", (q) => q.eq("personId", a.personId))
      .collect()) {
      if (r.attemptId === a._id) {
        await ctx.db.delete(r._id)
        removed += 1
      }
    }
    for (const q of a.questions) {
      for (const f of await ctx.db
        .query("contentFlags")
        .withIndex("by_documentId", (x) => x.eq("documentId", q.citation.documentId))
        .collect()) {
        if (f.attemptId === a._id) {
          await ctx.db.delete(f._id)
          removed += 1
        }
      }
    }
    for (const e of a.round?.evidence ?? []) if (e.storageId) await ctx.storage.delete(e.storageId)
    await ctx.db.delete(a._id)
    return { removed }
  },
})
