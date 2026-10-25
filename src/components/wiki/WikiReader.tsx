import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react"
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, ShieldAlert } from "lucide-react"
import type { WikiEditRenderers } from "./edit/WikiEditLayer"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { SectionSources } from "./Citations"
import { BlockContext, useBlockCtx, type BlockCtx } from "./blocks/context"
import { CalloutBlock } from "./blocks/CalloutBlock"
import { GapBlock } from "./blocks/GapBlock"
import { ImagesBlock } from "./blocks/ImagesBlock"
import { CoverageLine, IntroBlock } from "./blocks/IntroBlock"
import { KeyPointsBlock } from "./blocks/KeyPointsBlock"
import { ListBlock } from "./blocks/ListBlock"
import { OriginMark } from "./blocks/OriginMark"
import { ProseBlock } from "./blocks/ProseBlock"
import { TableBlock } from "./blocks/TableBlock"
import type { Fold } from "./useFold"
import {
  dangerOverCap,
  factCount,
  sectionDocuments,
  sectionNotes,
  type SourceNote,
  type WikiBlockView,
  type WikiCitation,
  type WikiContentView,
  type WikiSectionView,
  type WikiView,
} from "./wikiShared"

// The Wiki reader (spec 4): the introduction with its coverage line, Key
// points, then the sections in outline order, each folding, each block laid
// out by its kind. Desktop and phone share it; print has its own layout.
// The edit layer draws through renderBlockChrome and renderInsert only.

/** One content width for every text block (spec 4.2); tables may use the article width. */
const TEXT = "max-w-[68ch]"

export function WikiBlocksProvider({
  wiki,
  content,
  surface,
  showCodes = false,
  slugs,
  jumpTo,
  openSources = () => {},
  children,
}: {
  wiki: WikiView
  content: WikiContentView
  surface: BlockCtx["surface"]
  showCodes?: boolean
  slugs: Record<string, string>
  jumpTo: (sectionId: string) => void
  openSources?: (c: WikiCitation[]) => void
  children: ReactNode
}) {
  const notes = useMemo(() => {
    const all = new Map<string, SourceNote>()
    for (const s of content.sections) for (const [k, n] of sectionNotes(s.blocks).at) all.set(k, n)
    return all
  }, [content])
  const dangerOver = useMemo(() => dangerOverCap(content, wiki.settings.maxDanger), [content, wiki.settings.maxDanger])
  const value = useMemo<BlockCtx>(
    () => ({ wiki, content, surface, showCodes, notes, dangerOver, slugs, jumpTo, openSources }),
    [wiki, content, surface, showCodes, notes, dangerOver, slugs, jumpTo, openSources],
  )
  return <BlockContext.Provider value={value}>{children}</BlockContext.Provider>
}

/** One block, by its kind. */
export function BlockView({ block, safety }: { block: WikiBlockView; safety?: boolean }) {
  switch (block.kind) {
    case "intro":
      return <IntroBlock block={block} />
    case "prose":
      return <ProseBlock block={block} />
    case "bullets":
    case "steps":
      return <ListBlock block={block} safety={safety} />
    case "table":
      return <TableBlock block={block} />
    case "callout":
      return <CalloutBlock block={block} />
    case "gap":
      return <GapBlock />
    default:
      // keyPoints render in the introduction; images come from figuresBySection.
      return null
  }
}

/** A block marked to fold, as a fold-out group inside its section ("12 limits"). */
function FoldedBlock({ block, fold, children }: { block: WikiBlockView; fold: Fold; children: ReactNode }) {
  const { surface } = useBlockCtx()
  if (!block.fold?.closed) return <>{children}</>
  const open = fold.isOpen(block.id, false)
  const id = `fb-${block.id}`
  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => fold.toggle(block.id, false)}
        className={cn(
          "flex items-center gap-1.5 rounded font-medium text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          surface === "phone" ? "min-h-10 text-base" : "text-sm",
        )}
      >
        <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} aria-hidden />
        {block.fold.summary || "Show more"}
      </button>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </div>
  )
}

function BlockWithMarks({ block, safety }: { block: WikiBlockView; safety?: boolean }) {
  const { surface } = useBlockCtx()
  const wide = block.kind === "table"
  return (
    <div className={cn("space-y-1.5", !wide && surface === "desktop" && TEXT)}>
      <BlockView block={block} safety={safety} />
      <OriginMark block={block} />
    </div>
  )
}

/** The introduction, its coverage line and Key points (spec 4.1 items 4 and 5). */
export function WikiIntro({ section, fold }: { section: WikiSectionView | null; fold: Fold }) {
  const { content, surface } = useBlockCtx()
  const intro = section?.blocks.find((b) => b.kind === "intro" && b.points.length > 0)
  const keyPoints = section?.blocks.find((b) => b.kind === "keyPoints" && b.points.length > 0)
  if (!intro && !keyPoints) return null
  return (
    <div className="space-y-5">
      {intro && (
        <section aria-label="Introduction" className={cn("space-y-2", surface === "desktop" && TEXT)}>
          <BlockView block={intro} />
          <OriginMark block={intro} />
          <CoverageLine coverage={content.coverage} />
        </section>
      )}
      {keyPoints && (
        <KeyPointsBlock block={keyPoints} open={fold.isOpen(keyPoints.id, true)} onToggle={() => fold.toggle(keyPoints.id, true)} />
      )}
    </div>
  )
}

/**
 * One section: a heading with a fold chevron, its blocks, the figure after the
 * text, and one "Sources:" line (desktop). Safety sections get a quiet amber
 * left border and a shield; folded, they still show their first callout.
 */
export function WikiSection({
  section,
  index,
  fold,
  defaultOpen,
  renderBlockChrome,
  renderInsert,
}: {
  section: WikiSectionView
  /** Position among body sections, for the stagger of the phone layout. */
  index?: number
  fold: Fold
  defaultOpen: boolean
  /** Edit layer mount point (WikiEditRenderers.renderBlockChrome). */
  renderBlockChrome?: WikiEditRenderers["renderBlockChrome"]
  /** Edit layer mount point (WikiEditRenderers.renderInsert). */
  renderInsert?: WikiEditRenderers["renderInsert"]
}) {
  const { wiki, surface, slugs } = useBlockCtx()
  const phone = surface === "phone"
  const slug = slugs[section.id]
  const open = fold.isOpen(section.id, defaultOpen)
  const bodyId = `sec-${section.id}`
  const facts = factCount(section)
  const figure = wiki.figuresBySection[section.id]
  const firstCallout = section.safety ? section.blocks.find((b) => b.kind === "callout") : undefined

  return (
    <section
      aria-labelledby={slug}
      data-section={section.id}
      data-index={index}
      data-safety={section.safety || undefined}
      data-full-only={section.safety ? undefined : "true"}
      className={cn(
        "wiki-section",
        phone ? "space-y-2" : "space-y-3",
        section.safety && cn("border-l-[3px] border-amber-500", phone ? "pl-3" : "pl-4"),
      )}
    >
      <h2 id={slug} className={cn("text-lg font-semibold leading-snug tracking-tight", phone ? "scroll-mt-32" : cn("scroll-mt-20", TEXT))}>
        <span className="group flex items-start gap-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => fold.toggle(section.id, defaultOpen)}
            className={cn(
              "-ml-1 flex min-w-0 flex-1 items-start gap-2 rounded px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              phone && "min-h-11 items-center",
            )}
          >
            <ChevronDown
              className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", phone && "mt-0", !open && "-rotate-90")}
              aria-hidden
            />
            {section.safety && <ShieldAlert className={cn("mt-0.5 h-5 w-5 shrink-0 text-amber-600", phone && "mt-0")} aria-label="Safety" />}
            <span className="min-w-0">
              {section.heading}
              {!open && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  · {facts} {facts === 1 ? "fact" : "facts"}
                </span>
              )}
            </span>
          </button>
          {!phone && (
            <a
              href={`#${slug}`}
              aria-label={`Link to ${section.heading}`}
              className="mt-0.5 shrink-0 rounded px-1 text-sm font-normal text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            >
              #
            </a>
          )}
        </span>
      </h2>

      {!open && firstCallout && <BlockWithMarks block={firstCallout} safety />}

      <div id={bodyId} hidden={!open} className={phone ? "space-y-3" : "space-y-4"}>
        {renderInsert?.(section.id, null)}
        {section.blocks.map((b) => {
          const chrome = renderBlockChrome?.(b, section.id)
          return (
            <Fragment key={b.id}>
              {chrome}
              <FoldedBlock block={b} fold={fold}>
                <BlockWithMarks block={b} safety={section.safety} />
              </FoldedBlock>
              {renderInsert?.(section.id, b.id)}
            </Fragment>
          )
        })}
        {figure && (
          <div className={cn(!phone && "max-w-[88ch]")}>
            <ImagesBlock figure={figure} />
          </div>
        )}
        {!phone && <SectionSources wiki={wiki} docs={sectionDocuments(section)} className={TEXT} />}
      </div>
    </section>
  )
}

/** The table of contents rail, with scroll-spy and Expand all / Collapse all. */
export function WikiToc({
  sections,
  slugs,
  onExpandAll,
  onCollapseAll,
}: {
  sections: WikiSectionView[]
  slugs: Record<string, string>
  onExpandAll: () => void
  onCollapseAll: () => void
}) {
  const ids = sections.map((s) => slugs[s.id])
  const [active, setActive] = useState<string | null>(ids[0] ?? null)
  const idKey = ids.join("|")
  useEffect(() => {
    const els = idKey
      .split("|")
      .map((s) => document.getElementById(s))
      .filter((e): e is HTMLElement => e !== null)
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
  }, [idKey])
  if (sections.length === 0) return null
  return (
    <nav aria-label="On this page" className="space-y-2">
      <div className="flex items-center gap-1">
        <p className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">On this page</p>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onExpandAll} aria-label="Expand all sections" title="Expand all">
          <ChevronsUpDown className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onCollapseAll} aria-label="Collapse all sections" title="Collapse all">
          <ChevronsDownUp className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ol className="space-y-0.5 border-l">
        {sections.map((s) => {
          const slug = slugs[s.id]
          return (
            <li key={s.id}>
              <a
                href={`#${slug}`}
                onClick={() => setActive(slug)}
                aria-current={active === slug ? "location" : undefined}
                className={cn(
                  "-ml-px flex items-start gap-2 border-l-2 py-1 pl-3 pr-1 text-sm leading-snug transition-colors",
                  active === slug
                    ? "border-primary-strong font-medium text-foreground"
                    : "border-transparent text-muted-foreground [@media(hover:hover)]:hover:text-foreground",
                )}
              >
                <span className="min-w-0 flex-1">{s.heading}</span>
                {s.safety && <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Safety" />}
                {factCount(s) > 0 && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{factCount(s)}</span>}
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** The table of contents as a compact "On this page" menu, for narrow widths. */
export function WikiTocMenu({
  sections,
  slugs,
  onJump,
  onExpandAll,
  onCollapseAll,
}: {
  sections: WikiSectionView[]
  slugs: Record<string, string>
  onJump: (sectionId: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
}) {
  if (sections.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          On this page
          <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[60vh] w-72 overflow-y-auto">
        {sections.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onSelect={() => {
              onJump(s.id)
              window.history.replaceState(null, "", `#${slugs[s.id]}`)
            }}
            className="gap-2 text-sm"
          >
            <span className="min-w-0 flex-1">{s.heading}</span>
            {s.safety && <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Safety" />}
            {factCount(s) > 0 && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{factCount(s)}</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={onExpandAll} className="gap-2 border-t text-sm">
          <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden /> Expand all
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCollapseAll} className="gap-2 text-sm">
          <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden /> Collapse all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Opens a section, scrolls to it (or to one fact in it) and briefly
 * highlights the fact. Used by Key points links, the trust line and the TOC menu.
 */
export function revealOnPage(fold: Fold, slugs: Record<string, string>, sectionId: string, pointElId?: string) {
  fold.open(sectionId)
  window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() => {
      const el = document.getElementById(pointElId ?? slugs[sectionId])
      if (!el) return
      el.scrollIntoView({ block: pointElId ? "center" : "start", behavior: "smooth" })
      if (!pointElId) return
      el.classList.add("rounded", "ring-2", "ring-red-400", "ring-offset-2", "ring-offset-background")
      window.setTimeout(() => el.classList.remove("rounded", "ring-2", "ring-red-400", "ring-offset-2", "ring-offset-background"), 2400)
    }),
  )
}
