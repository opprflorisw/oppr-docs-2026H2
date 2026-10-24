// First-pass deterministic detectors. Pull every regex- or layout-detectable
// field out of the LLM's job. Outputs a partial StructuredDoc; sections[] is
// left as loose paragraph blocks for the narrow-scope LLM mapper to refine.
//
// Scope on this pass (eddycurrent SOP is the benchmark):
//   - Document control header → metadata.{namingCode, title, type, currentRevision, currentRevisionDate, preparedBy, reviewedBy, approvedBy, site, department, documentNumber}
//   - Revision history table → history[]
//   - Equipment list table → linkedAssets[]
//   - Reference docs table → linkedDocs[]
//   - PPE block → ppe { items[], referToManual }
//   - LOTO section → loto { required, notes }
//   - Section seed: split body by numbered headings (1, 1.1, 2, etc.) and
//     fall back to per-page sections if no numbered headings found.
//
// All detectors are intentionally permissive — false positives cost an LLM
// re-prompt; false negatives cost the user manual editing.

import type {
  ExtractedImage,
  ExtractedPage,
  PageLayout,
} from "./extractPdf"
import {
  emptyStructuredDoc,
  type LinkedAsset,
  type LinkedDoc,
  type PpeItem,
  type Revision,
  type Section,
  type StructuredDoc,
} from "./structuredDoc"

const NAMING_CODE = /\b([A-Z]{2,4})-([A-Z]{2,4})-([A-Z]{2,4})-(\d{1,4})\b/
// Asset-tag pattern: digits-digits-LETTERS-digits (eddycurrent uses 02-100-MD-03).
const ASSET_TAG = /\b\d{1,3}-\d{1,4}-[A-Z]{1,4}-\d{1,4}\b/g

const PPE_KEYWORD_MAP: { keywords: RegExp; item: PpeItem }[] = [
  { keywords: /goggle|safety glasses|eye protection|veiligheidsbril/i, item: "goggles" },
  { keywords: /helmet|hard hat|veiligheidshelm/i, item: "helmet" },
  { keywords: /glove|handschoen/i, item: "gloves" },
  { keywords: /\bear protection|hearing protection|gehoor/i, item: "hearing" },
  { keywords: /safety boot|safety shoes|werkschoenen/i, item: "boots" },
  { keywords: /hi-?vis|high.?vis|reflective vest|hesje/i, item: "hivis" },
  { keywords: /ffp2|ffp3|respirator|ademmasker/i, item: "ffp2" },
  { keywords: /safety cloth|safety wear|werkkleding|protective cloth/i, item: "clothes" },
]

export interface FirstPassResult {
  doc: StructuredDoc
  // Pages that were not consumed by header/tables/PPE detection. The narrow
  // LLM mapper's job is to organise these into sections + stepList[].
  unclassifiedPagesText: string
}

export function buildFirstPass(opts: {
  filename: string
  pages: ExtractedPage[]
  pageLayouts: PageLayout[]
  images: ExtractedImage[]
  imageIdsByOrder?: string[] // populated post-promote, parallel to images[]
  classification: {
    kind: "digitalPdf" | "scannedPdf" | "unsupported"
    pageCount: number
    detectedLanguage: string | null
  }
}): FirstPassResult {
  const doc = emptyStructuredDoc(opts.filename)
  doc.source = {
    filename: opts.filename,
    sha256: null,
    pageCount: opts.classification.pageCount,
    language: opts.classification.detectedLanguage,
  }

  const fullText = opts.pages.map((p) => p.text).join("\n\n")

  // 1. Document control header (page 1).
  const page1 = opts.pages[0]?.text ?? ""
  parseDocumentHeader(page1, doc)
  if (!doc.metadata.title || doc.metadata.title === stripExt(opts.filename)) {
    inferTitleFromFilename(opts.filename, doc)
  }

  // 2. Revision history table.
  doc.history = parseRevisionTable(page1, fullText)
  if (doc.history.length > 0) {
    doc.metadata.currentRevision = doc.history[0].rev
    doc.metadata.currentRevisionDate = doc.history[0].date
    doc.metadata.preparedBy = doc.history[0].preparedBy
    doc.metadata.reviewedBy = doc.history[0].reviewedBy
    doc.metadata.approvedBy = doc.history[0].approvedBy
  }

  // 3. Equipment list table.
  doc.linkedAssets = parseAssetTable(fullText)

  // 4. Reference docs table.
  doc.linkedDocs = parseRefDocsTable(fullText)

  // 5. PPE detection.
  doc.ppe = parsePpe(fullText)

  // 6. LOTO detection.
  doc.loto = parseLoto(fullText)

  // 7. Section seed — split by numbered headings or fall back to per-page.
  const { sections, unclassified } = seedSections(opts.pages)
  doc.sections = sections

  if (opts.classification.kind === "scannedPdf") {
    doc.extractWarnings.push({
      kind: "scannedPdf",
      detail:
        "Pages contained little text, likely a scanned PDF. Steps and section headings will be lossy.",
    })
  }

  return { doc, unclassifiedPagesText: unclassified }
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function parseDocumentHeader(page1: string, doc: StructuredDoc): void {
  const lines = page1.split("\n").map((l) => l.trim()).filter(Boolean)

  // Title: line after "Document Title", or the longest UPPERCASE line on page 1.
  const titleIdx = lines.findIndex((l) => /^document title$/i.test(l))
  if (titleIdx >= 0 && titleIdx + 1 < lines.length) {
    doc.metadata.title = titleIfReasonable(lines[titleIdx + 1]) ?? doc.metadata.title
  }

  // Document Number: line after "Document Number".
  const numIdx = lines.findIndex((l) => /^document number$/i.test(l))
  if (numIdx >= 0 && numIdx + 1 < lines.length) {
    const numLine = lines[numIdx + 1].replace(/\s+/g, "")
    const m = NAMING_CODE.exec(numLine)
    if (m) {
      doc.metadata.namingCode = `${m[1]}-${m[2]}-${m[3]}-${m[4]}`
      doc.metadata.site = m[1]
      doc.metadata.department = m[2]
      doc.metadata.documentNumber = m[4]
      doc.metadata.type = mapTypeFromCode(m[3])
    }
  }

  // Fallback: any naming code in the first 30 lines (collapse hyphen spaces).
  if (!doc.metadata.namingCode) {
    const head = lines
      .slice(0, 30)
      .join(" ")
      .replace(/(\w)\s*-\s*(\w)/g, "$1-$2")
    const m = NAMING_CODE.exec(head)
    if (m) {
      doc.metadata.namingCode = `${m[1]}-${m[2]}-${m[3]}-${m[4]}`
      doc.metadata.site = m[1]
      doc.metadata.department = m[2]
      doc.metadata.documentNumber = m[4]
      doc.metadata.type = mapTypeFromCode(m[3])
    }
  }

  // Document Type narrative ("STANDARD OPERATION PROCEDURE" → sop, etc.).
  const typeIdx = lines.findIndex((l) => /^document type$/i.test(l))
  if (typeIdx >= 0 && typeIdx + 1 < lines.length) {
    const typeLine = lines[typeIdx + 1].toLowerCase()
    if (typeLine.includes("operating procedure") || typeLine.includes("operation procedure")) {
      doc.metadata.type = "sop"
    } else if (typeLine.includes("manual")) {
      doc.metadata.type = "manual"
    } else if (typeLine.includes("work instruction")) {
      doc.metadata.type = "work_instruction"
    } else if (typeLine.includes("lmra") || typeLine.includes("risk")) {
      doc.metadata.type = "lmra"
    }
  }
}

function titleIfReasonable(line: string): string | null {
  if (!line) return null
  const trimmed = line.trim()
  if (trimmed.length < 3 || trimmed.length > 120) return null
  return trimmed
}

function inferTitleFromFilename(filename: string, doc: StructuredDoc): void {
  // E.g. "UP-OPS-SOP-010 - [100] Eddycurrent machine r.02.pdf"
  const base = stripExt(filename)
  const rest = base.replace(NAMING_CODE, "").replace(/\[[^\]]+\]/g, "")
  const cleaned = rest.replace(/^\s*[-–—]\s*/, "").replace(/\s*r\.?\s*\d+\s*$/i, "").trim()
  if (cleaned.length >= 3 && cleaned.length <= 120) {
    doc.metadata.title = capitalise(cleaned)
  }
}

function stripExt(filename: string): string {
  return filename.replace(/\.[a-z0-9]+$/i, "")
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function mapTypeFromCode(seg: string): StructuredDoc["metadata"]["type"] {
  const u = seg.toUpperCase()
  if (u === "SOP") return "sop"
  if (u === "MAN") return "manual"
  if (u === "WI" || u === "WIN") return "work_instruction"
  if (u === "LMRA" || u === "RA") return "lmra"
  return "sop"
}

// ---------------------------------------------------------------------------
// Revision history
// ---------------------------------------------------------------------------

// Match a revision-row line robust to pdfjs space artifacts inside dates.
// Date sub-pattern requires slashes so it doesn't accidentally absorb
// equipment-list lines like "03 100 02 - 100 - CC - 12 – Chain conveyer".
// Accepts: "02 05/12/2023 Release for use Wesley FW NT"
// Accepts: "01 24/0 8 /2023 Issued for first Review Wesley FW NT"
const REV_DATE = /\d{1,2}\s*\/\s*[\d\s]{1,4}\s*\/\s*\d{2,4}/.source
const REV_LINE = new RegExp(
  `^(\\d{1,2})\\s+(${REV_DATE})\\s+(.+?)\\s+([A-Za-z]{1,12})\\s+([A-Za-z]{1,12})\\s+([A-Za-z]{1,12})\\s*$`,
)

function parseRevisionTable(page1: string, fullText: string): Revision[] {
  // Two formats appear in the eddycurrent SOP:
  //   - Header revision lines: "02   05/12/2023   Release for use   Wesley   FW   NT"
  //   - Revision Control section: "Rev. no | Updated by | Description"
  // We try the header-line pattern first because it has dates.
  const found: Revision[] = []
  const lines = (page1 + "\n" + fullText).split("\n").map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    const m = REV_LINE.exec(line)
    if (m) {
      const rev = m[1].padStart(2, "0")
      if (found.some((r) => r.rev === rev)) continue
      found.push({
        rev,
        date: normaliseDate(m[2]),
        summary: m[3].trim(),
        preparedBy: m[4],
        reviewedBy: m[5],
        approvedBy: m[6],
      })
    }
  }
  found.sort((a, b) => Number(b.rev) - Number(a.rev))
  return found
}

function normaliseDate(raw: string): string | null {
  // Strip whitespace then accept 05/12/2023 → 2023-12-05; 24/08/2023 → 2023-08-24.
  const compact = raw.replace(/\s+/g, "")
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(compact)
  if (!m) return raw
  const [, d, mo, y] = m
  const yy = y.length === 2 ? `20${y}` : y
  return `${yy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`
}

// ---------------------------------------------------------------------------
// Asset / equipment list
// ---------------------------------------------------------------------------

function parseAssetTable(fullText: string): LinkedAsset[] {
  const seen = new Set<string>()
  const out: LinkedAsset[] = []
  const lines = fullText.split("\n").map((l) => l.trim())
  for (const line of lines) {
    // pdfjs sometimes inserts spaces around hyphens: "02 - 100 - MD - 03".
    // Collapse those so the regex matches.
    const compact = line.replace(/(\w)\s*-\s*(\w)/g, "$1-$2")
    const matches = compact.match(ASSET_TAG)
    if (!matches) continue
    for (const code of matches) {
      if (seen.has(code)) continue
      seen.add(code)
      const m = /^(\d{1,3})-(\d{1,4})-([A-Z]{1,4})-(\d{1,4})$/.exec(code)
      if (!m) continue
      const area = m[2]
      const name = extractAssetName(compact, code)
      out.push({ code, name, area })
    }
  }
  return out
}

function extractAssetName(line: string, code: string): string | null {
  // Grab the trailing "- name" or "– name" segment after the code.
  const after = line.split(code)[1] ?? ""
  const cleaned = after.replace(/^\s*[-–—]\s*/, "").trim()
  if (cleaned.length >= 3 && cleaned.length <= 200) return cleaned
  return null
}

// ---------------------------------------------------------------------------
// Reference documents
// ---------------------------------------------------------------------------

function parseRefDocsTable(fullText: string): LinkedDoc[] {
  const seen = new Set<string>()
  const out: LinkedDoc[] = []
  // pdfjs splits hyphenated codes; collapse first.
  const compact = fullText.replace(/(\w)\s*-\s*(\w)/g, "$1-$2")
  const lines = compact.split("\n").map((l) => l.trim()).filter(Boolean)
  let inSection = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/reference\s+document|^doc\.?\s*number\s+doc\.?\s*title/i.test(line)) {
      inSection = true
      continue
    }
    if (inSection && /^(\d+\.\s|\d+\.\d+|safety|equipment|loto|work\s+instruction)/i.test(line)) {
      // Section ended when we see the next numbered heading.
      if (out.length > 0) inSection = false
    }
    if (!inSection) continue
    // Section row: "<rownum> <code-or-XXX> <title...>"
    const rowMatch = /^(?:\d{1,2})\s+(\S+)\s+(.+)$/.exec(line)
    if (rowMatch) {
      const codeRaw = rowMatch[1]
      const titleRaw = rowMatch[2].trim()
      const codeMatch = NAMING_CODE.exec(codeRaw)
      let code: string | null = null
      let title = titleRaw
      if (codeMatch) {
        code = `${codeMatch[1]}-${codeMatch[2]}-${codeMatch[3]}-${codeMatch[4]}`
      } else {
        // codeRaw is something like "XXX" — title spans codeRaw + titleRaw.
        title = `${codeRaw} ${titleRaw}`.replace(/^XXX\s+/, "").trim()
      }
      const key = code ?? title.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ code, title })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// PPE
// ---------------------------------------------------------------------------

function parsePpe(fullText: string): { items: PpeItem[]; referToManual: boolean } | null {
  const lower = fullText.toLowerCase()
  if (
    !/personal protective equipment|\bppe\b|required ppe|safety equipment|persoonlijke beschermingsmiddelen|\bpbm\b/.test(
      lower,
    )
  ) {
    // PPE section not announced — still scan for keyword hits across the doc.
  }
  const items: PpeItem[] = []
  const seen = new Set<PpeItem>()
  for (const { keywords, item } of PPE_KEYWORD_MAP) {
    if (keywords.test(fullText) && !seen.has(item)) {
      items.push(item)
      seen.add(item)
    }
  }
  if (items.length === 0) return null
  const referToManual = /refer to manual|see manual|raadpleeg de handleiding/i.test(fullText)
  return { items, referToManual }
}

// ---------------------------------------------------------------------------
// LOTO
// ---------------------------------------------------------------------------

function parseLoto(fullText: string): { required: boolean; notes: string | null } | null {
  if (!/\bLOTO\b|lock.?out.?tag.?out|\bloto\b/i.test(fullText)) return null
  const required =
    /loto\s+is\s+required|requires? loto|loto\s+procedure\s+required/i.test(fullText)
  const noNeeded =
    /no\s+additional\s+loto|no\s+loto\s+required|no\s+loto\s+requirements/i.test(fullText)
  if (noNeeded) return { required: false, notes: null }
  return { required, notes: null }
}

// ---------------------------------------------------------------------------
// Section seed
// ---------------------------------------------------------------------------

const NUMBERED_HEADING = /^(\d+(?:\.\d+)*)\.?\s+([A-Z][\w\s\-,/&()]+)$/
const STOP_HEADINGS = /^(urban mining|keileweg|www\.|confidential|page \d+|title:|date:|rev\.?(?:\s|:)|document\s+(type|title|number)|status of document|prep\.|rev\.|app\.|standard operation procedure|standard operating procedure|by|no\.\s*(area|doc)|step\s*no|description|photo\/|photo\s*\/|equipment tag|rev\.\s*no|updated by|description of update|\d{2}\s*\d{2}\/\d{2}|\d{2}\s+\d+\/\d+\s*\/\s*\d{2,4})/i

function seedSections(pages: ExtractedPage[]): {
  sections: Section[]
  unclassified: string
} {
  // Collapse pages, strip recurring header/footer noise, then split by
  // numbered headings (1, 1.1, 2, 2.1, …). If no numbered headings show up,
  // fall back to per-page paragraph sections.
  const allLines: string[] = []
  for (const page of pages) {
    for (const raw of page.text.split("\n")) {
      const line = raw.trim()
      if (!line) continue
      if (STOP_HEADINGS.test(line)) continue
      allLines.push(line)
    }
  }

  const sections: Section[] = []
  let current: Section | null = null
  for (const line of allLines) {
    const m = NUMBERED_HEADING.exec(line)
    if (m) {
      if (current) sections.push(current)
      const dotted = m[1]
      const level: 1 | 2 | 3 =
        dotted.split(".").length === 1 ? 2 : dotted.split(".").length === 2 ? 3 : 3
      current = {
        id: `section-${slug(m[2])}-${dotted}`,
        heading: m[2].trim(),
        level,
        blocks: [],
      }
      continue
    }
    if (!current) {
      current = { id: "section-intro", heading: "Introduction", level: 2, blocks: [] }
    }
    // Drop very short marker lines (numbers from tables).
    if (line.length < 2) continue
    current.blocks.push({ kind: "paragraph", text: line })
  }
  if (current) sections.push(current)

  // Merge consecutive paragraph blocks into one when they look like one paragraph.
  for (const s of sections) {
    s.blocks = mergeAdjacentParagraphs(s.blocks)
  }

  // The "unclassified" payload sent to the LLM mapper is the joined section
  // text (sans headings) so it can refine into stepLists / lists / callouts.
  const unclassified = sections
    .map((s) => `## ${s.heading}\n\n` + s.blocks.map((b) => (b.kind === "paragraph" ? b.text : "")).join("\n"))
    .join("\n\n")

  return { sections, unclassified }
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32)
}

function mergeAdjacentParagraphs(
  blocks: Section["blocks"],
): Section["blocks"] {
  const out: Section["blocks"] = []
  for (const b of blocks) {
    if (
      b.kind === "paragraph" &&
      out.length > 0 &&
      out[out.length - 1].kind === "paragraph"
    ) {
      const prev = out[out.length - 1] as { kind: "paragraph"; text: string }
      // Only merge when the previous line did not end with sentence punctuation.
      if (!/[.!?:;]$/.test(prev.text)) {
        prev.text = `${prev.text} ${b.text}`
        continue
      }
    }
    out.push(b)
  }
  return out
}
