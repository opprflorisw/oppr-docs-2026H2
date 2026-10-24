// Replaces the old window.confirm() popup. The body explicitly names the
// scope that stays selected so the operator isn't surprised when their next
// question runs in the same context.

import { Trash2 } from "lucide-react"
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
import { useScopeLabel } from "./ScopeChip"
import type { AskPanelScope } from "./AskPanel"

interface ClearChatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  scope: AskPanelScope
  /** Number of messages that will be removed. Default 0. */
  messageCount?: number
}

export function ClearChatDialog({
  open,
  onOpenChange,
  onConfirm,
  scope,
  messageCount = 0,
}: ClearChatDialogProps) {
  const label = useScopeLabel(scope)
  const scopeLine =
    label.code && label.title
      ? `${label.kindLabel} · ${label.code} · ${label.title}`
      : label.title
        ? `${label.kindLabel} · ${label.title}`
        : label.kindLabel

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Trash2 className="h-5 w-5" />
          </div>
          <AlertDialogTitle className="text-center">
            Clear this conversation?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            {messageCount > 0 ? (
              <>
                <strong>{messageCount}</strong> message{messageCount === 1 ? "" : "s"} will
                be removed.
              </>
            ) : (
              <>All messages in this chat will be removed.</>
            )}{" "}
            The current scope,{" "}
            <span className="font-medium text-foreground">{scopeLine}</span>, stays
            selected, so your next question runs in the same context.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Clear messages
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
