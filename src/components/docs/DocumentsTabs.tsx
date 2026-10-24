// The places under Documents, as tabs (design rule: places are tabs, actions
// are buttons): All documents, Findings, Knowledge health and Captures.
// Rendered right under the PageHeader of each of those pages.

import { Link, useLocation } from "wouter"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/library", label: "All documents", match: (p: string) => p === "/library" },
  { href: "/library/findings", label: "Findings", match: (p: string) => p.startsWith("/library/findings") },
  { href: "/library/health", label: "Knowledge health", match: (p: string) => p.startsWith("/library/health") },
  { href: "/library/captures", label: "Captures", match: (p: string) => p.startsWith("/library/captures") },
] as const

export function DocumentsTabs({ className }: { className?: string }) {
  const [location] = useLocation()
  const counts = useQuery(api.findings.counts, {})
  return (
    <nav aria-label="Documents" className={cn("border-b bg-background px-6", className)}>
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const active = t.match(location)
          const count = t.href === "/library/findings" ? counts?.open : undefined
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {count != null && count > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs tabular-nums",
                      counts && counts.openContradictions > 0
                        ? "bg-red-500/10 text-red-700 dark:text-red-300"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
