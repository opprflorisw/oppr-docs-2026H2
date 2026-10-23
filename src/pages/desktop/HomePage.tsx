import { useQuery } from "convex/react"
import { Link, useLocation } from "wouter"
import {
  BookOpenText,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  Home,
  Inbox,
  Plus,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"

// Home (CONTEXT.md): an Engineer's inbox of decisions waiting today, plus a
// small Knowledge health snapshot. Every inbox row has one obvious action.
export function HomePage() {
  const data = useQuery(api.home.overview)
  const { person } = useCheckIn()
  const [, navigate] = useLocation()
  const inboxCount = data ? data.approvals.length + data.reviews.length : 0

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Home" }]} />
      <PageHeader
        icon={Home}
        title={person ? `Good to see you, ${person.name.split(" ")[0]}` : "Home"}
        subtitle="What needs a decision today, and how the knowledge base is doing."
        actions={
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate("/docs/new")}>
            <Plus className="h-3.5 w-3.5" />
            New document
          </Button>
        }
      />

      <div className="mx-auto grid w-full max-w-6xl gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Inbox</h2>
            {data && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {inboxCount}
              </Badge>
            )}
          </div>

          {data === undefined ? (
            <Card>
              <CardContent className="p-4 text-xs text-muted-foreground">Loading…</CardContent>
            </Card>
          ) : inboxCount === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="text-sm font-medium">Nothing needs you today</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Reviews waiting for approval and documents due for their
                  periodic review show up here.
                </p>
                <Button size="sm" variant="outline" className="mt-1" onClick={() => navigate("/library")}>
                  Browse documents
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {data.approvals.map((d) => (
                  <InboxRow
                    key={`a-${d._id}`}
                    icon={FileCheck2}
                    tone="primary"
                    title={d.title}
                    code={`${d.namingCode} · v${d.version}${d.isRevision ? " revision" : ""}`}
                    note={d.status === "in_review" ? "Waiting for your review. Open it to approve." : "Approved. Open it to publish."}
                    action={d.status === "in_review" ? "Review" : "Publish"}
                    href={`/docs/${d._id}/edit`}
                  />
                ))}
                {data.reviews.map((d) => (
                  <InboxRow
                    key={`r-${d._id}`}
                    icon={CalendarClock}
                    tone={d.daysLeft < 0 ? "danger" : "warning"}
                    title={d.title}
                    code={`${d.namingCode} · v${d.version}`}
                    note={
                      d.revisionInProgress
                        ? "Periodic review: a revision is already in progress"
                        : d.daysLeft < 0
                          ? `Periodic review overdue by ${-d.daysLeft} ${-d.daysLeft === 1 ? "day" : "days"}`
                          : d.daysLeft === 0
                            ? "Periodic review due today"
                            : `Periodic review due in ${d.daysLeft} ${d.daysLeft === 1 ? "day" : "days"}`
                    }
                    action="Check"
                    href={`/docs/${d._id}?panel=review`}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </section>

        <aside className="space-y-3">
          <div className="flex items-center gap-2">
            <BookOpenText className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Knowledge health</h2>
          </div>
          <Card>
            <CardContent className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border p-0">
              <Stat label="Published" value={data?.health.published} href="/library?status=published" />
              <Stat label="In progress" value={data?.health.inProgress} href="/library" />
              <Stat
                label="Review due"
                value={data?.health.reviewDue}
                warn={(data?.health.overdue ?? 0) > 0}
                hint={data?.health.overdue ? `${data.health.overdue} overdue` : undefined}
              />
              <Stat label="Wikis" value={data?.health.wikis} href="/wiki" />
            </CardContent>
          </Card>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Only published documents count as knowledge. Ask and every Wiki
            use the published version, never a draft.
          </p>
        </aside>
      </div>
    </div>
  )
}

function InboxRow({
  icon: Icon,
  tone,
  title,
  code,
  note,
  action,
  href,
}: {
  icon: typeof Inbox
  tone: "primary" | "warning" | "danger"
  title: string
  code: string
  note: string
  action: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
    >
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
        <span className="block truncate text-xs text-muted-foreground">
          <span className="font-mono">{code}</span> · {note}
        </span>
      </span>
      <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs group-hover:border-primary/50" tabIndex={-1}>
        {action}
      </Button>
    </Link>
  )
}

function Stat({
  label,
  value,
  href,
  warn,
  hint,
}: {
  label: string
  value: number | undefined
  /** Omitted when the number is already listed on this page (the inbox). */
  href?: string
  warn?: boolean
  hint?: string
}) {
  const body = (
    <>
      <div className={cn("text-xl font-semibold tabular-nums", warn && "text-red-600")}>
        {value ?? "–"}
      </div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      {hint && <div className="text-[10px] font-medium text-red-600">{hint}</div>}
    </>
  )
  if (!href) return <div className="bg-card p-3">{body}</div>
  return (
    <Link href={href} className="bg-card p-3 transition-colors hover:bg-muted/50">
      {body}
    </Link>
  )
}
