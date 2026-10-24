import { Fragment, type ReactNode } from "react"
import { Link } from "wouter"
import type { FunctionReturnType } from "convex/server"
import type { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { CODE_PATTERN, useCodeIndex } from "@/components/ai/useCodeIndex"

// Shared pieces of the Wiki reader (desktop page, phone page, print).

export type WikiView = NonNullable<FunctionReturnType<typeof api.wikis.get>>
export type WikiSectionView = NonNullable<WikiView["content"]>["sections"][number]
export type WikiPointView = WikiSectionView["points"][number]
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

/** Unique slugs for every section, in order. */
export function sectionSlugs(sections: { heading: string }[]): string[] {
  const seen = new Map<string, number>()
  return sections.map((s, i) => {
    const base = sectionSlug(s.heading, i)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}-${n}`
  })
}

/** A point that warns, outside a safety section: shown with a warning mark. */
export function isWarning(text: string): boolean {
  return /\b(?:never|do not|don't|danger|warning|caution)\b/i.test(text)
}

export interface CitationGroup {
  documentId: Id<"documents">
  namingCode: string
  version: number
  items: WikiPointView["citations"]
}

// One chip per document on a point: several passages of the same document
// would otherwise repeat its code.
export function groupByDocument(citations: WikiPointView["citations"]): CitationGroup[] {
  const out: CitationGroup[] = []
  for (const c of citations) {
    const g = out.find((x) => x.documentId === c.documentId)
    if (g) g.items.push(c)
    else out.push({ documentId: c.documentId, namingCode: c.namingCode, version: c.version, items: [c] })
  }
  return out
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
