// CSS for the print preview window. Embedded as a string so the popup
// document is self-contained (no external stylesheet to load).
//
// Layout strategy:
//   • A4 page geometry via @page rules + a max-width on the body content.
//   • Title page is the first page; @page :first hides running header/footer.
//   • Running header/footer use @page margin-box content (Chrome / Edge).
//     For browsers that don't render margin-boxes, we fall back to absolute
//     positioned fixed elements per .page wrapper.
//   • page-break-* utilities so callouts, step items, and table rows do not
//     split mid-element.

export const PAGE_SIZE_A4 = "210mm 297mm"

export function buildPrintStyles(opts: {
  docId: string
  title: string
  version: number
  effective: string | null
  reviewBy: string | null
  watermark: string | null
  /** Cover settings: replaces the doc title in the recurring header when set. */
  headerRightOverride?: string | null
  /** Cover settings: confidentiality line / footer text, centered. */
  footerCenter?: string | null
  showPageNumbers?: boolean
  titleSize?: "sm" | "md" | "lg"
  accentColor?: string | null
}): string {
  const { docId, title, version, effective, watermark } = opts
  const headerLeft = `${docId} · v${version}`
  const headerRight = (opts.headerRightOverride?.trim() || title).replace(/"/g, '\\"')
  const footerLeft = effective ? `Effective ${effective}` : ""
  const footerCenter = opts.footerCenter?.trim() ?? ""
  const showPageNumbers = opts.showPageNumbers ?? true
  const accent = normalizeHex(opts.accentColor) ?? "#ea580c"
  const titlePt =
    opts.titleSize === "sm" ? "19pt" : opts.titleSize === "lg" ? "30pt" : "24pt"

  return `
:root {
  color-scheme: light;
}

@page {
  size: A4;
  margin: 22mm 18mm 22mm 18mm;
  @top-left  { content: "${escapeCss(headerLeft)}"; font-size: 9pt; color: #777; font-family: ui-sans-serif, system-ui; }
  @top-right { content: "${escapeCss(headerRight)}"; font-size: 9pt; color: #777; font-family: ui-sans-serif, system-ui; }
  @bottom-left  { content: "${escapeCss(footerLeft)}"; font-size: 8.5pt; color: #999; font-family: ui-sans-serif, system-ui; }
  @bottom-center { content: "${escapeCss(footerCenter)}"; font-size: 8.5pt; color: #999; font-family: ui-sans-serif, system-ui; }
  @bottom-right { content: ${showPageNumbers ? '"Page " counter(page) " of " counter(pages)' : '""'}; font-size: 8.5pt; color: #999; font-family: ui-sans-serif, system-ui; }
}
@page :first {
  @top-left  { content: ""; }
  @top-right { content: ""; }
  @bottom-left  { content: ""; }
  @bottom-center { content: ""; }
  @bottom-right { content: ""; }
}

html, body {
  margin: 0;
  padding: 0;
  background: #fff;
  color: #1f2937;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, "Helvetica Neue", Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.55;
}

/* Screen preview surfaces: show the document on a neutral backdrop */
@media screen {
  body {
    background: #f1f5f9;
    padding: 24px 0;
  }
  .doc-page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto 16px;
    padding: 22mm 18mm;
    background: #fff;
    box-shadow: 0 4px 18px rgba(15, 23, 42, 0.10);
  }
  .preview-toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: #0f172a;
    color: #fff;
    padding: 10px 18px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.18);
  }
  .preview-toolbar h1 {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .preview-toolbar button {
    appearance: none;
    border: 1px solid rgba(255,255,255,0.25);
    background: rgba(255,255,255,0.08);
    color: #fff;
    font-size: 12px;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
  }
  .preview-toolbar button.primary {
    background: ${accent};
    border-color: ${accent};
  }
  .preview-toolbar button:hover { background: rgba(255,255,255,0.18); }
  .preview-toolbar button.primary:hover { filter: brightness(0.85); }
}

/* Print: each .doc-page is a logical page; let CSS handle real pagination */
@media print {
  body { padding: 0; background: #fff; }
  .doc-page {
    padding: 0;
    margin: 0;
    box-shadow: none;
    width: auto;
    min-height: 0;
    page-break-after: always;
  }
  .doc-page:last-child { page-break-after: auto; }
  .preview-toolbar { display: none; }
  .no-print { display: none !important; }
}

/* ---------- Title page ---------- */

.title-page {
  display: flex;
  flex-direction: column;
  min-height: 250mm;
}
.title-logo {
  display: block;
  max-height: 16mm;
  max-width: 60mm;
  object-fit: contain;
  margin-bottom: 10pt;
}
.title-eyebrow {
  font-size: 9pt;
  font-weight: 700;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: ${accent};
}
.title-kicker {
  margin-top: 4pt;
  font-size: 9pt;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #6b7280;
}
.title-main {
  margin-top: 12pt;
}
.title-main h1 {
  font-size: ${titlePt};
  font-weight: 700;
  line-height: 1.12;
  margin: 0;
  color: #0f172a;
}
/* Prominent document-id badge directly under the title. */
.title-code-badge {
  display: inline-block;
  margin-top: 8pt;
  font-family: ui-monospace, "SFMono-Regular", "Menlo", monospace;
  font-size: 15pt;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #0f172a;
  background: #f8fafc;
  border: 1pt solid #cbd5e1;
  border-radius: 4pt;
  padding: 4pt 10pt;
}
.title-edition {
  margin-top: 6pt;
  font-size: 9pt;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6b7280;
}
/* Compact metadata band, title page must always fit one page. */
.title-meta-grid {
  margin-top: 12pt;
  border-top: 1pt solid #e5e7eb;
  border-bottom: 1pt solid #e5e7eb;
  padding: 7pt 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3pt 18pt;
  font-size: 9pt;
}
.title-meta-grid > div {
  display: flex;
  align-items: baseline;
  gap: 8pt;
}
.title-meta-grid .k {
  flex: 0 0 64pt;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #9ca3af;
}
.title-meta-grid .v { color: #1f2937; }

/* PPE row, mirrors the in-app PpeBlock: blue-tinted band, white chips with
   the ISO-7010-style pictogram. */
.title-ppe {
  margin-top: 10pt;
  border: 0.6pt solid #93c5fd;
  background: #eff6ff;
  border-radius: 6pt;
  padding: 6pt 10pt;
}
.title-ppe-label {
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #1e3a8a;
  margin-bottom: 4pt;
}
.title-ppe-items {
  display: flex;
  flex-wrap: wrap;
  gap: 5pt;
}
.ppe-chip {
  display: inline-flex;
  align-items: center;
  gap: 4pt;
  padding: 2.5pt 9pt 2.5pt 5pt;
  border-radius: 999pt;
  border: 0.6pt solid #93c5fd;
  background: #fff;
  color: #1e3a8a;
  font-size: 8.5pt;
  font-weight: 600;
}
.ppe-chip img { display: inline-block; width: 13pt; height: 13pt; }

/* Title-page document overview, compact tables in a two-column grid so the
   cover stays on one page. Revision history spans the full width on top. */
.title-overview {
  margin-top: 10pt;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8pt 12pt;
  align-items: start;
}
.title-overview .fm-block { margin: 0; }
.title-overview .revision-block { grid-column: 1 / -1; }
.title-overview .fm-h {
  margin-bottom: 3pt;
  font-size: 8pt;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #475569;
}
.title-overview .fm-block table { font-size: 8pt; }
.title-overview .fm-block th, .title-overview .fm-block td {
  padding: 2.5pt 5pt;
}
.title-overview .fm-block th { font-size: 6.5pt; }
.title-overview .fm-block .fm-code { font-size: 7.5pt; }

.title-tags {
  margin-top: 12pt;
  display: flex;
  flex-wrap: wrap;
  gap: 5pt;
}
.title-tags span {
  display: inline-block;
  padding: 2pt 7pt;
  border-radius: 4pt;
  background: #f1f5f9;
  color: #475569;
  font-size: 8.5pt;
}

.title-controlled {
  margin-top: auto;
  border-top: 1pt solid #e5e7eb;
  padding-top: 10pt;
  font-size: 8.5pt;
  color: #6b7280;
  line-height: 1.45;
}
.title-controlled .stamp {
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #0f172a;
}
.title-controlled .stamp.confidential {
  color: #b91c1c;
  margin-bottom: 2pt;
}

/* ---------- Front matter ("Document overview" page) ---------- */
/* Plain section headings + clean tables. No pills, codes are plain monospace
   cells under explicit "Linked machine / Linked log / Reference" headers. */

.fm-title {
  margin: 0 0 14pt;
  font-size: 16pt;
  font-weight: 700;
  color: #0f172a;
}
.fm-block {
  margin: 0 0 16pt;
  page-break-inside: avoid;
}
.fm-h {
  margin-bottom: 6pt;
  font-size: 10pt;
  font-weight: 700;
  color: #0f172a;
}
.fm-block table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9.5pt;
}
.fm-block th, .fm-block td {
  border: 0.5pt solid #d1d5db;
  padding: 5pt 8pt;
  text-align: left;
  vertical-align: top;
}
.fm-block th {
  font-weight: 700;
  text-transform: uppercase;
  font-size: 8pt;
  letter-spacing: 0.06em;
  background: #f8fafc;
  color: #475569;
}
.fm-block .fm-code {
  font-family: ui-monospace, "SFMono-Regular", monospace;
  font-size: 9pt;
  color: #334155;
  white-space: nowrap;
}

/* ---------- Body content ---------- */

.doc-body { color: #1f2937; }
.doc-body h1, .doc-body h2, .doc-body h3 { color: #0f172a; line-height: 1.25; }
.doc-body h1 { font-size: 18pt; margin: 22pt 0 8pt; }
.doc-body h2 { font-size: 14pt; margin: 18pt 0 6pt; border-bottom: 0.5pt solid #e5e7eb; padding-bottom: 3pt; }
.doc-body h3 { font-size: 12pt; margin: 14pt 0 4pt; }
.doc-body h1:first-child, .doc-body h2:first-child, .doc-body h3:first-child { margin-top: 0; }
.doc-body p { margin: 0 0 8pt; }
.doc-body ul, .doc-body ol { margin: 0 0 10pt; padding-left: 22pt; }
.doc-body li { margin: 0 0 3pt; }
.doc-body blockquote {
  margin: 8pt 0;
  border-left: 2.5pt solid #cbd5e1;
  padding: 4pt 10pt;
  color: #475569;
  background: #f8fafc;
}
.doc-body code {
  font-family: ui-monospace, "SFMono-Regular", monospace;
  font-size: 9.5pt;
  background: #f1f5f9;
  padding: 1pt 4pt;
  border-radius: 3pt;
}
.doc-body pre {
  background: #0f172a;
  color: #e2e8f0;
  padding: 10pt 12pt;
  border-radius: 4pt;
  font-size: 9pt;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  page-break-inside: avoid;
}
.doc-body pre code { background: transparent; color: inherit; padding: 0; }
.doc-body a { color: #2563eb; text-decoration: underline; }
.doc-body img {
  max-width: 100%;
  height: auto;
  margin: 8pt 0;
  page-break-inside: avoid;
}
.doc-body hr {
  border: none;
  border-top: 0.5pt solid #cbd5e1;
  margin: 12pt 0;
}

/* Tables, repeat thead on each new page */
.doc-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 10pt 0;
  font-size: 9.5pt;
  page-break-inside: auto;
}
.doc-body table thead { display: table-header-group; }
.doc-body table tr { page-break-inside: avoid; page-break-after: auto; }
.doc-body table th, .doc-body table td {
  border: 0.5pt solid #d1d5db;
  padding: 5pt 7pt;
  vertical-align: top;
  text-align: left;
}
.doc-body table th { background: #f1f5f9; font-weight: 700; color: #334155; }

/* Custom blocks */
.doc-body [data-callout] {
  border: 0.6pt solid #cbd5e1;
  border-left-width: 3pt;
  background: #f8fafc;
  padding: 8pt 10pt;
  border-radius: 3pt;
  margin: 8pt 0 10pt;
  page-break-inside: avoid;
}
/* Tones mirror the editor's CalloutBlock: warning=amber, danger=red,
   notice=sky, tip=emerald. */
.doc-body [data-callout="warning"] { border-color: #f59e0b; background: #fffbeb; }
.doc-body [data-callout="danger"]  { border-color: #ef4444; background: #fef2f2; }
.doc-body [data-callout="notice"]  { border-color: #38bdf8; background: #f0f9ff; }
.doc-body [data-callout="tip"]     { border-color: #10b981; background: #ecfdf5; }
/* legacy aliases */
.doc-body [data-callout="info"]    { border-color: #38bdf8; background: #f0f9ff; }
.doc-body [data-callout="note"]    { border-color: #94a3b8; background: #f8fafc; }
.doc-body [data-callout-title] {
  font-weight: 700;
  font-size: 9.5pt;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 3pt;
  color: #1f2937;
}

.doc-body [data-step-list] {
  list-style: none;
  padding-left: 0;
  margin: 12pt 0;
  counter-reset: step;
}
.doc-body [data-step-item] {
  counter-increment: step;
  border: 0.5pt solid #cbd5e1;
  border-radius: 4pt;
  padding: 8pt 10pt 8pt 32pt;
  margin: 0 0 5pt;
  position: relative;
  page-break-inside: avoid;
  background: #fff;
}
.doc-body [data-step-item]::before {
  content: counter(step);
  position: absolute;
  left: 8pt;
  top: 8pt;
  width: 17pt;
  height: 17pt;
  border-radius: 50%;
  background: #2563eb;
  color: #fff;
  font-weight: 700;
  font-size: 9pt;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* PPE row, mirrors the in-app PpeBlock: orange band, white bordered chips. */
.doc-body [data-ppe-block] {
  border: 0.6pt solid #fdba74;
  background: #fff7ed;
  border-radius: 6pt;
  padding: 6pt 10pt;
  margin: 8pt 0 10pt;
  page-break-inside: avoid;
}
.doc-body [data-ppe-block] .label {
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #9a3412;
  margin-bottom: 4pt;
}
.doc-body [data-ppe-block] .items {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 5pt;
}
.doc-body [data-ppe-block] .items span {
  display: inline-flex;
  align-items: center;
  gap: 4pt;
  background: #fff;
  border: 0.6pt solid #fdba74;
  color: #9a3412;
  padding: 2.5pt 9pt;
  border-radius: 999pt;
  font-size: 9pt;
  font-weight: 600;
}
.doc-body [data-ppe-block] .items span img { object-fit: contain; }
/* Large: stack the (bigger) pictogram above the label, like the in-app block. */
.doc-body [data-ppe-block][data-size="lg"] .items span {
  flex-direction: column;
  text-align: center;
  width: 70pt;
  padding: 4pt;
  border-radius: 5pt;
  font-size: 8.5pt;
}

.doc-body [data-diagram-block] {
  margin: 10pt 0;
  border: 0.5pt solid #e5e7eb;
  border-radius: 4pt;
  padding: 10pt;
  background: #f8fafc;
  page-break-inside: avoid;
}
.doc-body [data-diagram-block] svg { width: 100%; height: auto; max-height: 90mm; }
.doc-body [data-diagram-block] .caption {
  margin-top: 6pt;
  font-size: 8.5pt;
  color: #64748b;
  text-align: center;
  font-style: italic;
}

/* Launch-log chip, matches the editor's sky-toned chip. */
.doc-body [data-launch-log] {
  display: inline-flex;
  align-items: center;
  gap: 5pt;
  padding: 2pt 8pt;
  border-radius: 999pt;
  background: #f0f9ff;
  color: #075985;
  font-size: 9pt;
  border: 0.5pt solid #7dd3fc;
}
.doc-body [data-launch-log]::before { content: "▶"; font-size: 7.5pt; color: #0284c7; }
/* Machine chip, must match the emerald chip shown in the editor / read view. */
.doc-body [data-linked-asset] {
  display: inline-flex;
  align-items: center;
  gap: 4pt;
  padding: 1pt 6pt;
  border-radius: 4pt;
  background: #ecfdf5;
  color: #065f46;
  font-family: ui-monospace, monospace;
  font-size: 9pt;
  border: 0.5pt solid #6ee7b7;
}
.doc-body [data-linked-asset]::before {
  content: "⚙";
  color: #059669;
}

/* Reference-document chip, must match the indigo chip in the editor. */
.doc-body [data-reference-doc] {
  display: inline-flex;
  align-items: center;
  gap: 4pt;
  padding: 1pt 6pt;
  border-radius: 4pt;
  background: #eef2ff;
  color: #3730a3;
  font-family: ui-monospace, monospace;
  font-size: 9pt;
  border: 0.5pt solid #a5b4fc;
}
.doc-body [data-reference-doc]::before {
  content: "❡";
  color: #6366f1;
}

/* Embedded PDF attachment (rasterised pages) */
.pdf-attachment {
  margin-top: 14pt;
}
.pdf-attachment-head, .pdf-attachment-note .pdf-attachment-head {
  font-size: 9pt;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8pt;
}
.pdf-attachment .pdf-page {
  margin: 0 0 10pt;
  page-break-inside: avoid;
}
.pdf-attachment .pdf-page img {
  display: block;
  width: 100%;
  border: 0.5pt solid #e2e8f0;
}
.pdf-attachment-note {
  margin-top: 14pt;
  border: 0.5pt dashed #cbd5e1;
  border-radius: 4pt;
  padding: 10pt 12pt;
  background: #f8fafc;
  font-size: 10pt;
  color: #475569;
}

/* Watermark, repeats on every page via fixed positioning */
${
  watermark
    ? `
.watermark {
  position: fixed;
  inset: 0;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 0;
  opacity: 0.08;
  font-size: 84pt;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: #ef4444;
  transform: rotate(-32deg);
  text-transform: uppercase;
  white-space: nowrap;
}
@media print { .watermark { opacity: 0.10; } }
`
    : ""
}
`
}

function escapeCss(s: string): string {
  // CSS string in content: " escapes
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

// The accent color is interpolated into CSS — only accept a strict hex form
// so a malformed/malicious settings value can't break out of the stylesheet.
function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null
  const v = value.trim()
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : null
}
