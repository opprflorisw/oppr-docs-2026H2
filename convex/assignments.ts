// Assignments (TWI: who must do which Training, by when).
//
// An assignment asks one person to pass the live version of a Training by a
// due date. Assignments come from the publish audience, from an Engineer
// ("Assign to people"), from re-training after a Significant change, and from
// the refresher before a level expires. Passing the Training marks every open
// assignment of that Training for that person done (attempts.finish).
import { ConvexError, v } from "convex/values"
import { internalMutation, mutation, MutationCtx, query, QueryCtx } from "./_generated/server"
import { Doc, Id } from "./_generated/dataModel"
import { requireUserId } from "./lib/auth"
import { addMonths } from "./skills"
import { requireEngineerOrAdmin } from "./lib/roles"
import { readOrgSettings } from "./orgSettings"

const DAY = 24 * 60 * 60 * 1000

/** The default due date: the company's due days (Settings, Training) from now. */
export async function defaultDueAt(ctx: Ctx, from = Date.now()): Promise<number> {
  return from + (await readOrgSettings(ctx)).training.dueDays * DAY
}

type Ctx = QueryCtx | MutationCtx
type Source = Doc<"trainingAssignments">["source"]

function requireEngineerPerson(ctx: Ctx, personId: Id<"people">) {
  return requireEngineerOrAdmin(ctx, personId, "Check in as an Engineer to assign Trainings.")
}

/**
 * Creates (or moves forward) one open assignment per person. An open
 * assignment of the same Training keeps one row: the earlier due date wins.
 * Used by assign, publish (audience), re-train and the refresher cron.
 */
export async function createAssignments(
  ctx: MutationCtx,
  args: {
    trainingId: Id<"trainings">
    personIds: Id<"people">[]
    dueAt: number
    reason: string | null
    source: Source
    assignedBy: Id<"people"> | null
  },
) {
  let created = 0
  let updated = 0
  const now = Date.now()
  for (const personId of new Set(args.personIds)) {
    if (!(await ctx.db.get(personId))) continue
    const open = (
      await ctx.db
        .query("trainingAssignments")
        .withIndex("by_personId", (q) => q.eq("personId", personId))
        .take(500)
    ).find((a) => a.trainingId === args.trainingId && a.status === "open")
    if (open) {
      if (args.dueAt < open.dueAt || (args.reason && !open.reason)) {
        await ctx.db.patch(open._id, {
          dueAt: Math.min(open.dueAt, args.dueAt),
          reason: open.reason ?? args.reason,
        })
        updated++
      }
      continue
    }
    await ctx.db.insert("trainingAssignments", {
      trainingId: args.trainingId,
      personId,
      dueAt: args.dueAt,
      assignedBy: args.assignedBy,
      reason: args.reason,
      source: args.source,
      status: "open",
      createdAt: now,
      doneAt: null,
    })
    created++
  }
  return { created, updated }
}

/** A pass closes the person's open assignments of that Training. */
export async function completeAssignments(
  ctx: MutationCtx,
  personId: Id<"people">,
  trainingId: Id<"trainings">,
  at: number,
) {
  const rows = await ctx.db
    .query("trainingAssignments")
    .withIndex("by_personId", (q) => q.eq("personId", personId))
    .take(500)
  let done = 0
  for (const a of rows) {
    if (a.trainingId !== trainingId || a.status !== "open") continue
    await ctx.db.patch(a._id, { status: "done", doneAt: at })
    done++
  }
  return done
}

/** People of the audience: everyone holding one of the profiles plus the named people. */
export async function audiencePeople(
  ctx: Ctx,
  audience: { profileIds: Id<"skillProfiles">[]; personIds: Id<"people">[] },
) {
  const ids = new Set<Id<"people">>(audience.personIds)
  if (audience.profileIds.length > 0) {
    for (const p of await ctx.db.query("people").take(500)) {
      if ((p.profileIds ?? []).some((id) => audience.profileIds.includes(id))) ids.add(p._id)
    }
  }
  return [...ids]
}

// ---- Mutations ----------------------------------------------------------------

/** "Assign to people": an Engineer asks people to pass this Training by a date. */
export const assign = mutation({
  args: {
    trainingId: v.id("trainings"),
    personIds: v.array(v.id("people")),
    /** Omitted: the company's default due days from now. */
    dueAt: v.optional(v.number()),
    reason: v.optional(v.union(v.string(), v.null())),
    personId: v.id("people"),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerPerson(ctx, args.personId)
    const t = await ctx.db.get(args.trainingId)
    if (!t) throw new ConvexError("This Training no longer exists.")
    if (t.status === "archived") throw new ConvexError("This Training is archived. Assign its replacement instead.")
    if (t.isPractice) throw new ConvexError("This is a practice Training. It is not assigned to people.")
    if (args.personIds.length === 0) throw new ConvexError("Pick at least one person.")
    const dueAt = args.dueAt ?? (await defaultDueAt(ctx))
    if (dueAt < Date.now() - DAY) throw new ConvexError("Pick a due date that is not in the past.")
    return await createAssignments(ctx, {
      trainingId: t._id,
      personIds: args.personIds,
      dueAt,
      reason: args.reason?.trim() || null,
      source: "manual",
      assignedBy: args.personId,
    })
  },
})

/**
 * Reminds people of an open assignment. Pass one assignmentId, or a
 * trainingId to remind everyone who has not passed it yet. Records when, so
 * the People tab can say "Reminded 24 Oct".
 */
export const remind = mutation({
  args: {
    assignmentId: v.optional(v.id("trainingAssignments")),
    trainingId: v.optional(v.id("trainings")),
    personId: v.id("people"),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerPerson(ctx, args.personId)
    const now = Date.now()
    let rows: Doc<"trainingAssignments">[] = []
    if (args.assignmentId) {
      const a = await ctx.db.get(args.assignmentId)
      if (a) rows = [a]
    } else if (args.trainingId) {
      rows = await ctx.db
        .query("trainingAssignments")
        .withIndex("by_trainingId", (q) => q.eq("trainingId", args.trainingId!))
        .take(1000)
    } else throw new ConvexError("Say who to remind.")
    let reminded = 0
    for (const a of rows) {
      if (a.status !== "open") continue
      await ctx.db.patch(a._id, { lastRemindedAt: now })
      reminded++
    }
    return { reminded }
  },
})

/** Takes back an open assignment. */
export const cancel = mutation({
  args: { assignmentId: v.id("trainingAssignments"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerPerson(ctx, args.personId)
    const a = await ctx.db.get(args.assignmentId)
    if (!a || a.status !== "open") return
    await ctx.db.patch(a._id, { status: "cancelled", doneAt: Date.now() })
  },
})

// ---- Queries ------------------------------------------------------------------

async function lastAttemptOf(ctx: QueryCtx, personId: Id<"people">, trainingId: Id<"trainings">) {
  const rows = await ctx.db
    .query("trainingAttempts")
    .withIndex("by_personId", (q) => q.eq("personId", personId))
    .order("desc")
    .take(300)
  return rows.filter((a) => a.trainingId === trainingId)
}

/** The person's assignments: open first by due date, then the recently done ones. */
export const listForPerson = query({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const now = Date.now()
    const rows = await ctx.db
      .query("trainingAssignments")
      .withIndex("by_personId", (q) => q.eq("personId", args.personId))
      .take(500)
    const out = []
    for (const a of rows) {
      if (a.status === "cancelled") continue
      const t = await ctx.db.get(a.trainingId)
      if (!t) continue
      const by = a.assignedBy ? await ctx.db.get(a.assignedBy) : null
      out.push({
        _id: a._id,
        trainingId: a.trainingId,
        code: t.code,
        title: t.title,
        kind: t.kind,
        dueAt: a.dueAt,
        reason: a.reason,
        source: a.source,
        status: a.status,
        overdue: a.status === "open" && a.dueAt < now,
        assignedByName: by?.name ?? null,
        createdAt: a.createdAt,
        doneAt: a.doneAt,
        blocked: t.needsReview || t.liveVersion == null || t.status === "archived",
      })
    }
    return out.sort(
      (a, b) =>
        Number(a.status !== "open") - Number(b.status !== "open") ||
        (a.status === "open" ? a.dueAt - b.dueAt : (b.doneAt ?? 0) - (a.doneAt ?? 0)),
    )
  },
})

/**
 * Who must do this Training and where they stand, for the People tab:
 * "Assigned 4 · Passed 1 · Not started 3 · Overdue 0".
 */
export const listForTraining = query({
  args: { trainingId: v.id("trainings") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const now = Date.now()
    const rows = await ctx.db
      .query("trainingAssignments")
      .withIndex("by_trainingId", (q) => q.eq("trainingId", args.trainingId))
      .take(1000)
    const people = []
    const summary = { assigned: 0, passed: 0, inProgress: 0, notStarted: 0, notPassed: 0, overdue: 0 }
    // One row per person: the open assignment, else the latest one.
    const byPerson = new Map<string, Doc<"trainingAssignments">>()
    for (const a of rows.sort((x, y) => x.createdAt - y.createdAt)) {
      if (a.status === "cancelled") continue
      const prev = byPerson.get(String(a.personId))
      if (!prev || prev.status !== "open" || a.status === "open") byPerson.set(String(a.personId), a)
    }
    for (const a of byPerson.values()) {
      const person = await ctx.db.get(a.personId)
      if (!person) continue
      const attempts = (await lastAttemptOf(ctx, a.personId, a.trainingId)).filter(
        (x) => x.startedAt >= a.createdAt - DAY,
      )
      const last = attempts[0] ?? null
      let state: "passed" | "in_progress" | "not_passed" | "not_started"
      if (a.status === "done" || attempts.some((x) => x.status === "passed")) state = "passed"
      else if (last && (last.status === "in_progress" || last.status === "generating")) state = "in_progress"
      else if (last && last.status === "failed") state = "not_passed"
      else state = "not_started"
      const overdue = a.status === "open" && a.dueAt < now
      summary.assigned++
      if (state === "passed") summary.passed++
      if (state === "in_progress") summary.inProgress++
      if (state === "not_started") summary.notStarted++
      if (state === "not_passed") summary.notPassed++
      if (overdue) summary.overdue++
      people.push({
        assignmentId: a._id,
        personId: a.personId,
        name: person.name,
        role: person.role,
        dueAt: a.dueAt,
        reason: a.reason,
        source: a.source,
        status: a.status,
        state,
        overdue,
        attempts: attempts.filter((x) => x.status === "passed" || x.status === "failed").length,
        lastScore: last?.score ?? null,
        lastAt: last ? last.finishedAt ?? last.startedAt : null,
        lastRemindedAt: a.lastRemindedAt ?? null,
        doneAt: a.doneAt,
      })
    }
    const rank = { not_passed: 0, not_started: 1, in_progress: 2, passed: 3 }
    people.sort(
      (a, b) => Number(b.overdue) - Number(a.overdue) || rank[a.state] - rank[b.state] || a.dueAt - b.dueAt,
    )
    return { summary, people }
  },
})

/** Dev clean-up: removes every assignment (the seed recreates them). */
export const clearAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    let removed = 0
    for (const a of await ctx.db.query("trainingAssignments").take(4000)) {
      await ctx.db.delete(a._id)
      removed++
    }
    return { removed }
  },
})

/** A refresher is assigned this long before the level or record expires. */
export const REFRESH_BEFORE_DAYS = 30

/**
 * Daily (convex/crons.ts): refresher assignments 30 days before a level or a
 * record expires.
 * - A Skill level with an expiry date gets an assignment of a live Training
 *   that proves the Skill (skill.trainingIds).
 * - The latest Training record of a version with refreshMonths gets an
 *   assignment of the same Training when its refresh date comes near.
 * Passing it before expiry renews the level as it is (skills.onTrainingPassed).
 */
export const createRefreshers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const horizon = now + REFRESH_BEFORE_DAYS * DAY
    let created = 0
    const trainings = (await ctx.db.query("trainings").take(500)).filter(
      (t) => t.liveVersion != null && t.status !== "archived" && !t.isPractice,
    )
    const liveIds = new Set(trainings.map((t) => String(t._id)))
    for (const s of await ctx.db.query("skills").take(500).then((r) => r.filter((s) => !s.archived))) {
      const trainingId = s.trainingIds.find((id) => liveIds.has(String(id)))
      if (!trainingId) continue
      const levels = await ctx.db
        .query("skillLevels")
        .withIndex("by_skillId", (q) => q.eq("skillId", s._id))
        .take(1000)
      for (const l of levels) {
        if (l.level < 1 || l.expiresAt == null || l.expiresAt > horizon || l.expiresAt < now) continue
        const r = await createAssignments(ctx, {
          trainingId,
          personIds: [l.personId],
          dueAt: l.expiresAt,
          source: "renew",
          reason: `${s.name} expires soon`,
          assignedBy: null,
        })
        created += r.created
      }
    }
    for (const t of trainings) {
      const row = await ctx.db
        .query("trainingVersions")
        .withIndex("by_trainingId_and_version", (q) => q.eq("trainingId", t._id).eq("version", t.liveVersion!))
        .unique()
      if (!row?.refreshMonths) continue
      const records = await ctx.db
        .query("trainingRecords")
        .withIndex("by_trainingId", (q) => q.eq("trainingId", t._id))
        .take(2000)
      const latest = new Map<string, Doc<"trainingRecords">>()
      for (const r of records) {
        const prev = latest.get(String(r.personId))
        if (!prev || r.passedAt > prev.passedAt) latest.set(String(r.personId), r)
      }
      for (const r of latest.values()) {
        const due = addMonths(r.passedAt, row.refreshMonths)
        if (due > horizon) continue
        const res = await createAssignments(ctx, {
          trainingId: t._id,
          personIds: [r.personId],
          dueAt: Math.max(due, now + 7 * DAY),
          source: "renew",
          reason: `Refresher of ${t.code}`,
          assignedBy: null,
        })
        created += res.created
      }
    }
    return { created }
  },
})
