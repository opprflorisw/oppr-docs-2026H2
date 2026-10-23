// Grounding check for generated Wiki content. Pure functions, no Convex
// imports, so the rule is easy to read and to test.
//
// Every point the model writes must cite at least one excerpt that was
// actually provided, and every number or entity code in the point must
// literally appear in the text of the excerpts it cites. A point that fails
// either check is dropped, never shown. This is what makes "every sentence is
// grounded in Published content" a property of the code, not of the prompt.

export interface ProvidedExcerpt {
  key: string
  text: string
}

export interface RawPoint {
  text: string
  sources: string[]
}

export interface CheckedPoint {
  text: string
  sources: string[]
}

export interface DroppedPoint {
  text: string
  reason: "no-valid-source" | "unsupported-token"
  detail?: string
}

// Numbers (40, 0.5, 1,5, 215) and entity codes (EXT-201, PX-4400,
// EXT-OPS-SOP-0001). These are the facts most dangerous to get wrong.
const TOKEN_RE = /[A-Z]{2,}(?:-[A-Z0-9]+)*-\d+|\d+(?:[.,]\d+)?/g

function normalise(text: string): string {
  return text.replace(/(\d),(\d)/g, "$1.$2").toUpperCase()
}

export function factTokens(text: string): string[] {
  return Array.from(new Set(normalise(text).match(TOKEN_RE) ?? []))
}

export function checkPoint(
  point: RawPoint,
  provided: Map<string, ProvidedExcerpt>,
): { ok: true; point: CheckedPoint } | { ok: false; dropped: DroppedPoint } {
  const text = point.text.trim()
  const sources = Array.from(
    new Set(point.sources.map((s) => s.trim()).filter((s) => provided.has(s))),
  )
  if (!text || sources.length === 0) {
    return { ok: false, dropped: { text, reason: "no-valid-source" } }
  }
  const cited = normalise(sources.map((s) => provided.get(s)!.text).join("\n"))
  for (const token of factTokens(text)) {
    if (!cited.includes(token)) {
      return {
        ok: false,
        dropped: { text, reason: "unsupported-token", detail: token },
      }
    }
  }
  return { ok: true, point: { text, sources } }
}
