// Skills, Skill profiles and the Skill matrix (CONTEXT.md: Learn).
//
// A Skill is held by one person at a level:
//   0 not trained, 1 trained (a passed Training sets it), 2 qualified and
//   3 can train others (both need an Engineer's sign-off on practice).
// A level may expire (Skill.validityMonths). An expired level is shown as
// "expired" and counts as 0 for gaps and coverage.
// A Significant change to a linked Document flags every holder as
// "re-train needed" until they pass a covering Training again or an
// Engineer signs them off.
//
// Only Published Trainings count towards Skills and are offered for gaps.
import { v } from "convex/values"
import {
  internalMutation,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from "./_generated/server"
import { Doc, Id } from "./_generated/dataModel"
import type { PublishEvent } from "./lib/onPublish"
import { requireUser, requireUserId } from "./lib/auth"
import { requireEngineer } from "./documents"
import { isPublished } from "./lib/published"
import { BLOCKED_REASON } from "./trainings"
import { createAssignments } from "./assignments"

const DAY = 24 * 60 * 60 * 1000
/** A level that expires within this many days shows as "expiring". */
export const EXPIRING_WINDOW_DAYS = 30
/** Re-train after a Significant change is due this many days later. */
export const RETRAIN_DAYS = 14

export type CellStatus = "ok" | "gap" | "expired" | "expiring" | "retrain" | "none"

/** Adds whole months, clamped to the last day of the target month (31 Jan + 1 = 28/29 Feb). */
export function addMonths(at: number, months: number): number {
  const d = new Date(at)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d.getTime()
}

/** The plant's shifts: early 06:00-14:00, late 14:00-22:00, night 22:00-06:00. */
export type Shift = "early" | "late" | "night"
export const SHIFTS: Shift[] = ["early", "late", "night"]

/** The person's shift: the shift field, else derived from the role text ("Line operator, night shift"). */
export function shiftOf(person: Doc<"people">): Shift | null {
  if (person.shift === "early" || person.shift === "day") return "early"
  if (person.shift === "late" || person.shift === "night") return person.shift
  if (/\bnight\b/i.test(person.role)) return "night"
  if (/\blate\b/i.test(person.role)) return "late"
  if (/\b(early|day)\b/i.test(person.role)) return "early"
  return null
}

// ---- Pure rules ---------------------------------------------------------------

export function isExpired(row: Doc<"skillLevels"> | null | undefined, now: number): boolean {
  return !!row && row.level >= 1 && row.expiresAt != null && row.expiresAt < now
}

/** The level that counts: the stored one, or 0 once it has expired. */
export function effectiveLevel(row: Doc<"skillLevels"> | null | undefined, now: number): number {
  if (!row) return 0
  return isExpired(row, now) ? 0 : row.level
}

export function cellStatus(
  row: Doc<"skillLevels"> | null | undefined,
  target: number | null,
  now: number,
): CellStatus {
  const level = row?.level ?? 0
  if (row && level >= 1 && row.retrainNeeded) return "retrain"
  if (isExpired(row, now)) return "expired"
  const eff = effectiveLevel(row, now)
  if (target != null && target > 0 && eff < target) return "gap"
  if (row && level >= 1 && row.expiresAt != null && row.expiresAt - now <= EXPIRING_WINDOW_DAYS * DAY)
    return "expiring"
  if (eff >= 1 || (target != null && target > 0)) return "ok"
  return "none"
}

/** Meets the target for running the line: expiring still counts; expired and re-train do not. */
function meetsTarget(row: Doc<"skillLevels"> | null | undefined, target: number, now: number) {
  if (row?.retrainNeeded && row.level >= 1) return false
  return effectiveLevel(row, now) >= target
}

// ---- Loading ------------------------------------------------------------------

type Ctx = QueryCtx | MutationCtx

interface PublishedTraining {
  _id: Id<"trainings">
  code: string
  title: string
  kind: "course" | "round"
  liveVersion: number
  documentIds: Set<Id<"documents">>
  needsReview: boolean
  isPractice: boolean
  tryOutRequired: boolean
}

async function publishedTrainings(ctx: Ctx): Promise<PublishedTraining[]> {
  const all = await ctx.db.query("trainings").take(500)
  const out: PublishedTraining[] = []
  for (const t of all) {
    if (t.liveVersion == null || t.status === "archived") continue
    const ver = await ctx.db
      .query("trainingVersions")
      .withIndex("by_trainingId_and_version", (q) =>
        q.eq("trainingId", t._id).eq("version", t.liveVersion as number),
      )
      .unique()
    out.push({
      _id: t._id,
      code: t.code,
      title: t.title,
      kind: t.kind,
      liveVersion: t.liveVersion,
      documentIds: new Set((ver?.objectives ?? []).map((o) => o.documentId)),
      // Set at publish when a cited passage is gone (trainings.markAffectedByPublish).
      needsReview: t.needsReview,
      isPractice: t.isPractice ?? false,
      tryOutRequired: ver?.tryOut?.required ?? false,
    })
  }
  return out.sort((a, b) => a.code.localeCompare(b.code))
}

/**
 * A Published Training covers a Skill only when the Skill links it
 * (skill.trainingIds). Overlap with the Skill's Documents is a suggestion
 * (suggestedLinks), never a link.
 */
export function covers(t: { _id: Id<"trainings"> }, skill: Doc<"skills">): boolean {
  return skill.trainingIds.includes(t._id)
}

async function allSkills(ctx: Ctx) {
  const skills = await ctx.db.query("skills").take(500)
  return skills.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

async function allProfiles(ctx: Ctx) {
  const profiles = await ctx.db.query("skillProfiles").take(200)
  return profiles.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

async function allPeople(ctx: Ctx) {
  const people = await ctx.db.query("people").take(500)
  return people.sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Area codes with their labels ("EXT" → "Hall 2 · Extrusion"). */
async function areaLabels(ctx: Ctx) {
  const rows = await ctx.db.query("namingLocations").take(200)
  return new Map(rows.map((r) => [r.code, r.label]))
}

async function levelsOf(ctx: Ctx, personId: Id<"people">) {
  const rows = await ctx.db
    .query("skillLevels")
    .withIndex("by_personId", (q) => q.eq("personId", personId))
    .take(500)
  return new Map(rows.map((r) => [r.skillId, r]))
}

/** Highest target across the person's profiles, per Skill. */
function targetsFor(person: Doc<"people">, profiles: Doc<"skillProfiles">[]) {
  const mine = profiles.filter((p) => (person.profileIds ?? []).includes(p._id))
  const targets = new Map<Id<"skills">, number>()
  for (const p of mine)
    for (const t of p.targets)
      targets.set(t.skillId, Math.max(targets.get(t.skillId) ?? 0, t.level))
  return { mine, targets }
}

function cellOf(row: Doc<"skillLevels"> | undefined | null, target: number | null, now: number) {
  return {
    level: row?.level ?? 0,
    effectiveLevel: effectiveLevel(row, now),
    target,
    status: cellStatus(row, target, now),
    achievedAt: row?.achievedAt ?? null,
    expiresAt: row?.expiresAt ?? null,
    source: row?.source ?? null,
    retrainReason: row?.retrainNeeded ? row.retrainReason : null,
    hasRecord: !!row?.recordId,
  }
}
export type Cell = ReturnType<typeof cellOf>

// ---- Queries ------------------------------------------------------------------

/**
 * The Skill matrix: people against Skills, current against target level.
 * profileId narrows to the people holding that profile and its Skills;
 * area narrows the Skill columns.
 */
export const matrix = query({
  args: {
    profileId: v.optional(v.id("skillProfiles")),
    area: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const now = Date.now()
    const [skills, profiles, people] = await Promise.all([
      allSkills(ctx),
      allProfiles(ctx),
      allPeople(ctx),
    ])
    const profile = args.profileId ? profiles.find((p) => p._id === args.profileId) ?? null : null

    let columns = skills
    if (profile) {
      const order = new Map(profile.targets.map((t, i) => [t.skillId, i]))
      columns = skills
        .filter((s) => order.has(s._id))
        .sort((a, b) => (order.get(a._id) ?? 0) - (order.get(b._id) ?? 0))
    }
    if (args.area) columns = columns.filter((s) => s.area === args.area)

    const rows = []
    for (const person of people) {
      const { mine, targets } = targetsFor(person, profiles)
      if (profile && !mine.some((p) => p._id === profile._id)) continue
      const levels = await levelsOf(ctx, person._id)
      const attempts = await ctx.db
        .query("trainingAttempts")
        .withIndex("by_personId", (q) => q.eq("personId", person._id))
        .take(500)
      const cells: Record<string, Cell & { failStreak: number }> = {}
      let relevant = false
      const summary = { targets: 0, atTarget: 0, gaps: 0, expired: 0, expiring: 0, retrain: 0 }
      for (const s of columns) {
        const target = targets.get(s._id) ?? null
        const row = levels.get(s._id)
        const c = cellOf(row, target, now)
        const streak = Math.max(0, ...s.trainingIds.map((id) => failStreak(attempts.filter((a) => a.trainingId === id))))
        cells[s._id] = { ...c, failStreak: streak }
        if ((target ?? 0) > 0 || c.level >= 1) relevant = true
        if (target != null && target > 0) {
          summary.targets++
          if (meetsTarget(row, target, now)) summary.atTarget++
        }
        if (c.status === "gap") summary.gaps++
        if (c.status === "expired") summary.expired++
        if (c.status === "expiring") summary.expiring++
        if (c.status === "retrain") summary.retrain++
      }
      // Someone with no profile and nothing in these columns only adds noise.
      if (!relevant && (mine.length === 0 || args.area)) continue
      rows.push({
        _id: person._id,
        name: person.name,
        role: person.role,
        kind: person.kind,
        area: person.area,
        shift: shiftOf(person),
        profiles: mine.map((p) => ({ _id: p._id, name: p.name })),
        cells,
        summary,
      })
    }

    const labels = await areaLabels(ctx)
    const areas = [...new Set(skills.map((s) => s.area).filter((a): a is string => !!a))]
      .sort()
      .map((code) => ({ code, label: labels.get(code) ?? code }))
    return {
      skills: columns.map((s) => ({
        _id: s._id,
        name: s.name,
        area: s.area,
        validityMonths: s.validityMonths,
      })),
      people: rows,
      profiles: profiles.map((p) => ({ _id: p._id, name: p.name })),
      areas,
      totalSkills: skills.length,
    }
  },
})

/**
 * "Who can run line 2 tonight?": people meeting every requirement, grouped by
 * shift. Requirements come from skillIds + minLevel when given, otherwise
 * from a profile's targets (profileId, or the profile named like "Line 2
 * operator"). An expired level or "re-train needed" does not count.
 */
export const coverage = query({
  args: {
    profileId: v.optional(v.id("skillProfiles")),
    skillIds: v.optional(v.array(v.id("skills"))),
    minLevel: v.optional(v.number()),
    /** Only people of this shift ("early", "late" or "night"). */
    shift: v.optional(v.union(v.literal("early"), v.literal("late"), v.literal("night"), v.null())),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const now = Date.now()
    const [skills, profiles, people] = await Promise.all([
      allSkills(ctx),
      allProfiles(ctx),
      allPeople(ctx),
    ])
    const skillById = new Map(skills.map((s) => [s._id, s]))

    let profile: Doc<"skillProfiles"> | null = null
    let requirements: { skillId: Id<"skills">; level: number }[]
    if (args.skillIds && args.skillIds.length > 0) {
      const min = args.minLevel ?? 2
      requirements = args.skillIds.map((skillId) => ({ skillId, level: min }))
    } else {
      profile = args.profileId
        ? profiles.find((p) => p._id === args.profileId) ?? null
        : profiles.find((p) => /line\s*2/i.test(p.name)) ?? null
      requirements = (profile?.targets ?? []).filter((t) => t.level > 0)
    }
    requirements = requirements.filter((r) => skillById.has(r.skillId))

    const qualified: {
      _id: Id<"people">
      name: string
      role: string
      shift: Shift | null
      expiringSoon: string[]
    }[] = []
    const almost: {
      _id: Id<"people">
      name: string
      role: string
      shift: Shift | null
      missing: { skillName: string; reason: string }[]
    }[] = []
    if (requirements.length > 0) {
      for (const person of people) {
        if (args.shift && shiftOf(person) !== args.shift) continue
        const levels = await levelsOf(ctx, person._id)
        const missing: { skillName: string; reason: string }[] = []
        const expiringSoon: string[] = []
        for (const r of requirements) {
          const row = levels.get(r.skillId)
          const name = skillById.get(r.skillId)?.name ?? "Skill"
          const eff = effectiveLevel(row, now)
          if (row?.retrainNeeded && row.level >= 1) missing.push({ skillName: name, reason: "re-train needed" })
          else if (isExpired(row, now)) missing.push({ skillName: name, reason: "expired" })
          else if (eff < r.level) missing.push({ skillName: name, reason: `level ${eff} of ${r.level}` })
          else if (row?.expiresAt != null && row.expiresAt - now <= EXPIRING_WINDOW_DAYS * DAY)
            expiringSoon.push(name)
        }
        const base = { _id: person._id, name: person.name, role: person.role, shift: shiftOf(person) }
        // "Not yet" lists the people this is about: holders of the profile,
        // or (for a list of Skills) people who hold at least one of them.
        const relevant = profile
          ? (person.profileIds ?? []).includes(profile._id)
          : requirements.some((r) => (levels.get(r.skillId)?.level ?? 0) >= 1)
        if (missing.length === 0) qualified.push({ ...base, expiringSoon })
        else if (relevant) almost.push({ ...base, missing })
      }
    }

    // Every shift someone works, in the order of the day: early, late, night
    // ("tonight" is the night shift).
    const worked = new Set(people.map(shiftOf))
    const shiftNames = SHIFTS.filter((s) => worked.has(s) && (!args.shift || s === args.shift))
    const groups: { shift: Shift | null; people: typeof qualified }[] = shiftNames.map((shift) => ({
      shift,
      people: qualified.filter((p) => p.shift === shift),
    }))
    const noShift = qualified.filter((p) => p.shift === null)
    if (noShift.length > 0) groups.push({ shift: null, people: noShift })
    return {
      profile: profile ? { _id: profile._id, name: profile.name } : null,
      shift: args.shift ?? null,
      count: qualified.length,
      requirements: requirements.map((r) => ({
        skillId: r.skillId,
        skillName: skillById.get(r.skillId)?.name ?? "Skill",
        level: r.level,
      })),
      qualified,
      byShift: groups,
      almost: almost.sort((a, b) => a.missing.length - b.missing.length),
    }
  },
})

type NextStep = "training" | "signoff" | "none"

async function buildPersonDetail(ctx: QueryCtx, personId: Id<"people">) {
  const now = Date.now()
  const person = await ctx.db.get(personId)
  if (!person) return null
  const [skills, profiles, trainings, people] = await Promise.all([
    allSkills(ctx),
    allProfiles(ctx),
    publishedTrainings(ctx),
    allPeople(ctx),
  ])
  const nameOf = new Map(people.map((p) => [p._id, p.name]))
  const { mine, targets } = targetsFor(person, profiles)
  const levels = await levelsOf(ctx, person._id)

  const records = (
    await ctx.db
      .query("trainingRecords")
      .withIndex("by_personId", (q) => q.eq("personId", person._id))
      .take(200)
  ).sort((a, b) => b.passedAt - a.passedAt)
  const passedTrainingIds = new Set(records.map((r) => r.trainingId))
  const attempts = await ctx.db
    .query("trainingAttempts")
    .withIndex("by_personId", (q) => q.eq("personId", person._id))
    .take(500)
  const requests = (
    await ctx.db
      .query("tryOutRequests")
      .withIndex("by_personId", (q) => q.eq("personId", person._id))
      .take(200)
  ).filter((r) => r.status === "open")
  const assignments = (
    await ctx.db
      .query("trainingAssignments")
      .withIndex("by_personId", (q) => q.eq("personId", person._id))
      .take(500)
  ).filter((a) => a.status === "open")

  /** Where the person stands on one live Training: can it start, is it blocked, is a try-out next. */
  const stateOf = (t: PublishedTraining) => {
    const mine = attempts.filter((a) => a.trainingId === t._id)
    const passedLive = mine.find((a) => a.status === "passed" && a.trainingVersion === t.liveVersion)
    const tryOutDone = mine.some((a) => a.tryOut?.result === "passed")
    const req = requests.find((r) => r.trainingId === t._id && (r.kind ?? "tryout") === "tryout")
    let status: TodoStatus = "startable"
    if (t.needsReview) status = "blocked"
    else if (req) status = "tryout_requested"
    else if (passedLive && t.tryOutRequired && !tryOutDone) status = "waiting_tryout"
    const open = mine.find((a) => a.trainingVersion === t.liveVersion && (a.status === "in_progress" || a.status === "generating"))
    return {
      status,
      blockedReason: status === "blocked" ? BLOCKED_REASON : null,
      failStreak: failStreak(mine),
      openAttemptId: open?._id ?? null,
      passedAttemptId: passedLive?._id ?? null,
      tryOutRequest: req
        ? { _id: req._id, trainerId: req.trainerId, trainerName: req.trainerId ? nameOf.get(req.trainerId) ?? null : null, since: req.createdAt }
        : null,
    }
  }
  const dueOf = (trainingId: Id<"trainings">) => {
    const due = assignments.filter((a) => a.trainingId === trainingId).map((a) => a.dueAt)
    return due.length > 0 ? Math.min(...due) : null
  }

  const allRows = skills.map((s) => {
    const row = levels.get(s._id)
    const target = targets.get(s._id) ?? null
    const c = cellOf(row, target, now)
    const offered = trainings
      .filter((t) => covers(t, s) && !t.isPractice)
      .map((t) => ({
        _id: t._id,
        code: t.code,
        title: t.title,
        kind: t.kind,
        passed: passedTrainingIds.has(t._id),
        tryOutRequired: t.tryOutRequired,
        dueAt: dueOf(t._id),
        ...stateOf(t),
      }))
    // What gets this person further: a Training for level 1 (or to re-train
    // or renew), an Engineer's practice sign-off for levels 2 and 3.
    let nextStep: NextStep = "none"
    if (c.status === "retrain" || c.status === "expired" || (target != null && c.effectiveLevel < 1))
      nextStep = offered.length > 0 ? "training" : "signoff"
    else if (target != null && c.effectiveLevel < target) nextStep = "signoff"
    // Re-train at level 2 or 3: passing the quiz is not enough, a try-out or sign-off is.
    if (c.status === "retrain" && (row?.level ?? 0) >= 2 && offered.some((t) => t.passedAttemptId)) nextStep = "signoff"
    return {
      skill: {
        _id: s._id,
        name: s.name,
        area: s.area,
        description: s.description,
        validityMonths: s.validityMonths,
      },
      ...c,
      signedOffBy: row?.signedOffBy ? nameOf.get(row.signedOffBy) ?? null : null,
      recordId: row?.recordId ?? null,
      retrainDueAt: row?.retrainNeeded ? row.retrainDueAt ?? null : null,
      failStreak: Math.max(0, ...offered.map((t) => t.failStreak)),
      offered,
      nextStep,
    }
  })
  const skillRows = allRows.filter((r) => r.level >= 1 || (r.target ?? 0) > 0)

  const skillName = new Map(skills.map((s) => [s._id, s.name]))
  const events = (
    await ctx.db
      .query("skillEvents")
      .withIndex("by_personId", (q) => q.eq("personId", person._id))
      .take(500)
  )
    .sort((a, b) => b.at - a.at)
    .map((e) => ({
      _id: e._id,
      skillId: e.skillId,
      skillName: skillName.get(e.skillId) ?? "Removed Skill",
      fromLevel: e.fromLevel,
      toLevel: e.toLevel,
      reason: e.reason,
      by: e.byPersonId ? nameOf.get(e.byPersonId) ?? null : null,
      at: e.at,
    }))

  const profileProgress = mine.map((p) => {
    const t = p.targets.filter((x) => x.level > 0 && skillName.has(x.skillId))
    const met = t.filter((x) => meetsTarget(levels.get(x.skillId), x.level, now)).length
    return { _id: p._id, name: p.name, targets: t.length, atTarget: met }
  })

  return {
    person: {
      _id: person._id,
      name: person.name,
      role: person.role,
      kind: person.kind,
      area: person.area,
      shift: shiftOf(person),
    },
    profiles: profileProgress,
    skills: skillRows,
    allSkills: allRows,
    gaps: skillRows.filter((r) => r.status === "gap"),
    retrain: skillRows.filter((r) => r.status === "retrain"),
    expired: skillRows.filter((r) => r.status === "expired"),
    expiring: skillRows.filter((r) => r.status === "expiring"),
    events,
    // Assigned Trainings, at any level: what the person was asked to do, by when.
    assignments: (
      await Promise.all(
        assignments.map(async (a) => {
          const t = trainings.find((x) => x._id === a.trainingId)
          if (!t) return null
          return {
            _id: a._id,
            dueAt: a.dueAt,
            overdue: a.dueAt < now,
            source: a.source,
            reason: a.reason,
            training: { _id: t._id, code: t.code, title: t.title, kind: t.kind, tryOutRequired: t.tryOutRequired, ...stateOf(t) },
          }
        }),
      )
    )
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.dueAt - b.dueAt),
    records: records.map((r) => ({
      _id: r._id,
      trainingId: r.trainingId,
      trainingCode: r.trainingCode,
      trainingTitle: r.trainingTitle,
      trainingVersion: r.trainingVersion,
      attemptId: r.attemptId,
      score: r.score,
      passedAt: r.passedAt,
    })),
  }
}

/** One person: levels, history, records, gaps against their profiles, Trainings offered. */
export const personDetail = query({
  // A string, so a bad id in the URL gives "not found" instead of an error.
  args: { personId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const id = ctx.db.normalizeId("people", args.personId)
    return id ? await buildPersonDetail(ctx, id) : null
  },
})

/**
 * My learning: the person's detail plus a to-do list in the order to tackle
 * it: re-train needed, expired, gaps that need a Training, gaps that need an
 * Engineer's practice sign-off, then levels expiring soon.
 */
export const myLearning = query({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const detail = await buildPersonDetail(ctx, args.personId)
    if (!detail) return null
    type Row = (typeof detail.skills)[number]
    type Offered = Row["offered"][number]
    type Kind = "retrain" | "expired" | "train" | "signoff" | "expiring" | "assigned"
    const todo: {
      kind: Kind
      row: Row | null
      /** The Training to do next for this item, or null for a sign-off without a Training. */
      training: Offered | null
      status: TodoStatus
      blockedReason: string | null
      dueAt: number | null
      overdue: boolean
      failStreak: number
    }[] = []
    const now = Date.now()
    const pick = (row: Row): Offered | null => {
      const list = row.offered
      return (
        list.find((t) => t.status === "waiting_tryout" || t.status === "tryout_requested") ??
        list.find((t) => t.status === "startable" && !t.passed) ??
        list.find((t) => t.status === "startable") ??
        list[0] ??
        null
      )
    }
    const push = (kind: Kind, row: Row) => {
      const training = pick(row)
      let status: TodoStatus = training?.status ?? "startable"
      // A sign-off item has no Training to start unless a try-out is the way there.
      if (kind === "signoff" && status === "startable") status = "startable"
      const dueAt =
        [training?.dueAt ?? null, row.retrainDueAt ?? null].filter((x): x is number => x != null).sort((a, b) => a - b)[0] ?? null
      todo.push({
        kind,
        row,
        training: kind === "signoff" && training && status === "startable" ? null : training,
        status,
        blockedReason: status === "blocked" ? BLOCKED_REASON : null,
        dueAt,
        overdue: dueAt != null && dueAt < now,
        failStreak: training?.failStreak ?? 0,
      })
    }
    for (const row of detail.retrain) push("retrain", row)
    for (const row of detail.expired) push("expired", row)
    for (const row of detail.gaps.filter((r) => r.nextStep === "training")) push("train", row)
    for (const row of detail.gaps.filter((r) => r.nextStep === "signoff")) push("signoff", row)
    for (const row of detail.expiring) push("expiring", row)
    // Assigned Trainings not already on the list, at any level.
    for (const a of detail.assignments) {
      if (todo.some((x) => x.training?._id === a.training._id)) continue
      todo.push({
        kind: "assigned",
        row: null,
        training: {
          _id: a.training._id,
          code: a.training.code,
          title: a.training.title,
          kind: a.training.kind,
          passed: false,
          tryOutRequired: a.training.tryOutRequired,
          dueAt: a.dueAt,
          status: a.training.status,
          blockedReason: a.training.blockedReason,
          failStreak: a.training.failStreak,
          openAttemptId: a.training.openAttemptId,
          passedAttemptId: a.training.passedAttemptId,
          tryOutRequest: a.training.tryOutRequest,
        },
        status: a.training.status,
        blockedReason: a.training.blockedReason,
        dueAt: a.dueAt,
        overdue: a.overdue,
        failStreak: a.training.failStreak,
      })
    }
    // Order: what can be done now first (a blocked item is never first), by due date, then by kind.
    const rank: Record<Kind, number> = { retrain: 0, expired: 1, assigned: 2, train: 3, signoff: 4, expiring: 5 }
    todo.sort(
      (a, b) =>
        Number(a.status === "blocked") - Number(b.status === "blocked") ||
        (a.dueAt ?? Number.POSITIVE_INFINITY) - (b.dueAt ?? Number.POSITIVE_INFINITY) ||
        rank[a.kind] - rank[b.kind],
    )
    return { ...detail, todo }
  },
})

/** What a to-do item allows now. */
export type TodoStatus = "startable" | "blocked" | "waiting_tryout" | "tryout_requested"

/** Consecutive not-passed Attempts of one Training, counting back from the latest finished one. */
export function failStreak(attempts: Doc<"trainingAttempts">[]) {
  const done = attempts
    .filter((a) => a.status === "passed" || a.status === "failed")
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
  let n = 0
  for (const a of done) {
    if (a.status !== "failed") break
    n++
  }
  return n
}

/**
 * Trainings that look like they prove this Skill (their live version cites
 * one of the Skill's Documents) but are not linked. Shown as suggestions in
 * Skill setup and in the Training builder; linking is an explicit choice.
 */
export const suggestedLinks = query({
  args: { skillId: v.id("skills") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const skill = await ctx.db.get(args.skillId)
    if (!skill) return []
    const out = []
    for (const t of await publishedTrainings(ctx)) {
      if (skill.trainingIds.includes(t._id) || t.isPractice) continue
      const docs = skill.documentIds.filter((d) => t.documentIds.has(d))
      if (docs.length === 0) continue
      const codes = []
      for (const d of docs) codes.push((await ctx.db.get(d))?.namingCode ?? "?")
      out.push({ _id: t._id, code: t.code, title: t.title, kind: t.kind, sharedDocuments: codes })
    }
    return out
  },
})

/** Links (or unlinks) a Training to a Skill: the Training then proves the Skill. */
export const setTrainingLink = mutation({
  args: { skillId: v.id("skills"), trainingId: v.id("trainings"), linked: v.boolean(), engineerPersonId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineer(ctx, args.engineerPersonId)
    const skill = await ctx.db.get(args.skillId)
    if (!skill) throw new Error("This Skill no longer exists.")
    const ids = skill.trainingIds.filter((x) => x !== args.trainingId)
    await ctx.db.patch(skill._id, { trainingIds: args.linked ? [...ids, args.trainingId] : ids })
  },
})

/** One cell of the matrix, for its sheet: the level, its history and the proof behind it. */
export const cell = query({
  args: { personId: v.id("people"), skillId: v.id("skills") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const detail = await buildPersonDetail(ctx, args.personId)
    const skill = await ctx.db.get(args.skillId)
    if (!detail || !skill) return null
    const state = detail.allSkills.find((r) => r.skill._id === args.skillId)
    if (!state) return null
    const covering = new Set<Id<"trainings">>([...skill.trainingIds, ...state.offered.map((t) => t._id)])
    const documents = []
    for (const id of skill.documentIds) {
      const d = await ctx.db.get(id)
      if (d) documents.push({ _id: d._id, namingCode: d.namingCode, title: d.title, published: isPublished(d) })
    }
    return {
      person: detail.person,
      skill: state.skill,
      documents,
      state,
      events: detail.events.filter((e) => e.skillId === skill._id),
      records: detail.records.filter((r) => covering.has(r.trainingId)),
    }
  },
})

/** Home: re-train needed, expired and expiring levels across the plant. */
export const inbox = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const now = Date.now()
    const [skills, people] = await Promise.all([allSkills(ctx), allPeople(ctx)])
    const skillName = new Map(skills.map((s) => [s._id, s.name]))
    const items: {
      kind: "retrain" | "expired" | "expiring"
      personId: Id<"people">
      personName: string
      skillId: Id<"skills">
      skillName: string
      level: number
      note: string
      daysLeft: number | null
    }[] = []
    for (const person of people) {
      const levels = await levelsOf(ctx, person._id)
      for (const row of levels.values()) {
        const name = skillName.get(row.skillId)
        if (!name || row.level < 1) continue
        const status = cellStatus(row, null, now)
        const daysLeft = row.expiresAt != null ? Math.ceil((row.expiresAt - now) / DAY) : null
        const base = {
          personId: person._id,
          personName: person.name,
          skillId: row.skillId,
          skillName: name,
          level: row.level,
          daysLeft,
        }
        if (status === "retrain")
          items.push({ ...base, kind: "retrain", note: row.retrainReason ?? "A linked document changed significantly" })
        else if (status === "expired") {
          const ago = Math.max(1, -(daysLeft ?? 0))
          items.push({ ...base, kind: "expired", note: `Level ${row.level} expired ${ago} ${ago === 1 ? "day" : "days"} ago` })
        } else if (status === "expiring")
          items.push({
            ...base,
            kind: "expiring",
            note:
              daysLeft != null && daysLeft <= 0
                ? `Level ${row.level} expires today`
                : `Level ${row.level} expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`,
          })
      }
    }
    const rank = { retrain: 0, expired: 1, expiring: 2 }
    items.sort((a, b) => rank[a.kind] - rank[b.kind] || (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
    return items
  },
})

/** Settings: the catalogue of Skills and profiles, with what can be linked. */
export const catalogue = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const [skills, profiles, people] = await Promise.all([
      allSkills(ctx),
      allProfiles(ctx),
      allPeople(ctx),
    ])
    const documents = (await ctx.db.query("documents").take(1000))
      .filter((d) => d.status !== "archived")
      .map((d) => ({ _id: d._id, namingCode: d.namingCode, title: d.title, published: isPublished(d) }))
      .sort((a, b) => a.namingCode.localeCompare(b.namingCode))
    const trainings = (await ctx.db.query("trainings").take(500))
      .filter((t) => t.status !== "archived")
      .map((t) => ({
        _id: t._id,
        code: t.code,
        title: t.title,
        status: t.status,
        published: t.liveVersion != null,
      }))
      .sort((a, b) => a.code.localeCompare(b.code))
    const docById = new Map(documents.map((d) => [d._id, d]))
    const trainingById = new Map(trainings.map((t) => [t._id, t]))
    const holders = new Map<Id<"skills">, number>()
    for (const s of skills) {
      const rows = await ctx.db
        .query("skillLevels")
        .withIndex("by_skillId", (q) => q.eq("skillId", s._id))
        .take(500)
      holders.set(s._id, rows.filter((r) => r.level >= 1).length)
    }
    const skillIds = new Set(skills.map((s) => s._id))
    const labels = await areaLabels(ctx)
    for (const s of skills) if (s.area && !labels.has(s.area)) labels.set(s.area, s.area)
    return {
      areas: [...labels].map(([code, label]) => ({ code, label })),
      skills: skills.map((s) => ({
        _id: s._id,
        name: s.name,
        description: s.description,
        area: s.area,
        validityMonths: s.validityMonths,
        documentIds: s.documentIds,
        trainingIds: s.trainingIds,
        documents: s.documentIds.flatMap((id) => docById.get(id) ?? []),
        trainings: s.trainingIds.flatMap((id) => trainingById.get(id) ?? []),
        holders: holders.get(s._id) ?? 0,
      })),
      profiles: profiles.map((p) => ({
        _id: p._id,
        name: p.name,
        description: p.description,
        targets: p.targets.filter((t) => skillIds.has(t.skillId)),
        people: people
          .filter((x) => (x.profileIds ?? []).includes(p._id))
          .map((x) => ({ _id: x._id, name: x.name })),
      })),
      people: people.map((p) => ({
        _id: p._id,
        name: p.name,
        role: p.role,
        kind: p.kind,
        profileIds: p.profileIds ?? [],
      })),
      documents,
      trainings,
    }
  },
})

// ---- Level changes ------------------------------------------------------------

async function getLevelRow(ctx: MutationCtx, personId: Id<"people">, skillId: Id<"skills">) {
  return await ctx.db
    .query("skillLevels")
    .withIndex("by_personId_and_skillId", (q) => q.eq("personId", personId).eq("skillId", skillId))
    .unique()
}

/**
 * Engineer sign-off on practice: level 2 (qualified) or 3 (can train others).
 * Needs a checked-in Engineer, who is not the person themselves. Level 2
 * needs a current level of at least 1 (a passed Training); level 3 needs at
 * least 2. Renews the validity and clears "re-train needed".
 */
/** What a sign-off rests on: the document and version observed, where (Asset), and what was seen. */
const signOffEvidence = v.object({
  documentId: v.optional(v.id("documents")),
  /** The document version observed; the Published one when left out. */
  version: v.optional(v.number()),
  assetId: v.optional(v.id("assets")),
  note: v.optional(v.string()),
})

/** The skillEvents evidence for a sign-off, with the document's code and version resolved. */
async function evidenceFor(
  ctx: MutationCtx,
  e: { documentId?: Id<"documents">; version?: number; assetId?: Id<"assets"> } | undefined,
  note: string,
) {
  const doc = e?.documentId ? await ctx.db.get(e.documentId) : null
  const version = e?.version ?? (doc?.liveVersion != null ? doc.liveVersion : undefined)
  const asset = e?.assetId ? await ctx.db.get(e.assetId) : null
  return {
    ...(doc ? { documentId: doc._id, namingCode: doc.namingCode } : {}),
    ...(doc && version != null ? { documentVersion: version } : {}),
    ...(asset ? { assetId: asset._id } : {}),
    note,
  }
}

export const signOff = mutation({
  args: {
    personId: v.id("people"),
    skillId: v.id("skills"),
    level: v.union(v.literal(2), v.literal(3)),
    /** The checked-in signer: an Engineer, or for level 2 someone at level 3 on this Skill. */
    engineerPersonId: v.id("people"),
    /** Older callers: what you saw. New callers put it in evidence.note. */
    note: v.optional(v.string()),
    /** Observed doing (document and version), where (Asset) and what you saw (at least 20 characters). */
    evidence: v.optional(signOffEvidence),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const engineer = await ctx.db.get(args.engineerPersonId)
    if (!engineer) throw new Error("Check in first: a sign-off is given by a named person.")
    const person = await ctx.db.get(args.personId)
    if (!person) throw new Error("This person no longer exists.")
    if (person._id === engineer._id) throw new Error("Someone else must sign off your own Skill.")
    const skill = await ctx.db.get(args.skillId)
    if (!skill) throw new Error("This Skill no longer exists.")
    const now = Date.now()
    if (engineer.kind !== "engineer") {
      const own = await getLevelRow(ctx, engineer._id, skill._id)
      if (args.level === 3) throw new Error("Only an Engineer signs off level 3 (Can teach it).")
      if (effectiveLevel(own, now) < 3)
        throw new Error(`Only someone at level 3 in ${skill.name}, or an Engineer, can sign this off.`)
    }
    const noteText = (args.evidence?.note ?? args.note ?? "").trim()
    if (noteText.length < 20) throw new Error("Write what you saw, in at least 20 characters.")
    const row = await getLevelRow(ctx, args.personId, args.skillId)
    const current = effectiveLevel(row, now)
    // Level 1 comes from a passed Training. When no Published Training covers
    // the Skill, the Engineer's practice sign-off is the only route to 2.
    const noTraining =
      args.level === 2 && current === 0 && !(await publishedTrainings(ctx)).some((t) => covers(t, skill))
    if (current < args.level - 1 && !noTraining) {
      if (isExpired(row, now))
        throw new Error(`${person.name}'s level has expired. They need to pass a Training for ${skill.name} again first.`)
      throw new Error(
        args.level === 2
          ? `${person.name} needs level 1 first: pass a Training for ${skill.name}.`
          : `${person.name} needs level 2 (qualified) before they can be signed off to train others.`,
      )
    }
    if (row && current > args.level) throw new Error(`${person.name} already holds level ${row.level}.`)
    const note = noteText
    const expiresAt = skill.validityMonths ? addMonths(now, skill.validityMonths) : null
    const patch = {
      level: args.level,
      source: "signoff" as const,
      signedOffBy: engineer._id,
      achievedAt: now,
      expiresAt,
      retrainNeeded: false,
      retrainReason: null,
      retrainDueAt: undefined,
    }
    const evidence = await evidenceFor(ctx, args.evidence, note)
    if (row) await ctx.db.patch(row._id, patch)
    else
      await ctx.db.insert("skillLevels", {
        personId: person._id,
        skillId: skill._id,
        recordId: null,
        ...patch,
      })
    const what =
      args.level === 3
        ? "Signed off to train others"
        : current === 2
          ? "Practice confirmed"
          : "Practice signed off"
    await ctx.db.insert("skillEvents", {
      personId: person._id,
      skillId: skill._id,
      fromLevel: current,
      toLevel: args.level,
      reason: `${what} by ${engineer.name}${note ? `: ${note}` : ""}`,
      byPersonId: engineer._id,
      at: now,
      evidence,
    })
    return { level: args.level, expiresAt }
  },
})

/**
 * An Engineer confirms the person was briefed on the change without a new
 * Training: clears "re-train needed" and keeps the level.
 */
export const clearRetrain = mutation({
  args: {
    personId: v.id("people"),
    skillId: v.id("skills"),
    engineerPersonId: v.id("people"),
    /** Older callers: how the person was re-trained. New callers put it in evidence.note. */
    note: v.optional(v.string()),
    evidence: v.optional(signOffEvidence),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const engineer = await requireEngineer(ctx, args.engineerPersonId)
    if (engineer._id === args.personId) throw new Error("Another Engineer must confirm your own re-training.")
    const note = (args.evidence?.note ?? args.note ?? "").trim()
    if (!note) throw new Error("Say how the person was re-trained.")
    const row = await getLevelRow(ctx, args.personId, args.skillId)
    if (!row || !row.retrainNeeded) throw new Error("No re-training is needed here.")
    await ctx.db.patch(row._id, { retrainNeeded: false, retrainReason: null })
    await ctx.db.insert("skillEvents", {
      personId: args.personId,
      skillId: args.skillId,
      fromLevel: row.level,
      toLevel: row.level,
      reason: `Re-training confirmed by ${engineer.name}: ${note}`,
      byPersonId: engineer._id,
      at: Date.now(),
      evidence: await evidenceFor(ctx, args.evidence, note),
    })
  },
})

/**
 * A person passed a Published Training: every Skill it covers rises to at
 * least level 1, its validity renews, "re-train needed" clears, and each
 * change is logged. An expired level restarts at 1: practice needs a new
 * sign-off.
 */
export const onTrainingPassed = internalMutation({
  args: {
    personId: v.id("people"),
    trainingId: v.id("trainings"),
    recordId: v.id("trainingRecords"),
  },
  handler: async (ctx, args) => {
    const training = await ctx.db.get(args.trainingId)
    if (!training || training.liveVersion == null || training.status === "archived")
      return { updated: 0 }
    // A Training under review after a Significant change, or a pass of a
    // version that is no longer live, proves nothing about today's Knowledge.
    if (training.needsReview) return { updated: 0 }
    const record = await ctx.db.get(args.recordId)
    if (!record || record.trainingVersion !== training.liveVersion) return { updated: 0 }
    const pt = (await publishedTrainings(ctx)).find((t) => t._id === training._id)
    if (!pt) return { updated: 0 }
    const at = record.passedAt
    const now = Date.now()
    const label = `${training.code} v${record.trainingVersion}`
    let updated = 0
    for (const skill of await allSkills(ctx)) {
      if (!covers(pt, skill)) continue
      const row = await getLevelRow(ctx, args.personId, skill._id)
      const expiresAt = skill.validityMonths ? addMonths(at, skill.validityMonths) : null
      const eff = effectiveLevel(row, now)
      if (eff < 1) {
        const fields = {
          level: 1,
          source: "training" as const,
          recordId: args.recordId,
          signedOffBy: null,
          achievedAt: at,
          expiresAt,
          retrainNeeded: false,
          retrainReason: null,
        }
        if (row) await ctx.db.patch(row._id, fields)
        else await ctx.db.insert("skillLevels", { personId: args.personId, skillId: skill._id, ...fields })
        await ctx.db.insert("skillEvents", {
          personId: args.personId,
          skillId: skill._id,
          fromLevel: 0,
          toLevel: 1,
          reason:
            row && isExpired(row, now)
              ? `Passed ${label} after level ${row.level} expired. Practice needs a new sign-off.`
              : `Passed ${label}`,
          byPersonId: null,
          at,
        })
      } else if (row) {
        // A quiz pass clears "re-train needed" only at level 1. At level 2 or
        // 3 the practice must be shown again: a try-out or a sign-off.
        const keepRetrain = row.retrainNeeded && row.level >= 2
        await ctx.db.patch(row._id, {
          expiresAt: expiresAt ?? row.expiresAt,
          retrainNeeded: keepRetrain,
          retrainReason: keepRetrain ? row.retrainReason : null,
          ...(keepRetrain ? {} : { retrainDueAt: undefined }),
          ...(row.level === 1 ? { recordId: args.recordId, achievedAt: at } : {}),
        })
        await ctx.db.insert("skillEvents", {
          personId: args.personId,
          skillId: skill._id,
          fromLevel: row.level,
          toLevel: row.level,
          reason: keepRetrain
            ? `Passed ${label}. A try-out or sign-off at level ${row.level} still clears the re-train.`
            : row.retrainNeeded
              ? `Re-trained: passed ${label}`
              : expiresAt
                ? `Validity renewed: passed ${label}`
                : `Passed ${label} again`,
          byPersonId: null,
          at,
        })
      }
      updated++
    }
    return { updated }
  },
})

/**
 * Called inside the publishing transaction. On a Significant change, every
 * holder (level >= 1) of a Skill linked to this Document is flagged
 * "re-train needed", with a reason naming the Document and version.
 */
export async function skillsAfterPublish(ctx: MutationCtx, event: PublishEvent) {
  if (!event.significantChange) return { flagged: 0 }
  const doc = await ctx.db.get(event.documentId)
  if (!doc) return { flagged: 0 }
  const reason = `${doc.namingCode} v${event.version} was published with a Significant change`
  const now = Date.now()
  const dueAt = now + RETRAIN_DAYS * DAY
  let flagged = 0
  const live = new Set((await publishedTrainings(ctx)).filter((t) => !t.isPractice).map((t) => String(t._id)))
  for (const skill of await allSkills(ctx)) {
    if (!skill.documentIds.includes(event.documentId)) continue
    const rows = await ctx.db
      .query("skillLevels")
      .withIndex("by_skillId", (q) => q.eq("skillId", skill._id))
      .take(1000)
    // Holders get the Skill's Training (its new version once reviewed) as a re-train assignment.
    const training = skill.trainingIds.find((id) => live.has(String(id)))
    const holders = rows.filter((r) => r.level >= 1).map((r) => r.personId)
    if (training && holders.length > 0)
      await createAssignments(ctx, {
        trainingId: training,
        personIds: holders,
        dueAt,
        source: "retrain",
        reason,
        assignedBy: null,
      })
    for (const row of rows) {
      if (row.level < 1) continue
      await ctx.db.patch(row._id, { retrainNeeded: true, retrainReason: reason, retrainDueAt: dueAt })
      await ctx.db.insert("skillEvents", {
        personId: row.personId,
        skillId: skill._id,
        fromLevel: row.level,
        toLevel: row.level,
        reason: `Re-train needed: ${reason}`,
        byPersonId: null,
        at: now,
      })
      flagged++
    }
  }
  return { flagged }
}

// ---- Catalogue ----------------------------------------------------------------

const skillFields = {
  name: v.string(),
  description: v.string(),
  area: v.union(v.string(), v.null()),
  documentIds: v.array(v.id("documents")),
  trainingIds: v.array(v.id("trainings")),
  validityMonths: v.union(v.number(), v.null()),
}

function cleanSkill(args: {
  name: string
  description: string
  area: string | null
  documentIds: Id<"documents">[]
  trainingIds: Id<"trainings">[]
  validityMonths: number | null
}) {
  const name = args.name.trim()
  if (!name) throw new Error("Give the Skill a name.")
  const validity = args.validityMonths
  if (validity != null && (!Number.isInteger(validity) || validity < 1 || validity > 120))
    throw new Error("Validity is a whole number of months between 1 and 120, or none.")
  return {
    name,
    description: args.description.trim(),
    area: args.area?.trim() || null,
    documentIds: [...new Set(args.documentIds)],
    trainingIds: [...new Set(args.trainingIds)],
    validityMonths: validity,
  }
}

async function assertUniqueSkillName(ctx: MutationCtx, name: string, exceptId?: Id<"skills">) {
  const rows = await ctx.db.query("skills").take(500)
  if (rows.some((r) => r._id !== exceptId && r.name.toLowerCase() === name.toLowerCase()))
    throw new Error(`A Skill called "${name}" already exists.`)
}

async function assertUniqueProfileName(ctx: MutationCtx, name: string, exceptId?: Id<"skillProfiles">) {
  const rows = await ctx.db.query("skillProfiles").take(200)
  if (rows.some((r) => r._id !== exceptId && r.name.toLowerCase() === name.toLowerCase()))
    throw new Error(`A Skill profile called "${name}" already exists.`)
}

// Changing the catalogue changes what everyone is measured against: only a
// checked-in Engineer may do it (engineerPersonId, as for sign-offs).
export const createSkill = mutation({
  args: { ...skillFields, engineerPersonId: v.id("people") },
  handler: async (ctx, { engineerPersonId, ...args }) => {
    await requireUserId(ctx)
    await requireEngineer(ctx, engineerPersonId)
    const clean = cleanSkill(args)
    await assertUniqueSkillName(ctx, clean.name)
    const last = (await ctx.db.query("skills").take(500)).reduce((m, s) => Math.max(m, s.sortOrder), -1)
    return await ctx.db.insert("skills", { ...clean, sortOrder: last + 1 })
  },
})

export const updateSkill = mutation({
  args: { id: v.id("skills"), ...skillFields, engineerPersonId: v.id("people") },
  handler: async (ctx, { id, engineerPersonId, ...args }) => {
    await requireUserId(ctx)
    await requireEngineer(ctx, engineerPersonId)
    const skill = await ctx.db.get(id)
    if (!skill) throw new Error("This Skill no longer exists.")
    const clean = cleanSkill(args)
    await assertUniqueSkillName(ctx, clean.name, id)
    await ctx.db.patch(id, clean)
  },
})

/**
 * Removes a Skill, its levels and its place in profiles. Its history stays,
 * with an entry for every level removed, so the matrix change is traceable.
 */
export const removeSkill = mutation({
  args: { id: v.id("skills"), engineerPersonId: v.id("people") },
  handler: async (ctx, { id, engineerPersonId }) => {
    await requireUserId(ctx)
    const engineer = await requireEngineer(ctx, engineerPersonId)
    const skill = await ctx.db.get(id)
    if (!skill) return
    const levels = await ctx.db
      .query("skillLevels")
      .withIndex("by_skillId", (q) => q.eq("skillId", id))
      .take(1000)
    const now = Date.now()
    for (const l of levels) {
      if (l.level >= 1)
        await ctx.db.insert("skillEvents", {
          personId: l.personId,
          skillId: id,
          fromLevel: l.level,
          toLevel: 0,
          reason: `Skill "${skill.name}" removed from the catalogue by ${engineer.name}`,
          byPersonId: engineer._id,
          at: now,
        })
      await ctx.db.delete(l._id)
    }
    for (const p of await ctx.db.query("skillProfiles").take(200)) {
      if (p.targets.some((t) => t.skillId === id))
        await ctx.db.patch(p._id, { targets: p.targets.filter((t) => t.skillId !== id) })
    }
    await ctx.db.delete(id)
  },
})

const targetsValidator = v.array(v.object({ skillId: v.id("skills"), level: v.number() }))

async function cleanTargets(ctx: MutationCtx, targets: { skillId: Id<"skills">; level: number }[]) {
  const seen = new Set<string>()
  const out: { skillId: Id<"skills">; level: number }[] = []
  for (const t of targets) {
    if (seen.has(t.skillId)) continue
    if (!Number.isInteger(t.level) || t.level < 1 || t.level > 3)
      throw new Error("Target levels are 1, 2 or 3.")
    if (!(await ctx.db.get(t.skillId))) throw new Error("A target Skill no longer exists.")
    seen.add(t.skillId)
    out.push(t)
  }
  return out
}

export const createProfile = mutation({
  args: { name: v.string(), description: v.string(), targets: targetsValidator, engineerPersonId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineer(ctx, args.engineerPersonId)
    const name = args.name.trim()
    if (!name) throw new Error("Give the Skill profile a name.")
    await assertUniqueProfileName(ctx, name)
    const last = (await ctx.db.query("skillProfiles").take(200)).reduce(
      (m, p) => Math.max(m, p.sortOrder),
      -1,
    )
    return await ctx.db.insert("skillProfiles", {
      name,
      description: args.description.trim(),
      targets: await cleanTargets(ctx, args.targets),
      sortOrder: last + 1,
    })
  },
})

export const updateProfile = mutation({
  args: {
    id: v.id("skillProfiles"),
    name: v.string(),
    description: v.string(),
    targets: targetsValidator,
    engineerPersonId: v.id("people"),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineer(ctx, args.engineerPersonId)
    if (!(await ctx.db.get(args.id))) throw new Error("This Skill profile no longer exists.")
    const name = args.name.trim()
    if (!name) throw new Error("Give the Skill profile a name.")
    await assertUniqueProfileName(ctx, name, args.id)
    await ctx.db.patch(args.id, {
      name,
      description: args.description.trim(),
      targets: await cleanTargets(ctx, args.targets),
    })
  },
})

/** Removes a profile and unassigns it from everyone. Levels stay. */
export const removeProfile = mutation({
  args: { id: v.id("skillProfiles"), engineerPersonId: v.id("people") },
  handler: async (ctx, { id, engineerPersonId }) => {
    await requireUserId(ctx)
    await requireEngineer(ctx, engineerPersonId)
    for (const p of await ctx.db.query("people").take(500)) {
      if ((p.profileIds ?? []).includes(id))
        await ctx.db.patch(p._id, { profileIds: (p.profileIds ?? []).filter((x) => x !== id) })
    }
    if (await ctx.db.get(id)) await ctx.db.delete(id)
  },
})

/**
 * Re-train needed, grouped by the change that caused it: one row per source
 * Document version ("MIX-OPS-SOP-0002 v2 changed how the work is done · 2
 * people"), with the change note, the people, the Skills and the Training
 * version that is waiting for review because of it.
 */
export const retrainGroups = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const skills = await allSkills(ctx)
    const skillName = new Map(skills.map((s) => [s._id, s.name]))
    const groups = new Map<
      string,
      { namingCode: string; version: number; personIds: Set<Id<"people">>; skillIds: Set<Id<"skills">>; dueAt: number | null }
    >()
    for (const s of skills) {
      const rows = await ctx.db
        .query("skillLevels")
        .withIndex("by_skillId", (q) => q.eq("skillId", s._id))
        .take(1000)
      for (const r of rows) {
        if (!r.retrainNeeded || r.level < 1) continue
        const m = r.retrainReason?.match(/^(\S+)\s+v(\d+)/)
        const key = m ? `${m[1]}|${m[2]}` : `?|0`
        const g = groups.get(key) ?? {
          namingCode: m?.[1] ?? "A linked document",
          version: Number(m?.[2] ?? 0),
          personIds: new Set(),
          skillIds: new Set(),
          dueAt: null,
        }
        g.personIds.add(r.personId)
        g.skillIds.add(s._id)
        if (r.retrainDueAt != null) g.dueAt = g.dueAt == null ? r.retrainDueAt : Math.min(g.dueAt, r.retrainDueAt)
        groups.set(key, g)
      }
    }
    const out = []
    for (const g of groups.values()) {
      const doc = await ctx.db
        .query("documents")
        .withIndex("by_namingCode", (q) => q.eq("namingCode", g.namingCode))
        .first()
      const dv = doc
        ? await ctx.db
            .query("documentVersions")
            .withIndex("by_documentId_and_version", (q) => q.eq("documentId", doc._id).eq("version", g.version))
            .unique()
        : null
      // A Training citing this Document that waits for review or has a newer working version.
      let pendingTrainingVersion: { trainingId: Id<"trainings">; code: string; version: number; status: string; needsReview: boolean } | null = null
      if (doc) {
        for (const t of await ctx.db.query("trainings").take(500)) {
          if (t.status === "archived") continue
          const row = await ctx.db
            .query("trainingVersions")
            .withIndex("by_trainingId_and_version", (q) => q.eq("trainingId", t._id).eq("version", t.currentVersion))
            .unique()
          if (!row?.objectives.some((o) => o.documentId === doc._id)) continue
          if (t.needsReview || t.currentVersion !== t.liveVersion) {
            pendingTrainingVersion = { trainingId: t._id, code: t.code, version: t.currentVersion, status: t.status, needsReview: t.needsReview }
            break
          }
        }
      }
      const people = []
      for (const id of g.personIds) {
        const p = await ctx.db.get(id)
        if (p) people.push({ _id: p._id, name: p.name })
      }
      out.push({
        documentId: doc?._id ?? null,
        namingCode: g.namingCode,
        version: g.version,
        changeNote: dv?.changeNote ?? null,
        publishedAt: dv?.publishedAt ?? null,
        personIds: [...g.personIds],
        people,
        skills: [...g.skillIds].map((id) => ({ _id: id, name: skillName.get(id) ?? "Skill" })),
        dueAt: g.dueAt,
        pendingTrainingVersion,
      })
    }
    return out.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
  },
})
