import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib"

// Stamping a supplier PDF (CONTEXT.md: Wrapped manual). The supplier's pages
// are never changed in content: every page grows a thin band above and below
// its original area with our naming code, version and status, so a printout
// or a download is always traceable to its controlled Document. Because the
// bands sit outside the original page box, they never cover supplier text.
//
// Pure function over bytes, no Convex imports: used by convex/manuals.ts, by
// the seed and by the browser (a dry run before upload). Runs in the default
// Convex runtime (pdf-lib is pure JS).

export interface StampInfo {
  namingCode: string
  title: string
  version: number
  // "draft" | "in_review" | "approved" | "published" | "archived"
  status: string
  // Shown in the footer, e.g. the Published date: "2026-10-24".
  date: string
  supplier?: string | null
  // For "superseded": the version that replaced this one.
  supersededBy?: number | null
}

const BAND = 18

export function stampLabel(info: Pick<StampInfo, "status" | "version" | "supersededBy">): string {
  switch (info.status) {
    case "superseded":
      return `Superseded by v${info.supersededBy ?? info.version + 1} · not for use`
    case "published":
      return `Controlled copy · Published v${info.version}`
    case "archived":
      return `Archived v${info.version} · not for use`
    case "approved":
      return `Approved v${info.version} · not yet Published, not for use`
    case "in_review":
      return `In review v${info.version} · not for use`
    default:
      return `Draft v${info.version} · not for use`
  }
}

// Helvetica (WinAnsi) cannot encode every character: replace what it can't.
function safe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?")
}

function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const full = safe(text)
  if (font.widthOfTextAtSize(full, size) <= maxWidth) return full
  let t = full
  while (t.length > 4 && font.widthOfTextAtSize(`${t}...`, size) > maxWidth) t = t.slice(0, -1)
  return `${t.trimEnd()}...`
}

// The page as the reader sees it (after /Rotate), mapped back to PDF user
// space: visual (u, v) with u to the right and v up from the visual
// bottom-left corner.
interface Frame {
  W: number
  H: number
  rot: number
  at: (u: number, v: number) => { x: number; y: number }
}

function frameFor(rot: number, X: number, Y: number, w: number, h: number): Frame {
  switch (rot) {
    case 90:
      return { W: h, H: w, rot, at: (u, v) => ({ x: X + w - v, y: Y + u }) }
    case 180:
      return { W: w, H: h, rot, at: (u, v) => ({ x: X + w - u, y: Y + h - v }) }
    case 270:
      return { W: h, H: w, rot, at: (u, v) => ({ x: X + v, y: Y + h - u }) }
    default:
      return { W: w, H: h, rot: 0, at: (u, v) => ({ x: X + u, y: Y + v }) }
  }
}

/** Grow the visible page by one band above and one below, visually. */
function growPage(page: PDFPage): Frame {
  const rot = (((page.getRotation().angle % 360) + 360) % 360) as number
  const crop = page.getCropBox()
  const media = page.getMediaBox()
  const vertical = rot === 0 || rot === 180
  const X = vertical ? crop.x : crop.x - BAND
  const Y = vertical ? crop.y - BAND : crop.y
  const w = vertical ? crop.width : crop.width + 2 * BAND
  const h = vertical ? crop.height + 2 * BAND : crop.height
  const mx = Math.min(media.x, X)
  const my = Math.min(media.y, Y)
  page.setMediaBox(
    mx,
    my,
    Math.max(media.x + media.width, X + w) - mx,
    Math.max(media.y + media.height, Y + h) - my,
  )
  page.setCropBox(X, Y, w, h)
  return frameFor(rot, X, Y, w, h)
}

function drawBand(
  page: PDFPage,
  frame: Frame,
  v: number,
  left: string,
  right: string,
  fonts: { bold: PDFFont; regular: PDFFont },
  tone: { r: number; g: number; b: number },
) {
  const rotate = degrees(frame.rot)
  const origin = frame.at(0, v)
  page.drawRectangle({
    x: origin.x,
    y: origin.y,
    width: frame.W,
    height: BAND,
    color: rgb(tone.r, tone.g, tone.b),
    rotate,
  })
  const size = 7.5
  // The right side (status, date, page) is short and must stay whole; the
  // left side (code and title, or supplier) gets the rest and is shortened.
  const r = fit(right, fonts.regular, size, frame.W * 0.5)
  const rw = fonts.regular.widthOfTextAtSize(r, size)
  const l = fit(left, fonts.bold, size, frame.W - 24 - rw - 18)
  const lp = frame.at(12, v + 6)
  page.drawText(l, { x: lp.x, y: lp.y, size, font: fonts.bold, color: rgb(1, 1, 1), rotate })
  const rp = frame.at(frame.W - 12 - fonts.regular.widthOfTextAtSize(r, size), v + 6)
  page.drawText(r, { x: rp.x, y: rp.y, size, font: fonts.regular, color: rgb(1, 1, 1), rotate })
}

/**
 * Returns a new PDF: the supplier's pages, each grown by a header and a
 * footer band. Published copies get a dark blue band; anything not Published
 * gets an amber band and a light diagonal "NOT FOR USE" mark.
 */
export async function stampPdf(
  bytes: Uint8Array | ArrayBuffer,
  info: StampInfo,
): Promise<{ bytes: Uint8Array; pageCount: number; label: string }> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const label = stampLabel(info)
  const published = info.status === "published"
  const tone = published ? { r: 0.11, g: 0.23, b: 0.45 } : { r: 0.76, g: 0.4, b: 0.03 }
  const pages = pdf.getPages()
  pages.forEach((page, i) => {
    // Isolate the supplier's drawing state (q ... Q), so whatever transform
    // it leaves behind cannot shift or scale our bands.
    page.translateContent(0, 0)
    const frame = growPage(page)
    drawBand(
      page,
      frame,
      frame.H - BAND,
      `${info.namingCode}  ${info.title}`,
      label,
      { bold, regular },
      tone,
    )
    drawBand(
      page,
      frame,
      0,
      `Oppr Knowledge · ${info.supplier ? `supplier document by ${info.supplier}, wrapped unchanged` : "supplier document, wrapped unchanged"}`,
      `${info.date} · page ${i + 1} of ${pages.length} · printed copies are uncontrolled`,
      { bold, regular },
      tone,
    )
    if (!published) {
      const size = Math.min(frame.W, frame.H) / 9
      const at = frame.at(frame.W * 0.2, frame.H * 0.3)
      page.drawText("NOT FOR USE", {
        x: at.x,
        y: at.y,
        size,
        font: bold,
        color: rgb(0.85, 0.5, 0.1),
        opacity: 0.14,
        rotate: degrees(frame.rot + 35),
      })
    }
  })
  pdf.setTitle(`${info.namingCode} ${info.title}`)
  pdf.setSubject(label)
  pdf.setProducer("Oppr Knowledge")
  const out = await pdf.save()
  return { bytes: out, pageCount: pages.length, label }
}
