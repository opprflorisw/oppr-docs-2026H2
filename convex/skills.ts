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

const DAY = 24 * 60 * 60 * 1000
/** A level that expires within this many days shows as "expiring". */
export const EXPIRING_WINDOW_DAYS = 30

export type CellStatus = "ok" | "gap" | "expired" | "expiring" | "retrain" | "none"

export function addMonths(at: number, months: number): number {
  const d = new Date(at)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.getTime()
}

/** Shift, derived from the person's role text ("Line operator, night shift"). */
export function shiftOf(person: Doc<"people">): string | null {
  if (/night/i.test(person.role)) return "Night shift"
  if (/\bday\b/i.test(person.role)) return "Day shift"
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
    })
  }
  return out.sort((a, b) => a.code.localeCompare(b.code))
}

/** A Published Training covers a Skill when the Skill links it, or when its objectives come from a linked Document. */
function covers(t: PublishedTraining, skill: Doc<"skills">): boolean {
  if (skill.trainingIds.includes(t._id)) return true
  return skill.documentIds.some((d) => t.documentIds.has(d))
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
      const cells: Record<string, Cell> = {}
      let relevant = false
      const summary = { targets: 0, atTarget: 0, gaps: 0, expired: 0, expiring: 0, retrain: 0 }
      for (const s of columns) {
        const target = targets.get(s._id) ?? null
        const row = levels.get(s._id)
        const c = cellOf(row, target, now)
        cells[s._id] = c
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
      shift: string | null
      expiringSoon: string[]
    }[] = []
    const almost: {
      _id: Id<"people">
      name: string
      role: string
      shift: string | null
      missing: { skillName: string; reason: string }[]
    }[] = []
    if (requirements.length > 0) {
      for (const person of people) {
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

    const shiftNames = [...new Set(people.map(shiftOf).filter((s): s is string => !!s))].sort()
    const groups: { shift: string | null; people: typeof qualified }[] = shiftNames.map((shift) => ({
      shift,
      people: qualified.filter((p) => p.shift === shift),
    }))
    const noShift = qualified.filter((p) => p.shift === null)
    if (noShift.length > 0) groups.push({ shift: null, people: noShift })
    return {
      profile: profile ? { _id: profile._id, name: profile.name } : null,
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

  const allRows = skills.map((s) => {
    const row = levels.get(s._id)
    const target = targets.get(s._id) ?? null
    const c = cellOf(row, target, now)
    const offered = trainings
      .filter((t) => covers(t, s))
      .map((t) => ({
        _id: t._id,
        code: t.code,
        title: t.title,
        kind: t.kind,
        passed: passedTrainingIds.has(t._id),
      }))
    // What gets this person further: a Training for level 1 (or to re-train
    // or renew), an Engineer's practice sign-off for levels 2 and 3.
    let nextStep: NextStep = "none"
    if (c.status === "retrain" || c.status === "expired" || (target != null && c.effectiveLevel < 1))
      nextStep = offered.length > 0 ? "training" : "signoff"
    else if (target != null && c.effectiveLevel < target) nextStep = "signoff"
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
    const todo: { kind: "retrain" | "expired" | "train" | "signoff" | "expiring"; row: Row }[] = []
    for (const row of detail.retrain) todo.push({ kind: "retrain", row })
    for (const row of detail.expired) todo.push({ kind: "expired", row })
    for (const row of detail.gaps.filter((r) => r.nextStep === "training")) todo.push({ kind: "train", row })
    for (const row of detail.gaps.filter((r) => r.nextStep === "signoff")) todo.push({ kind: "signoff", row })
    for (const row of detail.expiring) todo.push({ kind: "expiring", row })
    return { ...detail, todo }
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
export const signOff = mutation({
  args: {
    personId: v.id("people"),
    skillId: v.id("skills"),
    level: v.union(v.literal(2), v.literal(3)),
    engineerPersonId: v.id("people"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const engineer = await requireEngineer(ctx, args.engineerPersonId)
    const person = await ctx.db.get(args.personId)
    if (!person) throw new Error("This person no longer exists.")
    if (person._id === engineer._id) throw new Error("Another Engineer must sign off your own Skill.")
    const skill = await ctx.db.get(args.skillId)
    if (!skill) throw new Error("This Skill no longer exists.")
    const now = Date.now()
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
    const note = args.note?.trim()
    const expiresAt = skill.validityMonths ? addMonths(now, skill.validityMonths) : null
    const patch = {
      level: args.level,
      source: "signoff" as const,
      signedOffBy: engineer._id,
      achievedAt: now,
      expiresAt,
      retrainNeeded: false,
      retrainReason: null,
    }
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
    note: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const engineer = await requireEngineer(ctx, args.engineerPersonId)
    if (engineer._id === args.personId) throw new Error("Another Engineer must confirm your own re-training.")
    const note = args.note.trim()
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
    const pt = (await publishedTrainings(ctx)).find((t) => t._id === training._id)
    if (!pt) return { updated: 0 }
    const record = await ctx.db.get(args.recordId)
    const at = record?.passedAt ?? Date.now()
    const now = Date.now()
    const label = `${training.code} v${record?.trainingVersion ?? pt.liveVersion}`
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
        await ctx.db.patch(row._id, {
          expiresAt: expiresAt ?? row.expiresAt,
          retrainNeeded: false,
          retrainReason: null,
          ...(row.level === 1 ? { recordId: args.recordId, achievedAt: at } : {}),
        })
        await ctx.db.insert("skillEvents", {
          personId: args.personId,
          skillId: skill._id,
          fromLevel: row.level,
          toLevel: row.level,
          reason: row.retrainNeeded
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
  let flagged = 0
  for (const skill of await allSkills(ctx)) {
    if (!skill.documentIds.includes(event.documentId)) continue
    const rows = await ctx.db
      .query("skillLevels")
      .withIndex("by_skillId", (q) => q.eq("skillId", skill._id))
      .take(1000)
    for (const row of rows) {
      if (row.level < 1) continue
      await ctx.db.patch(row._id, { retrainNeeded: true, retrainReason: reason })
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

export const createSkill = mutation({
  args: skillFields,
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const clean = cleanSkill(args)
    await assertUniqueSkillName(ctx, clean.name)
    const last = (await ctx.db.query("skills").take(500)).reduce((m, s) => Math.max(m, s.sortOrder), -1)
    return await ctx.db.insert("skills", { ...clean, sortOrder: last + 1 })
  },
})

export const updateSkill = mutation({
  args: { id: v.id("skills"), ...skillFields },
  handler: async (ctx, { id, ...args }) => {
    await requireUserId(ctx)
    const skill = await ctx.db.get(id)
    if (!skill) throw new Error("This Skill no longer exists.")
    const clean = cleanSkill(args)
    await assertUniqueSkillName(ctx, clean.name, id)
    await ctx.db.patch(id, clean)
  },
})

/** Removes a Skill, its levels and its place in profiles. Its history stays. */
export const removeSkill = mutation({
  args: { id: v.id("skills") },
  handler: async (ctx, { id }) => {
    await requireUserId(ctx)
    const skill = await ctx.db.get(id)
    if (!skill) return
    const levels = await ctx.db
      .query("skillLevels")
      .withIndex("by_skillId", (q) => q.eq("skillId", id))
      .take(1000)
    for (const l of levels) await ctx.db.delete(l._id)
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
  args: { name: v.string(), description: v.string(), targets: targetsValidator },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
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
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
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
  args: { id: v.id("skillProfiles") },
  handler: async (ctx, { id }) => {
    await requireUserId(ctx)
    for (const p of await ctx.db.query("people").take(500)) {
      if ((p.profileIds ?? []).includes(id))
        await ctx.db.patch(p._id, { profileIds: (p.profileIds ?? []).filter((x) => x !== id) })
    }
    if (await ctx.db.get(id)) await ctx.db.delete(id)
  },
})
