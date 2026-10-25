// A small card for Home: how far the person is with the guided tours, the
// tour to take next, and the way to Instructions.
import { Link } from "wouter"
import { ChevronRight, Compass } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTourViewer, visibleTours } from "./audience"
import { nextTour, useDoneTours } from "./progress"

export function InstructionsHomeCard({ className }: { className?: string }) {
  const { kind, personId } = useTourViewer()
  const { done } = useDoneTours(personId)
  const tours = visibleTours(kind)
  if (tours.length === 0) return null
  const doneCount = tours.filter((t) => done.has(t.id)).length
  const next = nextTour(undefined, kind, done)

  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <div className="flex items-start gap-3">
        <Compass className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Instructions</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {doneCount === tours.length
              ? "You took every tour. Take one again any time."
              : "Short guided tours that show you around, one function at a time."}
          </p>
          <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Tours done"
            aria-valuemin={0}
            aria-valuemax={tours.length}
            aria-valuenow={doneCount}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${(doneCount / tours.length) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {doneCount} of {tours.length} done
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {next && (
              <Link href={`/instructions/${next.id}`} className="font-medium text-primary hover:underline">
                Next: {next.title}
              </Link>
            )}
            <Link
              href="/instructions"
              className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground hover:underline"
            >
              Open Instructions <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
