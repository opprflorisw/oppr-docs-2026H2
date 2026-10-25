import { ReactNode } from "react"
import { Link, useLocation } from "wouter"
import {
  BookOpenText,
  Factory,
  FileText,
  GraduationCap,
  Home,
  Library,
  Map as MapIcon,
  Search,
  Settings,
  Smartphone,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { FloatingAskIda } from "@/components/ai/FloatingAskIda"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useCheckInReady } from "@/components/people/CheckInChip"
import { setPhoneMode } from "@/components/phone/phoneStore"
import { CommandSearch, openCommandSearch } from "./CommandSearch"
import { useIsWide } from "./PageHeader"

type NavItem = {
  label: string
  to: string
  icon: typeof FileText
  match: (path: string) => boolean
}

// Exactly six places (CONTEXT.md). Everything else is reached from one of
// these, at most one level down; anything deeper opens as a panel or dialog.
const NAV: NavItem[] = [
  { label: "Home", to: "/", icon: Home, match: (p) => p === "/" },
  {
    label: "Documents",
    to: "/library",
    icon: Library,
    // /library also covers Findings, Knowledge health, Captures and Images.
    match: (p) =>
      p.startsWith("/library") || p.startsWith("/docs") || p.startsWith("/import"),
  },
  {
    label: "Learn",
    to: "/learn",
    icon: GraduationCap,
    match: (p) => p.startsWith("/learn"),
  },
  {
    label: "Wiki",
    to: "/wiki",
    icon: BookOpenText,
    match: (p) => p.startsWith("/wiki"),
  },
  {
    label: "Plant",
    to: "/plant",
    icon: Factory,
    // Assets is a tab of Plant; /assets/:id still opens an Asset (ADR 0006).
    match: (p) => p.startsWith("/plant") || p.startsWith("/assets"),
  },
]

const SETTINGS: NavItem = {
  label: "Settings",
  to: "/settings",
  icon: Settings,
  match: (p) =>
    p === "/settings" ||
    p.startsWith("/settings/") ||
    p.startsWith("/templates") ||
    p.startsWith("/mcp") ||
    p.startsWith("/analysis"),
}

const FLOOR: NavItem = {
  label: "Floor simulator",
  to: "/floor",
  icon: MapIcon,
  match: (p) => p.startsWith("/floor"),
}

/** A label that becomes a tooltip on the icon rail. */
function RailTip({ rail, label, children }: { rail: boolean; label: string; children: ReactNode }) {
  if (!rail) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

const itemClass = (active: boolean, rail: boolean) =>
  cn(
    "flex items-center gap-3 rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
    rail ? "h-10 w-10 justify-center" : "px-3 py-2",
    active
      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
      : "text-sidebar-foreground/80 hover:bg-sidebar-border/60 hover:text-sidebar-foreground",
  )

function NavLink({ item, location, rail }: { item: NavItem; location: string; rail: boolean }) {
  const Icon = item.icon
  const active = item.match(location)
  return (
    <RailTip rail={rail} label={item.label}>
      <Link
        href={item.to}
        aria-current={active ? "page" : undefined}
        aria-label={rail ? item.label : undefined}
        className={itemClass(active, rail)}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {!rail && item.label}
      </Link>
    </RailTip>
  )
}

export function DesktopShell({
  children,
  loading = false,
}: {
  children: ReactNode
  /** Auth is still loading: show the shell with skeletons, run no queries. */
  loading?: boolean
}) {
  const [location] = useLocation()
  const rail = !useIsWide()

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen w-full bg-background">
        <a
          href="#content"
          className="sr-only z-[100] rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
          onClick={(e) => {
            // Move focus into the page without changing the address.
            e.preventDefault()
            const main = document.getElementById("content")
            main?.focus()
            main?.scrollIntoView()
          }}
        >
          Skip to content
        </a>
        <aside
          aria-label="Main navigation"
          className={cn(
            "print:hidden sticky top-0 flex h-screen shrink-0 flex-col self-start overflow-y-auto border-r bg-sidebar text-sidebar-foreground",
            rail ? "w-16 items-center" : "w-60",
          )}
        >
          <div
            className={cn(
              "flex h-14 w-full shrink-0 items-center gap-2 border-b border-sidebar-border",
              rail ? "justify-center" : "px-4",
            )}
          >
            <Link
              href="/"
              aria-label="Oppr Knowledge, Home"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"
            >
              <BookOpenText className="h-4 w-4" aria-hidden />
            </Link>
            {!rail && (
              <div className="leading-tight">
                <div className="text-sm font-semibold">Oppr Knowledge</div>
                <div className="text-xs text-sidebar-foreground/60">Internal showcase</div>
              </div>
            )}
          </div>

          <div className={cn("w-full pt-3", rail ? "flex justify-center" : "px-3")}>
            <RailTip rail={rail} label="Search (Ctrl+K)">
              <button
                type="button"
                onClick={openCommandSearch}
                disabled={loading}
                aria-label="Search (Ctrl+K)"
                aria-keyshortcuts="Control+K"
                className={cn(
                  "flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-border/30 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-border/60 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  rail ? "h-10 w-10 justify-center" : "h-9 w-full px-3",
                )}
              >
                <Search className="h-4 w-4 shrink-0" aria-hidden />
                {!rail && (
                  <>
                    <span className="flex-1 text-left">Search</span>
                    <kbd className="rounded border border-sidebar-border px-1.5 font-sans text-xs text-sidebar-foreground/60">
                      Ctrl K
                    </kbd>
                  </>
                )}
              </button>
            </RailTip>
          </div>

          <nav
            aria-label="Places"
            className={cn("flex-1 space-y-1 py-3", rail ? "flex flex-col items-center px-0" : "px-3")}
          >
            {NAV.map((item) => (
              <NavLink key={item.to} item={item} location={location} rail={rail} />
            ))}
            <NavLink item={SETTINGS} location={location} rail={rail} />
          </nav>

          <div
            role="group"
            aria-label="Try it"
            className={cn(
              "w-full space-y-1 border-t border-sidebar-border py-3",
              rail ? "flex flex-col items-center" : "px-3",
            )}
          >
            {!rail && (
              <p className="px-3 pb-1 text-xs font-medium text-sidebar-foreground/50">Try it</p>
            )}
            <NavLink item={FLOOR} location={location} rail={rail} />
            <RailTip rail={rail} label="Phone">
              <button
                type="button"
                onClick={() => setPhoneMode("popup")}
                aria-label="Open the phone preview"
                className={cn(itemClass(false, rail), !rail && "w-full")}
              >
                <Smartphone className="h-4 w-4 shrink-0" aria-hidden />
                {!rail && "Phone"}
              </button>
            </RailTip>
          </div>
        </aside>

        <main
          id="content"
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col outline-none"
        >
          {loading ? <ShellSkeleton /> : <CheckInGate>{children}</CheckInGate>}
        </main>
        {!loading && <FloatingAskIda />}
        {!loading && <CommandSearch />}
      </div>
    </TooltipProvider>
  )
}

/**
 * Holds the page as a skeleton until the stored check-in has resolved to a
 * person, so a checked-in person never sees an Anonymous state flash by.
 */
function CheckInGate({ children }: { children: ReactNode }) {
  const ready = useCheckInReady()
  return ready ? <>{children}</> : <ShellSkeleton />
}

/** The page frame while data loads: a top bar, a header and a few rows. */
export function ShellSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col">
      <div className="flex h-12 items-center justify-between border-b px-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-7 w-28 rounded-full" />
      </div>
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <Skeleton className="h-5 w-5 rounded" />
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-72" />
        </div>
      </div>
      <div className="space-y-3 p-6">
        <Skeleton className="h-9 w-80" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}
