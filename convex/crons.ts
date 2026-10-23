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

export default crons
