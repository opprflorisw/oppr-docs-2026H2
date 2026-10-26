import { query } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { requireUser } from "./lib/auth"
import { isPublished } from "./lib/published"
import { readOrgSettings } from "./orgSettings"

const DAY = 24 * 60 * 60 * 1000

// Home for an Engineer: what needs a decision today, plus a small Knowledge
// health snapshot. Every inbox item carries one obvious next action.
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const now = Date.now()
    // A periodic review shows up in the inbox this long before it is due (Settings, Documents).
    const { dueSoonDays } = (await readOrgSettings(ctx)).documents
    const docs = await ctx.db.query("documents").take(2000)
    const wikis = await ctx.db.query("wikis").take(500)

    const people = await ctx.db.query("people").take(1000)
    const nameOf = (id: Id<"people"> | null | undefined) =>
      id ? (people.find((p) => p._id === id)?.name ?? null) : null
    const approvals = docs
      .filter((d) => d.status === "in_review" || d.status === "approved")
      .map((d) => ({
        // The person whose turn it is: the reviewer while in review, the
        // approver once approved. Home shows the action only to them.
        nextPersonId: (d.status === "in_review" ? d.reviewerPersonId : d.approverPersonId) ?? null,
        nextPersonName: nameOf(d.status === "in_review" ? d.reviewerPersonId : d.approverPersonId),
        _id: d._id,
        namingCode: d.namingCode,
        title: d.title,
        version: d.currentVersion,
        status: d.status,
        isRevision: d.liveVersion != null,
        updatedAt: d.updatedAt,
      }))
      .sort((a, b) => a.updatedAt - b.updatedAt)

    const reviews = docs
      .filter(
        (d) =>
          isPublished(d) &&
          d.nextReviewAt != null &&
          d.nextReviewAt <= now + dueSoonDays * DAY,
      )
      .map((d) => ({
        _id: d._id,
        namingCode: d.namingCode,
        title: d.title,
        version: d.liveVersion as number,
        nextReviewAt: d.nextReviewAt as number,
        daysLeft: Math.ceil(((d.nextReviewAt as number) - now) / DAY),
        // A newer edition already in progress counts as the review underway.
        revisionInProgress: d.currentVersion !== d.liveVersion,
      }))
      .sort((a, b) => a.nextReviewAt - b.nextReviewAt)

    const published = docs.filter(isPublished)
    return {
      approvals,
      reviews,
      health: {
        published: published.length,
        inProgress: docs.filter(
          (d) => d.status !== "archived" && d.status !== "pre_draft" && d.currentVersion !== d.liveVersion,
        ).length,
        reviewDue: reviews.length,
        overdue: reviews.filter((r) => r.daysLeft < 0).length,
        archived: docs.filter((d) => d.status === "archived").length,
        wikis: wikis.length,
      },
    }
  },
})

// ---- What changed this week ----------------------------------------------------

/** The reason skillsAfterPublish writes on a flagged level. */
function retrainReasonFor(code: string, version: number) {
  return `${code} v${version} was published with a Significant change`
}

/**
 * Publishes of the last 7 days. Significant changes and new documents are
 * listed one by one with what they set off: Trainings sent back to review and
 * people flagged for re-training. Other republishes (typo fixes) are only
 * counted.
 */
export const thisWeek = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const since = Date.now() - 7 * DAY
    const versions = (await ctx.db.query("documentVersions").order("desc").take(3000)).filter(
      (ver) => ver.publishedAt >= since,
    )
    const levels = await ctx.db.query("skillLevels").take(5000)
    const trainings = await ctx.db.query("trainings").take(500)
    const rows: {
      documentId: Id<"documents">
      namingCode: string
      title: string
      version: number
      kind: "significant" | "new"
      changeNote: string | null
      publishedAt: number
      retrainPeople: number
      trainingsToReview: number
    }[] = []
    let minor = 0
    const seen = new Set<string>()
    for (const ver of versions) {
      const doc = await ctx.db.get(ver.documentId)
      // Only versions that really went live (a draft edition has a row too).
      if (!doc || !isPublished(doc) || ver.version > (doc.liveVersion as number)) continue
      const key = `${doc._id}:${ver.version}`
      if (seen.has(key)) continue
      seen.add(key)
      const kind = ver.version === 1 ? "new" : ver.significantChange ? "significant" : null
      if (!kind) {
        minor++
        continue
      }
      const reason = retrainReasonFor(doc.namingCode, ver.version)
      rows.push({
        documentId: doc._id,
        namingCode: doc.namingCode,
        title: doc.title,
        version: ver.version,
        kind,
        changeNote: ver.changeNote ?? null,
        publishedAt: ver.publishedAt,
        retrainPeople: new Set(levels.filter((l) => l.retrainNeeded && l.retrainReason === reason).map((l) => l.personId))
          .size,
        trainingsToReview: trainings.filter(
          (t) => t.needsReview && (t.needsReviewReason ?? "").includes(doc.namingCode),
        ).length,
      })
    }
    rows.sort((a, b) => (a.kind === b.kind ? b.publishedAt - a.publishedAt : a.kind === "significant" ? -1 : 1))
    return { rows, minor }
  },
})

// ---- Skills that need someone ----------------------------------------------------

/** "EXT-OPS-SOP-0001 v3 was published with a Significant change" -> code and version. */
function parseReason(reason: string | null): { code: string; version: number } | null {
  const m = reason?.match(/^(\S+) v(\d+) was published/)
  return m ? { code: m[1], version: Number(m[2]) } : null
}

type TrainingRef = { _id: Id<"trainings">; code: string; title: string; kind: "course" | "round" } | null

/**
 * Home: Skills that need someone's attention, ready to act on.
 * - retrain: grouped by the document change that caused it, with the people,
 *   their Skills and the Training to assign.
 * - expiry: expired levels and levels expiring within 30 days, each with the
 *   Skill's Training to renew it (explicit links first) and the expiry date.
 * - coaching: people who did not pass the same Training twice or more since
 *   their last pass.
 */
export const skillAttention = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const now = Date.now()
    const [skills, people, trainings, levels] = await Promise.all([
      ctx.db.query("skills").take(500).then((r) => r.filter((s) => !s.archived)),
      ctx.db.query("people").take(500),
      ctx.db.query("trainings").take(500),
      ctx.db.query("skillLevels").take(5000),
    ])
    const skillById = new Map(skills.map((s) => [s._id, s]))
    const personById = new Map(people.map((p) => [p._id, p]))
    const live = trainings.filter((t) => t.liveVersion != null && t.status !== "archived")
    const liveById = new Map(live.map((t) => [t._id, t]))
    // Published Trainings citing each document (used when a Skill links none).
    const byDocument = new Map<Id<"documents">, Id<"trainings">[]>()
    for (const t of live) {
      const ver = await ctx.db
        .query("trainingVersions")
        .withIndex("by_trainingId_and_version", (q) => q.eq("trainingId", t._id).eq("version", t.liveVersion as number))
        .unique()
      for (const d of new Set((ver?.objectives ?? []).map((o) => o.documentId)))
        byDocument.set(d, [...(byDocument.get(d) ?? []), t._id])
    }
    function trainingFor(skill: Doc<"skills">): TrainingRef {
      const id =
        skill.trainingIds.find((x) => liveById.has(x)) ??
        skill.documentIds.flatMap((d) => byDocument.get(d) ?? [])[0] ??
        null
      const t = id ? liveById.get(id) : null
      return t ? { _id: t._id, code: t.code, title: t.title, kind: t.kind } : null
    }

    type Group = {
      key: string
      reason: string
      documentId: Id<"documents"> | null
      namingCode: string | null
      title: string | null
      version: number | null
      changeNote: string | null
      people: { personId: Id<"people">; name: string; skillId: Id<"skills">; skillName: string; level: number }[]
      training: TrainingRef
    }
    const groups = new Map<string, Group>()
    const expiry: {
      kind: "expired" | "expiring"
      personId: Id<"people">
      personName: string
      skillId: Id<"skills">
      skillName: string
      level: number
      expiresAt: number
      daysLeft: number
      training: TrainingRef
    }[] = []

    for (const row of levels) {
      const skill = skillById.get(row.skillId)
      const person = personById.get(row.personId)
      if (!skill || !person || row.level < 1) continue
      if (row.retrainNeeded) {
        const reason = row.retrainReason ?? "A linked document changed significantly"
        let g = groups.get(reason)
        if (!g) {
          const parsed = parseReason(row.retrainReason)
          const doc = parsed
            ? await ctx.db
                .query("documents")
                .withIndex("by_namingCode", (q) => q.eq("namingCode", parsed.code))
                .first()
            : null
          const ver =
            doc && parsed
              ? await ctx.db
                  .query("documentVersions")
                  .withIndex("by_documentId_and_version", (q) =>
                    q.eq("documentId", doc._id).eq("version", parsed.version),
                  )
                  .first()
              : null
          g = {
            key: reason,
            reason,
            documentId: doc?._id ?? null,
            namingCode: parsed?.code ?? null,
            title: doc?.title ?? null,
            version: parsed?.version ?? null,
            changeNote: ver?.changeNote ?? null,
            people: [],
            training: trainingFor(skill),
          }
          groups.set(reason, g)
        }
        g.people.push({ personId: person._id, name: person.name, skillId: skill._id, skillName: skill.name, level: row.level })
        if (!g.training) g.training = trainingFor(skill)
        continue
      }
      if (row.expiresAt == null) continue
      const daysLeft = Math.ceil((row.expiresAt - now) / DAY)
      if (daysLeft > 30) continue
      expiry.push({
        kind: row.expiresAt < now ? "expired" : "expiring",
        personId: person._id,
        personName: person.name,
        skillId: skill._id,
        skillName: skill.name,
        level: row.level,
        expiresAt: row.expiresAt,
        daysLeft,
        training: trainingFor(skill),
      })
    }
    expiry.sort((a, b) => (a.kind === b.kind ? a.daysLeft - b.daysLeft : a.kind === "expired" ? -1 : 1))

    // Coaching: two or more Attempts not passed on one Training since the last pass.
    // Newest first by when they ended (seeded rows are not inserted in time order).
    const attempts = (await ctx.db.query("trainingAttempts").order("desc").take(3000)).sort(
      (a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt),
    )
    const streaks = new Map<
      string,
      { personId: Id<"people">; trainingId: Id<"trainings">; fails: number; lastAt: number; done: boolean }
    >()
    for (const a of attempts) {
      if (a.status !== "failed" && a.status !== "passed") continue
      const key = `${a.personId}:${a.trainingId}`
      const s = streaks.get(key) ?? { personId: a.personId, trainingId: a.trainingId, fails: 0, lastAt: 0, done: false }
      if (!s.done) {
        if (a.status === "passed") s.done = true
        else {
          s.fails++
          s.lastAt = Math.max(s.lastAt, a.finishedAt ?? a.startedAt)
        }
      }
      streaks.set(key, s)
    }
    const coaching = []
    for (const s of streaks.values()) {
      if (s.fails < 2) continue
      const t = trainings.find((x) => x._id === s.trainingId)
      const p = personById.get(s.personId)
      if (!t || !p) continue
      coaching.push({
        personId: p._id,
        personName: p.name,
        trainingId: t._id,
        trainingCode: t.code,
        trainingTitle: t.title,
        fails: s.fails,
        lastAt: s.lastAt,
      })
    }
    coaching.sort((a, b) => b.lastAt - a.lastAt)

    return {
      retrain: [...groups.values()].sort((a, b) => b.people.length - a.people.length),
      expiry,
      coaching,
    }
  },
})
