import { useQuery } from "convex/react"
import { Link } from "wouter"
import { ArrowRight, TrendingDown } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { formatDate } from "@/lib/time"

/**
 * Knowledge health: Trainings whose "Still on point?" analysis needs
 * attention. Reads trainings.signalsOverview, which shares its source with
 * the builder tab and the Training page signal (trainings.signalStateFor),
 * so the three always agree. Renders nothing when all is well.
 */
export function TrainingSignalsHealth({ compact = false }: { compact?: boolean }) {
  const data = useQuery(api.trainings.signalsOverview, {})
  if (!data || data.needsAttention === 0) return null
  if (compact) {
    // Home Knowledge health card: one line per Training, at most three.
    const top = data.trainings.slice(0, 3)
    return (
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold">
          <TrendingDown className="h-3.5 w-3.5 text-amber-600" />
          Trainings: still on point?
          <span className="ml-auto rounded-full bg-amber-500/10 px-1.5 text-amber-700 tabular-nums">
            {data.needsAttention}
          </span>
        </div>
        <ul className="divide-y">
          {top.map((t) => (
            <li key={t.trainingId}>
              <Link
                href={`/learn/trainings/${t.trainingId}?tab=insights`}
                className="block px-3 py-2 text-xs [@media(hover:hover)]:hover:bg-muted/50"
              >
                <span className="block truncate font-medium">{t.title}</span>
                <span className="block text-muted-foreground">
                  {t.needsAttention} {t.needsAttention === 1 ? "thing needs" : "things need"} attention
                  {t.documentGaps > 0 && `, ${t.documentGaps} in the document`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href="/library/health#trainings-on-point"
          className="flex items-center gap-1 border-t px-3 py-2 text-xs font-medium text-primary [@media(hover:hover)]:hover:bg-muted/50"
        >
          See all in Knowledge health
          <ArrowRight className="ml-auto h-3 w-3" />
        </Link>
      </div>
    )
  }
  return (
    <section id="trainings-on-point" className="space-y-3">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <TrendingDown className="h-4 w-4 text-amber-600" /> Trainings: still on point?
        </h2>
        <p className="text-sm text-muted-foreground">
          {data.needsAttention} {data.needsAttention === 1 ? "Training shows" : "Trainings show"} answers that point at a
          misconception, an unclear question or a gap in the document.
        </p>
      </div>
      <ul className="divide-y rounded-lg border">
        {data.trainings.map((t) => (
          <li key={t.trainingId}>
            <Link
              href={`/learn/trainings/${t.trainingId}?tab=insights`}
              className="flex items-start gap-3 px-4 py-3 text-sm [@media(hover:hover)]:hover:bg-muted/50"
            >
              <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">{t.code}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t.title}</span>
                {t.headline && <span className="block text-muted-foreground">{t.headline}</span>}
              </span>
              <span className="shrink-0 text-right text-xs text-muted-foreground">
                {t.needsAttention} {t.needsAttention === 1 ? "thing" : "things"} to check
                {t.documentGaps > 0 && `, ${t.documentGaps} in the document`}
                <span className="block">
                  v{t.version}, {formatDate(t.at)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
