import { Link } from "wouter"
import { CalendarClock, ChevronRight, Clock, Layers, SlidersHorizontal } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { SkillLevelsSettings } from "../skills/SkillLevelsSettings"
import { SectionTitle, type TabProps } from "./workspaceBits"

/** Level names, and the rules that make a level go stale or come back. */
export function LevelsTab({ catalogue, workspace }: TabProps) {
  const r = workspace.rules
  const expiring = catalogue.skills.filter((s) => s.validityMonths)
  const rules = [
    {
      title: "A level can expire",
      body:
        expiring.length === 0
          ? "No Skill has a validity period, so no level expires. Set one on a Skill (Skills tab)."
          : `${expiring.length} of ${catalogue.skills.length} Skills have a validity period. An expired level counts as 0.`,
    },
    {
      title: `Expiring shows ${r.expiringWindowDays} days ahead`,
      body: `A level that expires within ${r.expiringWindowDays} days shows as expiring in the Skill matrix and on Home.`,
    },
    {
      title: `The refresher Training is assigned ${r.refreshBeforeDays} days before`,
      body: `Oppr checks every day. When someone's level or Training record expires within ${r.refreshBeforeDays} days, they get the Training that proves the Skill assigned, without anyone doing it by hand. Passing it renews the level.`,
    },
    {
      title: "A change to how the work is done asks for re-training",
      body: `When an author publishes a new version of a Skill's document and marks it as a Significant change (it changes how the work is done, not just a typo), everyone who holds the Skill is asked to re-train within ${r.retrainDueDays} days.`,
      href: "/settings?tab=training",
      link: "Change the due days",
    },
    {
      title: r.trainingRefreshMonths ? `New Trainings refresh after ${r.trainingRefreshMonths} months` : "New Trainings have no refresher",
      body: "The default for a new Training. Each Training can set its own.",
      href: "/settings?tab=training",
      link: "Training defaults",
    },
  ]

  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <section className="space-y-3">
        <SectionTitle icon={Layers} title="Level names" />
        <SkillLevelsSettings />
      </section>

      <div className="space-y-8">
        <section className="space-y-3">
          <SectionTitle icon={Clock} title="When a level goes stale" />
          <Card>
            <CardContent className="divide-y p-0">
              {rules.map((x) => (
                <div key={x.title} className="space-y-0.5 px-4 py-3">
                  <div className="text-sm font-medium">{x.title}</div>
                  <p className="text-xs text-muted-foreground">
                    {x.body}{" "}
                    {x.href && (
                      <Link href={x.href} className="font-medium text-primary underline-offset-2 hover:underline">
                        {x.link}
                      </Link>
                    )}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
          {expiring.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Validity:{" "}
              {expiring.map((s, i) => (
                <span key={s._id}>
                  {i > 0 && ", "}
                  {s.name} <span className="tabular-nums">{s.validityMonths}</span> months
                </span>
              ))}
            </p>
          )}
        </section>

        <section className="space-y-3">
          <SectionTitle icon={CalendarClock} title="Shifts" />
          <Link
            href="/settings?tab=shifts"
            className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
          >
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Shifts in Settings</span>
              <span className="block text-xs text-muted-foreground">
                The plant's shifts and which count for shift cover. Coverage questions ask per shift.
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          </Link>
        </section>
      </div>
    </div>
  )
}
