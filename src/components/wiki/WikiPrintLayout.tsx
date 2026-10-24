import { AssetQrSvg } from "@/components/docs/AssetQrSvg"
import { formatDateTime } from "@/lib/time"
import { groupByDocument, type WikiPointView, type WikiView } from "./wikiShared"

// The A4 print of a Wiki (plan, Wiki addition 5). Mounted in a portal on
// <body> and hidden on screen; in print everything else on the page is hidden.
// A table footer repeats on every printed page in Chromium, so the
// "not a controlled document" line and the QR to the live version are on
// every page. The one-pager prints At a glance and the safety sections only.

const PRINT_CSS = `
#wiki-print-root { display: none; }
@media print {
  @page { size: A4; margin: 14mm 14mm 12mm; }
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
  body > *:not(#wiki-print-root) { display: none !important; }
  #wiki-print-root { display: block !important; color: #0f172a; font-size: 10.5pt; line-height: 1.45; }
  #wiki-print-root.one-pager [data-full-only] { display: none !important; }
  #wiki-print-root section { break-inside: avoid-page; }
  #wiki-print-root li, #wiki-print-root tr { break-inside: avoid; }
  #wiki-print-root h2 { break-after: avoid; }
  #wiki-print-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`

function codes(point: WikiPointView) {
  return groupByDocument(point.citations)
    .map((g) => `${g.namingCode} v${g.version}`)
    .join(", ")
}

export function WikiPrintLayout({
  wiki,
  mode,
}: {
  wiki: WikiView
  slugs: string[]
  mode: "full" | "one-pager"
}) {
  const sections = wiki.content?.sections ?? []
  const key = sections.flatMap((s) => s.points.filter((p) => p.key && !p.cells))
  const builtFrom = wiki.sources.map((s) => `${s.namingCode} v${s.version}`).join(", ")
  const live = `${window.location.origin}/m/wiki/${wiki._id}`
  const built = wiki.generatedAt ? formatDateTime(wiki.generatedAt) : "not built yet"

  return (
    <div id="wiki-print-root" className={mode === "one-pager" ? "one-pager" : undefined}>
      <style>{PRINT_CSS}</style>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ padding: 0 }}>
              <header style={{ borderBottom: "1.5pt solid #0f172a", paddingBottom: "6pt", marginBottom: "10pt" }}>
                <p style={{ fontSize: "8.5pt", textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>
                  Oppr Knowledge · Wiki{mode === "one-pager" ? " · One-pager" : ""}
                </p>
                <h1 style={{ fontSize: "17pt", fontWeight: 700, margin: "2pt 0" }}>{wiki.title}</h1>
                <p style={{ color: "#334155" }}>{wiki.purpose}</p>
              </header>

              {key.length > 0 && (
                <section style={{ border: "1pt solid #6E59A5", borderRadius: "4pt", padding: "8pt 10pt", marginBottom: "12pt" }}>
                  <h2 style={{ fontSize: "11.5pt", fontWeight: 700, color: "#4c3d80", marginBottom: "4pt" }}>At a glance</h2>
                  <ul style={{ paddingLeft: "14pt", listStyle: "disc" }}>
                    {key.map((p, i) => (
                      <li key={i} style={{ marginBottom: "3pt" }}>
                        <strong>{p.text}</strong> <span style={{ color: "#64748b", fontSize: "8.5pt" }}>({codes(p)})</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {sections.map((s, i) => {
                const kind = s.kind ?? "bullets"
                const box = s.safety
                  ? { border: "1pt solid #d97706", background: "#fffbeb", borderRadius: "4pt", padding: "8pt 10pt" }
                  : {}
                return (
                  <section key={i} {...(s.safety ? {} : { "data-full-only": "true" })} style={{ marginBottom: "12pt", ...box }}>
                    <h2 style={{ fontSize: "12.5pt", fontWeight: 700, marginBottom: "4pt" }}>
                      {s.safety ? "⚠ " : ""}
                      {s.heading}
                    </h2>
                    {kind === "table" && s.columns ? (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9.5pt" }}>
                        <thead>
                          <tr>
                            {s.columns.map((c) => (
                              <th key={c} style={{ textAlign: "left", borderBottom: "1pt solid #94a3b8", padding: "3pt 4pt" }}>
                                {c}
                              </th>
                            ))}
                            <th style={{ textAlign: "right", borderBottom: "1pt solid #94a3b8", padding: "3pt 4pt", color: "#64748b" }}>Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.points.map((p, j) => (
                            <tr key={j}>
                              {s.columns!.map((_, k) => (
                                <td key={k} style={{ borderBottom: "0.5pt solid #e2e8f0", padding: "3pt 4pt", verticalAlign: "top" }}>
                                  {p.cells?.[k] ?? ""}
                                </td>
                              ))}
                              <td style={{ borderBottom: "0.5pt solid #e2e8f0", padding: "3pt 4pt", textAlign: "right", color: "#64748b", fontSize: "8pt" }}>
                                {codes(p)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      (() => {
                        const items = s.points.map((p, j) => (
                          <li key={j} style={{ marginBottom: "3pt" }}>
                            {p.text} <span style={{ color: "#64748b", fontSize: "8.5pt" }}>({codes(p)})</span>
                            {p.findingId && <span style={{ color: "#b91c1c", fontSize: "8.5pt" }}> Open finding: check with the document owner.</span>}
                          </li>
                        ))
                        return kind === "steps" ? (
                          <ol style={{ paddingLeft: "16pt", listStyle: "decimal" }}>{items}</ol>
                        ) : (
                          <ul style={{ paddingLeft: "14pt", listStyle: "disc" }}>{items}</ul>
                        )
                      })()
                    )}
                  </section>
                )
              })}
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
