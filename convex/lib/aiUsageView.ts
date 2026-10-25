// AI usage tracker: the shapes the Usage tab reads, and the pure helpers that
// build and merge them. Browser-safe (no server imports), so the page merges
// the closed days (cached, they never change) with today (live) itself.
//
// Amounts are estimates in USD from the Price table (CONTEXT.md: AI usage,
// Price table). Only `aiUsage` rows of kind "call" are counted here; rows of
// kind "action" are budget markers for Wiki AI actions and have no cost.

export const DIMENSIONS = ["feature", "model", "person", "wiki", "document", "other"] as const
export type Dimension = (typeof DIMENSIONS)[number]

export interface Totals {
  calls: number
  failed: number
  cost: number
  tokensIn: number
  tokensOut: number
  units: number
  /** Calls with no price for their model (cost unknown, counted as 0). */
  unpriced: number
}

/** One call, without any prompt or answer text (there is none to show). */
export interface CallRow {
  id: string
  time: number
  feature: string
  provider: string
  model: string
  tokensIn: number
  tokensOut: number
  units: number
  latencyMs: number
  ok: boolean
  error: string | null
  cost: number | null
  personKey: string | null
  targetKey: string | null
  /** Calls this row stands for: 1, or more for a daily rollup of calls older than 30 days. */
  calls: number
}

export interface DayAgg {
  /** UTC day "2026-10-25". */
  day: string
  totals: Totals
  /** personId null: migration, publish rebuilds, nightly jobs, seed. */
  system: Totals
  people: Totals
  dims: Record<Dimension, Record<string, Totals>>
  /** The most expensive calls of the day. */
  top: CallRow[]
  /** The latest failed calls of the day. */
  failures: CallRow[]
}

export interface UsageAgg {
  days: DayAgg[]
  /** Display names for person, Wiki, Document and other target keys. */
  labels: Record<string, string>
  /** True when the window held more rows than one read may take; totals are then a lower bound. */
  truncated: boolean
  rows: number
}

export const TOP_PER_DAY = 8
export const FAILURES_PER_DAY = 10

export function emptyTotals(): Totals {
  return { calls: 0, failed: 0, cost: 0, tokensIn: 0, tokensOut: 0, units: 0, unpriced: 0 }
}

function addTo(t: Totals, r: Pick<CallRow, "ok" | "cost" | "tokensIn" | "tokensOut" | "units" | "provider" | "calls">) {
  t.calls += r.calls
  if (!r.ok) t.failed += r.calls
  if (r.cost === null) {
    if (r.provider !== "stub" && r.ok) t.unpriced += r.calls
  } else t.cost += r.cost
  t.tokensIn += r.tokensIn
  t.tokensOut += r.tokensOut
  t.units += r.units
}

function addTotals(a: Totals, b: Totals) {
  a.calls += b.calls
  a.failed += b.failed
  a.cost += b.cost
  a.tokensIn += b.tokensIn
  a.tokensOut += b.tokensOut
  a.units += b.units
  a.unpriced += b.unpriced
}

function emptyDay(day: string): DayAgg {
  return {
    day,
    totals: emptyTotals(),
    system: emptyTotals(),
    people: emptyTotals(),
    dims: { feature: {}, model: {}, person: {}, wiki: {}, document: {}, other: {} },
    top: [],
    failures: [],
  }
}

export function utcDayOf(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

/** Start of a UTC day, in ms. */
export function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`)
}

/** The dimension key a row's target counts under. */
export function targetDimension(targetKind: string | null): Dimension | null {
  if (!targetKind) return null
  if (targetKind === "wiki") return "wiki"
  if (targetKind === "document") return "document"
  return "other"
}

/** Builds per-day aggregates from call rows (any order). */
export function aggregateRows(rows: (CallRow & { targetKind: string | null })[]): DayAgg[] {
  const byDay = new Map<string, DayAgg>()
  for (const r of rows) {
    const day = utcDayOf(r.time)
    let d = byDay.get(day)
    if (!d) byDay.set(day, (d = emptyDay(day)))
    addTo(d.totals, r)
    addTo(r.personKey ? d.people : d.system, r)
    const bump = (dim: Dimension, key: string) => addTo((d!.dims[dim][key] ??= emptyTotals()), r)
    bump("feature", r.feature)
    bump("model", r.model)
    bump("person", r.personKey ?? "system")
    const td = targetDimension(r.targetKind)
    if (td && r.targetKey) bump(td, r.targetKey)
    if (r.cost !== null && r.cost > 0) {
      d.top.push(r)
      if (d.top.length > TOP_PER_DAY * 4) d.top = topCalls(d.top, TOP_PER_DAY)
    }
    if (!r.ok) d.failures.push(r)
  }
  for (const d of byDay.values()) {
    d.top = topCalls(d.top, TOP_PER_DAY)
    d.failures = d.failures.sort((a, b) => b.time - a.time).slice(0, FAILURES_PER_DAY)
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day))
}

function topCalls(rows: CallRow[], n: number): CallRow[] {
  return [...rows].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0)).slice(0, n)
}

/** The closed days and today, as one list (a day in both is taken from `live`). */
export function mergeAggs(closed: UsageAgg | null | undefined, live: UsageAgg | null | undefined): UsageAgg | null {
  if (!closed && !live) return null
  const days = new Map<string, DayAgg>()
  for (const d of closed?.days ?? []) days.set(d.day, d)
  for (const d of live?.days ?? []) days.set(d.day, d)
  return {
    days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    labels: { ...(closed?.labels ?? {}), ...(live?.labels ?? {}) },
    truncated: Boolean(closed?.truncated || live?.truncated),
    rows: (closed?.rows ?? 0) + (live?.rows ?? 0),
  }
}

export interface WindowView {
  totals: Totals
  system: Totals
  people: Totals
  dims: Record<Dimension, { key: string; totals: Totals }[]>
  top: CallRow[]
  failures: CallRow[]
}

/** Everything from `fromDay` on (inclusive), summed. */
export function windowView(days: DayAgg[], fromDay: string, topN = 10, failuresN = 20): WindowView {
  const totals = emptyTotals()
  const system = emptyTotals()
  const people = emptyTotals()
  const dims = { feature: {}, model: {}, person: {}, wiki: {}, document: {}, other: {} } as Record<Dimension, Record<string, Totals>>
  let top: CallRow[] = []
  let failures: CallRow[] = []
  for (const d of days) {
    if (d.day < fromDay) continue
    addTotals(totals, d.totals)
    addTotals(system, d.system)
    addTotals(people, d.people)
    for (const dim of DIMENSIONS)
      for (const [key, t] of Object.entries(d.dims[dim])) addTotals((dims[dim][key] ??= emptyTotals()), t)
    top = top.concat(d.top)
    failures = failures.concat(d.failures)
  }
  const sorted = (rec: Record<string, Totals>) =>
    Object.entries(rec)
      .map(([key, t]) => ({ key, totals: t }))
      .sort((a, b) => b.totals.cost - a.totals.cost || b.totals.calls - a.totals.calls)
  return {
    totals,
    system,
    people,
    dims: {
      feature: sorted(dims.feature),
      model: sorted(dims.model),
      person: sorted(dims.person),
      wiki: sorted(dims.wiki),
      document: sorted(dims.document),
      other: sorted(dims.other),
    },
    top: topCalls(top, topN),
    failures: failures.sort((a, b) => b.time - a.time).slice(0, failuresN),
  }
}

/** The UTC day `n` days before `today` ("2026-10-25", 6 gives "2026-10-19"). */
export function daysBefore(today: string, n: number): string {
  return utcDayOf(dayStart(today) - n * 24 * 60 * 60 * 1000)
}

function csvCell(v: string | number | boolean | null): string {
  if (v === null) return ""
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const CSV_HEADER = [
  "time_utc",
  "feature",
  "provider",
  "model",
  "tokens_in",
  "tokens_out",
  "units",
  "latency_ms",
  "ok",
  "error",
  "est_cost_usd",
  "person",
  "target_kind",
  "target",
  "calls",
] as const

/** One CSV line per call; `labels` turns keys into names. */
export function csvLine(r: CallRow & { targetKind: string | null }, labels: Record<string, string>): string {
  return [
    new Date(r.time).toISOString(),
    r.feature,
    r.provider,
    r.model,
    r.tokensIn,
    r.tokensOut,
    r.units,
    r.latencyMs,
    r.ok,
    r.error,
    r.cost === null ? null : Number(r.cost.toFixed(6)),
    r.personKey ? (labels[r.personKey] ?? r.personKey) : "system",
    r.targetKind,
    r.targetKey ? (labels[r.targetKey] ?? r.targetKey) : null,
    r.calls,
  ]
    .map(csvCell)
    .join(",")
}

/** A Plan feature limit "wiki" covers wiki.build, wiki.block and the rest. */
export function featureMatches(feature: string, limit: string): boolean {
  return feature === limit || feature.startsWith(`${limit}.`)
}

/** The message when `feature` falls under one of the Plan's used-up feature limits, else null. */
export function featureBlocked(feature: string, blocked: string[]): string | null {
  const hit = blocked.find((f) => featureMatches(feature, f))
  return hit ? `The Plan's monthly limit for ${hit} is used up.` : null
}
