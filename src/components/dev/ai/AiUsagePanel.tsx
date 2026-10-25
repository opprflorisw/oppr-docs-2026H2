// AI usage tab of /dev/ai (spec 6.7): what every AI call in the app costs.
// Closed days come from one cached read that new calls never invalidate;
// today is a second, live read. Amounts are estimates from the Price table.
import { useEffect, useMemo, useState } from "react"
import { useAction, useQuery } from "convex/react"
import { Link } from "wouter"
import { toast } from "sonner"
import { AlertTriangle, ArrowUpRight, Download, Loader2 } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import {
  daysBefore,
  mergeAggs,
  windowView,
  type CallRow,
  type DayAgg,
  type Dimension,
  type Totals,
} from "../../../../convex/lib/aiUsageView"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/lib/time"
import { cn } from "@/lib/utils"
import { errorText, useSettingsEditor } from "@/components/settings/SettingsBits"
import { count, featureLabel, todayUtc, tokens, usd } from "./aiUsageFormat"

type Range = "today" | "7" | "30"
const RANGES: { value: Range; label: string; back: number }[] = [
  { value: "today", label: "Today", back: 0 },
  { value: "7", label: "7 days", back: 6 },
  { value: "30", label: "30 days", back: 29 },
]

const DIMENSION_TABS: { value: Dimension; label: string }[] = [
  { value: "feature", label: "Feature" },
  { value: "model", label: "Model" },
  { value: "person", label: "Person" },
  { value: "wiki", label: "Wiki" },
  { value: "document", label: "Document" },
  { value: "other", label: "Other" },
]

/** The UTC day, refreshed every minute so the page rolls over at midnight. */
function useToday(): string {
  const [today, setToday] = useState(todayUtc)
  useEffect(() => {
    const t = setInterval(() => setToday(todayUtc()), 60_000)
    return () => clearInterval(t)
  }, [])
  return today
}

export function AiUsagePanel() {
  const { editorId } = useSettingsEditor()
  const today = useToday()
  const [range, setRange] = useState<Range>("7")
  const [dim, setDim] = useState<Dimension>("feature")
  const personId = editorId ?? undefined
  const closed = useQuery(
    api.aiUsage.usage,
    editorId ? { personId, fromDay: daysBefore(today, 29), toDay: daysBefore(today, 1) } : "skip",
  )
  const live = useQuery(api.aiUsage.usage, editorId ? { personId, fromDay: today, toDay: today } : "skip")
  const agg = useMemo(() => mergeAggs(closed, live), [closed, live])
  const loading = closed === undefined || live === undefined

  const from = daysBefore(today, RANGES.find((r) => r.value === range)!.back)
  const view = useMemo(() => (agg ? windowView(agg.days, from) : null), [agg, from])
  const tiles = useMemo(
    () => (agg ? RANGES.map((r) => ({ ...r, totals: windowView(agg.days, daysBefore(today, r.back), 0, 0).totals })) : null),
    [agg, today],
  )
  const labels = agg?.labels ?? {}
  const name = (key: string) => labels[key] ?? key

  if (!editorId) return null
  return (
    <div className="space-y-5" data-testid="ai-usage">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          value={range}
          onValueChange={(v) => v && setRange(v as Range)}
          variant="outline"
          size="sm"
          aria-label="Period"
          data-tour="developer-ai-usage-range"
        >
          {RANGES.map((r) => (
            <ToggleGroupItem key={r.value} value={r.value}>
              {r.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ExportButton personId={editorId} fromDay={from} toDay={today} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3" data-tour="developer-ai-usage-tiles">
        {RANGES.map((r) => {
          const t = tiles?.find((x) => x.value === r.value)?.totals
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              aria-pressed={range === r.value}
              className={cn(
                "rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/50",
                range === r.value && "border-primary ring-1 ring-primary",
              )}
            >
              <p className="text-xs text-muted-foreground">{r.label}</p>
              {loading || !t ? (
                <Skeleton className="mt-2 h-7 w-24" />
              ) : (
                <>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{usd(t.cost)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {count(t.calls)} calls{t.failed ? `, ${count(t.failed)} failed` : ""}
                  </p>
                </>
              )}
            </button>
          )
        })}
      </div>

      <Notices truncated={agg?.truncated ?? false} unpriced={view?.totals.unpriced ?? 0} />

      <Card data-tour="developer-ai-usage-chart">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Cost per day, last 30 days</CardTitle>
          <CardDescription className="text-sm">
            Estimated from list prices in the Price table. UTC days. Hover a bar for the day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading || !agg ? <Skeleton className="h-40 w-full" /> : <CostChart days={agg.days} today={today} highlightFrom={from} />}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card data-tour="developer-ai-usage-breakdown">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
            <CardTitle className="text-sm">Where it goes</CardTitle>
            <ToggleGroup
              type="single"
              value={dim}
              onValueChange={(v) => v && setDim(v as Dimension)}
              variant="outline"
              size="sm"
              aria-label="Break down by"
              className="flex-wrap justify-start"
            >
              {DIMENSION_TABS.map((d) => (
                <ToggleGroupItem key={d.value} value={d.value} className="text-xs">
                  {d.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </CardHeader>
          <CardContent>
            {!view ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <Breakdown
                rows={view.dims[dim]}
                total={view.totals}
                label={(k) => (dim === "feature" ? featureLabel(k) : dim === "model" ? k : name(k))}
                empty={
                  dim === "wiki" || dim === "document"
                    ? `No AI calls for a ${dim === "wiki" ? "Wiki" : "Document"} in this period.`
                    : "No AI calls in this period."
                }
              />
            )}
          </CardContent>
        </Card>

        <Card data-tour="developer-ai-usage-split">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">People and system jobs</CardTitle>
            <CardDescription className="text-xs">
              System jobs run without a person: publish rebuilds, nightly checks, indexing and the seed.
            </CardDescription>
          </CardHeader>
          <CardContent>{!view ? <Skeleton className="h-24 w-full" /> : <Split people={view.people} system={view.system} />}</CardContent>
        </Card>
      </div>

      <Card data-tour="developer-ai-usage-top">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Most expensive calls</CardTitle>
        </CardHeader>
        <CardContent>
          {!view ? <Skeleton className="h-32 w-full" /> : <CallTable rows={view.top} name={name} empty="No priced calls in this period." />}
        </CardContent>
      </Card>

      <Card data-tour="developer-ai-usage-failed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Failed calls</CardTitle>
          <CardDescription className="text-xs">A failed call is recorded with its error. It costs nothing or very little.</CardDescription>
        </CardHeader>
        <CardContent>
          {!view ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <CallTable rows={view.failures} name={name} empty="No failed calls in this period." showError />
          )}
        </CardContent>
      </Card>

      <ConvexUsageCard />
    </div>
  )
}

function Notices({ truncated, unpriced }: { truncated: boolean; unpriced: number }) {
  if (!truncated && unpriced === 0) return null
  return (
    <div role="status" className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
      {truncated && (
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          More calls than one read takes: the totals are a lower bound. Export CSV for every call.
        </p>
      )}
      {unpriced > 0 && (
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          <span>
            {count(unpriced)} {unpriced === 1 ? "call has" : "calls have"} no price for its model, so the cost counts as 0.{" "}
            <Link href="/dev/ai/prices" className="text-primary underline-offset-2 hover:underline">
              Add the price
            </Link>
            .
          </span>
        </p>
      )}
    </div>
  )
}

function CostChart({ days, today, highlightFrom }: { days: DayAgg[]; today: string; highlightFrom: string }) {
  const series = useMemo(() => {
    const byDay = new Map(days.map((d) => [d.day, d.totals]))
    return Array.from({ length: 30 }, (_, i) => {
      const day = daysBefore(today, 29 - i)
      return { day, totals: byDay.get(day) }
    })
  }, [days, today])
  const max = Math.max(...series.map((s) => s.totals?.cost ?? 0), 0)
  const top = niceMax(max)
  const W = 600
  const H = 160
  const pad = { l: 44, r: 4, t: 6, b: 18 }
  const bw = (W - pad.l - pad.r) / series.length
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (top ? v / top : 0))
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label="Estimated cost per day for the last 30 days">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(top * f)} y2={y(top * f)} className="stroke-border" strokeWidth={1} />
            <text x={pad.l - 6} y={y(top * f) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {usd(top * f)}
            </text>
          </g>
        ))}
        {series.map((s, i) => {
          const cost = s.totals?.cost ?? 0
          const x = pad.l + i * bw
          const inRange = s.day >= highlightFrom
          return (
            <g key={s.day}>
              <title>
                {`${s.day}: ${usd(cost)} estimated, ${count(s.totals?.calls ?? 0)} calls${s.totals?.failed ? `, ${s.totals.failed} failed` : ""}`}
              </title>
              <rect x={x} y={pad.t} width={bw} height={H - pad.t - pad.b} className="fill-transparent" />
              <rect
                x={x + 1}
                y={y(cost)}
                width={Math.max(1, bw - 2)}
                height={Math.max(cost > 0 ? 1 : 0, H - pad.b - y(cost))}
                rx={1.5}
                className={inRange ? "fill-primary" : "fill-primary/30"}
              />
              {(i % 7 === 2 || i === series.length - 1) && (
                <text x={x + bw / 2} y={H - 4} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                  {i === series.length - 1 ? "Today" : s.day.slice(5)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

function niceMax(v: number): number {
  if (v <= 0) return 0.01
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * exp >= v) return m * exp
  return 10 * exp
}

function Breakdown({
  rows,
  total,
  label,
  empty,
}: {
  rows: { key: string; totals: Totals }[]
  total: Totals
  label: (key: string) => string
  empty: string
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">Calls</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Tokens in / out</TableHead>
          <TableHead className="w-40 text-right">Estimated cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 25).map((r) => {
          const share = total.cost > 0 ? r.totals.cost / total.cost : 0
          return (
            <TableRow key={r.key}>
              <TableCell className="max-w-[16rem] truncate" title={label(r.key)}>
                {label(r.key)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {count(r.totals.calls)}
                {r.totals.failed > 0 && <span className="ml-1 text-xs text-destructive">({r.totals.failed} failed)</span>}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                {tokens(r.totals.tokensIn)} / {tokens(r.totals.tokensOut)}
                {r.totals.units > 0 && r.totals.tokensOut === 0 ? ` (${count(r.totals.units)} items)` : ""}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
                    <div className="h-full bg-primary" style={{ width: `${Math.round(share * 100)}%` }} />
                  </div>
                  <span className="tabular-nums">{usd(r.totals.cost)}</span>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function Split({ people, system }: { people: Totals; system: Totals }) {
  const total = people.cost + system.cost
  const pShare = total > 0 ? people.cost / total : people.calls + system.calls > 0 ? people.calls / (people.calls + system.calls) : 0
  return (
    <div className="space-y-3">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="bg-primary" style={{ width: `${Math.round(pShare * 100)}%` }} />
        <div className="bg-primary/30" style={{ width: `${Math.round((1 - pShare) * 100)}%` }} />
      </div>
      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary" aria-hidden /> People
          </dt>
          <dd className="tabular-nums">
            {usd(people.cost)} <span className="text-xs text-muted-foreground">({count(people.calls)})</span>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary/30" aria-hidden /> System jobs
          </dt>
          <dd className="tabular-nums">
            {usd(system.cost)} <span className="text-xs text-muted-foreground">({count(system.calls)})</span>
          </dd>
        </div>
      </dl>
    </div>
  )
}

function CallTable({
  rows,
  name,
  empty,
  showError,
}: {
  rows: CallRow[]
  name: (key: string) => string
  empty: string
  showError?: boolean
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Feature</TableHead>
          <TableHead className="hidden md:table-cell">Model</TableHead>
          <TableHead className="hidden sm:table-cell">For</TableHead>
          {showError ? <TableHead>Error</TableHead> : <TableHead className="text-right">Tokens in / out</TableHead>}
          {!showError && <TableHead className="text-right">Estimated cost</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(r.time)}</TableCell>
            <TableCell>{featureLabel(r.feature)}</TableCell>
            <TableCell className="hidden font-mono text-xs md:table-cell">{r.model}</TableCell>
            <TableCell className="hidden max-w-[14rem] truncate text-xs sm:table-cell">
              {r.personKey ? name(r.personKey) : <Badge variant="outline">System</Badge>}
              {r.targetKey && <span className="text-muted-foreground"> · {name(r.targetKey)}</span>}
            </TableCell>
            {showError ? (
              <TableCell className="max-w-[20rem] truncate text-xs text-destructive" title={r.error ?? ""}>
                {r.error ?? "Failed"}
              </TableCell>
            ) : (
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {tokens(r.tokensIn)} / {tokens(r.tokensOut)}
              </TableCell>
            )}
            {!showError && <TableCell className="text-right tabular-nums">{r.cost === null ? "No price" : usd(r.cost)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function ExportButton({ personId, fromDay, toDay }: { personId: Id<"people">; fromDay: string; toDay: string }) {
  const exportCsv = useAction(api.aiUsage.exportCsv)
  const [busy, setBusy] = useState(false)
  async function run() {
    setBusy(true)
    try {
      const r = await exportCsv({ personId, fromDay, toDay })
      const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" }))
      const a = document.createElement("a")
      a.href = url
      a.download = `ai-usage-${fromDay}-to-${toDay}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${count(r.rows)} calls${r.truncated ? " (the first 50,000)" : ""}.`)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={() => void run()} disabled={busy} data-tour="developer-ai-usage-export">
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
      Export CSV
    </Button>
  )
}

// The deployment name is the first part of the Convex URL.
const DEPLOYMENT = /^https:\/\/([^.]+)\./.exec(import.meta.env.VITE_CONVEX_URL ?? "")?.[1] ?? null

/** Convex's own usage (function calls, reads, storage) is not visible from inside the app. */
function ConvexUsageCard() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Database and function usage</CardTitle>
        <CardDescription className="text-sm">
          Not AI cost: function calls, database reads, storage and bandwidth are counted by Convex, per team and billing
          month.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {DEPLOYMENT && (
          <a
            href={`https://dashboard.convex.dev/d/${DEPLOYMENT}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-primary underline-offset-2 hover:underline"
          >
            Open {DEPLOYMENT} in the Convex dashboard <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
        <Link href="/analysis/backend-gcp-and-gemma" className="text-primary underline-offset-2 hover:underline">
          The Free plan finding (case file)
        </Link>
      </CardContent>
    </Card>
  )
}
