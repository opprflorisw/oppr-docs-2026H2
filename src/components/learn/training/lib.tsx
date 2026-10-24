import { Link } from "wouter"
import { Footprints, GraduationCap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { cn } from "@/lib/utils"
import { formatDate, formatDateTime } from "@/lib/time"
import type { Id } from "../../../../convex/_generated/dataModel"

export type TrainingKind = "course" | "round"

/** A message a person can act on, without request ids or stack noise. */
export function errorText(err: unknown, fallback = "Something went wrong. Try again."): string {
  const data = (err as { data?: unknown } | null)?.data
  if (typeof data === "string" && data.trim()) return data
  const raw = err instanceof Error ? err.message : String(err)
  const uncaught = raw.match(/Uncaught (?:Error|ConvexError): (.+?)(?:\n|\s+at |$)/)
  if (uncaught) return uncaught[1]
  if (/\[Request ID|Server Error/.test(raw)) return fallback
  return raw || fallback
}

export function fmtDate(at: number | null | undefined, long = false): string {
  if (at == null) return ""
  return formatDate(at, long)
}

export function fmtDateTime(at: number | null | undefined): string {
  if (at == null) return ""
  return formatDateTime(at)
}

export function daysAgo(at: number): string {
  const d = Math.floor((Date.now() - at) / 86_400_000)
  if (d <= 0) return "today"
  if (d === 1) return "yesterday"
  if (d < 60) return `${d} days ago`
  const m = Math.round(d / 30.4)
  if (m < 24) return `${m} months ago`
  return `${Math.round(d / 365)} years ago`
}

export const KIND_LABEL: Record<TrainingKind, string> = { course: "Training", round: "Round" }

export function KindIcon({ kind, className }: { kind: TrainingKind; className?: string }) {
  const Icon = kind === "round" ? Footprints : GraduationCap
  return <Icon className={className} />
}

export function KindBadge({ kind, className }: { kind: TrainingKind; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 gap-1 px-1.5 text-[10px] font-medium",
        kind === "round"
          ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300"
          : "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300",
        className,
      )}
    >
      <KindIcon kind={kind} className="h-3 w-3" />
      {KIND_LABEL[kind]}
    </Badge>
  )
}

/**
 * A cited source: the naming code, with the quoted passage on hover. Opens
 * the Document with the passage highlighted.
 */
export function SourceChip({
  documentId,
  namingCode,
  version,
  section,
  quote,
  className,
}: {
  documentId: Id<"documents">
  namingCode: string
  version?: number | null
  section?: string | null
  quote: string | null
  className?: string
}) {
  const hl = quote ? quote.split(" | ")[0].slice(0, 80) : ""
  const params = new URLSearchParams()
  if (version != null) params.set("v", String(version))
  if (hl) params.set("hl", hl)
  const qs = params.toString()
  const href = qs ? `/docs/${documentId}?${qs}` : `/docs/${documentId}`
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <Link
          href={href}
          className={cn(
            "inline-flex items-center rounded border bg-muted/60 px-1.5 py-0 align-baseline font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary print:border-0 print:bg-transparent print:p-0",
            className,
          )}
        >
          {namingCode}
          {version != null && <span className="ml-1 opacity-70">v{version}</span>}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 space-y-1.5 text-xs" align="start">
        <span className="block font-mono text-[10px] text-muted-foreground">
          {namingCode}
          {version != null ? ` · v${version}` : ""}
          {section ? ` · ${section}` : ""}
        </span>
        <span className="block leading-relaxed">{quote ?? "The passage shows once you have answered."}</span>
        <span className="block text-[10px] text-primary">Click to open it in the document</span>
      </HoverCardContent>
    </HoverCard>
  )
}

/** Thin progress bar (there is no Progress primitive in the UI kit). */
export function ProgressBar({ value, className, tone = "primary" }: { value: number; className?: string; tone?: "primary" | "emerald" }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-all", tone === "emerald" ? "bg-emerald-500" : "bg-primary")}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

export function ScoreBadge({ score, passed }: { score: number | null; passed: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
        passed
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
      )}
    >
      {score ?? 0}%
    </span>
  )
}
