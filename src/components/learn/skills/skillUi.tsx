import { format } from "date-fns"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"

// Shared look for Skill levels (CONTEXT.md: Skill, Skill matrix).
// Levels: 0 not trained, 1 trained, 2 qualified, 3 can train others.

export type SkillStatus = "ok" | "gap" | "expired" | "expiring" | "retrain" | "none"

export const LEVEL_NAMES = ["Not trained", "Trained", "Qualified", "Can train others"] as const

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
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
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

export function SkillLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <LevelDots level={2} target={2} status="ok" size="sm" />
        Level 0 to 3, target ringed
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-emerald-500" /> At target
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-amber-500" /> Below target
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-4 rounded-sm border border-amber-400" /> Expires within 30 days
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-red-500" /> Expired
      </span>
      <span className="flex items-center gap-1.5">
        <RotateCcw className="h-3 w-3 text-red-600" /> Re-train needed
      </span>
    </div>
  )
}

export function fmtDate(at: number | null | undefined) {
  return at ? format(at, "d MMM yyyy") : "–"
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

/** The readable part of a Convex error ("Uncaught Error: ... at handler"). */
export function errorText(err: unknown, fallback = "That did not work.") {
  if (!(err instanceof Error)) return fallback
  const m = err.message.match(/Uncaught Error: ([\s\S]*?)(?:\n\s+at |$)/)
  return (m ? m[1] : err.message).trim() || fallback
}

/** A Training record's score as a percentage, whether stored as 0-1 or 0-100. */
export function fmtScore(score: number) {
  return `${Math.round(score <= 1 ? score * 100 : score)}%`
}
