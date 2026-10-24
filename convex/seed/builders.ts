// Builders and types for seed content (docs/build/full-showcase-plan.md).
//
// Document bodies are TipTap JSON. Assets, images and referenced documents
// are written by CODE / KEY here; the seed resolves them to ids at insert
// time (see seedKnowledge.ts): linkedAsset.attrs.assetCode -> assetId,
// image.attrs["data-image-id"] "key:<k>" -> images id, referenceDoc.attrs.code
// -> docId. Never put a raw Convex id in content.

export interface Node {
  type: string
  attrs?: Record<string, unknown>
  content?: Node[]
  text?: string
  marks?: { type: string }[]
}

// ---- Inline -------------------------------------------------------------------
export const t = (text: string): Node => ({ type: "text", text })
export const b = (text: string): Node => ({ type: "text", text, marks: [{ type: "bold" }] })
export const i = (text: string): Node => ({ type: "text", text, marks: [{ type: "italic" }] })
/** Inline link to an Asset, by code (e.g. "EXL-201"). */
export const asset = (code: string): Node => ({
  type: "linkedAsset",
  attrs: { assetId: null, assetCode: code, label: code },
})
/** Inline reference to another Document, by naming code. */
export const ref = (code: string, label?: string): Node => ({
  type: "referenceDoc",
  attrs: { docId: null, code, label: label ?? code },
})

type Inline = string | Node
const inline = (parts: Inline[]): Node[] => parts.map((x) => (typeof x === "string" ? t(x) : x))

// ---- Blocks -------------------------------------------------------------------
export const p = (...parts: Inline[]): Node => ({ type: "paragraph", content: inline(parts) })
export const h = (level: 1 | 2 | 3, text: string): Node => ({
  type: "heading",
  attrs: { level },
  content: [t(text)],
})
/**
 * PPE pictograms. Comma-separated slugs, ONLY from: hardhat, glasses, gloves,
 * boots, hi-vis, ear-pro, mask, dust-mask, clothing, wash-hands, face-shield,
 * harness, read-first, handrail, hair-net, gas-detector, life-jacket,
 * lab-coat, eye-ear, general.
 */
export const ppe = (items: string): Node => ({ type: "ppe", attrs: { items } })
/**
 * Callout kinds: warning, caution, notice, tip, danger, loto, hotwork,
 * confined, heights, authorised, permit, electrical, cryo.
 */
export const callout = (kind: string, ...parts: Inline[]): Node => ({
  type: "callout",
  attrs: { kind },
  content: [p(...parts)],
})
/** Numbered procedure steps. A step is a string or inline parts. */
export const steps = (items: (Inline | Inline[])[]): Node => ({
  type: "stepList",
  content: items.map((it) => ({
    type: "stepItem",
    content: [Array.isArray(it) ? p(...it) : p(it)],
  })),
})
export const bullets = (items: (Inline | Inline[])[]): Node => ({
  type: "bulletList",
  content: items.map((it) => ({
    type: "listItem",
    content: [Array.isArray(it) ? p(...it) : p(it)],
  })),
})
/** First row is the header row. */
export const table = (rows: string[][]): Node => ({
  type: "table",
  content: rows.map((row, r) => ({
    type: "tableRow",
    content: row.map((cell) => ({
      type: r === 0 ? "tableHeader" : "tableCell",
      attrs: { colspan: 1, rowspan: 1, colwidth: null },
      content: [p(cell)],
    })),
  })),
})
/**
 * An AI-generated illustration, by image key. Declare the key with its prompt
 * in the document's `images`. alt is shown to readers and chunked as
 * "Figure: <alt>", so write it as a factual caption.
 */
export const img = (key: string, alt: string, width = 80): Node => ({
  type: "image",
  attrs: { src: "", alt, title: null, "data-image-id": `key:${key}`, width, align: "center" },
})
export const doc = (...content: Node[]): Node => ({ type: "doc", content })

// ---- Seed document types ------------------------------------------------------

export interface ImageSpec {
  key: string
  // Subject only; the shared STYLE is appended by the media pipeline.
  prompt: string
  // "illustration" (default) or "photo" (asset photos).
  style?: "illustration" | "photo"
}

export interface Edition {
  body: Node
  // Days since this edition was Published; null = never Published (a draft,
  // in review or approved edition, always the last one).
  publishedDaysAgo: number | null
  significantChange?: boolean
  changeNote?: string
}

export interface SeedDoc {
  code: string
  title: string
  // namingTypes slug: sop | manual | work_instruction | lmra
  type: "sop" | "manual" | "work_instruction" | "lmra"
  area: "MIX" | "EXT" | "QCL"
  discipline: "OPS" | "MNT" | "HSE" | "QA"
  status: "draft" | "in_review" | "approved" | "published"
  editions: Edition[]
  assets: string[]
  // Days until the periodic review (negative = overdue); null for unpublished.
  nextReviewInDays: number | null
  images: ImageSpec[]
  tags?: string[]
}

// ---- Wrapped supplier manuals (rendered to PDF with pdf-lib) -------------------

export type SupplierBlock =
  | { kind: "heading"; text: string; level?: 1 | 2 }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; rows: string[][] }
  // A boxed safety message, rendered like a supplier's warning panel.
  | { kind: "warning"; level: "DANGER" | "WARNING" | "CAUTION" | "NOTE"; text: string }
  // An AI-generated figure (image key declared in `images`) with a caption.
  | { kind: "figure"; key: string; caption: string }

export interface SupplierPage {
  blocks: SupplierBlock[]
}

export interface SupplierManual {
  code: string
  title: string
  area: "MIX" | "EXT" | "QCL"
  discipline: "MNT" | "QA" | "OPS"
  supplier: string
  // The supplier's own identifiers, printed on the cover and in the footer.
  supplierDocNumber: string
  supplierRevision: string
  model: string
  publishedDaysAgo: number
  nextReviewInDays: number
  assets: string[]
  images: ImageSpec[]
  // Page 1 is the cover (rendered from the fields above) and is generated;
  // these are the content pages that follow it.
  pages: SupplierPage[]
}
