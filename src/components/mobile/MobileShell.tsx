import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { Link, useLocation, useSearch } from "wouter"
import {
  Files,
  Home,
  MessageSquare,
  ScanLine,
  WifiOff,
  X,
  Factory,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useOnline } from "./use-mobile-prefs"
import { MobileCheckInSheet } from "./MobileCheckIn"

const HINT_KEY = "oppr-docs:mobile-hint-seen"

// Routes where the bottom nav is hidden so the operator can focus.
// Matched against the wouter `useLocation()` pathname.
const NAV_HIDDEN_PATTERNS: RegExp[] = [
  /^\/m\/docs\/[^/]+$/, // doc reader — immersive
  /^\/m\/round\/[^/]+$/, // a Round in progress: focus on the stop
]

function shouldHideNav(pathname: string, search: string): boolean {
  if (NAV_HIDDEN_PATTERNS.some((re) => re.test(pathname))) return true
  // Ask page hides the nav once a scope is selected (chat mode).
  if (pathname === "/m/ask" && new URLSearchParams(search).has("scope")) {
    return true
  }
  return false
}

interface MobileShellState {
  navVisible: boolean
  /** Opens the "Who are you?" check-in sheet. */
  openCheckIn: () => void
  /** True inside the Floor simulator's phone frame. */
  embedded: boolean
}

const MobileShellCtx = createContext<MobileShellState>({
  navVisible: true,
  openCheckIn: () => {},
  embedded: false,
})

export function useMobileShell(): MobileShellState {
  return useContext(MobileShellCtx)
}

/**
 * The mobile app frame. On a real phone it fills the viewport (100dvh).
 * `embedded` (the Floor simulator's phone) fills its parent instead and
 * skips the "resize this window" hint.
 */
export function MobileShell({
  children,
  embedded = false,
}: {
  children: ReactNode
  embedded?: boolean
}) {
  const [location] = useLocation()
  const search = useSearch()
  const [showHint, setShowHint] = useState(false)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const online = useOnline()

  const navVisible = !shouldHideNav(location, search)
  const openCheckIn = useCallback(() => setCheckInOpen(true), [])

  useEffect(() => {
    if (typeof window === "undefined" || embedded) return
    const seen = localStorage.getItem(HINT_KEY)
    if (!seen && window.innerWidth > 500) {
      setShowHint(true)
    }
  }, [embedded])

  function dismissHint() {
    localStorage.setItem(HINT_KEY, "1")
    setShowHint(false)
  }

  const ctx = useMemo<MobileShellState>(
    () => ({ navVisible, openCheckIn, embedded }),
    [navVisible, openCheckIn, embedded],
  )

  return (
    <MobileShellCtx.Provider value={ctx}>
      {/* h-[100dvh] keeps the shell exactly viewport-height so the inner
          flex-1 overflow-y-auto actually scroll-contains its content and
          the bottom nav stays pinned regardless of page length. dvh is
          the dynamic viewport unit — accounts for iOS Safari's address
          bar growing/shrinking, unlike vh. */}
      <div
        className={cn(
          "flex w-full justify-center",
          embedded ? "h-full bg-background" : "h-[100dvh] bg-muted/40",
        )}
      >
        <div
          className={cn(
            "relative flex h-full w-full flex-col bg-background",
            !embedded && "max-w-[430px] shadow-xl",
          )}
        >
          {showHint && (
            <div className="absolute inset-x-0 top-0 z-50 mx-3 mt-3 rounded-lg border border-primary/30 bg-card p-3 text-xs shadow-md">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <div className="font-semibold text-foreground">
                    Resize this window
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    Drag this browser window to roughly phone size (~390 × 844)
                    to experience the operator app as it would feel in hand.
                  </div>
                </div>
                <button
                  onClick={dismissHint}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {!online && (
            <div className="flex shrink-0 items-center justify-center gap-1.5 bg-amber-500/15 px-3 py-1.5 text-[11px] font-medium text-amber-900 dark:text-amber-200">
              <WifiOff className="h-3 w-3" />
              Offline: local data only
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

          {navVisible && (
            <nav className="grid shrink-0 grid-cols-5 border-t bg-background/95 backdrop-blur">
              <BottomLink to="/m" current={location} icon={Home} label="Home" />
              <BottomLink
                to="/m/assets"
                current={location}
                icon={Factory}
                label="Assets"
              />
              <BottomLink
                to="/m/docs"
                current={location}
                icon={Files}
                label="Docs"
              />
              <BottomLink
                to="/m/scan"
                current={location}
                icon={ScanLine}
                label="Scan"
              />
              <BottomLink
                to="/m/ask"
                current={location}
                icon={MessageSquare}
                label="Ask"
              />
            </nav>
          )}

          <MobileCheckInSheet
            open={checkInOpen}
            onClose={() => setCheckInOpen(false)}
          />
        </div>
      </div>
    </MobileShellCtx.Provider>
  )
}

function BottomLink({
  to,
  current,
  icon: Icon,
  label,
}: {
  to: string
  current: string
  icon: typeof Home
  label: string
}) {
  const active =
    to === "/m"
      ? current === "/m"
      : current === to ||
        current.startsWith(`${to}/`) ||
        current.startsWith(`${to}?`)
  return (
    <Link
      href={to}
      className={cn(
        "flex flex-col items-center gap-0.5 px-1 py-2 text-[9px] transition-colors",
        active
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  )
}
