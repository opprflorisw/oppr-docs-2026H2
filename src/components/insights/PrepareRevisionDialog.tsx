import { useState, type ReactNode } from "react"
import { useAction } from "convex/react"
import { ConvexError } from "convex/values"
import { toast } from "sonner"
import { Loader2, Sparkles } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCheckIn } from "@/lib/checkIn"
import { isEngineerOrAdmin } from "@/lib/roles"

/** The readable message of a Convex or JS error. */
export function errorText(err: unknown): string {
  if (err instanceof ConvexError) return typeof err.data === "string" ? err.data : "Something went wrong."
  if (err instanceof Error) return err.message.replace(/^.*Uncaught (?:Convex)?Error: /s, "").split("\n")[0]
  return String(err)
}

export type RevisionSource =
  | { kind: "insight" }
  | { kind: "health" }
  | { kind: "finding"; findingId: Id<"findings"> }

const FROM: Record<RevisionSource["kind"], string> = {
  insight: "what people Ask about it and where they found it unclear",
  health: "its Knowledge health signals: unanswered questions and unclear marks",
  finding: "the Finding: the passage that disagrees with, or repeats, another document",
}

/**
 * "Prepare a revision": asks the AI for a Proposed revision. The trigger is
 * rendered by the caller; this owns the confirm dialog, the Engineer check-in
 * gate and the toasts. Nothing is Published: the result is a draft version.
 */
export function PrepareRevisionDialog({
  documentId,
  namingCode,
  source,
  open,
  onOpenChange,
  onStarted,
}: {
  documentId: Id<"documents">
  namingCode: string
  source: RevisionSource
  open: boolean
  onOpenChange: (open: boolean) => void
  onStarted?: (id: Id<"proposedRevisions">) => void
}) {
  const propose = useAction(api.ai.revision.propose)
  const { person } = useCheckIn()
  const engineer = isEngineerOrAdmin(person) ? person : null
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  async function start() {
    if (!engineer) return
    setBusy(true)
    try {
      const id = await propose({
        documentId,
        source: {
          kind: source.kind,
          ...(source.kind === "finding" ? { findingId: source.findingId } : {}),
          note: [note.trim(), `Requested by ${engineer.name}`].filter(Boolean).join(". "),
        },
      })
      toast.success(`Preparing a revision of ${namingCode}. It appears on the document in about a minute.`)
      setNote("")
      onOpenChange(false)
      onStarted?.(id)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Prepare a revision of <span className="font-mono">{namingCode}</span>
          </DialogTitle>
          <DialogDescription>
            The AI reads the Published version and {FROM[source.kind]}, and proposes small edits, each
            with its before, after and reason. Code checks every number and code against the documents.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          <li>The edits become a new draft version. The Published version stays in use.</li>
          <li>The draft goes through normal review. The AI never approves or publishes.</li>
        </ul>
        <div className="space-y-1.5">
          <label htmlFor="revision-note" className="text-xs font-medium">
            Anything the AI should know <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            id="revision-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="For example: keep the torque table as it is."
            className="min-h-[64px] text-sm"
            maxLength={400}
          />
        </div>
        {!engineer && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Preparing a revision starts a new draft. Check in as an Engineer (top right) to do it.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={start} disabled={!engineer || busy} className="gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Prepare the revision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A button that opens PrepareRevisionDialog. */
export function PrepareRevisionButton({
  documentId,
  namingCode,
  source,
  children,
  className,
  variant = "outline",
}: {
  documentId: Id<"documents">
  namingCode: string
  source: RevisionSource
  children?: ReactNode
  className?: string
  variant?: "outline" | "default" | "secondary"
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant={variant} className={className ?? "h-7 gap-1.5 text-xs"} onClick={() => setOpen(true)}>
        <Sparkles className="h-3.5 w-3.5" />
        {children ?? "Prepare a revision"}
      </Button>
      <PrepareRevisionDialog
        documentId={documentId}
        namingCode={namingCode}
        source={source}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
