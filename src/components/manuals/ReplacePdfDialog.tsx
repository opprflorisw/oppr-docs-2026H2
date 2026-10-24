// "Never edited, only replaced" (CONTEXT.md: Wrapped manual). A newer
// supplier PDF either starts the next version (when the manual is Published)
// or replaces the PDF of the version being worked on.

import { useState } from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { Loader2, Replace } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Doc } from "../../../convex/_generated/dataModel"
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
import { PdfDropZone } from "./PdfDropZone"
import { useUploadPdf, type ReadPdf } from "./readPdf"

export function ReplacePdfDialog({
  doc,
  open,
  onOpenChange,
  onReplaced,
}: {
  doc: Doc<"documents">
  open: boolean
  onOpenChange: (open: boolean) => void
  onReplaced?: (result: { version: number; forked: boolean }) => void
}) {
  const replacePdf = useMutation(api.manuals.replacePdf)
  const upload = useUploadPdf()
  const [pdf, setPdf] = useState<ReadPdf | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  const forks = doc.status === "published"
  const reviewed = doc.status === "in_review" || doc.status === "approved"
  const next = doc.currentVersion + 1

  function close(nextOpen: boolean) {
    if (busy) return
    if (!nextOpen) {
      setPdf(null)
      setNote("")
    }
    onOpenChange(nextOpen)
  }

  async function submit() {
    if (!pdf) return
    setBusy(true)
    try {
      const storageId = await upload(pdf)
      const res = await replacePdf({
        documentId: doc._id,
        storageId,
        filename: pdf.file.name,
        pageTexts: pdf.pageTexts,
        changeNote: note.trim() || undefined,
      })
      toast.success(
        res.forked
          ? `Started v${res.version} with the new PDF`
          : `PDF of v${res.version} replaced`,
        { description: "Oppr is stamping every page of the new file." },
      )
      setPdf(null)
      setNote("")
      onOpenChange(false)
      onReplaced?.(res)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not replace the PDF")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Replace className="h-4 w-4 text-primary" />
            Replace the supplier PDF
          </DialogTitle>
          <DialogDescription className="text-xs">
            {forks
              ? `The new file starts v${next} as a draft. v${doc.liveVersion ?? doc.currentVersion} stays in use on the floor until v${next} is reviewed, approved and Published.`
              : `The new file replaces the PDF of v${doc.currentVersion}.${reviewed ? " Review and approval start again, because the content changed." : ""} The naming code stays ${doc.namingCode}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <PdfDropZone value={pdf} onChange={setPdf} disabled={busy} compact />
          <div className="space-y-1">
            <Label htmlFor="replace-note" className="text-xs font-medium">
              What changed <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="replace-note"
              rows={2}
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Edition 04/2026 from the supplier: new torque table in chapter 4"
            />
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => close(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!pdf || busy} onClick={() => void submit()}>
            {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            {busy ? "Replacing…" : forks ? `Start v${next} with this PDF` : "Replace PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
