import { useState, type ReactNode } from "react"
import { useQuery } from "convex/react"
import { Link } from "wouter"
import {
  BadgeCheck,
  CalendarClock,
  ChevronDown,
  Eye,
  GraduationCap,
  MessageCircleWarning,
  RotateCcw,
  ShieldAlert,
  UserRoundCheck,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useCheckIn } from "@/lib/checkIn"
import { formatDate } from "@/lib/time"
import { cn } from "@/lib/utils"
import { phoneLocation, setPhoneMode } from "@/components/phone/phoneStore"
import { AssignDialog } from "./training/AssignDialog"
import { SkillCellSheet } from "./skills/SkillCellSheet"

const MAX_ROWS = 6
const DAY = 24 * 60 * 60 * 1000

type AssignState = {
  trainingId?: Id<"trainings">
  personIds: Id<"people">[]
  skillId?: Id<"skills">
  dueAt: number
  reason: string
}

// Home: the people side of Learn, each row with one action that does the
// work right here.
// - Try-outs waiting for the checked-in trainer ("Watch now").
// - Re-training grouped by the document change that caused it.
// - Expired and expiring levels: Renew or Plan opens the assign dialog with
//   the Skill's Training and a due date before the level runs out.
// - People who did not pass the same Training twice: time for coaching.
// Renders nothing when there is nothing to show.
export function HomeSkillRows() {
  const data = useQuery(api.home.skillAttention)
  const { person } = useCheckIn()
  const tryOuts = useQuery(api.tryOuts.inbox, person ? { personId: person._id } : "skip")
  const [assign, setAssign] = useState<AssignState | null>(null)
  const [cell, setCell] = useState<{ personId: Id<"people">; skillId: Id<"skills"> } | null>(null)

  if (!data) return null
  const openTryOuts = (tryOuts ?? []).filter((r) => r.status === "open")
  const count = openTryOuts.length + data.retrain.length + data.expiry.length + data.coaching.length
  if (count === 0) return null
  const expiry = data.expiry.slice(0, MAX_ROWS)

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">People and Skills</h2>
        <Badge variant="secondary" className="h-5 px-1.5 text-xs">
          {count}
        </Badge>
        <Link
          href="/learn?tab=matrix"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Skill matrix
        </Link>
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {openTryOuts.map((r) => (
            <Row
              key={r._id}
              icon={UserRoundCheck}
              tone="primary"
              title={
                r.kind === "walkthrough"
                  ? `${r.personName} asks for a walk-through: ${r.trainingTitle}`
                  : `${r.personName} is ready for a try-out: ${r.trainingTitle}`
              }
              note={
                <>
                  <span className="font-mono">{r.trainingCode}</span> · asked {formatDate(r.createdAt)}
                  {r.trainerName ? ` · for ${r.trainerName}` : " · any trainer"}
                </>
              }
              action={
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 gap-1.5 text-xs"
                  onClick={() => {
                    phoneLocation.navigate(`/m/tryout/${r._id}`)
                    setPhoneMode("popup")
                  }}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Watch now
                </Button>
              }
            />
          ))}

          {data.retrain.map((g) => {
            const names = [...new Set(g.people.map((p) => p.name))]
            const skills = [...new Set(g.people.map((p) => p.skillName))]
            const personIds = [...new Set(g.people.map((p) => p.personId))]
            return (
              <Row
                key={g.key}
                icon={RotateCcw}
                tone="danger"
                title={`${names.length} ${names.length === 1 ? "person needs" : "people need"} re-training: ${skills.join(", ")}`}
                note={
                  <>
                    {names.slice(0, 3).join(", ")}
                    {names.length > 3 ? ` and ${names.length - 3} more` : ""} ·{" "}
                    {g.documentId && g.version ? (
                      <Link
                        href={`/docs/${g.documentId}?v=${g.version}${g.version > 1 ? `&compare=${g.version - 1}` : ""}`}
                        className="underline-offset-2 hover:text-foreground hover:underline"
                      >
                        {g.namingCode} v{g.version} changed{g.changeNote ? `: ${g.changeNote}` : ""}
                      </Link>
                    ) : (
                      g.reason
                    )}
                  </>
                }
                action={
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1 text-xs">
                        Re-train
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                        Assign the Training again, or sign off that the change was explained.
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        disabled={!g.training}
                        onSelect={() =>
                          setAssign({
                            trainingId: g.training?._id,
                            personIds,
                            dueAt: Date.now() + 14 * DAY,
                            reason: g.namingCode
                              ? `Re-train after ${g.namingCode} v${g.version} changed`
                              : "Re-train after a significant change",
                          })
                        }
                      >
                        <GraduationCap className="mr-2 h-4 w-4" />
                        {g.training
                          ? `Assign ${g.training.code} to ${personIds.length === 1 ? names[0].split(" ")[0] : `all ${personIds.length}`}`
                          : "No Training to assign yet"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {g.people.map((p) => (
                        <DropdownMenuItem
                          key={`${p.personId}-${p.skillId}`}
                          onSelect={() => setCell({ personId: p.personId, skillId: p.skillId })}
                        >
                          <BadgeCheck className="mr-2 h-4 w-4" />
                          <span className="truncate">
                            Sign off {p.name.split(" ")[0]} · {p.skillName}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
              />
            )
          })}

          {expiry.map((it) => {
            const expired = it.kind === "expired"
            const when = expired
              ? `Level ${it.level} expired ${formatDate(it.expiresAt)}, counts as 0`
              : `Level ${it.level} expires ${formatDate(it.expiresAt)} (in ${Math.max(0, it.daysLeft)} ${it.daysLeft === 1 ? "day" : "days"})`
            return (
              <Row
                key={`${it.personId}-${it.skillId}`}
                icon={expired ? ShieldAlert : CalendarClock}
                tone={expired ? "danger" : "warning"}
                title={`${it.personName} · ${it.skillName}`}
                note={
                  <>
                    {when}
                    {it.training ? (
                      <>
                        {" "}
                        · <span className="font-mono">{it.training.code}</span>
                      </>
                    ) : (
                      " · no Training linked, sign off in practice"
                    )}
                  </>
                }
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 text-xs"
                    onClick={() =>
                      it.training
                        ? setAssign({
                            trainingId: it.training._id,
                            personIds: [it.personId],
                            skillId: it.skillId,
                            // Renew: two weeks from now. Plan: done the day before the level runs out.
                            dueAt: expired ? Date.now() + 14 * DAY : Math.max(Date.now() + DAY, it.expiresAt - DAY),
                            reason: expired ? `Renew ${it.skillName}: it expired` : `Renew ${it.skillName} before it expires`,
                          })
                        : setCell({ personId: it.personId, skillId: it.skillId })
                    }
                  >
                    {it.training ? (expired ? "Renew" : "Plan") : "Sign off"}
                  </Button>
                }
              />
            )
          })}
          {data.expiry.length > expiry.length && (
            <Link
              href="/learn?tab=matrix&status=expired"
              className="block px-4 py-2 text-center text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              {data.expiry.length - expiry.length} more in the Skill matrix
            </Link>
          )}

          {data.coaching.map((c) => (
            <Row
              key={`${c.personId}-${c.trainingId}`}
              icon={MessageCircleWarning}
              tone="warning"
              title={`${c.personName} did not pass ${c.trainingTitle} ${c.fails === 2 ? "twice" : `${c.fails} times`}`}
              note={
                <>
                  <span className="rounded bg-amber-100 px-1 font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    x{c.fails} not passed
                  </span>{" "}
                  <span className="font-mono">{c.trainingCode}</span> · last {formatDate(c.lastAt)}. Walk them through it at
                  the line.
                </>
              }
              action={
                <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" asChild>
                  <Link href={`/learn?tab=records&person=${c.personId}&failed=1`}>See answers</Link>
                </Button>
              }
            />
          ))}
        </CardContent>
      </Card>

      {assign && (
        <AssignDialog
          open
          onOpenChange={(o) => !o && setAssign(null)}
          trainingId={assign.trainingId}
          personIds={assign.personIds}
          skillId={assign.skillId}
          defaultDueAt={assign.dueAt}
          reason={assign.reason}
        />
      )}
      <SkillCellSheet
        personId={cell?.personId ?? null}
        skillId={cell?.skillId ?? null}
        onOpenChange={(o) => !o && setCell(null)}
      />
    </div>
  )
}

function Row({
  icon: Icon,
  tone,
  title,
  note,
  action,
}: {
  icon: typeof RotateCcw
  tone: "primary" | "warning" | "danger"
  title: string
  note: ReactNode
  action: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          tone === "primary" && "bg-primary/10 text-primary",
          tone === "warning" && "bg-amber-500/10 text-amber-600",
          tone === "danger" && "bg-red-500/10 text-red-600",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{note}</span>
      </span>
      {action}
    </div>
  )
}
