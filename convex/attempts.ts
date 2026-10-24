// Attempts and Training records (CONTEXT.md: Attempt, Round, Training record;
// ADR 0002: Trainings are controlled, Attempts are generated).
//
// An Attempt is one checked-in person doing the live version of a Training
// once. Its questions are generated fresh (convex/ai/training.ts) but always
// test every Learning objective and cite their Published source. A pass
// writes a Training record: which version, which questions, which answers,
// when. Failed Attempts are kept too: they are proof of attempts.
//
// Every mutation takes the checked-in personId and checks it against the
// Attempt, so nobody answers in someone else's name.
import { ConvexError, v } from "convex/values"
import { internalMutation, internalQuery, mutation, MutationCtx, query, QueryCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import { Doc, Id } from "./_generated/dataModel"
import { requireUserId } from "./lib/auth"
import { getVersion, isTrainingLive, makeDocCache, resolveObjective } from "./trainings"

type Ctx = QueryCtx | MutationCtx
type Attempt = Doc<"trainingAttempts">
type Question = Attempt["questions"][number]

/** Generation that has not finished after this long is started again. */
const STUCK_AFTER_MS = 4 * 60 * 1000

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

/** A stop is done when it was scanned, its questions are answered and its evidence is in. */
function stopDone(a: Attempt, stops: Doc<"trainingVersions">["stops"], i: number): boolean {
  const stop = stops[i]
  if (!stop || !a.round) return false
  if (!a.round.visited.includes(stop.assetId)) return false
  if (a.questions.some((q) => q.stopIndex === i && q.answerIndex === null)) return false
  if (stop.evidence !== "none" && !a.round.evidence.some((e) => e.stopIndex === i)) return false
  return true
}

/** Moves the Round on past every stop that is done. */
function advance(a: Attempt, stops: Doc<"trainingVersions">["stops"]): Attempt["round"] {
  if (!a.round) return null
  let current = a.round.currentStop
  while (current < stops.length && stopDone(a, stops, current)) current += 1
  return { ...a.round, currentStop: current }
}

function isCorrect(q: Question) {
  return q.answerIndex !== null && q.answerIndex === q.correctIndex
}

// ---- Start --------------------------------------------------------------------

/**
 * Starts an Attempt of the live version for the checked-in person, or returns
 * the one they already have in progress. Questions are generated in the
 * background: status "generating", then "in_progress" (or "error").
 */
export const start = mutation({
  args: { trainingId: v.id("trainings"), personId: v.id("people") },
  handler: async (ctx, args): Promise<Id<"trainingAttempts">> => {
    await requireUserId(ctx)
    await requirePerson(ctx, args.personId)
    const t = await ctx.db.get(args.trainingId)
    if (!t) throw new ConvexError("This Training no longer exists.")
    if (!isTrainingLive(t))
      throw new ConvexError("This Training is not published yet. Attempts start once an Engineer publishes it.")

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
    for (const [i, o] of row.objectives.entries()) {
      const r = resolveObjective(await docs(o.documentId), o)
      if (!r.passage)
        throw new ConvexError(
          `Learning objective ${i + 1} cites a passage of ${o.namingCode} that is no longer published. An Engineer must review this Training first.`,
        )
    }

    const attemptId = await ctx.db.insert("trainingAttempts", {
      trainingId: t._id,
      trainingVersion: t.liveVersion!,
      personId: args.personId,
      status: "generating",
      questions: [],
      round: t.kind === "round" ? { currentStop: 0, visited: [], wrongScans: 0, evidence: [] } : null,
      score: null,
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
    })
    await ctx.scheduler.runAfter(0, internal.ai.training.generateQuestions, { attemptId })
    return attemptId
  },
})

// ---- Reading ------------------------------------------------------------------

/**
 * One Attempt as the person (or a reviewer) sees it. Until a question is
 * answered, or the Attempt is finished, its correct option, explanation and
 * source quote stay hidden: the quote would give the answer away.
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
    const finished = a.status === "passed" || a.status === "failed" || a.status === "abandoned"
    const objectiveText = new Map((row?.objectives ?? []).map((o) => [o.id, o.text]))

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

    const questions = a.questions.map((q) => {
      const open = finished || q.answerIndex !== null
      return {
        id: q.id,
        objectiveId: q.objectiveId,
        objectiveText: objectiveText.get(q.objectiveId) ?? null,
        stopIndex: q.stopIndex,
        prompt: q.prompt,
        options: q.options,
        answerIndex: q.answerIndex,
        answeredAt: q.answeredAt,
        flag: q.flag,
        correctIndex: open ? q.correctIndex : null,
        correct: q.answerIndex === null ? null : q.answerIndex === q.correctIndex,
        explanation: open ? q.explanation : null,
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
      }
    })

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
        skillsRaised.push({
          skillId: e.skillId,
          name: skill?.name ?? "Skill",
          fromLevel: e.fromLevel,
          toLevel: e.toLevel,
          renewed: e.toLevel === e.fromLevel,
        })
      }
    }

    const answered = a.questions.filter((q) => q.answerIndex !== null).length
    const correct = a.questions.filter(isCorrect).length
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
      objectives: (row?.objectives ?? []).map((o) => ({ id: o.id, text: o.text, namingCode: o.namingCode })),
      questions,
      stops,
      round: a.round
        ? { currentStop: a.round.currentStop, wrongScans: a.round.wrongScans, visited: a.round.visited }
        : null,
      progress: { answered, total: a.questions.length, correct },
      score: a.score,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      recordId: record?._id ?? null,
      skillsRaised,
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

/** Answers one question. Returns the feedback, with its source passage. */
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
    const feedback = (x: Question) => ({
      correct: isCorrect(x),
      correctIndex: x.correctIndex,
      explanation: x.explanation,
      citation: x.citation,
    })
    // Answers are final: a second answer returns the first one's feedback.
    if (q.answerIndex !== null) return feedback(q)
    if (!Number.isInteger(args.answerIndex) || args.answerIndex < 0 || args.answerIndex >= q.options.length)
      throw new ConvexError("Choose one of the options.")
    const row = await loadAttemptVersion(ctx, a)
    if (q.stopIndex !== null && a.round) {
      const stop = row.stops[q.stopIndex]
      if (stop && !a.round.visited.includes(stop.assetId)) {
        const asset = await ctx.db.get(stop.assetId)
        throw new ConvexError(`Scan ${asset?.code ?? "the Asset"} first: this question is asked there.`)
      }
    }
    const answered: Question = { ...q, answerIndex: args.answerIndex, answeredAt: Date.now() }
    const questions = a.questions.map((x, i) => (i === qi ? answered : x))
    const next = { ...a, questions }
    await ctx.db.patch(a._id, { questions, round: advance(next, row.stops) })
    return feedback(answered)
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

/** Scores the Attempt. A pass writes the Training record and raises linked Skills. */
export const finish = mutation({
  args: { id: v.id("trainingAttempts"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const a = await loadOwnAttempt(ctx, args.id, args.personId)
    requireInProgress(a)
    const row = await loadAttemptVersion(ctx, a)
    const open = a.questions.filter((q) => q.answerIndex === null).length
    if (open > 0) throw new ConvexError(`Answer every question first: ${open} still open.`)
    if (a.round) {
      const missing = row.stops.findIndex((_, i) => !stopDone(a, row.stops, i))
      if (missing >= 0) {
        const asset = await ctx.db.get(row.stops[missing].assetId)
        throw new ConvexError(`Stop ${missing + 1} (${asset?.code ?? "?"}) is not done yet.`)
      }
    }
    const total = a.questions.length
    const correct = a.questions.filter(isCorrect).length
    const score = total === 0 ? 0 : Math.round((correct / total) * 100)
    const passed = score >= row.passMark
    const now = Date.now()
    await ctx.db.patch(a._id, { status: passed ? "passed" : "failed", score, finishedAt: now })
    let recordId: Id<"trainingRecords"> | null = null
    if (passed) {
      const t = await ctx.db.get(a.trainingId)
      recordId = await ctx.db.insert("trainingRecords", {
        personId: a.personId,
        trainingId: a.trainingId,
        trainingVersion: a.trainingVersion,
        attemptId: a._id,
        trainingCode: t?.code ?? "?",
        trainingTitle: t?.title ?? "Training",
        score,
        passedAt: now,
      })
      await ctx.scheduler.runAfter(0, internal.skills.onTrainingPassed, {
        personId: a.personId,
        trainingId: a.trainingId,
        recordId,
      })
    }
    return { passed, score, passMark: row.passMark, correct, total, recordId }
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

async function attemptRow(ctx: QueryCtx, a: Attempt) {
  const t = await ctx.db.get(a.trainingId)
  return {
    _id: a._id,
    trainingId: a.trainingId,
    trainingVersion: a.trainingVersion,
    trainingCode: t?.code ?? "?",
    trainingTitle: t?.title ?? "Deleted Training",
    kind: t?.kind ?? "course",
    personId: a.personId,
    status: a.status,
    score: a.score,
    answered: a.questions.filter((q) => q.answerIndex !== null).length,
    total: a.questions.length,
    startedAt: a.startedAt,
    finishedAt: a.finishedAt,
  }
}

/** The checked-in person's Attempts, newest first. */
export const listMine = query({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const rows = await ctx.db
      .query("trainingAttempts")
      .withIndex("by_personId", (q) => q.eq("personId", args.personId))
      .order("desc")
      .take(200)
    const out = []
    for (const a of rows) out.push(await attemptRow(ctx, a))
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
    const out = []
    for (const a of rows) {
      const person = await ctx.db.get(a.personId)
      out.push({ ...(await attemptRow(ctx, a)), personName: person?.name ?? "Unknown person" })
    }
    return out
  },
})

/**
 * Training records (passes), optionally with failed Attempts as well, for
 * the Records tab. Filter by person and/or Training.
 */
export const listRecords = query({
  args: {
    personId: v.optional(v.id("people")),
    trainingId: v.optional(v.id("trainings")),
    includeFailed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const records = args.personId
      ? await ctx.db
          .query("trainingRecords")
          .withIndex("by_personId", (q) => q.eq("personId", args.personId!))
          .take(1000)
      : args.trainingId
        ? await ctx.db
            .query("trainingRecords")
            .withIndex("by_trainingId", (q) => q.eq("trainingId", args.trainingId!))
            .take(1000)
        : await ctx.db.query("trainingRecords").take(2000)
    const names = new Map<string, string>()
    const nameOf = async (id: Id<"people">) => {
      if (!names.has(String(id))) names.set(String(id), (await ctx.db.get(id))?.name ?? "Unknown person")
      return names.get(String(id))!
    }
    const kinds = new Map<string, "course" | "round">()
    const kindOf = async (id: Id<"trainings">) => {
      if (!kinds.has(String(id))) kinds.set(String(id), (await ctx.db.get(id))?.kind ?? "course")
      return kinds.get(String(id))!
    }
    const out = []
    for (const r of records) {
      if (args.trainingId && r.trainingId !== args.trainingId) continue
      out.push({
        _id: r._id as string,
        attemptId: r.attemptId,
        personId: r.personId,
        personName: await nameOf(r.personId),
        trainingId: r.trainingId,
        trainingCode: r.trainingCode,
        trainingTitle: r.trainingTitle,
        trainingVersion: r.trainingVersion,
        kind: await kindOf(r.trainingId),
        score: r.score,
        at: r.passedAt,
        passed: true,
      })
    }
    if (args.includeFailed) {
      const attempts = args.personId
        ? await ctx.db
            .query("trainingAttempts")
            .withIndex("by_personId", (q) => q.eq("personId", args.personId!))
            .take(1000)
        : args.trainingId
          ? await ctx.db
              .query("trainingAttempts")
              .withIndex("by_trainingId", (q) => q.eq("trainingId", args.trainingId!))
              .take(1000)
          : await ctx.db.query("trainingAttempts").take(2000)
      for (const a of attempts) {
        if (a.status !== "failed") continue
        if (args.trainingId && a.trainingId !== args.trainingId) continue
        const t = await ctx.db.get(a.trainingId)
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
    const objectives = []
    for (const o of row.objectives) {
      const live = await docs(o.documentId)
      const r = resolveObjective(live, o)
      objectives.push({
        id: o.id,
        text: o.text,
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
    // Other passages of the same Documents, as distractors for the fallback.
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
    // What this person was asked before in this Training: no repeats.
    const earlier = await ctx.db
      .query("trainingAttempts")
      .withIndex("by_personId", (q) => q.eq("personId", a.personId))
      .take(200)
    const previousPrompts = earlier
      .filter((x) => x.trainingId === a.trainingId && x._id !== a._id)
      .flatMap((x) => x.questions.map((q) => q.prompt))
      .slice(-40)
    const person = await ctx.db.get(a.personId)
    return {
      personRole: person?.role ?? "operator",
      training: { code: t.code, title: t.title, kind: t.kind, purpose: row.purpose },
      questionsPerObjective: row.questionsPerObjective,
      objectives,
      pool: pool.slice(0, 200),
      previousPrompts,
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
})

export const saveQuestions = internalMutation({
  args: { attemptId: v.id("trainingAttempts"), questions: v.array(questionValidator) },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.attemptId)
    if (!a || a.status !== "generating") return
    await ctx.db.patch(a._id, { questions: args.questions, status: "in_progress", error: null })
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
