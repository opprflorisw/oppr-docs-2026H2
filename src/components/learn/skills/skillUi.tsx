import { useMemo } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { formatDate } from "@/lib/time"
import { LEVEL_NAMES } from "@/lib/skillLevelNames"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"

// Shared look for Skill levels (CONTEXT.md: Skill, Skill matrix).
// Levels in plain words, by default 0 Not trained, 1 Knows it, 2 Can do it, 3 Can teach it.

export type SkillStatus = "ok" | "gap" | "expired" | "expiring" | "retrain" | "none"

// The words are the plant's own (Settings, People and roles); LEVEL_NAMES is
// kept in step with the server by useCheckIn.
export { LEVEL_NAMES, useLevelNames } from "@/lib/skillLevelNames"

/** "2 Can do it". */
export function levelWords(level: number) {
  const l = Math.max(0, Math.min(3, level))
  return `${l} ${LEVEL_NAMES[l]}`
}

export function levelName(level: number) {
  return LEVEL_NAMES[Math.max(0, Math.min(3, level))]
}

export const STATUS_META: Record<SkillStatus, { label: string; text: string; dot: string; chip: string }> = {
  ok: {
    label: "At target",
    text: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500 border-emerald-500",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  gap: {
    label: "Below target",
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500 border-amber-500",
    chip: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400",
  },
  expiring: {
    label: "Expires within 30 days",
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-emerald-500 border-emerald-500",
    chip: "border-amber-300 bg-background text-amber-700 dark:border-amber-800 dark:text-amber-400",
  },
  expired: {
    label: "Expired",
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-500 border-red-500",
    chip: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400",
  },
  retrain: {
    label: "Re-train needed",
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-500 border-red-500",
    chip: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400",
  },
  none: {
    label: "Not needed",
    text: "text-muted-foreground",
    dot: "bg-slate-400 border-slate-400 dark:bg-slate-500 dark:border-slate-500",
    chip: "border-border bg-muted/40 text-muted-foreground",
  },
}

/**
 * Three dots for levels 1-3: filled up to the level, the target dot ringed.
 * An expired level keeps its dots, struck through in red.
 */
export function LevelDots({
  level,
  target,
  status,
  size = "md",
}: {
  level: number
  target: number | null
  status: SkillStatus
  size?: "sm" | "md" | "lg"
}) {
  const fill = STATUS_META[status].dot
  const dim = size === "lg" ? "h-3 w-3" : size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2"
  return (
    <span className={cn("relative inline-flex items-center", size === "lg" ? "gap-1.5" : "gap-1")}>
      {[1, 2, 3].map((n) => {
        const filled = n <= level
        const isTarget = target != null && n === target
        return (
          <span
            key={n}
            className={cn(
              "rounded-full border",
              dim,
              filled ? fill : "border-muted-foreground/30 bg-transparent",
              !filled && isTarget && "border-amber-500 border-dashed",
              isTarget && "ring-1 ring-foreground/40 ring-offset-1 ring-offset-background",
              status === "expired" && filled && "opacity-60",
            )}
          />
        )
      })}
      {status === "expired" && level > 0 && (
        <span className="pointer-events-none absolute inset-x-[-2px] top-1/2 h-px -translate-y-1/2 bg-red-600" />
      )}
    </span>
  )
}

export function StatusChip({ status, className }: { status: SkillStatus; className?: string }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.chip,
        className,
      )}
    >
      {status === "retrain" && <RotateCcw className="h-3 w-3" />}
      {status === "expired" && <AlertTriangle className="h-3 w-3" />}
      {meta.label}
    </span>
  )
}

/** The fill of a matrix cell per status, so the legend and the cells match. */
export const CELL_FILL: Record<SkillStatus, string> = {
  ok: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  gap: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  expiring: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-amber-400 dark:bg-emerald-950/40 dark:text-emerald-300",
  expired: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300",
  retrain: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300",
  none: "text-muted-foreground",
}

/** One line: what a cell's dots mean and what each fill says. */
export function SkillLegend({ className }: { className?: string }) {
  const swatch = (s: SkillStatus) => <span className={cn("inline-block h-3 w-4 rounded-sm border border-black/10", CELL_FILL[s])} />
  return (
    <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      <span className="flex items-center gap-1.5">
        <LevelDots level={1} target={2} status="gap" />
        <span>
          = level 1 of target 2 (filled dots: the level, the ringed dot: the target). Levels: 1 {LEVEL_NAMES[1]}, 2{" "}
          {LEVEL_NAMES[2]}, 3 {LEVEL_NAMES[3]}.
        </span>
      </span>
      <span className="flex items-center gap-1">{swatch("ok")} At target</span>
      <span className="flex items-center gap-1">{swatch("gap")} Below target</span>
      <span className="flex items-center gap-1">{swatch("expiring")} Expires within 30 days</span>
      <span className="flex items-center gap-1">{swatch("expired")} Expired (counts as 0) or re-train</span>
    </p>
  )
}

export function fmtDate(at: number | null | undefined) {
  return at ? formatDate(at) : "–"
}

const DAY = 24 * 60 * 60 * 1000
export function daysFromNow(at: number) {
  return Math.ceil((at - Date.now()) / DAY)
}

/** "expires in 18 days" / "expired 61 days ago" / "valid until 3 Mar 2027". */
export function expiryText(expiresAt: number | null) {
  if (expiresAt == null) return "Does not expire"
  const d = daysFromNow(expiresAt)
  if (d < 0) return `Expired ${-d} ${d === -1 ? "day" : "days"} ago`
  if (d === 0) return "Expires today"
  if (d <= 30) return `Expires in ${d} ${d === 1 ? "day" : "days"}`
  return `Valid until ${fmtDate(expiresAt)}`
}

export function sourceText(source: "training" | "signoff" | "seed" | null, signedOffBy?: string | null) {
  if (source === "training") return "Passed a Training"
  if (source === "signoff") return signedOffBy ? `Signed off by ${signedOffBy}` : "Engineer sign-off"
  if (source === "seed") return "Previous training register"
  return "–"
}

// ---- Shifts ------------------------------------------------------------------
// The plant's shifts come from Settings, People and roles (api.people.shifts).
// Until they load, the standard early, late, night and day shifts stand in.

export type ShiftKey = string
export type ShiftMeta = {
  key: ShiftKey
  label: string
  short: string
  hours: string
  /** Start in minutes after midnight. */
  start: number
  active: boolean
  cover: boolean
}

type ShiftRow = { key: string; name: string; start: string; end: string; active: boolean; cover: boolean }

const FALLBACK_SHIFTS: ShiftRow[] = [
  { key: "early", name: "Early shift", start: "06:00", end: "14:00", active: true, cover: true },
  { key: "late", name: "Late shift", start: "14:00", end: "22:00", active: true, cover: true },
  { key: "night", name: "Night shift", start: "22:00", end: "06:00", active: true, cover: true },
  { key: "day", name: "Day shift", start: "08:00", end: "17:00", active: true, cover: false },
]

const hh = (t: string) => (t.endsWith(":00") ? t.slice(0, 2) : t)
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

function toMeta(r: ShiftRow): ShiftMeta {
  const short = r.name.replace(/\s*shift$/i, "").trim() || r.name
  return {
    key: r.key,
    label: r.name,
    short,
    hours: `${hh(r.start)}-${hh(r.end)}`,
    start: minutes(r.start),
    active: r.active,
    cover: r.cover,
  }
}

/** The shift key a raw value stands for: an exact key, else words like "night" in a role. */
export function shiftKey(raw: string | null | undefined, keys?: readonly string[]): ShiftKey | null {
  if (!raw) return null
  if (keys ? keys.includes(raw) : FALLBACK_SHIFTS.some((s) => s.key === raw)) return raw
  const s = raw.toLowerCase()
  if (s.includes("night")) return "night"
  if (s.includes("late")) return "late"
  if (s.includes("early")) return "early"
  if (/\bday\b/.test(s)) return "day"
  return null
}

/** The shift that starts next among `shifts`, by the clock. */
export function nextShiftOf(shifts: readonly ShiftMeta[], now = new Date()): ShiftKey | null {
  if (shifts.length === 0) return null
  const m = now.getHours() * 60 + now.getMinutes()
  let best: ShiftMeta | null = null
  let bestGap = Infinity
  for (const s of shifts) {
    let gap = s.start - m
    if (gap <= 0) gap += 24 * 60
    if (gap < bestGap) {
      best = s
      bestGap = gap
    }
  }
  return best?.key ?? null
}

/**
 * The plant's shifts. `cover` holds the active shifts that count for shift
 * cover, in order; `meta(key)` names any shift, also an inactive one.
 */
export function useShifts() {
  const rows = useQuery(api.people.shifts.list)
  return useMemo(() => {
    const all = (rows ?? FALLBACK_SHIFTS).map(toMeta)
    const byKey = new Map(all.map((s) => [s.key, s]))
    const active = all.filter((s) => s.active)
    const cover = active.filter((s) => s.cover)
    const keys = all.map((s) => s.key)
    return {
      loading: rows === undefined,
      all,
      active,
      cover,
      keys,
      meta: (key: string | null | undefined): ShiftMeta | null => (key ? byKey.get(key) ?? null : null),
      label: (key: string | null | undefined) => (key ? byKey.get(key)?.label ?? key : "No shift"),
      normalize: (raw: string | null | undefined) => shiftKey(raw, keys),
      next: (now?: Date) => nextShiftOf(cover, now) ?? cover[0]?.key ?? null,
    }
  }, [rows])
}

/** Red for nobody, amber for one person, green for two or more. */
export function coverTone(count: number) {
  return count === 0
    ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
    : count === 1
      ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400"
      : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
}

/** The readable part of a Convex error ("Uncaught Error: ... at handler"). */
export function errorText(err: unknown, fallback = "That did not work.") {
  if (!(err instanceof Error)) return fallback
  const data = (err as Error & { data?: unknown }).data
  if (typeof data === "string" && data.trim()) return data.trim()
  const m = err.message.match(/Uncaught (?:Convex)?Error: ([\s\S]*?)(?:\n\s+at |$)/)
  return (m ? m[1] : err.message).trim() || fallback
}

/** A Training record's score as a percentage, whether stored as 0-1 or 0-100. */
export function fmtScore(score: number) {
  return `${Math.round(score <= 1 ? score * 100 : score)}%`
}
