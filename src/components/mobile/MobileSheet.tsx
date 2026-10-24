import { useEffect, type ReactNode } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * A bottom sheet that lives inside the phone app column (absolute, not a
 * portal to document.body), so in the desktop phone preview it stays inside
 * the phone frame. Escape and a tap on the backdrop close it.
 */
export function MobileSheet({
  title,
  description,
  onClose,
  children,
  footer,
  className,
  label,
}: {
  title?: ReactNode
  description?: ReactNode
  onClose: () => void
  children?: ReactNode
  /** Sticky actions at the bottom, above the safe area. */
  footer?: ReactNode
  className?: string
  /** Accessible name when there is no visible title. */
  label?: string
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [onClose])

  return (
    <div
      className="absolute inset-0 z-[70] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={label ?? (typeof title === "string" ? title : undefined)}
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 motion-safe:animate-in motion-safe:fade-in-0"
      />
      <div
        className={cn(
          "relative flex max-h-[88%] flex-col rounded-t-3xl bg-background shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-bottom-8 motion-safe:duration-200",
          className,
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
        {(title || description) && (
          <div className="flex shrink-0 items-start gap-2 px-4 pb-2 pt-2">
            <div className="min-w-0 flex-1 pt-1">
              {title && <h2 className="text-lg font-semibold leading-snug">{title}</h2>}
              {description && <p className="mt-1 text-sm leading-snug text-muted-foreground">{description}</p>}
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
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2">{children}</div>
        {footer && (
          <div
            className="flex shrink-0 flex-col gap-2 border-t bg-background px-4 pt-3"
            style={{ paddingBottom: "max(12px, var(--sab, env(safe-area-inset-bottom, 0px)))" }}
          >
            {footer}
          </div>
        )}
        {!footer && <div className="shrink-0" style={{ height: "max(12px, var(--sab, env(safe-area-inset-bottom, 0px)))" }} />}
      </div>
    </div>
  )
}

/** The filled floor action: 48px tall, deep violet, full width. */
export function FloorPrimaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#6E59A5] px-4 text-base font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60 [@media(hover:hover)]:hover:bg-[#5b4892]",
        className,
      )}
    >
      {children}
    </button>
  )
}

/** The outline floor action: 48px tall, full width. */
export function FloorSecondaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border bg-background px-4 text-base font-medium text-foreground transition active:scale-[0.99] disabled:opacity-60 [@media(hover:hover)]:hover:bg-muted",
        className,
      )}
    >
      {children}
    </button>
  )
}
