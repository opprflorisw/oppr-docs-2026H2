import { Link } from "wouter"
import { ArrowUpRight, Copy, FileWarning } from "lucide-react"
import { cn } from "@/lib/utils"
import { KIND_LABEL, passageHref, type FindingKind, type FindingSide } from "./findingUtils"

// Shared components of the Findings UI (CONTEXT.md: Finding, Consistency check).

export function KindBadge({ kind, className }: { kind: FindingKind; className?: string }) {
  const Icon = kind === "contradiction" ? FileWarning : Copy
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        kind === "contradiction"
          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
          : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-500/40 dark:bg-slate-500/10 dark:text-slate-300",
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {KIND_LABEL[kind]}
    </span>
  )
}

/** One side of a Finding: which document, where, and the quoted passage. */
export function SideCard({
  side,
  kind,
  label,
  className,
}: {
  side: FindingSide
  kind: FindingKind
  label?: string
  className?: string
}) {
  const superseded = side.liveVersion != null && side.liveVersion !== side.version
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-3", className)}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          {label && <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>}
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="font-mono text-xs font-semibold">{side.namingCode}</span>
            <span className="text-[11px] text-muted-foreground">v{side.version}</span>
            {side.wrapped && (
              <span className="rounded border px-1 text-[10px] text-muted-foreground">Supplier manual</span>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground" title={side.title}>
            {side.title}
            {side.section && side.section !== side.title ? ` · ${side.section}` : ""}
          </div>
        </div>
        {side.exists && (
          <Link
            href={passageHref(side)}
            className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
          >
            Open passage
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <blockquote
        className={cn(
          "border-l-2 pl-2.5 text-sm leading-relaxed",
          kind === "contradiction" ? "border-red-400" : "border-slate-300",
        )}
      >
        {side.quote}
      </blockquote>
      {superseded && (
        <p className="text-[11px] text-muted-foreground">Now Published as v{side.liveVersion}.</p>
      )}
    </div>
  )
}
