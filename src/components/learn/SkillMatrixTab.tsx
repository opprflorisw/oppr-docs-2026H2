import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { Link } from "wouter"
import { AlertTriangle, CalendarClock, Grid3x3, Moon, RotateCcw, Settings2, Sunrise, Sunset, Users } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { initials } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import { SkillCellSheet } from "./skills/SkillCellSheet"
import { expiryText, LevelDots, levelName, SkillLegend, STATUS_META, type SkillStatus } from "./skills/skillUi"

const ALL = "all"

// Learn tab: the Skill matrix, people against Skills, current against target
// level. Answers "who can run line 2 tonight?" and "who needs re-training?"
// at a glance. A cell opens the level's history, its proof and the sign-off.
export function SkillMatrixTab() {
  const [profileId, setProfileId] = useState<string>(ALL)
  const [area, setArea] = useState<string>(ALL)
  const [tonight, setTonight] = useState(false)
  const [open, setOpen] = useState<{ personId: Id<"people">; skillId: Id<"skills"> } | null>(null)

  const data = useQuery(api.skills.matrix, {
    profileId: profileId === ALL ? undefined : (profileId as Id<"skillProfiles">),
    area: area === ALL ? undefined : area,
  })
  const coverage = useQuery(api.skills.coverage, tonight ? {} : "skip")
  const qualifiedIds = useMemo(() => new Set<string>(coverage?.qualified.map((p) => p._id) ?? []), [coverage])

  const totals = useMemo(() => {
    const t = { people: 0, gaps: 0, expiring: 0, expired: 0, retrain: 0, complete: 0 }
    for (const p of data?.people ?? []) {
      if (p.summary.targets === 0) continue
      t.people++
      t.gaps += p.summary.gaps
      t.expiring += p.summary.expiring
      t.expired += p.summary.expired
      t.retrain += p.summary.retrain
      if (p.summary.atTarget === p.summary.targets) t.complete++
    }
    return t
  }, [data])

  if (data === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full max-w-lg" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  if (data.totalSkills === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Grid3x3 className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">No Skills yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Add Skills and Skill profiles in Settings. The matrix then shows everyone's level against
            their target, with gaps, expiring Skills and re-training needs.
          </p>
          <Button size="sm" variant="outline" className="mt-1" asChild>
            <Link href="/settings?tab=skills">Set up Skills</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters and the quick question */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={profileId} onValueChange={setProfileId}>
          <SelectTrigger className="h-8 w-[200px] text-xs">
            <SelectValue placeholder="All Skill profiles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-xs">
              All Skill profiles
            </SelectItem>
            {data.profiles.map((p) => (
              <SelectItem key={p._id} value={p._id} className="text-xs">
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="All areas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-xs">
              All areas
            </SelectItem>
            {data.areas.map((a) => (
              <SelectItem key={a.code} value={a.code} className="text-xs">
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={tonight ? "default" : "outline"}
          className="h-8 gap-1.5 text-xs"
          aria-pressed={tonight}
          onClick={() => setTonight((t) => !t)}
        >
          <Moon className="h-3.5 w-3.5" />
          Who can run line 2 tonight?
        </Button>
        <div className="ml-auto flex flex-wrap gap-1.5 text-[11px]">
          <Tally label="at target" value={`${totals.complete} of ${totals.people}`} />
          <Tally label="gaps" value={totals.gaps} tone={totals.gaps ? "warn" : undefined} />
          <Tally label="expiring" value={totals.expiring} tone={totals.expiring ? "warn" : undefined} />
          <Tally label="expired" value={totals.expired} tone={totals.expired ? "danger" : undefined} />
          <Tally label="re-train needed" value={totals.retrain} tone={totals.retrain ? "danger" : undefined} />
        </div>
      </div>

      {tonight && <TonightPanel coverage={coverage} />}

      {data.skills.length === 0 || data.people.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {data.skills.length === 0 ? "No Skills match these filters" : "No one holds or needs these Skills"}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {data.skills.length === 0
                ? "Pick another Skill profile or area."
                : "Assign a Skill profile to people in Settings to measure them against it."}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              onClick={() => {
                setProfileId(ALL)
                setArea(ALL)
              }}
            >
              Show everything
            </Button>
          </CardContent>
        </Card>
      ) : (
        <MatrixScroller>
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 w-[250px] min-w-[250px] border-b border-r bg-card px-4 py-2 text-left align-bottom text-[11px] font-medium text-muted-foreground">
                  <div className="flex items-end justify-between gap-2">
                    <span>Person</span>
                    <span>At target</span>
                  </div>
                </th>
                {data.skills.map((s) => (
                  <th
                    key={s._id}
                    className="w-[84px] min-w-[84px] max-w-[84px] border-b border-l px-1 py-2 text-center align-bottom font-medium"
                    title={s.name}
                  >
                    <div className="line-clamp-4 break-words text-[10.5px] leading-tight">{s.name}</div>
                    <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                      {s.area ?? ""}
                      {s.validityMonths ? ` · ${s.validityMonths} mo` : ""}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.people.map((p) => {
                const qualified = qualifiedIds.has(p._id)
                const dim = tonight && coverage !== undefined && !qualified
                return (
                  <tr key={p._id} className={cn("group transition-opacity", dim && "opacity-40")}>
                    <td
                      className={cn(
                        "sticky left-0 z-10 w-[250px] min-w-[250px] border-b border-r bg-card px-4 py-2",
                        tonight && qualified && "bg-emerald-50 shadow-[inset_3px_0_0_#10b981] dark:bg-emerald-950",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Link href={`/learn/people/${p._id}`} className="group/name flex min-w-0 flex-1 items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                            {initials(p.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium group-hover/name:underline">
                              {p.name}
                            </span>
                            <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                              <ShiftIcon shift={p.shift} className="h-3 w-3 shrink-0" />
                              <span className="truncate">{p.role}</span>
                            </span>
                          </span>
                        </Link>
                        <div className="w-14 shrink-0">
                          <Progress done={p.summary.atTarget} total={p.summary.targets} />
                        </div>
                      </div>
                      {p.profiles.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1 pl-[38px]">
                          {p.profiles.map((pr) => (
                            <span key={pr._id} className="rounded bg-primary/10 px-1.5 py-px text-[10px] text-primary">
                              {pr.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    {data.skills.map((s) => {
                      const c = p.cells[s._id]
                      return (
                        <td key={s._id} className="border-b border-l p-1 text-center">
                          {c && (
                            <MatrixCell
                              cell={c}
                              label={`${p.name}, ${s.name}`}
                              onOpen={() => setOpen({ personId: p._id, skillId: s._id })}
                            />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </MatrixScroller>
      )}

      <SkillLegend />

      <SkillCellSheet
        personId={open?.personId ?? null}
        skillId={open?.skillId ?? null}
        onOpenChange={(o) => !o && setOpen(null)}
      />
    </div>
  )
}

/**
 * The matrix scrolls sideways when there are many Skills. The person column
 * stays put, and a fade on either edge shows there is more to see.
 */
function MatrixScroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () =>
      setEdges({
        left: el.scrollLeft > 2,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
      })
    update()
    el.addEventListener("scroll", update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => {
      el.removeEventListener("scroll", update)
      ro.disconnect()
    }
  }, [])
  return (
    <Card className="relative overflow-hidden">
      <div ref={ref} className="overflow-x-auto">
        {children}
      </div>
      {edges.left && (
        <div className="pointer-events-none absolute inset-y-0 left-[250px] z-20 w-6 bg-gradient-to-r from-black/10 to-transparent dark:from-black/40" />
      )}
      {edges.right && (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-10 bg-gradient-to-l from-card to-transparent" />
      )}
    </Card>
  )
}

type ShiftKey = "early" | "late" | "night"

/** The shift as early, late or night, whatever form the backend sends it in. */
function shiftKey(shift: string | null | undefined): ShiftKey | null {
  if (!shift) return null
  const s = shift.toLowerCase()
  if (s.includes("night")) return "night"
  if (s.includes("late")) return "late"
  if (s.includes("early") || s.includes("day")) return "early"
  return null
}

const SHIFT_LABEL: Record<ShiftKey, string> = {
  early: "Early shift",
  late: "Late shift",
  night: "Night shift",
}
const SHIFT_ORDER: ShiftKey[] = ["early", "late", "night"]

function ShiftIcon({ shift, className }: { shift: string | null | undefined; className?: string }) {
  const k = shiftKey(shift)
  if (k === "night") return <Moon className={className} aria-label="Night shift" />
  if (k === "late") return <Sunset className={className} aria-label="Late shift" />
  if (k === "early") return <Sunrise className={className} aria-label="Early shift" />
  return null
}

type MatrixCellData = {
  level: number
  target: number | null
  status: string
  expiresAt: number | null
  retrainReason: string | null
}

function MatrixCell({ cell, label, onOpen }: { cell: MatrixCellData; label: string; onOpen: () => void }) {
  const status = cell.status as SkillStatus
  const title = [
    label,
    `Level ${cell.level} (${levelName(cell.level)})${cell.target != null ? `, target ${cell.target}` : ""}`,
    status !== "ok" && status !== "none" ? STATUS_META[status].label : null,
    cell.level > 0 && cell.expiresAt != null ? expiryText(cell.expiresAt) : null,
    cell.retrainReason,
  ]
    .filter(Boolean)
    .join("\n")
  const empty = cell.level === 0 && cell.target == null
  return (
    <button
      type="button"
      onClick={onOpen}
      title={title}
      aria-label={title}
      className={cn(
        "relative flex h-9 w-full items-center justify-center rounded-md transition-colors hover:ring-1 hover:ring-primary/50",
        status === "gap" && "bg-amber-50 dark:bg-amber-950/30",
        (status === "expired" || status === "retrain") && "bg-red-50 dark:bg-red-950/30",
        status === "expiring" && "ring-1 ring-inset ring-amber-400",
      )}
    >
      {empty ? (
        <span className="text-muted-foreground/40">·</span>
      ) : (
        <LevelDots level={cell.level} target={cell.target} status={status} />
      )}
      {status === "retrain" && <RotateCcw className="absolute right-1 top-1 h-2.5 w-2.5 text-red-600" />}
      {status === "expired" && <AlertTriangle className="absolute right-1 top-1 h-2.5 w-2.5 text-red-600" />}
      {status === "expiring" && <CalendarClock className="absolute right-1 top-1 h-2.5 w-2.5 text-amber-600" />}
    </button>
  )
}

function Progress({ done, total }: { done: number; total: number }) {
  if (total === 0) return <span className="text-[11px] text-muted-foreground">No profile</span>
  const complete = done === total
  return (
    <div className="space-y-1">
      <div
        className={cn(
          "text-[11px] tabular-nums",
          complete ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
        )}
      >
        {done} of {total}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", complete ? "bg-emerald-500" : "bg-amber-500")}
          style={{ width: `${Math.round((done / total) * 100)}%` }}
        />
      </div>
    </div>
  )
}

function Tally({ label, value, tone }: { label: string; value: number | string; tone?: "warn" | "danger" }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-muted-foreground",
        tone === "warn" &&
          "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400",
        tone === "danger" &&
          "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400",
      )}
    >
      <span className="font-semibold tabular-nums">{value}</span> {label}
    </span>
  )
}

type Coverage = FunctionReturnType<typeof api.skills.coverage> | undefined

function TonightPanel({ coverage }: { coverage: Coverage }) {
  if (coverage === undefined) return <Skeleton className="h-28 w-full" />
  if (coverage.requirements.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-4 text-xs text-muted-foreground">
          <Settings2 className="h-4 w-4" />
          There is no Line 2 operator Skill profile with targets yet. Add one in Settings, on the Skills tab.
        </CardContent>
      </Card>
    )
  }
  const night = coverage.byShift.find((g) => shiftKey(g.shift) === "night")
  const headline = night
    ? `${night.people.length} ${night.people.length === 1 ? "person" : "people"} on the night shift can run line 2 tonight`
    : `${coverage.qualified.length} ${coverage.qualified.length === 1 ? "person" : "people"} can run line 2`
  // Always show early, late and night, even when no one qualified works one.
  const groups: { key: string; shift: string | null; label: string; people: (typeof coverage.byShift)[number]["people"] }[] =
    SHIFT_ORDER.map((k) => ({
      key: k,
      shift: k,
      label: SHIFT_LABEL[k],
      people: coverage.byShift.filter((g) => shiftKey(g.shift) === k).flatMap((g) => g.people),
    }))
  const unset = coverage.byShift.filter((g) => shiftKey(g.shift) === null).flatMap((g) => g.people)
  if (unset.length > 0) groups.push({ key: "none", shift: null, label: "No shift set", people: unset })
  return (
    <Card className="border-primary/30">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Moon className="h-4 w-4 text-primary" />
              {headline}
            </h3>
            <p className="text-xs text-muted-foreground">
              Fully qualified as {coverage.profile?.name ?? "these Skills"}: every target met, nothing
              expired, no re-training open.
            </p>
          </div>
          <div className="flex max-w-md flex-wrap justify-end gap-1">
            {coverage.requirements.map((r) => (
              <span
                key={r.skillId}
                className="rounded border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {r.skillName} · level {r.level}
              </span>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.key} className={cn("rounded-lg border p-3", shiftKey(g.shift) === "night" && "border-primary/40")}>
              <div className="mb-2 flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  {g.shift ? <ShiftIcon shift={g.shift} className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                  {g.label}
                  {shiftKey(g.shift) === "night" && <span className="font-normal text-muted-foreground">· tonight</span>}
                </span>
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[11px] tabular-nums",
                    g.people.length === 0
                      ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                      : g.people.length === 1
                        ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                        : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
                  )}
                >
                  {g.people.length}
                </span>
              </div>
              {g.people.length === 0 ? (
                <p className="text-[11px] text-red-700 dark:text-red-400">No one fully qualified.</p>
              ) : (
                <ul className="space-y-1">
                  {g.people.map((p) => (
                    <li key={p._id} className="text-xs">
                      <Link href={`/learn/people/${p._id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      {p.expiringSoon.length > 0 && (
                        <span className="ml-1 text-[11px] text-amber-700 dark:text-amber-400">
                          · {p.expiringSoon.join(", ")} expiring soon
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        {coverage.almost.length > 0 && (
          <div className="space-y-1 border-t pt-2">
            <div className="text-[11px] font-medium text-muted-foreground">Not yet, and why</div>
            <ul className="space-y-0.5">
              {coverage.almost.map((p) => (
                <li key={p._id} className="text-xs">
                  <Link href={`/learn/people/${p._id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  {shiftKey(p.shift) && (
                    <span className="text-muted-foreground"> ({SHIFT_LABEL[shiftKey(p.shift)!].toLowerCase()})</span>
                  )}
                  <span className="text-muted-foreground">
                    : {p.missing.map((m) => `${m.skillName} ${m.reason}`).join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
