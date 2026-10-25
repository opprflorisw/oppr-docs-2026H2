import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { Link, useLocation, useSearch } from "wouter"
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Grid3x3,
  Moon,
  Plus,
  Printer,
  Settings2,
  SlidersHorizontal,
  Sunrise,
  Sunset,
  UserPlus,
  Users,
  X,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { initials, useCheckIn } from "@/lib/checkIn"
import { formatDate } from "@/lib/time"
import { cn } from "@/lib/utils"
import { SkillCellSheet } from "./skills/SkillCellSheet"
import { AssignDialog } from "./training/AssignDialog"
import { TrainingGuidedCreation } from "./training/TrainingGuidedCreation"
import {
  CELL_FILL,
  coverTone,
  expiryText,
  LevelDots,
  levelWords,
  shiftKey,
  SkillLegend,
  STATUS_META,
  type ShiftKey,
  useShifts,
  type SkillStatus,
} from "./skills/skillUi"
import { isEngineerOrAdmin } from "@/lib/roles"

const ALL = "all"

// Below 1280px the matrix tightens: initial plus surname, narrow columns,
// and only the selected profile's Skills. Wider screens get the roomy layout.
const PERSON_COL = "w-[200px] min-w-[200px] max-w-[200px] min-[1280px]:w-[250px] min-[1280px]:min-w-[250px] min-[1280px]:max-w-[250px]"
const SKILL_COL = "w-[76px] min-w-[76px] max-w-[76px] min-[1280px]:w-[84px] min-[1280px]:min-w-[84px] min-[1280px]:max-w-[84px]"

type StatusFilter = "gap" | "expiring" | "expired" | "retrain"
const STATUS_FILTERS: StatusFilter[] = ["gap", "expiring", "expired", "retrain"]

function useNarrow() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(max-width: 1279px)")
      m.addEventListener("change", cb)
      return () => m.removeEventListener("change", cb)
    },
    () => window.matchMedia("(max-width: 1279px)").matches,
    () => false,
  )
}

/** "J. de Vries". */
function shortName(name: string) {
  const parts = name.split(/\s+/)
  if (parts.length < 2) return name
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`
}

// Learn tab: the Skill matrix, people against Skills, current against target
// level. Answers "who can run line 2 on the late shift?" and "who needs
// re-training?" at a glance. Filters live in the URL (profile, area, shift,
// cover, status) so Home and other pages link straight to an answer.
export function SkillMatrixTab() {
  const search = useSearch()
  const [location, navigate] = useLocation()
  const params = useMemo(() => new URLSearchParams(search), [search])
  const { person: me } = useCheckIn()
  const engineer = isEngineerOrAdmin(me)
  const narrow = useNarrow()
  const [open, setOpen] = useState<{ personId: Id<"people">; skillId: Id<"skills"> } | null>(null)
  const [makeFor, setMakeFor] = useState<Id<"skills"> | null>(null)
  const [assignFor, setAssignFor] = useState<{ skillId: Id<"skills">; personIds: Id<"people">[] } | null>(null)

  const questions = useQuery(api.coverageQuestions.list)
  const profileParam = params.get("profile")
  const area = params.get("area") ?? ALL
  const shifts = useShifts()
  const shiftFilter = shifts.normalize(params.get("shift"))
  const cover = shifts.normalize(params.get("cover"))
  const status = STATUS_FILTERS.find((s) => s === params.get("status")) ?? null

  function setParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(search)
    next.set("tab", "matrix")
    for (const [k, val] of Object.entries(patch)) {
      if (val === null || val === ALL) next.delete(k)
      else next.set(k, val)
    }
    navigate(`${location}?${next.toString()}`, { replace: true })
  }

  // Escape closes the status filter first, then the cover answer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || open || makeFor || assignFor) return
      const next = new URLSearchParams(window.location.search)
      if (next.get("status")) next.delete("status")
      else if (next.get("cover")) next.delete("cover")
      else return
      navigate(`${window.location.pathname}?${next.toString()}`, { replace: true })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [navigate, open, makeFor, assignFor])

  const all = useQuery(api.skills.matrix, {})
  // Below 1280px only one profile's Skills fit: the chosen one, else the first.
  const profileId =
    profileParam ?? (narrow ? all?.profiles[0]?._id ?? null : null)
  const data = useQuery(api.skills.matrix, {
    profileId: (profileId ?? undefined) as Id<"skillProfiles"> | undefined,
    area: area === ALL ? undefined : area,
  })
  const coverProfileId = (profileId ?? questions?.[0]?.profileId ?? undefined) as Id<"skillProfiles"> | undefined
  const coverage = useQuery(api.skills.coverage, cover ? { profileId: coverProfileId } : "skip")
  const coverShift: ShiftKey = cover ?? shifts.next() ?? "early"
  const qualifiedOnShift = useMemo(
    () =>
      new Set<string>(
        (coverage?.byShift ?? []).filter((g) => g.shift === coverShift).flatMap((g) => g.people.map((p) => p._id)),
      ),
    [coverage, coverShift],
  )

  const totals = useMemo(() => {
    const t = { people: 0, gap: 0, expiring: 0, expired: 0, retrain: 0, complete: 0 }
    for (const p of data?.people ?? []) {
      if (p.summary.targets === 0) continue
      t.people++
      t.gap += p.summary.gaps
      t.expiring += p.summary.expiring
      t.expired += p.summary.expired
      t.retrain += p.summary.retrain
      if (p.summary.atTarget === p.summary.targets) t.complete++
    }
    return t
  }, [data])

  // Skills that only one person holds at target: nobody covers when they are off.
  const singlePoints = useMemo(() => {
    const out: { skillName: string; personName: string }[] = []
    for (const s of data?.skills ?? []) {
      const holders = (data?.people ?? []).filter((p) => {
        const c = p.cells[s._id]
        return c && c.target != null && c.target > 0 && c.status !== "gap" && c.status !== "expired" && c.status !== "retrain"
      })
      const needed = (data?.people ?? []).filter((p) => (p.cells[s._id]?.target ?? 0) > 0).length
      if (holders.length === 1 && needed > 1) out.push({ skillName: s.name, personName: holders[0].name })
    }
    return out
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
            Add Skills and Skill profiles in the Skills workspace. The matrix then shows everyone's level against their
            target, with gaps, expiring Skills and re-training needs.
          </p>
          {engineer && (
            <Button size="sm" variant="outline" className="mt-1" asChild>
              <Link href="/learn/skills">Set up Skills</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  const rows = data.people.filter((p) => !shiftFilter || p.shift === shiftFilter)
  const matchesStatus = (p: (typeof rows)[number]) =>
    !status || data.skills.some((s) => p.cells[s._id]?.status === status)
  const profileName = data.profiles.find((p) => p._id === (coverProfileId ?? profileId))?.name ?? coverage?.profile?.name ?? "this profile"
  const activeFilters = (profileParam ? 1 : 0) + (area !== ALL ? 1 : 0) + (shiftFilter ? 1 : 0)
  const makeSkill = data.skills.find((s) => s._id === makeFor)
  const guidedProps = { open: makeFor !== null, onOpenChange: (o: boolean) => !o && setMakeFor(null), initialSkillIds: makeFor ? [makeFor] : [], initialPurpose: makeSkill ? `Prove the Skill "${makeSkill.name}"` : undefined } satisfies ComponentProps<typeof TrainingGuidedCreation>

  return (
    <div className="space-y-4" id="skill-matrix-print">
      <style>{PRINT_CSS}</style>

      {/* One row: the coverage questions, then Filters and Print on the right. */}
      <div className="flex flex-wrap items-center gap-1.5 print:hidden" data-tour="learn-matrix-coverage">
        {(questions ?? []).map((q) => {
          const active = cover !== null && cover === (q.shift ?? cover) && profileId === q.profileId
          return (
            <Button
              key={q._id}
              size="sm"
              variant="outline"
              aria-pressed={active}
              className={cn("h-8 gap-1.5 text-xs", active && "border-primary bg-primary/10 text-primary-strong hover:bg-primary/15")}
              onClick={() =>
                active ? setParams({ cover: null }) : setParams({ profile: q.profileId, cover: q.shift ?? shifts.next() })
              }
            >
              <ShiftIcon shift={q.shift} className="h-3.5 w-3.5" />
              {q.label}
            </Button>
          )
        })}
        <div className="ml-auto flex items-center gap-1.5">
          {engineer && (
            <Button size="sm" variant="outline" className="h-8 min-w-8 gap-1 px-2 text-xs" asChild>
              <Link
                href="/learn/skills/coverage"
                aria-label="Add or edit coverage questions"
                title="Add or edit coverage questions"
              >
                {questions && questions.length > 0 ? <Settings2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {questions && questions.length > 0 ? null : "Add a coverage question"}
              </Link>
            </Button>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" data-matrix-filters data-tour="learn-matrix-filters">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {activeFilters > 0 && (
                  <span className="rounded-full bg-primary/15 px-1.5 text-xs font-semibold tabular-nums text-primary-strong">
                    {activeFilters}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3">
              <FilterField label="Skill profile">
                <Select value={profileId ?? ALL} onValueChange={(v) => setParams({ profile: v })}>
                  <SelectTrigger className="h-9 text-sm" aria-label="Skill profile">
                    <SelectValue placeholder="All Skill profiles" />
                  </SelectTrigger>
                  <SelectContent>
                    {!narrow && <SelectItem value={ALL}>All Skill profiles</SelectItem>}
                    {data.profiles.map((p) => (
                      <SelectItem key={p._id} value={p._id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Area">
                <Select value={area} onValueChange={(v) => setParams({ area: v })}>
                  <SelectTrigger className="h-9 text-sm" aria-label="Area">
                    <SelectValue placeholder="All areas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All areas</SelectItem>
                    {data.areas.map((a) => (
                      <SelectItem key={a.code} value={a.code}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="People on shift">
                <Select value={shiftFilter ?? ALL} onValueChange={(v) => setParams({ shift: v })}>
                  <SelectTrigger className="h-9 text-sm" aria-label="People on shift">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Every shift</SelectItem>
                    {shifts.active.map((m) => (
                      <SelectItem key={m.key} value={m.key}>
                        {m.short} only
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
              <div className="space-y-1.5 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">Who can do this profile on a shift?</p>
                <div className="flex items-center gap-2">
                  <Select value={coverShift} onValueChange={(v) => setParams({ cover: v })}>
                    <SelectTrigger className="h-9 flex-1 text-sm" aria-label="Shift">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {shifts.cover.map((m) => (
                        <SelectItem key={m.key} value={m.key}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!cover && (
                    <Button size="sm" variant="outline" className="h-9" onClick={() => setParams({ cover: coverShift })}>
                      Show who
                    </Button>
                  )}
                </div>
              </div>
              {activeFilters > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-full text-xs"
                  onClick={() => setParams({ profile: null, area: null, shift: null })}
                >
                  Clear filters
                </Button>
              )}
            </PopoverContent>
          </Popover>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => window.print()}
            aria-label="Print the matrix"
            title="Print the matrix"
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {cover && (
        <CoverPanel
          coverage={coverage}
          shift={cover}
          profileName={profileName}
          onClose={() => setParams({ cover: null })}
        />
      )}

      {/* Tallies: each one filters the rows. */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs print:hidden" role="group" aria-label="Filter by status" data-tour="learn-matrix-tallies">
        <span className="rounded-full border px-2.5 py-1 text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">
            {totals.complete} of {totals.people}
          </span>{" "}
          at target
        </span>
        {STATUS_FILTERS.map((s) => {
          const n = totals[s]
          const on = status === s
          const label = { gap: "below target", expiring: "expiring", expired: "expired", retrain: "re-train needed" }[s]
          return (
            <span key={s} className="inline-flex items-center">
              <button
                type="button"
                aria-pressed={on}
                disabled={n === 0 && !on}
                onClick={() => setParams({ status: on ? null : s })}
                className={cn(
                  "rounded-full border px-2.5 py-1 transition-colors disabled:opacity-50",
                  n > 0 ? STATUS_META[s].chip : "text-muted-foreground",
                  on && "ring-2 ring-primary ring-offset-1",
                  on && "rounded-r-none",
                )}
              >
                <span className="font-semibold tabular-nums">{n}</span> {label}
              </button>
              {on && (
                <button
                  type="button"
                  aria-label="Clear the status filter"
                  onClick={() => setParams({ status: null })}
                  className="rounded-r-full border border-l-0 px-1.5 py-1 hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          )
        })}
        {status && <span className="text-muted-foreground">Esc clears the filter</span>}
      </div>

      {singlePoints.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-medium">Single point of failure:</span>{" "}
            {singlePoints.map((s) => `${s.skillName} (only ${s.personName})`).join(", ")}.
          </span>
        </p>
      )}

      <SkillLegend />

      {data.skills.length === 0 || rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {data.skills.length === 0 ? "No Skills match these filters" : "No one holds or needs these Skills"}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {data.skills.length === 0
                ? "Pick another Skill profile or area."
                : "Assign a Skill profile to people in the Skills workspace to measure them against it."}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              onClick={() => setParams({ profile: null, area: null, shift: null, status: null })}
            >
              Show everything
            </Button>
          </CardContent>
        </Card>
      ) : (
        <MatrixScroller>
          <table className="w-full border-separate border-spacing-0 text-xs" data-tour="learn-matrix-grid">
            <thead>
              <tr>
                <th
                  className={cn(
                    "sticky left-0 z-20 border-b border-r bg-card px-3 py-2 text-left align-bottom text-xs font-medium text-muted-foreground",
                    PERSON_COL,
                  )}
                >
                  <div className="flex items-end justify-between gap-2">
                    <span>Person</span>
                    <span>At target</span>
                  </div>
                </th>
                {data.skills.map((s) => (
                  <th key={s._id} className={cn("border-b border-l px-1 py-1.5 text-center align-bottom font-medium", SKILL_COL)}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          title={`${s.name}${s.validityMonths ? `, valid ${s.validityMonths} months` : ""}`}
                          className="w-full rounded px-0.5 py-0.5 hover:bg-muted"
                        >
                          <div className="line-clamp-4 hyphens-auto break-words text-xs leading-tight" lang="en">
                            {s.name.replace(/\//g, "/​")}
                          </div>
                          <div className="mt-0.5 text-xs font-normal text-muted-foreground">
                            {s.area ?? ""}
                            {s.validityMonths ? ` · ${s.validityMonths} mo` : ""}
                          </div>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="center" className="w-64">
                        <DropdownMenuLabel className="text-xs">{s.name}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled={!engineer} onSelect={() => setMakeFor(s._id)}>
                          <GraduationCap className="mr-2 h-4 w-4" />
                          Make a Training for this Skill
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!engineer}
                          onSelect={() =>
                            setAssignFor({
                              skillId: s._id,
                              personIds: data.people
                                .filter((p) => ["gap", "expired", "retrain", "expiring"].includes(p.cells[s._id]?.status ?? ""))
                                .map((p) => p._id),
                            })
                          }
                        >
                          <UserPlus className="mr-2 h-4 w-4" />
                          Assign
                        </DropdownMenuItem>
                        {!engineer && (
                          <p className="px-2 pb-1.5 text-xs text-muted-foreground">Check in as an Engineer to make or assign.</p>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const qualified = qualifiedOnShift.has(p._id)
                const dim = (cover !== null && coverage !== undefined && !qualified) || !matchesStatus(p)
                const fails = Math.max(0, ...Object.values(p.cells).map((c) => (c as { failStreak?: number }).failStreak ?? 0))
                return (
                  <tr
                    key={p._id}
                    data-person={p.name}
                    className={cn("group transition-opacity", dim && "opacity-40")}
                  >
                    <td
                      className={cn(
                        "sticky left-0 z-10 border-b border-r bg-card px-3 py-2",
                        PERSON_COL,
                        cover && qualified && "bg-emerald-50 shadow-[inset_3px_0_0_#10b981] dark:bg-emerald-950",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Link href={`/learn/people/${p._id}`} className="group/name flex min-w-0 flex-1 items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                            {initials(p.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium group-hover/name:underline" title={p.name}>
                              <span className="min-[1280px]:hidden">{shortName(p.name)}</span>
                              <span className="max-[1279px]:hidden">{p.name}</span>
                            </span>
                            <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                              <ShiftIcon shift={p.shift} className="h-3 w-3 shrink-0" />
                              <span className="truncate">{p.role}</span>
                            </span>
                          </span>
                        </Link>
                        <div className="w-12 shrink-0">
                          <Progress done={p.summary.atTarget} total={p.summary.targets} />
                        </div>
                      </div>
                      {fails >= 2 && (
                        <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          x{fails} not passed
                        </span>
                      )}
                    </td>
                    {data.skills.map((s) => {
                      const c = p.cells[s._id]
                      return (
                        <td key={s._id} className={cn("border-b border-l p-1 text-center", SKILL_COL)}>
                          {c && (
                            <MatrixCell
                              cell={c}
                              person={p.name}
                              skill={s.name}
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

      <p className="hidden text-xs text-muted-foreground print:block">Printed {formatDate(Date.now())}</p>

      <SkillCellSheet
        personId={open?.personId ?? null}
        skillId={open?.skillId ?? null}
        onOpenChange={(o) => !o && setOpen(null)}
      />
      {makeFor && <TrainingGuidedCreation {...guidedProps} />}
      {assignFor && (
        <AssignDialog
          open
          onOpenChange={(o) => !o && setAssignFor(null)}
          skillId={assignFor.skillId}
          personIds={assignFor.personIds}
        />
      )}
    </div>
  )
}

// A3 landscape: only the matrix, every column visible.
const PRINT_CSS = `
@media print {
  @page { size: A3 landscape; margin: 10mm; }
  body * { visibility: hidden; }
  #skill-matrix-print, #skill-matrix-print * { visibility: visible; }
  #skill-matrix-print { position: absolute; left: 0; top: 0; width: 100%; }
  #skill-matrix-print .overflow-x-auto { overflow: visible !important; }
  #skill-matrix-print .sticky { position: static !important; }
}
`

/**
 * The matrix scrolls sideways when there are many Skills. The person column
 * stays put; a fade on the edge and arrows above it show there is more to see.
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
  const page = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.6, behavior: "smooth" })
  return (
    <div className="space-y-1.5">
      {(edges.left || edges.right) && (
        <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground print:hidden">
          <span>More Skills to the {edges.right ? "right" : "left"}</span>
          <Button size="icon" variant="outline" className="h-7 w-7" aria-label="Scroll the matrix left" disabled={!edges.left} onClick={() => page(-1)}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-7 w-7" aria-label="Scroll the matrix right" disabled={!edges.right} onClick={() => page(1)}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      <Card className="relative overflow-hidden">
        <div ref={ref} className="overflow-x-auto">
          {children}
        </div>
        {edges.left && (
          <div className="pointer-events-none absolute inset-y-0 left-[200px] z-20 w-6 bg-gradient-to-r from-black/10 to-transparent min-[1280px]:left-[250px] dark:from-black/40" />
        )}
        {edges.right && (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-12 bg-gradient-to-l from-card via-card/70 to-transparent" />
        )}
      </Card>
    </div>
  )
}

function ShiftIcon({ shift, className }: { shift: string | null | undefined; className?: string }) {
  const k = shiftKey(shift)
  if (k === "night") return <Moon className={className} aria-label="Night shift" />
  if (k === "late") return <Sunset className={className} aria-label="Late shift" />
  if (k === "early") return <Sunrise className={className} aria-label="Early shift" />
  return null
}

type MatrixCellData = {
  level: number
  effectiveLevel: number
  target: number | null
  status: string
  expiresAt: number | null
  retrainReason: string | null
  failStreak?: number
}

function MatrixCell({
  cell,
  person,
  skill,
  onOpen,
}: {
  cell: MatrixCellData
  person: string
  skill: string
  onOpen: () => void
}) {
  const status = cell.status as SkillStatus
  const expired = status === "expired"
  const title = [
    `${person}, ${skill}`,
    expired
      ? `Effective level 0. Expired (was ${cell.level} until ${cell.expiresAt ? formatDate(cell.expiresAt) : "?"})`
      : `Level ${levelWords(cell.effectiveLevel)}`,
    cell.target != null ? `Target ${levelWords(cell.target)}` : "Not in their profile",
    status !== "ok" && status !== "none" && !expired ? STATUS_META[status].label : null,
    cell.level > 0 && cell.expiresAt != null && !expired ? expiryText(cell.expiresAt) : null,
    cell.retrainReason ? `Re-train: ${cell.retrainReason}` : null,
    (cell.failStreak ?? 0) >= 2 ? `Not passed ${cell.failStreak} times in a row` : null,
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
      data-status={status}
      className={cn(
        "relative flex h-9 w-full items-center justify-center rounded-md text-sm font-semibold tabular-nums transition-shadow hover:ring-2 hover:ring-primary/50",
        empty ? "text-muted-foreground/40" : CELL_FILL[status],
        status === "none" && !empty && "bg-muted/40 text-foreground",
      )}
    >
      {empty ? <span aria-hidden>·</span> : <LevelDots level={expired ? cell.level : cell.effectiveLevel} target={cell.target} status={status} />}
      {status === "retrain" && <span className="absolute right-1 top-0.5 text-xs leading-none" aria-hidden>↻</span>}
      {(cell.failStreak ?? 0) >= 2 && (
        <span className="absolute -bottom-1 -right-1 rounded bg-amber-500 px-1 text-xs font-semibold leading-4 text-white">
          x{cell.failStreak}
        </span>
      )}
    </button>
  )
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Progress({ done, total }: { done: number; total: number }) {
  if (total === 0) return <span className="text-xs text-muted-foreground">No profile</span>
  const complete = done === total
  return (
    <div className="space-y-1">
      <div className={cn("text-xs tabular-nums", complete ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
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

type Coverage = FunctionReturnType<typeof api.skills.coverage> | undefined

function CoverPanel({
  coverage,
  shift,
  profileName,
  onClose,
}: {
  coverage: Coverage
  shift: ShiftKey
  profileName: string
  onClose: () => void
}) {
  const shifts = useShifts()
  if (coverage === undefined) return <Skeleton className="h-28 w-full" />
  if (coverage.requirements.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-4 text-xs text-muted-foreground">
          <Settings2 className="h-4 w-4" />
          {profileName} has no target levels yet. Add them in the Skills workspace.
          <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" aria-label="Close the answer" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    )
  }
  const meta = shifts.meta(shift)
  const onShift = coverage.byShift.filter((g) => g.shift === shift).flatMap((g) => g.people)
  const n = onShift.length
  const startsAt = meta ? `${String(Math.floor(meta.start / 60)).padStart(2, "0")}:${String(meta.start % 60).padStart(2, "0")}` : null
  const headline = `${meta?.label ?? shift}${startsAt ? ` (starts ${startsAt})` : ""}: ${n} ${n === 1 ? "person" : "people"} can run ${coverage.profile?.name ?? profileName}`
  const almost = coverage.almost
    .filter((p) => p.shift === shift || p.shift === null)
    .sort((a, b) => a.missing.length - b.missing.length)
  return (
    <Card className="border-primary/30">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <span className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-xs", coverTone(n))}>
                {n}
              </span>
              {headline}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Fully qualified: every target met, nothing expired, no re-training open.
              {n === 1 && ` Only ${onShift[0].name}: if they are off, nobody can.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {shifts.cover.filter((m) => m.key !== shift).map((m) => {
              const c = coverage.byShift.filter((g) => g.shift === m.key).flatMap((g) => g.people).length
              return (
                <span key={m.key} className={cn("rounded-full border px-2 py-0.5 text-xs", coverTone(c))}>
                  {m.short} {c}
                </span>
              )
            })}
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Close the answer" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {n > 0 && (
          <ul className="flex flex-wrap gap-2">
            {onShift.map((p) => (
              <li key={p._id} className="rounded-md border px-2 py-1 text-xs">
                <Link href={`/learn/people/${p._id}`} className="font-medium hover:underline">
                  {p.name}
                </Link>
                {p.expiringSoon.length > 0 && (
                  <span className="ml-1 text-amber-700 dark:text-amber-400">· {p.expiringSoon.join(", ")} expiring soon</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {almost.length > 0 && (
          <div className="space-y-1.5 border-t pt-2">
            <div className="text-xs font-medium text-muted-foreground">Not yet, and why (fewest missing first)</div>
            <ul className="space-y-1.5">
              {almost.map((p) => (
                <li key={p._id} className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Link href={`/learn/people/${p._id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  {shifts.meta(p.shift) && <span className="text-muted-foreground">({shifts.meta(p.shift)!.short.toLowerCase()})</span>}
                  {p.missing.map((m) => {
                    const tone: SkillStatus = m.reason === "expired" ? "expired" : m.reason.startsWith("re-train") ? "retrain" : "gap"
                    return (
                      <span key={m.skillName} className={cn("rounded-full border px-2 py-0.5", STATUS_META[tone].chip)}>
                        {m.skillName}: {m.reason}
                      </span>
                    )
                  })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
