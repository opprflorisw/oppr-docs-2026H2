import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { Doc } from "@/types"

interface DeleteDocumentDialogProps {
  doc: Doc | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirmDelete: () => void
  busy?: boolean
}

// Permanent delete is only offered for a draft that was never Published and
// that nothing cites (the server checks both). Everything else is withdrawn.
export function DeleteDocumentDialog({
  doc,
  open,
  onOpenChange,
  onConfirmDelete,
  busy = false,
}: DeleteDocumentDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {doc?.naming_code || "this draft"} permanently?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">{doc?.title}</span>
            <span className="block">
              This draft was never Published. Deleting removes it, every version, its passages, asset
              links and any uploaded PDF. There is no undo.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              onConfirmDelete()
            }}
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy ? "Deleting..." : "Delete permanently"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
