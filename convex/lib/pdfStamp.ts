import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib"

// Stamping a supplier PDF (CONTEXT.md: Wrapped manual). The supplier's pages
// are never changed in content: every page gets a thin band at the top and
// bottom with our naming code, version and status, so a printout or a
// download is always traceable to its controlled Document.
//
// Pure function over bytes, no Convex imports: used by convex/manuals.ts and
// by the seed. Runs in the default Convex runtime (pdf-lib is pure JS).

export interface StampInfo {
  namingCode: string
  title: string
  version: number
  // "draft" | "in_review" | "approved" | "published" | "archived"
  status: string
  // Shown in the footer, e.g. the Published date: "2026-10-24".
  date: string
  supplier?: string | null
}

const BAND = 18

export function stampLabel(info: Pick<StampInfo, "status" | "version">): string {
  switch (info.status) {
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
    .replace(/·/g, "-")
    .replace(/[^\x20-\x7E -ÿ]/g, "?")
}

function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  let t = safe(text)
  while (t.length > 4 && font.widthOfTextAtSize(t, size) > maxWidth) t = t.slice(0, -2)
  return t === safe(text) ? t : t.replace(/.$/, "") + "..."
}

function drawBand(
  page: PDFPage,
  y: number,
  left: string,
  right: string,
  fonts: { bold: PDFFont; regular: PDFFont },
  tone: { r: number; g: number; b: number },
) {
  const { width } = page.getSize()
  page.drawRectangle({ x: 0, y, width, height: BAND, color: rgb(tone.r, tone.g, tone.b), opacity: 0.92 })
  const size = 7.5
  const half = width / 2 - 16
  page.drawText(fit(left, fonts.bold, size, half), {
    x: 12,
    y: y + 6,
    size,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  })
  const r = fit(right, fonts.regular, size, half)
  page.drawText(r, {
    x: width - 12 - fonts.regular.widthOfTextAtSize(r, size),
    y: y + 6,
    size,
    font: fonts.regular,
    color: rgb(1, 1, 1),
  })
}

/**
 * Returns a new PDF: the supplier's pages with a header and footer band.
 * Published copies get a dark blue band; anything not Published gets an
 * amber band and a light diagonal "NOT FOR USE" mark.
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
  const tone = published ? { r: 0.11, g: 0.23, b: 0.45 } : { r: 0.8, g: 0.45, b: 0.05 }
  const pages = pdf.getPages()
  pages.forEach((page, i) => {
    const { width, height } = page.getSize()
    drawBand(page, height - BAND, `${info.namingCode}  ${info.title}`, label, { bold, regular }, tone)
    drawBand(
      page,
      0,
      `Oppr Knowledge - ${info.supplier ? `supplier document by ${info.supplier}` : "wrapped supplier document"}`,
      `${info.date} - page ${i + 1} of ${pages.length} - printed copies are uncontrolled`,
      { bold, regular },
      tone,
    )
    if (!published) {
      page.drawText("NOT FOR USE", {
        x: width * 0.18,
        y: height * 0.42,
        size: Math.min(width, height) / 9,
        font: bold,
        color: rgb(0.85, 0.5, 0.1),
        opacity: 0.12,
        rotate: degrees(35),
      })
    }
  })
  pdf.setTitle(`${info.namingCode} ${info.title}`)
  pdf.setSubject(label)
  pdf.setProducer("Oppr Knowledge")
  const out = await pdf.save()
  return { bytes: out, pageCount: pages.length, label }
}
