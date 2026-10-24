import { useEffect, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useMobileShell } from "@/components/mobile/MobileShell"
import { X } from "lucide-react"

/**
 * A bottom sheet that stays inside the phone app column, so it also fits the
 * phone preview and the Floor simulator's phone (a Radix dialog would cover
 * the whole desktop page).
 */
export function PhoneSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  label,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  label?: string
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [open, onClose])

  const { container } = useMobileShell()
  if (!open) return null
  const sheet = (
    <div className="absolute inset-0 z-[65] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={label ?? title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 animate-in fade-in-0" />
      <div className="relative flex max-h-[88%] flex-col rounded-t-2xl bg-background shadow-xl animate-in slide-in-from-bottom-8 duration-200">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <div className="flex items-start gap-2 px-4 pb-2 pt-2">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold leading-tight">{title}</p>
            {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children && <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">{children}</div>}
        {footer && <div className="border-t px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">{footer}</div>}
      </div>
    </div>
  )
  return container ? createPortal(sheet, container) : sheet
}
