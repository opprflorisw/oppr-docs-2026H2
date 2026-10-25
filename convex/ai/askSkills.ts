import { internalQuery, type QueryCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { cellStatus, effectiveLevel } from "../skills"
import { loadShifts, shiftKeyOf } from "../people/shifts"

// Ask on the Skills pages: the Skill matrix as plain text, so "who can run
// line 2 tonight?" is answered from who holds which Skill now. Background for
// the answer, never a cited source; steps and settings still come from
// Published documents only.

const LEVEL_NAMES = ["not trained", "trained", "qualified", "can train others"]

function levelName(n: number) {
  return LEVEL_NAMES[n] ?? `level ${n}`
}

async function skillMatrixText(ctx: QueryCtx): Promise<string> {
  const now = Date.now()
  const [skillsAll, profiles, peopleAll, shifts] = await Promise.all([
    ctx.db.query("skills").take(500),
    ctx.db.query("skillProfiles").take(200),
    ctx.db.query("people").take(500),
    loadShifts(ctx),
  ])
  const skills = skillsAll.filter((s) => !s.archived).sort((a, b) => a.sortOrder - b.sortOrder)
  const skillById = new Map(skills.map((s) => [s._id, s]))
  const people = peopleAll.filter((p) => !p.archived).sort((a, b) => a.sortOrder - b.sortOrder)
  const profileById = new Map(profiles.map((p) => [p._id, p]))

  const lines: string[] = []
  lines.push(
    `Levels: 0 ${levelName(0)}, 1 ${levelName(1)}, 2 ${levelName(2)}, 3 ${levelName(3)}. An expired level or "re-train needed" does not count.`,
  )
  lines.push(
    `Shifts: ${shifts
      .filter((s) => s.active)
      .map((s) => `${s.name} (${s.key}, ${s.start} to ${s.end})`)
      .join("; ")}`,
  )
  lines.push("", "Skill profiles (what a role needs):")
  for (const p of profiles.sort((a, b) => a.sortOrder - b.sortOrder)) {
    const targets = p.targets
      .map((t) => {
        const s = skillById.get(t.skillId)
        return s ? `${s.name} at ${t.level}` : null
      })
      .filter(Boolean)
    lines.push(`- ${p.name}: ${targets.length ? targets.join(", ") : "no Skills yet"}`)
  }

  lines.push("", "People (shift; profiles; Skills held, with gaps against their profile):")
  for (const person of people) {
    const rows: Doc<"skillLevels">[] = await ctx.db
      .query("skillLevels")
      .withIndex("by_personId", (q) => q.eq("personId", person._id))
      .take(500)
    const levels = new Map<Id<"skills">, Doc<"skillLevels">>(rows.map((r) => [r.skillId, r]))
    const mine = (person.profileIds ?? []).map((id) => profileById.get(id)).filter((p): p is Doc<"skillProfiles"> => !!p)
    const targets = new Map<Id<"skills">, number>()
    for (const p of mine) for (const t of p.targets) targets.set(t.skillId, Math.max(targets.get(t.skillId) ?? 0, t.level))

    const held: string[] = []
    const gaps: string[] = []
    for (const s of skills) {
      const row = levels.get(s._id)
      const target = targets.get(s._id) ?? null
      const status = cellStatus(row, target, now)
      const eff = effectiveLevel(row, now)
      if (row && row.level >= 1) {
        const note =
          status === "expired" ? " (expired)" : status === "retrain" ? " (re-train needed)" : status === "expiring" ? " (expiring soon)" : ""
        held.push(`${s.name} ${row.level}${note}`)
      }
      if (target != null && target > 0) {
        if (status === "retrain") gaps.push(`${s.name} (re-train needed)`)
        else if (status === "expired") gaps.push(`${s.name} (expired, needs ${target})`)
        else if (status === "gap") gaps.push(`${s.name} ${eff} of ${target}`)
      }
    }
    const shift = shiftKeyOf(person)
    const showShift = shift && !person.role.toLowerCase().includes(shift.toLowerCase())
    lines.push(
      `- ${person.name} (${person.role}${showShift ? `; ${shift} shift` : ""}${person.area ? `; area ${person.area}` : ""}; profiles: ${
        mine.map((p) => p.name).join(", ") || "none"
      }). Holds: ${held.join(", ") || "nothing yet"}. ${gaps.length ? `Below target: ${gaps.join(", ")}.` : mine.length ? "Meets every target." : ""}`.trim(),
    )
  }
  return lines.join("\n")
}

export const skillMatrixBrief = internalQuery({
  args: {},
  handler: async (ctx) => skillMatrixText(ctx),
})
