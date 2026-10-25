import { useEffect, type ComponentType, type ReactNode } from "react"
import { useQuery } from "convex/react"
import { Link } from "wouter"
import type { LucideProps } from "lucide-react"
import {
  Archive,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Copy,
  HeartPulse,
  HelpCircle,
  MessageCircleQuestion,
  Sparkles,
  Split,
  TrendingUp,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { PrepareRevisionButton } from "@/components/insights/PrepareRevisionDialog"
import { DocumentsTabs } from "@/components/docs/DocumentsTabs"
import { TrainingSignalsHealth } from "@/components/learn/training/TrainingSignalsHealth"

type Health = NonNullable<ReturnType<typeof useHealth>>
type Item = Health["neverUsed"][number]

function useHealth() {
  return useQuery(api.insights.health)
}

// Knowledge health (CONTEXT.md): is the body of Knowledge lean and relevant?
// Published documents only, signals from the last 90 days. The goal is a
// smaller, better library, not a bigger one.
export function KnowledgeHealthPage() {
  const data = useHealth()

  // Arriving from Home with #section: scroll to it once the page has data.
  useEffect(() => {
    if (!data) return
    const id = window.location.hash.slice(1)
    if (!id) return
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 100)
    return () => window.clearTimeout(t)
  }, [data])

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Documents", href: "/library" }, { label: "Knowledge health" }]} />
      <PageHeader
        icon={HeartPulse}
        title="Knowledge health"
        statusLine="Is the library lean and relevant? Published documents only, signals from the last 90 days."
        secondary={[{ label: "ISO 9001", icon: BadgeCheck, href: "/iso-9001", tour: "documents-health-iso" }]}
      />
      <DocumentsTabs />
      <div className="mx-auto w-full max-w-6xl space-y-8 p-6">
        {data === undefined ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-2/3" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <HealthBody data={data} />
        )}
      </div>
    </div>
  )
}

function HealthBody({ data }: { data: Health }) {
  const s = data.stats
  const todo = s.needsDecision
  const pct = s.answeredRate == null ? null : Math.round(s.answeredRate * 100)

  return (
    <>
      <section className="space-y-4" data-tour="documents-health-summary">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            {s.published === 0
              ? "No Published documents yet."
              : todo === 0
                ? `${s.published} Published documents, all used, consistent and not due for review.`
                : `${todo} of ${s.published} Published documents ${todo === 1 ? "needs" : "need"} a decision: never used, unclear, in a Finding or due for review.`}
          </h2>
          <p className="text-sm text-muted-foreground">
            {s.views} views, {s.scans} Scans and {s.questions} questions in the last {data.windowDays} days
            {pct != null && `; ${pct}% of the questions were answered from Published documents`}.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-tour="documents-health-tiles">
          <Tile href="#never-used" icon={Archive} label="Never used" value={s.neverUsed} tone={s.neverUsed ? "warn" : "ok"} />
          <Tile href="#unclear" icon={HelpCircle} label="Asked but unclear" value={s.unclear} tone={s.unclear ? "warn" : "ok"} />
          <Tile
            href="#contradictions"
            icon={Split}
            label="Contradictions"
            value={s.contradictions}
            tone={s.contradictions ? "danger" : "ok"}
          />
          <Tile href="#overlaps" icon={Copy} label="Overlaps" value={s.overlaps} tone={s.overlaps ? "warn" : "ok"} />
          <Tile
            href="#reviews"
            icon={CalendarClock}
            label="Reviews due"
            value={s.reviewsDue}
            tone={s.overdue ? "danger" : s.reviewsDue ? "warn" : "ok"}
            hint={s.overdue ? `${s.overdue} overdue` : undefined}
          />
          <Tile href="#proposals" icon={Sparkles} label="Proposed revisions" value={s.proposals} tone="info" />
        </div>
      </section>

      <Section
        id="never-used"
        icon={Archive}
        title="Never used"
        intro="Nobody opened these or asked about them. Keep only what people need: archive it, or merge it into a document they do read."
        items={data.neverUsed}
        empty="Every Published document was opened or asked about in the last 90 days."
      />
      <Section
        id="unclear"
        icon={HelpCircle}
        title="Asked but unclear"
        intro="People ask about these, and often the answer is not there or the text was marked unclear."
        items={data.unclear}
        empty="No document stands out for unanswered questions or unclear marks."
      />
      <NotInLibrary data={data} />
      <TrainingSignalsHealth />
      <Section
        id="contradictions"
        icon={Split}
        title="Contradictions"
        intro="Two Published documents disagree. Ask warns people about these until one side is revised."
        items={data.contradictions}
        empty="The Consistency check found no Published documents that disagree."
      />
      <Section
        id="overlaps"
        icon={Copy}
        title="Overlaps"
        intro="Two documents repeat the same section. Lower priority than a contradiction: keep it in one place and refer to it from the other."
        items={data.overlaps}
        empty="The Consistency check found no duplicated passages between Published documents."
      />
      <Section
        id="reviews"
        icon={CalendarClock}
        title="Reviews due"
        intro="Periodic reviews due in the next 30 days or overdue."
        items={data.reviewsDue}
        empty="No periodic review is due in the next 30 days."
      />
      <Section
        id="proposals"
        icon={Sparkles}
        title="Proposed revisions waiting"
        intro="Drafts the AI prepared from these signals. They go through normal review; the AI never publishes."
        items={data.proposals}
        empty="No Proposed revisions are waiting. Use Prepare a revision on a document above to start one."
      />

      <MostUsed data={data} />
      <AllDocuments data={data} />
    </>
  )
}

const TONE = {
  ok: "text-emerald-600",
  info: "text-primary",
  warn: "text-amber-600",
  danger: "text-red-600",
} as const

function Tile({
  href,
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  href: string
  icon: ComponentType<LucideProps>
  label: string
  value: number
  tone: keyof typeof TONE
  hint?: string
}) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" })
        history.replaceState(null, "", href)
      }}
      className="group rounded-lg border bg-card p-3 transition-colors hover:border-primary/50"
    >
      <div className="flex items-center justify-between">
        <span className={cn("text-2xl font-semibold tabular-nums", value === 0 ? "text-muted-foreground" : TONE[tone])}>
          {value}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {hint && <p className="text-[10px] font-medium text-red-600">{hint}</p>}
    </a>
  )
}

function Section({
  id,
  icon: Icon,
  title,
  intro,
  items,
  empty,
}: {
  id: string
  icon: ComponentType<LucideProps>
  title: string
  intro: string
  items: Item[]
  empty: string
}) {
  return (
    <section id={id} className="scroll-mt-32 space-y-2" data-tour={`documents-health-${id}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
          {items.length}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{intro}</p>
      <Card>
        <CardContent className="divide-y p-0">
          {items.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              {empty}
            </p>
          ) : (
            items.map((it, i) => <Row key={`${it.documentId}-${i}`} item={it} />)
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function Row({ item }: { item: Item }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          item.tone === "danger" ? "bg-red-500" : item.tone === "warn" ? "bg-amber-500" : "bg-primary",
        )}
      />
      <div className="min-w-0 flex-1 basis-80">
        <Link href={`/docs/${item.documentId}`} className="block truncate text-sm font-medium hover:underline">
          <span className="font-mono text-xs text-muted-foreground">{item.namingCode}</span> {item.title}
        </Link>
        <p className="text-xs text-muted-foreground">
          {item.reason}
          {item.related && (
            <>
              {" "}
              Other side:{" "}
              <Link href={`/docs/${item.related.documentId}`} className="font-mono hover:underline">
                {item.related.namingCode}
              </Link>
              .
            </>
          )}
        </p>
      </div>
      <RowAction item={item} />
    </div>
  )
}

function RowAction({ item }: { item: Item }) {
  const a = item.action
  if (a.kind === "propose") {
    return (
      <PrepareRevisionButton
        documentId={a.documentId as Id<"documents">}
        namingCode={item.namingCode}
        source={
          a.source === "finding" && a.findingId
            ? { kind: "finding", findingId: a.findingId as Id<"findings"> }
            : { kind: a.source === "finding" ? "health" : a.source }
        }
      >
        {a.label}
      </PrepareRevisionButton>
    )
  }
  return (
    <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" asChild>
      <Link href={a.href}>{a.label}</Link>
    </Button>
  )
}

// Questions Ask could not answer from any Published document: a gap in the
// library itself, not in one document.
function NotInLibrary({ data }: { data: Health }) {
  if (data.notInLibrary.length === 0) return null
  return (
    <section id="not-in-library" className="scroll-mt-32 space-y-2">
      <div className="flex items-center gap-2">
        <MessageCircleQuestion className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Questions no document answers</h2>
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
          {data.notInLibrary.length}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Ask found nothing in Published Knowledge for these. Publish the document that covers it, or write one.
      </p>
      <Card>
        <CardContent className="divide-y p-0">
          {data.notInLibrary.map((q) => (
            <div key={q.question} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
              <div className="min-w-0 flex-1 basis-80">
                <p className="text-sm">
                  “{q.question}”
                  {q.count > 1 && <span className="text-muted-foreground"> ×{q.count}</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {q.where ? `Asked at ${q.where}` : "Asked in the library"}
                  {q.pending &&
                    `. ${q.pending.namingCode} covers this Asset but is ${q.pending.status === "approved" ? "approved, not Published yet" : "not Published yet"}`}
                  .
                </p>
              </div>
              {q.pending ? (
                <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" asChild>
                  <Link href={`/docs/${q.pending.documentId}`}>Open {q.pending.namingCode}</Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" asChild>
                  <Link href="/library?new=1">New document</Link>
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  )
}

function MostUsed({ data }: { data: Health }) {
  if (data.mostUsed.length === 0) return null
  const max = Math.max(...data.mostUsed.map((m) => m.views + m.questions))
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Most used</h2>
      </div>
      <p className="text-xs text-muted-foreground">The documents people rely on most. Keep these sharp first.</p>
      <Card>
        <CardContent className="divide-y p-0">
          {data.mostUsed.map((m) => (
            <Link
              key={m.documentId}
              href={`/docs/${m.documentId}`}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-mono text-xs text-muted-foreground">{m.namingCode}</span> {m.title}
              </span>
              <span className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-muted sm:block">
                <span
                  className="block h-full rounded-full bg-primary/60"
                  style={{ width: `${((m.views + m.questions) / max) * 100}%` }}
                />
              </span>
              <span className="w-40 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {m.views} views · {m.questions} questions
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </section>
  )
}

function AllDocuments({ data }: { data: Health }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">All Published documents</h2>
      <p className="text-xs text-muted-foreground">
        Views count readers who opened the document; Scans count Scans of its Assets; Marks are unclear or wrong marks.
      </p>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <Num head>Views</Num>
                <Num head>Scans</Num>
                <Num head>Questions</Num>
                <Num head>Unanswered</Num>
                <Num head>Marks</Num>
                <Num head>Findings</Num>
                <TableHead className="text-right">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.table.map((r) => (
                <TableRow key={r.documentId}>
                  <TableCell className="max-w-[320px]">
                    <Link href={`/docs/${r.documentId}`} className="block truncate text-sm hover:underline">
                      <span className="font-mono text-xs text-muted-foreground">{r.namingCode}</span> {r.title}
                    </Link>
                    <span className="flex flex-wrap gap-1 pt-0.5">
                      {r.neverUsed && <Flag tone="warn">never used</Flag>}
                      {r.unclear && <Flag tone="warn">unclear</Flag>}
                      {r.hasProposal && <Flag tone="info">Proposed revision</Flag>}
                      {r.origin === "wrapped" && <Flag tone="muted">Wrapped manual</Flag>}
                    </span>
                  </TableCell>
                  <Num>{r.views}</Num>
                  <Num>{r.scans}</Num>
                  <Num>{r.questions}</Num>
                  <Num warn={r.unanswered > 0}>{r.unanswered}</Num>
                  <Num warn={r.flags > 0}>{r.flags}</Num>
                  <Num danger={r.openFindings > 0}>{r.openFindings}</Num>
                  <TableCell
                    className={cn(
                      "text-right text-xs tabular-nums",
                      r.reviewInDays != null && r.reviewInDays < 0
                        ? "text-red-600"
                        : r.reviewInDays != null && r.reviewInDays <= 30
                          ? "text-amber-600"
                          : "text-muted-foreground",
                    )}
                  >
                    {r.reviewInDays == null
                      ? "–"
                      : r.reviewInDays < 0
                        ? `${-r.reviewInDays} d overdue`
                        : `in ${r.reviewInDays} d`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  )
}

function Num({
  children,
  head,
  warn,
  danger,
}: {
  children: ReactNode
  head?: boolean
  warn?: boolean
  danger?: boolean
}) {
  if (head) return <TableHead className="w-20 text-right">{children}</TableHead>
  return (
    <TableCell
      className={cn(
        "text-right text-sm tabular-nums",
        children === 0 && "text-muted-foreground/60",
        warn && "font-medium text-amber-600",
        danger && "font-medium text-red-600",
      )}
    >
      {children}
    </TableCell>
  )
}

function Flag({ tone, children }: { tone: "warn" | "info" | "muted"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "rounded px-1 text-[10px]",
        tone === "warn" && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
        tone === "info" && "bg-violet-500/10 text-violet-700 dark:text-violet-300",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  )
}
