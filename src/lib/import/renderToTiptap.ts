// StructuredDoc → TipTap doc-shape JSON renderer.
//
// Pure function. No editor instance, no AI, no fetching. The output is the
// shape DocumentEditor / TiptapReadOnly consume. Extension list there:
//   StarterKit (heading, paragraph, lists, blockquote, hr, etc.)
//   ImageWithRef (data-image-id), Link, Table family,
//   LaunchLog, LinkedAsset, Callout (kind), Ppe (items, csv string),
//   Diagram, StepList, StepItem.
//
// Block-kind mapping:
//   paragraph     → paragraph
//   list          → bulletList | orderedList
//   stepList      → stepList { stepItem { paragraph(title), paragraph(text), image? } }
//   callout       → callout { paragraph(title?), paragraph(text) }  (kind from tone)
//   table         → table { tableRow { tableHeader|tableCell { paragraph } } }
//   image         → image (with data-image-id when imageId present)
//   horizontalRule→ horizontalRule
//   linkRef       → paragraph with link mark to "/{kind}/{id}" or asset chip
//
// Top-level slots become rendered blocks before sections:
//   metadata header  → section-style heading + paragraph block
//   ppe              → ppe atom node
//   linkedAssets     → table of code/name/area
//   linkedDocs       → bullet list of titles
//   sections         → heading(level) + blocks
//   history          → trailing table of revisions

import type {
  Block,
  Section,
  StepBlock,
  StructuredDoc,
} from "./structuredDoc"

type TiptapNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

const TONE_TO_CALLOUT_KIND: Record<"info" | "warning" | "safety", string> = {
  info: "notice",
  warning: "warning",
  safety: "danger",
}

export function renderToTiptap(
  doc: StructuredDoc,
  opts: { imageUrlsByImageId?: Map<string, string> } = {},
): { type: "doc"; content: TiptapNode[] } {
  const out: TiptapNode[] = []

  // Document control header — title (H1) + metadata facts as a paragraph.
  if (doc.metadata.title) {
    out.push(heading(1, doc.metadata.title))
  }
  const headerLine = buildHeaderLine(doc)
  if (headerLine) {
    out.push(paragraph(headerLine, { italic: true }))
  }

  // Linked assets table (top, so engineer sees what assets the doc references).
  if (doc.linkedAssets.length > 0) {
    out.push(heading(2, "Equipment list"))
    out.push(
      simpleTable(
        ["Code", "Name", "Area"],
        doc.linkedAssets.map((a) => [a.code, a.name ?? "", a.area ?? ""]),
      ),
    )
  }

  // Linked docs as a bulleted list of titles + codes.
  if (doc.linkedDocs.length > 0) {
    out.push(heading(2, "Reference documents"))
    out.push(
      bulletList(
        doc.linkedDocs.map((d) => {
          const code = d.code ? `${d.code}: ` : ""
          return `${code}${d.title ?? "(untitled)"}`
        }),
      ),
    )
  }

  // PPE block — atom node, rendered as data-items csv.
  if (doc.ppe && doc.ppe.items.length > 0) {
    out.push(heading(2, "Required PPE"))
    out.push({
      type: "ppe",
      attrs: { items: doc.ppe.items.join(",") },
    })
    if (doc.ppe.referToManual) {
      out.push(paragraph("Refer to manual for additional requirements."))
    }
  }

  // LOTO callout if specified.
  if (doc.loto) {
    out.push(heading(2, "LOTO"))
    if (doc.loto.required) {
      out.push(
        callout(
          "warning",
          "LOTO required",
          doc.loto.notes ?? "Lock-out / tag-out procedure required.",
        ),
      )
    } else {
      out.push(
        paragraph(doc.loto.notes ?? "No additional LOTO requirements."),
      )
    }
  }

  // Sections (real body content).
  for (const section of doc.sections) {
    out.push(heading(section.level, section.heading))
    for (const block of section.blocks) {
      out.push(...renderBlock(block, opts))
    }
  }

  // Revision history at the end.
  if (doc.history.length > 0) {
    out.push(heading(2, "Revision history"))
    out.push(
      simpleTable(
        ["Rev", "Date", "Summary", "Prep.", "Rev.", "App."],
        doc.history.map((r) => [
          r.rev,
          r.date ?? "",
          r.summary ?? "",
          r.preparedBy ?? "",
          r.reviewedBy ?? "",
          r.approvedBy ?? "",
        ]),
      ),
    )
  }

  // Extract warnings as a notice callout at the very end so users see them.
  if (doc.extractWarnings.length > 0) {
    const text = doc.extractWarnings
      .map((w) => `${w.kind}: ${w.detail}`)
      .join("\n")
    out.push(
      callout(
        "info",
        "Importer notes",
        `${text}\n\nReview the import carefully and edit anywhere the structure looks off.`,
      ),
    )
  }

  return { type: "doc", content: out }
}

// ---------------------------------------------------------------------------
// Block dispatch
// ---------------------------------------------------------------------------

function renderBlock(
  block: Block,
  opts: { imageUrlsByImageId?: Map<string, string> },
): TiptapNode[] {
  switch (block.kind) {
    case "paragraph":
      return [paragraph(block.text)]
    case "list":
      return [
        block.ordered ? orderedList(block.items) : bulletList(block.items),
      ]
    case "stepList":
      return [renderStepList(block.steps, opts)]
    case "callout":
      return [callout(block.tone, block.title, block.text)]
    case "table":
      return [
        block.caption
          ? paragraph(block.caption, { italic: true })
          : empty(),
        simpleTable(block.headers, block.rows),
      ].filter(notEmpty)
    case "image":
      return [renderImage(block.imageId, block.alt, opts)]
    case "horizontalRule":
      return [{ type: "horizontalRule" }]
    case "linkRef":
      return [renderLinkRef(block)]
  }
}

function renderStepList(
  steps: StepBlock[],
  opts: { imageUrlsByImageId?: Map<string, string> },
): TiptapNode {
  return {
    type: "stepList",
    content: steps.map((s) => {
      const stepBlocks: TiptapNode[] = []
      const titleText = s.title ? `${s.n}. ${s.title}` : `Step ${s.n}`
      stepBlocks.push(paragraph(titleText, { bold: true }))
      if (s.text && s.text.trim().length > 0) {
        stepBlocks.push(paragraph(s.text))
      }
      if (s.imageRef) {
        stepBlocks.push(
          renderImage(
            s.imageRef.imageId,
            s.imageRef.hint ?? `Step ${s.n} screenshot`,
            opts,
          ),
        )
      }
      return { type: "stepItem", content: stepBlocks }
    }),
  }
}

function renderImage(
  imageId: string | null,
  alt: string,
  opts: { imageUrlsByImageId?: Map<string, string> },
): TiptapNode {
  const url = imageId ? opts.imageUrlsByImageId?.get(imageId) : undefined
  // Imported figures land small; authors enlarge the few that matter in the
  // editor. width is the JSON attr ImageWithRef reads (data-width is only the
  // HTML serialization) and must be a multiple of 5.
  const attrs: Record<string, unknown> = {
    src: url ?? "",
    alt,
    width: 35,
    align: "center",
  }
  if (imageId) {
    attrs["data-image-id"] = imageId
  }
  return { type: "image", attrs }
}

function renderLinkRef(block: {
  targetKind: "document" | "asset" | "log"
  match: string
  resolvedId?: string | null
  label?: string | null
}): TiptapNode {
  if (block.targetKind === "asset" && block.resolvedId) {
    return {
      type: "linkedAsset",
      attrs: { id: block.resolvedId, code: block.match },
    }
  }
  if (block.targetKind === "log" && block.resolvedId) {
    return {
      type: "launchLog",
      attrs: { id: block.resolvedId, name: block.label ?? block.match },
    }
  }
  // Document or unresolved — emit as paragraph with link mark when resolved.
  const text = block.label ?? block.match
  if (block.resolvedId && block.targetKind === "document") {
    return paragraph(text, undefined, {
      href: `/docs/${block.resolvedId}`,
    })
  }
  return paragraph(text, { italic: true })
}

// ---------------------------------------------------------------------------
// Atomic builders
// ---------------------------------------------------------------------------

function heading(level: 1 | 2 | 3, text: string): TiptapNode {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  }
}

function paragraph(
  text: string,
  marks?: { bold?: boolean; italic?: boolean },
  link?: { href: string },
): TiptapNode {
  if (!text || text.length === 0) {
    return { type: "paragraph" }
  }
  const markList: { type: string; attrs?: Record<string, unknown> }[] = []
  if (marks?.bold) markList.push({ type: "bold" })
  if (marks?.italic) markList.push({ type: "italic" })
  if (link) markList.push({ type: "link", attrs: { href: link.href } })
  return {
    type: "paragraph",
    content: [
      {
        type: "text",
        text,
        ...(markList.length > 0 ? { marks: markList } : {}),
      },
    ],
  }
}

function bulletList(items: string[]): TiptapNode {
  return {
    type: "bulletList",
    content: items.map((t) => listItem(t)),
  }
}

function orderedList(items: string[]): TiptapNode {
  return {
    type: "orderedList",
    content: items.map((t) => listItem(t)),
  }
}

function listItem(text: string): TiptapNode {
  return {
    type: "listItem",
    content: [paragraph(text)],
  }
}

function callout(
  tone: "info" | "warning" | "safety",
  title: string | null,
  text: string,
): TiptapNode {
  const kind = TONE_TO_CALLOUT_KIND[tone]
  const content: TiptapNode[] = []
  if (title && title.length > 0) {
    content.push(paragraph(title, { bold: true }))
  }
  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim()
    if (trimmed.length > 0) {
      content.push(paragraph(trimmed))
    }
  }
  if (content.length === 0) {
    content.push({ type: "paragraph" })
  }
  return {
    type: "callout",
    attrs: { kind },
    content,
  }
}

function simpleTable(headers: string[], rows: string[][]): TiptapNode {
  const headerRow: TiptapNode = {
    type: "tableRow",
    content: headers.map((h) => ({
      type: "tableHeader",
      content: [paragraph(h)],
    })),
  }
  const bodyRows = rows.map<TiptapNode>((cells) => ({
    type: "tableRow",
    content: cells.map((c) => ({
      type: "tableCell",
      content: [paragraph(c)],
    })),
  }))
  return { type: "table", content: [headerRow, ...bodyRows] }
}

function buildHeaderLine(doc: StructuredDoc): string {
  const parts: string[] = []
  if (doc.metadata.namingCode) parts.push(doc.metadata.namingCode)
  if (doc.metadata.currentRevision) {
    parts.push(`Rev ${doc.metadata.currentRevision}`)
  }
  if (doc.metadata.currentRevisionDate) {
    parts.push(doc.metadata.currentRevisionDate)
  }
  return parts.join(" · ")
}

function empty(): TiptapNode {
  return { type: "" }
}
function notEmpty(n: TiptapNode): boolean {
  return n.type.length > 0
}
