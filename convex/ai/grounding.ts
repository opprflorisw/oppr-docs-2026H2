// Grounding check for generated Wiki content. Pure functions, no Convex
// imports, so the rule is easy to read and to test (devChecks check G).
//
// Every point the model writes must pass all of these, or it is dropped and
// never shown:
//   1. It cites at least one excerpt that was actually provided.
//   2. Every entity code in it (PX-4400, EXT-OPS-SOP-0001, DN110, M8) occurs
//      in the cited excerpts or in the cited documents' labels.
//   3. Every quantity in it is supported by the cited excerpts: the same
//      number with a compatible unit (40 Nm is not 40 °C), and for a range
//      (170-220 °C) the same range or both ends. Number words ("fifteen"),
//      unit spellings ("percent", "degrees"), decimal commas and dash
//      variants are normalised first.
//   4. Enough of its wording occurs in the cited excerpts, so a point that
//      cites an unrelated passage which merely contains the same number is
//      caught.
//   5. It keeps the polarity of what it cites: a positive point needs a
//      positive supporting sentence, a "never / do not" point a negated one.
//   6. It keeps direction, restrictions and order: above/below, increase/
//      reduce, start/stop, on/off, "only / unless / except", and what comes
//      before what.
// These are lexical checks, not a full reading of meaning: they catch
// invented facts, wrong numbers and codes and the common meaning flips. A
// rare change of meaning that keeps all the wording can still pass. It is
// deliberately strict: a
// wrongly dropped point costs a little coverage, a wrongly kept one can hurt
// someone on the floor.

export interface ProvidedExcerpt {
  key: string
  text: string
  /** The cited document's label (naming code, version, title). Codes in it count as cited. */
  label?: string
}

export interface RawPoint {
  text: string
  sources: string[]
}

export interface CheckedPoint {
  text: string
  sources: string[]
}

export type DropReason =
  | "no-valid-source"
  | "unsupported-token"
  | "weak-support"
  | "negation-mismatch"
  | "meaning-mismatch"

export interface DroppedPoint {
  text: string
  reason: DropReason
  detail?: string
}

// ---- Normalisation ----------------------------------------------------------

const SMALL: Record<string, number> = {
  ZERO: 0, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8,
  NINE: 9, TEN: 10, ELEVEN: 11, TWELVE: 12, THIRTEEN: 13, FOURTEEN: 14,
  FIFTEEN: 15, SIXTEEN: 16, SEVENTEEN: 17, EIGHTEEN: 18, NINETEEN: 19,
}
const DIGIT: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9,
}
const TENS: Record<string, number> = {
  TWENTY: 20, THIRTY: 30, FORTY: 40, FIFTY: 50, SIXTY: 60, SEVENTY: 70,
  EIGHTY: 80, NINETY: 90,
}

function wordsToDigits(t: string): string {
  // Tens, units and teens cover what models actually write. A lone "one"
  // stays a word: it is a pronoun far more often than a quantity.
  return t
    .replace(
      /\b(TWENTY|THIRTY|FORTY|FIFTY|SIXTY|SEVENTY|EIGHTY|NINETY)(?:[- ](ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE))?\b/g,
      (_, tens: string, unit?: string) => String(TENS[tens] + (unit ? DIGIT[unit] : 0)),
    )
    .replace(
      /\b(ZERO|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|THIRTEEN|FOURTEEN|FIFTEEN|SIXTEEN|SEVENTEEN|EIGHTEEN|NINETEEN)\b/g,
      (w: string) => String(SMALL[w]),
    )
    .replace(/\b(?:A|ONE) HUNDRED\b/g, "100")
    .replace(/\b(\d) HUNDRED\b/g, (_, d: string) => String(Number(d) * 100))
}

const NUM = String.raw`\d+(?:\.\d+)?`

/** Canonical upper-case form used for every comparison. */
export function normalise(text: string): string {
  let t = text.normalize("NFKC")
  // Every dash and minus variant becomes "-"; non-breaking spaces become " ".
  t = t.replace(/[‐-―−﹘﹣－]/g, "-")
  t = t.replace(/[   ]/g, " ")
  t = t.toUpperCase()
  t = wordsToDigits(t)
  // Decimal comma: 1,5 -> 1.5
  t = t.replace(/(\d),(\d)/g, "$1.$2")
  // Ranges: "between 170 and 220", "170 to 220", "170 - 220" -> "170-220".
  t = t.replace(new RegExp(String.raw`\bBETWEEN (${NUM}) AND (${NUM})`, "g"), "$1-$2")
  t = t.replace(new RegExp(String.raw`(?<![\w.-])(${NUM})\s*-\s*(${NUM})(?![\w.])`, "g"), "$1-$2")
  t = t.replace(new RegExp(String.raw`(?<![\w.-])(${NUM}) (?:TO|UNTIL) (${NUM})(?![\w.])`, "g"), "$1-$2")
  return t
}

// ---- Fact extraction --------------------------------------------------------

// Dashed codes (EXT-201, PX-4400, EXT-OPS-SOP-0001) and short alphanumeric
// codes (M8, DN110, PN16, V2). Both must be cited literally.
const CODE_RE = /\b[A-Z]{2,}(?:-[A-Z0-9]+)*-\d+[A-Z0-9]*\b|\b[A-Z]{1,4}\d+[A-Z0-9]*\b/g
const QTY_RE = new RegExp(String.raw`(?<![\d.])(${NUM})(?:-(${NUM}))?(?![\d.])`, "g")

// Unit spellings after a number, mapped to one canonical form. Longer first.
const UNITS: [RegExp, string][] = [
  [/^(?:N\s*[·.*]?\s*M\b|NEWTON[- ]?MET(?:RE|ER)S?\b)/, "NM"],
  [/^(?:°\s*C\b|DEG(?:REES?)?\s*(?:C|CELSIUS)\b|DEGREES?\b|°)/, "°C"],
  [/^(?:%|PER\s*CENT\b|PERCENT\b)/, "%"],
  [/^MBAR\b/, "MBAR"],
  [/^BAR\b/, "BAR"],
  [/^(?:MM|MILLIMET(?:RE|ER)S?)\b/, "MM"],
  [/^(?:CM|CENTIMET(?:RE|ER)S?)\b/, "CM"],
  [/^M\/MIN\b/, "M/MIN"],
  [/^KG\/H\b/, "KG/H"],
  [/^(?:KG|KILOS?|KILOGRAMS?)\b/, "KG"],
  [/^(?:G|GRAMS?)\b/, "G"],
  [/^(?:MINUTES?|MINS?)\b/, "MIN"],
  [/^(?:SECONDS?|SECS?|S)\b/, "S"],
  [/^(?:HOURS?|HRS?|H)\b/, "H"],
  [/^DAYS?\b/, "DAY"],
  [/^WEEKS?\b/, "WEEK"],
  [/^MONTHS?\b/, "MONTH"],
  [/^RPM\b/, "RPM"],
  [/^KW\b/, "KW"],
  [/^(?:VOLTS?|V)\b/, "V"],
  [/^HZ\b/, "HZ"],
  [/^(?:LITRES?|LITERS?|L)\b/, "L"],
  [/^(?:MET(?:RE|ER)S?|M)\b/, "M"],
]

export interface Quantity {
  low: number
  high: number
  unit: string | null
  raw: string
}

// Words that may follow a number without being what is counted.
const NOT_A_NOUN = new Set(
  "AND OR TO AT IN ON OF FOR THE A AN PER BY WITH FROM THAN UNTIL WHEN AFTER BEFORE IS ARE".split(" "),
)

function readUnit(after: string): string | null {
  const s = after.replace(/^\s+/, "")
  for (const [re, canon] of UNITS) if (re.test(s)) return canon
  // Otherwise the counted noun is the unit ("15 PIPES"), compared by stem, so
  // "15 pipes" in a source never supports "15 minutes".
  const noun = /^([A-Z]{3,})/.exec(s)?.[1]
  if (noun && !NOT_A_NOUN.has(noun)) return `#${noun.slice(0, 4)}`
  return null
}

function extract(canon: string): { codes: string[]; quantities: Quantity[] } {
  const codes = Array.from(new Set(canon.match(CODE_RE) ?? []))
  // Blank out codes so their digits are not read as quantities.
  const rest = canon.replace(CODE_RE, (m) => " ".repeat(m.length))
  const quantities: Quantity[] = []
  for (const m of rest.matchAll(QTY_RE)) {
    const low = Number(m[1])
    const high = m[2] !== undefined ? Number(m[2]) : low
    const unit = readUnit(rest.slice((m.index ?? 0) + m[0].length))
    quantities.push({ low, high, unit, raw: unit ? `${m[0]} ${unit}` : m[0] })
  }
  return { codes, quantities }
}

/** Codes and quantities in a text, in canonical form. */
export function factTokens(text: string): string[] {
  const f = extract(normalise(text))
  return Array.from(new Set([...f.codes, ...f.quantities.map((q) => q.raw)]))
}

// A bare number on either side (a unit in a table header, say) is compatible
// with any unit; two stated units must be equal.
const unitOk = (a: string | null, b: string | null) => a === null || b === null || a === b

function hasValue(v: number, unit: string | null, cited: Quantity[]): boolean {
  return cited.some((c) => unitOk(unit, c.unit) && (c.low === v || c.high === v))
}

function quantitySupported(q: Quantity, cited: Quantity[]): boolean {
  if (q.low === q.high) return hasValue(q.low, q.unit, cited)
  const sameRange = cited.some((c) => c.low === q.low && c.high === q.high && unitOk(q.unit, c.unit))
  return sameRange || (hasValue(q.low, q.unit, cited) && hasValue(q.high, q.unit, cited))
}

// ---- Wording support and polarity ---------------------------------------------

const STOP = new Set(
  ("THE AND FOR WITH THAT THIS FROM INTO ONTO WHEN THEN THAN THEY THEM THEIR " +
    "THERE HERE YOUR YOURS EACH EVERY WHILE ABOUT UNTIL " +
    "ALSO MUST SHOULD WILL WOULD COULD HAVE HAS HAD BEEN BEING WERE WHICH " +
    "WHERE WHAT WHO WHOM WHOSE SOME SUCH OTHER VERY JUST " +
    "SAYS STATES ACCORDING DOCUMENT DOCUMENTS MANUAL STEP STEPS MAKE SURE NEED " +
    "NEEDS KEEP").split(" "),
)

/** Content-word stems of a text, for overlap scoring. */
export function contentStems(text: string): string[] {
  return stems(normalise(text))
}

function stems(canon: string): string[] {
  const words: string[] = canon.match(/[A-Z]+/g) ?? []
  return words
    .filter((w) => w.length >= 4 && !STOP.has(w))
    .map((w) => w.slice(0, 5))
}

const NEG_RE = /\b(?:NOT|NEVER|NO|NOBODY|NOTHING|NEITHER|NOR|CANNOT|WITHOUT)\b|N['’]T\b/

/** Share of the point's content words that occur in the cited text (0..1). */
export function support(point: string, cited: string): number {
  const p = stems(normalise(point))
  if (p.length === 0) return 1
  const c = new Set(stems(normalise(cited)))
  return p.filter((s) => c.has(s)).length / p.length
}

// Below this share of shared content words, the cited passage does not say
// what the point says. Calibrated on real Claude output for the seed (see
// docs/test-set.md, check G): grounded paraphrases score well above it, a
// point citing an unrelated passage scores near 0.
export const MIN_SUPPORT = 0.4

// Table rows arrive as "cell | cell | cell"; each cell is its own statement,
// so a "not" in one cell never counts against another.
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+|\s+\|\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// ---- The check ----------------------------------------------------------------

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
  const excerpts = sources.map((s) => provided.get(s)!)
  const citedText = excerpts.map((e) => e.text).join("\n")
  const cited = extract(normalise(citedText))
  const knownCodes = new Set([
    ...cited.codes,
    ...extract(normalise(excerpts.map((e) => e.label ?? "").join("\n"))).codes,
  ])
  const mine = extract(normalise(text))

  for (const code of mine.codes) {
    if (!knownCodes.has(code)) {
      return { ok: false, dropped: { text, reason: "unsupported-token", detail: code } }
    }
  }
  for (const q of mine.quantities) {
    if (!quantitySupported(q, cited.quantities)) {
      return { ok: false, dropped: { text, reason: "unsupported-token", detail: q.raw } }
    }
  }

  const share = support(text, citedText)
  if (share < MIN_SUPPORT) {
    return {
      ok: false,
      dropped: {
        text,
        reason: "weak-support",
        detail: `only ${Math.round(share * 100)}% of its words are in the cited passages`,
      },
    }
  }

  // Polarity, per sentence of the point: among the cited sentences that best
  // support it, at least one must agree with it on "not / never".
  const citedSentences = excerpts
    .flatMap((e) => sentences(e.text))
    .map((s) => ({ s, neg: NEG_RE.test(normalise(s)) }))
  for (const own of sentences(text)) {
    const scored = citedSentences.map((c) => ({ ...c, score: support(own, c.s) }))
    const best = Math.max(0, ...scored.map((x) => x.score))
    const supporting = scored.filter((x) => x.score >= Math.max(MIN_SUPPORT, best - 0.25))
    const ownNeg = NEG_RE.test(normalise(own))
    // A short negated statement ("Purge not finished") that the point fully
    // contains also backs a negated point, even if a longer cell scores higher.
    const containedNegation =
      ownNeg && citedSentences.some((c) => c.neg && support(c.s, own) >= 0.99)
    if (supporting.length > 0 && !containedNegation && !supporting.some((x) => x.neg === ownNeg)) {
      return {
        ok: false,
        dropped: {
          text,
          reason: "negation-mismatch",
          detail: ownNeg ? "the point negates what the passage says" : "the passage says not or never",
        },
      }
    }
  }

  // Direction, restriction and order, per sentence of the point, against the
  // cited sentences that best support it. These catch meaning flips that keep
  // most of the wording: above/below, increase/reduce, on/off, dropping
  // "only", and swapping what comes before what.
  for (const own of sentences(text)) {
    const scored = citedSentences.map((c) => ({ ...c, score: support(own, c.s) }))
    const best = Math.max(0, ...scored.map((x) => x.score))
    const supporting = scored.filter((x) => x.score >= Math.max(MIN_SUPPORT, best - 0.25)).map((x) => x.s)
    if (supporting.length === 0) continue
    const problem = meaningFlip(own, supporting, citedText) ?? labelledValueMismatch(own, citedText)
    if (problem) return { ok: false, dropped: { text, reason: "meaning-mismatch", detail: problem } }
  }

  return { ok: true, point: { text, sources } }
}

// Opposites: a point using one side needs a supporting sentence that uses
// that side too, when the supporting sentences only use the other side.
const OPPOSITES: [RegExp, RegExp, string][] = [
  [/\bABOVE\b|\bOVER\b|\bHIGHER\b|\bMORE THAN\b|\bAT LEAST\b|\bMINIMUM\b/, /\bBELOW\b|\bUNDER\b|\bLOWER THAN\b|\bLESS THAN\b|\bAT MOST\b|\bMAXIMUM\b/, "above / below"],
  [/\bINCREAS\w*|\bRAIS\w*|\bRAMP UP\b/, /\bREDUC\w*|\bDECREAS\w*|\bLOWER(?:S|ED|ING)?\b(?! THAN)|\bRAMP DOWN\b/, "increase / reduce"],
  [/\bSTART\w*|\bSWITCH ON\b|\bTURN ON\b|\bOPEN\w*/, /\bSTOP\w*|\bSWITCH OFF\b|\bTURN OFF\b|\bCLOS\w*|\bSHUT\w*/, "start / stop"],
  [/\bON\b(?= *(?:[.,;]|$| DURING| WHILE| UNTIL| AT ALL))/, /\bOFF\b/, "on / off"],
  [/\bBEFORE\b|\bFIRST\b/, /\bAFTER\b|\bLAST\b/, "before / after"],
  [/\bMINIMUM\b|\bMIN\b/, /\bMAXIMUM\b|\bMAX\b/, "minimum / maximum"],
  [/\bHOT\b|\bWARM\b|\bOPERATING TEMPERATURE\b/, /\bCOLD\b|\bCOOL(?:ED)?\b|\bAMBIENT\b/, "hot / cold"],
  [/\bSLOW\w*/, /\bFAST\w*|\bQUICK\w*/, "slow / fast"],
]

// Words that narrow or soften a statement. A point may only use one when a
// supporting sentence does too: "at least 15 minutes" is not "about 15
// minutes", "usually means" is not "means", "minimum" is not a bare value.
const QUALIFIERS: [RegExp, string][] = [
  [/\bUSUALLY\b|\bTYPICALLY\b|\bGENERALLY\b|\bOFTEN\b|\bNORMALLY\b/, "usually"],
  [/\bLIKELY\b|\bPROBABLY\b|\bPOSSIBLY\b|\bMAY BE\b|\bMIGHT\b/, "likely"],
  [/\bALWAYS\b/, "always"],
  [/\bAT LEAST\b|\bMINIMUM\b|\bNO LESS THAN\b/, "at least"],
  [/\bAT MOST\b|\bMAXIMUM\b|\bNO MORE THAN\b|\bUP TO\b/, "at most"],
  [/\bEXACTLY\b/, "exactly"],
]
const RESTRICTIONS = /\bONLY\b|\bUNLESS\b|\bEXCEPT\b/

function meaningFlip(point: string, supporting: string[], allCited: string): string | null {
  const p = normalise(point)
  const cs = supporting.map(normalise)
  // Added restrictions and qualifiers are checked against everything cited:
  // a table row's "Minimum:" header sits in a neighbouring cell.
  const all = normalise(allCited)
  for (const [a, b, label] of OPPOSITES) {
    for (const [mine, other] of [[a, b], [b, a]] as const) {
      if (mine.test(p) && !mine.test(all) && cs.some((c) => other.test(c))) {
        return `the source says the opposite (${label})`
      }
    }
  }
  if (cs.every((c) => RESTRICTIONS.test(c)) && !RESTRICTIONS.test(p)) {
    return "the point drops a restriction (only / unless / except)"
  }
  if (RESTRICTIONS.test(p) && !RESTRICTIONS.test(all)) {
    return "the point adds a restriction (only / unless / except)"
  }
  for (const [re, label] of QUALIFIERS) {
    if (re.test(p) && !re.test(all)) return `the point adds "${label}"`
  }
  // "A or B" in the source is not "A and B".
  if (cs.some((c) => /\bOR\b/.test(c)) && !/\bOR\b/.test(p) && /\bAND\b/.test(p) && !cs.some((c) => /\bAND\b/.test(c))) {
    return "the point turns \"or\" into \"and\""
  }
  // Order around "before" / "after": what the point puts first must also come
  // first in the source.
  for (const word of ["BEFORE", "AFTER"]) {
    const pi = p.indexOf(` ${word} `)
    if (pi < 0) continue
    const pBefore = new Set(stems4(p.slice(0, pi)))
    const pAfter = new Set(stems4(p.slice(pi)))
    for (const c of cs) {
      const ci = c.indexOf(` ${word} `)
      if (ci < 0) continue
      const cBefore = stems4(c.slice(0, ci))
      const cAfter = stems4(c.slice(ci))
      const same = cBefore.filter((x) => pBefore.has(x)).length + cAfter.filter((x) => pAfter.has(x)).length
      const swapped = cBefore.filter((x) => pAfter.has(x)).length + cAfter.filter((x) => pBefore.has(x)).length
      if (swapped > same) return `the point reverses the order (${word.toLowerCase()})`
    }
  }
  return null
}

function stems4(canon: string): string[] {
  const words: string[] = canon.match(/[A-Z]+/g) ?? []
  return words.filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 4))
}


// ---- Tables -------------------------------------------------------------------

/**
 * Table rows are stored as "cell | cell | cell", and the column headers live
 * in the first row of the table. Without them "Barrel temperature | 170 °C |
 * 220 °C" cannot support "minimum 170 °C". This puts each header in front of
 * its cell ("Parameter: Barrel temperature | Minimum: 170 °C | Maximum:
 * 220 °C"), for the model to read and for the check to verify. Input must be
 * one document version's chunks in reading order; returns the texts in the
 * same order.
 */
export function withTableHeaders(chunks: { text: string; section: string | null }[]): string[] {
  const out: string[] = []
  let header: string[] | null = null
  let prevWasRow = false
  let prevSection: string | null = null
  for (const c of chunks) {
    const cells = c.text.split(" | ")
    const isRow = cells.length > 1
    if (!isRow) {
      header = null
      prevWasRow = false
      prevSection = c.section
      out.push(c.text)
      continue
    }
    if (!prevWasRow || c.section !== prevSection || !header || header.length !== cells.length) {
      // First row of a table: it is the header.
      header = cells.map((h) => h.trim())
      out.push(c.text)
    } else {
      out.push(cells.map((cell, i) => (header![i] ? `${header![i]}: ${cell.trim()}` : cell.trim())).join(" | "))
    }
    prevWasRow = true
    prevSection = c.section
  }
  return out
}

const LABELS = ["MINIMUM", "MAXIMUM"] as const

/**
 * A value the point labels as minimum or maximum must sit in that column of
 * the cited table row: "170 °C maximum" fails when the row says
 * "Maximum: 220 °C".
 */
export function labelledValueMismatch(point: string, cited: string): string | null {
  const p = normalise(point)
  const c = normalise(cited)
  for (const label of LABELS) {
    const cellRe = new RegExp(String.raw`\b${label}: ([^|\n]*)`, "g")
    const cells = Array.from(c.matchAll(cellRe)).map((m) => m[1])
    if (cells.length === 0) continue
    const nearRe = new RegExp(
      String.raw`\b${label}\b[^0-9|]{0,12}?(${NUM})|(${NUM})\s*[^0-9\s|,;.]{0,6}\s*${label}\b`,
      "g",
    )
    for (const m of p.matchAll(nearRe)) {
      const value = m[1] ?? m[2]
      if (!cells.some((cell) => new RegExp(String.raw`(?<![\d.])${value.replace(".", "\\.")}(?![\d.])`).test(cell))) {
        return `${value} is not the ${label.toLowerCase()} in the cited table`
      }
    }
  }
  return null
}
