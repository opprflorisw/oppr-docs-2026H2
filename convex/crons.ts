import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"
import { SCHEDULES } from "./settings/schedules"

// Names and times live in convex/settings/schedules.ts, so Settings shows
// exactly what runs.
const crons = cronJobs()
const S = SCHEDULES
const at = ({ hourUTC, minuteUTC }: { hourUTC: number; minuteUTC: number }) => ({ hourUTC, minuteUTC })

// Wikis are regenerated on a schedule as well as on every relevant publish, so
// they stay correct even if a publish-time run failed.
crons.daily(S.wikis.name, at(S.wikis.at), internal.wikis.regenerateAll, {})

// CONTEXT.md: the Consistency check runs on every publish and once a week
// across everything.
crons.weekly(S.consistency.name, { dayOfWeek: S.consistency.at.dayOfWeek, ...at(S.consistency.at) }, internal.ai.consistency.runAll, { trigger: "weekly" })

// Refresher assignments 30 days before a Skill level or a Training record
// (refreshMonths) expires.
crons.daily(S.refreshers.name, at(S.refreshers.at), internal.assignments.createRefreshers, {})

// Captures privacy: media older than the retention under Settings, Floor.
crons.daily(S.captureRetention.name, at(S.captureRetention.at), internal.settings.retention.purgeCaptureMedia, {})

// AI usage: calls older than 30 days become daily rows (spec 6.7).
crons.daily(S.aiUsageRollup.name, at(S.aiUsageRollup.at), internal.aiUsage.rollupOld, {})

export default crons
