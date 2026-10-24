import { useQuery } from "convex/react"
import { Link } from "wouter"
import { AlertTriangle, Award, GraduationCap } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { StatusBadge } from "@/components/docs/StatusBadge"
import { KindIcon } from "./training/lib"

// Aside card on a Document: Trainings built on it. A Significant change to
// this Document sends them back to review, so the author sees them here.
export function DocumentTrainingsCard({ documentId }: { documentId: Id<"documents"> }) {
  const trainings = useQuery(api.trainings.forDocument, { documentId })
  const skills = useQuery(api.trainings.skillsForDocument, { documentId })
  if (trainings === undefined) return null
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs font-semibold">Trainings</p>
        {trainings.length > 0 && <span className="text-[11px] text-muted-foreground">{trainings.length}</span>}
      </div>
      {trainings.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No Training uses this document yet. Trainings built on it appear here, and a Significant change sends them back to
          review.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {trainings.map((t) => (
            <li key={t._id}>
              <Link href={`/learn/trainings/${t._id}`} className="group flex items-start gap-2 rounded-md p-1 -m-1 hover:bg-muted/50">
                <KindIcon kind={t.kind} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium group-hover:text-primary">{t.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="font-mono">{t.code}</span>
                    <StatusBadge status={t.status} className="h-4 px-1 text-[9px]" />
                    <span>
                      {t.objectives} {t.objectives === 1 ? "objective" : "objectives"}
                    </span>
                  </span>
                  {t.needsReview && (
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3" /> Review after change
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {skills && skills.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          <p className="text-[11px] font-medium text-muted-foreground">Skills linked to it</p>
          {skills.map((s) => (
            <Link
              key={s._id}
              href="/learn?tab=matrix"
              className="flex items-center gap-1.5 text-xs hover:text-primary"
            >
              <Award className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {s.holders} {s.holders === 1 ? "holder" : "holders"}
              </span>
            </Link>
          ))}
          <p className="text-[11px] text-muted-foreground">A Significant change flags these holders for re-training.</p>
        </div>
      )}
    </div>
  )
}
