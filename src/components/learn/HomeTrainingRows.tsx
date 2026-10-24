import { useQuery } from "convex/react"
import { Link } from "wouter"
import { AlertTriangle, ListChecks, ShieldCheck } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { KIND_LABEL } from "./training/lib"

// Inbox rows on Home: Trainings waiting for review or approval, and Trainings that need review after a Significant change.
export function HomeTrainingRows() {
  const rows = useQuery(api.trainings.inbox)
  if (!rows || rows.length === 0) return null
  return (
    <section className="space-y-3 pt-3">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Trainings</h2>
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
          {rows.length}
        </Badge>
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {rows.map((t) => {
            const kind = KIND_LABEL[t.kind]
            const row = t.needsReview
              ? {
                  icon: AlertTriangle,
                  tone: "warning" as const,
                  note: `${t.needsReviewReason ?? "A source document changed"}. Check the ${kind.toLowerCase()} still holds.`,
                  action: "Review after change",
                }
              : t.status === "in_review"
                ? { icon: ShieldCheck, tone: "primary" as const, note: `${kind} waiting for your review. Open it to approve.`, action: "Review" }
                : { icon: ShieldCheck, tone: "primary" as const, note: `${kind} approved. Open it to publish.`, action: "Publish" }
            const Icon = row.icon
            return (
              <Link
                key={t._id}
                href={`/learn/trainings/${t._id}`}
                className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                    row.tone === "primary" && "bg-primary/10 text-primary",
                    row.tone === "warning" && "bg-amber-500/10 text-amber-600",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    <span className="font-mono">
                      {t.code} · v{t.needsReview ? t.liveVersion : t.currentVersion}
                    </span>{" "}
                    · {row.note}
                  </span>
                </span>
                <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs group-hover:border-primary/50" tabIndex={-1}>
                  {row.action}
                </Button>
              </Link>
            )
          })}
        </CardContent>
      </Card>
    </section>
  )
}
