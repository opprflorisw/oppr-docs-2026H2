import { ReactNode } from "react"
import { Link, useLocation } from "wouter"
import {
  BookOpenText,
  Boxes,
  FileText,
  GraduationCap,
  Home,
  Library,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { FloatingAskIda } from "@/components/ai/FloatingAskIda"

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
    match: (p) =>
      p === "/library" || p.startsWith("/docs") || p.startsWith("/import"),
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
    label: "Assets",
    to: "/assets",
    icon: Boxes,
    match: (p) => p.startsWith("/assets") || p.startsWith("/floor"),
  },
]

const SETTINGS: NavItem = {
  label: "Settings",
  to: "/settings",
  icon: Settings,
  match: (p) => p.startsWith("/settings") || p.startsWith("/templates"),
}

function NavLink({ item, location }: { item: NavItem; location: string }) {
  const Icon = item.icon
  const active = item.match(location)
  return (
    <Link
      href={item.to}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-border/40 hover:text-sidebar-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  )
}

export function DesktopShell({ children }: { children: ReactNode }) {
  const [location] = useLocation()

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col self-start overflow-y-auto border-r bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <BookOpenText className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Oppr Knowledge</div>
            <div className="text-xs text-sidebar-accent">Internal showcase</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.map((item) => (
            <NavLink key={item.to} item={item} location={location} />
          ))}
        </nav>

        <div className="space-y-1 border-t border-sidebar-border p-3">
          <NavLink item={SETTINGS} location={location} />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      <FloatingAskIda />
    </div>
  )
}
