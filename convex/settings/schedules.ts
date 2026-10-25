// The recurring jobs, in one place: convex/crons.ts schedules them from this
// list and Settings, AI and connections shows it read-only. Times are UTC.

type Daily = { kind: "daily"; hourUTC: number; minuteUTC: number }
type Weekly = {
  kind: "weekly"
  dayOfWeek: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
  hourUTC: number
  minuteUTC: number
}

export type Schedule = {
  /** The cron name. Never rename: Convex keys the job on it. */
  name: string
  label: string
  what: string
  at: Daily | Weekly
}

export const SCHEDULES = {
  wikis: {
    name: "regenerate wikis",
    label: "Wiki rebuild",
    what: "Every Wiki is regenerated from Published Knowledge, as well as on every relevant publish.",
    at: { kind: "daily", hourUTC: 3, minuteUTC: 0 },
  },
  consistency: {
    name: "consistency check",
    label: "Consistency check",
    what: "All Published Knowledge is checked for contradictions and duplicates. It also runs on every publish.",
    at: { kind: "weekly", dayOfWeek: "sunday", hourUTC: 2, minuteUTC: 0 },
  },
  refreshers: {
    name: "training refreshers",
    label: "Training refreshers",
    what: "Refresher assignments 30 days before a Skill level or a Training record expires.",
    at: { kind: "daily", hourUTC: 4, minuteUTC: 0 },
  },
  captureRetention: {
    name: "capture media retention",
    label: "Captures media retention",
    what: "Removes photos, video and voice notes of handed-in Captures older than the retention set under Floor. Does nothing while no retention is set.",
    at: { kind: "daily", hourUTC: 5, minuteUTC: 0 },
  },
  aiUsageRollup: {
    name: "ai usage rollup",
    label: "AI usage rollup",
    what: "AI calls older than 30 days are rolled up into one row per day and kind of call, so the usage table stays small. Totals and costs stay the same.",
    at: { kind: "daily", hourUTC: 1, minuteUTC: 30 },
  },
} satisfies Record<string, Schedule>

export function scheduleText(at: Daily | Weekly): string {
  const time = `${String(at.hourUTC).padStart(2, "0")}:${String(at.minuteUTC).padStart(2, "0")} UTC`
  if (at.kind === "daily") return `Every day at ${time}`
  return `Every ${at.dayOfWeek[0].toUpperCase()}${at.dayOfWeek.slice(1)} at ${time}`
}
