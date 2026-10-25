// A tour's introduction (/instructions/:tourId): what the function does, why
// it is there, how it helps, what it can do, and the steps of the tour.
// "Start the tour" then walks the person through the real screens.
import { Link, useRoute } from "wouter"
import { ArrowLeft, Check, CheckCircle2, Clock, Compass, Play, RotateCcw, Users } from "lucide-react"
import { PageHeader } from "@/components/layout/PageHeader"
import { TopBar } from "@/components/layout/TopBar"
import { Button } from "@/components/ui/button"
import { audienceText, canSeeTour, useTourViewer, visibleSteps } from "@/components/instructions/audience"
import { AREA_LABEL, useDoneTours } from "@/components/instructions/progress"
import { tourIcon } from "@/components/instructions/tourIcon"
import { tourStore } from "@/components/instructions/tourStore"
import { closeAsk } from "@/components/ai/AskDock"
import { findTour } from "@/components/instructions/tours"
import { tourNeedsCheckIn } from "@/components/instructions/placeholders"

export function InstructionsTourPage() {
  const [, params] = useRoute<{ tourId: string }>("/instructions/:tourId")
  const tour = params ? findTour(params.tourId) : undefined
  const { kind, personId, checkedIn } = useTourViewer()
  const { done, setDone } = useDoneTours(personId)

  if (!tour) {
    return (
      <div className="flex flex-col">
        <TopBar breadcrumb={[{ label: "Instructions", href: "/instructions" }, { label: "Tour not found" }]} />
        <PageHeader icon={Compass} title="Tour not found" />
        <div className="max-w-xl space-y-4 p-6">
          <p className="text-sm text-muted-foreground">
            There is no tour at this address. It may have been renamed. All tours are listed in Instructions.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/instructions">
              <ArrowLeft aria-hidden /> Back to Instructions
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const Icon = tourIcon(tour.icon)
  const steps = visibleSteps(tour, kind)
  const finished = done.has(tour.id)
  const forYou = canSeeTour(tour, kind)
  // Developer pages only open for Engineers and Admins: an Operator would
  // walk past empty screens.
  const locked = tour.area === "developer" && kind === "operator"
  // Every tour starts from a clean screen: an open Ask panel would hide the
  // Ask starters on pages and turn "click Ask now" into a close.
  const start = () => {
    closeAsk()
    tourStore.start(tour.id)
  }
  // The one primary action, in the sticky header so it is always in view.
  const startButton = (
    <Button
      size="sm"
      onClick={start}
      disabled={steps.length === 0 || locked}
      title={locked ? "Check in as an Engineer or Admin to take this tour" : undefined}
      data-tour-start=""
    >
      {finished ? <RotateCcw aria-hidden /> : <Play aria-hidden />}
      {finished ? "Take it again" : "Start the tour"}
    </Button>
  )

  return (
    <div className="flex flex-col">
      <TopBar
        breadcrumb={[
          { label: "Instructions", href: "/instructions" },
          { label: AREA_LABEL[tour.area], href: "/instructions" },
          { label: tour.title },
        ]}
      />
      <PageHeader
        icon={Icon}
        title={tour.title}
        statusLine={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{AREA_LABEL[tour.area]}</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden /> About {tour.minutes} min
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" aria-hidden /> For {audienceText(tour.audience)}
            </span>
            {finished && (
              <span className="inline-flex items-center gap-1 font-medium text-status-published">
                <CheckCircle2 className="h-3 w-3" aria-hidden /> Done
              </span>
            )}
          </span>
        }
        primary={startButton}
      />
      <div className="mx-auto w-full max-w-4xl space-y-8 p-6">
        <p className="text-base">{tour.summary}</p>

        {forYou && !checkedIn && tourNeedsCheckIn(tour) && (
          <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            This tour shows your own learning. Check in at the top right before you start it.
          </p>
        )}

        {!forYou && (
          <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            {locked
              ? `This tour is for ${audienceText(tour.audience)}. Check in as one of them to take it.`
              : `This tour is for ${audienceText(tour.audience)}. You can take it, but some parts only show for them, so a few steps may have nothing to point at. Check in as one of them to see every part.`}
          </p>
        )}

        <Section title="What it does">
          <p className="text-sm leading-relaxed">{tour.what}</p>
        </Section>

        <Section title="Why it is there">
          <p className="text-sm leading-relaxed">{tour.why}</p>
        </Section>

        {tour.helps.length > 0 && (
          <Section title="How it helps you">
            <ul className="space-y-2">
              {tour.helps.map((h) => (
                <li key={h} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-status-published" aria-hidden />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {tour.capabilities.length > 0 && (
          <Section title="What it can do">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tour.capabilities.map((c) => (
                <div key={c.title} className="rounded-lg border bg-card p-3">
                  <p className="text-sm font-medium">{c.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="The tour">
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">This tour has no steps for you yet.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {steps.length} step{steps.length === 1 ? "" : "s"}. The tour opens the real screens and points at
                each part. Use Next and Back, or the arrow keys. Press Esc to stop at any time.
              </p>
              <ol className="mt-3 space-y-2">
                {steps.map((s, i) => (
                  <li key={s.id} className="flex items-start gap-3 text-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{s.title}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </Section>

        <div className="flex flex-wrap items-center gap-3 border-t pt-6">
          {!finished ? (
            <Button variant="ghost" size="sm" onClick={() => setDone(tour.id, true)}>
              Mark as done
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setDone(tour.id, false)}>
              Mark as not done
            </Button>
          )}
          <Link
            href="/instructions"
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Instructions
          </Link>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}
