import { ChevronLeft } from "lucide-react"
import { useLocation } from "wouter"
import type { ReactNode } from "react"
import { isRootPath } from "@/lib/navStack"
import { MobileCheckInButton } from "./MobileCheckIn"
import { useMobileShell } from "./MobileShell"

interface MobileHeaderProps {
  /**
   * The static parent, used for Back only on a deep link (nothing to go back
   * to in this app's history). Set to `null` to hide Back entirely.
   */
  backTo?: string | null
  /** Optional explicit onClick override (e.g. leave a proof flow). */
  onBack?: () => void
  title: string
  subtitle?: ReactNode
  /** Optional right-aligned action slot. */
  right?: ReactNode
  /** Show the check-in control (Anonymous or the checked-in person). Default on. */
  checkIn?: boolean
  /** A large title for root tabs (22px), instead of the compact one. */
  large?: boolean
}

/**
 * Sticky top header of a phone page. Back follows the app's history; root
 * tabs show no Back. Respects the top safe area.
 */
export function MobileHeader({
  backTo = "/m",
  onBack,
  title,
  subtitle,
  right,
  checkIn = true,
  large = false,
}: MobileHeaderProps) {
  const [location, navigate] = useLocation()
  const { nav } = useMobileShell()
  const root = isRootPath(location)
  const showBack = onBack != null || (backTo !== null && !root)

  function goBack() {
    if (onBack) {
      onBack()
      return
    }
    if (nav?.back()) return
    if (backTo) navigate(backTo, { replace: true })
  }

  return (
    <header
      className="sticky top-0 z-10 border-b bg-background/95 px-2 pb-2 backdrop-blur"
      style={{ paddingTop: "max(8px, var(--sat, env(safe-area-inset-top, 0px)))" }}
    >
      <div className="flex min-h-11 items-center gap-1">
        {showBack ? (
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground transition active:scale-95 [@media(hover:hover)]:hover:bg-muted"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : (
          <div className="w-2 shrink-0" />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <h1
            className={
              large
                ? "truncate text-[22px] font-bold leading-tight tracking-tight text-foreground"
                : "truncate text-[17px] font-semibold leading-tight text-foreground"
            }
          >
            {title}
          </h1>
          {subtitle && <div className="truncate text-[13px] text-muted-foreground">{subtitle}</div>}
        </div>
        {right || checkIn ? (
          <div className="flex shrink-0 items-center gap-0.5">
            {right}
            {checkIn && <MobileCheckInButton />}
          </div>
        ) : null}
      </div>
    </header>
  )
}
