// Supplier manuals as real PDFs (CONTEXT.md: Wrapped manual). Each
// SupplierManual from convex/seed/manuals is rendered with pdf-lib into a
// convincing manufacturer's document: a cover, a contents page, running
// header and footer, numbered sections, ruled tables, ISO 3864 style safety
// panels and figures. The renderer also returns the text of every page in
// reading order, exactly as printed, so the chunks Ask cites match what a
// reader sees on that page.
//
// The rendered original is cached in seedMedia under "pdf/<code>"; the
// stamped copy (our naming code, version and status, lib/pdfStamp.ts) is made
// fresh on every seed.
import { PDFDocument, PDFFont, PDFImage, PDFPage, RGB, StandardFonts, rgb } from "pdf-lib"
import { ActionCtx } from "../_generated/server"
import { internal } from "../_generated/api"
import { Id } from "../_generated/dataModel"
import { stampPdf } from "../lib/pdfStamp"
import type { SupplierBlock, SupplierManual } from "./builders"
import { MediaEntry, mimeOf, sha256Hex } from "./media"

// Bump when the layout changes, so cached originals are rendered again.
const RENDER_VERSION = "supplier-pdf-4"

const W = 595.28
const H = 841.89
const LEFT = 56
const RIGHT = 56
const TOP = 86 // content starts below the running header
const BOTTOM = 66 // content ends above the running footer
const CW = W - LEFT - RIGHT

const INK = rgb(0.13, 0.14, 0.16)
const GREY = rgb(0.42, 0.44, 0.48)
const RULE = rgb(0.72, 0.74, 0.78)
const WHITE = rgb(1, 1, 1)

const ACCENTS: Record<string, RGB> = {
  Krauss: rgb(0.6, 0.09, 0.12),
  Vortex: rgb(0.0, 0.4, 0.43),
  Nordcut: rgb(0.08, 0.24, 0.46),
  Sonatek: rgb(0.82, 0.4, 0.04),
}

// ISO 3864 / ANSI Z535 style signal word panels.
const PANELS: Record<string, { bar: RGB; text: RGB; symbol: "triangle" | "info" }> = {
  DANGER: { bar: rgb(0.78, 0.07, 0.09), text: WHITE, symbol: "triangle" },
  WARNING: { bar: rgb(0.96, 0.5, 0.07), text: rgb(0, 0, 0), symbol: "triangle" },
  CAUTION: { bar: rgb(1, 0.82, 0.0), text: rgb(0, 0, 0), symbol: "triangle" },
  NOTE: { bar: rgb(0.09, 0.33, 0.62), text: WHITE, symbol: "info" },
}

export interface FigureImage {
  bytes: Uint8Array
}

export interface RenderedManual {
  bytes: Uint8Array
  pageTexts: string[]
  pageCount: number
}

// ---- Text helpers ---------------------------------------------------------------

const REPLACE: Record<string, string> = {
  "≤": "<=",
  "≥": ">=",
  "−": "-",
  "‑": "-",
  "→": "->",
  "←": "<-",
  "×": "x",
  "≈": "approx. ",
  " ": " ",
  " ": " ",
  " ": " ",
}

/** Make text encodable in WinAnsi Helvetica (pdf-lib throws otherwise). */
function makeSafe(font: PDFFont) {
  const charset = new Set(font.getCharacterSet())
  return (text: string): string =>
    Array.from(text)
      .map((ch) => {
        if (REPLACE[ch] !== undefined) return REPLACE[ch]
        const cp = ch.codePointAt(0) ?? 63
        return charset.has(cp) ? ch : "?"
      })
      .join("")
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    // A single word longer than the line: break it hard.
    let w = word
    while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
      let cut = w.length - 1
      while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--
      lines.push(w.slice(0, cut))
      w = w.slice(cut)
    }
    line = w
  }
  if (line) lines.push(line)
  return lines.length ? lines : [""]
}

function splitTitle(m: SupplierManual): { product: string; docType: string } {
  const [before, after] = m.title.includes(": ") ? m.title.split(/: (.*)/s) : [m.title, "Manual"]
  let product = before.trim()
  const brand = m.supplier.split(" ")[0]
  if (product.startsWith(`${brand} `)) product = product.slice(brand.length + 1)
  if (product.startsWith(`${m.model} `)) product = product.slice(m.model.length + 1)
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
  return { product: cap(product), docType: cap((after ?? "Manual").trim()) }
}

// ---- Renderer -----------------------------------------------------------------------

interface PageState {
  page: PDFPage
  texts: string[]
}

export async function renderManual(
  m: SupplierManual,
  images: Map<string, FigureImage>,
): Promise<RenderedManual> {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique)
  const safe = makeSafe(regular)
  const accent = ACCENTS[m.supplier.split(" ")[0]] ?? rgb(0.2, 0.25, 0.32)
  const tint = rgb(
    1 - (1 - accent.red) * 0.1,
    1 - (1 - accent.green) * 0.1,
    1 - (1 - accent.blue) * 0.1,
  )

  const embedded = new Map<string, PDFImage>()
  const imageFor = async (key: string): Promise<PDFImage | null> => {
    if (embedded.has(key)) return embedded.get(key)!
    const img = images.get(key)
    if (!img) return null
    const mime = mimeOf(img.bytes)
    const e = mime === "image/png" ? await pdf.embedPng(img.bytes) : await pdf.embedJpg(img.bytes)
    embedded.set(key, e)
    return e
  }

  const pages: PageState[] = []
  const toc: { text: string; level: 1 | 2; pageIndex: number }[] = []
  const { product, docType } = splitTitle(m)

  // ---- Cover (page 1) ----
  {
    const page = pdf.addPage([W, H])
    const texts: string[] = []
    page.drawRectangle({ x: 0, y: H - 128, width: W, height: 128, color: accent })
    page.drawText(safe(m.supplier), { x: LEFT, y: H - 64, size: 20, font: bold, color: WHITE })
    page.drawText("Technical documentation", { x: LEFT, y: H - 88, size: 10, font: regular, color: WHITE })
    texts.push(m.supplier)

    page.drawText(safe(m.model), { x: LEFT, y: H - 196, size: 40, font: bold, color: INK })
    let y = H - 224
    for (const line of wrap(safe(product), bold, 16, CW)) {
      page.drawText(line, { x: LEFT, y, size: 16, font: bold, color: INK })
      y -= 20
    }
    page.drawText(safe(docType), { x: LEFT, y: y - 2, size: 13, font: regular, color: GREY })
    texts.push(m.model, product, docType)

    const coverKey = m.images[0]?.key
    const cover = coverKey ? await imageFor(coverKey) : null
    const figTop = y - 28
    if (cover) {
      const maxW = CW
      const maxH = figTop - 250
      const s = Math.min(maxW / cover.width, maxH / cover.height)
      const w = cover.width * s
      const h = cover.height * s
      page.drawImage(cover, { x: LEFT + (CW - w) / 2, y: figTop - h, width: w, height: h })
    }

    // Identification block.
    let by = 214
    page.drawRectangle({ x: LEFT, y: by - 4, width: CW, height: 1.2, color: accent })
    by -= 26
    page.drawText("Original instructions", { x: LEFT, y: by, size: 13, font: bold, color: INK })
    texts.push("Original instructions")
    by -= 22
    const meta: [string, string][] = [
      ["Document number", m.supplierDocNumber],
      ["Revision", m.supplierRevision],
      ["Model", m.model],
      ["Language", "English"],
    ]
    for (const [k, val] of meta) {
      page.drawText(k, { x: LEFT, y: by, size: 9.5, font: bold, color: GREY })
      page.drawText(safe(val), { x: LEFT + 120, y: by, size: 9.5, font: regular, color: INK })
      texts.push(`${k}: ${val}`)
      by -= 15
    }
    by -= 10
    const note =
      "Read these instructions completely before installation, operation or maintenance. Keep them with the machine for future reference."
    for (const line of wrap(note, italic, 9, CW)) {
      page.drawText(line, { x: LEFT, y: by, size: 9, font: italic, color: GREY })
      by -= 12
    }
    texts.push(note)
    page.drawRectangle({ x: 0, y: 0, width: W, height: 10, color: accent })
    pages.push({ page, texts })
  }

  // ---- Contents (page 2), filled in at the end ----
  const contents: PageState = { page: pdf.addPage([W, H]), texts: [] }
  pages.push(contents)

  // ---- Content pages ----
  let cur!: PageState
  let y = 0
  const newPage = () => {
    cur = { page: pdf.addPage([W, H]), texts: [] }
    pages.push(cur)
    y = H - TOP
  }
  const room = () => y - BOTTOM
  const ensure = (h: number) => {
    if (room() < h) newPage()
  }

  // Draw wrapped lines; a block that runs over a page continues on the next
  // one, and each page records the part printed on it.
  const drawLines = (
    lines: string[],
    opts: { x: number; size: number; font: PDFFont; leading: number; color?: RGB; firstPrefix?: () => void },
  ) => {
    let part: string[] = []
    lines.forEach((line, i) => {
      if (room() < opts.leading) {
        if (part.length) cur.texts.push(part.join(" "))
        part = []
        newPage()
      }
      if (i === 0) opts.firstPrefix?.()
      cur.page.drawText(line, { x: opts.x, y: y - opts.size, size: opts.size, font: opts.font, color: opts.color ?? INK })
      part.push(line)
      y -= opts.leading
    })
    if (part.length) cur.texts.push(part.join(" "))
  }

  const blockHeightHint = (b: SupplierBlock | undefined): number => {
    if (!b) return 0
    if (b.kind === "paragraph") return 40
    if (b.kind === "figure") return 120
    if (b.kind === "table") return 50
    return 30
  }

  const drawTable = (rows: string[][]) => {
    const size = 8.5
    const leading = 11
    const pad = 4
    const cols = Math.max(...rows.map((r) => r.length))
    const natural = Array.from({ length: cols }, (_, j) =>
      Math.max(
        46,
        ...rows.map((r) => Math.min(CW * 0.55, (j < r.length ? (r === rows[0] ? bold : regular).widthOfTextAtSize(safe(r[j]), size) : 0) + 2 * pad)),
      ),
    )
    const total = natural.reduce((a, b) => a + b, 0)
    const widths = natural.map((n) => (n / total) * CW)
    const layout = (row: string[], header: boolean) => {
      const lines = widths.map((w, j) => wrap(safe(row[j] ?? ""), header ? bold : regular, size, w - 2 * pad))
      return { lines, h: Math.max(...lines.map((l) => l.length)) * leading + 2 * pad - 2 }
    }
    const drawRow = (row: string[], header: boolean) => {
      const { lines, h } = layout(row, header)
      let x = LEFT
      widths.forEach((w, j) => {
        cur.page.drawRectangle({
          x,
          y: y - h,
          width: w,
          height: h,
          color: header ? tint : undefined,
          borderColor: RULE,
          borderWidth: 0.6,
        })
        lines[j].forEach((line, k) => {
          cur.page.drawText(line, {
            x: x + pad,
            y: y - pad - size - k * leading + 1,
            size,
            font: header ? bold : regular,
            color: INK,
          })
        })
        x += w
      })
      y -= h
      cur.texts.push(row.map((c) => safe(c)).join(" | "))
    }
    const header = rows[0]
    ensure(layout(header, true).h + (rows[1] ? layout(rows[1], false).h : 0))
    drawRow(header, true)
    for (const row of rows.slice(1)) {
      const { h } = layout(row, false)
      if (room() < h) {
        newPage()
        drawRow(header, true)
      }
      drawRow(row, false)
    }
    y -= 10
  }

  const drawSymbol = (page: PDFPage, kind: "triangle" | "info", x: number, yMid: number) => {
    if (kind === "triangle") {
      const s = 10
      // Yellow warning triangle with black border and exclamation mark (ISO 7010 W001).
      // SVG paths run with y pointing down from the origin: apex up at -s.
      page.drawSvgPath(`M 0 ${-s} L ${s * 0.6} 0 L ${-s * 0.6} 0 Z`, {
        x,
        y: yMid - s / 2,
        color: rgb(1, 0.82, 0),
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.8,
      })
      page.drawText("!", { x: x - 1.1, y: yMid - 3.8, size: 6.5, font: bold, color: rgb(0, 0, 0) })
    } else {
      page.drawCircle({ x, y: yMid, size: 5.5, color: WHITE })
      page.drawText("i", { x: x - 1.3, y: yMid - 3.2, size: 8, font: bold, color: rgb(0.09, 0.33, 0.62) })
    }
  }

  const drawPanel = (level: string, text: string) => {
    const p = PANELS[level] ?? PANELS.NOTE
    const size = 9
    const leading = 12
    const pad = 8
    const lines = wrap(safe(text), regular, size, CW - 2 * pad)
    const barH = 17
    const h = barH + lines.length * leading + 2 * pad - 2
    ensure(h + 4)
    const top = y
    cur.page.drawRectangle({ x: LEFT, y: top - h, width: CW, height: h, color: WHITE, borderColor: p.bar, borderWidth: 1.4 })
    cur.page.drawRectangle({ x: LEFT, y: top - barH, width: CW, height: barH, color: p.bar })
    drawSymbol(cur.page, p.symbol, LEFT + 13, top - barH / 2)
    cur.page.drawText(level, { x: LEFT + 26, y: top - barH / 2 - 3.6, size: 10, font: bold, color: p.text })
    lines.forEach((line, i) => {
      cur.page.drawText(line, { x: LEFT + pad, y: top - barH - pad - size - i * leading + 2, size, font: regular, color: INK })
    })
    y = top - h - 10
    cur.texts.push(`${level}: ${safe(text)}`)
  }

  const drawFigure = async (key: string, caption: string) => {
    const img = await imageFor(key)
    const capLines = wrap(safe(caption), italic, 8.5, CW * 0.85)
    const capH = capLines.length * 11 + 4
    if (!img) {
      // Missing image: keep the caption so the text still reads right.
      ensure(capH)
      drawLines(capLines, { x: LEFT, size: 8.5, font: italic, leading: 11, color: GREY })
      y -= 8
      return
    }
    const maxW = CW * 0.85
    const maxH = Math.min(270, H - TOP - BOTTOM - capH - 10)
    let s = Math.min(maxW / img.width, maxH / img.height)
    // Shrink rather than leave a near-empty page, down to 60 %.
    if (room() < img.height * s + capH + 8) {
      const fit = (room() - capH - 8) / img.height
      if (fit >= s * 0.6) s = fit
      else newPage()
    }
    const w = img.width * s
    const h = img.height * s
    const x = LEFT + (CW - w) / 2
    cur.page.drawImage(img, { x, y: y - h, width: w, height: h })
    cur.page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: RULE, borderWidth: 0.5 })
    y -= h + 6
    const capX = LEFT + (CW - CW * 0.85) / 2
    capLines.forEach((line) => {
      cur.page.drawText(line, { x: capX, y: y - 8.5, size: 8.5, font: italic, color: GREY })
      y -= 11
    })
    cur.texts.push(safe(caption))
    y -= 10
  }

  for (const sp of m.pages) {
    newPage()
    for (const [bi, block] of sp.blocks.entries()) {
      const atTop = y === H - TOP
      switch (block.kind) {
        case "heading": {
          const level = block.level ?? 1
          const text = safe(block.text)
          if (level === 1) {
            if (!atTop) y -= 10
            ensure(30 + blockHeightHint(sp.blocks[bi + 1]))
            cur.page.drawText(text, { x: LEFT, y: y - 13, size: 13, font: bold, color: accent })
            cur.page.drawRectangle({ x: LEFT, y: y - 19, width: CW, height: 0.8, color: accent })
            y -= 30
          } else {
            if (!atTop) y -= 4
            ensure(20 + blockHeightHint(sp.blocks[bi + 1]))
            cur.page.drawText(text, { x: LEFT, y: y - 10.5, size: 10.5, font: bold, color: INK })
            y -= 18
          }
          cur.texts.push(text)
          toc.push({ text, level, pageIndex: pages.length - 1 })
          break
        }
        case "paragraph": {
          drawLines(wrap(safe(block.text), regular, 9.5, CW), { x: LEFT, size: 9.5, font: regular, leading: 13.2 })
          y -= 6
          break
        }
        case "list": {
          for (const item of block.items) {
            const lines = wrap(safe(item), regular, 9.5, CW - 16)
            ensure(13.2)
            drawLines(lines, {
              x: LEFT + 16,
              size: 9.5,
              font: regular,
              leading: 13.2,
              firstPrefix: () => cur.page.drawText("•", { x: LEFT + 5, y: y - 9.5, size: 9.5, font: regular, color: accent }),
            })
            y -= 2.5
          }
          y -= 5
          break
        }
        case "table":
          drawTable(block.rows)
          break
        case "warning":
          drawPanel(block.level, block.text)
          break
        case "figure":
          await drawFigure(block.key, block.caption)
          break
      }
    }
  }

  // ---- Contents page ----
  {
    const page = contents.page
    let cy = H - TOP
    page.drawText("Contents", { x: LEFT, y: cy - 16, size: 16, font: bold, color: accent })
    page.drawRectangle({ x: LEFT, y: cy - 23, width: CW, height: 0.8, color: accent })
    contents.texts.push("Contents")
    cy -= 46
    const entries = toc.length > 34 ? toc.filter((e) => e.level === 1) : toc
    for (const [ei, e] of entries.entries()) {
      if (e.level === 1 && ei > 0) cy -= 4
      const size = e.level === 1 ? 10.5 : 9.5
      const font = e.level === 1 ? bold : regular
      const x = e.level === 1 ? LEFT : LEFT + 18
      const num = String(e.pageIndex + 1)
      const numW = regular.widthOfTextAtSize(num, size)
      const text = wrap(e.text, font, size, CW - 60 - (x - LEFT))[0]
      page.drawText(text, { x, y: cy, size, font, color: INK })
      const start = x + font.widthOfTextAtSize(text, size) + 6
      const end = W - RIGHT - numW - 6
      let dots = ""
      while (regular.widthOfTextAtSize(`${dots}.`, size) < end - start) dots += "."
      page.drawText(dots, { x: start, y: cy, size, font: regular, color: RULE })
      page.drawText(num, { x: W - RIGHT - numW, y: cy, size, font: regular, color: INK })
      contents.texts.push(`${text} ${num}`)
      cy -= e.level === 1 ? 19 : 15
    }
  }

  // ---- Running header and footer on every page after the cover ----
  const total = pages.length
  pages.forEach((p, i) => {
    if (i === 0) return
    const page = p.page
    page.drawText(safe(m.supplier), { x: LEFT, y: H - 46, size: 8, font: bold, color: accent })
    const right = safe(`${m.model} · ${docType}`)
    page.drawText(right, { x: W - RIGHT - regular.widthOfTextAtSize(right, 8), y: H - 46, size: 8, font: regular, color: GREY })
    page.drawRectangle({ x: LEFT, y: H - 54, width: CW, height: 0.6, color: RULE })
    page.drawRectangle({ x: LEFT, y: 50, width: CW, height: 0.6, color: RULE })
    const left = safe(`${m.supplierDocNumber} · ${m.supplierRevision}`)
    page.drawText(left, { x: LEFT, y: 38, size: 8, font: regular, color: GREY })
    const num = `Page ${i + 1} of ${total}`
    page.drawText(num, { x: W - RIGHT - regular.widthOfTextAtSize(num, 8), y: 38, size: 8, font: regular, color: GREY })
  })

  pdf.setTitle(safe(`${m.model} ${docType}`))
  pdf.setAuthor(safe(m.supplier))
  pdf.setCreator(safe(`${m.supplier} technical documentation`))
  pdf.setProducer("pdf-lib")
  pdf.setLanguage("en")
  const bytes = await pdf.save()
  return { bytes, pageTexts: pages.map((p) => p.texts.join("\n\n")), pageCount: pages.length }
}

// ---- Seed pipeline -------------------------------------------------------------------

export interface BuiltManual {
  code: string
  sourceStorageId: Id<"_storage">
  stampedStorageId: Id<"_storage">
  pageTexts: string[]
  pageCount: number
  stampLabel: string
  cached: boolean
}

const DAY = 24 * 60 * 60 * 1000

/**
 * Render (or reuse) each manual's original PDF and stamp a Published v1 copy.
 * `now` must be the seed's clock, so the stamp date equals the version's
 * publishedAt.
 */
export async function buildSupplierPdfs(
  ctx: ActionCtx,
  manuals: SupplierManual[],
  media: MediaEntry[],
  now: number,
): Promise<BuiltManual[]> {
  const byKey = new Map(media.map((m) => [m.key, m]))
  const cachedRows = new Map(
    (await ctx.runQuery(internal.seed.media.listMedia, {})).map((r) => [r.key, r]),
  )
  const out: BuiltManual[] = []
  for (const m of manuals) {
    const images = new Map<string, FigureImage>()
    const imageIds: string[] = []
    for (const spec of m.images) {
      const entry = byKey.get(spec.key)
      if (!entry) continue
      const blob = await ctx.storage.get(entry.storageId)
      if (!blob) continue
      images.set(spec.key, { bytes: new Uint8Array(await blob.arrayBuffer()) })
      imageIds.push(`${spec.key}=${entry.storageId}`)
    }
    const hash = await sha256Hex(`${RENDER_VERSION}\n${JSON.stringify(m)}\n${imageIds.join(",")}`)
    // Always render: it is fast and deterministic, and gives the page texts.
    const rendered = await renderManual(m, images)
    const key = `pdf/${m.code}`
    const row = cachedRows.get(key)
    let sourceStorageId: Id<"_storage">
    let sourceBytes: Uint8Array = rendered.bytes
    let cached = false
    if (row && row.exists && row.promptHash === hash) {
      sourceStorageId = row.storageId
      const blob = await ctx.storage.get(row.storageId)
      if (blob) sourceBytes = new Uint8Array(await blob.arrayBuffer())
      cached = true
    } else {
      sourceStorageId = await ctx.storage.store(new Blob([rendered.bytes as BlobPart], { type: "application/pdf" }))
      await ctx.runMutation(internal.seed.media.upsertMedia, {
        key,
        promptHash: hash,
        storageId: sourceStorageId,
        contentType: "application/pdf",
        byteSize: rendered.bytes.length,
      })
    }
    const publishedAt = now - m.publishedDaysAgo * DAY
    const stamped = await stampPdf(sourceBytes, {
      namingCode: m.code,
      title: m.title,
      version: 1,
      status: "published",
      date: new Date(publishedAt).toISOString().slice(0, 10),
      supplier: m.supplier,
    })
    const stampedStorageId = await ctx.storage.store(
      new Blob([stamped.bytes as BlobPart], { type: "application/pdf" }),
    )
    console.log(
      `supplier PDF ${m.code}: ${rendered.pageCount} pages, ${Math.round(sourceBytes.length / 1024)} kB${cached ? " (cached original)" : ""}`,
    )
    out.push({
      code: m.code,
      sourceStorageId,
      stampedStorageId,
      pageTexts: rendered.pageTexts,
      pageCount: stamped.pageCount,
      stampLabel: stamped.label,
      cached,
    })
  }
  return out
}
