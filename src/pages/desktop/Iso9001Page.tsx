import { useQuery } from "convex/react"
import { Link } from "wouter"
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  Info,
  Printer,
  UserRound,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { DocumentsTabs } from "@/components/docs/DocumentsTabs"
import {
  CLAUSES,
  STATUS_META,
  type EvidenceKey,
  type IsoRequirement,
  type IsoStatus,
} from "./iso9001/requirements"

// ISO 9001 (Settings, Knowledge health, Ctrl+K): which ISO 9001:2015
// requirements Oppr Knowledge touches, how, and what stays with the customer.
// Live numbers come from existing data; nothing here changes anything.

type Evidence = Record<EvidenceKey, number>

const STATUSES: IsoStatus[] = ["built", "supported", "process"]

const STATUS_STYLE: Record<IsoStatus, { pill: string; dot: string; bar: string }> = {
  built: {
    pill: "border-emerald-600/30 bg-emerald-500/10 text-emerald-700",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
  },
  supported: {
    pill: "border-sky-600/30 bg-sky-500/10 text-sky-700",
    dot: "bg-sky-500",
    bar: "bg-sky-500",
  },
  process: {
    pill: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/40",
    bar: "bg-muted-foreground/30",
  },
}

const EVIDENCE_META: Record<EvidenceKey, { label: string; badWhenAbove0?: boolean }> = {
  published: { label: "Published documents" },
  awaitingSignoff: { label: "awaiting review or approval" },
  withReviewDate: { label: "with a Periodic review date" },
  reviewsOverdue: { label: "reviews overdue", badWhenAbove0: true },
  withdrawn: { label: "withdrawn, kept on record" },
  wrappedPublished: { label: "Wrapped manuals Published" },
  trainingsPublished: { label: "Published Trainings" },
  trainingsNeedReview: { label: "Trainings back in review", badWhenAbove0: true },
  trainingRecords: { label: "Training records" },
  signedOff: { label: "Skill sign-offs at level 2 or 3" },
  retrainNeeded: { label: "re-train needed", badWhenAbove0: true },
  expired: { label: "expired Skill levels", badWhenAbove0: true },
  assignmentsOverdue: { label: "Training assignments overdue", badWhenAbove0: true },
  capturesProcessed: { label: "Captures processed" },
  openFindings: { label: "open Findings", badWhenAbove0: true },
  resolvedFindings: { label: "Findings resolved" },
}

function useEvidence(): { data: Evidence | undefined; capped: boolean } {
  const iso = useQuery(api.iso.evidence)
  const findings = useQuery(api.findings.counts)
  if (iso === undefined || findings === undefined) return { data: undefined, capped: false }
  return {
    capped: iso.capped,
    data: {
      published: iso.documents.published,
      awaitingSignoff: iso.documents.awaitingSignoff,
      withReviewDate: iso.documents.withReviewDate,
      reviewsOverdue: iso.documents.reviewsOverdue,
      withdrawn: iso.documents.withdrawn,
      wrappedPublished: iso.documents.wrappedPublished,
      trainingsPublished: iso.trainings.published,
      trainingsNeedReview: iso.trainings.needsReview,
      trainingRecords: iso.people.trainingRecords,
      signedOff: iso.people.signedOff,
      retrainNeeded: iso.people.retrainNeeded,
      expired: iso.people.expired,
      assignmentsOverdue: iso.people.assignmentsOverdue,
      capturesProcessed: iso.capturesProcessed,
      openFindings: findings.open,
      resolvedFindings: findings.resolved,
    },
  }
}

export function Iso9001Page() {
  const { data, capped } = useEvidence()

  return (
    <div className="flex flex-col print:[&_.sticky]:static">
      <div className="contents print:hidden">
        <TopBar breadcrumb={[{ label: "Documents", href: "/library" }, { label: "ISO 9001" }]} />
      </div>
      <PageHeader
        icon={BadgeCheck}
        title="ISO 9001"
        statusLine="What ISO 9001:2015 asks for, and what Oppr Knowledge already does about it."
        primary={
          <Button size="sm" className="print:hidden" onClick={() => window.print()} data-tour="documents-iso-print">
            <Printer aria-hidden />
            Print or save as PDF
          </Button>
        }
      />
      <DocumentsTabs className="print:hidden" />
      <div className="mx-auto w-full max-w-4xl space-y-10 p-6 print:max-w-none print:p-0">
        <Intro />
        <Summary data={data} capped={capped} />
        <BeforeAudit data={data} />
        <ClauseNav />
        {CLAUSES.map((c) => (
          <section
            key={c.number}
            id={`clause-${c.number}`}
            className="scroll-mt-32 space-y-3"
            data-tour={c === CLAUSES[0] ? "documents-iso-first-clause" : undefined}
          >
            <h2 className="text-base font-semibold">
              <span className="mr-2 font-mono text-muted-foreground">{c.number}</span>
              {c.title}
            </h2>
            <div className="space-y-3">
              {c.requirements.map((r) => (
                <RequirementCard key={r.id} req={r} data={data} />
              ))}
            </div>
          </section>
        ))}
        <p className="border-t pt-4 text-xs text-muted-foreground">
          Requirements are summarized in our own words; clause numbers refer to ISO 9001:2015. Read the standard
          itself for the exact wording.
        </p>
      </div>
    </div>
  )
}

function Intro() {
  return (
    <section className="space-y-3" data-tour="documents-iso-intro">
      <p className="text-sm leading-relaxed">
        For a quality or plant manager preparing for certification or a surveillance audit. Each requirement
        below says in plain language what an auditor wants to see, how Oppr helps, and whether that is built in,
        supported, or still your own process.
      </p>
      <div className="flex gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          Oppr does not certify anything. A certification body audits your whole quality system, of which
          controlled documents, competence and records are one part. This page shows where Oppr carries that part
          and where you need other evidence.
        </p>
      </div>
    </section>
  )
}

function counts(reqs: IsoRequirement[]) {
  const c: Record<IsoStatus, number> = { built: 0, supported: 0, process: 0 }
  for (const r of reqs) c[r.status]++
  return c
}

function Summary({ data, capped }: { data: Evidence | undefined; capped: boolean }) {
  const all = CLAUSES.flatMap((c) => c.requirements)
  const total = counts(all)

  return (
    <section className="space-y-4" data-tour="documents-iso-summary">
      <h2 className="text-base font-semibold">Coverage per clause</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        {STATUSES.map((s) => (
          <div key={s} className="rounded-md border p-3">
            <div className="flex items-center gap-2">
              <StatusPill status={s} />
              <span className="ml-auto text-lg font-semibold tabular-nums">{total[s]}</span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{STATUS_META[s].explain}</p>
          </div>
        ))}
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {CLAUSES.map((c) => {
            const n = counts(c.requirements)
            const sum = c.requirements.length
            return (
              <a
                key={c.number}
                href={`#clause-${c.number}`}
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(`clause-${c.number}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
                }}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm transition-colors hover:bg-muted/50"
              >
                <span className="w-6 font-mono text-muted-foreground">{c.number}</span>
                <span className="min-w-0 flex-1 basis-48">{c.title}</span>
                <span className="flex h-1.5 w-28 overflow-hidden rounded-full bg-muted" aria-hidden>
                  {STATUSES.map((s) => (
                    <span key={s} className={STATUS_STYLE[s].bar} style={{ width: `${(n[s] / sum) * 100}%` }} />
                  ))}
                </span>
                <span className="flex w-56 justify-end gap-3 text-xs tabular-nums text-muted-foreground">
                  {STATUSES.map((s) => (
                    <span key={s} className={cn(n[s] > 0 && "font-medium text-foreground")}>
                      {n[s]} {STATUS_META[s].label.toLowerCase()}
                    </span>
                  ))}
                </span>
              </a>
            )
          })}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Evidence in Oppr today</h3>
        {data === undefined ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Tile k="published" data={data} href="/library" />
            <Tile k="reviewsOverdue" data={data} href="/library/health#reviews" />
            <Tile k="trainingRecords" data={data} href="/learn?tab=records" />
            <Tile k="signedOff" data={data} href="/learn?tab=matrix" />
            <Tile k="openFindings" data={data} href="/library/findings" />
            <Tile k="wrappedPublished" data={data} href="/library" />
          </div>
        )}
        {capped && (
          <p className="text-xs text-muted-foreground">Large tables are counted up to 2000 rows; some numbers are a lower bound.</p>
        )}
      </div>
    </section>
  )
}

function isBad(k: EvidenceKey, v: number) {
  return !!EVIDENCE_META[k].badWhenAbove0 && v > 0
}

function Tile({ k, data, href }: { k: EvidenceKey; data: Evidence; href: string }) {
  const v = data[k]
  const label = EVIDENCE_META[k].label
  return (
    <Link href={href} className="rounded-md border bg-card p-3 transition-colors hover:border-primary/50">
      <span
        className={cn(
          "block text-2xl font-semibold tabular-nums",
          isBad(k, v) ? "text-amber-600" : v === 0 ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {v}
      </span>
      <span className="text-xs text-muted-foreground">{label.charAt(0).toUpperCase() + label.slice(1)}</span>
    </Link>
  )
}

type Check = {
  label: string
  detail: string
  href: string
  /** Items still to deal with (undefined while loading). Leave the key out for a manual check. */
  open?: number | undefined
}

function BeforeAudit({ data }: { data: Evidence | undefined }) {
  const checks: Check[] = [
    {
      label: "No Periodic review overdue",
      detail: "Confirm or revise every Published document whose review date has passed.",
      href: "/library/health#reviews",
      open: data?.reviewsOverdue,
    },
    {
      label: "Nothing waiting for a sign-off",
      detail: "Documents in review or approved but not Published look unfinished to an auditor.",
      href: "/",
      open: data?.awaitingSignoff,
    },
    {
      label: "No open Findings",
      detail: "Resolve contradictions and duplicates by publishing a revision, or dismiss them with a reason.",
      href: "/library/findings",
      open: data?.openFindings,
    },
    {
      label: "Re-training after Significant changes is done",
      detail: "People flagged re-train needed, and Trainings sent back to review, are cleared.",
      href: "/learn?tab=matrix",
      open: data === undefined ? undefined : data.retrainNeeded + data.trainingsNeedReview,
    },
    {
      label: "No expired Skills or overdue Training assignments",
      detail: "Renew expiring levels and close overdue assignments, or record why not.",
      href: "/learn?tab=matrix",
      open: data === undefined ? undefined : data.expired + data.assignmentsOverdue,
    },
    {
      label: "Supplier manuals match the supplier's latest revision",
      detail: "Check each Wrapped manual's supplier revision; replace the PDF when the supplier has a newer one.",
      href: "/library",
    },
    {
      label: "Training records exported for the audit sample",
      detail: "Filter the records to the period and people the auditor will sample, and export to CSV.",
      href: "/learn?tab=records",
    },
    {
      label: "Evidence for every Your process item is ready",
      detail: "Print this page and note where each item lives in your other systems.",
      href: "#clause-4",
    },
  ]

  return (
    <section className="space-y-3" data-tour="documents-iso-audit">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="text-base font-semibold">Before your audit</h2>
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {checks.map((c) => (
            <CheckRow key={c.label} check={c} loading={data === undefined} />
          ))}
        </CardContent>
      </Card>
    </section>
  )
}

function CheckRow({ check, loading }: { check: Check; loading: boolean }) {
  const manual = !("open" in check)
  const done = !manual && !loading && check.open === 0
  const todo = !manual && !loading && (check.open ?? 0) > 0

  return (
    <div className="flex items-start gap-3 px-4 py-3 break-inside-avoid">
      {manual ? (
        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Manual check" />
      ) : loading ? (
        <Skeleton className="mt-0.5 h-4 w-4 shrink-0 rounded-full" />
      ) : done ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-label="Done" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-label="To do" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {check.label}
          {todo && <span className="ml-2 text-xs font-normal text-amber-700">{check.open} open</span>}
          {manual && <span className="ml-2 text-xs font-normal text-muted-foreground">check by hand</span>}
        </p>
        <p className="text-xs text-muted-foreground">{check.detail}</p>
      </div>
      {check.href.startsWith("/") && (
        <Link
          href={check.href}
          className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline print:hidden"
        >
          Open
        </Link>
      )}
    </div>
  )
}

function ClauseNav() {
  return (
    <nav aria-label="Clauses" className="flex flex-wrap gap-1.5 print:hidden" data-tour="documents-iso-clauses">
      {CLAUSES.map((c) => (
        <a
          key={c.number}
          href={`#clause-${c.number}`}
          onClick={(e) => {
            e.preventDefault()
            document.getElementById(`clause-${c.number}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
          }}
          className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <span className="font-mono">{c.number}</span> {c.title}
        </a>
      ))}
    </nav>
  )
}

function StatusPill({ status }: { status: IsoStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        STATUS_STYLE[status].pill,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_STYLE[status].dot)} aria-hidden />
      {STATUS_META[status].label}
    </span>
  )
}

function RequirementCard({ req, data }: { req: IsoRequirement; data: Evidence | undefined }) {
  return (
    <Card className="break-inside-avoid">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <h3 className="min-w-0 flex-1 text-sm font-semibold">
            <span className="mr-2 font-mono text-xs font-normal text-muted-foreground">{req.clause}</span>
            {req.title}
          </h3>
          <StatusPill status={req.status} />
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">What an auditor wants to see</p>
          <p className="text-sm leading-relaxed">{req.auditor}</p>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">How Oppr helps</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm leading-relaxed marker:text-muted-foreground">
            {req.oppr.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        {req.yours && (
          <p className="text-sm leading-relaxed">
            <span className="text-xs font-medium text-muted-foreground">Still yours: </span>
            {req.yours}
          </p>
        )}

        {(req.evidence?.length || req.link) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {req.evidence?.map((k) =>
              data === undefined ? (
                <Skeleton key={k} className="h-5 w-32" />
              ) : (
                <span
                  key={k}
                  className={cn(
                    "rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums",
                    isBad(k, data[k]) ? "bg-amber-500/10 text-amber-700" : "text-muted-foreground",
                  )}
                >
                  <span className="font-semibold">{data[k]}</span> {EVIDENCE_META[k].label}
                </span>
              ),
            )}
            {req.link && (
              <Link
                href={req.link.href}
                className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline print:hidden"
              >
                {req.link.label}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
