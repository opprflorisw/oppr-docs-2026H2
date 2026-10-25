// Instructions (/instructions): one guided tour per function of the app,
// grouped by place. Each card opens the tour's introduction page.
import { Link } from "wouter"
import { CheckCircle2, ChevronRight, Clock, Compass } from "lucide-react"
import { PageHeader } from "@/components/layout/PageHeader"
import { TopBar } from "@/components/layout/TopBar"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useTourViewer, visibleTours } from "@/components/instructions/audience"
import { AREA_LABEL, AREA_ORDER, useDoneTours } from "@/components/instructions/progress"
import { tourIcon } from "@/components/instructions/tourIcon"
import type { Tour } from "@/components/instructions/types"

export function InstructionsPage() {
  const { kind, personId, checkedIn, ready } = useTourViewer()
  const { done } = useDoneTours(personId)
  const tours = visibleTours(kind)
  const doneCount = tours.filter((t) => done.has(t.id)).length
  const startHere = tours.find((t) => t.area === "start" && !done.has(t.id))

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Instructions" }]} />
      <PageHeader
        icon={Compass}
        title="Instructions"
        statusLine="Short guided tours of everything you can do here. Pick one to see what it is for, then take the tour."
      />
      <div className="mx-auto w-full max-w-5xl space-y-8 p-6">
        {!ready ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading tours">
            <Skeleton className="h-10 w-72" />
            <div className="grid gap-3 md:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          </div>
        ) : tours.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Compass className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm font-medium">No tours yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The guided tours are being written. Come back soon.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border bg-card p-4">
              <div className="min-w-[12rem] flex-1">
                <p className="text-sm font-medium">
                  {doneCount} of {tours.length} done
                </p>
                <div
                  className="mt-2 h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label="Tours done"
                  aria-valuemin={0}
                  aria-valuemax={tours.length}
                  aria-valuenow={doneCount}
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${tours.length ? (doneCount / tours.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <p className="max-w-md text-xs text-muted-foreground">
                {checkedIn
                  ? "Tours you finish are marked as done for you, in this browser."
                  : "You see the tours for Operators. Check in at the top right to see the tours for your role and keep your progress."}
              </p>
            </div>

            {AREA_ORDER.map((area) => {
              const list = tours.filter((t) => t.area === area)
              if (list.length === 0) return null
              const areaDone = list.filter((t) => done.has(t.id)).length
              return (
                <section key={area} aria-labelledby={`area-${area}`} className="space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 id={`area-${area}`} className="text-sm font-semibold">
                      {AREA_LABEL[area]}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {areaDone} of {list.length} done
                    </span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {list.map((t) => (
                      <TourCard key={t.id} tour={t} done={done.has(t.id)} startHere={t.id === startHere?.id} />
                    ))}
                  </div>
                </section>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

function TourCard({ tour, done, startHere }: { tour: Tour; done: boolean; startHere: boolean }) {
  const Icon = tourIcon(tour.icon)
  return (
    <Link
      href={`/instructions/${tour.id}`}
      data-tour-card-id={tour.id}
      className={cn(
        "group flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        startHere && "border-primary/50 bg-primary/5",
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{tour.title}</span>
          {startHere && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
              Start here
            </span>
          )}
          {done && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-status-published">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Done
            </span>
          )}
        </span>
        <span className="block text-sm text-muted-foreground">{tour.summary}</span>
        <span className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" aria-hidden /> About {tour.minutes} min
        </span>
      </span>
      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
    </Link>
  )
}
