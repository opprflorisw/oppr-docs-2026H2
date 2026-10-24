import { useEffect, useState } from "react"
import { useAction, useMutation } from "convex/react"
import { useLocation } from "wouter"
import { toast } from "sonner"
import { Loader2, Sparkles } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import { errorText, type FindingSide, type FindingView } from "./findingUtils"

const ENGINEER_NEEDED = "Check in as an Engineer (top right) to dismiss a Finding."

/** Dismiss with a reason, in the name of the checked-in Engineer. */
export function DismissFindingDialog({
  finding,
  open,
  onOpenChange,
}: {
  finding: FindingView
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const dismiss = useMutation(api.findings.dismiss)
  const { person } = useCheckIn()
  const engineer = person?.kind === "engineer" ? person : null
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setReason("")
  }, [open])

  const tooShort = reason.trim().length < 3

  async function submit() {
    if (!engineer) {
      toast.error(ENGINEER_NEEDED)
      return
    }
    if (tooShort) return
    setBusy(true)
    try {
      await dismiss({ findingId: finding._id, personId: engineer._id, reason: reason.trim() })
      toast.success("Finding dismissed. This pair is not reported again until one side changes.")
      onOpenChange(false)
    } catch (err) {
      toast.error(errorText(err, "The Finding could not be dismissed."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dismiss this Finding</DialogTitle>
          <DialogDescription>
            {finding.a.namingCode} and {finding.b.namingCode} stay as they are. The Consistency check
            does not report this pair again until one of them gets a new Published version.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="dismiss-reason" className="text-xs">
            Reason
          </Label>
          <Textarea
            id="dismiss-reason"
            autoFocus
            rows={3}
            value={reason}
            maxLength={500}
            placeholder={
              finding.kind === "contradiction"
                ? "For example: the two values are for different die sizes, so both are right."
                : "For example: both are needed, the work instruction is the short version for the floor."
            }
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit()
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            {engineer ? (
              <>Recorded in the name of {engineer.name}.</>
            ) : (
              <span className="text-amber-700 dark:text-amber-400">{ENGINEER_NEEDED}</span>
            )}
          </p>
        </div>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy || tooShort}>
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Dismiss Finding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Pick which side to revise; the AI prepares a draft that goes through normal review. */
export function PrepareRevisionDialog({
  finding,
  open,
  onOpenChange,
}: {
  finding: FindingView
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const propose = useAction(api.ai.revision.propose)
  const [, navigate] = useLocation()
  const sides = [finding.a, finding.b]
  const firstRevisable = sides.find((s) => s.exists && !s.wrapped) ?? null
  const [pick, setPick] = useState<string | null>(firstRevisable?.documentId ?? null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setPick(firstRevisable?.documentId ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const chosen = sides.find((s) => s.documentId === pick) ?? null

  async function submit() {
    if (!chosen) return
    setBusy(true)
    try {
      await propose({
        documentId: chosen.documentId as Id<"documents">,
        source: { kind: "finding", findingId: finding._id, note: finding.summary },
      })
      toast.success(`Preparing a Proposed revision of ${chosen.namingCode}.`, {
        description: "It appears on the document for review when it is ready. Nothing is published.",
        action: { label: "Open document", onClick: () => navigate(`/docs/${chosen.documentId}`) },
      })
      onOpenChange(false)
    } catch (err) {
      toast.error(errorText(err, "The Proposed revision could not be started."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Prepare a revision</DialogTitle>
          <DialogDescription>
            Which document should change? The AI drafts a new version with the change shown before and
            after. It goes through normal review: nothing is published until an Engineer signs it off.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2" role="radiogroup" aria-label="Document to revise">
          {sides.map((s) => (
            <SideOption
              key={s.documentId}
              side={s}
              selected={pick === s.documentId}
              onSelect={() => setPick(s.documentId)}
            />
          ))}
          {!firstRevisable && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              Neither side can be revised here. Replace the supplier PDF with a newer one from the
              supplier, or dismiss the Finding with a reason.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy || !chosen || chosen.wrapped}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
            Prepare revision{chosen ? ` of ${chosen.namingCode}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SideOption({
  side,
  selected,
  onSelect,
}: {
  side: FindingSide
  selected: boolean
  onSelect: () => void
}) {
  const disabled = side.wrapped || !side.exists
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        selected && !disabled ? "border-primary bg-primary/5" : "hover:bg-muted/50",
        disabled && "cursor-not-allowed opacity-70 hover:bg-transparent",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          selected && !disabled ? "border-primary" : "border-muted-foreground/40",
        )}
      >
        {selected && !disabled && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-mono text-xs font-semibold">{side.namingCode}</span>
          <span className="text-[11px] text-muted-foreground">v{side.version}</span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">{side.title}</span>
        <span className="mt-1 block text-xs italic text-foreground/80">"{side.quote}"</span>
        {side.wrapped && (
          <span className="mt-1 block text-[11px] text-muted-foreground">
            A supplier manual is never edited, only replaced by a newer PDF. Revise the other document,
            or replace the PDF.
          </span>
        )}
        {!side.wrapped && side.revisionInProgress && (
          <span className="mt-1 block text-[11px] text-amber-700 dark:text-amber-400">
            A revision of this document is already in progress.
          </span>
        )}
      </span>
    </button>
  )
}
