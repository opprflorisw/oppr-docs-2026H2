import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Link, useLocation, useRoute } from "wouter"
import {
  AlertOctagon,
  AlertTriangle,
  BookOpenText,
  CheckCircle2,
  FileText,
  ListChecks,
  ShieldAlert,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { MobileSheet } from "@/components/mobile/MobileSheet"
import {
  FORMAT_LABEL,
  groupByDocument,
  isWarning,
  passageHref,
  sectionSlugs,
  WikiText,
  type CitationGroup,
  type WikiPointView,
  type WikiSectionView,
  type WikiView,
} from "@/components/wiki/wikiShared"
import { formatAgo } from "@/lib/time"
import { cn } from "@/lib/utils"

// /m/wiki/:id (plan, Wiki addition 1): the Wiki on the floor. A sticky chip
// bar per section, 16px fact cards, a source chip that opens the passage in a
// bottom sheet with "Open in document", and a footer that says whether the
// sources are still current.

export function MobileWikiPage() {
  const [, params] = useRoute<{ id: string }>("/m/wiki/:id")
  const id = params?.id as Id<"wikis"> | undefined
  const wiki = useQuery(api.wikis.get, id ? { id } : "skip")
  const recordView = useMutation(api.wikis.recordView)

  useEffect(() => {
    if (!id) return
    const key = `oppr.wikiViewed.${id}`
    try {
      if (window.sessionStorage.getItem(key)) return
      window.sessionStorage.setItem(key, "1")
    } catch {
      // Storage blocked: count it anyway.
    }
    void recordView({ id }).catch(() => {})
  }, [id, recordView])

  if (wiki === undefined) {
    return (
      <div className="flex flex-col">
        <MobileHeader backTo="/m" title="Wiki" />
        <div className="space-y-3 p-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      </div>
    )
  }
  if (wiki === null) {
    return (
      <div className="flex h-full flex-col">
        <MobileHeader backTo="/m" title="Wiki not found" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <BookOpenText className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-base font-semibold">This Wiki no longer exists</p>
          <p className="text-sm text-muted-foreground">It may have been deleted by an Engineer.</p>
          <Button asChild className="mt-2 h-12 px-6 text-base">
            <Link href="/m">Back to home</Link>
          </Button>
        </div>
      </div>
    )
  }
  return <MobileWikiReader wiki={wiki} />
}

function MobileWikiReader({ wiki }: { wiki: WikiView }) {
  const sections = useMemo(() => wiki.content?.sections ?? [], [wiki.content])
  const slugs = useMemo(() => sectionSlugs(sections), [sections])
  const [active, setActive] = useState(0)
  const [sheet, setSheet] = useState<CitationGroup | null>(null)
  const chipBar = useRef<HTMLDivElement>(null)
  const keyPoints = sections.flatMap((s) => s.points.filter((p) => p.key && !p.cells))

  // Scroll-spy: the chip of the section in view is highlighted.
  useEffect(() => {
    const els = slugs.map((s) => document.getElementById(`m-${s}`)).filter((e): e is HTMLElement => e !== null)
    if (els.length === 0) return
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive(els.indexOf(top.target as HTMLElement))
      },
      { rootMargin: "-130px 0px -55% 0px" },
    )
    els.forEach((e) => obs.observe(e))
    return () => obs.disconnect()
  }, [slugs])
  useEffect(() => {
    const bar = chipBar.current
    const chip = bar?.querySelector<HTMLElement>(`[data-chip="${active}"]`)
    // Scroll the chip bar only (scrollIntoView would also move the page).
    if (bar && chip) bar.scrollTo({ left: chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" })
  }, [active])

  const n = wiki.sources.length
  const changed = wiki.outdated.length

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 bg-background">
        <MobileHeader backTo="/m" title={wiki.title} subtitle={`Wiki · ${FORMAT_LABEL[wiki.format]}`} />
        {sections.length > 1 && (
          <div
            ref={chipBar}
            className="flex gap-2 overflow-x-auto border-b bg-background px-4 py-2 [scrollbar-width:none]"
            role="tablist"
            aria-label="Sections"
          >
            {sections.map((s, i) => (
              <button
                key={slugs[i]}
                type="button"
                role="tab"
                data-chip={i}
                aria-selected={active === i}
                onClick={() => {
                  setActive(i)
                  document.getElementById(`m-${slugs[i]}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
                }}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                  active === i ? "border-primary-strong bg-primary-strong text-white" : "bg-background text-foreground",
                )}
              >
                {s.safety && <ShieldAlert className={cn("h-4 w-4", active === i ? "text-white" : "text-amber-600")} aria-hidden />}
                <span className="max-w-[12rem] truncate">{s.heading}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 space-y-6 px-4 pb-8 pt-4">
        {wiki.purpose && <p className="text-[15px] leading-6 text-muted-foreground">{wiki.purpose}</p>}

        {wiki.status === "generating" && !wiki.content && (
          <p className="rounded-2xl border bg-muted/40 p-4 text-base">This Wiki is being built. Check back in a minute.</p>
        )}
        {wiki.status === "empty" && (
          <p className="rounded-2xl border bg-muted/40 p-4 text-base">Nothing published matches this Wiki yet.</p>
        )}
        {wiki.health.pointsWithFinding > 0 && (
          <p className="flex gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">
            <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {wiki.health.pointsWithFinding} {wiki.health.pointsWithFinding === 1 ? "fact rests" : "facts rest"} on documents that
            disagree. Ask your Engineer before acting on {wiki.health.pointsWithFinding === 1 ? "it" : "them"}.
          </p>
        )}

        {keyPoints.length > 0 && (
          <section className="rounded-2xl border border-primary/25 bg-primary/[0.05] p-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-primary-strong">
              <ListChecks className="h-5 w-5" aria-hidden /> At a glance
            </h2>
            <ul className="mt-2 space-y-3">
              {keyPoints.map((p, i) => (
                <li key={i} className="text-base font-medium leading-6">
                  <WikiText text={p.text} mobile />
                  <PointFooter point={p} onSource={setSheet} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {sections.map((s, i) => (
          <MobileSection key={slugs[i]} wiki={wiki} section={s} index={i} anchor={`m-${slugs[i]}`} onSource={setSheet} />
        ))}

        {wiki.content && (
          <footer
            className={cn(
              "flex items-start gap-2 rounded-2xl border p-4 text-sm",
              changed > 0
                ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
                : "bg-muted/30 text-muted-foreground",
            )}
          >
            {changed > 0 ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            )}
            <span>
              {changed > 0
                ? `${changed} ${changed === 1 ? "source" : "sources"} changed since this build. Facts that rely on ${changed === 1 ? "it are" : "them are"} hidden until the Wiki is rebuilt.`
                : `Built from ${n} ${n === 1 ? "document" : "documents"}, all current.`}
              {wiki.generatedAt ? ` Built ${formatAgo(wiki.generatedAt)}.` : ""}
            </span>
          </footer>
        )}
      </div>

      {sheet && <SourceSheet wiki={wiki} group={sheet} onClose={() => setSheet(null)} />}
    </div>
  )
}

function MobileSection({
  wiki,
  section,
  index,
  anchor,
  onSource,
}: {
  wiki: WikiView
  section: WikiSectionView
  index: number
  anchor: string
  onSource: (g: CitationGroup) => void
}) {
  const kind = section.kind ?? "bullets"
  const figure = wiki.figures[index]
  return (
    <section
      id={anchor}
      aria-labelledby={`${anchor}-h`}
      className={cn(
        "scroll-mt-32 space-y-3",
        section.safety && "rounded-2xl border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-500/40 dark:bg-amber-500/10",
      )}
    >
      <h2 id={`${anchor}-h`} className="flex items-center gap-2 text-lg font-semibold leading-snug">
        {section.safety && <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />}
        {section.heading}
      </h2>
      {figure && (
        <figure className="overflow-hidden rounded-2xl border bg-muted/30">
          <img src={figure.url} alt={figure.alt} loading="lazy" className="max-h-60 w-full object-cover" />
          <figcaption className="px-3 py-2 text-sm leading-5 text-muted-foreground">{figure.alt}</figcaption>
        </figure>
      )}
      <ol className="space-y-2">
        {section.points.map((p, j) => (
          <li
            key={j}
            className={cn("rounded-2xl border bg-background p-4", section.safety && "border-amber-200 dark:border-amber-500/30")}
          >
            {kind === "table" && section.columns ? (
              <dl className="space-y-1">
                {section.columns.map((c, k) => (
                  <div key={c} className="flex gap-3 text-base leading-6">
                    <dt className="w-2/5 shrink-0 text-sm text-muted-foreground">{c}</dt>
                    <dd className={cn("min-w-0 flex-1 break-words", k === 0 && "font-semibold")}>
                      <WikiText text={p.cells?.[k] ?? ""} mobile />
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="flex gap-3 text-base leading-6">
                {kind === "steps" ? (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary-strong" aria-label={`Step ${j + 1}`}>
                    {j + 1}
                  </span>
                ) : !section.safety && isWarning(p.text) ? (
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-label="Warning" />
                ) : null}
                <p className="min-w-0 break-words">
                  <WikiText text={p.text} mobile />
                </p>
              </div>
            )}
            <PointFooter point={p} onSource={onSource} />
          </li>
        ))}
      </ol>
    </section>
  )
}

function PointFooter({ point, onSource }: { point: WikiPointView; onSource: (g: CitationGroup) => void }) {
  const groups = groupByDocument(point.citations)
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {groups.map((g) => (
        <button
          key={g.documentId}
          type="button"
          onClick={() => onSource(g)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border bg-muted/40 px-3 font-mono text-[13px] text-muted-foreground active:scale-95"
          aria-label={`Source ${g.namingCode}`}
        >
          <FileText className="h-3.5 w-3.5" aria-hidden />
          {g.namingCode}
        </button>
      ))}
      {point.isNew && (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[13px] font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
          New
        </span>
      )}
      {point.findingId && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[13px] font-medium text-red-800 dark:bg-red-500/15 dark:text-red-200">
          <AlertOctagon className="h-3.5 w-3.5" aria-hidden /> Open finding
        </span>
      )}
    </div>
  )
}

function SourceSheet({ wiki, group, onClose }: { wiki: WikiView; group: CitationGroup; onClose: () => void }) {
  const [, navigate] = useLocation()
  const first = group.items[0]
  const source = wiki.sources.find((s) => s.documentId === group.documentId)
  return (
    <MobileSheet
      title={group.namingCode}
      description={source ? `${source.title} · v${group.version}` : `v${group.version}`}
      onClose={onClose}
      footer={
        <Button
          className="h-12 w-full text-base"
          onClick={() => {
            onClose()
            navigate(passageHref(group.documentId, group.version, wiki.excerpts[first.chunkId], { mobile: true }))
          }}
        >
          Open in document
        </Button>
      }
    >
      <div className="space-y-3">
        {group.items.map((c, i) => (
          <blockquote key={i} className="rounded-xl border-l-4 border-primary/40 bg-muted/40 p-3 text-base leading-6">
            {c.section && <p className="mb-1 text-sm font-medium text-muted-foreground">{c.section}</p>}
            {wiki.excerpts[c.chunkId] ?? "This passage is no longer in the published version."}
          </blockquote>
        ))}
      </div>
    </MobileSheet>
  )
}
