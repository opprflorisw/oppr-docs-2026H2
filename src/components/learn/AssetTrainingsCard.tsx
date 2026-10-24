import { useQuery } from "convex/react"
import { Link } from "wouter"
import { AlertTriangle, ArrowRight, GraduationCap } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/docs/StatusBadge"
import { KIND_LABEL, KindIcon } from "./training/lib"

// Card on an Asset: Rounds that stop here and Trainings on its Documents.
export function AssetTrainingsCard({ assetId }: { assetId: Id<"assets"> }) {
  const data = useQuery(api.trainings.forAsset, { assetId })
  if (data === undefined) return null
  const total = data.rounds.length + data.trainings.length
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Trainings and Rounds</h2>
        <Badge variant="secondary" className="h-5 px-1.5 text-xs">
          {total}
        </Badge>
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {total === 0 && (
            <p className="px-4 py-4 text-xs text-muted-foreground">
              No Training or Round uses this Asset yet. Rounds that stop here and Trainings built on its documents appear
              here.
            </p>
          )}
          {data.rounds.map((r) => (
            <Link
              key={r._id}
              href={`/learn/trainings/${r._id}`}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-600">
                <KindIcon kind="round" className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{r.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  <span className="font-mono">{r.code}</span> · {KIND_LABEL.round}, stop {r.stopIndex + 1} of {r.stops}
                  {r.hint ? ` · ${r.hint}` : ""}
                </span>
              </span>
              {r.needsReview && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Needs review after a change" />}
              <StatusBadge status={r.status} className="h-5 px-1.5 text-[10px]" />
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Link>
          ))}
          {data.trainings.map((t) => (
            <Link
              key={t._id}
              href={`/learn/trainings/${t._id}`}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-600">
                <KindIcon kind="course" className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{t.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  <span className="font-mono">{t.code}</span> · built on <span className="font-mono">{t.documentCodes.join(", ")}</span>
                </span>
              </span>
              {t.needsReview && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Needs review after a change" />}
              <StatusBadge status={t.status} className="h-5 px-1.5 text-[10px]" />
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>
    </section>
  )
}
