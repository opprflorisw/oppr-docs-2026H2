import { useState } from "react"
import { useQuery } from "convex/react"
import { Link } from "wouter"
import { AlertTriangle, Award, GraduationCap, Plus } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/docs/StatusBadge"
import { useCheckIn } from "@/lib/checkIn"
import { KindIcon } from "./training/lib"
import { TrainingGuidedCreation } from "./training/TrainingGuidedCreation"
import { isEngineerOrAdmin } from "@/lib/roles"

// Aside card on a Document: Trainings built on it. A Significant change to
// this Document sends them back to review, so the author sees them here.
// Trainings come only from Published documents (ADR 0005), so "Make a
// Training" is offered on a Published document only, to Engineers.
export function DocumentTrainingsCard({
  documentId,
  published = false,
}: {
  documentId: Id<"documents">
  /** The document has a Published version in use. */
  published?: boolean
}) {
  const trainings = useQuery(api.trainings.forDocument, { documentId })
  const skills = useQuery(api.trainings.skillsForDocument, { documentId })
  const { person } = useCheckIn()
  const [creating, setCreating] = useState(false)
  if (trainings === undefined) return null
  const canMake = published && isEngineerOrAdmin(person)
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Trainings</h2>
        {trainings.length > 0 && <span className="text-xs text-muted-foreground">{trainings.length}</span>}
      </div>
      {trainings.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No Training uses this document yet. Trainings built on it appear here, and a Significant change sends them back to
          review.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {trainings.map((t) => (
            <li key={t._id}>
              <Link href={`/learn/trainings/${t._id}`} className="group -m-1 flex items-start gap-2 rounded-md p-1 hover:bg-muted/50">
                <KindIcon kind={t.kind} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium group-hover:text-primary">{t.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-mono">{t.code}</span>
                    <StatusBadge status={t.status} className="h-5 px-1.5 text-xs" />
                    <span>
                      {t.objectives} {t.objectives === 1 ? "objective" : "objectives"}
                    </span>
                  </span>
                  {t.needsReview && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3" /> Review after change
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {canMake && (
        <Button
          size="sm"
          variant="outline"
          className="h-auto min-h-8 w-full whitespace-normal py-1.5"
          title="Make a Training from this document"
          onClick={() => setCreating(true)}
        >
          <Plus />
          Make a Training
        </Button>
      )}
      {skills && skills.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          <p className="text-xs font-medium text-muted-foreground">Who may do this work today</p>
          {skills.map((s) => (
            <div key={s._id} className="space-y-0.5" data-testid="doc-skill-can-do">
              <Link href="/learn?tab=matrix" className="flex items-center gap-1.5 text-sm hover:text-primary">
                <Award className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {s.holders} {s.holders === 1 ? "holder" : "holders"}
                </span>
              </Link>
              <p className="pl-5 text-xs text-muted-foreground">
                {s.canDo.length === 0 ? (
                  <span className="text-amber-700 dark:text-amber-300">Nobody at level 2 (Can do it) right now</span>
                ) : (
                  <span className="text-foreground">{s.canDo.join(", ")}</span>
                )}
                {s.retrain > 0 && `. ${s.retrain} waiting to re-train`}
              </p>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Level 2 (Can do it) or higher, still valid, no re-training open. A Significant change flags every holder for
            re-training.
          </p>
        </div>
      )}
      {creating && (
        <TrainingGuidedCreation open={creating} onOpenChange={setCreating} initialDocumentIds={[documentId]} />
      )}
    </div>
  )
}
