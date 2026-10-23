// Build a self-contained HTML document for the print preview window.
//
// Walks TipTap JSON and emits HTML for the standard nodes plus our custom
// blocks (callout, ppe, diagram, stepList/stepItem, launchLog, linkedAsset).
// The output is paginated by CSS @page rules + a leading title page wrapped
// in .doc-page so screen preview and print share the same DOM.

import type { Asset, Doc, DocVersion } from "@/types"
import { CALLOUT_META, type CalloutKind } from "@/components/docs/CalloutBlock"
import { ppeDataUrl } from "@/lib/ppePictograms"
import { buildPrintStyles } from "./printStyles"

export interface PpeCatalogEntry {
  slug: string
  label: string
  pictogramId: string
  /** Stored ISO pictogram inlined as a data URL; falls back to the SVG. */
  imageDataUrl?: string
}

export interface PdfExportOptions {
  titlePage: boolean
  /** Show the required-PPE band on the title page (small images). */
  showPpe: boolean
  revisionBlock: boolean
  machinesBlock: boolean
  referencesBlock: boolean
  logsBlock: boolean
  recurringHeader: boolean
  recurringFooter: boolean
  watermark: "none" | "controlled" | "draft" | "review"
}

export const DEFAULT_PDF_OPTIONS: PdfExportOptions = {
  titlePage: true,
  showPpe: false,
  revisionBlock: true,
  machinesBlock: true,
  referencesBlock: true,
  logsBlock: true,
  recurringHeader: true,
  recurringFooter: true,
  watermark: "controlled",
}

export interface RevisionEntry {
  version: number
  publishedAt: number
}

export interface LinkedLogInfo {
  name: string
  code?: string | null
}

// Org-wide export personalisation, configured once under Templates → PDF
// cover. All fields optional-ish: null means "use the built-in default".
export interface PrintCoverSettings {
  companyName: string | null
  headerText: string | null
  footerText: string | null
  titleSize: "sm" | "md" | "lg"
  /** Logo inlined as a data URL at export time so the popup is self-contained. */
  logoDataUrl: string | null
  showPageNumbers: boolean
  confidentialityLabel: string | null
  accentColor: string | null
}

interface BuildArgs {
  doc: Doc
  version: DocVersion
  assets: Asset[]
  /** Resolved owner display name for the cover. Null → blank. */
  ownerName: string | null
  options: PdfExportOptions
  ppeOnDoc: string[]
  /** Resolved display label for the document type (from namingTypes). */
  typeLabel?: string
  /** Active/known PPE catalog so slugs resolve to a label + pictogram. */
  ppeCatalog?: PpeCatalogEntry[]
  /** Resolved signed URLs for images referenced in the body. Keyed by Convex Id. */
  imageUrlMap?: Record<string, string | null>
  /** Full version history, newest first. Drives the revision table. */
  versions?: RevisionEntry[]
  /** Resolve referenceDoc ids → title for the references table. */
  refTitleById?: Record<string, string>
  /** Resolve pdfAttachment storageIds → rasterised page image data URLs. */
  pdfPagesByStorageId?: Record<string, string[]>
  /** Resolve launchLog logIds → code/name for the linked-logs table. */
  logsById?: Record<string, LinkedLogInfo>
  /** Diagram background url → fetched data URL, so the export is self-contained. */
  diagramBgDataUrls?: Record<string, string>
  /** Org-wide cover/header/footer settings. Omitted → built-in defaults. */
  cover?: PrintCoverSettings | null
}

const TYPE_LABEL: Record<Doc["type"], string> = {
  sop: "Standard Operating Procedure",
  manual: "Manual",
  work_instruction: "Work Instruction",
  lmra: "Last-Minute Risk Assessment",
}

type DisplayStatus = Doc["status"] | "superseded"

export function buildPrintDoc(args: BuildArgs): string {
  const {
    doc,
    version,
    assets,
    ownerName,
    options,
    ppeOnDoc,
    typeLabel,
    ppeCatalog,
    imageUrlMap,
    versions,
    refTitleById,
    pdfPagesByStorageId,
    logsById,
    diagramBgDataUrls,
    cover,
  } = args
  CURRENT_PDF_PAGES = pdfPagesByStorageId
  CURRENT_DIAGRAM_BG = diagramBgDataUrls
  CURRENT_PPE_MAP = ppeCatalog
    ? new Map(ppeCatalog.map((p) => [p.slug, p]))
    : undefined
  const resolvedTypeLabel = typeLabel ?? TYPE_LABEL[doc.type] ?? doc.type
  const effective = formatDate(version.published_at)
  const reviewBy = addOneYear(version.published_at)
  // Version-aware export: the PDF reflects exactly the edition handed in, not
  // the live one. Status is derived per-edition — the live edition is
  // "published", the working edition carries the document status, anything
  // older is "superseded".
  const displayVersion = version.version
  const displayStatus: DisplayStatus =
    doc.live_version === version.version
      ? "published"
      : version.version === doc.current_version
        ? doc.status
        : "superseded"
  const watermarkText = watermarkLabel(options.watermark, displayStatus)

  const footerCenter = [cover?.confidentialityLabel, cover?.footerText]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .join(" · ")

  const styles = buildPrintStyles({
    docId: doc.naming_code,
    title: doc.title,
    version: displayVersion,
    effective: options.recurringFooter ? effective : null,
    reviewBy,
    watermark: watermarkText,
    headerRightOverride: cover?.headerText ?? null,
    footerCenter: footerCenter || null,
    showPageNumbers: cover?.showPageNumbers ?? true,
    titleSize: cover?.titleSize ?? "md",
    accentColor: cover?.accentColor ?? null,
  })

  const pages: string[] = []

  // Document-overview tables now live on the title page, compact, in the order
  // the export dialog presents them: revision, machines, references, logs.
  // Each is independently toggleable and on by default.
  const revRows = options.revisionBlock
    ? buildRevisionRows({ displayVersion, displayStatus, version, versions })
    : []
  const refs = options.referencesBlock ? collectReferences(version.body_json) : []
  const launchLogs = options.logsBlock ? collectLaunchLogs(version.body_json) : []
  const overviewParts: string[] = []
  if (revRows.length > 0) overviewParts.push(renderRevisionBlock(revRows))
  if (options.machinesBlock && assets.length > 0)
    overviewParts.push(renderAssetList(assets))
  if (refs.length > 0) overviewParts.push(renderReferences(refs, refTitleById))
  if (launchLogs.length > 0)
    overviewParts.push(renderLinkedLogs(launchLogs, logsById))
  const overviewHtml =
    overviewParts.length > 0
      ? `<div class="title-overview">${overviewParts.join("")}</div>`
      : ""

  if (options.titlePage) {
    pages.push(
      renderTitlePage({
        doc,
        ownerName,
        effective,
        reviewBy,
        ppeOnDoc: options.showPpe ? ppeOnDoc : [],
        typeLabel: resolvedTypeLabel,
        displayVersion,
        displayStatus,
        cover,
        overviewHtml,
      }),
    )
  }

  pages.push(
    `<section class="doc-page"><div class="doc-body">${renderTipTapDoc(version.body_json, imageUrlMap)}</div></section>`,
  )

  const watermarkLayer = watermarkText
    ? `<div class="watermark" aria-hidden="true">${escapeHtml(watermarkText)}</div>`
    : ""

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(doc.naming_code)} — ${escapeHtml(doc.title)}</title>
<meta name="generator" content="Oppr DOCS" />
<style>${styles}</style>
</head>
<body>
<div class="preview-toolbar no-print">
  <h1>${escapeHtml(doc.naming_code)} · v${displayVersion} — ${escapeHtml(doc.title)}</h1>
  <button onclick="window.print()" class="primary">Print / Save as PDF</button>
  <button onclick="window.close()">Close</button>
</div>
${watermarkLayer}
${pages.join("\n")}
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Title page
// ---------------------------------------------------------------------------

// Compact, one-page cover: type, title, a prominent doc-id badge, version +
// status, metadata grid, the document-overview tables, and (optionally) a small
// required-PPE band. PPE is off by default — it is large in the body, small here.
function renderTitlePage(args: {
  doc: Doc
  ownerName: string | null
  effective: string
  reviewBy: string
  ppeOnDoc: string[]
  typeLabel: string
  displayVersion: number
  displayStatus: DisplayStatus
  cover?: PrintCoverSettings | null
  overviewHtml: string
}): string {
  const {
    doc,
    ownerName,
    effective,
    reviewBy,
    ppeOnDoc,
    typeLabel,
    displayVersion,
    displayStatus,
    cover,
    overviewHtml,
  } = args
  const ownerLabel = ownerName ? escapeHtml(ownerName) : "—"
  const ppe = ppeOnDoc
    .map((slug) => {
      const meta = CURRENT_PPE_MAP?.get(slug)
      const label = meta?.label ?? slug
      const src = meta?.imageDataUrl ?? ppeDataUrl(meta?.pictogramId ?? "general_mandatory")
      return `<span class="ppe-chip"><img src="${escapeAttr(src)}" alt="" width="16" height="16" />${escapeHtml(label)}</span>`
    })
    .join("")
  const eyebrowCompany = cover?.companyName?.trim() || "Oppr DOCS"
  const logo = cover?.logoDataUrl
    ? `<img class="title-logo" src="${escapeAttr(cover.logoDataUrl)}" alt="${escapeAttr(eyebrowCompany)} logo" />`
    : ""
  const confidentiality = cover?.confidentialityLabel?.trim()
    ? `<div class="stamp confidential">${escapeHtml(cover.confidentialityLabel.trim())}</div>`
    : ""
  return `
<section class="doc-page title-page">
  ${logo}
  <div class="title-eyebrow">${escapeHtml(eyebrowCompany)} · Controlled document</div>
  <div class="title-kicker">${escapeHtml(typeLabel)}</div>
  <div class="title-main">
    <h1>${escapeHtml(doc.title)}</h1>
    <div class="title-code-badge">${escapeHtml(doc.naming_code)}</div>
    <div class="title-edition">Version ${displayVersion} · ${escapeHtml(displayStatus)}</div>
  </div>
  <div class="title-meta-grid">
    <div><div class="k">Owner</div><div class="v">${ownerLabel}</div></div>
    <div><div class="k">Effective</div><div class="v">${escapeHtml(effective)}</div></div>
    <div><div class="k">Review by</div><div class="v">${escapeHtml(reviewBy)}</div></div>
    <div><div class="k">Revision</div><div class="v">${displayVersion}</div></div>
    <div><div class="k">Type</div><div class="v">${escapeHtml(typeLabel)}</div></div>
    <div><div class="k">Status</div><div class="v">${escapeHtml(displayStatus)}</div></div>
  </div>
  ${ppe ? `<div class="title-ppe"><div class="title-ppe-label">Required PPE</div><div class="title-ppe-items">${ppe}</div></div>` : ""}
  ${overviewHtml}
  <div class="title-controlled">
    ${confidentiality}
    <div class="stamp">Controlled copy</div>
    <div>Print date ${escapeHtml(formatToday())}. Verify the latest revision in Oppr DOCS before use. Uncontrolled when printed and not stamped or registered.</div>
  </div>
</section>`
}

// Compact revision table for the title-page overview (no pill). Cap at 3 rows.
function renderRevisionBlock(rows: RevisionRow[]): string {
  const r3 = rows.slice(0, 3)
  return `
<section class="fm-block revision-block">
  <div class="fm-h">Revision history</div>
  <table>
    <thead><tr><th>Rev</th><th>Date</th><th>Status</th><th>Summary</th></tr></thead>
    <tbody>${r3
      .map(
        (r) =>
          `<tr><td class="fm-code">v${r.version}</td><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.summary)}</td></tr>`,
      )
      .join("")}</tbody>
  </table>
</section>`
}

// ---------------------------------------------------------------------------
// Revision block
// ---------------------------------------------------------------------------

interface RevisionRow {
  version: number
  date: string
  status: string
  summary: string
}

// Revision rows for the title page. Only published revisions up to the live one
// appear (an in-progress draft is excluded), newest first, three most recent.
function buildRevisionRows(args: {
  displayVersion: number
  displayStatus: DisplayStatus
  version: DocVersion
  versions?: RevisionEntry[]
}): RevisionRow[] {
  const { displayVersion, displayStatus, version, versions } = args
  const all =
    versions && versions.length > 0
      ? versions.map((r) => ({ version: r.version, publishedAt: r.publishedAt }))
      : [{ version: displayVersion, publishedAt: Date.parse(version.published_at) }]
  return all
    .filter((r) => r.version <= displayVersion)
    .sort((a, b) => b.version - a.version)
    .slice(0, 3)
    .map((r) => {
      const isCurrent = r.version === displayVersion
      return {
        version: r.version,
        date: formatDate(new Date(r.publishedAt).toISOString()),
        status: isCurrent ? displayStatus : "superseded",
        summary: isCurrent
          ? "Current version. Review at least annually."
          : "Superseded revision.",
      }
    })
}

// ---------------------------------------------------------------------------
// References & related documents (auto-generated from referenceDoc chips)
// ---------------------------------------------------------------------------

interface RefEntry {
  docId: string
  code: string
  label: string
}

function collectReferences(body: unknown): RefEntry[] {
  const seen = new Set<string>()
  const out: RefEntry[] = []
  const visit = (n: unknown) => {
    if (!n || typeof n !== "object") return
    const node = n as {
      type?: string
      attrs?: Record<string, unknown>
      content?: unknown[]
    }
    if (node.type === "referenceDoc" && node.attrs) {
      const docId = String(node.attrs["docId"] ?? "")
      const code = String(node.attrs["code"] ?? "")
      const label = String(node.attrs["label"] ?? code)
      const key = docId || code || label
      if (key && !seen.has(key)) {
        seen.add(key)
        out.push({ docId, code, label })
      }
    }
    if (Array.isArray(node.content)) node.content.forEach(visit)
  }
  visit(body)
  return out
}

// Title is resolved from the document list at render time; the chip label is
// decorative (may be code-only), so we never rely on it for the title column.
function renderReferences(
  refs: RefEntry[],
  titleById?: Record<string, string>,
): string {
  return `
<section class="fm-block reference-block">
  <div class="fm-h">References &amp; related documents</div>
  <table>
    <thead>
      <tr><th>Reference</th><th>Title</th></tr>
    </thead>
    <tbody>
      ${refs
        .map((r) => {
          const title = titleById?.[r.docId] ?? deriveTitle(r.label, r.code)
          return `<tr><td class="fm-code">${r.code ? escapeHtml(r.code) : "—"}</td><td>${escapeHtml(title)}</td></tr>`
        })
        .join("")}
    </tbody>
  </table>
</section>`
}

// Fall back to the chip label minus the code prefix when no resolved title.
function deriveTitle(label: string, code: string): string {
  if (label && label !== code) {
    const stripped = label.replace(code, "").replace(/^\s*[—-]\s*/, "").trim()
    if (stripped) return stripped
  }
  return "—"
}

// ---------------------------------------------------------------------------
// Asset list block
// ---------------------------------------------------------------------------

function renderAssetList(assets: Asset[]): string {
  return `
<section class="fm-block asset-list-block">
  <div class="fm-h">Linked Assets</div>
  <table>
    <thead>
      <tr><th>Linked machine</th><th>Name</th></tr>
    </thead>
    <tbody>
      ${assets
        .map(
          (a) =>
            `<tr><td class="fm-code">${escapeHtml(a.code)}</td><td>${escapeHtml(a.name)}${a.location ? ` <span style="color:#9ca3af">(${escapeHtml(a.location)})</span>` : ""}</td></tr>`,
        )
        .join("")}
    </tbody>
  </table>
</section>`
}

// ---------------------------------------------------------------------------
// Linked logs block (auto-generated from launchLog nodes in the body)
// ---------------------------------------------------------------------------

interface LaunchLogEntry {
  logId: string
  label: string
}

function collectLaunchLogs(body: unknown): LaunchLogEntry[] {
  const seen = new Set<string>()
  const out: LaunchLogEntry[] = []
  const visit = (n: unknown) => {
    if (!n || typeof n !== "object") return
    const node = n as {
      type?: string
      attrs?: Record<string, unknown>
      content?: unknown[]
    }
    if (node.type === "launchLog") {
      const logId = String(node.attrs?.logId ?? "")
      const label = String(node.attrs?.label ?? "")
      const key = logId || label
      if (key && !seen.has(key)) {
        seen.add(key)
        out.push({ logId, label })
      }
    }
    if (Array.isArray(node.content)) node.content.forEach(visit)
  }
  visit(body)
  return out
}

// Codes come from the logs table when resolvable; the node's label is the
// fallback so the table still renders for stale/unseeded logIds.
function renderLinkedLogs(
  entries: LaunchLogEntry[],
  logsById?: Record<string, LinkedLogInfo>,
): string {
  return `
<section class="fm-block log-list-block">
  <div class="fm-h">Linked logs</div>
  <table>
    <thead>
      <tr><th>Linked log</th><th>Name</th></tr>
    </thead>
    <tbody>
      ${entries
        .map((e) => {
          const info = e.logId ? logsById?.[e.logId] : undefined
          const code = info?.code ?? null
          const name = info?.name || e.label || "—"
          return `<tr><td class="fm-code">${code ? escapeHtml(code) : "—"}</td><td>${escapeHtml(name)}</td></tr>`
        })
        .join("")}
    </tbody>
  </table>
</section>`
}

// ---------------------------------------------------------------------------
// TipTap → HTML walker
// ---------------------------------------------------------------------------

interface TipTapNode {
  type: string
  content?: TipTapNode[]
  text?: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  attrs?: Record<string, unknown>
}

// Image URL map is read by the image case via a module-scoped variable
// because the renderNode recursion threads through too many cases to plumb
// the map as an argument. Set at the start of renderTipTapDoc.
let CURRENT_IMAGE_URL_MAP: Record<string, string | null> | undefined
// PPE catalog (slug → label + pictogram) for the body PPE block. Set in
// buildPrintDoc; the title-page band resolves through the same map.
let CURRENT_PPE_MAP: Map<string, PpeCatalogEntry> | undefined
// Rasterised PDF pages (data URLs) keyed by storageId, for pdfAttachment nodes.
let CURRENT_PDF_PAGES: Record<string, string[]> | undefined
// Diagram background images: original URL → fetched data URL. Backgrounds are
// stored as remote storage URLs inside the cached diagram SVG; the print popup
// auto-prints ~350 ms after load, which races remote image loads, so the caller
// pre-fetches them and we substitute self-contained data URLs here.
let CURRENT_DIAGRAM_BG: Record<string, string> | undefined

function renderTipTapDoc(
  json: unknown,
  imageUrlMap?: Record<string, string | null>,
): string {
  if (!json || typeof json !== "object") return ""
  const node = json as TipTapNode
  if (!Array.isArray(node.content)) return ""
  CURRENT_IMAGE_URL_MAP = imageUrlMap
  try {
    return node.content.map(renderNode).join("")
  } finally {
    CURRENT_IMAGE_URL_MAP = undefined
  }
}

function renderNode(node: TipTapNode): string {
  switch (node.type) {
    case "paragraph":
      return `<p>${renderInline(node.content)}</p>`
    case "heading": {
      const level = clampLevel(node.attrs?.level)
      return `<h${level}>${renderInline(node.content)}</h${level}>`
    }
    case "bulletList":
      return `<ul>${(node.content ?? []).map(renderNode).join("")}</ul>`
    case "orderedList":
      return `<ol>${(node.content ?? []).map(renderNode).join("")}</ol>`
    case "listItem":
      return `<li>${(node.content ?? []).map(renderNode).join("")}</li>`
    case "blockquote":
      return `<blockquote>${(node.content ?? []).map(renderNode).join("")}</blockquote>`
    case "codeBlock":
      return `<pre><code>${escapeHtml(textOnly(node))}</code></pre>`
    case "horizontalRule":
      return `<hr />`
    case "hardBreak":
      return `<br />`
    case "image": {
      const dataImageId = node.attrs?.["data-image-id"] as string | undefined
      const directSrc = String(node.attrs?.src ?? "")
      const alt = String(node.attrs?.alt ?? "")
      const widthRaw = Number(node.attrs?.width ?? 100)
      const width = Number.isFinite(widthRaw)
        ? Math.max(10, Math.min(100, Math.round(widthRaw)))
        : 100
      const alignRaw = String(node.attrs?.align ?? "center")
      const align =
        alignRaw === "left" || alignRaw === "right" ? alignRaw : "center"
      const resolved = dataImageId
        ? CURRENT_IMAGE_URL_MAP?.[dataImageId] ?? null
        : null
      const src = resolved ?? directSrc
      if (!src) {
        return `<span class="img-missing" data-image-id="${escapeAttr(dataImageId ?? "")}">[image not available]</span>`
      }
      const marginStyle =
        align === "left"
          ? "margin-right:auto;margin-left:0"
          : align === "right"
            ? "margin-left:auto;margin-right:0"
            : "margin-left:auto;margin-right:auto"
      return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" style="display:block;width:${width}%;${marginStyle}" />`
    }
    case "table":
      return `<table>${(node.content ?? []).map(renderNode).join("")}</table>`
    case "tableRow":
      return `<tr>${(node.content ?? []).map(renderNode).join("")}</tr>`
    case "tableHeader":
      return `<th>${(node.content ?? []).map(renderNode).join("")}</th>`
    case "tableCell":
      return `<td>${(node.content ?? []).map(renderNode).join("")}</td>`
    case "callout":
      return renderCallout(node)
    case "ppe":
      return renderPpe(node)
    case "diagram":
      return renderDiagram(node)
    case "stepList":
      return `<ol data-step-list>${(node.content ?? []).map(renderNode).join("")}</ol>`
    case "stepItem":
      return `<li data-step-item>${(node.content ?? []).map(renderNode).join("")}</li>`
    case "launchLog":
      return renderLaunchLog(node)
    case "linkedAsset":
      return renderLinkedAsset(node)
    case "referenceDoc":
      return renderReferenceDoc(node)
    case "pdfAttachment":
      return renderPdfAttachment(node)
    default:
      // Unknown nodes — try to render their children if they're block-like
      if (node.content && Array.isArray(node.content)) {
        return node.content.map(renderNode).join("")
      }
      return ""
  }
}

function renderInline(content: TipTapNode[] | undefined): string {
  if (!content) return ""
  return content
    .map((n) => {
      if (n.type === "text") return applyMarks(escapeHtml(n.text ?? ""), n.marks)
      if (n.type === "hardBreak") return "<br />"
      if (n.type === "linkedAsset") return renderLinkedAsset(n)
      if (n.type === "referenceDoc") return renderReferenceDoc(n)
      // Shouldn't normally appear inside inline content, but be defensive
      return renderNode(n)
    })
    .join("")
}

function applyMarks(text: string, marks: TipTapNode["marks"]): string {
  if (!marks || marks.length === 0) return text
  let out = text
  for (const m of marks) {
    switch (m.type) {
      case "bold":
      case "strong":
        out = `<strong>${out}</strong>`
        break
      case "italic":
      case "em":
        out = `<em>${out}</em>`
        break
      case "strike":
        out = `<s>${out}</s>`
        break
      case "code":
        out = `<code>${out}</code>`
        break
      case "underline":
        out = `<u>${out}</u>`
        break
      case "link": {
        const href = String(m.attrs?.href ?? "")
        out = `<a href="${escapeAttr(href)}">${out}</a>`
        break
      }
      default:
        break
    }
  }
  return out
}

function renderCallout(node: TipTapNode): string {
  const kind = String(node.attrs?.kind ?? "notice") as CalloutKind
  const meta = CALLOUT_META[kind] ?? CALLOUT_META.notice
  const inner = (node.content ?? []).map(renderNode).join("")
  return `<div data-callout="${escapeAttr(meta.tone)}" data-kind="${escapeAttr(kind)}">
  <div data-callout-title>${escapeHtml(meta.label)}</div>
  ${inner}
</div>`
}

function renderPpe(node: TipTapNode): string {
  const raw = String(node.attrs?.items ?? "")
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (items.length === 0) return ""
  const sizeRaw = String(node.attrs?.size ?? "md")
  const size = sizeRaw === "sm" || sizeRaw === "lg" ? sizeRaw : "md"
  const px = size === "sm" ? 18 : size === "lg" ? 44 : 28
  return `<div data-ppe-block data-size="${size}">
  <div class="label">Required PPE</div>
  <div class="items">${items
    .map((slug) => {
      const meta = CURRENT_PPE_MAP?.get(slug)
      const label = meta?.label ?? slug
      const src = meta?.imageDataUrl ?? ppeDataUrl(meta?.pictogramId ?? "general_mandatory")
      return `<span class="ppe-chip"><img src="${escapeAttr(src)}" alt="" width="${px}" height="${px}" />${escapeHtml(label)}</span>`
    })
    .join("")}</div>
</div>`
}

function renderDiagram(node: TipTapNode): string {
  let svg = String(node.attrs?.svg ?? "")
  const caption = String(node.attrs?.caption ?? "")
  if (CURRENT_DIAGRAM_BG) {
    // The svg caches the background as <image href="…"> with the URL
    // XML-escaped; swap both escaped and raw forms for the inlined data URL.
    for (const [orig, dataUrl] of Object.entries(CURRENT_DIAGRAM_BG)) {
      if (!orig || !dataUrl) continue
      svg = svg.split(escapeAttr(orig)).join(dataUrl)
      svg = svg.split(orig).join(dataUrl)
    }
  }
  return `<figure data-diagram-block>
  ${svg}
  ${caption ? `<figcaption class="caption">${escapeHtml(caption)}</figcaption>` : ""}
</figure>`
}

function renderLaunchLog(node: TipTapNode): string {
  const label = String(node.attrs?.label ?? "Launch log")
  return `<span data-launch-log>${escapeHtml(label)}</span>`
}

function renderLinkedAsset(node: TipTapNode): string {
  const label = String(node.attrs?.label ?? "")
  return `<span data-linked-asset>${escapeHtml(label)}</span>`
}

function renderReferenceDoc(node: TipTapNode): string {
  const label = String(node.attrs?.label ?? node.attrs?.code ?? "")
  return `<span data-reference-doc>${escapeHtml(label)}</span>`
}

function renderPdfAttachment(node: TipTapNode): string {
  const storageId = String(node.attrs?.storageId ?? "")
  const filename = String(node.attrs?.filename ?? "Attached PDF")
  const pageCount = Number(node.attrs?.pageCount ?? 0)
  const pages = storageId ? CURRENT_PDF_PAGES?.[storageId] : undefined
  const head = `<div class="pdf-attachment-head">Attached PDF — ${escapeHtml(filename)}${
    pageCount ? ` · ${pageCount} page${pageCount === 1 ? "" : "s"}` : ""
  }</div>`
  if (pages && pages.length > 0) {
    const imgs = pages
      .map(
        (src, i) =>
          `<figure class="pdf-page"><img src="${escapeAttr(src)}" alt="${escapeAttr(filename)} page ${i + 1}" /></figure>`,
      )
      .join("")
    return `<section class="pdf-attachment">${head}${imgs}</section>`
  }
  return `<section class="pdf-attachment-note">${head}<p>Open the source document in Oppr DOCS to view the PDF.</p></section>`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampLevel(v: unknown): 1 | 2 | 3 {
  const n = typeof v === "number" ? v : 1
  if (n <= 1) return 1
  if (n === 2) return 2
  return 3
}

function textOnly(node: TipTapNode): string {
  if (node.type === "text") return node.text ?? ""
  if (!node.content) return ""
  return node.content.map(textOnly).join("")
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function escapeAttr(s: string): string {
  return escapeHtml(s)
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toISOString().slice(0, 10)
  } catch {
    return iso
  }
}

function addOneYear(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    d.setFullYear(d.getFullYear() + 1)
    return d.toISOString().slice(0, 10)
  } catch {
    return iso
  }
}

function formatToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function watermarkLabel(
  choice: PdfExportOptions["watermark"],
  status: DisplayStatus,
): string | null {
  if (choice === "none") return null
  if (choice === "controlled") return "Controlled copy"
  if (choice === "draft") return "Draft — not for use"
  if (choice === "review") return "Under review"
  // Auto: derive from status when supplied
  if (status === "draft") return "Draft — not for use"
  if (status === "in_review") return "Under review"
  return null
}
