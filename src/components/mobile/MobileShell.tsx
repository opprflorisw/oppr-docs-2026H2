import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Link, useLocation, useSearch } from "wouter"
import { CircleDot, Home, MessageSquare, Search, UserRound, WifiOff, X } from "lucide-react"
import { toast } from "sonner"
import { useConvex } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Toaster } from "@/components/ui/sonner"
import { CaptureRunningPill } from "@/components/captures/CaptureRunningPill"
import { useActiveCapture, useCaptureClock } from "@/components/captures/useCapture"
import { formatClock } from "@/components/captures/captureUi"
import { initials, useCheckIn, type Person } from "@/lib/checkIn"
import { useCheckInIdleMinutes, useIdleCheckOut } from "@/lib/checkInIdle"
import { useNavStack, isRootPath, type NavStack } from "@/lib/navStack"
import { cn } from "@/lib/utils"
import { useOnline } from "./use-mobile-prefs"
import { MobileCheckInSheet, MobileCheckOutSheet, MobileConfirmPersonSheet } from "./MobileCheckIn"

const HINT_KEY = "oppr-docs:mobile-hint-seen"

// Routes where the tab bar is hidden so the person can focus. Proof flows
// (Attempt, Round, Try-out) and the document reader.
const NAV_HIDDEN_PATTERNS: RegExp[] = [
  /^\/m\/docs\/[^/]+$/,
  /^\/m\/round\/[^/]+$/,
  /^\/m\/attempt\/[^/]+$/,
  /^\/m\/tryout\/[^/]+$/,
]

const PROOF_RE = /^\/m\/(attempt|round|tryout)\/([^/]+)$/

function shouldHideNav(pathname: string, search: string): boolean {
  if (NAV_HIDDEN_PATTERNS.some((re) => re.test(pathname))) return true
  // Ask about one Asset or document is a focused chat, reached from that page.
  const scope = new URLSearchParams(search).get("scope")
  if (pathname === "/m/ask" && scope && scope !== "library") return true
  return false
}

export interface CheckInRequest {
  /** Shown as the sheet title, e.g. "Check in to walk this Round". */
  reason?: string
  /** Runs right after the person picked their name. */
  onDone?: (personId: Person["_id"]) => void
}

interface MobileShellState {
  navVisible: boolean
  /** Opens the "Who are you?" check-in sheet. */
  openCheckIn: () => void
  /** Opens the check-in sheet with a reason, and continues after it. */
  requestCheckIn: (req: CheckInRequest) => void
  /**
   * For anything that produces proof: asks "Start as <name>?" when someone is
   * checked in (with "Not you?"), or the check-in sheet when nobody is. Then
   * runs `go` with the person. `action` reads like "Walk this Round".
   */
  withPerson: (action: string, go: (personId: Person["_id"]) => void) => void
  /** After an Attempt, Round or Try-out ends: "Done, <name>. Check out?" */
  offerCheckOut: () => void
  /** True inside a phone frame on the desktop (phone preview, Floor simulator). */
  embedded: boolean
  /** The app column: portal overlays here so they stay inside the phone. */
  container: HTMLElement | null
  nav: NavStack | null
}

const MobileShellCtx = createContext<MobileShellState>({
  navVisible: true,
  openCheckIn: () => {},
  requestCheckIn: () => {},
  withPerson: () => {},
  offerCheckOut: () => {},
  embedded: false,
  container: null,
  nav: null,
})

export function useMobileShell(): MobileShellState {
  return useContext(MobileShellCtx)
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

/**
 * The mobile app frame. On a real phone it fills the viewport (100dvh).
 * `embedded` (the phone preview and the Floor simulator) fills its parent
 * instead and skips the "resize this window" hint.
 */
const CONFIRM_FRESH_MS = 10 * 60 * 1000

export function MobileShell({ children, embedded = false }: { children: ReactNode; embedded?: boolean }) {
  const [location, navigate] = useLocation()
  const search = useSearch()
  const fullPath = search ? `${location}?${search}` : location
  const nav = useNavStack(fullPath, navigate)
  const { person, checkOut } = useCheckIn()
  const online = useOnline()

  const [showHint, setShowHint] = useState(false)
  const [checkIn, setCheckIn] = useState<CheckInRequest | null>(null)
  const [confirm, setConfirm] = useState<{ action: string; go: (id: Person["_id"]) => void } | null>(null)
  const [checkOutOpen, setCheckOutOpen] = useState(false)
  const [column, setColumn] = useState<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const navVisible = !shouldHideNav(location, search)

  const openCheckIn = useCallback(() => setCheckIn({}), [])
  const requestCheckIn = useCallback((req: CheckInRequest) => setCheckIn(req), [])
  const personRef = useRef(person)
  personRef.current = person
  // On a shared phone we ask "Is this you?" before recording proof, but not
  // again for every Training the same person starts within a few minutes.
  const confirmedRef = useRef<{ id: Person["_id"]; at: number } | null>(null)
  const withPerson = useCallback((action: string, go: (id: Person["_id"]) => void) => {
    const current = personRef.current
    const recent = confirmedRef.current
    if (current && recent?.id === current._id && Date.now() - recent.at < CONFIRM_FRESH_MS) go(current._id)
    else if (current) setConfirm({ action, go })
    else setCheckIn({ reason: `Check in to ${lowerFirst(action)}`, onDone: go })
  }, [])
  const offerCheckOut = useCallback(() => {
    if (personRef.current) setCheckOutOpen(true)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || embedded) return
    let seen: string | null = null
    try {
      seen = localStorage.getItem(HINT_KEY)
    } catch {
      seen = "1"
    }
    if (!seen && window.innerWidth > 500) setShowHint(true)
  }, [embedded])

  function dismissHint() {
    try {
      localStorage.setItem(HINT_KEY, "1")
    } catch {
      // ignore
    }
    setShowHint(false)
  }

  // Remember where each page was scrolled, and restore it on Back.
  const pathRef = useRef(fullPath)
  pathRef.current = fullPath
  const rememberScroll = nav.rememberScroll
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => rememberScroll(pathRef.current, el.scrollTop)
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [rememberScroll])
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (nav.direction === "none") return
    const target = nav.direction === "pop" ? (nav.scrollFor(pathRef.current) ?? 0) : 0
    el.scrollTop = target
    if (target === 0) return
    // Content may still be loading: try again while the page grows.
    let tries = 0
    const t = window.setInterval(() => {
      tries += 1
      el.scrollTop = target
      if (Math.abs(el.scrollTop - target) < 2 || tries > 20) window.clearInterval(t)
    }, 60)
    return () => window.clearInterval(t)
    // Only when the page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.entries])

  // Page transitions: a short slide in from the right on push, from the left
  // on Back. Pages stay direct children of the scroller (their min-h-full
  // and sticky bars depend on it), so the animation runs on the element.
  useEffect(() => {
    const page = scrollRef.current?.firstElementChild as HTMLElement | null
    if (!page || nav.direction === "none" || typeof page.animate !== "function") return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const dx = nav.direction === "push" ? 32 : -32
    page.animate(
      [
        { transform: `translateX(${dx}px)`, opacity: 0.4 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      { duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    )
  }, [nav.entries, nav.direction])

  // Leaving a finished Attempt, Round or Try-out on a shared phone: offer
  // "Done, <name>. Check out?" (only right after it ended, not for an old
  // record opened from Me).
  const convex = useConvex()
  const prevPath = useRef(location)
  useEffect(() => {
    const prev = prevPath.current
    prevPath.current = location
    if (prev === location || !personRef.current) return
    if (PROOF_RE.test(location)) return
    const m = prev.match(PROOF_RE)
    if (!m) return
    let cancelled = false
    void (async () => {
      try {
        let endedAt: number | null = null
        if (m[1] === "tryout") {
          const r = (await convex.query(api.tryOuts.get, { requestId: m[2] as Id<"tryOutRequests"> })) as {
            status?: string
            doneAt?: number | null
          } | null
          if (r?.status === "done") endedAt = r.doneAt ?? Date.now()
        } else {
          const a = (await convex.query(api.attempts.get, { id: m[2] as Id<"trainingAttempts"> })) as {
            status?: string
            finishedAt?: number | null
          } | null
          if (a && (a.status === "passed" || a.status === "failed")) endedAt = a.finishedAt ?? Date.now()
        }
        if (!cancelled && endedAt != null && Date.now() - endedAt < 10 * 60 * 1000) setCheckOutOpen(true)
      } catch {
        // Not found or not allowed: nothing to offer.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [location, convex])

  // A shared phone: check out after the check-in timeout (Settings, Floor) without a touch.
  const idleMinutes = useCheckInIdleMinutes()
  const idleToast = useRef<string | number | null>(null)
  useIdleCheckOut({
    root: column,
    active: !!person,
    onWarn: () => {
      idleToast.current = toast(`Still there, ${person?.name.split(" ")[0] ?? ""}?`, {
        description: "This phone checks out in 10 seconds.",
        duration: 10_000,
        action: { label: "I'm still here", onClick: () => {} },
      })
    },
    onResume: () => {
      if (idleToast.current != null) toast.dismiss(idleToast.current)
      idleToast.current = null
    },
    onExpire: () => {
      idleToast.current = null
      checkOut()
      toast("Checked out", { description: `Nobody touched the phone for ${idleMinutes} minute${idleMinutes === 1 ? "" : "s"}.` })
    },
  })

  const ctx = useMemo<MobileShellState>(
    () => ({
      navVisible,
      openCheckIn,
      requestCheckIn,
      withPerson,
      offerCheckOut,
      embedded,
      container: column,
      nav,
    }),
    [navVisible, openCheckIn, requestCheckIn, withPerson, offerCheckOut, embedded, column, nav],
  )


  return (
    <MobileShellCtx.Provider value={ctx}>
      {/* 100dvh keeps the shell exactly viewport-height so the inner scroller
          contains the content and the tab bar stays pinned (dvh follows the
          iOS address bar). */}
      <div className={cn("flex w-full justify-center", embedded ? "h-full bg-background" : "h-[100dvh] bg-muted/40")}>
        <div
          ref={setColumn}
          data-mobile-shell
          className={cn(
            "relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground",
            !embedded && "max-w-[430px] shadow-xl",
          )}
        >
          {showHint && (
            <div className="absolute inset-x-0 top-0 z-50 mx-3 mt-3 rounded-xl border border-primary/30 bg-card p-3 text-sm shadow-md">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <div className="font-semibold text-foreground">Resize this window</div>
                  <div className="mt-1 text-muted-foreground">
                    Drag this browser window to roughly phone size (390 by 844) to feel the floor app as it is in hand.
                    Or open it with the Phone button on the desktop.
                  </div>
                </div>
                <button
                  onClick={dismissHint}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {!online && (
            <div
              className="flex shrink-0 items-center justify-center gap-1.5 bg-amber-500/15 px-3 pb-1.5 text-[13px] font-medium text-amber-900 dark:text-amber-200"
              style={{ paddingTop: "max(6px, var(--sat, env(safe-area-inset-top, 0px)))" }}
            >
              <WifiOff className="h-4 w-4" />
              Offline: what you opened before still works
            </div>
          )}

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {children}
          </div>

          {/* A running Capture shows on every page, docked above the tab bar
              (never over the content). */}
          <div className="relative z-30 shrink-0 empty:hidden">
            <CaptureRunningPill />
          </div>

          {navVisible && <TabBar location={location} person={person} />}

          {checkIn && (
            <MobileCheckInSheet
              reason={checkIn.reason}
              deviceKey={embedded ? "phone" : "main"}
              onClose={() => setCheckIn(null)}
              onPicked={(id) => {
                const done = checkIn.onDone
                setCheckIn(null)
                confirmedRef.current = { id, at: Date.now() }
                done?.(id)
              }}
            />
          )}
          {confirm && person && (
            <MobileConfirmPersonSheet
              person={person}
              action={confirm.action}
              onClose={() => setConfirm(null)}
              onConfirm={() => {
                const go = confirm.go
                setConfirm(null)
                confirmedRef.current = { id: person._id, at: Date.now() }
                go(person._id)
              }}
              onNotYou={() => {
                const { go, action } = confirm
                setConfirm(null)
                setCheckIn({ reason: `Check in to ${lowerFirst(action)}`, onDone: go })
              }}
            />
          )}
          {checkOutOpen && person && (
            <MobileCheckOutSheet
              person={person}
              onClose={() => setCheckOutOpen(false)}
              onCheckOut={() => {
                setCheckOutOpen(false)
                checkOut()
                navigate("/m")
              }}
            />
          )}

          {/* On a real phone the toasts live in the app, top centre, clear of
              the tab bar. In a desktop phone frame the desktop toaster shows them. */}
          {!embedded && <Toaster richColors position="top-center" offset={12} />}
        </div>
      </div>
    </MobileShellCtx.Provider>
  )
}

// ---- Tab bar ------------------------------------------------------------------

type Tab = {
  to: string
  label: string
  icon: typeof Home
  match: (path: string) => boolean
}

const TABS: Tab[] = [
  { to: "/m", label: "Home", icon: Home, match: (p) => p === "/m" },
  {
    to: "/m/find",
    label: "Find",
    icon: Search,
    match: (p) => /^\/m\/(find|assets|docs|scan|wiki)(\/|$)/.test(p),
  },
  { to: "/m/capture", label: "Capture", icon: CircleDot, match: (p) => /^\/m\/capture(\/|$)/.test(p) },
  { to: "/m/ask", label: "Ask", icon: MessageSquare, match: (p) => p === "/m/ask" },
  { to: "/m/me", label: "Me", icon: UserRound, match: (p) => /^\/m\/me(\/|$)/.test(p) },
]

function TabBar({ location, person }: { location: string; person: Person | null }) {
  return (
    <nav
      data-testid="mobile-tabbar"
      aria-label="Main"
      className="relative z-20 grid shrink-0 grid-cols-5 border-t bg-background/95 px-1 pt-1 backdrop-blur"
      style={{ paddingBottom: "max(6px, var(--sab, env(safe-area-inset-bottom, 0px)))" }}
    >
      {TABS.map((t) =>
        t.to === "/m/capture" ? (
          <CaptureTab key={t.to} tab={t} active={t.match(location)} />
        ) : (
          <TabLink key={t.to} tab={t} active={t.match(location)} person={t.to === "/m/me" ? person : null} />
        ),
      )}
    </nav>
  )
}

function TabLink({ tab, active, person }: { tab: Tab; active: boolean; person: Person | null }) {
  const Icon = tab.icon
  return (
    <Link
      href={tab.to}
      aria-label={tab.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl text-[13px] leading-4 transition-colors",
        active ? "font-semibold text-[#6E59A5]" : "font-medium text-slate-500 dark:text-slate-400",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-14 items-center justify-center rounded-full transition-colors",
          active && "bg-[#6E59A5]/10",
        )}
      >
        {person ? (
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold",
              active ? "bg-[#6E59A5] text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100",
            )}
          >
            {initials(person.name)}
          </span>
        ) : (
          <Icon className={cn("h-6 w-6", active && "fill-[#6E59A5]/15")} strokeWidth={active ? 2.25 : 2} />
        )}
      </span>
      {tab.label}
    </Link>
  )
}

/**
 * The centre tab: a filled pill, flush with the bar so it never crowds a
 * page's own bottom action. Red with the clock while a Capture records.
 */
function CaptureTab({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon
  const { active: capture } = useActiveCapture()
  const { ms, paused } = useCaptureClock(capture ?? null)
  const recording = !!capture
  return (
    <Link
      href={tab.to}
      aria-label={recording ? `Capture ${paused ? "paused" : "running"} ${formatClock(ms)}` : tab.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[13px] leading-4",
        recording
          ? "font-semibold text-red-700 dark:text-red-400"
          : active
            ? "font-semibold text-[#6E59A5]"
            : "font-medium text-slate-500 dark:text-slate-400",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-14 items-center justify-center rounded-full text-white shadow-sm transition active:scale-95",
          recording ? (paused ? "bg-slate-700" : "bg-red-600") : "bg-[#6E59A5]",
        )}
      >
        <Icon className={cn("h-6 w-6", recording && !paused && "motion-safe:animate-pulse")} strokeWidth={2.25} />
      </span>
      <span className="tabular-nums">{recording ? formatClock(ms) : tab.label}</span>
    </Link>
  )
}

/** True when the current page is a root tab (no Back). */
export function useIsRootPage(): boolean {
  const [location] = useLocation()
  return isRootPath(location)
}
