import type { CSSProperties, ReactNode } from "react"
import { AssetQrSvg } from "@/components/docs/AssetQrSvg"
import { formatDateTime } from "@/lib/time"
import { coverageText } from "./blocks/IntroBlock"
import { originText } from "./blocks/OriginMark"
import {
  bodySections,
  dangerOverCap,
  groupByDocument,
  introSection,
  sectionNotes,
  type SourceNote,
  type WikiBlockView,
  type WikiContentView,
  type WikiSectionView,
  type WikiView,
} from "./wikiShared"

// The A4 print of a Wiki (spec 4.8). Mounted in a portal on <body> and hidden
// on screen; in print everything else on the page is hidden. Prints the
// introduction, the coverage line, every section expanded, figures, and
// numbered endnotes per section (the same runs as the markers on screen). A
// table footer repeats on every printed page in Chromium, so the "not a
// controlled document" line and the QR to the live version are on every page.
// The one-pager prints Key points, danger callouts and safety sections only.
// The app's print CSS hides header, nav and aside, so none are used here.

const PRINT_CSS = `
#wiki-print-root { display: none; }
@media print {
  @page { size: A4; margin: 14mm 14mm 12mm; }
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
  body > *:not(#wiki-print-root) { display: none !important; }
  #wiki-print-root { display: block !important; color: #0f172a; font-size: 10.5pt; line-height: 1.45; }
  #wiki-print-root section { break-inside: avoid-page; }
  #wiki-print-root li, #wiki-print-root tr { break-inside: avoid; }
  #wiki-print-root h2 { break-after: avoid; }
  #wiki-print-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`

const MUTED = "#64748b"
const sup: CSSProperties = { fontSize: "7pt", color: "#4c3d80", fontWeight: 700, marginLeft: "1pt" }

type Notes = Map<string, SourceNote>

function Note({ notes, blockId, index }: { notes: Notes; blockId: string; index: number }) {
  const note = notes.get(`${blockId}:${index}`)
  return note ? <sup style={sup}>{note.n}</sup> : null
}

function Disputed({ point }: { point: WikiBlockView["points"][number] }) {
  if (point.disputed)
    return (
      <span style={{ display: "block", color: "#b91c1c", fontSize: "8.5pt" }}>
        {point.disputed.otherNamingCode} v{point.disputed.otherVersion} says: "{point.disputed.otherQuote}". Open finding: check with the
        document owner.
      </span>
    )
  if (point.findingId)
    return <span style={{ color: "#b91c1c", fontSize: "8.5pt" }}> Open finding: check with the document owner.</span>
  return null
}

function Sentences({ block, notes }: { block: WikiBlockView; notes: Notes }) {
  return (
    <p style={{ margin: 0 }}>
      {block.points.map((p, i) => (
        <span key={i}>
          {i > 0 && " "}
          {p.text}
          <Note notes={notes} blockId={block.id} index={i} />
          <Disputed point={p} />
        </span>
      ))}
    </p>
  )
}

function PrintBlock({ block, notes, dangerOver }: { block: WikiBlockView; notes: Notes; dangerOver: Set<string> }) {
  const origin = originText(block, { short: true })
  let body: ReactNode = null
  switch (block.kind) {
    case "intro":
    case "prose":
      body = <Sentences block={block} notes={notes} />
      break
    case "bullets":
    case "steps": {
      const items = block.points.map((p, i) => (
        <li key={i} style={{ marginBottom: "3pt" }}>
          <span style={p.key ? { fontWeight: 600 } : undefined}>{p.text}</span>
          <Note notes={notes} blockId={block.id} index={i} />
          <Disputed point={p} />
        </li>
      ))
      body =
        block.kind === "steps" ? (
          <ol style={{ paddingLeft: "16pt", listStyle: "decimal", margin: 0 }}>{items}</ol>
        ) : (
          <ul style={{ paddingLeft: "14pt", listStyle: "disc", margin: 0 }}>{items}</ul>
        )
      break
    }
    case "table": {
      const cols = block.columns ?? []
      body = (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9.5pt" }}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} style={{ textAlign: "left", borderBottom: "1pt solid #94a3b8", padding: "3pt 4pt" }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.points.map((p, i) => (
              <tr key={i}>
                {cols.map((_, k) => (
                  <td key={k} style={{ borderBottom: "0.5pt solid #e2e8f0", padding: "3pt 4pt", verticalAlign: "top" }}>
                    {p.cells?.[k] ?? ""}
                    {k === cols.length - 1 && <Note notes={notes} blockId={block.id} index={i} />}
                    {k === 0 && <Disputed point={p} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
      break
    }
    case "callout": {
      const tone = block.tone === "danger" && dangerOver.has(block.id) ? "warning" : (block.tone ?? "tip")
      const box: CSSProperties =
        tone === "danger"
          ? { border: "1.25pt solid #b91c1c", background: "#fef2f2", borderRadius: "3pt", padding: "5pt 8pt" }
          : { borderLeft: `2.5pt solid ${tone === "warning" ? "#d97706" : "#94a3b8"}`, paddingLeft: "7pt" }
      body = (
        <div style={box}>
          <strong style={{ fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.05em", color: tone === "danger" ? "#991b1b" : MUTED }}>
            {tone === "danger" ? "Danger" : tone === "warning" ? "Warning" : "Tip"}
          </strong>
          <Sentences block={block} notes={notes} />
        </div>
      )
      break
    }
    case "gap":
      body = <p style={{ fontStyle: "italic", color: MUTED, margin: 0 }}>No Published document covers this yet.</p>
      break
    default:
      return null
  }
  return (
    <div style={{ marginBottom: "5pt" }}>
      {body}
      {origin && <p style={{ fontSize: "7.5pt", color: MUTED, margin: "1pt 0 0" }}>{origin}</p>}
    </div>
  )
}

/** Numbered endnotes of one section: the Document, version and passage heading per marker. */
function Endnotes({ notes }: { notes: SourceNote[] }) {
  if (notes.length === 0) return null
  return (
    <ol style={{ margin: "4pt 0 0", paddingLeft: "14pt", listStyle: "decimal", fontSize: "7.5pt", color: MUTED, lineHeight: 1.35 }}>
      {notes.map((n) => (
        <li key={n.n}>
          {groupByDocument(n.citations)
            .map((g) => {
              const parts = g.items.map((c) => c.section).filter((x): x is string => !!x)
              return `${g.namingCode} v${g.version}${parts.length ? `, ${[...new Set(parts)].join("; ")}` : ""}`
            })
            .join(" · ")}
        </li>
      ))}
    </ol>
  )
}

function PrintSection({
  wiki,
  section,
  blocks,
  dangerOver,
  heading,
}: {
  wiki: WikiView
  section: WikiSectionView
  blocks: WikiBlockView[]
  dangerOver: Set<string>
  heading?: string
}) {
  const { at, notes } = sectionNotes(blocks)
  const figure = wiki.figuresBySection[section.id]
  const box: CSSProperties = section.safety ? { borderLeft: "2.5pt solid #d97706", paddingLeft: "8pt" } : {}
  return (
    <section style={{ marginBottom: "12pt", ...box }}>
      <h2 style={{ fontSize: "12.5pt", fontWeight: 700, marginBottom: "4pt" }}>
        {section.safety ? "Safety: " : ""}
        {heading ?? section.heading}
      </h2>
      {blocks.map((b) => (
        <PrintBlock key={b.id} block={b} notes={at} dangerOver={dangerOver} />
      ))}
      {figure && (
        <figure style={{ margin: "6pt 0", breakInside: "avoid" }}>
          <img src={figure.url} alt={figure.alt} style={{ maxHeight: "60mm", maxWidth: "100%", objectFit: "contain" }} />
          <figcaption style={{ fontSize: "8pt", color: MUTED }}>
            {figure.alt} ({figure.namingCode})
          </figcaption>
        </figure>
      )}
      <Endnotes notes={notes} />
    </section>
  )
}

export function WikiPrintLayout({ wiki, content, mode }: { wiki: WikiView; content: WikiContentView; mode: "full" | "one-pager" }) {
  const builtFrom = wiki.sources.map((s) => `${s.namingCode} v${s.version}`).join(", ")
  const live = `${window.location.origin}/m/wiki/${wiki._id}`
  const built = wiki.generatedAt ? formatDateTime(wiki.generatedAt) : "not built yet"
  const dangerOver = dangerOverCap(content, wiki.settings.maxDanger)
  const intro = introSection(content)
  const introBlock = intro?.blocks.find((b) => b.kind === "intro" && b.points.length > 0)
  const keyPoints = intro?.blocks.find((b) => b.kind === "keyPoints" && b.points.length > 0)
  const body = bodySections(content)
  const onePager = mode === "one-pager"
  // One-pager: danger callouts outside safety sections, gathered under one heading.
  const danger = body
    .filter((s) => !s.safety)
    .flatMap((s) => s.blocks.filter((b) => b.kind === "callout" && b.tone === "danger" && !dangerOver.has(b.id)))

  return (
    <div id="wiki-print-root" data-mode={mode}>
      <style>{PRINT_CSS}</style>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ padding: 0 }}>
              <div style={{ borderBottom: "1.5pt solid #0f172a", paddingBottom: "6pt", marginBottom: "10pt" }}>
                <p style={{ fontSize: "8.5pt", textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>
                  Oppr Knowledge · Wiki{onePager ? " · One-pager" : ""}
                </p>
                <h1 style={{ fontSize: "17pt", fontWeight: 700, margin: "2pt 0" }}>{wiki.title}</h1>
                <p style={{ color: "#334155" }}>{wiki.purpose}</p>
              </div>

              {!onePager && intro && introBlock && (
                <PrintSection wiki={wiki} section={intro} blocks={[introBlock]} dangerOver={dangerOver} heading="Introduction" />
              )}
              {!onePager && <p style={{ fontSize: "8.5pt", color: MUTED, margin: "-6pt 0 10pt" }}>{coverageText(content.coverage)}</p>}

              {intro && keyPoints && (
                <div style={{ border: "1pt solid #6E59A5", borderRadius: "4pt", padding: "6pt 10pt", marginBottom: "12pt" }}>
                  <PrintSection wiki={wiki} section={{ ...intro, id: `${intro.id}:keyPoints`, safety: false }} blocks={[{ ...keyPoints, kind: "bullets" }]} dangerOver={dangerOver} heading="Key points" />
                </div>
              )}

              {onePager && danger.length > 0 && (
                <section style={{ marginBottom: "12pt" }}>
                  <h2 style={{ fontSize: "12.5pt", fontWeight: 700, marginBottom: "4pt" }}>Danger</h2>
                  {danger.map((b) => {
                    const { at, notes } = sectionNotes([b])
                    return (
                      <div key={b.id}>
                        <PrintBlock block={b} notes={at} dangerOver={dangerOver} />
                        <Endnotes notes={notes} />
                      </div>
                    )
                  })}
                </section>
              )}

              {body
                .filter((s) => !onePager || s.safety)
                .map((s) => (
                  <PrintSection key={s.id} wiki={wiki} section={s} blocks={s.blocks} dangerOver={dangerOver} />
                ))}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td style={{ padding: "8pt 0 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10pt", borderTop: "0.75pt solid #94a3b8", paddingTop: "6pt", fontSize: "8pt", color: "#334155" }}>
                <p style={{ flex: 1 }}>
                  <strong>Generated overview, not a controlled document.</strong> Built {built} from {builtFrom || "no documents"}. Check the live version:{" "}
                  <span style={{ fontFamily: "monospace" }}>{live}</span>
                </p>
                <AssetQrSvg value={live} size={56} />
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
