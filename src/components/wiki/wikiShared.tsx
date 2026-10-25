import { Fragment, useEffect, useRef, type ReactNode } from "react"
import { Link } from "wouter"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { CODE_PATTERN, useCodeIndex } from "@/components/ai/useCodeIndex"

// Shared pieces of the Wiki reader (desktop page, phone page, print). Every
// surface renders from `wiki.contentV2`: the composed read model of sections
// and blocks (docs/specs/wiki-upgrade.md 2.1).

export type WikiView = NonNullable<FunctionReturnType<typeof api.wikis.get>>
export type WikiContentView = NonNullable<WikiView["contentV2"]>
export type WikiSectionView = WikiContentView["sections"][number]
export type WikiBlockView = WikiSectionView["blocks"][number]
export type WikiPointView = WikiBlockView["points"][number]
export type WikiCitation = WikiPointView["citations"][number]
export type WikiFigure = WikiView["figuresBySection"][string]
export type WikiFormat = "overview" | "steps" | "reference"

export const FORMAT_LABEL: Record<WikiFormat, string> = {
  overview: "Overview",
  steps: "Step by step",
  reference: "Quick reference",
}

export const FORMAT_HINT: Record<WikiFormat, string> = {
  overview: "Sections of key facts",
  steps: "Built around doing the job in order",
  reference: "Tables of values and short rules to look things up",
}

/** Stable anchor for a section heading: /wiki/x#calibrating-the-ut-200. */
export function sectionSlug(heading: string, index: number): string {
  const s = heading
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return s || `section-${index + 1}`
}

/** Unique slugs for every section, keyed by section id. The intro section is "introduction". */
export function sectionSlugs(sections: { id: string; heading: string; role?: string }[]): Record<string, string> {
  const seen = new Map<string, number>()
  const out: Record<string, string> = {}
  sections.forEach((s, i) => {
    const base = s.role === "intro" ? "introduction" : sectionSlug(s.heading, i)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    out[s.id] = n === 1 ? base : `${base}-${n}`
  })
  return out
}

export function introSection(content: WikiContentView | null | undefined): WikiSectionView | null {
  return content?.sections.find((s) => s.role === "intro") ?? null
}

/** The sections a reader reads in order, after the introduction. */
export function bodySections(content: WikiContentView | null | undefined): WikiSectionView[] {
  return (content?.sections ?? []).filter((s) => s.role !== "intro")
}

export function sectionPoints(section: WikiSectionView): WikiPointView[] {
  return section.blocks.flatMap((b) => b.points)
}

/** Facts in a section, as the folded summary and the table of contents count them. */
export function factCount(section: WikiSectionView): number {
  return sectionPoints(section).length
}

/** Reading time at 200 words a minute, at least 1. */
export function readingMinutes(content: WikiContentView | null | undefined): number {
  const words = (content?.sections ?? [])
    .flatMap((s) => [s.heading, ...sectionPoints(s).map((p) => (p.cells ? p.cells.join(" ") : p.text))])
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

/** Where to find a point on the page (trust line jumps, key point links). */
export function pointDomId(blockId: string, index: number): string {
  return `pt-${blockId}-${index}`
}

/** A short name for a fact: a table row's first cell, or its opening words. */
export function factName(point: WikiPointView): string {
  const text = (point.cells?.[0] ?? point.text).trim()
  if (text.length <= 70) return text.replace(/[.:;]$/, "")
  const cut = text.slice(0, 70)
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : 70)}...`
}

// ---- Danger cap (D5) ---------------------------------------------------------

/**
 * Danger callouts past the Wiki's limit, in reading order. The server caps
 * them at compose; the reader enforces it again so a fourth red box can never
 * appear. These render as a warning callout.
 */
export function dangerOverCap(content: WikiContentView | null | undefined, maxDanger: number): Set<string> {
  const over = new Set<string>()
  let n = 0
  for (const s of content?.sections ?? [])
    for (const b of s.blocks) {
      if (b.kind !== "callout" || b.tone !== "danger") continue
      n += 1
      if (n > maxDanger) over.add(b.id)
    }
  return over
}

// ---- Citations ---------------------------------------------------------------

export interface CitationGroup {
  documentId: Id<"documents">
  namingCode: string
  version: number
  items: WikiCitation[]
}

/** One entry per Document: several passages of the same Document would otherwise repeat its code. */
export function groupByDocument(citations: WikiCitation[]): CitationGroup[] {
  const out: CitationGroup[] = []
  for (const c of citations) {
    const g = out.find((x) => x.documentId === c.documentId)
    if (g) {
      if (!g.items.some((i) => i.chunkId === c.chunkId)) g.items.push(c)
    } else out.push({ documentId: c.documentId, namingCode: c.namingCode, version: c.version, items: [c] })
  }
  return out
}

/** Every citation of these points, once per passage. */
export function unionCitations(points: { citations: WikiCitation[] }[]): WikiCitation[] {
  const seen = new Set<string>()
  const out: WikiCitation[] = []
  for (const p of points)
    for (const c of p.citations) {
      if (seen.has(c.chunkId)) continue
      seen.add(c.chunkId)
      out.push(c)
    }
  return out
}

const citationKey = (p: { citations: WikiCitation[] }) =>
  p.citations
    .map((c) => String(c.chunkId))
    .sort()
    .join(",")

/** A numbered source marker: the passages behind one run of sentences or items. */
export interface SourceNote {
  n: number
  citations: WikiCitation[]
}

/** Runs longer than this get a second marker (spec 4.5). */
const MAX_RUN = 3

/**
 * The source markers of one section (spec 4.5): one marker per run of
 * consecutive points in the same block that share the same citation set,
 * placed after the last point of the run, at most 3 points per run. Numbered
 * from 1 within the section; print uses the same runs as endnotes. Storage is
 * unchanged: every point keeps its own citations.
 */
export function sectionNotes(blocks: { id: string; points: { citations: WikiCitation[] }[] }[]) {
  const at = new Map<string, SourceNote>()
  const notes: SourceNote[] = []
  for (const b of blocks) {
    let runLen = 0
    b.points.forEach((p, i) => {
      runLen += 1
      const next = b.points[i + 1]
      const ends = !next || citationKey(next) !== citationKey(p) || runLen >= MAX_RUN
      if (!ends) return
      runLen = 0
      if (p.citations.length === 0) return
      const note = { n: notes.length + 1, citations: p.citations }
      notes.push(note)
      at.set(`${b.id}:${i}`, note)
    })
  }
  return { at, notes }
}

/** "EXT-HSE-LMRA-0001 v2, EXT-SOP-0004 v3": the Documents a section rests on, in order of first use. */
export function sectionDocuments(section: WikiSectionView): { documentId: Id<"documents">; namingCode: string; version: number }[] {
  return groupByDocument(unionCitations(sectionPoints(section))).map(({ documentId, namingCode, version }) => ({
    documentId,
    namingCode,
    version,
  }))
}

/** The opening words of a passage, for ?hl= highlighting in the document. */
export function highlightOf(excerpt: string | undefined): string {
  return excerpt ? excerpt.split(" | ")[0].replace(/^[^:]{1,40}: /, "").slice(0, 80) : ""
}

/** Link to the cited passage, on the desktop or on the phone. */
export function passageHref(
  documentId: string,
  version: number,
  excerpt: string | undefined,
  opts: { mobile?: boolean; wikiId?: string } = {},
): string {
  const params = new URLSearchParams()
  if (opts.wikiId && !opts.mobile) params.set("wiki", opts.wikiId)
  if (opts.mobile) params.set("v", String(version))
  const hl = highlightOf(excerpt)
  if (hl) params.set("hl", hl)
  const qs = params.toString()
  return `${opts.mobile ? "/m/docs" : "/docs"}/${documentId}${qs ? `?${qs}` : ""}`
}

/** Point text with document and Asset codes linked, as Ask answers do. */
export function WikiText({ text, mobile = false }: { text: string; mobile?: boolean }) {
  const index = useCodeIndex()
  const parts: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(new RegExp(CODE_PATTERN.source, "g"))) {
    const entry = index.get(m[0])
    if (!entry || entry.kind === "log") continue
    const at = m.index ?? 0
    if (at > last) parts.push(text.slice(last, at))
    const href =
      entry.kind === "doc"
        ? `${mobile ? "/m/docs" : "/docs"}/${entry.id}`
        : `${mobile ? "/m/assets" : "/assets"}/${entry.id}`
    parts.push(
      <Link
        key={`${at}-${m[0]}`}
        href={href}
        title={entry.label}
        className="font-medium text-primary-strong underline decoration-primary/30 underline-offset-2 [@media(hover:hover)]:hover:decoration-primary"
      >
        {m[0]}
      </Link>,
    )
    last = at + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  )
}

// ---- Read measures (spec 7.5) -------------------------------------------------

/**
 * Records one read when the reader leaves (or hides) the page: how far down
 * the sections they got and how often they folded. No text, no person id.
 * Reads shorter than 3 seconds are not counted.
 */
export function useRecordRead(opts: {
  wikiId: Id<"wikis">
  surface: "desktop" | "phone"
  /** DOM ids of the body sections, in order. */
  anchors: string[]
  foldToggles: () => number
  checkedIn: boolean
}) {
  const record = useMutation(api.wikiBlocks.recordRead)
  const maxIndex = useRef(-1)
  const latest = useRef(opts)
  latest.current = opts
  const anchorKey = opts.anchors.join("|")

  useEffect(() => {
    const els = latest.current.anchors
      .map((a) => document.getElementById(a))
      .filter((e): e is HTMLElement => e !== null)
    if (els.length === 0) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const i = els.indexOf(e.target as HTMLElement)
          if (i > maxIndex.current) maxIndex.current = i
        }
      },
      { rootMargin: "0px 0px -40% 0px" },
    )
    els.forEach((e) => obs.observe(e))
    return () => obs.disconnect()
  }, [anchorKey])

  useEffect(() => {
    const started = Date.now()
    let sent = false
    const send = () => {
      if (sent || Date.now() - started < 3000) return
      sent = true
      const o = latest.current
      void record({
        wikiId: o.wikiId,
        surface: o.surface,
        maxSectionIndex: Math.max(0, maxIndex.current),
        sectionCount: o.anchors.length,
        foldToggles: o.foldToggles(),
        checkedIn: o.checkedIn,
      }).catch(() => {})
    }
    window.addEventListener("pagehide", send)
    return () => {
      window.removeEventListener("pagehide", send)
      send()
    }
  }, [opts.wikiId, record])
}
