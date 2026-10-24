import { ChevronLeft } from "lucide-react"
import { useLocation } from "wouter"
import type { ReactNode } from "react"
import { MobileCheckInButton } from "./MobileCheckIn"

interface MobileHeaderProps {
  /**
   * Where the back button navigates. Defaults to /m. Set to `null` to hide
   * the back button entirely (top-level pages).
   */
  backTo?: string | null
  /** Optional explicit onClick override (e.g. open a parent picker). */
  onBack?: () => void
  title: string
  subtitle?: string
  /** Optional right-aligned action slot — typically a search/menu icon. */
  right?: ReactNode
  /** Show the check-in control (Anonymous or the checked-in person). Default on. */
  checkIn?: boolean
}

/**
 * Sticky top header for mobile sub-pages. Renders a 44px-tall back button,
 * the title, an optional subtitle, an optional right slot and the
 * check-in control.
 */
export function MobileHeader({
  backTo = "/m",
  onBack,
  title,
  subtitle,
  right,
  checkIn = true,
}: MobileHeaderProps) {
  const [, navigate] = useLocation()
  const showBack = onBack != null || backTo !== null

  return (
    <header className="sticky top-0 z-10 flex items-center gap-1.5 border-b bg-background/95 px-2 py-2 backdrop-blur">
      {showBack ? (
        <button
          type="button"
          onClick={() => {
            if (onBack) {
              onBack()
              return
            }
            if (backTo) navigate(backTo)
          }}
          aria-label="Back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground transition hover:bg-muted active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : (
        <div className="h-9 w-1.5 shrink-0" />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="truncate text-[13px] font-semibold leading-tight text-foreground">
          {title}
        </div>
        {subtitle && (
          <div className="truncate text-[10px] text-muted-foreground">
            {subtitle}
          </div>
        )}
      </div>
      {right || checkIn ? (
        <div className="flex shrink-0 items-center gap-0.5">
          {right}
          {checkIn && <MobileCheckInButton />}
        </div>
      ) : null}
    </header>
  )
}
