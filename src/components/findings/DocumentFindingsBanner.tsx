import { useQuery } from "convex/react"
import { Link } from "wouter"
import { AlertTriangle, ArrowUpRight } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { KindBadge } from "./findingUi"
import { findingHref, passageHref } from "./findingUtils"

// Banner on a Document listing its open Findings (CONTEXT.md: Findings appear
// as a banner on both Documents), each with the other side quoted and a link
// to the Finding. Renders nothing when there are none.
export function DocumentFindingsBanner({ documentId }: { documentId: Id<"documents"> }) {
  const findings = useQuery(api.findings.forDocument, { documentId })
  if (!findings || findings.length === 0) return null

  const contradictions = findings.filter((f) => f.kind === "contradiction").length
  const red = contradictions > 0
  const title =
    findings.length === 1
      ? red
        ? "This document contradicts another Published document"
        : "This document repeats another Published document"
      : red
        ? `${findings.length} open Findings: this document disagrees with other Published documents`
        : `${findings.length} open Findings: this document repeats other Published documents`

  return (
    <div
      role="status"
      className={cn(
        "space-y-2 rounded-lg border p-3",
        red
          ? "border-red-300 bg-red-50 text-red-950 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100"
          : "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", red ? "text-red-600" : "text-amber-600")} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs opacity-80">
            {red
              ? "Ask warns about this when it answers from either document. Publish a revision or dismiss the Finding to close it."
              : "If one changes, the other must change too. Consider merging them, or dismiss the Finding with a reason."}
          </p>
        </div>
      </div>
      <ul className="space-y-1.5 pl-6">
        {findings.map((f) => (
          <li key={f._id} className="rounded-md border bg-background/70 p-2.5 text-foreground">
            <div className="flex flex-wrap items-start gap-2">
              <KindBadge kind={f.kind} />
              <p className="min-w-0 flex-1 text-xs font-medium leading-snug">{f.summary}</p>
              <Link
                href={findingHref(f._id)}
                className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
              >
                Open Finding
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="mt-1.5 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
              <p className="min-w-0">
                <span className="font-medium text-foreground">Here: </span>"{f.mine.quote}"
              </p>
              <p className="min-w-0">
                <Link href={passageHref(f.other)} className="font-mono font-medium text-primary hover:underline">
                  {f.other.namingCode}
                </Link>
                <span className="font-medium text-foreground">: </span>"{f.other.quote}"
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
