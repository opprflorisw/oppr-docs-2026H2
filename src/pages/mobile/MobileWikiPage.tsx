import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Link, useLocation, useRoute } from "wouter"
import { AlertOctagon, AlertTriangle, BookOpenText, CheckCircle2, MessageSquareText, ShieldAlert } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { MobileSheet } from "@/components/mobile/MobileSheet"
import { revealOnPage, WikiBlocksProvider, WikiIntro, WikiSection } from "@/components/wiki/WikiReader"
import { foldDefaults, useFold } from "@/components/wiki/useFold"
import {
  bodySections,
  factName,
  groupByDocument,
  introSection,
  passageHref,
  pointDomId,
  readingMinutes,
  sectionSlugs,
  useRecordRead,
  type WikiCitation,
  type WikiView,
} from "@/components/wiki/wikiShared"
import { useCheckIn } from "@/lib/checkIn"
import { formatAgo } from "@/lib/time"
import { cn } from "@/lib/utils"

// /m/wiki/:id (spec 4.7): the Wiki on the floor. Read only. Sections are
// accordions with the desktop's fold defaults, facts are plain rows with one
// "Sources (n)" per row, steps are one numbered list, images come after the
// text, and Ask about this Wiki sits in the sticky header.

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
  const { person } = useCheckIn()
  const content = wiki.contentV2
  const allSections = useMemo(() => content?.sections ?? [], [content])
  const sections = useMemo(() => bodySections(content), [content])
  const slugs = useMemo(() => sectionSlugs(allSections), [allSections])
  const defaults = useMemo(() => foldDefaults(content, readingMinutes(content)), [content])
  const fold = useFold(wiki._id, slugs)
  const jumpTo = useCallback((sectionId: string) => revealOnPage(fold, slugs, sectionId), [fold, slugs])
  const [sheet, setSheet] = useState<WikiCitation[] | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const chipBar = useRef<HTMLDivElement>(null)

  useRecordRead({
    wikiId: wiki._id,
    surface: "phone",
    anchors: sections.map((s) => slugs[s.id]),
    foldToggles: fold.toggles,
    checkedIn: !!person,
  })

  // Safety sections share one shield chip; every other section has its own.
  const safety = sections.filter((s) => s.safety)
  const chips = useMemo(() => {
    const out: { key: string; label: string; target: string; safety: boolean; ids: string[] }[] = []
    if (safety.length > 0)
      out.push({ key: "safety", label: safety.length === 1 ? safety[0].heading : `Safety (${safety.length})`, target: safety[0].id, safety: true, ids: safety.map((s) => s.id) })
    for (const s of sections) if (!s.safety) out.push({ key: s.id, label: s.heading, target: s.id, safety: false, ids: [s.id] })
    return out
  }, [sections, safety])

  // Scroll-spy: the chip of the section in view is highlighted.
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(slugs[s.id])).filter((e): e is HTMLElement => e !== null)
    if (els.length === 0) return
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (!top) return
        const id = sections[els.indexOf(top.target as HTMLElement)]?.id
        if (id) setActive(id)
      },
      { rootMargin: "-130px 0px -55% 0px" },
    )
    els.forEach((e) => obs.observe(e))
    return () => obs.disconnect()
  }, [sections, slugs])
  const activeChip = chips.find((c) => active && c.ids.includes(active))?.key
  useEffect(() => {
    const bar = chipBar.current
    const chip = bar?.querySelector<HTMLElement>(`[data-chip="${activeChip}"]`)
    // Scroll the chip bar only (scrollIntoView would also move the page).
    if (bar && chip) bar.scrollTo({ left: chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" })
  }, [activeChip])

  // The first fact that rests on documents that disagree: the card jumps to it.
  const disputed = useMemo(() => {
    for (const s of allSections)
      for (const b of s.blocks) {
        const i = b.points.findIndex((p) => p.findingId || p.disputed)
        if (i >= 0) return { sectionId: s.id, elId: pointDomId(b.id, i), name: factName(b.points[i]) }
      }
    return null
  }, [allSections])

  const n = wiki.sources.length
  const changed = wiki.outdated.length

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 bg-background">
        <MobileHeader
          backTo="/m"
          title={wiki.title}
          subtitle={wiki.purpose || undefined}
          right={
            content ? (
              <Link
                href={`/m/ask?scope=wiki:${wiki._id}`}
                aria-label="Ask about this Wiki"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary-strong active:bg-primary/10"
              >
                <MessageSquareText className="h-5 w-5" aria-hidden />
              </Link>
            ) : undefined
          }
        />
        {chips.length > 1 && (
          <div ref={chipBar} className="flex gap-2 overflow-x-auto border-b bg-background px-4 py-2 [scrollbar-width:none]" aria-label="Sections">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                data-chip={c.key}
                aria-current={activeChip === c.key ? "location" : undefined}
                onClick={() => jumpTo(c.target)}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                  activeChip === c.key ? "border-primary-strong bg-primary-strong text-white" : "bg-background text-foreground",
                )}
              >
                {c.safety && <ShieldAlert className={cn("h-4 w-4", activeChip === c.key ? "text-white" : "text-amber-600")} aria-hidden />}
                <span className="max-w-[12rem] truncate">{c.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 space-y-6 px-4 pb-8 pt-4">
        {wiki.status === "generating" && !content && (
          <p className="rounded-2xl border bg-muted/40 p-4 text-base">This Wiki is being built. Check back in a minute.</p>
        )}
        {wiki.status === "empty" && (
          <p className="rounded-2xl border bg-muted/40 p-4 text-base">Nothing Published matches this Wiki yet.</p>
        )}
        {disputed && (
          <button
            type="button"
            onClick={() => revealOnPage(fold, slugs, disputed.sectionId, disputed.elId)}
            className="flex w-full gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-left text-sm text-red-900 active:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100"
          >
            <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {wiki.health.pointsWithFinding} {wiki.health.pointsWithFinding === 1 ? "fact rests" : "facts rest"} on documents that
              disagree: <span className="font-medium underline underline-offset-2">{disputed.name}</span>. Ask your Engineer before
              acting on {wiki.health.pointsWithFinding === 1 ? "it" : "them"}.
            </span>
          </button>
        )}

        {content && (
          <WikiBlocksProvider wiki={wiki} content={content} surface="phone" slugs={slugs} jumpTo={jumpTo} openSources={setSheet}>
            <WikiIntro section={introSection(content)} fold={fold} />
            {sections.map((s, i) => (
              <WikiSection key={s.id} section={s} index={i} fold={fold} defaultOpen={defaults[s.id] ?? true} />
            ))}
          </WikiBlocksProvider>
        )}

        {content && (
          <footer className="space-y-3">
            <p
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
            </p>
            <p className="px-1 text-sm text-muted-foreground">Generated overview, not a controlled document.</p>
          </footer>
        )}
      </div>

      {sheet && <SourceSheet wiki={wiki} citations={sheet} onClose={() => setSheet(null)} />}
    </div>
  )
}

/** The passages behind one row or paragraph, grouped by Document, each with "Open in document". */
function SourceSheet({ wiki, citations, onClose }: { wiki: WikiView; citations: WikiCitation[]; onClose: () => void }) {
  const [, navigate] = useLocation()
  const groups = groupByDocument(citations)
  const open = (documentId: string, version: number, chunkId: string) => {
    onClose()
    navigate(passageHref(documentId, version, wiki.excerpts[chunkId], { mobile: true }))
  }
  const single = groups.length === 1 ? groups[0] : null
  const source = single ? wiki.sources.find((s) => s.documentId === single.documentId) : null
  return (
    <MobileSheet
      title={single ? single.namingCode : `Sources (${groups.length})`}
      description={single ? (source ? `${source.title} · v${single.version}` : `v${single.version}`) : "The Published passages behind this"}
      onClose={onClose}
      footer={
        single ? (
          <Button className="h-12 w-full text-base" onClick={() => open(single.documentId, single.version, single.items[0].chunkId)}>
            Open in document
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.documentId} className="space-y-2">
            {!single && (
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 font-mono text-sm font-medium">
                  {g.namingCode} v{g.version}
                </p>
                <Button size="sm" variant="outline" className="h-9" onClick={() => open(g.documentId, g.version, g.items[0].chunkId)}>
                  Open
                </Button>
              </div>
            )}
            {g.items.map((c) => (
              <blockquote key={c.chunkId} className="rounded-xl border-l-4 border-primary/40 bg-muted/40 p-3 text-base leading-6">
                {c.section && <p className="mb-1 text-sm font-medium text-muted-foreground">{c.section}</p>}
                {wiki.excerpts[c.chunkId] ?? "This passage is no longer in the Published version."}
              </blockquote>
            ))}
          </div>
        ))}
      </div>
    </MobileSheet>
  )
}
