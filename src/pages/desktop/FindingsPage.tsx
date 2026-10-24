import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { useLocation, useSearch } from "wouter"
import { toast } from "sonner"
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Loader2,
  Play,
  SearchCheck,
  ShieldCheck,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FindingCard } from "@/components/findings/FindingCard"
import { errorText, whenText } from "@/components/findings/findingUtils"
import { useCheckIn } from "@/lib/checkIn"
import { DocumentsTabs } from "@/components/docs/DocumentsTabs"

type Tab = "open" | "resolved" | "dismissed"
const TABS: { value: Tab; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
]

const TRIGGER_TEXT = {
  publish: "on publish",
  weekly: "weekly",
  manual: "run by hand",
  seed: "after setup",
} as const

// Contradictions come first everywhere: Ask could give conflicting answers.
// Overlaps (repeated sections) only make the library bigger than it needs to be.
const GROUPS = [
  {
    kind: "contradiction",
    title: "Contradictions",
    text: "Two Published documents say different things. Settle these first.",
  },
  {
    kind: "duplicate",
    title: "Overlaps",
    text: "Two Published documents repeat the same section. Lower priority: consider merging them.",
  },
] as const

// /library/findings (CONTEXT.md: Consistency check, Finding). Every Finding
// the check produced: open ones to act on, and the closed ones as a record of
// how each was settled.
export function FindingsPage() {
  const findings = useQuery(api.findings.list, {})
  const run = useQuery(api.findings.latestRun)
  const runNow = useMutation(api.findings.runCheckNow)
  const { person } = useCheckIn()
  const engineer = person?.kind === "engineer" ? person : null
  const search = useSearch()
  const [, navigate] = useLocation()
  const [starting, setStarting] = useState(false)

  const params = new URLSearchParams(search)
  const focusId = params.get("f")
  const requested = params.get("status") as Tab | null
  const focused = focusId ? findings?.find((f) => f._id === focusId) : undefined
  const tab: Tab = focused
    ? focused.status
    : requested && TABS.some((t) => t.value === requested)
      ? requested
      : "open"

  const byStatus = useMemo(() => {
    const m: Record<Tab, NonNullable<typeof findings>> = { open: [], resolved: [], dismissed: [] }
    for (const f of findings ?? []) m[f.status].push(f)
    return m
  }, [findings])

  // Arriving from a banner, Home or Ask: scroll to that Finding.
  useEffect(() => {
    if (!focused) return
    const t = window.setTimeout(() => {
      document.getElementById(`finding-${focused._id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 150)
    return () => window.clearTimeout(t)
  }, [focused])

  const running = run?.running ?? null

  async function startRun() {
    if (!engineer) {
      toast.error("Check in as an Engineer (top right) to run the Consistency check.")
      return
    }
    setStarting(true)
    try {
      await runNow({ personId: engineer._id })
      toast.success("Consistency check started.", {
        description: "It compares every Published document with the others. This takes a minute or two.",
      })
    } catch (err) {
      toast.error(errorText(err, "The Consistency check could not be started."))
    } finally {
      setStarting(false)
    }
  }

  const list = byStatus[tab]
  const openContradictions = byStatus.open.filter((f) => f.kind === "contradiction").length

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Documents", href: "/library" }, { label: "Findings" }]} />
      <PageHeader
        icon={SearchCheck}
        title="Findings"
        statusLine="Where Published documents contradict or repeat each other, found by the Consistency check."
        primary={
          <span className="flex items-center gap-2">
            {!engineer && (
              <span className="hidden text-xs text-muted-foreground xl:inline">Check in as an Engineer to run it.</span>
            )}
            <Button size="sm" onClick={() => void startRun()} disabled={starting || running != null || !engineer}>
              {starting || running ? <Loader2 className="animate-spin" /> : <Play />}
              {running ? "Checking..." : "Run check now"}
            </Button>
          </span>
        }
      />
      <DocumentsTabs />

      <div className="mx-auto grid w-full max-w-6xl gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 space-y-4">
          <Tabs
            value={tab}
            onValueChange={(v) => navigate(`/library/findings?status=${v}`, { replace: true })}
          >
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="gap-1.5 text-xs">
                  {t.label}
                  {findings && (
                    <Badge
                      variant="secondary"
                      className={
                        t.value === "open" && openContradictions > 0
                          ? "h-4 bg-red-500/10 px-1.5 text-[10px] text-red-700 dark:text-red-300"
                          : "h-4 px-1.5 text-[10px]"
                      }
                    >
                      {byStatus[t.value].length}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {findings === undefined ? (
            <div className="space-y-3">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : list.length === 0 ? (
            <EmptyState tab={tab} running={running != null} onRun={() => void startRun()} />
          ) : (
            <div className="space-y-6">
              {GROUPS.map((g) => {
                const items = list.filter((f) => f.kind === g.kind)
                if (items.length === 0) return null
                return (
                  <div key={g.kind} className="space-y-3">
                    <div>
                      <h2 className="flex items-center gap-2 text-sm font-semibold">
                        {g.title}
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                          {items.length}
                        </Badge>
                      </h2>
                      <p className="text-xs text-muted-foreground">{g.text}</p>
                    </div>
                    {items.map((f) => (
                      <FindingCard key={f._id} finding={f} highlighted={f._id === focusId} />
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <aside className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Consistency check</h2>
          </div>
          <div className="space-y-2 rounded-lg border p-3 text-xs">
            {run === undefined ? (
              <Skeleton className="h-10 w-full" />
            ) : running ? (
              <p className="flex items-start gap-1.5">
                <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                <span>
                  {running.library
                    ? "Checking the whole library now."
                    : `Checking ${running.namingCode ?? "a newly Published document"} against the library.`}{" "}
                  New Findings appear here when it is done.
                </span>
              </p>
            ) : null}
            {run?.last ? (
              run.last.status === "failed" ? (
                <p className="flex items-start gap-1.5 text-red-700 dark:text-red-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    The last check ({TRIGGER_TEXT[run.last.trigger]}, {whenText(run.last.startedAt)}) failed
                    {run.last.error ? `: ${run.last.error}` : "."}
                  </span>
                </p>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-muted-foreground">
                    Last check {whenText(run.last.finishedAt ?? run.last.startedAt)},{" "}
                    {run.last.namingCode ? `on publishing ${run.last.namingCode}` : TRIGGER_TEXT[run.last.trigger]}.
                  </p>
                  <p>
                    Compared {run.last.pairsChecked} {run.last.pairsChecked === 1 ? "pair" : "pairs"} of passages,{" "}
                    {run.last.findingsNew === 0
                      ? "no new Findings."
                      : `${run.last.findingsNew} new ${run.last.findingsNew === 1 ? "Finding" : "Findings"}.`}
                  </p>
                  {run.last.error && <p className="text-amber-700 dark:text-amber-400">{run.last.error}</p>}
                </div>
              )
            ) : (
              run && !running && <p className="text-muted-foreground">The check has not run yet.</p>
            )}
          </div>
          <div className="space-y-2 rounded-lg border p-3 text-[11px] leading-relaxed text-muted-foreground">
            <p>
              The check runs on every publish, comparing the new version with all other Published
              documents, and every Sunday across the whole library. Drafts never take part.
            </p>
            <p>
              The AI judges likely pairs. Code then confirms that both quoted passages really are in the
              documents, so every Finding can be checked at its source.
            </p>
            <p>
              A Finding is resolved when a revision of either document is Published. An Engineer can also
              dismiss it with a reason: the pair is then not reported again until one side changes.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function EmptyState({ tab, running, onRun }: { tab: Tab; running: boolean; onRun: () => void }) {
  const copy = {
    open: {
      icon: <CheckCircle2 className="h-8 w-8 text-emerald-500" />,
      title: "No open Findings",
      text: "The Published documents do not contradict or repeat each other as far as the last check could tell. New Findings show up here.",
    },
    resolved: {
      icon: <CheckCircle2 className="h-8 w-8 text-muted-foreground/60" />,
      title: "Nothing resolved yet",
      text: "A Finding is resolved when a revision of one of its documents is Published. It is kept here as a record.",
    },
    dismissed: {
      icon: <CircleSlash className="h-8 w-8 text-muted-foreground/60" />,
      title: "Nothing dismissed",
      text: "Findings an Engineer dismissed show up here, with who dismissed them and why.",
    },
  }[tab]
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        {copy.icon}
        <p className="text-sm font-medium">{copy.title}</p>
        <p className="max-w-sm text-xs text-muted-foreground">{copy.text}</p>
        {tab === "open" && (
          <Button size="sm" variant="outline" className="mt-1" onClick={onRun} disabled={running}>
            {running ? "Checking…" : "Run check now"}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
