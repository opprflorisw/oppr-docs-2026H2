import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

// Wikis are regenerated on a schedule as well as on every relevant publish, so
// they stay correct even if a publish-time run failed.
crons.daily(
  "regenerate wikis",
  { hourUTC: 3, minuteUTC: 0 },
  internal.wikis.regenerateAll,
  {},
)

// CONTEXT.md: the Consistency check runs on every publish and once a week
// across everything.
crons.weekly(
  "consistency check",
  { dayOfWeek: "sunday", hourUTC: 2, minuteUTC: 0 },
  internal.ai.consistency.runAll,
  { trigger: "weekly" },
)

export default crons
