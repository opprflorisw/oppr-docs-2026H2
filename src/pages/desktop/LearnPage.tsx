import { Link } from "wouter"
import { ArrowRight, Footprints, GraduationCap, Grid3x3, ListChecks } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"

// Learn (CONTEXT.md) is the pillar that builds and keeps up what people can
// do. Not built yet: this page names what is coming so the place exists.
const COMING = [
  {
    icon: ListChecks,
    title: "Trainings",
    text: "Approved learning objectives built from published documents. Every attempt gets fresh questions, but everyone is tested on the same things.",
  },
  {
    icon: Footprints,
    title: "Rounds",
    text: "Trainings done on the floor, like a treasure hunt: walk to each machine, scan it, answer, add a photo or voice note.",
  },
  {
    icon: Grid3x3,
    title: "Skill matrix",
    text: "Who can do what, at which level, against their skill profile. A significant change to a linked document flags who needs re-training.",
  },
]

export function LearnPage() {
  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Learn" }]} />
      <PageHeader
        icon={GraduationCap}
        title="Learn"
        subtitle="Building and keeping up what people can do. Coming in a later slice."
      />
      <div className="max-w-3xl space-y-4 p-6">
        <p className="text-sm text-muted-foreground">
          Learn turns published knowledge into skills. It is about whether a
          person can run their part of the plant, not about ticking off
          courses. Trainings and Rounds need a person to be checked in, so the
          result is proof a labour inspector can rely on.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {COMING.map((c) => (
            <Card key={c.title}>
              <CardContent className="space-y-2 p-4">
                <c.icon className="h-5 w-5 text-primary" />
                <p className="text-sm font-medium">{c.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{c.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <Link
          href="/floor"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          See how a Round will look in the Floor simulator
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
