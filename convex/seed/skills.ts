// Seed: Skills, Skill profiles and levels for Pijpwerk Noord (CONTEXT.md:
// Learn). Called by seedKnowledge after documents, people and Trainings
// exist. Finds documents by naming code, Trainings by code and people by
// name; skips whatever is missing. Running it again replaces what it made.
//
// The story it tells (shifts: early, late, night):
// - Fatima (early) and Jan (night) are fully qualified Line 2 operators. Jan
//   can train others on the changeover. Fatima's lockout/tagout expires soon.
// - Ahmed runs the late shift, but his lockout/tagout expired two months
//   ago: nobody on the late shift is qualified, and tonight only Jan.
// - Lotte, three weeks in, passed the safety round 9 days ago (level 1 on
//   every Skill it covers, Vacuum tank setup included) and failed the
//   changeover Training 4 days ago.
// - Pieter and Emma run mixing; Emma still needs her drying sign-off. The
//   drying SOP was republished with a Significant change 12 days ago, so
//   both need re-training on Granulate drying.
// - Kevin, the quality lab technician, passed his Training and was signed
//   off a fortnight later.
// - Sanne, Mark and Ingrid signed off practice and can train others.
//
// Every level is backed by its history: "Passed X" only with a Training
// record on that date (after the Training was Published), sign-offs after
// the level 1 date, and "previous training register" only for people who
// were there before Oppr Knowledge (never for a new starter). A Training
// covers a Skill only through an explicit link (skills.trainingIds), as in
// convex/skills.ts covers(). Every passed Training gives level 1 on each
// Skill that links it, as onTrainingPassed would.
import { internalMutation, MutationCtx } from "../_generated/server"
import { Doc, Id } from "../_generated/dataModel"
import { addMonths } from "../skills"

const DAY = 24 * 60 * 60 * 1000

interface SkillSeed {
  key: string
  name: string
  description: string
  area: string
  documents: string[]
  trainings: string[]
  validityMonths: number | null
}

const SKILLS: SkillSeed[] = [
  {
    key: "operate",
    name: "Operate extrusion line 2",
    description: "Start line 2 from cold, run it within the zone table and shut it down safely.",
    area: "EXT",
    documents: ["EXT-OPS-SOP-0002", "EXT-OPS-SOP-0003", "EXT-MNT-MAN-0001"],
    trainings: ["EXT-TRN-0002"],
    validityMonths: null,
  },
  {
    key: "changeover",
    name: "Colour and product changeover line 2",
    description: "Change colour or pipe size on line 2, including the die bolts and the purge.",
    area: "EXT",
    documents: ["EXT-OPS-SOP-0001"],
    trainings: ["EXT-TRN-0001"],
    validityMonths: null,
  },
  {
    key: "loto",
    name: "Lockout/tagout line 2",
    description: "Isolate line 2 before reaching into the haul-off, saw or coiler. Renewed every year.",
    area: "EXT",
    documents: ["EXT-HSE-SOP-0001"],
    trainings: ["EXT-TRN-0002"],
    validityMonths: 12,
  },
  {
    key: "mixing",
    name: "Batch mixing",
    description: "Start and run a batch on mixer MXR-101 and handle masterbatch safely.",
    area: "MIX",
    documents: ["MIX-OPS-WI-0001", "MIX-MNT-MAN-0001", "MIX-HSE-LMRA-0001"],
    trainings: ["MIX-TRN-0001"],
    validityMonths: null,
  },
  {
    key: "drying",
    name: "Granulate drying",
    description: "Dry PE granulate on DRY-102 to the right temperature, time and dew point.",
    area: "MIX",
    documents: ["MIX-OPS-SOP-0002"],
    // MIX-TRN-0001 tests the drying temperature and time.
    trainings: ["MIX-TRN-0001"],
    validityMonths: null,
  },
  {
    key: "screenpack",
    name: "Screen pack change",
    description: "Change the screen pack on EXL-201 without burns or melt leaks.",
    area: "EXT",
    documents: ["EXT-MNT-SOP-0001"],
    trainings: ["EXT-TRN-0003"],
    validityMonths: null,
  },
  {
    key: "wallthickness",
    name: "Wall thickness measurement",
    description: "Calibrate the UT-200 gauge and measure wall thickness and outside diameter.",
    area: "QCL",
    documents: ["QCL-QA-SOP-0001", "QCL-QA-MAN-0001"],
    trainings: ["QCL-TRN-0001"],
    validityMonths: null,
  },
  {
    key: "vacuum",
    name: "Vacuum tank setup",
    description: "Set up VAC-203: vacuum, water temperature and sizing sleeve.",
    area: "EXT",
    documents: ["EXT-OPS-WI-0002"],
    // The safety round tests the vacuum at VAC-203.
    trainings: ["EXT-TRN-0002"],
    validityMonths: null,
  },
  {
    key: "diehead",
    name: "Working at the hot die head",
    description: "Work safely at the hot die head and give first response to melt burns. Renewed every two years.",
    area: "EXT",
    documents: ["EXT-HSE-LMRA-0001", "EXT-HSE-SOP-0002"],
    trainings: ["EXT-TRN-0002"],
    validityMonths: 24,
  },
]

const PROFILES: { key: string; name: string; description: string; targets: [string, number][] }[] = [
  {
    key: "line2",
    name: "Line 2 operator",
    description: "Runs extrusion line 2 on a shift, including changeovers.",
    targets: [
      ["operate", 2],
      ["changeover", 2],
      ["loto", 2],
      ["vacuum", 2],
      ["diehead", 1],
      ["screenpack", 1],
    ],
  },
  {
    key: "mixing",
    name: "Mixing operator",
    description: "Prepares material in hall 1: drying and batch mixing.",
    targets: [
      ["mixing", 2],
      ["drying", 2],
    ],
  },
  {
    key: "lab",
    name: "Quality lab technician",
    description: "Measures and releases pipe in the quality lab.",
    targets: [["wallthickness", 2]],
  },
]

const ASSIGN: Record<string, string[]> = {
  "Jan de Vries": ["line2"],
  "Fatima El Amrani": ["line2"],
  "Lotte Smit": ["line2"],
  "Ahmed Yilmaz": ["line2"],
  "Pieter Bakker": ["mixing"],
  "Emma de Boer": ["mixing"],
  "Kevin Mulder": ["lab"],
}

// [person, skill, level, achieved this many days ago, signed off by]
type LevelSeed = [string, string, 1 | 2 | 3, number, string | null]
const SANNE = "Sanne Visser"
const MARK = "Mark Jansen"
const INGRID = "Ingrid Hoekstra"
const SHIFT_LEAD = "Rob Smeets"
const LEVELS: LevelSeed[] = [
  // Jan: senior night operator, trains others on the changeover.
  ["Jan de Vries", "operate", 3, 400, SANNE],
  ["Jan de Vries", "changeover", 3, 210, SANNE],
  ["Jan de Vries", "loto", 2, 150, MARK],
  ["Jan de Vries", "vacuum", 2, 380, SANNE],
  ["Jan de Vries", "diehead", 2, 300, MARK],
  ["Jan de Vries", "screenpack", 2, 260, MARK],
  // Fatima: fully qualified day operator; lockout/tagout runs out in 18 days.
  ["Fatima El Amrani", "operate", 2, 330, SANNE],
  ["Fatima El Amrani", "changeover", 2, 100, SANNE],
  ["Fatima El Amrani", "loto", 2, 347, MARK],
  ["Fatima El Amrani", "vacuum", 2, 320, SANNE],
  ["Fatima El Amrani", "diehead", 1, 200, null],
  ["Fatima El Amrani", "screenpack", 1, 180, null],
  // Ahmed: late shift operator whose lockout/tagout expired (14 months, valid 12).
  ["Ahmed Yilmaz", "operate", 2, 500, SANNE],
  ["Ahmed Yilmaz", "changeover", 2, 450, SANNE],
  ["Ahmed Yilmaz", "loto", 2, 426, MARK],
  ["Ahmed Yilmaz", "vacuum", 2, 470, SANNE],
  ["Ahmed Yilmaz", "diehead", 1, 400, null],
  ["Ahmed Yilmaz", "screenpack", 1, 350, null],
  // Lotte: three weeks in, passed the safety round, nothing signed off yet.
  ["Lotte Smit", "operate", 1, 9, null],
  ["Lotte Smit", "loto", 1, 9, null],
  ["Lotte Smit", "diehead", 1, 9, null],
  // Mixing.
  ["Pieter Bakker", "mixing", 3, 600, SANNE],
  ["Pieter Bakker", "drying", 2, 580, SANNE],
  ["Emma de Boer", "mixing", 2, 120, SANNE],
  ["Emma de Boer", "drying", 1, 400, null],
  // Quality lab.
  ["Kevin Mulder", "wallthickness", 2, 30, INGRID],
  // Engineers who sign off and train others.
  ["Sanne Visser", "operate", 3, 900, MARK],
  ["Sanne Visser", "changeover", 3, 900, MARK],
  ["Sanne Visser", "vacuum", 3, 900, MARK],
  ["Sanne Visser", "mixing", 3, 900, MARK],
  ["Mark Jansen", "loto", 3, 100, SANNE],
  ["Mark Jansen", "screenpack", 3, 700, SANNE],
  ["Mark Jansen", "diehead", 3, 500, SANNE],
  ["Ingrid Hoekstra", "wallthickness", 3, 800, SANNE],
]

async function clear(ctx: MutationCtx) {
  for (const table of ["skillEvents", "skillLevels", "skillProfiles", "skills"] as const) {
    for (;;) {
      const rows = await ctx.db.query(table).take(500)
      if (rows.length === 0) break
      for (const r of rows) await ctx.db.delete(r._id)
    }
  }
  for (const p of await ctx.db.query("people").take(500))
    if ((p.profileIds ?? []).length > 0) await ctx.db.patch(p._id, { profileIds: [] })
}

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    await clear(ctx)
    const now = Date.now()

    // ---- Published Trainings and the Documents their live version cites ----
    const published: { _id: Id<"trainings">; liveVersion: number; needsReview: boolean; documentIds: Set<Id<"documents">> }[] = []
    for (const t of await ctx.db.query("trainings").take(500)) {
      if (t.liveVersion == null || t.status === "archived") continue
      const ver = await ctx.db
        .query("trainingVersions")
        .withIndex("by_trainingId_and_version", (q) => q.eq("trainingId", t._id).eq("version", t.liveVersion as number))
        .unique()
      published.push({
        _id: t._id,
        liveVersion: t.liveVersion,
        needsReview: t.needsReview,
        documentIds: new Set((ver?.objectives ?? []).map((o) => o.documentId)),
      })
    }
    // Same rule as covers() in convex/skills.ts: explicit links only.
    const covering = (trainingIds: Id<"trainings">[], _documentIds: Id<"documents">[]) =>
      published.filter((t) => trainingIds.includes(t._id)).map((t) => t._id)

    // ---- Skills ----
    const skillIds = new Map<string, Id<"skills">>()
    const skillTrainings = new Map<string, Id<"trainings">[]>()
    const validity = new Map<string, number | null>()
    let missingLinks = 0
    for (const [i, s] of SKILLS.entries()) {
      const documentIds: Id<"documents">[] = []
      for (const code of s.documents) {
        const doc = await ctx.db
          .query("documents")
          .withIndex("by_namingCode", (q) => q.eq("namingCode", code))
          .first()
        if (doc) documentIds.push(doc._id)
        else missingLinks++
      }
      const trainingIds: Id<"trainings">[] = []
      for (const code of s.trainings) {
        const t = await ctx.db
          .query("trainings")
          .withIndex("by_code", (q) => q.eq("code", code))
          .first()
        if (t) trainingIds.push(t._id)
        else missingLinks++
      }
      const id = await ctx.db.insert("skills", {
        name: s.name,
        description: s.description,
        area: s.area,
        documentIds,
        trainingIds,
        validityMonths: s.validityMonths,
        sortOrder: i,
      })
      skillIds.set(s.key, id)
      skillTrainings.set(s.key, covering(trainingIds, documentIds))
      validity.set(s.key, s.validityMonths)
    }

    // ---- Profiles ----
    const profileIds = new Map<string, Id<"skillProfiles">>()
    for (const [i, p] of PROFILES.entries()) {
      const id = await ctx.db.insert("skillProfiles", {
        name: p.name,
        description: p.description,
        targets: p.targets.flatMap(([key, level]) => {
          const skillId = skillIds.get(key)
          return skillId ? [{ skillId, level }] : []
        }),
        sortOrder: i,
      })
      profileIds.set(p.key, id)
    }

    // ---- Trainings: the Skills each proves and who must do it ----
    // The builder's "People" tab: every version of a seeded Training names
    // the Skills that link it and the Skill profiles that need those Skills.
    let trainingsLinked = 0
    for (const t of await ctx.db.query("trainings").take(500)) {
      const proves = SKILLS.filter((x) => x.trainings.includes(t.code)).flatMap((x) => skillIds.get(x.key) ?? [])
      if (proves.length === 0) continue
      const needKeys = new Set(SKILLS.filter((x) => x.trainings.includes(t.code)).map((x) => x.key))
      const audienceProfiles = PROFILES.filter((p) => p.targets.some(([key]) => needKeys.has(key))).flatMap(
        (p) => profileIds.get(p.key) ?? [],
      )
      for (const row of await ctx.db
        .query("trainingVersions")
        .withIndex("by_trainingId_and_version", (q) => q.eq("trainingId", t._id))
        .collect()) {
        await ctx.db.patch(row._id, {
          skillIds: proves,
          audience: { profileIds: audienceProfiles, personIds: [], dueDays: 14 },
        })
      }
      trainingsLinked++
    }

    // ---- People ----
    const people = await ctx.db.query("people").take(500)
    const byName = new Map(people.map((p) => [p.name, p]))
    let assigned = 0
    for (const [name, keys] of Object.entries(ASSIGN)) {
      const person = byName.get(name)
      if (!person) continue
      await ctx.db.patch(person._id, {
        profileIds: keys.flatMap((k) => profileIds.get(k) ?? []),
      })
      assigned++
    }

    // ---- Levels, with the history and the proof behind them ----
    const recordsOf = new Map<Id<"people">, Doc<"trainingRecords">[]>()
    async function records(personId: Id<"people">) {
      if (!recordsOf.has(personId))
        recordsOf.set(
          personId,
          await ctx.db
            .query("trainingRecords")
            .withIndex("by_personId", (q) => q.eq("personId", personId))
            .take(200),
        )
      return recordsOf.get(personId)!
    }

    // Significant changes already Published on a Skill's linked Documents:
    // holders whose level predates one need re-training (as publishing does).
    const significant = new Map<Id<"skills">, { at: number; reason: string }>()
    for (const s of SKILLS) {
      const skillId = skillIds.get(s.key)
      if (!skillId) continue
      for (const code of s.documents) {
        const doc = await ctx.db
          .query("documents")
          .withIndex("by_namingCode", (q) => q.eq("namingCode", code))
          .first()
        if (!doc?.liveVersion) continue
        const live = doc.liveVersion
        const dv = await ctx.db
          .query("documentVersions")
          .withIndex("by_documentId_and_version", (q) => q.eq("documentId", doc._id).eq("version", live))
          .unique()
        if (!dv?.significantChange) continue
        const prev = significant.get(skillId)
        if (!prev || dv.publishedAt > prev.at)
          significant.set(skillId, {
            at: dv.publishedAt,
            reason: `${code} v${live} was published with a Significant change`,
          })
      }
    }

    // When each linked Training went live: a pass is only proof after that.
    const publishedAtOf = new Map<string, number>()
    async function trainingPublishedAt(r: Doc<"trainingRecords">) {
      const k = `${r.trainingId}|${r.trainingVersion}`
      if (!publishedAtOf.has(k)) {
        const row = await ctx.db
          .query("trainingVersions")
          .withIndex("by_trainingId_and_version", (q) =>
            q.eq("trainingId", r.trainingId).eq("version", r.trainingVersion),
          )
          .unique()
        publishedAtOf.set(k, row?.publishedAt ?? Number.POSITIVE_INFINITY)
      }
      return publishedAtOf.get(k)!
    }

    // Level 1 for every Skill a passed Training covers that the story above
    // does not set: the pass is the proof (e.g. Lotte's Vacuum tank setup
    // from the safety round, which cites EXT-OPS-WI-0002).
    const seeded = new Set(LEVELS.map(([name, key]) => `${name}|${key}`))
    const derived: LevelSeed[] = []
    for (const person of people) {
      for (const s of SKILLS) {
        if (seeded.has(`${person.name}|${s.key}`)) continue
        const linked = skillTrainings.get(s.key) ?? []
        let first: number | null = null
        for (const r of await records(person._id)) {
          const t = published.find((x) => x._id === r.trainingId)
          if (!t || !linked.includes(t._id) || t.needsReview || r.trainingVersion !== t.liveVersion) continue
          if (r.passedAt < (await trainingPublishedAt(r))) continue
          first = first == null ? r.passedAt : Math.min(first, r.passedAt)
        }
        if (first != null) derived.push([person.name, s.key, 1, Math.max(0, (now - first) / DAY), null])
      }
    }

    let levels = 0
    let fromRecords = 0
    let events = 0
    let retrain = 0
    const skippedLevels: string[] = []
    for (const [name, key, level, daysAgo, signerName] of [...LEVELS, ...derived]) {
      const person = byName.get(name)
      const skillId = skillIds.get(key)
      if (!person || !skillId) continue
      const signer = signerName ? byName.get(signerName) ?? null : null
      const newStarter = /new starter/i.test(person.role)

      // Passes of the Trainings linked to this Skill, oldest first, each one
      // after its Training version was Published.
      const linked = skillTrainings.get(key) ?? []
      const passes: Doc<"trainingRecords">[] = []
      for (const r of (await records(person._id)).filter((x) => linked.includes(x.trainingId)))
        if (r.passedAt >= (await trainingPublishedAt(r))) passes.push(r)
      passes.sort((a, b) => a.passedAt - b.passedAt)

      // Level 1 (trained): the first pass, or for level 2+ the first pass
      // before the sign-off. Without one: the previous training register,
      // which a new starter does not have.
      const signedAt = now - daysAgo * DAY
      const at3 = level === 3 ? signedAt : null
      const at2Wanted = level === 3 ? signedAt - 120 * DAY : level === 2 ? signedAt : null
      const firstPass = level === 1 ? passes[0] ?? null : passes.find((r) => at2Wanted != null && r.passedAt < at2Wanted - DAY) ?? null
      if (!firstPass && newStarter) {
        skippedLevels.push(`${name} ${key}: a new starter needs a Training record`)
        continue
      }
      const trainedAt = firstPass
        ? firstPass.passedAt
        : level === 1
          ? signedAt
          : (at2Wanted as number) - 45 * DAY
      const at2 = at2Wanted != null ? Math.max(at2Wanted, trainedAt + DAY) : null
      const achievedAt = at3 ?? at2 ?? trainedAt
      if (firstPass) fromRecords++

      // Later passes renew the validity (or are passed again), as onTrainingPassed does.
      const later = passes.filter((r) => r.passedAt > trainedAt)
      const latestPass = passes.length > 0 ? passes[passes.length - 1] : null
      const months = validity.get(key) ?? null
      const validFrom = Math.max(achievedAt, latestPass?.passedAt ?? 0)
      const signedOff = level >= 2 && signer
      const change = significant.get(skillId)
      const needsRetrain = !!change && change.at > validFrom
      await ctx.db.insert("skillLevels", {
        personId: person._id,
        skillId,
        level,
        source: signedOff ? "signoff" : level === 1 && firstPass ? "training" : "seed",
        recordId: latestPass?._id ?? null,
        signedOffBy: signedOff ? signer._id : null,
        achievedAt,
        expiresAt: months ? addMonths(validFrom, months) : null,
        retrainNeeded: needsRetrain,
        retrainReason: needsRetrain ? change.reason : null,
      })
      levels++

      // History: trained first, then each sign-off, then later passes.
      const history: { from: number; to: number; reason: string; by: Id<"people"> | null; at: number }[] = []
      history.push({
        from: 0,
        to: 1,
        reason: firstPass
          ? `Passed ${firstPass.trainingCode} v${firstPass.trainingVersion}`
          : "Trained before Oppr Knowledge (from the previous training register)",
        by: null,
        at: trainedAt,
      })
      if (at2 != null)
        history.push({
          from: 1,
          to: 2,
          reason: signer ? `Practice signed off by ${signer.name}` : "Practice signed off (previous register)",
          by: signer?._id ?? null,
          at: at2,
        })
      if (at3 != null)
        history.push({
          from: 2,
          to: 3,
          reason: signer
            ? `Signed off to train others by ${signer.name}`
            : "Signed off to train others (previous register)",
          by: signer?._id ?? null,
          at: at3,
        })
      for (const r of later) {
        const lvl = [...history].filter((h) => h.at <= r.passedAt).pop()?.to ?? 1
        const label = `${r.trainingCode} v${r.trainingVersion}`
        history.push({
          from: lvl,
          to: lvl,
          reason: months ? `Validity renewed: passed ${label}` : `Passed ${label} again`,
          by: null,
          at: r.passedAt,
        })
      }
      if (needsRetrain)
        history.push({ from: level, to: level, reason: `Re-train needed: ${change.reason}`, by: null, at: change.at })
      if (needsRetrain) retrain++
      for (const h of history) {
        await ctx.db.insert("skillEvents", {
          personId: person._id,
          skillId,
          fromLevel: h.from,
          toLevel: h.to,
          reason: h.reason,
          byPersonId: h.by,
          at: h.at,
        })
        events++
      }
    }

    // ---- Shifts, the shift lead, and the TWI follow-up demo rows ----
    const shiftByName: Record<string, "early" | "late" | "night" | "day"> = {
      "Jan de Vries": "night",
      "Fatima El Amrani": "early",
      "Lotte Smit": "early",
      "Ahmed Yilmaz": "late",
      "Pieter Bakker": "early",
      "Emma de Boer": "late",
      "Kevin Mulder": "early",
    }
    for (const p of people) {
      const shift = shiftByName[p.name] ?? (p.kind === "engineer" ? "day" : undefined)
      if (shift) await ctx.db.patch(p._id, { shift, team: p.area ? `${p.area} ${shift}` : undefined })
    }
    let shiftLead = byName.get(SHIFT_LEAD)
    if (!shiftLead) {
      const last = people.reduce((m, p) => Math.max(m, p.sortOrder), 0)
      const id = await ctx.db.insert("people", {
        name: SHIFT_LEAD,
        kind: "engineer",
        role: "Shift lead, late shift",
        area: "EXT",
        sortOrder: last + 1,
        shift: "late",
        team: "EXT late",
      })
      shiftLead = (await ctx.db.get(id)) ?? undefined
    }

    const trainingByCode = async (code: string) =>
      await ctx.db
        .query("trainings")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first()
    const sanne = byName.get(SANNE)
    const lotte = byName.get("Lotte Smit")
    const ahmed = byName.get("Ahmed Yilmaz")
    let requests = 0
    let assignments = 0
    for (const r of await ctx.db.query("tryOutRequests").take(2000)) await ctx.db.delete(r._id)
    const lastAttempt = async (personId: Id<"people">, trainingId: Id<"trainings">, status: "passed" | "failed") =>
      (
        await ctx.db
          .query("trainingAttempts")
          .withIndex("by_personId", (q) => q.eq("personId", personId))
          .take(200)
      )
        .filter((a) => a.trainingId === trainingId && a.status === status)
        .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))[0] ?? null
    const linkedSkills = async (trainingId: Id<"trainings">) =>
      (await ctx.db.query("skills").take(500)).filter((x) => x.trainingIds.includes(trainingId)).map((x) => x._id)
    // Lotte passed the safety round 9 days ago and asked Sanne for the try-out 2 days ago.
    const round = await trainingByCode("EXT-TRN-0002")
    if (round && lotte && sanne && round.liveVersion != null) {
      const a = await lastAttempt(lotte._id, round._id, "passed")
      if (a) {
        await ctx.db.insert("tryOutRequests", {
          personId: lotte._id,
          trainingId: round._id,
          trainingVersion: round.liveVersion,
          attemptId: a._id,
          skillIds: await linkedSkills(round._id),
          trainerId: sanne._id,
          status: "open",
          createdAt: now - 2 * DAY,
          doneAt: null,
          kind: "tryout",
        })
        requests++
      }
    }
    // Lotte did not pass the changeover Training twice: a walk-through is asked for.
    const changeover = await trainingByCode("EXT-TRN-0001")
    if (changeover && lotte && changeover.liveVersion != null) {
      const a = await lastAttempt(lotte._id, changeover._id, "failed")
      if (a) {
        await ctx.db.insert("tryOutRequests", {
          personId: lotte._id,
          trainingId: changeover._id,
          trainingVersion: changeover.liveVersion,
          attemptId: a._id,
          skillIds: await linkedSkills(changeover._id),
          trainerId: null,
          status: "open",
          createdAt: a.finishedAt ?? now - 4 * DAY,
          doneAt: null,
          kind: "walkthrough",
        })
        requests++
      }
      // ... and Sanne assigned it to her, due in 5 days.
      await ctx.db.insert("trainingAssignments", {
        trainingId: changeover._id,
        personId: lotte._id,
        dueAt: now + 5 * DAY,
        assignedBy: sanne?._id ?? null,
        reason: "New starter on line 2",
        source: "manual",
        status: "open",
        createdAt: now - 10 * DAY,
        doneAt: null,
      })
      assignments++
    }
    // Ahmed's lockout/tagout expired: the safety round is assigned again.
    if (round && ahmed) {
      await ctx.db.insert("trainingAssignments", {
        trainingId: round._id,
        personId: ahmed._id,
        dueAt: now + 3 * DAY,
        assignedBy: null,
        reason: "Lockout/tagout line 2 expired",
        source: "renew",
        status: "open",
        createdAt: now - 25 * DAY,
        doneAt: null,
      })
      assignments++
    }

    return {
      shiftLead: shiftLead?.name ?? null,
      trainingsLinked,
      tryOutRequests: requests,
      assignments,
      skills: skillIds.size,
      profiles: profileIds.size,
      peopleAssigned: assigned,
      levels,
      levelsFromRecords: fromRecords,
      derivedFromRecords: derived.map(([name, key]) => `${name} ${key}`),
      events,
      retrainNeeded: retrain,
      skippedLevels,
      missingLinks,
    }
  },
})
