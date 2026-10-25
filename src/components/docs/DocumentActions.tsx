// Document control actions shared by every list of documents (Documents,
// Assets, an Asset page): open, copy the ID, withdraw with a reason, and the
// rare permanent delete of a draft that was never Published.
//
// Withdrawing and deleting are sign-offs: a checked-in Engineer acts, and the
// server checks it again (convex/documents.ts archive, remove).

import { useMemo, useState } from "react"
import { useLocation } from "wouter"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { Archive, Loader2 } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCheckIn } from "@/lib/checkIn"
import type { Doc } from "@/types"
import type { DocumentRowAction } from "./DocumentLibraryTable"
import { DeleteDocumentDialog } from "./DeleteDocumentDialog"
import { isEngineerOrAdmin } from "@/lib/roles"

function errorText(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "data" in err && typeof (err as { data: unknown }).data === "string")
    return (err as { data: string }).data
  if (err instanceof Error) {
    // Convex wraps server errors: keep only the sentence meant for people.
    const m = err.message.match(/(?:Uncaught (?:Convex)?Error: )([^\n]+)/)
    return m ? m[1] : err.message
  }
  return fallback
}

const NONE = "__none__"

/** "Withdraw <code>?" with a required reason and an optional replacement. */
export function WithdrawDocumentDialog({
  doc,
  open,
  onOpenChange,
  onDone,
}: {
  doc: { id: string; naming_code: string; title: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: () => void
}) {
  const { person } = useCheckIn()
  const engineer = isEngineerOrAdmin(person) ? person : null
  const archive = useMutation(api.documents.archive)
  const docs = useQuery(api.documents.list, open ? { publishedOnly: true } : "skip")
  const [reason, setReason] = useState("")
  const [replacedBy, setReplacedBy] = useState<string>(NONE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const candidates = useMemo(
    () => (docs ?? []).filter((d) => d._id !== doc?.id).sort((a, b) => a.namingCode.localeCompare(b.namingCode)),
    [docs, doc?.id],
  )

  function close(o: boolean) {
    if (busy) return
    if (!o) {
      setReason("")
      setReplacedBy(NONE)
      setError(null)
    }
    onOpenChange(o)
  }

  async function submit() {
    if (!doc || !engineer) return
    setBusy(true)
    setError(null)
    try {
      await archive({
        id: doc.id as Id<"documents">,
        personId: engineer._id,
        reason: reason.trim(),
        replacedById: replacedBy === NONE ? null : (replacedBy as Id<"documents">),
      })
      toast.success(`${doc.naming_code} is withdrawn`)
      onDone?.()
      close(false)
    } catch (err) {
      setError(errorText(err, "The document could not be withdrawn."))
    } finally {
      setBusy(false)
    }
  }

  const blocked = !engineer ? "Check in as an Engineer to withdraw a document." : !reason.trim() ? "Write why it is withdrawn." : null

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Withdraw {doc?.naming_code}?</DialogTitle>
          <DialogDescription>
            {doc?.title}. A withdrawn document stays on record with its history, but it is no longer
            Knowledge: Operators, Ask and Wikis stop using it, and Trainings built on it go back to review.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="withdraw-reason">Why is it withdrawn?</Label>
            <Textarea
              id="withdraw-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example: the line was rebuilt and this procedure no longer applies."
              rows={3}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Replaced by (optional)</Label>
            <Select value={replacedBy} onValueChange={setReplacedBy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nothing replaces it</SelectItem>
                {candidates.map((d) => (
                  <SelectItem key={d._id} value={d._id}>
                    <span className="font-mono">{d.namingCode}</span> · {d.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="items-center gap-2">
          {blocked && <span className="mr-auto text-xs text-muted-foreground">{blocked}</span>}
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || blocked != null}>
            {busy ? <Loader2 className="animate-spin" /> : <Archive />}
            Withdraw
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Row actions for a document table plus the dialogs they open. Render
 * `dialogs` once next to the table.
 */
export function useDocumentRowActions() {
  const [, navigate] = useLocation()
  const { person } = useCheckIn()
  const engineer = isEngineerOrAdmin(person) ? person : null
  const remove = useMutation(api.documents.remove)
  const [toWithdraw, setToWithdraw] = useState<Doc | null>(null)
  const [toDelete, setToDelete] = useState<Doc | null>(null)
  const [deleting, setDeleting] = useState(false)

  function handleAction(action: DocumentRowAction, doc: Doc) {
    if (action === "open") navigate(`/docs/${doc.id}`)
    else if (action === "copy-id")
      navigator.clipboard
        .writeText(doc.naming_code)
        .then(() => toast.success(`Copied ${doc.naming_code}`))
        .catch(() => toast.error("Copying is blocked in this browser"))
    else if (action === "archive") setToWithdraw(doc)
    else if (action === "delete") setToDelete(doc)
  }

  async function confirmDelete() {
    if (!toDelete || !engineer) return
    setDeleting(true)
    try {
      await remove({ id: toDelete.id as Id<"documents">, personId: engineer._id })
      toast.success(`Deleted ${toDelete.naming_code}`)
      setToDelete(null)
    } catch (err) {
      toast.error(errorText(err, "The document could not be deleted."))
    } finally {
      setDeleting(false)
    }
  }

  const dialogs = (
    <>
      <WithdrawDocumentDialog doc={toWithdraw} open={!!toWithdraw} onOpenChange={(o) => !o && setToWithdraw(null)} />
      <DeleteDocumentDialog
        doc={toDelete}
        open={!!toDelete}
        onOpenChange={(o) => !o && !deleting && setToDelete(null)}
        onConfirmDelete={() => void confirmDelete()}
        busy={deleting}
      />
    </>
  )

  return { handleAction, dialogs, isEngineer: engineer != null }
}
