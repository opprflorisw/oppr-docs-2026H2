import { useEffect, useState } from "react"
import { Link } from "wouter"
import { AlertOctagon, AlertTriangle, FileText, ListChecks, ShieldAlert } from "lucide-react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { cn } from "@/lib/utils"
import {
  groupByDocument,
  isWarning,
  passageHref,
  WikiText,
  type CitationGroup,
  type WikiPointView,
  type WikiSectionView,
  type WikiView,
} from "./wikiShared"

// The desktop Wiki reader: At a glance, sections (bullets, steps, tables,
// safety callouts, pictures), unobtrusive source chips and the on-page table
// of contents. Also what the print layout shows.

const READING = "max-w-[70ch]"

/** Small, quiet source marker. Hover shows the passage; click opens it. */
export function SourceChip({ wikiId, group, excerpts }: { wikiId: string; group: CitationGroup; excerpts: Record<string, string> }) {
  const first = group.items[0]
  const href = passageHref(group.documentId, group.version, excerpts[first.chunkId], { wikiId })
  const many = group.items.length > 1
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <Link
          href={href}
          className="wiki-source ml-1 inline-flex items-center gap-1 whitespace-nowrap rounded px-1 align-baseline font-mono text-xs text-muted-foreground/80 transition-colors [@media(hover:hover)]:hover:bg-primary/5 [@media(hover:hover)]:hover:text-primary-strong"
        >
          <FileText className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          {group.namingCode}
          {many && <span className="font-sans">×{group.items.length}</span>}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent className="max-h-96 w-80 space-y-2 overflow-y-auto text-xs" align="start">
        <p className="font-mono text-xs text-muted-foreground">
          {group.namingCode} · v{group.version}
          {!many && first.section ? ` · ${first.section}` : ""}
        </p>
        {group.items.map((c, i) => (
          <div key={i} className="space-y-0.5">
            {many && c.section && <p className="text-xs font-medium text-muted-foreground">{c.section}</p>}
            <p className="leading-relaxed">{excerpts[c.chunkId] ?? "This passage is no longer in the published version."}</p>
          </div>
        ))}
        <p className="text-xs text-primary-strong">Click to open {many ? "the first passage" : "it"} in the document</p>
      </HoverCardContent>
    </HoverCard>
  )
}

/** "Open finding" and "New" markers on a point. */
export function PointMarks({ point }: { point: WikiPointView }) {
  return (
    <>
      {point.isNew && (
        <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-px align-middle text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
          New
        </span>
      )}
      {point.findingId && (
        <Link
          href={`/library/findings?id=${point.findingId}`}
          title={point.findingSummary ?? "Open contradiction between the sources"}
          className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-px align-middle text-xs font-medium text-red-800 [@media(hover:hover)]:hover:bg-red-200 dark:bg-red-500/15 dark:text-red-200"
        >
          <AlertOctagon className="h-3 w-3" aria-hidden />
          Open finding
        </Link>
      )}
    </>
  )
}

function Sources({ wiki, point }: { wiki: WikiView; point: WikiPointView }) {
  return (
    <>
      {groupByDocument(point.citations).map((g) => (
        <SourceChip key={g.documentId} wikiId={wiki._id} group={g} excerpts={wiki.excerpts} />
      ))}
    </>
  )
}

/** The 3 to 5 facts to remember, at the top. */
export function AtAGlance({ wiki }: { wiki: WikiView }) {
  const points = (wiki.content?.sections ?? []).flatMap((s) => s.points.filter((p) => p.key && !p.cells))
  if (points.length === 0) return null
  return (
    <section aria-labelledby="wiki-glance" className={cn("wiki-glance rounded-xl border border-primary/25 bg-primary/[0.04] p-5", READING)}>
      <h2 id="wiki-glance" className="flex items-center gap-2 text-sm font-semibold text-primary-strong">
        <ListChecks className="h-4 w-4" aria-hidden />
        At a glance
      </h2>
      <ul className="mt-3 space-y-2.5">
        {points.map((p, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-7">
            <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary-strong" aria-hidden />
            <span className="min-w-0">
              <span className="font-medium">
                <WikiText text={p.text} />
              </span>
              <Sources wiki={wiki} point={p} />
              <PointMarks point={p} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** One section, laid out by its kind. */
export function WikiSectionBlock({
  wiki,
  section,
  index,
  slug,
}: {
  wiki: WikiView
  section: WikiSectionView
  index: number
  slug: string
}) {
  const figure = wiki.figures[index]
  const kind = section.kind ?? "bullets"
  const heading = (
    <h2 id={slug} className="scroll-mt-36 text-lg font-semibold leading-snug tracking-tight">
      <a href={`#${slug}`} className="group inline-flex items-center gap-2 no-underline">
        {section.safety && <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />}
        {section.heading}
        <span className="text-sm font-normal text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>
          #
        </span>
      </a>
    </h2>
  )

  const body =
    kind === "table" && section.columns ? (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              {section.columns.map((c) => (
                <th key={c} scope="col" className="px-3 py-2 font-semibold">
                  {c}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                Source
              </th>
            </tr>
          </thead>
          <tbody>
            {section.points.map((p, i) => (
              <tr key={i} className="border-t align-top">
                {section.columns!.map((_, j) => (
                  <td key={j} className={cn("px-3 py-2 leading-6", j === 0 && "font-medium")}>
                    <WikiText text={p.cells?.[j] ?? ""} />
                    {j === 0 && <PointMarks point={p} />}
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <Sources wiki={wiki} point={p} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : kind === "steps" ? (
      <ol className="space-y-3">
        {section.points.map((p, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-7">
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary-strong"
              aria-hidden
            >
              {i + 1}
            </span>
            <span className="min-w-0">
              {!section.safety && isWarning(p.text) && (
                <AlertTriangle className="mr-1 inline h-4 w-4 -translate-y-px text-amber-600" aria-label="Warning" />
              )}
              <WikiText text={p.text} />
              <Sources wiki={wiki} point={p} />
              <PointMarks point={p} />
            </span>
          </li>
        ))}
      </ol>
    ) : (
      <ul className="space-y-2.5">
        {section.points.map((p, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-7">
            {!section.safety && isWarning(p.text) ? (
              <AlertTriangle className="mt-1.5 h-4 w-4 shrink-0 text-amber-600" aria-label="Warning" />
            ) : (
              <span className={cn("mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full", section.safety ? "bg-amber-600" : "bg-foreground/40")} aria-hidden />
            )}
            <span className="min-w-0">
              <WikiText text={p.text} />
              <Sources wiki={wiki} point={p} />
              <PointMarks point={p} />
            </span>
          </li>
        ))}
      </ul>
    )

  const fig = figure && (
    <figure className="wiki-figure overflow-hidden rounded-lg border bg-muted/30">
      <img src={figure.url} alt={figure.alt} loading="lazy" className="max-h-80 w-full object-cover" />
      <figcaption className="flex items-start gap-2 px-3 py-2 text-xs leading-5 text-muted-foreground">
        <span className="min-w-0 flex-1">{figure.alt}</span>
        <Link href={`/docs/${figure.documentId}?wiki=${wiki._id}`} className="shrink-0 font-mono [@media(hover:hover)]:hover:text-primary-strong">
          {figure.namingCode}
        </Link>
      </figcaption>
    </figure>
  )

  if (section.safety) {
    return (
      <section
        aria-labelledby={slug}
        data-safety="true"
        className={cn("wiki-section space-y-3 rounded-xl border border-amber-300 bg-amber-50/70 p-5 dark:border-amber-500/40 dark:bg-amber-500/10", READING)}
      >
        {heading}
        {body}
        {fig}
      </section>
    )
  }
  return (
    <section aria-labelledby={slug} data-full-only="true" className={cn("wiki-section space-y-3", kind === "table" ? "max-w-[88ch]" : READING)}>
      {heading}
      {body}
      {fig}
    </section>
  )
}

/** Right-rail table of contents with scroll-spy. */
export function WikiToc({ sections, slugs }: { sections: WikiSectionView[]; slugs: string[] }) {
  const [active, setActive] = useState<string | null>(slugs[0] ?? null)
  useEffect(() => {
    const els = slugs.map((s) => document.getElementById(s)).filter((e): e is HTMLElement => e !== null)
    if (els.length === 0) return
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: "-140px 0px -60% 0px" },
    )
    els.forEach((e) => obs.observe(e))
    return () => obs.disconnect()
  }, [slugs])
  if (sections.length === 0) return null
  return (
    <nav aria-label="On this page" className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">On this page</p>
      <ol className="space-y-0.5 border-l">
        {sections.map((s, i) => (
          <li key={slugs[i]}>
            <a
              href={`#${slugs[i]}`}
              onClick={() => setActive(slugs[i])}
              aria-current={active === slugs[i] ? "location" : undefined}
              className={cn(
                "-ml-px flex items-start gap-2 border-l-2 py-1 pl-3 pr-1 text-sm leading-snug transition-colors",
                active === slugs[i]
                  ? "border-primary-strong font-medium text-foreground"
                  : "border-transparent text-muted-foreground [@media(hover:hover)]:hover:text-foreground",
              )}
            >
              <span className="min-w-0 flex-1">{s.heading}</span>
              {s.safety && <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Safety" />}
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{s.points.length}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
