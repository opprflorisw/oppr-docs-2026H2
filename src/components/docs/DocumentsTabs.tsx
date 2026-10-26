// The places under Documents, as tabs (design rule: places are tabs, actions
// are buttons): All documents, Findings, Knowledge health, Captures, Images
// and ISO 9001 (the audit view of document control).
// Rendered right under the PageHeader of each of those pages.
// A checked-in Operator sees only the tabs of their work (All documents and
// Captures); the upkeep and audit tabs belong to Engineers and Admins. The
// pages themselves stay open by address.

import { Link, useLocation } from "wouter"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { cn } from "@/lib/utils"
import { useCheckIn } from "@/lib/checkIn"

const TABS = [
  { href: "/library", label: "All documents", tour: "documents-tab-all", match: (p: string) => p === "/library", operator: true },
  { href: "/library/findings", label: "Findings", tour: "documents-tab-findings", match: (p: string) => p.startsWith("/library/findings") },
  { href: "/library/health", label: "Knowledge health", tour: "documents-tab-health", match: (p: string) => p.startsWith("/library/health") },
  { href: "/library/captures", label: "Captures", tour: "documents-tab-captures", match: (p: string) => p.startsWith("/library/captures"), operator: true },
  { href: "/library/images", label: "Images", tour: "documents-tab-images", match: (p: string) => p.startsWith("/library/images") },
  { href: "/iso-9001", label: "ISO 9001", tour: "documents-tab-iso", match: (p: string) => p.startsWith("/iso-9001") },
] as const

export function DocumentsTabs({ className }: { className?: string }) {
  const [location] = useLocation()
  const { person } = useCheckIn()
  const operator = person?.kind === "operator"
  const counts = useQuery(api.findings.counts, operator ? "skip" : {})
  // An Operator who opened an Engineer tab by address still sees where they are.
  const tabs = operator ? TABS.filter((t) => ("operator" in t && t.operator) || t.match(location)) : TABS
  return (
    <nav aria-label="Documents" className={cn("border-b bg-background px-6", className)} data-tour="documents-tabs">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const active = t.match(location)
          const count = t.href === "/library/findings" ? counts?.open : undefined
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                data-tour={t.tour}
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
