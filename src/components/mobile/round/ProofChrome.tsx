// Chrome for the proof flows on the phone (Attempt, Round, Try-out): a header
// with a close X instead of Back, a sticky bottom action bar that clears the
// safe area, and a bottom sheet that stays inside the phone column.

import { useEffect, type ReactNode } from "react"
import { MoreHorizontal, X } from "lucide-react"
import { cn } from "@/lib/utils"

export function ProofHeader({
  title,
  subtitle,
  onClose,
  onMenu,
  menuLabel = "More",
}: {
  title: string
  subtitle?: ReactNode
  onClose: () => void
  onMenu?: () => void
  menuLabel?: string
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-1 border-b bg-background/95 px-1.5 pb-1.5 pt-[max(6px,var(--sat,env(safe-area-inset-top)))] backdrop-blur">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-foreground transition active:scale-95 active:bg-muted"
      >
        <X className="h-6 w-6" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="truncate text-base font-semibold leading-tight" data-proof-title>
          {title}
        </div>
        {subtitle && (
          <div className="truncate text-[13px] text-muted-foreground" data-proof-subtitle>
            {subtitle}
          </div>
        )}
      </div>
      {onMenu && (
        <button
          type="button"
          onClick={onMenu}
          aria-label={menuLabel}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-foreground transition active:scale-95 active:bg-muted"
        >
          <MoreHorizontal className="h-6 w-6" />
        </button>
      )}
    </header>
  )
}

/**
 * The bottom action bar. Sticky at the bottom of the app's scroller, so it
 * sits at the bottom of a short screen and stays in view on a long one. Put
 * it as the last child of a `flex min-h-full flex-col` page.
 */
export function StickyBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-sticky-bar
      className={cn(
        "sticky bottom-0 z-10 mt-auto flex items-center gap-2 border-t bg-background/95 px-3 pt-2 backdrop-blur",
        "pb-[max(8px,var(--sab,env(safe-area-inset-bottom)))]",
        className,
      )}
    >
      {children}
    </div>
  )
}

/** A bottom sheet inside the phone column (it never covers the desktop around the phone preview). */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  label,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  label: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="absolute inset-0 z-[70] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 animate-in fade-in-0" />
      <div className="relative flex max-h-[85%] flex-col rounded-t-2xl bg-background shadow-xl animate-in slide-in-from-bottom-8 duration-200">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
        {title && <div className="px-4 pb-1 pt-3 text-base font-semibold">{title}</div>}
        <div className="min-h-0 overflow-y-auto px-4 pb-[max(16px,var(--sab,env(safe-area-inset-bottom)))] pt-2">
          {children}
        </div>
      </div>
    </div>
  )
}

/** A full-width sheet action: 52px tall. */
export function SheetButton({
  children,
  onClick,
  tone = "default",
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  tone?: "default" | "primary" | "danger"
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-[52px] w-full items-center justify-center gap-2 rounded-xl text-base font-semibold transition active:scale-[0.99] disabled:opacity-50",
        tone === "primary" && "bg-primary text-primary-foreground",
        tone === "danger" && "border border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300",
        tone === "default" && "border bg-background",
      )}
    >
      {children}
    </button>
  )
}

/** Short buzz for a wrong scan, where the phone supports it. */
export function buzz(ms = 80) {
  try {
    // Browsers only allow it after the person has touched the page.
    const active = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? true
    if (typeof navigator !== "undefined" && "vibrate" in navigator && active) navigator.vibrate(ms)
  } catch {
    // Vibration is a nicety.
  }
}
