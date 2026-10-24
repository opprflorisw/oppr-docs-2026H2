import { useQuery } from "convex/react"
import { Link } from "wouter"
import { CalendarDays, FilePlus2, FileDiff } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate } from "@/lib/time"

// Home: what changed in the last 7 days. Significant changes and new
// documents one by one, with what they set off; small fixes only counted.
export function ThisWeekCard() {
  const data = useQuery(api.home.thisWeek)
  if (data === undefined) return <Skeleton className="h-28 w-full" />

  return (
    <section className="space-y-2" aria-labelledby="this-week-title">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <h2 id="this-week-title" className="text-sm font-semibold">
          This week
        </h2>
      </div>
      <Card>
        <CardContent className="p-0">
          {data.rows.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              {data.minor > 0
                ? `No significant changes in the last 7 days, only ${data.minor} minor ${data.minor === 1 ? "update" : "updates"}.`
                : "Nothing was published in the last 7 days."}
            </p>
          ) : (
            <ul className="divide-y">
              {data.rows.slice(0, 5).map((r) => {
                const Icon = r.kind === "new" ? FilePlus2 : FileDiff
                const href =
                  r.kind === "significant"
                    ? `/docs/${r.documentId}?v=${r.version}&compare=${r.version - 1}`
                    : `/docs/${r.documentId}`
                const effects = [
                  r.retrainPeople > 0 ? `${r.retrainPeople} to re-train` : null,
                  r.trainingsToReview > 0
                    ? `${r.trainingsToReview} ${r.trainingsToReview === 1 ? "Training" : "Trainings"} to check`
                    : null,
                ].filter(Boolean)
                return (
                  <li key={`${r.documentId}-${r.version}`}>
                    <Link href={href} className="flex gap-2 px-3 py-2 transition-colors hover:bg-muted/50">
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{r.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          <span className="font-mono">
                            {r.namingCode} v{r.version}
                          </span>{" "}
                          · {r.kind === "new" ? "New" : "Significant change"} · {formatDate(r.publishedAt)}
                        </span>
                        {r.changeNote && (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{r.changeNote}</span>
                        )}
                        {effects.length > 0 && (
                          <span className="mt-0.5 block text-xs font-medium text-red-700 dark:text-red-400">
                            {effects.join(" · ")}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                )
              })}
              {(data.minor > 0 || data.rows.length > 5) && (
                <li className="px-3 py-2 text-xs text-muted-foreground">
                  {data.rows.length > 5 ? `${data.rows.length - 5} more changes` : ""}
                  {data.rows.length > 5 && data.minor > 0 ? ", " : ""}
                  {data.minor > 0 ? `and ${data.minor} minor ${data.minor === 1 ? "update" : "updates"}` : ""}
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
