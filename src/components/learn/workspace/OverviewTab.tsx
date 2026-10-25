import type { ComponentType } from "react"
import type { LucideProps } from "lucide-react"
import { Link } from "wouter"
import {
  AlertTriangle,
  BadgeCheck,
  ChevronRight,
  FileCheck2,
  FileQuestion,
  Grid3x3,
  Layers,
  ListChecks,
  ShieldAlert,
  Signal,
  UserX,
  Users,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useLevelNames } from "../skills/skillUi"
import { tabHref, type TabProps } from "./workspaceBits"

// How Skills work, in one picture with live counts, and what needs attention.
// The picture explains; the tabs are where things change. The Skill matrix
// (Learn) is the read view of who holds what.
export function OverviewTab({ workspace }: TabProps) {
  const names = useLevelNames()
  const c = workspace.counts
  const g = workspace.gaps
  const held = c.levels.reduce((a, b) => a + b, 0)
  const skillHref = (id: string) => `${tabHref("skills")}?skill=${id}`
  const times = (n: number) => `${n} ${n === 1 ? "time" : "times"}`

  const steps: Step[] = [
    { icon: BadgeCheck, value: String(c.skills), title: c.skills === 1 ? "Skill" : "Skills", line: "Named abilities, such as running a line" },
    {
      icon: Signal,
      value: String(held),
      title: "levels held",
      line: `One per person per Skill: ${c.levels.map((n, i) => `${n} ${names[i + 1]}`).join(", ")}`,
    },
    {
      icon: Layers,
      value: String(c.profiles),
      title: c.profiles === 1 ? "Skill profile" : "Skill profiles",
      line: "The level each role needs per Skill",
    },
    { icon: Users, value: `${c.measured} of ${c.people}`, title: "people on a profile", line: "Measured against what their role needs" },
    {
      icon: ListChecks,
      value: String(c.provingTrainings),
      title: c.provingTrainings === 1 ? "Training proves a Skill" : "Trainings prove a Skill",
      line: `Passing one sets level 1 (${names[1]})`,
    },
    {
      icon: FileCheck2,
      value: String(c.records),
      title: c.records === 1 ? "Training record" : "Training records",
      line: `${c.recordsLast30} new in the last 30 days. Levels changed ${times(c.eventsLast30)} in that period.`,
    },
  ]

  const short = new Set(g.skillsShort.map((s) => s._id))

  return (
    <div className="space-y-8">
      <section aria-labelledby="how-title" className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 id="how-title" className="text-sm font-semibold">
            How it works
          </h2>
          <Link
            href="/learn?tab=matrix"
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Grid3x3 className="h-3.5 w-3.5" aria-hidden />
            See who holds what in the Skill matrix
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        <p className="max-w-3xl text-xs text-muted-foreground">
          A Skill is held at a level. A Skill profile says which level a role needs, and the people on it are measured
          against it. Passing a Training that proves a Skill sets level 1; an Engineer signs off levels 2 and 3. Every
          pass leaves a Training record. You set all of this up in the tabs above; the Skill matrix in Learn shows the
          result.
        </p>
        <ol className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {steps.map((s) => (
            <StepItem key={s.title} step={s} />
          ))}
        </ol>
      </section>

      <section aria-labelledby="attention-title" className="space-y-3">
        <div className="space-y-0.5">
          <h2 id="attention-title" className="text-sm font-semibold">
            Needs attention
          </h2>
          <p className="text-xs text-muted-foreground">Open a Skill or person to act on it. Each list counts its own kind of thing.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <GapCard
            icon={ShieldAlert}
            title="Single points of failure"
            hint="Only one person meets the level their role needs. Nobody covers when they are off."
            unit={["Skill", "Skills"]}
            more={tabHref("skills")}
            items={g.singlePoints.map((s) => ({ key: s._id, label: s.name, note: `only ${s.personName}`, href: skillHref(s._id) }))}
          />
          <GapCard
            icon={BadgeCheck}
            title="Skills people are short of"
            hint="People on a profile who are below the level it needs for this Skill."
            unit={["Skill", "Skills"]}
            more={tabHref("skills")}
            items={g.skillsShort.map((s) => ({
              key: s._id,
              label: s.name,
              note: `${s.short} of ${s.needed} short`,
              href: skillHref(s._id),
            }))}
          />
          <GapCard
            icon={Users}
            title="People below their profile"
            hint="The same gaps, per person."
            unit={["person", "people"]}
            more={tabHref("people")}
            items={g.peopleBelow.map((p) => ({
              key: p._id,
              label: p.name,
              note: `short on ${p.below} of ${p.targets} Skills`,
              href: `/learn/people/${p._id}`,
            }))}
          />
          <GapCard
            icon={AlertTriangle}
            title="Going stale or re-train needed"
            hint={`Expired, expiring within ${workspace.rules.expiringWindowDays} days, or asked to re-train after a document changed how the work is done. Oppr assigns the refresher Training automatically.`}
            unit={["Skill", "Skills"]}
            more={tabHref("skills")}
            items={g.stale.map((s) => ({
              key: s._id,
              label: s.name,
              note: [
                s.retrain && `${s.retrain} re-train`,
                s.expired && `${s.expired} expired`,
                s.expiring && `${s.expiring} expiring`,
              ]
                .filter(Boolean)
                .join(", "),
              href: skillHref(s._id),
            }))}
          />
          <GapCard
            icon={ListChecks}
            title="Skills no Training proves"
            hint="Nobody can reach level 1 without one."
            unit={["Skill", "Skills"]}
            more={tabHref("trainings")}
            items={g.skillsWithoutTraining.map((s) => ({
              key: s._id,
              label: s.name,
              note: short.has(s._id) ? "people are short" : s.hasDocument ? undefined : "no document",
              href: tabHref("trainings"),
            }))}
          />
          <GapCard
            icon={UserX}
            title="Skill profiles with nobody on them"
            hint="Nobody is measured against these."
            unit={["profile", "profiles"]}
            more={tabHref("people")}
            items={g.profilesWithNobody.map((p) => ({ key: p._id, label: p.name, href: tabHref("people") }))}
          />
          <GapCard
            icon={FileQuestion}
            title="Trainings that prove no Skill"
            hint="Passing them does not change anyone's level."
            unit={["Training", "Trainings"]}
            more={tabHref("trainings")}
            items={g.trainingsProvingNothing.map((t) => ({
              key: t._id,
              label: `${t.code} ${t.title}`,
              note: t.published ? undefined : "not published",
              href: tabHref("trainings"),
            }))}
          />
        </div>
      </section>
    </div>
  )
}

type Step = { icon: ComponentType<LucideProps>; value: string; title: string; line: string }

function StepItem({ step }: { step: Step }) {
  const Icon = step.icon
  return (
    <li className="flex flex-col gap-1 bg-card p-3">
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0 self-center text-primary" aria-hidden />
        <span className="whitespace-nowrap text-lg font-semibold tabular-nums">{step.value}</span>
        <span className="text-sm font-medium">{step.title}</span>
      </span>
      <span className="text-xs text-muted-foreground">{step.line}</span>
    </li>
  )
}

function GapCard({
  icon: Icon,
  title,
  hint,
  items,
  more,
  unit,
}: {
  icon: ComponentType<LucideProps>
  title: string
  hint: string
  items: { key: string; label: string; note?: string; href: string }[]
  more: string
  /** What the count counts, singular and plural. */
  unit: [string, string]
}) {
  const n = items.length
  const shown = items.slice(0, 5)
  return (
    <Card className={cn(n === 0 && "order-last opacity-70")}>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start gap-2">
          <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", n > 0 ? "text-amber-600" : "text-emerald-600")} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground">{hint}</div>
          </div>
          <span className="shrink-0 text-right">
            <span className="block text-lg font-semibold leading-tight tabular-nums">{n}</span>
            <span className="block text-[11px] text-muted-foreground">{n === 1 ? unit[0] : unit[1]}</span>
          </span>
        </div>
        {n === 0 ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">None</p>
        ) : (
          <ul className="space-y-1">
            {shown.map((i) => (
              <li key={i.key}>
                <Link href={i.href} className="flex items-baseline gap-2 text-xs hover:underline">
                  <span className="min-w-0 flex-1 truncate">{i.label}</span>
                  {i.note && <span className="shrink-0 text-muted-foreground">{i.note}</span>}
                </Link>
              </li>
            ))}
            {items.length > shown.length && (
              <li>
                <Link href={more} className="text-xs font-medium text-primary hover:underline">
                  {items.length - shown.length} more
                </Link>
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

