// Self-test of the Training integrity rules against the dev data. Every
// scenario runs inside ONE mutation that throws at the end, so nothing it
// writes is kept. Run with: npx convex run trainingSelfTest:run
// The result is the error's data: { results: [{ name, ok, detail }] }.
import { ConvexError, v } from "convex/values"
import { internalAction, internalMutation, internalQuery, MutationCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import { Doc, Id } from "./_generated/dataModel"
import * as trainings from "./trainings"
import * as attempts from "./attempts"
import * as skills from "./skills"
import * as assignments from "./assignments"
import * as tryOuts from "./tryOuts"
import * as floor from "./floor"

type Result = { name: string; ok: boolean; detail: string }

// A registered function keeps its handler on _handler (convex/server).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (fn: unknown, ctx: unknown, args: unknown): Promise<any> => (fn as { _handler: (c: unknown, a: unknown) => Promise<unknown> })._handler(ctx, args)

async function throws(f: () => Promise<unknown>): Promise<string | null> {
  try {
    await f()
    return null
  } catch (e) {
    if (e instanceof ConvexError) return typeof e.data === "string" ? e.data : JSON.stringify(e.data)
    return e instanceof Error ? e.message : String(e)
  }
}

export const run = internalMutation({
  args: {},
  handler: async (real) => {
    const user = await real.db.query("users").first()
    if (!user) throw new Error("No user to act as.")
    // Act as the first account, as a signed-in session would.
    const ctx = {
      ...real,
      auth: {
        getUserIdentity: async () => ({
          subject: `${user._id}|selftest`,
          issuer: "selftest",
          tokenIdentifier: `selftest|${user._id}`,
        }),
      },
    } as unknown as MutationCtx
    const results: Result[] = []
    const add = (name: string, ok: boolean, detail: string) => results.push({ name, ok, detail })

    const people = await ctx.db.query("people").take(500)
    const who = (name: string) => people.find((p) => p.name === name)!
    const lotte = who("Lotte Smit")
    const sanne = who("Sanne Visser")
    const mark = who("Mark Jansen")
    const emma = who("Emma de Boer")
    const kevin = who("Kevin Mulder")
    const fatima = who("Fatima El Amrani")
    const byCode = async (code: string) =>
      (await ctx.db
        .query("trainings")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first())!

    // 1. Four-eyes: the author of a version cannot approve it.
    {
      const t = await byCode("EXT-TRN-0001")
      await call(trainings.newVersion, ctx, { id: t._id, personId: mark._id, changeNote: "Self-test version" })
      const blocked = await throws(() => call(trainings.submitForReview, ctx, { id: t._id, personId: mark._id }))
      add("send for review is refused while an open Finding is not acknowledged", !!blocked && blocked.includes("open contradiction"), blocked ?? "not refused")
      const cur = (await ctx.db.get(t._id))!
      const row = (await trainings.getVersion(ctx, t._id, cur.currentVersion))!
      for (const [objectiveId, list] of await trainings.openFindingsByObjective(ctx, row))
        for (const f of list)
          await call(trainings.ackFinding, ctx, {
            id: t._id,
            personId: mark._id,
            objectiveId,
            findingId: f.findingId,
            reason: "Checked against the manual; the SOP value holds.",
          })
      await call(trainings.submitForReview, ctx, { id: t._id, personId: mark._id })
      const err = await throws(() => call(trainings.approve, ctx, { id: t._id, personId: mark._id }))
      add("approve by the author throws 'Another Engineer'", !!err && err.includes("Another Engineer"), err ?? "did not throw")
    }

    // 2. Must-be-right: 83% with one wrong critical question fails.
    {
      const t = await byCode("EXT-TRN-0001")
      const row = (await trainings.getVersion(ctx, t._id, t.liveVersion!))!
      const objectives = row.objectives.slice(0, 6).map((o, i) => (i === 0 ? { ...o, critical: true } : o))
      await ctx.db.patch(row._id, { objectives: [...objectives, ...row.objectives.slice(6)] })
      const questions: Doc<"trainingAttempts">["questions"] = objectives.map((o, i) => ({
        id: `q${i + 1}`,
        objectiveId: o.id,
        stopIndex: null,
        prompt: `Question ${i + 1}`,
        options: ["a", "b", "c", "d"],
        correctIndex: 0,
        explanation: "x",
        citation: { documentId: o.documentId, namingCode: o.namingCode, version: o.documentVersion, chunkId: o.chunkId, quote: o.quote },
        answerIndex: i === 0 ? 1 : 0,
        answeredAt: Date.now(),
        flag: null,
        kind: "choice",
        ...(i === 0 ? { critical: true } : {}),
      }))
      const id = await ctx.db.insert("trainingAttempts", {
        trainingId: t._id,
        trainingVersion: t.liveVersion!,
        personId: kevin._id,
        status: "in_progress",
        questions,
        round: null,
        score: null,
        startedAt: Date.now(),
        finishedAt: null,
        error: null,
      })
      const r = await call(attempts.finish, ctx, { id, personId: kevin._id })
      const a = (await ctx.db.get(id))!
      add(
        "83% with a wrong must-be-right question is failed",
        r.score === 83 && a.status === "failed" && (a.mustBeRightMissed ?? []).length === 1,
        `score ${r.score}, status ${a.status}, reason ${r.reason}`,
      )
    }

    // 3. Explicit Skill links: passing EXT-TRN-0002 raises only the Skills that link it.
    {
      const t = await byCode("EXT-TRN-0002")
      const linked = (await ctx.db.query("skills").take(500)).filter((s) => s.trainingIds.includes(t._id))
      const before = (await ctx.db.query("skillEvents").withIndex("by_personId", (q) => q.eq("personId", kevin._id)).take(1000)).length
      const attemptId = await ctx.db.insert("trainingAttempts", {
        trainingId: t._id,
        trainingVersion: t.liveVersion!,
        personId: kevin._id,
        status: "passed",
        questions: [],
        round: null,
        score: 100,
        startedAt: Date.now(),
        finishedAt: Date.now(),
        error: null,
      })
      const recordId = await ctx.db.insert("trainingRecords", {
        personId: kevin._id,
        trainingId: t._id,
        trainingVersion: t.liveVersion!,
        attemptId,
        trainingCode: t.code,
        trainingTitle: t.title,
        score: 100,
        passedAt: Date.now(),
      })
      const r = await call(skills.onTrainingPassed, ctx, { personId: kevin._id, trainingId: t._id, recordId })
      const after = (await ctx.db.query("skillEvents").withIndex("by_personId", (q) => q.eq("personId", kevin._id)).take(1000)).length
      add(
        "passing EXT-TRN-0002 raises only explicitly linked Skills",
        after - before === linked.length && r.updated === linked.length,
        `${after - before} events, ${linked.length} linked Skills (${linked.map((s) => s.name).join(", ")})`,
      )
    }

    // 4. Assign, then My learning shows it with its due date (person already at level 1+).
    {
      const t = await byCode("EXT-TRN-0003")
      const due = Date.now() + 9 * 24 * 3600 * 1000
      await call(assignments.assign, ctx, { trainingId: t._id, personIds: [fatima._id], dueAt: due, reason: "self-test", personId: sanne._id })
      const ml = await call(skills.myLearning, ctx, { personId: fatima._id })
      const item = ml.todo.find((x: { training: { _id: Id<"trainings"> } | null }) => x.training?._id === t._id)
      add("assign then myLearning shows the Training with dueAt", !!item && item.dueAt === due, item ? `kind ${item.kind}, due ${item.dueAt}` : "not on the list")
    }

    // 5. Try-out: the trainee and an unqualified Operator cannot sign; Sanne can, and raises to level 2.
    {
      const t = await byCode("EXT-TRN-0002")
      const passed = (await ctx.db.query("trainingAttempts").withIndex("by_personId", (q) => q.eq("personId", lotte._id)).take(200)).find(
        (a) => a.trainingId === t._id && a.status === "passed",
      )
      if (!passed) add("try-out request", false, "Lotte has no passed EXT-TRN-0002 Attempt")
      else {
        const requestId = await call(tryOuts.request, ctx, { attemptId: passed._id, trainerId: null, personId: lotte._id })
        const items = [{ label: "Isolated the line", result: "ok" }]
        const self = await throws(() => call(tryOuts.sign, ctx, { requestId, items, note: "ok", personId: lotte._id }))
        const other = await throws(() => call(tryOuts.sign, ctx, { requestId, items, note: "ok", personId: emma._id }))
        add("try-out signed by the trainee throws", !!self, self ?? "did not throw")
        add("try-out signed without level 3 or Engineer throws", !!other, other ?? "did not throw")
        await call(tryOuts.sign, ctx, { requestId, items, note: "Did it well at EXL-201", personId: sanne._id })
        const req = (await ctx.db.get(requestId)) as Doc<"tryOutRequests">
        const levels = await ctx.db.query("skillLevels").withIndex("by_personId", (q) => q.eq("personId", lotte._id)).take(100)
        const raised = req.skillIds.map((id) => levels.find((l) => l.skillId === id)?.level ?? 0)
        const events = await ctx.db.query("skillEvents").withIndex("by_personId", (q) => q.eq("personId", lotte._id)).order("desc").take(20)
        const ev = events.find((e) => e.reason.startsWith("Try-out"))
        add(
          "try-out by Sanne, all OK: level 2 with evidence.documentVersion",
          raised.length > 0 && raised.every((l) => l >= 2) && ev?.evidence?.documentVersion != null,
          `levels ${raised.join(",")}, evidence v${ev?.evidence?.documentVersion}`,
        )
      }
    }

    // 6. Blocked Training: EXT-MNT-SOP-0001 loses its melt-pressure passage.
    {
      const doc = (await ctx.db.query("documents").withIndex("by_namingCode", (q) => q.eq("namingCode", "EXT-MNT-SOP-0001")).first())!
      const live = doc.liveVersion ?? doc.currentVersion
      const chunks = await ctx.db
        .query("chunks")
        .withIndex("by_documentId_and_version", (q) => q.eq("documentId", doc._id).eq("version", live))
        .take(1000)
      const t3 = await byCode("EXT-TRN-0003")
      const row = (await trainings.getVersion(ctx, t3._id, t3.liveVersion!))!
      const s2 = row.objectives.find((o) => /30 bar/.test(o.quote)) ?? row.objectives[1]
      let removed = 0
      for (const c of chunks)
        if (c._id === s2.chunkId || trainings.quoteIn(s2.quote, c.text)) {
          await ctx.db.delete(c._id)
          removed++
        }
      const forced = await trainings.markAffectedByPublish(ctx, { documentId: doc._id, version: live, previousVersion: live - 1, significantChange: false })
      const after = (await ctx.db.get(t3._id))!
      add("EXT-TRN-0003 needsReview after its passage is removed", after.needsReview && forced, `removed ${removed} chunks, reason: ${after.needsReviewReason}`)
      const ml = await call(skills.myLearning, ctx, { personId: lotte._id })
      const first = ml.todo[0]
      const t3item = ml.todo.find((x: { training: { _id: Id<"trainings"> } | null }) => x.training?._id === t3._id)
      add(
        "myLearning(Lotte): todo[0] is not blocked, EXT-TRN-0003 is blocked with plain copy",
        first?.status !== "blocked" && t3item?.status === "blocked" && !/—/.test(t3item?.blockedReason ?? ""),
        `todo[0] ${first?.training?.code ?? first?.kind} ${first?.status}; EXT-TRN-0003 ${t3item?.status}: ${t3item?.blockedReason}`,
      )
      const startErr = await throws(() => call(attempts.start, ctx, { trainingId: t3._id, personId: lotte._id }))
      add("attempts.start on a blocked Training throws the plain copy", startErr === trainings.BLOCKED_REASON, startErr ?? "did not throw")
    }

    // 7. Rounds for Lotte: QCL-TRN-0002 is not "for you".
    {
      const r = await call(floor.rounds, ctx, { personId: lotte._id })
      const codes = r.forYou.map((x: { code: string }) => x.code)
      add("floor.rounds(Lotte).forYou has no QCL-TRN-0002", !codes.includes("QCL-TRN-0002"), `forYou: ${codes.join(", ")}; other: ${r.other.map((x: { code: string }) => x.code).join(", ")}`)
    }

    // Roll back everything written above.
    throw new ConvexError({ results })
  },
})

/** Inserts a throwaway Attempt with one typed open answer, for the grading probe. */
export const probeInsert = internalMutation({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const t = (await ctx.db
      .query("trainings")
      .withIndex("by_code", (q) => q.eq("code", "EXT-TRN-0001"))
      .first())!
    const row = (await trainings.getVersion(ctx, t._id, t.liveVersion!))!
    const o = row.objectives.find((x) => /PX-4400/.test(x.quote)) ?? row.objectives[0]
    const person = (await ctx.db.query("people").take(50)).find((p) => p.name === "Kevin Mulder")!
    return await ctx.db.insert("trainingAttempts", {
      trainingId: t._id,
      trainingVersion: t.liveVersion!,
      personId: person._id,
      status: "in_progress",
      questions: [
        {
          id: "q1",
          objectiveId: o.id,
          stopIndex: null,
          prompt: "Describe in your own words how you purge the barrel during a colour changeover.",
          options: [],
          correctIndex: 0,
          explanation: o.quote,
          citation: { documentId: o.documentId, namingCode: o.namingCode, version: o.documentVersion, chunkId: o.chunkId, quote: o.quote },
          answerIndex: null,
          answeredAt: Date.now(),
          flag: null,
          kind: "open",
          keyPoints: ["Use purge compound PX-4400", "Purge at 190 °C", "Keep purging until the melt runs clean"],
          answerText: args.text,
          answerMode: "typed",
        },
      ],
      round: null,
      score: null,
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
    })
  },
})

export const probeRead = internalQuery({
  args: { id: v.id("trainingAttempts") },
  handler: async (ctx, args) => (await ctx.db.get(args.id))?.questions[0] ?? null,
})

export const probeDelete = internalMutation({
  args: { id: v.id("trainingAttempts") },
  handler: async (ctx, args) => {
    if (await ctx.db.get(args.id)) await ctx.db.delete(args.id)
  },
})

/** Grades two typed answers with the real AI, then removes the throwaway Attempts. */
export const probeGrading = internalAction({
  args: {},
  handler: async (ctx): Promise<unknown> => {
    const out = []
    for (const text of [
      "I use the PX-4400 purge compound at 190 degrees and keep going until the melt is clean.",
      "I run it at 230 like normal production until it looks clean.",
    ]) {
      const id = await ctx.runMutation(internal.trainingSelfTest.probeInsert, { text })
      await ctx.runAction(internal.ai.training.gradeOpenAnswer, { attemptId: id, questionId: "q1" })
      const q = await ctx.runQuery(internal.trainingSelfTest.probeRead, { id })
      await ctx.runMutation(internal.trainingSelfTest.probeDelete, { id })
      out.push({ text, grade: q?.grade ?? null, gradeError: q?.gradeError ?? null })
    }
    const t: { _id: Id<"trainings"> }[] = await ctx.runQuery(internal.trainingSelfTest.trainingIdByCode, { code: "EXT-TRN-0001" })
    const samples = t[0] ? await ctx.runAction(internal.ai.training.sampleQuestionsInternal, { trainingId: t[0]._id }) : []
    return { grading: out, samples }
  },
})

export const trainingIdByCode = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, args) =>
    (await ctx.db
      .query("trainings")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .collect()).map((t) => ({ _id: t._id })),
})
