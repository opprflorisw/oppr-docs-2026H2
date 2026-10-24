// Phone Home: "what do I do now". Greeting and check-in, the one big Scan,
// then what is yours today: a running or pending Capture, the next 1 or 2
// To do items, shift cover answers (Engineers and shift leads), Rounds for
// you, Wikis as one row of chips, Saved and a short Recent. Finding things
// lives in Find, so Home has no tiles that repeat the tab bar.
//
// Saved and Recent ids are resolved against Convex; a row that no longer
// exists shows a Remove action instead of breaking the page.

import { useMemo } from "react"
import { Link, useLocation } from "wouter"
import { useQuery } from "convex/react"
import { AlertTriangle, BookOpen, ChevronRight, CircleDot, Factory, Files, History, ScanLine, Star, Trash2, Users } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { usePinned, useRecentlyViewed, type EntityKind } from "@/components/mobile/use-mobile-prefs"
import { MobileCheckInButton } from "@/components/mobile/MobileCheckIn"
import { MobileRoundsCard } from "@/components/mobile/MobileRoundsCard"
import { MobileLearningCard } from "@/components/mobile/MobileLearningCard"
import { useTodo } from "@/components/mobile/MobileTodo"
import { useMobileShell } from "@/components/mobile/MobileShell"
import { useCheckIn } from "@/lib/checkIn"
import { formatAgo } from "@/lib/time"
import { cn } from "@/lib/utils"

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return "Good night"
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

export function MobileHomePage() {
  const { person, people } = useCheckIn()
  const { openCheckIn } = useMobileShell()
  const [, navigate] = useLocation()
  const hydrated = people !== undefined
  const todo = useTodo(person?._id ?? null)
  const topTrainings = useMemo(
    () => todo.items.filter((i) => !i.waiting).slice(0, 2).map((i) => i.trainingId).filter((x): x is string => !!x),
    [todo.items],
  )

  return (
    <div className="flex flex-col">
      <header
        className="flex items-center gap-3 px-4 pb-2"
        style={{ paddingTop: "max(16px, var(--sat, env(safe-area-inset-top, 0px)))" }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">Today</p>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight">
            {greeting()}
            {person ? `, ${person.name.split(" ")[0]}` : ""}
          </h1>
        </div>
        <MobileCheckInButton variant="pill" />
      </header>

      <div className="flex flex-col gap-5 px-4 pb-6 pt-2">
        <button
          type="button"
          onClick={() => navigate("/m/scan")}
          className="flex min-h-16 items-center gap-3 rounded-2xl bg-[#6E59A5] px-4 text-left text-white shadow-sm transition active:scale-[0.99]"
        >
          <ScanLine className="h-7 w-7 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-semibold leading-tight">Scan a QR code</span>
            <span className="block text-sm opacity-90">Safety and tasks of a machine</span>
          </span>
          <ChevronRight className="h-5 w-5 opacity-80" />
        </button>

        {person && <MyCaptures personId={person._id} />}

        {!hydrated ? null : person ? (
          <MobileLearningCard items={todo.items} loading={todo.loading} />
        ) : (
          <button
            type="button"
            onClick={openCheckIn}
            className="flex min-h-16 items-center gap-3 rounded-2xl border border-dashed px-4 py-3 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold">Check in to see your To do</span>
              <span className="block text-sm text-muted-foreground">Your Trainings, Rounds and Captures</span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        )}

        {person?.kind === "engineer" && <CoverAnswers />}

        <MobileRoundsCard exclude={topTrainings} />

        <WikisForYou area={person?.area ?? null} />

        <SavedAndRecent />
      </div>
    </div>
  )
}

function SectionTitle({ icon: Icon, children, right }: { icon: typeof Star; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" />
        {children}
      </h2>
      {right}
    </div>
  )
}

const CAPTURE_STATUS: Record<string, string> = {
  recording: "Recording",
  handed_in: "Handed in, being organized",
  processing: "Being organized",
  ready: "Organized",
  failed: "Could not be organized",
}

function MyCaptures({ personId }: { personId: Id<"people"> }) {
  const mine = useQuery(api.captures.captures.mine, { personId })
  if (!mine) return null
  // Running or waiting to be organized; else the one organized in the last 3 days.
  const pending = mine.filter((c) => c.status === "recording" || c.status === "handed_in" || c.status === "processing")
  const fresh = mine.filter(
    (c) => c.status === "ready" && (c.handedInAt ?? c.startedAt) > Date.now() - 3 * 24 * 3600 * 1000,
  )
  const shown = (pending.length > 0 ? pending : fresh).slice(0, 2)
  if (shown.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle
        icon={CircleDot}
        right={
          <Link href="/m/capture" className="flex min-h-11 min-w-11 items-center justify-center px-3 text-sm font-semibold text-[#6E59A5]">
            All
          </Link>
        }
      >
        Your Captures
      </SectionTitle>
      {shown.map((c) => (
        <Link
          key={c._id}
          href={c.status === "recording" ? "/m/capture" : `/m/capture/${c._id}`}
          className="flex min-h-16 items-center gap-3 rounded-2xl border bg-card px-3 py-3 shadow-sm transition active:scale-[0.99]"
        >
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              c.status === "recording" ? "bg-red-500/10 text-red-600" : "bg-muted text-slate-600 dark:text-slate-300",
            )}
          >
            <CircleDot className={cn("h-5 w-5", c.status === "recording" && "motion-safe:animate-pulse")} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 block text-base font-semibold leading-snug">{c.title}</span>
            <span className="block text-[13px] leading-snug text-muted-foreground">
              {CAPTURE_STATUS[c.status] ?? c.status}
              {c.status === "ready" && c.momentCount > 0
                ? `: ${c.momentCount} ${c.momentCount === 1 ? "Moment" : "Moments"}`
                : ""}{" "}
              · {formatAgo(c.handedInAt ?? c.startedAt)}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </section>
  )
}

/** Shift cover answers marked "show on Home", for Engineers and shift leads. */
function CoverAnswers() {
  const questions = useQuery(api.coverageQuestions.list)
  const shown = (questions ?? []).filter((q) => q.showOnHome).slice(0, 3)
  if (shown.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle icon={Users}>Shift cover</SectionTitle>
      <div className="flex flex-col divide-y rounded-2xl border bg-card">
        {shown.map((q) => (
          <CoverAnswer key={q._id} label={q.label} profileId={q.profileId} shift={q.shift} />
        ))}
      </div>
    </section>
  )
}

function CoverAnswer({
  label,
  profileId,
  shift,
}: {
  label: string
  profileId: Id<"skillProfiles">
  shift: "early" | "late" | "night" | null
}) {
  const cover = useQuery(api.skills.coverage, { profileId, shift })
  const n = cover?.count
  const names = (cover?.qualified ?? []).map((p) => p.name.split(" ")[0])
  return (
    <div className="flex min-h-14 items-center gap-3 px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium leading-snug">{label}</span>
        <span className="block text-[13px] leading-snug text-muted-foreground">
          {cover === undefined
            ? "Checking"
            : n === 0
              ? "Nobody is fully trained yet"
              : names.slice(0, 4).join(", ") + (names.length > 4 ? ` and ${names.length - 4} more` : "")}
        </span>
      </span>
      {n !== undefined && (
        <span
          className={cn(
            "flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-2 text-sm font-semibold tabular-nums",
            n === 0
              ? "bg-red-500/10 text-red-700"
              : n === 1
                ? "bg-amber-500/15 text-amber-800"
                : "bg-emerald-500/10 text-emerald-800",
          )}
        >
          {n}
        </span>
      )}
    </div>
  )
}

type WikiListRow = { _id: string; title: string; purpose?: string; status?: string; scope?: { areas?: string[] } }

function WikisForYou({ area }: { area: string | null }) {
  const wikis = useQuery(api.wikis.list, {}) as WikiListRow[] | undefined
  if (!wikis) return null
  const ready = wikis.filter((w) => !w.status || w.status === "ready")
  const mine = area ? ready.filter((w) => w.scope?.areas?.includes(area)) : []
  const shown = (mine.length > 0 ? mine : ready).slice(0, 6)
  if (shown.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle
        icon={BookOpen}
        right={
          <Link href="/m/find?in=wikis" className="flex min-h-11 min-w-11 items-center justify-center px-3 text-sm font-semibold text-[#6E59A5]">
            All
          </Link>
        }
      >
        {mine.length > 0 ? "Wikis for you" : "Wikis"}
      </SectionTitle>
      {/* One row of title-only chips: Wikis are reference, not today's work. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {shown.map((w) => (
          <Link
            key={w._id}
            href={`/m/wiki/${w._id}`}
            className="flex min-h-11 max-w-[240px] shrink-0 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-medium shadow-sm transition active:scale-[0.98]"
          >
            <BookOpen className="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" />
            <span className="truncate">{w.title}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function SavedAndRecent() {
  const { recent, removeRecent } = useRecentlyViewed()
  const { pinned, removePin } = usePinned()

  const docIds = useMemo(() => {
    const set = new Set<string>()
    for (const p of pinned) if (p.kind === "doc") set.add(p.id)
    for (const r of recent) if (r.kind === "doc") set.add(r.id)
    return Array.from(set)
  }, [pinned, recent])
  const assetIds = useMemo(() => {
    const set = new Set<string>()
    for (const p of pinned) if (p.kind === "asset") set.add(p.id)
    for (const r of recent) if (r.kind === "asset") set.add(r.id)
    return Array.from(set)
  }, [pinned, recent])

  const docResolves = useQuery(api.documents.resolveMany, docIds.length > 0 ? { ids: docIds } : "skip")
  const assetResolves = useQuery(api.assets.resolveMany, assetIds.length > 0 ? { ids: assetIds } : "skip")

  const existsMap = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const r of docResolves ?? []) m.set(`doc:${r.id}`, r.exists)
    for (const r of assetResolves ?? []) m.set(`asset:${r.id}`, r.exists)
    return m
  }, [docResolves, assetResolves])

  // While the lookup runs, rows count as existing: no flash of "gone".
  function exists(kind: EntityKind, id: string): boolean {
    const key = `${kind}:${id}`
    return !existsMap.has(key) || existsMap.get(key) === true
  }

  const pinnedKeys = new Set(pinned.map((p) => `${p.kind}:${p.id}`))
  const recentOnly = disambiguate(recent)
    .filter((r) => !pinnedKeys.has(`${r.kind}:${r.id}`))
    .slice(0, 3)

  return (
    <>
      {pinned.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle icon={Star}>Saved</SectionTitle>
          {pinned.map((p) => (
            <EntityRow
              key={`${p.kind}-${p.id}`}
              kind={p.kind}
              id={p.id}
              label={p.label}
              sublabel={p.sublabel}
              missing={!exists(p.kind, p.id)}
              onRemove={() => removePin(p.kind, p.id)}
            />
          ))}
        </section>
      )}
      {recentOnly.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle icon={History}>Recent</SectionTitle>
          {recentOnly.map((r) => (
            <EntityRow
              key={`${r.kind}-${r.id}-${r.visited_at}`}
              kind={r.kind}
              id={r.id}
              label={r.displayLabel}
              sublabel={r.sublabel}
              missing={!exists(r.kind, r.id)}
              onRemove={() => removeRecent(r.kind, r.id)}
            />
          ))}
        </section>
      )}
      {pinned.length === 0 && recent.length === 0 && (
        <p className="rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Documents and Assets you open show here. Tap the star on one to keep it under Saved.
        </p>
      )}
    </>
  )
}

// Two Recent rows with the same title get the tail of their code, so they
// do not look identical.
function disambiguate<T extends { kind: EntityKind; id: string; label: string; sublabel?: string }>(
  rows: T[],
): Array<T & { displayLabel: string }> {
  const labelCount = new Map<string, number>()
  for (const r of rows) labelCount.set(r.label, (labelCount.get(r.label) ?? 0) + 1)
  return rows.map((r) => {
    if ((labelCount.get(r.label) ?? 0) <= 1) return { ...r, displayLabel: r.label }
    const tail = r.sublabel?.split(/[-_]/).pop()
    return { ...r, displayLabel: tail ? `${r.label} (${tail})` : r.label }
  })
}

function EntityRow({
  kind,
  id,
  label,
  sublabel,
  missing,
  onRemove,
}: {
  kind: EntityKind
  id: string
  label: string
  sublabel?: string
  missing: boolean
  onRemove: () => void
}) {
  const to = kind === "doc" ? `/m/docs/${id}` : `/m/assets/${id}`
  const Icon = kind === "doc" ? Files : Factory
  if (missing) {
    return (
      <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-medium">{label}</div>
          <div className="text-[13px]">No longer available</div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="flex h-11 w-11 items-center justify-center rounded-full"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>
    )
  }
  return (
    <Link
      href={to}
      className="flex min-h-14 items-center gap-3 rounded-2xl border bg-card px-3 py-2 shadow-sm transition active:scale-[0.99]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-slate-600 dark:text-slate-300">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-base font-medium leading-snug">{label}</span>
        {sublabel && <span className="block truncate font-mono text-[13px] text-muted-foreground">{sublabel}</span>}
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  )
}
