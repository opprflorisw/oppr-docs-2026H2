// Browser-side PDF extractor for the importer.
//
// Per-page text + a list of extracted embedded images. We render each page
// first (so pdf.js's `objs` cache is populated), then walk the operator list
// for paintImageXObject / paintImageXObjectRepeat / paintInlineImageXObject
// ops and resolve each into either:
//   - a JPEG buffer (i.jpegData → wrapped as image/jpeg blob, no canvas)
//   - an ImageBitmap (drawn into a canvas → PNG)
//   - raw RGBA/RGB/grayscale data (converted to RGBA + put into canvas → PNG)
//
// If a page detected image XObject ops but yielded zero usable extracts (e.g.
// pdfjs returned a buffer in an unsupported encoding), we fall back to
// rendering the entire page as a single PNG so visual content is preserved.
//
// Stats are returned so the wizard can surface skipped/failed counts to the
// user rather than silently dropping content.

import * as pdfjs from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"

if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
}

export type ImporterClassification = {
  kind: "digitalPdf" | "scannedPdf" | "unsupported"
  pageCount: number
  detectedLanguage: string | null
}

export interface ExtractedPage {
  pageNumber: number
  text: string
}

// Positional layout item — preserved from pdfjs' transform matrix so we can
// reconstruct 2D rows for table detection. x grows right, y grows up.
export interface LayoutTextItem {
  text: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  fontName: string
}

export interface LayoutImageRef {
  pageImageIndex: number // index into the page's image XObject ops
  x: number
  y: number
  width: number
  height: number
}

export interface PageLayout {
  pageNumber: number
  pageWidth: number
  pageHeight: number
  items: LayoutTextItem[]
  // y-coordinate clusters of items, top-down ordered. Each row is sorted by x.
  rows: LayoutTextItem[][]
  images: LayoutImageRef[]
}

export interface ExtractedImage {
  blob: Blob
  width: number
  height: number
  pageNumber: number
  sha256: string
  hintAlt: string
  filename: string
  contentType: "image/png" | "image/jpeg"
}

export interface ExtractStats {
  imagesDetected: number
  imagesExtracted: number
  imagesSkipped: number
  pageFallbackImages: number
  jpegImages: number
  pngImages: number
}

export interface ExtractResult {
  classification: ImporterClassification
  markdown: string
  pages: ExtractedPage[]
  pageLayouts: PageLayout[]
  images: ExtractedImage[]
  stats: ExtractStats
}

const MAX_IMAGES = 60
const MIN_IMAGE_DIM = 40
const MIN_BLOB_BYTES = 500 // anything smaller is decoration / noise

export async function extractPdf(file: File): Promise<ExtractResult> {
  if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
    return {
      classification: {
        kind: "unsupported",
        pageCount: 0,
        detectedLanguage: null,
      },
      markdown: "",
      pages: [],
      pageLayouts: [],
      images: [],
      stats: emptyStats(),
    }
  }

  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise

  const pages: ExtractedPage[] = []
  const pageLayouts: PageLayout[] = []
  const images: ExtractedImage[] = []
  const seenSha = new Set<string>()
  const stats = emptyStats()
  let totalChars = 0

  // Resolve op codes once.
  const OPS = pdfjs.OPS as Record<string, number>
  const PAINT_OPS = new Set<number>(
    [
      OPS.paintImageXObject,
      OPS.paintImageXObjectRepeat,
      OPS.paintInlineImageXObject,
    ].filter((v): v is number => typeof v === "number"),
  )

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)

    const textContent = await page.getTextContent()
    const items = textContent.items as Array<{
      str: string
      hasEOL?: boolean
      transform?: number[]
      width?: number
      height?: number
      fontName?: string
    }>
    const lines: string[] = []
    const layoutItems: LayoutTextItem[] = []
    let buffer = ""
    for (const it of items) {
      buffer += it.str
      if (it.hasEOL) {
        if (buffer.trim().length > 0) lines.push(buffer.trim())
        buffer = ""
      } else {
        buffer += " "
      }
      const t = it.transform
      if (
        t &&
        t.length >= 6 &&
        typeof it.str === "string" &&
        it.str.length > 0
      ) {
        const fontSize = Math.abs(t[3] ?? t[0] ?? 0)
        layoutItems.push({
          text: it.str,
          x: t[4] ?? 0,
          y: t[5] ?? 0,
          width: it.width ?? 0,
          height: it.height ?? fontSize,
          fontSize,
          fontName: it.fontName ?? "",
        })
      }
    }
    if (buffer.trim().length > 0) lines.push(buffer.trim())
    const pageText = lines.join("\n")
    totalChars += pageText.length
    pages.push({ pageNumber, text: pageText })

    // Render the page once into a canvas. This populates the pdf.js objs
    // cache and gives us a fallback canvas if op-list extraction fails.
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement("canvas")
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      page.cleanup()
      continue
    }
    let renderOk = true
    try {
      await page.render({
        canvasContext: ctx,
        viewport,
      } as Parameters<typeof page.render>[0]).promise
    } catch {
      renderOk = false
    }

    if (!renderOk) {
      page.cleanup()
      continue
    }

    let pageImageDetected = 0
    let pageImageExtracted = 0
    const layoutImages: LayoutImageRef[] = []

    if (images.length < MAX_IMAGES) {
      try {
        const ops = await page.getOperatorList()
        for (let i = 0; i < ops.fnArray.length; i++) {
          if (images.length >= MAX_IMAGES) break
          const fn = ops.fnArray[i]
          if (!PAINT_OPS.has(fn)) continue
          pageImageDetected += 1

          const args = ops.argsArray[i] as unknown[]
          const objName = args?.[0]
          if (typeof objName !== "string") continue

          const imgObj = await resolveImgObject(page, objName)
          if (!imgObj) continue

          const extracted = await imageObjToBlob(imgObj, pageNumber, file.name)
          if (!extracted) continue
          if (
            extracted.width < MIN_IMAGE_DIM ||
            extracted.height < MIN_IMAGE_DIM
          ) {
            stats.imagesSkipped += 1
            continue
          }
          if (extracted.blob.size < MIN_BLOB_BYTES) {
            stats.imagesSkipped += 1
            continue
          }
          const sha = await sha256Hex(await extracted.blob.arrayBuffer())
          if (seenSha.has(sha)) continue
          seenSha.add(sha)
          images.push({ ...extracted, sha256: sha })
          layoutImages.push({
            pageImageIndex: pageImageExtracted,
            x: 0,
            y: 0,
            width: extracted.width,
            height: extracted.height,
          })
          pageImageExtracted += 1
          if (extracted.contentType === "image/jpeg") stats.jpegImages += 1
          else stats.pngImages += 1
        }
      } catch {
        // Ignore per-page op-list failures — fallback below may still recover.
      }
    }

    stats.imagesDetected += pageImageDetected
    stats.imagesExtracted += pageImageExtracted

    // NOTE: there is intentionally no full-page raster fallback here. A scan
    // (no text layer) used to fall through to "render every page as a PNG",
    // which produced a useless document of page screenshots. Scans are now
    // detected by classification below and routed to attach-as-PDF instead.

    pageLayouts.push({
      pageNumber,
      pageWidth: viewport.width,
      pageHeight: viewport.height,
      items: layoutItems,
      rows: clusterRows(layoutItems),
      images: layoutImages,
    })

    page.cleanup()
  }

  const markdown = pages
    .map((p) => `<!-- page ${p.pageNumber} -->\n\n${p.text}`)
    .join("\n\n---\n\n")

  // Classification: a usable text layer needs both enough characters AND a
  // healthy ratio of real letters. A digital PDF with a broken ToUnicode map
  // can emit plenty of characters that are mostly garbage (CID glyph codes,
  // box-drawing noise) — that must be treated like a scan, not extracted.
  const sampleText = pages.map((p) => p.text).join("\n")
  const nonSpace = sampleText.replace(/\s/g, "").length
  const alpha = (sampleText.match(/[A-Za-zÀ-ɏ]/g) ?? []).length
  const alphaRatio = nonSpace > 0 ? alpha / nonSpace : 0
  const avgChars = pdf.numPages > 0 ? totalChars / pdf.numPages : 0
  const hasUsableText = avgChars >= 80 && alphaRatio >= 0.5
  const kind: ImporterClassification["kind"] = hasUsableText
    ? "digitalPdf"
    : "scannedPdf"

  return {
    classification: {
      kind,
      pageCount: pdf.numPages,
      detectedLanguage: detectLanguage(markdown),
    },
    markdown,
    pages,
    pageLayouts,
    images,
    stats,
  }
}

// Group layout items into rows by y-coordinate. Items with close-enough y
// belong to the same row. Tolerance is half the median item height so we
// recover row groupings reliably across normal fontsize variations.
export function clusterRows(items: LayoutTextItem[]): LayoutTextItem[][] {
  if (items.length === 0) return []
  const heights = items.map((i) => i.height || i.fontSize || 10).sort((a, b) => a - b)
  const median = heights[Math.floor(heights.length / 2)] || 10
  const tol = Math.max(2, median * 0.5)

  // Sort top-down (high y first since y grows up in PDF space).
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: LayoutTextItem[][] = []
  let currentRow: LayoutTextItem[] = []
  let currentY: number | null = null
  for (const it of sorted) {
    if (currentY === null || Math.abs(it.y - currentY) <= tol) {
      currentRow.push(it)
      currentY = currentY === null ? it.y : currentY
    } else {
      currentRow.sort((a, b) => a.x - b.x)
      rows.push(currentRow)
      currentRow = [it]
      currentY = it.y
    }
  }
  if (currentRow.length > 0) {
    currentRow.sort((a, b) => a.x - b.x)
    rows.push(currentRow)
  }
  return rows
}

function emptyStats(): ExtractStats {
  return {
    imagesDetected: 0,
    imagesExtracted: 0,
    imagesSkipped: 0,
    pageFallbackImages: 0,
    jpegImages: 0,
    pngImages: 0,
  }
}

// pdfjs's objs API has different containers for embedded vs commonObjs.
// Try each, callback-style, with a small timeout to avoid hanging.
async function resolveImgObject(page: pdfjs.PDFPageProxy, name: string): Promise<unknown> {
  return await new Promise((resolve) => {
    let done = false
    const finish = (v: unknown) => {
      if (done) return
      done = true
      resolve(v)
    }
    const timeout = setTimeout(() => finish(null), 3000)
    const containers: Array<unknown> = [
      (page as unknown as { commonObjs: unknown }).commonObjs,
      (page as unknown as { objs: unknown }).objs,
    ]
    for (const c of containers) {
      try {
        const get = (
          c as { get?: (n: string, cb: (v: unknown) => void) => void }
        ).get
        if (typeof get !== "function") continue
        get.call(c, name, (v: unknown) => {
          if (v) {
            clearTimeout(timeout)
            finish(v)
          }
        })
      } catch {
        // try next container
      }
    }
  })
}

async function imageObjToBlob(
  imgObj: unknown,
  pageNumber: number,
  sourceFilename: string,
): Promise<{
  blob: Blob
  width: number
  height: number
  pageNumber: number
  hintAlt: string
  filename: string
  contentType: "image/png" | "image/jpeg"
} | null> {
  const i = imgObj as {
    bitmap?: ImageBitmap | HTMLCanvasElement | OffscreenCanvas
    data?: Uint8ClampedArray | Uint8Array
    width?: number
    height?: number
    kind?: number
    jpegData?: Uint8Array
  }
  const width = i.width ?? 0
  const height = i.height ?? 0
  if (!width || !height) return null

  const baseName = sourceFilename.replace(/\.[^.]+$/, "")

  // Fast path: JPEG-encoded source. pdfjs hands us the original JPEG bytes.
  // Wrap as image/jpeg directly — no canvas round-trip, no quality loss.
  if (i.jpegData instanceof Uint8Array && i.jpegData.byteLength > 0) {
    const blob = new Blob([i.jpegData], { type: "image/jpeg" })
    if (blob.size < MIN_BLOB_BYTES) return null
    return {
      blob,
      width,
      height,
      pageNumber,
      hintAlt: `Image extracted from ${baseName}, page ${pageNumber}`,
      filename: `${baseName}-p${pageNumber}-${width}x${height}.jpg`,
      contentType: "image/jpeg",
    }
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  if (i.bitmap) {
    try {
      ctx.drawImage(i.bitmap as CanvasImageSource, 0, 0)
    } catch {
      return null
    }
  } else if (i.data) {
    const expected = width * height * 4
    let rgba: Uint8ClampedArray
    if (i.data.length === expected) {
      rgba = new Uint8ClampedArray(i.data)
    } else if (i.data.length === width * height * 3) {
      rgba = new Uint8ClampedArray(expected)
      for (let p = 0, q = 0; p < i.data.length; p += 3, q += 4) {
        rgba[q] = i.data[p]
        rgba[q + 1] = i.data[p + 1]
        rgba[q + 2] = i.data[p + 2]
        rgba[q + 3] = 255
      }
    } else if (i.data.length === width * height) {
      rgba = new Uint8ClampedArray(expected)
      for (let p = 0, q = 0; p < i.data.length; p += 1, q += 4) {
        rgba[q] = i.data[p]
        rgba[q + 1] = i.data[p]
        rgba[q + 2] = i.data[p]
        rgba[q + 3] = 255
      }
    } else {
      // Try to detect a stride-padded RGBA buffer (kind === 3 sometimes pads
      // rows to 4-byte stride boundaries). Bail rather than guess wrong —
      // the per-page render fallback will catch us.
      return null
    }
    const imageData = new ImageData(rgba, width, height)
    ctx.putImageData(imageData, 0, 0)
  } else {
    return null
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  )
  if (!blob || blob.size < MIN_BLOB_BYTES) return null

  return {
    blob,
    width,
    height,
    pageNumber,
    hintAlt: `Image extracted from ${baseName}, page ${pageNumber}`,
    filename: `${baseName}-p${pageNumber}-${width}x${height}.png`,
    contentType: "image/png",
  }
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function detectLanguage(markdown: string): string | null {
  const sample = markdown.slice(0, 4000).toLowerCase()
  const counts: Record<string, number> = {
    en: countWords(sample, ["the", "and", "of", "for", "with", "be"]),
    nl: countWords(sample, ["het", "een", "voor", "met", "zijn", "wordt"]),
    de: countWords(sample, ["der", "und", "die", "mit", "ist", "auf"]),
    fr: countWords(sample, ["le", "la", "les", "et", "pour", "avec"]),
  }
  const [best] = Object.entries(counts).sort(([, a], [, b]) => b - a)
  if (!best) return null
  if (best[1] < 4) return null
  return best[0]
}

function countWords(text: string, words: string[]): number {
  let total = 0
  for (const w of words) {
    const m = text.match(new RegExp(`\\b${w}\\b`, "g"))
    total += m ? m.length : 0
  }
  return total
}
