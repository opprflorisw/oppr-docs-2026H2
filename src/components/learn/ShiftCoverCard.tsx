import { useQuery } from "convex/react"
import { Link } from "wouter"
import { ChevronRight, Users } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { coverTone, useShifts } from "./skills/skillUi"

// Home: shift cover. For every Skill profile in a coverage question marked
// "show on Home", how many fully qualified people work each shift. Red for
// nobody, amber for one, green for two or more. A row opens the Skill matrix
// with that profile and shift's cover question answered.
export function ShiftCoverCard({ engineer }: { engineer: boolean }) {
  const questions = useQuery(api.coverageQuestions.list)
  if (questions === undefined) return <Skeleton className="h-40 w-full" />
  const profiles: { profileId: Id<"skillProfiles">; name: string }[] = []
  for (const q of questions) {
    if (!q.showOnHome || !q.profileName || profiles.some((p) => p.profileId === q.profileId)) continue
    profiles.push({ profileId: q.profileId, name: q.profileName })
  }

  return (
    <section className="space-y-2" aria-labelledby="shift-cover-title">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h2 id="shift-cover-title" className="text-sm font-semibold">
          Shift cover
        </h2>
      </div>
      {profiles.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          {engineer ? (
            <>
              No coverage question is shown on Home yet.{" "}
              <Link href="/learn/skills/coverage" className="font-medium text-foreground underline-offset-2 hover:underline">
                Pick one in the Skills workspace
              </Link>
              .
            </>
          ) : (
            "An Engineer can show who can run each line per shift here."
          )}
        </p>
      ) : (
        profiles.map((p) => <ProfileCover key={p.profileId} profileId={p.profileId} name={p.name} engineer={engineer} />)
      )}
    </section>
  )
}

function ProfileCover({ profileId, name, engineer }: { profileId: Id<"skillProfiles">; name: string; engineer: boolean }) {
  const coverage = useQuery(api.skills.coverage, { profileId })
  const shifts = useShifts()
  const next = shifts.next()
  // One line per Training, even when it proves several required Skills.
  const stuck = [...new Map((coverage?.onHold ?? []).map((h) => [h.trainingId, h])).values()]
  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b px-3 py-2 text-xs font-medium">
          Who can run <span className="text-foreground">{name}</span>
        </div>
        {stuck.length > 0 && (
          // The cause first: a cover of 0 after a change is not a staffing
          // problem but a Training that waits for an update (LD2).
          <p className="border-b bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" data-testid="cover-on-hold">
            Cover is paused by a document change: people who must re-train cannot until{" "}
            {stuck.map((h, i) => (
              <span key={h.trainingId}>
                {i > 0 && ", "}
                <Link href={`/learn/trainings/${h.trainingId}`} className="font-medium underline underline-offset-2">
                  {h.title}
                </Link>
              </span>
            ))}{" "}
            {stuck.length === 1 ? "is" : "are"} updated. {engineer ? "Open it to update the Training." : "An Engineer updates it."}
          </p>
        )}
        {coverage === undefined ? (
          <div className="space-y-1.5 p-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : (
          <ul className="divide-y">
            {shifts.cover.map((meta) => {
              const s = meta.key
              const people = coverage.byShift.filter((g) => g.shift === s).flatMap((g) => g.people)
              const n = people.length
              return (
                <li key={s}>
                  <Link
                    href={`/learn?tab=matrix&profile=${profileId}&cover=${s}`}
                    data-shift={s}
                    data-count={n}
                    className="group flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted/50"
                    title={n > 0 ? people.map((x) => x.name).join(", ") : `Nobody on the ${meta.label.toLowerCase()} is fully qualified`}
                  >
                    <span className="w-11 font-medium">{meta.short}</span>
                    <span className="tabular-nums text-muted-foreground">{meta.hours}</span>
                    {s === next && (
                      <span className="rounded bg-muted px-1 text-xs text-muted-foreground">next</span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-right text-muted-foreground">
                      {n === 0 ? "nobody" : people.map((x) => x.name.split(" ")[0]).join(", ")}
                    </span>
                    <span
                      className={cn(
                        "inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-xs font-semibold tabular-nums",
                        coverTone(n),
                      )}
                    >
                      {n}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
