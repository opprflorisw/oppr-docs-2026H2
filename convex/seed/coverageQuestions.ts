// Seed module: Coverage questions such as "Who can run line 2 tonight?".
// Called by seedKnowledge after people, assets, documents, Trainings and
// Skills exist. Finds Skill profiles by name and skips a question whose
// profile is missing. Running it again replaces what it made.
//
// With the seeded levels the answers tell a story: nobody on the late shift
// is fully qualified for line 2 (Ahmed's lockout/tagout expired), so the
// Home shift cover shows a red 0 for Late.
import { internalMutation } from "../_generated/server"

const QUESTIONS: { label: string; profile: string; shift: "early" | "late" | "night" | null; showOnHome: boolean }[] = [
  { label: "Who can run line 2 tonight?", profile: "Line 2 operator", shift: "night", showOnHome: true },
  { label: "Who can run the mixer on the early shift?", profile: "Mixing operator", shift: "early", showOnHome: true },
  { label: "Who can do QC measuring on the late shift?", profile: "Quality lab technician", shift: "late", showOnHome: false },
]

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const row of await ctx.db.query("coverageQuestions").take(200)) await ctx.db.delete(row._id)
    const profiles = await ctx.db.query("skillProfiles").take(200)
    const sanne = (await ctx.db.query("people").take(200)).find((p) => p.name === "Sanne Visser")
    let made = 0
    const skipped: string[] = []
    for (const q of QUESTIONS) {
      const profile = profiles.find((p) => p.name === q.profile)
      if (!profile) {
        skipped.push(q.label)
        continue
      }
      await ctx.db.insert("coverageQuestions", {
        label: q.label,
        profileId: profile._id,
        shift: q.shift ?? undefined,
        order: made,
        showOnHome: q.showOnHome,
        createdBy: sanne?._id,
      })
      made++
    }
    return { questions: made, skipped }
  },
})
