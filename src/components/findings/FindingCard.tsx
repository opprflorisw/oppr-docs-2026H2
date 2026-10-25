import { useState } from "react"
import { Link, useLocation } from "wouter"
import { toast } from "sonner"
import { ArrowRight, CheckCircle2, CircleSlash, Loader2, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import { KindBadge, SideCard } from "./findingUi"
import { TRIGGER_LABEL, whenText, type FindingView } from "./findingUtils"
import { DismissFindingDialog, PrepareRevisionDialog } from "./FindingDialogs"
import { isEngineerOrAdmin } from "@/lib/roles"

const REVISION_STATE: Record<string, string> = {
  generating: "is being prepared",
  ready: "is ready for review",
  failed: "could not be prepared",
  discarded: "was discarded",
}

/** One Finding: what disagrees, both passages side by side, and what to do next. */
export function FindingCard({ finding, highlighted }: { finding: FindingView; highlighted?: boolean }) {
  const { person } = useCheckIn()
  const engineer = isEngineerOrAdmin(person) ? person : null
  const [dismissOpen, setDismissOpen] = useState(false)
  const [reviseOpen, setReviseOpen] = useState(false)
  const open = finding.status === "open"
  const revisionDoc = finding.proposedRevision
    ? [finding.a, finding.b].find((s) => s.documentId === finding.proposedRevision!.documentId)
    : null
  const [, navigate] = useLocation()
  const revisionState = finding.proposedRevision?.state ?? null
  const preparing = open && revisionState === "generating"
  const ready = open && revisionState === "ready"

  return (
    <Card
      id={`finding-${finding._id}`}
      className={cn(
        "scroll-mt-32 transition-shadow",
        highlighted && "ring-2 ring-primary/50",
        !open && "bg-muted/20",
      )}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <KindBadge kind={finding.kind} className="mt-0.5" />
          <p className={cn("min-w-0 flex-1 text-sm font-medium leading-snug", !open && "text-muted-foreground")}>
            {finding.summary}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <SideCard side={finding.a} kind={finding.kind} />
          <SideCard side={finding.b} kind={finding.kind} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <StatusLine finding={finding} revisionCode={revisionDoc?.namingCode ?? null} />
          {preparing ? (
            <p role="status" className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing a revision of {revisionDoc?.namingCode ?? "the document"}...
            </p>
          ) : ready && finding.proposedRevision ? (
            <Button size="sm" onClick={() => navigate(`/docs/${finding.proposedRevision!.documentId}`)}>
              Review the proposed revision
              <ArrowRight />
            </Button>
          ) : open && (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => {
                  if (!engineer) {
                    toast.error("Check in as an Engineer (top right) to dismiss a Finding.")
                    return
                  }
                  setDismissOpen(true)
                }}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Dismiss
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReviseOpen(true)}>
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                Prepare a revision
              </Button>
            </div>
          )}
        </div>
      </CardContent>
      {open && (
        <>
          <DismissFindingDialog finding={finding} open={dismissOpen} onOpenChange={setDismissOpen} />
          <PrepareRevisionDialog finding={finding} open={reviseOpen} onOpenChange={setReviseOpen} />
        </>
      )}
    </Card>
  )
}

function StatusLine({ finding, revisionCode }: { finding: FindingView; revisionCode: string | null }) {
  const found = `Found ${whenText(finding.detectedAt)} by ${TRIGGER_LABEL[finding.detectedBy]}.`
  if (finding.status === "resolved") {
    return (
      <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span>
          <span className="font-medium text-foreground">{finding.resolution ?? "Resolved"}</span>
          {finding.resolvedAt ? `, ${whenText(finding.resolvedAt)}` : ""}. {found}
        </span>
      </p>
    )
  }
  if (finding.status === "dismissed") {
    return (
      <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
        <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-medium text-foreground">
            Dismissed{finding.dismissedByName ? ` by ${finding.dismissedByName}` : ""}
            {finding.resolvedAt ? `, ${whenText(finding.resolvedAt)}` : ""}:
          </span>{" "}
          "{finding.dismissedReason}". {found}
        </span>
      </p>
    )
  }
  return (
    <p className="min-w-0 text-xs text-muted-foreground">
      {found}
      {finding.proposedRevision && revisionCode && (
        <>
          {" "}
          A Proposed revision of{" "}
          <Link href={`/docs/${finding.proposedRevision.documentId}`} className="font-mono text-primary hover:underline">
            {revisionCode}
          </Link>{" "}
          {REVISION_STATE[finding.proposedRevision.state] ?? ""}.
        </>
      )}
    </p>
  )
}
