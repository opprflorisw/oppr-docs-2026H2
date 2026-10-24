import { useQuery } from "convex/react"
import { Link } from "wouter"
import { CalendarClock, GraduationCap, RotateCcw, ShieldAlert } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const MAX_ROWS = 6

// Home: Skills that need someone's attention: re-train needed after a
// Significant change, expired levels, and levels expiring within 30 days.
// Renders nothing when there is nothing to show.
export function HomeSkillRows() {
  const items = useQuery(api.skills.inbox)
  if (!items || items.length === 0) return null
  const shown = items.slice(0, MAX_ROWS)

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Skills</h2>
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
          {items.length}
        </Badge>
        <Link
          href="/learn?tab=matrix"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Skill matrix
        </Link>
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {shown.map((it) => {
            const Icon = it.kind === "retrain" ? RotateCcw : it.kind === "expired" ? ShieldAlert : CalendarClock
            const tone = it.kind === "expiring" ? "warning" : "danger"
            return (
              <Link
                key={`${it.kind}-${it.personId}-${it.skillId}`}
                href={`/learn/people/${it.personId}`}
                className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                    tone === "warning" && "bg-amber-500/10 text-amber-600",
                    tone === "danger" && "bg-red-500/10 text-red-600",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {it.personName} · {it.skillName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {it.kind === "retrain" ? `Re-train needed: ${it.note}` : it.note}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 text-xs group-hover:border-primary/50"
                  tabIndex={-1}
                >
                  {it.kind === "expiring" ? "Plan" : it.kind === "retrain" ? "Re-train" : "Renew"}
                </Button>
              </Link>
            )
          })}
          {items.length > shown.length && (
            <Link
              href="/learn?tab=matrix"
              className="block px-4 py-2 text-center text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              {items.length - shown.length} more in the Skill matrix
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
