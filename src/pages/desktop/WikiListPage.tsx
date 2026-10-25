import { useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Link } from "wouter"
import { toast } from "sonner"
import type { FunctionReturnType } from "convex/server"
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpenText,
  Check,
  ChevronDown,
  Factory,
  History,
  Loader2,
  MapPin,
  Plus,
  Search,
  X,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { WikiGuidedCreation } from "@/components/wiki/WikiGuidedCreation"
import { FORMAT_LABEL } from "@/components/wiki/wikiShared"
import { useCheckIn } from "@/lib/checkIn"
import { formatAgo } from "@/lib/time"
import { cn } from "@/lib/utils"
import { isEngineerOrAdmin } from "@/lib/roles"

type WikiRow = FunctionReturnType<typeof api.wikis.list>[number]

const WEEK = 7 * 24 * 3600 * 1000
// Until an Engineer sets the Start here path, Wikis that read like onboarding
// are suggested.
const ONBOARDING_RE = /\b(new|first|start|starter|essentials?|basics?|induction|onboarding|safety)\b/i

// The Wiki home (user requirement 9): search, browse by area and by Asset,
// Start here for new people, What changed this week (only real document
// changes), and every other Wiki once, sorted Most used by default. Each Wiki
// appears once on the page. Only an Engineer creates a Wiki.
export function WikiListPage() {
  const wikis = useQuery(api.wikis.list)
  const { person } = useCheckIn()
  const isEngineer = isEngineerOrAdmin(person)
  const [creating, setCreating] = useState(false)
  const [q, setQ] = useState("")
  const [area, setArea] = useState<string | null>(null)
  const [asset, setAsset] = useState<string | null>(null)

  const all = useMemo(() => wikis ?? [], [wikis])
  const areas = useMemo(() => {
    const m = new Map<string, string>()
    for (const w of all) for (const a of w.areas) m.set(a.code, a.label)
    return [...m.entries()].map(([code, label]) => ({ code, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [all])
  const assets = useMemo(() => {
    const m = new Map<string, AssetOption>()
    for (const w of all)
      for (const a of w.assets) {
        const row = m.get(a._id) ?? { id: a._id, code: a.code, name: a.name, count: 0 }
        row.count += 1
        m.set(a._id, row)
      }
    return [...m.values()].sort((a, b) => a.code.localeCompare(b.code))
  }, [all])
  const assetRow = assets.find((a) => a.id === asset) ?? null

  const query = q.trim().toLowerCase()
  const filtering = query !== "" || area !== null || asset !== null
  const results = useMemo(() => {
    if (!filtering) return []
    const terms = query.split(/\s+/).filter(Boolean)
    return all
      .filter((w) => !area || w.areas.some((a) => a.code === area))
      .filter((w) => !asset || w.assets.some((a) => a._id === asset))
      .map((w) => {
        const hay = [
          w.title,
          w.purpose,
          ...w.headings,
          ...w.sourceCodes,
          ...w.areas.map((a) => a.label),
          ...w.assets.flatMap((a) => [a.code, a.name]),
        ]
          .join(" ")
          .toLowerCase()
        const title = w.title.toLowerCase()
        const score = terms.reduce((s, t) => s + (title.includes(t) ? 3 : hay.includes(t) ? 1 : -100), 0)
        return { w, score }
      })
      .filter((x) => terms.length === 0 || x.score > 0)
      .sort((a, b) => b.score - a.score || b.w.views - a.w.views)
      .map((x) => x.w)
  }, [all, query, area, asset, filtering])

  const createAction = isEngineer ? (
    <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
      <Plus className="h-3.5 w-3.5" />
      Create a Wiki
    </Button>
  ) : (
    <div className="flex items-center gap-2">
      <span className="max-w-[14rem] text-right text-xs leading-tight text-muted-foreground">
        Check in as an Engineer to create a Wiki
      </span>
      <Button size="sm" className="gap-1.5" disabled>
        <Plus className="h-3.5 w-3.5" />
        Create a Wiki
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Wiki" }]} />
      <PageHeader
        icon={BookOpenText}
        title="Wiki"
        subtitle="Short pages that explain a job, a machine or an area, built only from published documents."
        actions={createAction}
      />
      <div className="mx-auto w-full max-w-6xl space-y-10 px-6 py-6">
        <div className="space-y-3">
          <div className="relative max-w-2xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Wikis by topic, Asset or document code"
              aria-label="Search Wikis"
              className="h-11 rounded-xl pl-10 pr-10 text-sm"
            />
            {q && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {(areas.length > 0 || assets.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Browse by area or Asset">
              <span className="mr-1 text-xs text-muted-foreground">Browse</span>
              {areas.map((a) => (
                <button
                  key={a.code}
                  type="button"
                  aria-pressed={area === a.code}
                  onClick={() => setArea(area === a.code ? null : a.code)}
                  className={chipClass(area === a.code)}
                >
                  <MapPin className="h-3 w-3" aria-hidden />
                  {a.label}
                  {person?.area === a.code && (
                    <span className={area === a.code ? "text-white/80" : "text-primary-strong"}>, your area</span>
                  )}
                </button>
              ))}
              {assets.length > 0 && <AssetPicker assets={assets} value={asset} onChange={setAsset} />}
              {(area || asset) && (
                <button
                  type="button"
                  onClick={() => {
                    setArea(null)
                    setAsset(null)
                  }}
                  className="ml-1 min-h-8 px-1 text-xs font-medium text-primary-strong [@media(hover:hover)]:hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {wikis === undefined ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : all.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <BookOpenText className="h-8 w-8 text-muted-foreground/50" />
              <div className="space-y-1">
                <p className="text-sm font-medium">No Wikis yet</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  A Wiki explains a job, a machine or an area for one audience. It is built from published
                  documents only, and rebuilt whenever one of them changes.
                </p>
              </div>
              {isEngineer ? (
                <Button size="sm" onClick={() => setCreating(true)}>
                  Create the first Wiki
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Check in as an Engineer to create the first Wiki.</p>
              )}
            </CardContent>
          </Card>
        ) : filtering ? (
          <section className="space-y-3" aria-live="polite">
            <h2 className="text-sm font-semibold">
              {results.length} {results.length === 1 ? "Wiki" : "Wikis"}
              {query ? ` for "${q.trim()}"` : ""}
              {area ? ` in ${areas.find((a) => a.code === area)?.label ?? area}` : ""}
              {assetRow ? ` about ${assetRow.code} ${assetRow.name}` : ""}
            </h2>
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Wiki covers that yet. Try another word, or{" "}
                {isEngineer ? (
                  <button type="button" className="font-medium text-primary-strong hover:underline" onClick={() => setCreating(true)}>
                    create a Wiki about it
                  </button>
                ) : (
                  "ask an Engineer to create one"
                )}
                .
              </p>
            ) : (
              <WikiGrid wikis={results} />
            )}
          </section>
        ) : (
          <Home all={all} isEngineer={isEngineer} />
        )}
      </div>
      <WikiGuidedCreation open={creating} onOpenChange={setCreating} />
    </div>
  )
}

type AssetOption = { id: string; code: string; name: string; count: number }
type Sort = "used" | "updated" | "az"
const SORTS: { key: Sort; label: string }[] = [
  { key: "used", label: "Most used" },
  { key: "updated", label: "Recently updated" },
  { key: "az", label: "A to Z" },
]

function chipClass(active: boolean) {
  return cn(
    "inline-flex min-h-8 items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors",
    active
      ? "border-primary-strong bg-primary-strong text-white"
      : "bg-background text-muted-foreground [@media(hover:hover)]:hover:border-primary/50 [@media(hover:hover)]:hover:text-foreground",
  )
}

function AssetPicker({
  assets,
  value,
  onChange,
}: {
  assets: AssetOption[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const current = assets.find((a) => a.id === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-pressed={!!current} className={chipClass(!!current)}>
          <Factory className="h-3 w-3" aria-hidden />
          {current ? `${current.code} ${current.name}` : "By Asset"}
          <ChevronDown className="h-3 w-3" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-80 w-80 overflow-y-auto p-1">
        <ul aria-label="Assets with a Wiki">
          {assets.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                aria-pressed={a.id === value}
                onClick={() => {
                  onChange(a.id === value ? null : a.id)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm [@media(hover:hover)]:hover:bg-muted"
              >
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{a.code}</span>
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {a.count} {a.count === 1 ? "Wiki" : "Wikis"}
                </span>
                {a.id === value && <Check className="h-3.5 w-3.5 shrink-0 text-primary-strong" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

/** A document change that rebuilt this Wiki in the last week, or null. */
function realChange(w: WikiRow, now: number) {
  const c = w.change
  if (!c || now - c.at >= WEEK) return null
  if (c.changedSources.length === 0 || c.added + c.removed === 0) return null
  return c
}
type RealChange = NonNullable<ReturnType<typeof realChange>>

/** "EXT-HSE-SOP-0001 v3 published: 2 new, 1 removed in PPE, Lockout". */
function changeReason(c: RealChange) {
  const sources = c.changedSources.slice(0, 2).join(" and ")
  const parts = [c.added > 0 ? `${c.added} new` : null, c.removed > 0 ? `${c.removed} removed` : null]
    .filter(Boolean)
    .join(", ")
  const where = c.changedHeadings.length > 0 ? ` in ${c.changedHeadings.join(", ")}` : ""
  return `${sources} published: ${parts}${where}`
}

function Home({ all, isEngineer }: { all: WikiRow[]; isEngineer: boolean }) {
  const [sort, setSort] = useState<Sort>("used")
  const ready = all.filter((w) => w.status !== "failed" || w.pointCount > 0)
  const flagged = ready.filter((w) => w.startHere != null).sort((a, b) => (a.startHere ?? 0) - (b.startHere ?? 0))
  const suggested = flagged.length > 0 ? [] : ready.filter((w) => ONBOARDING_RE.test(`${w.title} ${w.purpose}`)).slice(0, 4)
  const path = flagged.length > 0 ? flagged : suggested
  const inPath = new Set(path.map((w) => w._id))
  const now = Date.now()
  const changed: { w: WikiRow; c: RealChange }[] = []
  for (const w of ready) {
    const c = realChange(w, now)
    if (c) changed.push({ w, c })
  }
  changed.sort((a, b) => b.c.at - a.c.at)
  const rest = all
    .filter((w) => !inPath.has(w._id))
    .sort((a, b) =>
      sort === "used"
        ? b.views - a.views || b.pointCount - a.pointCount || a.title.localeCompare(b.title)
        : sort === "updated"
          ? (b.generatedAt ?? b.updatedAt) - (a.generatedAt ?? a.updatedAt)
          : a.title.localeCompare(b.title),
    )

  return (
    <>
      {path.length > 0 && <StartHere path={path} suggested={flagged.length === 0} isEngineer={isEngineer} />}

      {changed.length > 0 && (
        <section className="space-y-3">
          <SectionTitle icon={History} title="What changed this week" hint="Rebuilt after a document was published" />
          <ol className="divide-y rounded-xl border">
            {changed.slice(0, 6).map(({ w, c }) => (
              <li key={w._id}>
                <Link
                  href={`/wiki/${w._id}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-3 [@media(hover:hover)]:hover:bg-muted/60"
                >
                  <span className="text-sm font-medium">{w.title}</span>
                  <span className="min-w-0 flex-1 text-sm text-muted-foreground">{changeReason(c)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatAgo(c.at)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {rest.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <BookOpenText className="h-4 w-4 text-primary-strong" aria-hidden />
              {path.length > 0 ? `All other Wikis (${rest.length})` : `All Wikis (${rest.length})`}
            </h2>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sort Wikis">
              {SORTS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  aria-pressed={sort === o.key}
                  onClick={() => setSort(o.key)}
                  className={chipClass(sort === o.key)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <WikiGrid wikis={rest} showViews={sort === "used"} />
        </section>
      )}
    </>
  )
}

function SectionTitle({ icon: Icon, title, hint }: { icon: typeof History; title: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Icon className="h-4 w-4 text-primary-strong" aria-hidden />
        {title}
      </h2>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

function StartHere({ path, suggested, isEngineer }: { path: WikiRow[]; suggested: boolean; isEngineer: boolean }) {
  const { person } = useCheckIn()
  const move = useMutation(api.wikis.moveStartHere)
  async function shift(id: WikiRow["_id"], direction: "up" | "down") {
    try {
      await move({ id, direction, personId: person?._id })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <section className="space-y-3 rounded-2xl border bg-gradient-to-br from-primary/[0.06] to-transparent p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold">Start here</h2>
        <p className="text-sm text-muted-foreground">New on the floor? Read these in order.</p>
        {suggested && (
          <p className="text-xs text-muted-foreground">
            Suggested.{isEngineer ? " Set the path with Add to Start here in a Wiki's menu." : ""}
          </p>
        )}
      </div>
      <ol className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {path.map((w, i) => (
          <li key={w._id} className="relative">
            <Link
              href={`/wiki/${w._id}`}
              className="flex h-full gap-3 rounded-xl border bg-background p-4 transition-colors [@media(hover:hover)]:hover:border-primary/50"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-strong text-sm font-semibold text-white">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-snug">{w.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{summary(w.purpose, 140)}</span>
                <span className="mt-1.5 block text-xs text-muted-foreground">
                  {w.sectionCount} sections · about {Math.max(1, Math.round(w.pointCount / 8))} min
                </span>
              </span>
            </Link>
            {!suggested && isEngineer && (
              <span className="absolute right-2 top-2 flex gap-0.5">
                <button type="button" aria-label="Move earlier" disabled={i === 0} onClick={() => void shift(w._id, "up")} className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Move later" disabled={i === path.length - 1} onClick={() => void shift(w._id, "down")} className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
            {i < path.length - 1 && (
              <ArrowRight className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground/60 lg:block" aria-hidden />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function WikiGrid({ wikis, showViews = false }: { wikis: WikiRow[]; showViews?: boolean }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {wikis.map((w) => (
        <WikiCard key={w._id} w={w} showViews={showViews} />
      ))}
    </div>
  )
}

/** The purpose in whole sentences, never cut mid-sentence. */
function summary(purpose: string, max = 180) {
  const text = purpose.trim()
  if (text.length <= max) return text
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? []
  let out = ""
  for (const sentence of sentences) {
    if (out && (out + sentence).length > max) break
    out += sentence
  }
  return out.trim() || text
}

function WikiCard({ w, showViews = false }: { w: WikiRow; showViews?: boolean }) {
  return (
    <Link href={`/wiki/${w._id}`} className="block h-full">
      <Card className="h-full transition-colors [@media(hover:hover)]:hover:border-primary/50">
        <CardContent className="flex h-full flex-col gap-2 p-4">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">{w.title}</p>
            <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{FORMAT_LABEL[w.format]}</span>
          </div>
          {w.purpose && <p className="text-sm text-muted-foreground">{summary(w.purpose)}</p>}
          <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-xs text-muted-foreground">
            {w.status === "generating" ? (
              <span className="inline-flex items-center gap-1 text-primary-strong">
                <Loader2 className="h-3 w-3 animate-spin" /> Building
              </span>
            ) : w.status === "empty" ? (
              <span className="text-amber-700">Nothing published in scope</span>
            ) : w.status === "failed" ? (
              <span className="text-destructive">Build failed</span>
            ) : (
              <span>
                {w.sectionCount} {w.sectionCount === 1 ? "section" : "sections"} · {w.sourceCount}{" "}
                {w.sourceCount === 1 ? "document" : "documents"} · updated {formatAgo(w.generatedAt ?? w.updatedAt)}
                {showViews && w.views > 0 && ` · opened ${w.views} ${w.views === 1 ? "time" : "times"}`}
              </span>
            )}
            {w.outdatedCount > 0 && w.status !== "generating" && <span className="font-medium text-amber-700">Out of date</span>}
            {realChange(w, Date.now()) && (
              <span className="rounded-full bg-emerald-100 px-1.5 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">Changed</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
