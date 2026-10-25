// The Training builder (CONTEXT.md: Training, Learning objective; ADR 0002).
//
// The builder is where an Engineer controls a Training beyond its objectives:
// the TWI job breakdown (important steps, key points, reasons), the question
// bank (choice and open questions, each citing a Published passage), the
// try-out at the line, the refresher period, the Skills it proves and who
// must do it. The fields are saved by trainings.create/update with the Draft;
// this module reads them for the builder and the Training page, and keeps the "Still on point?" analysis of Attempts (trainingSignals).
//
// The lifecycle (create, review, approve, publish) stays in convex/trainings.ts.
// The AI drafts in convex/ai/trainingBuilder.ts; a person always confirms.
import { ConvexError, v } from "convex/values"
import { internalMutation, internalQuery, query } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { requireUserId } from "./lib/auth"
import {
  BLOCKED_REASON,
  getVersion,
  loadLiveDoc,
  makeDocCache,
  openFindingsByObjective,
  passRule,
  questionCount,
  quoteIn,
  resolveObjective,
  signalStateFor,
} from "./trainings"

export type BreakdownRow = NonNullable<Doc<"trainingVersions">["breakdown"]>[number]
export type BankItem = NonNullable<Doc<"trainingVersions">["questionBank"]>[number]

// ---- Queries -----------------------------------------------------------------

function builderFields(row: Doc<"trainingVersions">) {
  return {
    version: row.version,
    breakdown: row.breakdown ?? null,
    questionBank: row.questionBank ?? null,
    refreshMonths: row.refreshMonths ?? null,
    tryOut: row.tryOut ?? null,
    audience: row.audience ?? null,
    skillIds: row.skillIds ?? null,
    changeNote: row.changeNote ?? null,
    reviewerPersonId: row.reviewerPersonId ?? null,
    findingAcks: row.findingAcks ?? [],
    critical: row.objectives.filter((o) => o.critical).map((o) => o.id),
    keyPointIds: Object.fromEntries(row.objectives.filter((o) => o.keyPointId).map((o) => [o.id, o.keyPointId!])),
  }
}

/**
 * The builder fields (breakdown, question bank, try-out, refresher, audience,
 * Skills, must-be-right) of a Training's working version, and of its live
 * version when that is a different one.
 */
export const setup = query({
  args: { trainingId: v.id("trainings") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const t = await ctx.db.get(args.trainingId)
    if (!t) return null
    const row = await getVersion(ctx, t._id, t.currentVersion)
    if (!row) return null
    const live =
      t.liveVersion != null && t.liveVersion !== t.currentVersion ? await getVersion(ctx, t._id, t.liveVersion) : null
    return {
      status: t.status,
      current: builderFields(row),
      live: live ? builderFields(live) : null,
    }
  },
})

/** Pictures used in these Documents, to illustrate an image question. */
export const imagesForDocuments = query({
  args: { documentIds: v.array(v.id("documents")) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const out: { imageId: Id<"images">; url: string | null; alt: string; namingCode: string }[] = []
    const seen = new Set<string>()
    for (const documentId of args.documentIds.slice(0, 10)) {
      const doc = await ctx.db.get(documentId)
      if (!doc) continue
      const usages = await ctx.db
        .query("imageUsages")
        .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
        .take(50)
      for (const u of usages) {
        if (seen.has(String(u.imageId))) continue
        seen.add(String(u.imageId))
        const img = await ctx.db.get(u.imageId)
        if (!img) continue
        const url = img.source === "url" ? img.externalUrl : img.storageId ? await ctx.storage.getUrl(img.storageId) : null
        out.push({ imageId: img._id, url, alt: img.altText || img.filename, namingCode: doc.namingCode })
      }
    }
    return out.slice(0, 40)
  },
})

/** The people and Skill profiles to choose an audience from, and the Skills a Training can prove. */
export const peopleOptions = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx)
    const people = await ctx.db.query("people").take(500)
    const profiles = await ctx.db.query("skillProfiles").take(200)
    const skills = await ctx.db.query("skills").take(500).then((r) => r.filter((s) => !s.archived))
    return {
      people: people
        .map((p) => ({
          _id: p._id,
          name: p.name,
          kind: p.kind,
          role: p.role,
          area: p.area,
          profileIds: p.profileIds ?? [],
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      profiles: profiles.map((p) => ({ _id: p._id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name)),
      skills: skills
        .map((s) => ({
          _id: s._id,
          name: s.name,
          documentIds: s.documentIds,
          trainingIds: s.trainingIds,
          validityMonths: s.validityMonths,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }
  },
})

/**
 * "Still on point?" for the builder tab and the Training page: the shared
 * state from trainings.signalStateFor (the version in use, falling back to
 * an older version's analysis), plus how many finished Attempts came in since.
 */
export const signals = query({
  args: { trainingId: v.id("trainings") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const t = await ctx.db.get(args.trainingId)
    if (!t) return null
    const { version, fromVersion, row, attentionItems } = await signalStateFor(ctx, t)
    const attempts = await ctx.db
      .query("trainingAttempts")
      .withIndex("by_trainingId", (q) => q.eq("trainingId", t._id))
      .take(2000)
    const finished = attempts.filter(
      (a) => a.trainingVersion === version && (a.status === "passed" || a.status === "failed"),
    )
    const since = row ? finished.filter((a) => (a.finishedAt ?? 0) > row.at).length : finished.length
    return {
      version,
      fromVersion,
      finished: finished.length,
      newSince: since,
      attention: attentionItems.length,
      row: row
        ? {
            _id: row._id,
            status: row.status,
            at: row.at,
            attemptsAnalysed: row.attemptsAnalysed,
            summary: row.summary ?? null,
            items: row.items,
            error: row.error ?? null,
          }
        : null,
    }
  },
})

// ---- Internal: passages for the AI, and the signals analysis -------------------

/** The Published passages behind a set of objectives, in document order. */
export const passagesFor = internalQuery({
  args: { documentIds: v.array(v.id("documents")) },
  handler: async (ctx, args) => {
    const docs = []
    for (const id of args.documentIds.slice(0, 8)) {
      const live = await loadLiveDoc(ctx, id)
      if (!live) continue
      docs.push({
        documentId: live.doc._id,
        namingCode: live.doc.namingCode,
        title: live.doc.title,
        version: live.version,
        passages: live.passages
          .filter((p) => p.text.trim() !== (p.section ?? "").trim())
          .map((p) => ({ chunkId: p.chunkId, text: p.text, display: p.display, section: p.section })),
      })
    }
    return docs
  },
})

/** Everything the "Still on point?" analysis reads: the version and its finished Attempts. */
export const signalInput = internalQuery({
  args: { trainingId: v.id("trainings") },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.trainingId)
    if (!t) return null
    const version = t.liveVersion ?? t.currentVersion
    const row = await getVersion(ctx, t._id, version)
    if (!row) return null
    const attempts = (
      await ctx.db
        .query("trainingAttempts")
        .withIndex("by_trainingId", (q) => q.eq("trainingId", t._id))
        .take(2000)
    ).filter(
      (a) =>
        a.trainingVersion === version &&
        (a.status === "passed" || a.status === "failed"),
    )
    const answers = []
    for (const a of attempts) {
      for (const q of a.questions) {
        if (q.answeredAt == null && !q.answerText) continue
        answers.push({
          attemptId: a._id,
          objectiveId: q.objectiveId,
          kind: q.kind ?? "choice",
          prompt: q.prompt,
          options: q.options,
          correctIndex: q.correctIndex,
          answerIndex: q.answerIndex,
          answerText: q.answerText ?? null,
          verdict: q.grade?.verdict ?? null,
          missing: q.grade?.missing ?? [],
          misconception: q.grade?.misconception ?? null,
          flag: q.flag,
          citation: { documentId: q.citation.documentId, namingCode: q.citation.namingCode, quote: q.citation.quote },
        })
      }
    }
    return {
      trainingId: t._id,
      code: t.code,
      title: t.title,
      version,
      purpose: row.purpose,
      objectives: row.objectives.map((o) => ({
        id: o.id,
        text: o.text,
        documentId: o.documentId,
        namingCode: o.namingCode,
        quote: o.quote,
      })),
      attempts: attempts.length,
      answers,
    }
  },
})

export const startSignals = internalMutation({
  args: { trainingId: v.id("trainings"), version: v.number() },
  handler: async (ctx, args) => {
    const running = await ctx.db
      .query("trainingSignals")
      .withIndex("by_trainingId_and_version", (q) => q.eq("trainingId", args.trainingId).eq("version", args.version))
      .order("desc")
      .first()
    if (running && running.status === "running" && Date.now() - running.at < 3 * 60 * 1000)
      throw new ConvexError("The analysis is already running. It takes about a minute.")
    return await ctx.db.insert("trainingSignals", {
      trainingId: args.trainingId,
      version: args.version,
      status: "running",
      at: Date.now(),
      attemptsAnalysed: 0,
      items: [],
    })
  },
})

const signalItemValidator = v.object({
  kind: v.union(
    v.literal("misconception"),
    v.literal("unclear_question"),
    v.literal("document_gap"),
    v.literal("too_easy"),
    v.literal("practice_differs"),
  ),
  objectiveId: v.optional(v.string()),
  questionId: v.optional(v.string()),
  text: v.string(),
  count: v.number(),
  examples: v.array(v.string()),
  suggestion: v.string(),
})

export const finishSignals = internalMutation({
  args: {
    signalsId: v.id("trainingSignals"),
    attemptsAnalysed: v.number(),
    summary: v.string(),
    items: v.array(signalItemValidator),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.signalsId)
    if (!row) return
    await ctx.db.patch(row._id, {
      status: "ready",
      at: Date.now(),
      attemptsAnalysed: args.attemptsAnalysed,
      summary: args.summary,
      items: args.items,
      error: undefined,
    })
    // Keep the history short: the last 5 analyses of this version.
    const all = await ctx.db
      .query("trainingSignals")
      .withIndex("by_trainingId_and_version", (q) => q.eq("trainingId", row.trainingId).eq("version", row.version))
      .order("desc")
      .take(50)
    for (const old of all.slice(5)) await ctx.db.delete(old._id)
  },
})

export const failSignals = internalMutation({
  args: { signalsId: v.id("trainingSignals"), error: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.signalsId)
    if (!row) return
    // Keep the previous ready analysis visible: drop the failed run instead.
    const previous = await ctx.db
      .query("trainingSignals")
      .withIndex("by_trainingId_and_version", (q) => q.eq("trainingId", row.trainingId).eq("version", row.version))
      .order("desc")
      .take(5)
    if (previous.some((p) => p._id !== row._id && p.status === "ready")) {
      await ctx.db.delete(row._id)
      return
    }
    await ctx.db.patch(row._id, { status: "failed", at: Date.now(), error: args.error })
  },
})

/** True when the quote is in the passage text (used by the AI module's checks). */
export function quoteInPassage(quote: string, passage: { text: string; display: string }) {
  return quoteIn(quote, passage.text) || quoteIn(quote, passage.display)
}

/**
 * How it is going, per Learning objective of the version in use: how often
 * it is answered right on a first Attempt, the wrong answer chosen most,
 * flags, and how many questions code had to write.
 */
export const objectiveStats = query({
  args: { trainingId: v.id("trainings") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const t = await ctx.db.get(args.trainingId)
    if (!t) return null
    const version = t.liveVersion ?? t.currentVersion
    const row = await getVersion(ctx, t._id, version)
    if (!row) return null
    const attempts = (
      await ctx.db
        .query("trainingAttempts")
        .withIndex("by_trainingId", (q) => q.eq("trainingId", t._id))
        .take(2000)
    ).filter((a) => a.trainingVersion === version && (a.status === "passed" || a.status === "failed"))
    // First Attempt per person.
    const first = new Map<string, Doc<"trainingAttempts">>()
    for (const a of [...attempts].sort((x, y) => x.startedAt - y.startedAt))
      if (!first.has(String(a.personId))) first.set(String(a.personId), a)
    let questions = 0
    let byCode = 0
    const flagged: { prompt: string; flag: string; objectiveId: string }[] = []
    const out = row.objectives.map((o) => ({
      objectiveId: o.id,
      text: o.text,
      critical: Boolean(o.critical),
      answered: 0,
      right: 0,
      wrongAnswers: new Map<string, number>(),
    }))
    const byId = new Map(out.map((x) => [x.objectiveId, x]))
    for (const a of attempts) {
      for (const q of a.questions) {
        questions += 1
        if (q.source === "fallback") byCode += 1
        if (q.flag) flagged.push({ prompt: q.prompt, flag: q.flag, objectiveId: q.objectiveId })
      }
    }
    for (const a of first.values()) {
      for (const q of a.questions) {
        const s = byId.get(q.objectiveId)
        if (!s) continue
        if (q.kind === "open") {
          if (!q.grade) continue
          s.answered += 1
          if (q.grade.verdict === "good") s.right += 1
          else if (q.grade.misconception) s.wrongAnswers.set(q.grade.misconception, (s.wrongAnswers.get(q.grade.misconception) ?? 0) + 1)
          continue
        }
        if (q.answerIndex == null) continue
        s.answered += 1
        if (q.answerIndex === q.correctIndex) s.right += 1
        else {
          const w = q.options[q.answerIndex] ?? ""
          if (w) s.wrongAnswers.set(w, (s.wrongAnswers.get(w) ?? 0) + 1)
        }
      }
    }
    return {
      version,
      attempts: attempts.length,
      people: first.size,
      passed: attempts.filter((a) => a.status === "passed").length,
      questions,
      byCode,
      flagged: flagged.slice(0, 20),
      objectives: out.map((s) => {
        const top = [...s.wrongAnswers.entries()].sort((a, b) => b[1] - a[1])[0]
        return {
          objectiveId: s.objectiveId,
          text: s.text,
          critical: s.critical,
          answered: s.answered,
          firstTryRight: s.answered > 0 ? Math.round((s.right / s.answered) * 100) : null,
          topWrong: top ? { text: top[0], count: top[1] } : null,
        }
      }),
    }
  },
})

/**
 * What an Operator sees before starting: the version in use, how many
 * questions, about how long, the pass rule in plain words, and the source
 * documents. No questions, answers or quotes.
 */
export const learnerSummary = query({
  args: { trainingId: v.id("trainings") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const t = await ctx.db.get(args.trainingId)
    if (!t) return null
    const version = t.liveVersion ?? t.currentVersion
    const row = await getVersion(ctx, t._id, version)
    if (!row) return null
    const total = questionCount(row)
    const critical = row.objectives.filter((o) => o.critical).length
    // Same rule as attempts.start: under review, or a cited passage is gone.
    let blocked = t.needsReview
    const docs = makeDocCache(ctx)
    for (const o of row.objectives) {
      if (blocked) break
      if (!resolveObjective(await docs(o.documentId), o).passage) blocked = true
    }
    const sources = new Map<string, { documentId: Id<"documents">; namingCode: string; title: string; version: number }>()
    for (const o of row.objectives) {
      if (sources.has(String(o.documentId))) continue
      const doc = await ctx.db.get(o.documentId)
      sources.set(String(o.documentId), {
        documentId: o.documentId,
        namingCode: o.namingCode,
        title: doc?.title ?? o.namingCode,
        version: o.documentVersion,
      })
    }
    return {
      version,
      live: t.liveVersion != null && t.status !== "archived",
      blockedReason: blocked ? BLOCKED_REASON : null,
      purpose: row.purpose,
      questions: total,
      steps: row.breakdown?.length ?? 0,
      minutes: Math.max(3, Math.round(total * 0.8 + (row.breakdown?.length ?? 0) * 0.5)),
      passRule: passRule(row.passMark, critical, total),
      tryOutRequired: row.tryOut?.required ?? false,
      stops: row.stops.length,
      sources: [...sources.values()],
    }
  },
})

/**
 * Open contradiction Findings on the passages a Draft cites, before it is
 * saved (the builder warns while the Engineer picks passages).
 */
export const findingsForDraft = query({
  args: {
    objectives: v.array(
      v.object({
        id: v.string(),
        documentId: v.id("documents"),
        chunkId: v.union(v.id("chunks"), v.null()),
        quote: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const map = await openFindingsByObjective(ctx, {
      objectives: args.objectives.slice(0, 20).map((o) => ({
        ...o,
        text: "",
        namingCode: "",
        documentVersion: 0,
      })),
    })
    return [...map.entries()].map(([objectiveId, findings]) => ({ objectiveId, findings }))
  },
})
