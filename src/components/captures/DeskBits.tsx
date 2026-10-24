import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"
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
import { CheckInChip } from "@/components/people/CheckInChip"

/** Desktop empty state when nobody (or the wrong kind of person) is checked in. */
export function DeskNotice({ title, children, checkIn = false }: { title: string; children?: ReactNode; checkIn?: boolean }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border bg-card p-6 text-center">
      <p className="text-base font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
      {checkIn && (
        <div className="mt-4 flex justify-center">
          <CheckInChip />
        </div>
      )}
    </div>
  )
}

/** Confirmation for deleting something, naming the object. */
export function ConfirmDelete({
  open,
  onOpenChange,
  title,
  description,
  action,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description: ReactNode
  action: string
  busy?: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
