import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Link, useLocation, useRoute, useSearch } from "wouter"
import { toast } from "sonner"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { useCheckIn } from "@/lib/checkIn"
import { formatDate, formatDateTime } from "@/lib/time"
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  FileCheck2,
  History,
  Layers,
  Moon,
  Printer,
  Sunrise,
  Sunset,
  Target,
  UserRound,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import type { FunctionReturnType } from "convex/server"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { SkillCellSheet } from "@/components/learn/skills/SkillCellSheet"
import {
  expiryText,
  fmtDate,
  fmtScore,
  LevelDots,
  errorText,
  levelName,
  levelWords,
  SkillLegend,
  sourceText,
  StatusChip,
  type SkillStatus,
} from "@/components/learn/skills/skillUi"
import { KIND_LABEL, isEngineerOrAdmin } from "@/lib/roles"

// /learn/people/:id: one person's Skills with levels and validity, what they
// still need against their Skill profiles, how each level was reached, and
// the Training records behind it. What a plant manager or an inspector asks.
export function PersonSkillsPage() {
  const [, params] = useRoute<{ id: string }>("/learn/people/:id")
  const id = params?.id ?? ""
  const data = useQuery(api.skills.personDetail, id ? { personId: id } : "skip")
  const [openSkill, setOpenSkill] = useState<Id<"skills"> | null>(null)
  const search = useSearch()
  const [location, navigate] = useLocation()
  const fileView = new URLSearchParams(search).get("view") === "file"
  const { person: me } = useCheckIn()

  if (data === undefined) {
    return (
      <div className="flex flex-col">
        <TopBar breadcrumb={[{ label: "Learn", href: "/learn?tab=matrix" }, { label: "Person" }]} />
        <div className="mx-auto w-full max-w-6xl space-y-3 p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }
  if (data === null) {
    return (
      <div className="flex flex-col">
        <TopBar breadcrumb={[{ label: "Learn", href: "/learn?tab=matrix" }, { label: "Person" }]} />
        <Card className="mx-auto mt-10 w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <UserRound className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">This person was not found</p>
            <p className="text-xs text-muted-foreground">They may have been removed when the showcase was reseeded.</p>
            <Button size="sm" variant="outline" className="mt-1" asChild>
              <Link href="/learn?tab=matrix">Back to the Skill matrix</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { person } = data
  const ShiftIcon =
    person.shift === "night" ? Moon : person.shift === "late" ? Sunset : person.shift === "early" ? Sunrise : null
  const attention = data.retrain.length + data.expired.length + data.gaps.length

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Learn", href: "/learn?tab=matrix" }, { label: person.name }]} />
      <PageHeader
        icon={UserRound}
        title={person.name}
        subtitle={
          <span className="inline-flex items-center gap-1">
            {ShiftIcon && <ShiftIcon className="h-3 w-3" />}
            {person.role}
            {` · ${KIND_LABEL[person.kind]}`}
          </span>
        }
        actions={
          <>
            {isEngineerOrAdmin(me) && (
              <ProfilesPopover personId={person._id} current={data.profiles.map((p) => p._id)} engineerId={me._id} />
            )}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`${location}?view=file`)}>
              <Printer className="h-3.5 w-3.5" />
              Training file
            </Button>
          </>
        }
      />
      {fileView && <TrainingFile data={data} onClose={() => navigate(location, { replace: true })} />}

      <div className="mx-auto grid w-full max-w-6xl gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="space-y-5">
          {/* Profiles */}
          {data.profiles.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              No Skill profile assigned, so there are no targets to measure against. Assign one in Settings,
              on the Skills tab.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.profiles.map((p) => {
                const done = p.targets > 0 && p.atTarget === p.targets
                return (
                  <Card key={p._id}>
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{p.name}</span>
                        {done ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Target className="h-4 w-4 text-amber-500" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-semibold tabular-nums text-foreground">
                          {p.atTarget} of {p.targets}
                        </span>{" "}
                        Skills at target{done ? ", fully qualified" : ""}
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full", done ? "bg-emerald-500" : "bg-amber-500")}
                          style={{ width: `${p.targets ? Math.round((p.atTarget / p.targets) * 100) : 0}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Skills */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Skills</h2>
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {data.skills.length}
              </Badge>
              {attention > 0 && (
                <span className="ml-auto text-xs text-amber-700 dark:text-amber-400">
                  {attention} {attention === 1 ? "needs" : "need"} attention
                </span>
              )}
            </div>
            {data.skills.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-xs text-muted-foreground">
                  No Skills held or needed yet. Passing a Training sets level 1 on the Skills it covers.
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Skill</th>
                        <th className="px-3 py-2 text-left font-medium">Level</th>
                        <th className="px-3 py-2 text-left font-medium">Status</th>
                        <th className="px-3 py-2 text-left font-medium">Validity</th>
                        <th className="px-3 py-2 text-left font-medium">How</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.skills.map((s) => {
                        const status = s.status as SkillStatus
                        return (
                          <tr
                            key={s.skill._id}
                            onClick={() => setOpenSkill(s.skill._id)}
                            className="cursor-pointer transition-colors hover:bg-muted/40"
                          >
                            <td className="px-4 py-2.5">
                              <div className="text-sm font-medium">{s.skill.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {s.target != null ? `Target ${s.target} · ${levelName(s.target)}` : "Not in a profile"}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <LevelDots level={s.level} target={s.target} status={status} />
                                <span>
                                  {s.level} · {levelName(s.level)}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              {status === "ok" ? (
                                <span className="text-emerald-700 dark:text-emerald-400">
                                  {s.target != null ? "At target" : "Held"}
                                </span>
                              ) : status === "none" ? (
                                <span className="text-muted-foreground">–</span>
                              ) : (
                                <StatusChip status={status} />
                              )}
                            </td>
                            <td
                              className={cn(
                                "whitespace-nowrap px-3 py-2.5 text-muted-foreground",
                                status === "expired" && "font-medium text-red-600",
                                status === "expiring" && "font-medium text-amber-700",
                              )}
                            >
                              {s.level > 0 ? expiryText(s.expiresAt) : "–"}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {s.level > 0 ? (
                                <>
                                  {sourceText(s.source, s.signedOffBy)}
                                  <div className="text-xs">{fmtDate(s.achievedAt)}</div>
                                </>
                              ) : (
                                "–"
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
            <SkillLegend />
          </div>

          {/* What closes the gaps */}
          {(data.gaps.length > 0 || data.retrain.length > 0 || data.expired.length > 0) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">What closes the gaps</h2>
              </div>
              <Card>
                <CardContent className="divide-y p-0">
                  {[...data.retrain, ...data.expired, ...data.gaps].map((g) => {
                    const training = g.offered.find((t) => !t.passed) ?? g.offered[0] ?? null
                    const viaTraining = g.nextStep === "training" && training
                    return (
                      <div key={g.skill._id} className="flex items-center gap-3 px-4 py-3">
                        <button type="button" onClick={() => setOpenSkill(g.skill._id)} className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-sm font-medium hover:underline">{g.skill.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {g.status === "retrain"
                              ? `Re-train needed: ${g.retrainReason ?? "a linked document changed"}`
                              : g.status === "expired"
                                ? `Level ${g.level} ${expiryText(g.expiresAt).toLowerCase()}`
                                : `Level ${g.effectiveLevel} of ${g.target}`}
                            {viaTraining ? "" : ". Needs an Engineer's practice sign-off."}
                          </span>
                        </button>
                        {viaTraining ? (
                          <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-xs" asChild>
                            <Link href={`/learn/trainings/${training._id}`}>
                              <span className="font-mono">{training.code}</span>
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 shrink-0 text-xs"
                            onClick={() => setOpenSkill(g.skill._id)}
                          >
                            Sign off
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">History</h2>
            </div>
            {data.events.length === 0 ? (
              <p className="rounded-lg border p-3 text-xs text-muted-foreground">
                Every level change, sign-off and re-training flag is recorded here.
              </p>
            ) : (
              <ol className="relative ml-1 space-y-3 border-l pl-4">
                {data.events.slice(0, 25).map((e) => (
                  <li key={e._id} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[21px] top-1 h-2 w-2 rounded-full border-2 border-background",
                        e.reason.startsWith("Re-train needed") ? "bg-red-500" : e.toLevel > e.fromLevel ? "bg-emerald-500" : "bg-primary",
                      )}
                    />
                    <div className="text-xs font-medium">
                      {e.skillName}
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        {e.fromLevel === e.toLevel ? `level ${e.toLevel}` : `${e.fromLevel} to ${e.toLevel}`}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{e.reason}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(e.at)}</div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Training records</h2>
            </div>
            {data.records.length === 0 ? (
              <p className="rounded-lg border p-3 text-xs text-muted-foreground">
                No Training records yet. Each passed Attempt leaves one: which version, the score and when.
              </p>
            ) : (
              <Card>
                <CardContent className="divide-y p-0">
                  {data.records.map((r) => (
                    <Link
                      key={r._id}
                      href={`/learn/attempts/${r.attemptId}`}
                      className="block px-3 py-2 transition-colors hover:bg-muted/50"
                    >
                      <div className="truncate text-xs font-medium">{r.trainingTitle}</div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">
                          {r.trainingCode} v{r.trainingVersion}
                        </span>{" "}
                        · {fmtScore(r.score)} · {fmtDate(r.passedAt)}
                      </div>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </aside>
      </div>

      <SkillCellSheet
        personId={openSkill ? person._id : null}
        skillId={openSkill}
        onOpenChange={(o) => !o && setOpenSkill(null)}
      />
    </div>
  )
}

type Detail = NonNullable<FunctionReturnType<typeof api.skills.personDetail>>

function recordText(r: Detail["records"][number] | undefined) {
  return r
    ? `Training record ${r.trainingCode} v${r.trainingVersion}, ${fmtScore(r.score)}, ${formatDate(r.passedAt)}`
    : "Passed a Training"
}

/** Engineers add or remove the Skill profiles a person is measured against. */
function ProfilesPopover({
  personId,
  current,
  engineerId,
}: {
  personId: Id<"people">
  current: Id<"skillProfiles">[]
  engineerId: Id<"people">
}) {
  const catalogue = useQuery(api.skills.catalogue)
  const assign = useMutation(api.people.assignProfiles)
  const [busy, setBusy] = useState(false)
  async function toggle(id: Id<"skillProfiles">) {
    setBusy(true)
    try {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      await assign({ personId, profileIds: next, engineerPersonId: engineerId })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          Profiles
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <p className="px-2 pb-2 text-xs text-muted-foreground">Skill profiles this person is measured against.</p>
        {(catalogue?.profiles ?? []).map((p) => (
          <label key={p._id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 text-sm hover:bg-muted">
            <Checkbox checked={current.includes(p._id)} disabled={busy} onCheckedChange={() => void toggle(p._id)} />
            {p.name}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The person's training file, laid out to print: every Skill with its level
 * and how it was reached, every Training record and every level change with
 * its evidence, and the print date. What an auditor or inspector asks for.
 */
function TrainingFile({ data, onClose }: { data: Detail; onClose: () => void }) {
  const { person } = data
  const held = data.allSkills.filter((s) => s.level >= 1 || (s.target ?? 0) > 0)
  return (
    <div id="training-file" className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 14mm; }
          body * { visibility: hidden; }
          #training-file, #training-file * { visibility: visible; }
          #training-file { position: absolute; inset: 0; overflow: visible; }
        }
      `}</style>
      <div className="sticky top-0 flex items-center gap-2 border-b bg-background px-6 py-3 print:hidden">
        <span className="text-sm font-semibold">Training file: {person.name}</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={onClose}>
          Close
        </Button>
        <Button size="sm" className="gap-1.5" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" />
          Print
        </Button>
      </div>
      <article className="mx-auto max-w-3xl space-y-6 px-6 py-8 text-sm">
        <header className="space-y-1 border-b pb-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Training file</p>
          <h2 className="text-xl font-semibold">{person.name}</h2>
          <p className="text-muted-foreground">
            {person.role} · {KIND_LABEL[person.kind]}
            {data.profiles.length > 0 && ` · ${data.profiles.map((p) => `${p.name} (${p.atTarget} of ${p.targets} at target)`).join(", ")}`}
          </p>
          <p className="text-xs text-muted-foreground">Printed {formatDateTime(Date.now())}</p>
        </header>

        <section className="space-y-2">
          <h3 className="text-base font-semibold">Skills</h3>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">Skill</th>
                <th className="py-1.5 pr-2 font-medium">Level</th>
                <th className="py-1.5 pr-2 font-medium">Target</th>
                <th className="py-1.5 pr-2 font-medium">How it was reached</th>
                <th className="py-1.5 font-medium">Validity</th>
              </tr>
            </thead>
            <tbody>
              {held.map((s) => {
                const last = data.events.find((e) => e.skillId === s.skill._id && e.toLevel === s.level)
                const how =
                  s.level === 0
                    ? "Not trained"
                    : s.source === "seed"
                      ? "Migrated from the previous training register"
                      : s.source === "training"
                        ? recordText(data.records.find((r) => r._id === s.recordId))
                        : sourceText(s.source, s.signedOffBy)
                return (
                  <tr key={s.skill._id} className="border-b align-top">
                    <td className="py-1.5 pr-2 font-medium">{s.skill.name}</td>
                    <td className="py-1.5 pr-2">
                      {s.status === "expired" ? `0 (was ${levelWords(s.level)})` : levelWords(s.level)}
                    </td>
                    <td className="py-1.5 pr-2">{s.target != null ? s.target : "–"}</td>
                    <td className="py-1.5 pr-2">
                      {how}
                      {last && <div className="text-muted-foreground">{last.reason} ({formatDate(last.at)})</div>}
                    </td>
                    <td className="py-1.5">
                      {s.status === "retrain" ? `Re-train needed: ${s.retrainReason ?? ""}` : s.level > 0 ? expiryText(s.expiresAt) : "–"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        <section className="space-y-2">
          <h3 className="text-base font-semibold">Training records</h3>
          {data.records.length === 0 ? (
            <p className="text-xs text-muted-foreground">No Training records.</p>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Training</th>
                  <th className="py-1.5 pr-2 font-medium">Version</th>
                  <th className="py-1.5 pr-2 font-medium">Score</th>
                  <th className="py-1.5 font-medium">Passed</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((r) => (
                  <tr key={r._id} className="border-b">
                    <td className="py-1.5 pr-2">
                      <span className="font-mono">{r.trainingCode}</span> {r.trainingTitle}
                    </td>
                    <td className="py-1.5 pr-2">v{r.trainingVersion}</td>
                    <td className="py-1.5 pr-2">{fmtScore(r.score)}</td>
                    <td className="py-1.5">{formatDate(r.passedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-base font-semibold">Level changes and sign-offs</h3>
          {data.events.length === 0 ? (
            <p className="text-xs text-muted-foreground">No level changes recorded.</p>
          ) : (
            <table className="w-full border-collapse text-xs">
              <tbody>
                {data.events.map((e) => (
                  <tr key={e._id} className="border-b align-top">
                    <td className="w-28 py-1.5 pr-2 text-muted-foreground">{formatDate(e.at)}</td>
                    <td className="py-1.5 pr-2 font-medium">{e.skillName}</td>
                    <td className="w-20 py-1.5 pr-2">{e.fromLevel === e.toLevel ? `level ${e.toLevel}` : `${e.fromLevel} to ${e.toLevel}`}</td>
                    <td className="py-1.5">
                      {e.reason}
                      {e.by ? <span className="text-muted-foreground"> · by {e.by}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <footer className="border-t pt-3 text-xs text-muted-foreground">
          Oppr Knowledge · Training file of {person.name} · printed {formatDate(Date.now())}
        </footer>
      </article>
    </div>
  )
}
