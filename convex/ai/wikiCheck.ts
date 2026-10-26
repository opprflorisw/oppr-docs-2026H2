// Check against Published and Find sources (docs/specs/wiki-upgrade.md 3.4,
// 3.5, 5.1, 5.4; CONTEXT.md: Check against Published). A check is evidence,
// never approval: its verdicts only decide whether a block may be applied, and
// a claim that only the AI judge supports always waits for a second Engineer.
//
// checkText, in order:
//   1. Code splits the text into claims: sentences, then ";", then " and " /
//      " en " when both sides carry a verb or both carry a number. An LLM split
//      runs only for a sentence that is still over 40 words. At most 12 claims.
//   2. Per claim, the live Published passages that match it best, from the
//      whole library (one batched embed and a vector search per claim; words
//      when the embedding is unavailable or in stub mode). Drafts never take part.
//   3. Code first. checkPoint against one passage gives Supported. A value in
//      the same unit or code family that differs, or a negation flip, gives
//      Differs. No model runs for these.
//   4. One AI judge call for the claims code could not settle (often none).
//      Every judge quote is verified in its passage by code. Cached by the
//      claims and the passage versions; embedding and search always run.
//   5. An open contradiction Finding on a supporting passage gives Already
//      disputed. Two retrieved passages that disagree set a conflict pair, which
//      can start the real Consistency check. A check never creates a Finding.
//   6. The evidence is stored in wikiChecks and the block gets its status.
import { ConvexError, v } from "convex/values"
import { z } from "zod"
import { action, internalMutation, internalQuery, type ActionCtx } from "../_generated/server"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import { requireUser, requireUserId } from "../lib/auth"
import { requireEngineerOrAdmin } from "../lib/roles"
import { isPublished, publishedVersion } from "../lib/published"
import { resolveScope } from "../lib/scope"
import { meter, type MeterSpec } from "../lib/aiMeter"
import { recordAiAction } from "../lib/aiBudget"
import {
  MAX_CLAIMS,
  MAX_WRITTEN_CHARS,
  normaliseForKey,
  pointKey,
  type BlockStatus,
  type CheckResult,
  type Citation,
  type ClaimPassage,
  type ClaimResult,
  type Disputed,
  type FindSourcesResult,
  type FoundSource,
  type Point,
  type SearchStats,
} from "../lib/wikiTypes"
import { claimResultValidator, searchStatsValidator } from "../lib/wikiValidators"
import { openFindingsTouching, stillStands } from "../findings"
import type { Passage } from "../mcp/data"
import { checkPoint, normalise, support, type ProvidedExcerpt } from "./grounding"
import { factConflict, features, judgeClaims, type Features, type JudgeClaimInput, type JudgedClaim } from "./consistency"
import { searchPassages } from "./guidedChat"
import { CLAUDE_MODEL, claudeConfigured, claudeJson, describeClaudeError } from "./llm"
import { embedText, geminiConfigured } from "./gemini"
import { searchChunks } from "./vectorSearch"

// ---- Tuning ------------------------------------------------------------------------

/** Vector hits asked per claim, before the live Published filter. */
const VECTOR_LIMIT = 48
/** Below this cosine score a passage is not about the claim. */
const MIN_SCORE = 0.55
/** Word-overlap score for the fallback search (share of the claim's terms). */
const MIN_LEXICAL = 0.4
/** Passages kept per claim. */
const TOP_PASSAGES = 4
/** A claim this long is split by the LLM. */
const LONG_SENTENCE_WORDS = 40
/** A differing value only counts when the passage is about the same thing. */
const DIFFERS_MIN_SUPPORT = 0.3
/** Characters of a passage shown to the judge. */
const JUDGE_PASSAGE_CHARS = 1500
/** Find sources: passages searched and Documents returned. */
const FIND_PASSAGES = 40
const FIND_DOCUMENTS = 12

const stubMode = () => process.env.OPPR_AI_STUB === "1"
/** Judge verdicts a cached check may give again (Not covered is recounted every time). */
const REUSABLE = new Set<ClaimResult["verdict"]>(["supportedByJudge", "partly", "differs"])

// ---- Claims (pure; exported for dev check W3) ---------------------------------------

const VERBS = new Set(
  [
    // English: auxiliaries and the instructions SOPs give
    "is", "are", "was", "were", "be", "been", "has", "have", "had", "must", "should", "shall", "will", "can",
    "may", "might", "cannot", "do", "does", "need", "needs", "require", "requires", "stay", "stays", "keep",
    "wear", "check", "set", "close", "open", "lock", "unlock", "stop", "start", "switch", "turn", "put", "use",
    "clean", "inspect", "measure", "report", "inform", "call", "press", "remove", "replace", "fill", "empty",
    "cool", "heat", "wait", "hold", "release", "record", "tighten", "loosen", "fit", "move", "place", "take",
    "make", "leave", "run", "purge", "flush", "drain", "test", "verify", "sign", "log", "label", "isolate",
    "disconnect", "connect", "apply", "follow", "read", "calibrate", "store", "send", "return", "go", "get",
    // Dutch
    "zijn", "waren", "moet", "moeten", "mag", "mogen", "kan", "kunnen", "wordt", "worden", "heeft", "hebben",
    "draag", "draagt", "houd", "houdt", "controleer", "zet", "sluit", "stop", "meld", "bel", "gebruik",
    "reinig", "meet", "vul", "wacht", "kalibreer",
  ],
)

function wordsOf(s: string): string[] {
  return s.toLowerCase().match(/[\p{L}]+|\d+(?:[.,]\d+)?/gu) ?? []
}

function hasVerb(s: string): boolean {
  return wordsOf(s).some((w) => VERBS.has(w) || (w.endsWith("s") && VERBS.has(w.slice(0, -1))) || (w.endsWith("es") && VERBS.has(w.slice(0, -2))))
}

const hasNumber = (s: string) => /\d/.test(s)

const tidy = (s: string) => s.trim().replace(/^[,;:\s]+|[,;:\s]+$/g, "")

/** Sentences of the Engineer's text, with list markers removed. */
export function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .flatMap((l) => l.split(/(?<=[.!?])\s+(?=["“'(]?[\p{Lu}\d])/u))
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\d]/u.test(s))
}

/** "Wear gloves and keep the guard closed" -> two claims; "170 and 220 °C" stays one. */
function splitCoordinated(s: string): string[] {
  const re = /\s+(?:and|en)\s+/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    const left = tidy(s.slice(0, m.index))
    const right = tidy(s.slice(m.index + m[0].length))
    if (wordsOf(left).length < 2 || wordsOf(right).length < 2) continue
    // A range ("between 170 and 220 °C", "170 en 220") is one value.
    if (/\d\s*$/.test(left) && /^\d/.test(right)) continue
    if (/\b(?:between|tussen)\b[^,;]*$/i.test(left)) continue
    const both = (hasNumber(left) && hasNumber(right)) || (hasVerb(left) && hasVerb(right))
    if (both) return [left, ...splitCoordinated(right)]
  }
  return [tidy(s)]
}

/** One sentence into claims by code: ";" first, then coordinated clauses. */
export function splitClaim(sentence: string): string[] {
  return sentence
    .split(/\s*;\s*/)
    .filter((p) => /[\p{L}\d]/u.test(p))
    .flatMap(splitCoordinated)
    .filter(Boolean)
}

export interface SplitClaim {
  text: string
  /** Index of the sentence it came from. */
  sentence: number
}

export function splitClaims(text: string): { sentences: string[]; claims: SplitClaim[] } {
  const sentences = splitSentences(text)
  const claims = sentences.flatMap((s, i) => splitClaim(s).map((c) => ({ text: c, sentence: i })))
  return { sentences, claims }
}

// ---- Passages ------------------------------------------------------------------------

export interface Found {
  chunkId: Id<"chunks">
  documentId: Id<"documents">
  namingCode: string
  title: string
  version: number
  section: string | null
  text: string
  score: number
  inScope: boolean
}

const squash = (s: string) => normalise(s).replace(/\s+/g, " ").trim()

/** Sentences or table cells of a passage, verbatim. */
function passageSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** The passage sentence that best matches the claim (a short passage is quoted whole). */
function bestQuote(claim: string, text: string, prefer?: (s: string) => boolean): string {
  if (text.length <= 280) return text.trim()
  const ss = passageSentences(text)
  const pool = prefer ? ss.filter(prefer) : ss
  let best = (pool[0] ?? ss[0] ?? text).trim()
  let score = -1
  for (const s of pool.length ? pool : ss) {
    const sc = support(claim, s)
    if (sc > score) {
      score = sc
      best = s
    }
  }
  return best.slice(0, 600)
}

const label = (p: Found) => `${p.namingCode} v${p.version} ${p.title}`

function excerpt(p: Found): ProvidedExcerpt {
  return { key: p.chunkId, text: p.text, label: label(p) }
}

/** Passages in the Wiki's Scope first, then by score. */
const byScopeThenScore = (a: Found, b: Found) => Number(b.inScope) - Number(a.inScope) || b.score - a.score

// ---- The code stage (pure; exported for dev check W3) ---------------------------------

const RANGE = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/

function inRange(value: string, ranges: Set<string>): boolean {
  const n = Number(value)
  if (Number.isNaN(n)) return false
  for (const r of ranges) {
    const m = RANGE.exec(r)
    if (m && n >= Number(m[1]) && n <= Number(m[2])) return true
  }
  return false
}

const readableUnit = (u: string) => (u === "/FREQ" ? "" : u.replace(/^#/, "").toLowerCase().replace(/^°c$/, "°C").replace(/^nm$/, "Nm"))
const FREQ_WORDS: Record<string, string> = { DAY: "once a day", SHIFT: "every shift", WEEK: "once a week", MONTH: "once a month" }
const showValues = (unit: string, values: Set<string>) =>
  unit === "/FREQ" ? [...values].map((x) => FREQ_WORDS[x] ?? x.toLowerCase()).join(" or ") : `${[...values].join(" or ")} ${readableUnit(unit)}`.trim()

/**
 * A value of the claim that the passage gives differently: the same unit (or
 * code family, or how often) with another value. A value inside the
 * passage's range is not a difference. Returns what each side says.
 */
export function valueConflict(claim: Features, passage: Features): { mine: string; theirs: string; unit: string } | null {
  for (const [unit, xs] of claim.quantities) {
    const ys = passage.quantities.get(unit)
    if (!ys) continue
    if ([...xs].some((x) => !ys.has(x) && !inRange(x, ys))) return { mine: showValues(unit, xs), theirs: showValues(unit, ys), unit }
  }
  for (const [family, xs] of claim.codes) {
    const ys = passage.codes.get(family)
    if (!ys) continue
    if ([...xs].some((x) => !ys.has(x))) return { mine: [...xs].join(", "), theirs: [...ys].join(", "), unit: family }
  }
  return null
}

export type CodeVerdict =
  | { verdict: "supported"; passage: Found; quote: string; reason: string }
  | { verdict: "differs"; passage: Found; quote: string; reason: string }
  | null

/** Settles a claim by code alone, or returns null for the judge. */
export function codeVerdict(claim: string, passages: Found[]): CodeVerdict {
  const ordered = [...passages].sort(byScopeThenScore)
  const negations: Found[] = []
  for (const p of ordered) {
    const r = checkPoint({ text: claim, sources: [p.chunkId] }, new Map([[p.chunkId as string, excerpt(p)]]))
    if (r.ok) {
      return { verdict: "supported", passage: p, quote: bestQuote(claim, p.text), reason: `${p.namingCode} v${p.version} says this.` }
    }
    if ("dropped" in r && r.dropped.reason === "negation-mismatch") negations.push(p)
  }
  const mine = features(claim)
  for (const p of ordered) {
    if (support(claim, p.text) < DIFFERS_MIN_SUPPORT) continue
    const c = valueConflict(mine, features(p.text))
    if (!c) continue
    const quote = bestQuote(claim, p.text, (s) => valueConflict(mine, features(s)) != null)
    return {
      verdict: "differs",
      passage: p,
      quote,
      reason: `You wrote ${c.mine}; ${p.namingCode} v${p.version} says ${c.theirs}.`,
    }
  }
  const neg = negations[0]
  if (neg) {
    return {
      verdict: "differs",
      passage: neg,
      quote: bestQuote(claim, neg.text),
      reason: `${neg.namingCode} v${neg.version} says the opposite (not or never).`,
    }
  }
  return null
}

// ---- Block status (spec 3.5 step 3) ----------------------------------------------------

export interface Settled {
  result: ClaimResult
  /** The passage a supported, judge-supported or disputed claim rests on. */
  rests: Found | null
  /** Disputed only: the claim states both values, so it may be applied. */
  statesBoth: boolean
  disputed: Disputed | null
  /** Disputed and stating both values: the other side's passage, cited too. */
  also?: Citation[]
  /** The other side's Document is outside the Wiki's Scope. */
  alsoOutside?: boolean
}

export function blockStatus(claims: Settled[], opts: { confirmByAnother: boolean; scoped: boolean }): BlockStatus {
  if (claims.length === 0) return "unchecked"
  const v = claims.map((c) => c.result.verdict)
  if (v.includes("differs") || claims.some((c) => c.result.verdict === "disputed" && !c.statesBoth)) return "contradicts"
  if (v.includes("notCovered") || v.includes("partly")) return "notCovered"
  // A Wiki states only its Scope: a claim resting outside it cannot be applied yet.
  if (opts.scoped && claims.some((c) => (c.rests && !c.rests.inScope) || (c.statesBoth && c.alsoOutside))) return "notCovered"
  if (v.includes("supportedByJudge") || claims.some((c) => c.result.verdict === "disputed" && c.result.via === "judge")) {
    return "awaitingConfirm"
  }
  return opts.confirmByAnother ? "awaitingConfirm" : "checked"
}

function citationOf(p: Found): Citation {
  return { chunkId: p.chunkId, documentId: p.documentId, namingCode: p.namingCode, version: p.version, section: p.section }
}

function uniqueCitations(cs: Citation[]): Citation[] {
  return [...new Map(cs.map((c) => [c.chunkId as string, c])).values()]
}

/**
 * The block's points: one per sentence with the citations of its claims. A
 * sentence split into several claims stays one point only when checkPoint
 * still passes on the whole sentence; otherwise each claim is its own point.
 */
export function buildPoints(sentences: string[], split: SplitClaim[], settled: Settled[]): Point[] {
  const out: Point[] = []
  sentences.forEach((sentence, si) => {
    const idx = split.map((c, i) => (c.sentence === si ? i : -1)).filter((i) => i >= 0)
    const mine = idx.map((i) => settled[i])
    const rests = [...new Map(mine.filter((s) => s.rests).map((s) => [s.rests!.chunkId as string, s.rests!])).values()]
    const disputed = mine.find((s) => s.disputed && s.statesBoth)?.disputed ?? null
    const whole =
      idx.length <= 1 ||
      (rests.length > 0 &&
        mine.every((s) => s.result.verdict === "supported" && s.result.via === "code") &&
        checkPoint(
          { text: sentence, sources: rests.map((r) => r.chunkId as string) },
          new Map(rests.map((r) => [r.chunkId as string, excerpt(r)])),
        ).ok)
    if (whole) {
      out.push({
        text: sentence,
        pointKey: pointKey(sentence),
        citations: uniqueCitations([...rests.map(citationOf), ...mine.flatMap((s) => (s.statesBoth ? s.also ?? [] : []))]),
        ...(disputed ? { disputed } : {}),
      })
      return
    }
    for (const i of idx) {
      const s = settled[i]
      out.push({
        text: split[i].text,
        pointKey: pointKey(split[i].text),
        citations: uniqueCitations([...(s.rests ? [citationOf(s.rests)] : []), ...(s.statesBoth ? s.also ?? [] : [])]),
        ...(s.disputed && s.statesBoth ? { disputed: s.disputed } : {}),
      })
    }
  })
  return out
}

// ---- Queries and mutations ---------------------------------------------------------------

/** The check's frame: who checks, the Wiki's Scope and its confirm setting. */
export const checkContext = internalQuery({
  args: {
    personId: v.id("people"),
    wikiId: v.optional(v.id("wikis")),
    blockId: v.optional(v.string()),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await requireEngineerOrAdmin(ctx, args.personId, "Check in as an Engineer to check text against Published.")
    if (!args.wikiId) return { scopeDocumentIds: [] as Id<"documents">[], confirmByAnother: false }
    const wiki = await ctx.db.get(args.wikiId)
    if (!wiki) throw new ConvexError("This Wiki no longer exists.")
    if (args.blockId) {
      const rows = await ctx.db
        .query("wikiBlocks")
        .withIndex("by_wikiId_and_blockId", (q) => q.eq("wikiId", wiki._id).eq("blockId", args.blockId!))
        .take(5)
      const row = rows.find((r) => r.state === "staged") ?? rows.find((r) => r.state === "live")
      if (!row) throw new ConvexError("This block no longer exists.")
      // A block check verifies the text a person wrote into that block, and
      // nothing else: a generated block is checked when it is built.
      if (row.origin === "generated") throw new ConvexError("Write or edit this block's text first, then check it")
      if ((row.writtenText ?? "").trim() !== args.text.trim()) {
        throw new ConvexError("The text you check is not the block's saved text. Save it, then check again")
      }
    }
    const { published } = await resolveScope(ctx, wiki.scope)
    return {
      scopeDocumentIds: published.map((d) => d._id),
      confirmByAnother: wiki.confirmByAnother ?? wiki.startHere != null,
    }
  },
})

/** Every Published Document at its live version, for the search counts. */
export const libraryDocs = internalQuery({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query("documents").take(2000)
    return docs.filter(isPublished).map((d) => ({
      documentId: d._id,
      version: d.liveVersion as number,
      areaCode: d.location ?? null,
    }))
  },
})

interface DisputeSide {
  documentId: Id<"documents">
  namingCode: string
  title: string
  version: number
  chunkId: Id<"chunks"> | null
  section: string | null
  quote: string
}

/** Open contradiction Findings that still stand, touching these Documents. */
export const openDisputes = internalQuery({
  args: { documentIds: v.array(v.id("documents")) },
  handler: async (ctx, args): Promise<{ _id: Id<"findings">; a: DisputeSide; b: DisputeSide }[]> => {
    const seen = new Map<string, Doc<"findings">>()
    for (const id of [...new Set(args.documentIds)]) {
      for (const f of await openFindingsTouching(ctx, id)) {
        if (f.kind !== "contradiction" || seen.has(f._id)) continue
        if (await stillStands(ctx, f)) seen.set(f._id, f)
      }
    }
    const side = (s: Doc<"findings">["a"]): DisputeSide => ({
      documentId: s.documentId,
      namingCode: s.namingCode,
      title: s.title,
      version: s.version,
      chunkId: s.chunkId,
      section: s.section,
      quote: s.quote,
    })
    return [...seen.values()].map((f) => ({ _id: f._id, a: side(f.a), b: side(f.b) }))
  },
})

export const cachedJudge = internalQuery({
  args: { cacheKey: v.string() },
  handler: async (ctx, args): Promise<ClaimResult[] | null> => {
    const rows = await ctx.db
      .query("wikiChecks")
      .withIndex("by_cacheKey", (q) => q.eq("cacheKey", args.cacheKey))
      .order("desc")
      .take(5)
    return rows.find((r) => r.ok)?.claims ?? null
  },
})

export const saveCheck = internalMutation({
  args: {
    wikiId: v.optional(v.id("wikis")),
    blockId: v.optional(v.string()),
    personId: v.id("people"),
    text: v.string(),
    claims: v.array(claimResultValidator),
    stats: searchStatsValidator,
    cacheKey: v.string(),
    model: v.string(),
    ok: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"wikiChecks">> =>
    await ctx.db.insert("wikiChecks", { ...args, at: Date.now() }),
})

// ---- Shared action steps ---------------------------------------------------------------

type Ctx = ActionCtx

async function libraryIndex(ctx: Ctx) {
  const docs: { documentId: Id<"documents">; version: number; areaCode: string | null }[] = await ctx.runQuery(
    internal.ai.wikiCheck.libraryDocs,
    {},
  )
  const states = await Promise.all(
    docs.map(
      (d): Promise<{ state: string; chunks: number; missing: number }> =>
        ctx.runQuery(internal.findings.versionState, { documentId: d.documentId, version: d.version }),
    ),
  )
  let passages = 0
  let embedded = 0
  let documents = 0
  let searchable = 0
  let notIndexed = 0
  for (const s of states) {
    if (s.state !== "live" || s.chunks === 0) continue
    documents += 1
    passages += s.chunks
    embedded += s.chunks - s.missing
    if (s.chunks - s.missing > 0) searchable += 1
    if (s.missing > 0) notIndexed += 1
  }
  return { docs, documents, searchable, passages, embedded, notIndexed }
}

function stats(index: Awaited<ReturnType<typeof libraryIndex>>, mode: "vector" | "words"): SearchStats {
  return mode === "vector"
    ? { documentsSearched: index.searchable, passagesSearched: index.embedded, documentsNotIndexed: index.notIndexed }
    : { documentsSearched: index.documents, passagesSearched: index.passages, documentsNotIndexed: index.notIndexed }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function searchedLine(s: SearchStats): string {
  return (
    `Searched ${plural(s.documentsSearched, "document", "documents")}, ${plural(s.passagesSearched, "passage", "passages")}` +
    (s.documentsNotIndexed ? `; ${plural(s.documentsNotIndexed, "document is", "documents are")} not indexed yet.` : ".")
  )
}

async function lexical(ctx: Ctx, query: string, limit: number): Promise<Passage[]> {
  return await ctx.runQuery(internal.mcp.data.lexicalSearch, { query: query.slice(0, 500), areas: [], limit })
}

/** A heading chunk (its text is its section name) names a topic; it never supports a claim. */
const isHeading = (p: { text: string; section: string | null }) => !!p.section && p.text.trim() === p.section.trim()

/** Top live Published passages per claim. Vector search, or words as the fallback. Headings are left out. */
async function retrieve(
  ctx: Ctx,
  claims: string[],
  opts: { meter: MeterSpec; scope: Set<string> },
): Promise<{ perClaim: Found[][]; mode: "vector" | "words" }> {
  const mark = (p: Passage): Found => ({ ...p, inScope: opts.scope.has(p.documentId) })
  let vectors: number[][] | null = null
  if (!stubMode() && geminiConfigured()) {
    try {
      vectors = await Promise.all(claims.map((c) => embedText(opts.meter, c)))
    } catch (err) {
      console.warn("Check against Published: embedding failed, searching by words", err)
    }
  }
  if (!vectors) {
    const perClaim = await Promise.all(
      claims.map(async (c) =>
        (await lexical(ctx, c, 12))
          .filter((p) => p.score >= MIN_LEXICAL && !isHeading(p))
          .slice(0, TOP_PASSAGES)
          .map(mark),
      ),
    )
    return { perClaim, mode: "words" }
  }
  const perClaim = await Promise.all(
    vectors.map(async (vector) => {
      const hits = await searchChunks(ctx, { vector, limit: VECTOR_LIMIT })
      const live: (Omit<Passage, "version"> & { score: number })[] = await ctx.runQuery(
        internal.captures.sets.publishedPassages,
        { hits: hits.filter((h) => h._score >= MIN_SCORE).map((h) => ({ id: h._id, score: h._score })) },
      )
      return live.filter((p) => !isHeading(p)).slice(0, TOP_PASSAGES * 3)
    }),
  )
  // publishedPassages leaves out the version; it is the live one.
  const index = new Map(
    (await ctx.runQuery(internal.ai.wikiCheck.libraryDocs, {})).map((d) => [d.documentId as string, d.version]),
  )
  return {
    perClaim: perClaim.map((rows) =>
      rows
        .filter((r) => index.has(r.documentId))
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_PASSAGES)
        .map((r) => mark({ ...r, version: index.get(r.documentId)! })),
    ),
    mode: "vector",
  }
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

const LongSplit = z.object({ sentences: z.array(z.object({ key: z.string(), claims: z.array(z.string()) })) })

/**
 * Splits sentences over 40 words with one LLM call. A proposed claim is kept
 * only when its words come from the sentence; otherwise the sentence stays whole.
 */
async function splitLong(claims: SplitClaim[], m: MeterSpec): Promise<SplitClaim[]> {
  const long = claims.map((c, i) => ({ c, i })).filter(({ c }) => wordsOf(c.text).length > LONG_SENTENCE_WORDS)
  if (long.length === 0 || stubMode() || !claudeConfigured()) return claims
  const prompt = long.map(({ c }, k) => `[S${k + 1}] ${c.text}`).join("\n")
  const system = [
    "Split each numbered sentence into separate claims, one fact or instruction per claim.",
    "Copy the words of the sentence; do not add, explain or change values. Repeat the subject when a claim needs it.",
    "Return every sentence by its key (for example \"S1\") with its claims in order.",
  ].join("\n")
  const out = await claudeJson({
    meter: m,
    system,
    messages: [{ role: "user", content: prompt }],
    schema: LongSplit,
    effort: "low",
    maxTokens: 4000,
  })
  const replace = new Map<number, string[]>()
  for (const s of out.sentences) {
    const k = Number(/^S(\d+)$/i.exec(s.key.trim())?.[1] ?? 0) - 1
    const item = long[k]
    if (!item) continue
    const source = new Set(wordsOf(item.c.text))
    const parts = s.claims.map((x) => x.trim()).filter((x) => x.length > 0)
    const faithful = parts.every((x) => {
      const w = wordsOf(x)
      return w.length > 0 && w.filter((t) => source.has(t)).length / w.length >= 0.8
    })
    if (parts.length > 1 && faithful) replace.set(item.i, parts)
  }
  return claims.flatMap((c, i) => (replace.get(i) ?? [c.text]).map((text) => ({ text, sentence: c.sentence })))
}

/** Deterministic stand-in for the judge (OPPR_AI_STUB=1), for repeatable browser checks. */
function stubJudge(items: JudgeClaimInput[]): JudgedClaim[] {
  if (process.env.OPPR_WIKI_CHECK_FAIL === "1") throw new Error("the AI judge did not answer (stub set to fail)")
  return items.map((it) => {
    let best: { key: string; code: string; s: string; sc: number } | null = null
    for (const p of it.passages) {
      for (const s of passageSentences(p.text)) {
        const sc = support(it.claim, s)
        if (!best || sc > best.sc) best = { key: p.key, code: p.namingCode, s, sc }
      }
    }
    if (best && best.sc >= 0.3) {
      return { label: "supported", passageKey: best.key, quote: best.s, supportedPart: null, reason: `${best.code} says this in other words (stub judge).` }
    }
    return { label: "not_addressed", passageKey: null, quote: null, supportedPart: null, reason: "None of the passages says this (stub judge)." }
  })
}

function claimPassage(p: Found, quote: string): ClaimPassage {
  return {
    chunkId: p.chunkId,
    documentId: p.documentId,
    namingCode: p.namingCode,
    title: p.title,
    version: p.version,
    quote,
    inScope: p.inScope,
  }
}

function sideMatches(side: DisputeSide, p: Found): boolean {
  if (side.chunkId) return side.chunkId === p.chunkId
  return side.documentId === p.documentId && side.version === p.version && squash(p.text).includes(squash(side.quote))
}

/** Both values of the dispute appear in the claim. */
function statesBoth(claim: string, mine: string, other: string): boolean {
  const c = features(claim)
  const units = [...features(other).quantities].filter(([u]) => c.quantities.has(u))
  const codes = [...features(other).codes].filter(([f]) => c.codes.has(f))
  if (units.length + codes.length === 0) return false
  const has = (set: Set<string> | undefined, xs: Set<string>) => !!set && [...xs].every((x) => set.has(x))
  const mineF = features(mine)
  return (
    units.every(([u, xs]) => has(c.quantities.get(u), xs) && has(c.quantities.get(u), mineF.quantities.get(u) ?? new Set())) &&
    codes.every(([f, xs]) => has(c.codes.get(f), xs))
  )
}

function failText(err: unknown): string {
  if (err instanceof ConvexError) return String(err.data)
  return describeClaudeError(err).replace(/[.\s]+$/, "")
}

// ---- Check against Published --------------------------------------------------------

/** Splits the text into claims and returns one verdict per claim, with the evidence stored. */
export const checkText = action({
  args: {
    wikiId: v.optional(v.id("wikis")),
    blockId: v.optional(v.string()),
    text: v.string(),
    personId: v.id("people"),
  },
  handler: async (ctx, args): Promise<CheckResult> => {
    await requireUser(ctx)
    const text = args.text.trim()
    if (!text) throw new ConvexError("Write something to check first.")
    if (text.length > MAX_WRITTEN_CHARS) {
      throw new ConvexError(`Keep the text under ${MAX_WRITTEN_CHARS} characters; it has ${text.length}.`)
    }
    if (args.blockId && !args.wikiId) throw new ConvexError("A block check needs its Wiki.")
    const frame: { scopeDocumentIds: Id<"documents">[]; confirmByAnother: boolean } = await ctx.runQuery(
      internal.ai.wikiCheck.checkContext,
      { personId: args.personId, wikiId: args.wikiId, blockId: args.blockId, text },
    )
    const split0 = splitClaims(text)
    if (split0.claims.length === 0) throw new ConvexError("There is no statement to check.")
    if (split0.claims.length > MAX_CLAIMS) {
      throw new ConvexError(`This text holds ${split0.claims.length} claims; check at most ${MAX_CLAIMS} at once.`)
    }

    const wikiId = args.wikiId ?? null
    const m: MeterSpec = {
      ctx,
      feature: "wiki.check",
      personId: args.personId,
      ...(wikiId ? { target: { kind: "wiki", id: wikiId } } : {}),
    }
    const scope = new Set<string>(frame.scopeDocumentIds)
    // Refused before it starts (kill switch, caps): the ConvexError says why and nothing is counted.
    const actionId: Id<"aiUsage"> = await ctx.runMutation(internal.lib.aiBudget.start, {
      action: "wikiCheck",
      personId: args.personId,
      wikiId,
    })

    let model = "code"
    let cacheKey = ""
    let searchStats: SearchStats = { documentsSearched: 0, passagesSearched: 0, documentsNotIndexed: 0 }
    try {
      const split = await splitLong(split0.claims, m)
      if (split.length > MAX_CLAIMS) throw new ConvexError(`This text holds more than ${MAX_CLAIMS} claims; check a shorter part`)
      const claims = split.map((c) => c.text)

      const [{ perClaim, mode }, index] = await Promise.all([
        retrieve(ctx, claims, { meter: m, scope }),
        libraryIndex(ctx),
      ])
      searchStats = stats(index, mode)
      cacheKey = await sha256(
        JSON.stringify(claims.map((c, i) => [normaliseForKey(c), perClaim[i].map((p) => `${p.chunkId}@${p.version}`)])),
      )

      // 3. Code first.
      const settled: (Settled | null)[] = claims.map((claim, i) => {
        const r = codeVerdict(claim, perClaim[i])
        if (!r) return null
        return {
          result: { text: claim, verdict: r.verdict, via: "code", reason: r.reason, passages: [claimPassage(r.passage, r.quote)] },
          rests: r.verdict === "supported" ? r.passage : null,
          statesBoth: false,
          disputed: null,
        }
      })

      // 4. The judge, for what code could not settle and that has passages to judge against.
      const open = claims.map((_, i) => i).filter((i) => !settled[i] && perClaim[i].length > 0)
      if (open.length > 0) {
        const cached = await ctx.runQuery(internal.ai.wikiCheck.cachedJudge, { cacheKey })
        const todo: number[] = []
        for (const i of open) {
          const hit = cached?.[i]
          if (hit && hit.text === claims[i] && hit.via === "judge" && REUSABLE.has(hit.verdict)) {
            const rests = perClaim[i].find((p) => p.chunkId === hit.passages[0]?.chunkId) ?? null
            // Disputes and conflict pairs are worked out again below, never taken from the cache.
            const { conflictPair: _pair, findingId: _finding, ...judgedOnly } = hit
            settled[i] = { result: judgedOnly, rests: hit.verdict === "supportedByJudge" ? rests : null, statesBoth: false, disputed: null }
          } else {
            todo.push(i)
          }
        }
        if (todo.length < open.length) model = "cache"
        if (todo.length > 0) {
          const items: JudgeClaimInput[] = todo.map((i, k) => ({
            claim: claims[i],
            passages: perClaim[i].map((p, j) => ({
              key: `C${k + 1}.P${j + 1}`,
              chunkId: p.chunkId,
              namingCode: p.namingCode,
              title: p.title,
              version: p.version,
              section: p.section,
              text: p.text.slice(0, JUDGE_PASSAGE_CHARS),
            })),
          }))
          let judged: JudgedClaim[]
          if (stubMode()) {
            model = "stub"
            judged = await meter(ctx, { ...m, provider: "stub", model: "stub" }, async () => ({ value: stubJudge(items) }))
          } else {
            if (!claudeConfigured()) throw new ConvexError("No AI key is set on this deployment, so the AI judge cannot run")
            model = CLAUDE_MODEL
            judged = await judgeClaims(items, m)
          }
          todo.forEach((i, k) => {
            const j = judged[k]
            const p = j.passageKey ? perClaim[i][Number(j.passageKey.split(".P")[1]) - 1] : undefined
            const base = { text: claims[i], via: "judge" as const }
            if (p && j.quote && j.label === "supported") {
              settled[i] = {
                result: { ...base, verdict: "supportedByJudge", reason: `Only the AI judge found this; a second Engineer must confirm. ${j.reason}`, passages: [claimPassage(p, j.quote)] },
                rests: p,
                statesBoth: false,
                disputed: null,
              }
            } else if (p && j.quote && j.label === "partly" && j.supportedPart) {
              settled[i] = {
                result: { ...base, verdict: "partly", reason: j.reason, supportedPart: j.supportedPart, passages: [claimPassage(p, j.quote)] },
                rests: null,
                statesBoth: false,
                disputed: null,
              }
            } else if (p && j.quote && j.label === "contradicted") {
              settled[i] = {
                result: { ...base, verdict: "differs", reason: `Found by the AI judge: ${j.reason}`, passages: [claimPassage(p, j.quote)] },
                rests: null,
                statesBoth: false,
                disputed: null,
              }
            }
            // Anything else (not addressed, an unverified quote) stays open: Not covered below.
          })
        }
      }

      // Not covered: say how far the search went, and show the closest passages.
      const results: Settled[] = claims.map((claim, i) => {
        const s = settled[i]
        if (s) return s
        const closest = perClaim[i].slice(0, 3).map((p) => claimPassage(p, bestQuote(claim, p.text)))
        return {
          result: {
            text: claim,
            verdict: "notCovered",
            via: perClaim[i].length > 0 ? "judge" : "code",
            reason: `No Published passage says this. ${searchedLine(searchStats)}`,
            passages: closest,
          },
          rests: null,
          statesBoth: false,
          disputed: null,
        }
      })

      // 5. Disputes on the supporting passages, and retrieved passages that disagree.
      const touched = [...new Set(perClaim.flat().map((p) => p.documentId))]
      const disputes = touched.length ? await ctx.runQuery(internal.ai.wikiCheck.openDisputes, { documentIds: touched }) : []
      results.forEach((s, i) => {
        if (s.rests) {
          for (const f of disputes) {
            const [mine, other] = sideMatches(f.a, s.rests) ? [f.a, f.b] : sideMatches(f.b, s.rests) ? [f.b, f.a] : [null, null]
            if (!mine || !other) continue
            const both = statesBoth(claims[i], mine.quote, other.quote)
            const passages = [s.result.passages[0]]
            if (other.chunkId) {
              passages.push({
                chunkId: other.chunkId,
                documentId: other.documentId,
                namingCode: other.namingCode,
                title: other.title,
                version: other.version,
                quote: other.quote,
                inScope: scope.has(other.documentId),
              })
            }
            s.result = {
              ...s.result,
              verdict: "disputed",
              findingId: f._id,
              passages,
              reason: both
                ? `${s.rests.namingCode} v${s.rests.version} says this, but an open Finding says ${other.namingCode} v${other.version} disagrees. Your text states both values, so readers see the dispute.${scope.has(other.documentId) ? "" : ` Add ${other.namingCode} to the Scope first: a Wiki states only its Scope.`}`
                : `${s.rests.namingCode} v${s.rests.version} says this, but an open Finding says ${other.namingCode} v${other.version} disagrees: "${other.quote.slice(0, 200)}". State both values or remove this claim.`,
            }
            s.statesBoth = both
            s.disputed = { findingId: f._id, otherNamingCode: other.namingCode, otherVersion: other.version, otherQuote: other.quote }
            if (other.chunkId) {
              s.also = [{ chunkId: other.chunkId, documentId: other.documentId, namingCode: other.namingCode, version: other.version, section: other.section }]
              s.alsoOutside = !scope.has(other.documentId)
            }
            break
          }
        }
        const ps = perClaim[i].filter((p) => support(claims[i], p.text) >= DIFFERS_MIN_SUPPORT)
        pairs: for (let a = 0; a < ps.length; a++) {
          for (let b = a + 1; b < ps.length; b++) {
            const x = ps[a]
            const y = ps[b]
            if (x.documentId === y.documentId) continue
            if (!factConflict(features(x.text), features(y.text))) continue
            const known = disputes.some(
              (f) =>
                (f.a.documentId === x.documentId && f.b.documentId === y.documentId) ||
                (f.a.documentId === y.documentId && f.b.documentId === x.documentId),
            )
            if (known) continue
            s.result = { ...s.result, conflictPair: [x.documentId, y.documentId] }
            break pairs
          }
        }
      })

      const claimResults = results.map((s) => s.result)
      const checkId: Id<"wikiChecks"> = await ctx.runMutation(internal.ai.wikiCheck.saveCheck, {
        ...(wikiId ? { wikiId } : {}),
        ...(args.blockId ? { blockId: args.blockId } : {}),
        personId: args.personId,
        text,
        claims: claimResults,
        stats: searchStats,
        cacheKey,
        model,
        ok: true,
      })

      // 6. The block's status and points (spec 3.5 step 3).
      if (wikiId && args.blockId) {
        const status = blockStatus(results, { confirmByAnother: frame.confirmByAnother, scoped: true })
        await ctx.runMutation(internal.wikiBlocks.saveCheckResult, {
          wikiId,
          blockId: args.blockId,
          checkId,
          status,
          points: buildPoints(split0.sentences, split, results),
        })
      }
      await ctx.runMutation(internal.lib.aiBudget.finish, { actionId, ok: true })
      return { checkId, claims: claimResults, stats: searchStats }
    } catch (err) {
      // The check did not run: not counted, the block keeps its status, and the
      // failure is kept as evidence.
      const reason = failText(err)
      await ctx.runMutation(internal.lib.aiBudget.finish, { actionId, ok: false, error: reason })
      try {
        await ctx.runMutation(internal.ai.wikiCheck.saveCheck, {
          ...(wikiId ? { wikiId } : {}),
          ...(args.blockId ? { blockId: args.blockId } : {}),
          personId: args.personId,
          text,
          claims: [],
          stats: searchStats,
          cacheKey: cacheKey || "failed",
          model,
          ok: false,
          error: reason.slice(0, 300),
        })
      } catch (e) {
        console.error("Check against Published: could not store the failed check", e)
      }
      console.error("Check against Published failed:", err)
      throw new ConvexError(`The check did not run: ${reason}. Try again.`)
    }
  },
})

// ---- Find sources ----------------------------------------------------------------------

const escapeRe = (s: string) => s.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&")

/** The block's words for "Search for this block", the Wiki's Scope and what it read. */
export const findContext = internalQuery({
  args: { personId: v.id("people"), wikiId: v.id("wikis"), blockId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireEngineerOrAdmin(ctx, args.personId, "Check in as an Engineer to find sources.")
    const wiki = await ctx.db.get(args.wikiId)
    if (!wiki) throw new ConvexError("This Wiki no longer exists.")
    const { published } = await resolveScope(ctx, wiki.scope)
    const words: string[] = []
    if (args.blockId) {
      const rows = await ctx.db
        .query("wikiBlocks")
        .withIndex("by_wikiId_and_blockId", (q) => q.eq("wikiId", wiki._id).eq("blockId", args.blockId!))
        .take(5)
      const row = rows.find((r) => r.state === "staged") ?? rows.find((r) => r.state === "live") ?? rows[0]
      if (!row) throw new ConvexError("This block no longer exists.")
      const outline = wiki.outlineStaged ?? wiki.outline
      const section = outline?.sections.find((s) => s.id === row.sectionId)
      if (section && section.role !== "intro") words.push(section.heading)
      if (section?.instruction && section.instruction !== section.heading) words.push(section.instruction)
      if (row.instruction) words.push(row.instruction)
    }
    // Glossary: a term in the block's words brings its other words (incl. Dutch).
    const base = words.join(". ")
    const lower = ` ${base.toLowerCase()} `
    const synonyms: string[] = []
    if (base) {
      const terms = await ctx.db
        .query("plantItems")
        .withIndex("by_kind", (q) => q.eq("kind", "term"))
        .take(1000)
      for (const t of terms) {
        const names = [t.name, ...t.synonyms].map((n) => n.trim()).filter((n) => n.length >= 2)
        const hit = names.some((n) => new RegExp(`[^\\p{L}\\d]${escapeRe(n.toLowerCase())}[^\\p{L}\\d]`, "u").test(lower))
        if (hit) for (const n of names) if (!lower.includes(n.toLowerCase())) synonyms.push(n)
      }
    }
    return {
      blockWords: base,
      synonyms: [...new Set(synonyms)].slice(0, 20),
      scopeDocumentIds: published.map((d) => d._id),
      read: wiki.sources.filter((s) => (s.excerptsUsed ?? 1) > 0).map((s) => s.documentId),
    }
  },
})

/** Passages for a block, by words or by AI search; grouped by Document, at most 12. */
export const findSources = action({
  args: {
    wikiId: v.id("wikis"),
    blockId: v.optional(v.string()),
    query: v.optional(v.string()),
    mode: v.union(v.literal("words"), v.literal("ai")),
    personId: v.id("people"),
  },
  handler: async (ctx, args): Promise<FindSourcesResult> => {
    await requireUser(ctx)
    const c: { blockWords: string; synonyms: string[]; scopeDocumentIds: Id<"documents">[]; read: Id<"documents">[] } =
      await ctx.runQuery(internal.ai.wikiCheck.findContext, {
        personId: args.personId,
        wikiId: args.wikiId,
        blockId: args.blockId,
      })
    const typed = (args.query ?? "").trim().slice(0, 300)
    const query =
      args.mode === "words"
        ? typed
        : [typed, c.blockWords, c.synonyms.join(", ")].filter(Boolean).join(". ").slice(0, 500)
    if (!query) {
      throw new ConvexError(
        args.mode === "words"
          ? "Type a few words to search for."
          : "This block has no heading or instruction to search for yet. Type a few words instead.",
      )
    }

    const actionId: Id<"aiUsage"> = await ctx.runMutation(internal.lib.aiBudget.start, {
      action: "wikiFind",
      personId: args.personId,
      wikiId: args.wikiId,
    })
    try {
      // searchPassages meters its embedding and falls back to words on its own.
      const passages: Passage[] =
        stubMode() || !geminiConfigured()
          ? await lexical(ctx, query, FIND_PASSAGES)
          : (
              await searchPassages(ctx, {
                query,
                storageId: null,
                areas: [],
                limit: FIND_PASSAGES,
                feature: "wiki.find",
                personId: args.personId,
                target: { kind: "wiki", id: args.wikiId },
              })
            ).passages

      // The best passage per Document, best Documents first.
      const best = new Map<string, Passage>()
      for (const p of [...passages].sort((a, b) => b.score - a.score)) {
        if (!best.has(p.documentId)) best.set(p.documentId, p)
      }
      const picked = [...best.values()].slice(0, FIND_DOCUMENTS)
      const [index, disputes] = await Promise.all([
        libraryIndex(ctx),
        picked.length
          ? ctx.runQuery(internal.ai.wikiCheck.openDisputes, { documentIds: picked.map((p) => p.documentId) })
          : Promise.resolve([]),
      ])
      const area = new Map(index.docs.map((d) => [d.documentId as string, d.areaCode]))
      const scope = new Set<string>(c.scopeDocumentIds)
      const read = new Set<string>(c.read)
      const sources: FoundSource[] = picked.map((p) => {
        const found: Found = { ...p, inScope: scope.has(p.documentId) }
        const dispute = disputes.find((f) => sideMatches(f.a, found) || sideMatches(f.b, found))
        return {
          documentId: p.documentId,
          namingCode: p.namingCode,
          title: p.title,
          version: p.version,
          areaCode: area.get(p.documentId) ?? null,
          passage: { chunkId: p.chunkId, text: p.text, section: p.section },
          badge: read.has(p.documentId) && scope.has(p.documentId) ? "inWiki" : scope.has(p.documentId) ? "inScopeNotRead" : "notInScope",
          ...(dispute ? { disputedFindingId: dispute._id } : {}),
        }
      })
      await ctx.runMutation(internal.lib.aiBudget.finish, { actionId, ok: true })
      const n = index.notIndexed
      return {
        sources,
        indexingNote: n ? `${plural(n, "document is", "documents are")} still being indexed and ${n === 1 ? "is" : "are"} not searchable yet.` : null,
      }
    } catch (err) {
      const reason = failText(err)
      await ctx.runMutation(internal.lib.aiBudget.finish, { actionId, ok: false, error: reason })
      console.error("Find sources failed:", err)
      throw new ConvexError(`The search did not run: ${reason}. Try again.`)
    }
  },
})

// ---- From a check to a Proposed revision or the Consistency check (spec 3.5.1) --------

/**
 * One Proposed revision per check per Document; a second press adds the
 * claims to the same row. Returns the Proposed revision and whether it was new.
 */
export const proposeRevisionFromCheck = action({
  args: {
    checkId: v.id("wikiChecks"),
    documentId: v.id("documents"),
    claimIndexes: v.array(v.number()),
    personId: v.id("people"),
  },
  handler: async (ctx, args): Promise<{ proposedRevisionId: Id<"proposedRevisions"> | null; created: boolean }> => {
    const userId = await requireUserId(ctx)
    return await ctx.runMutation(internal.revisions.startFromWikiCheck, { ...args, userId })
  },
})

/** Starts the real Consistency check for the first Document of a claim's conflict pair. */
export const startPairCheck = internalMutation({
  args: { checkId: v.id("wikiChecks"), claimIndex: v.number(), personId: v.id("people") },
  handler: async (ctx, args): Promise<{ started: boolean }> => {
    await requireEngineerOrAdmin(ctx, args.personId, "Check in as an Engineer to run the Consistency check.")
    const check = await ctx.db.get(args.checkId)
    const pair = check?.claims[args.claimIndex]?.conflictPair
    if (!pair || pair.length < 2) throw new ConvexError("This claim has no two passages that disagree.")
    const doc = await ctx.db.get(pair[0])
    const version = doc ? publishedVersion(doc) : null
    if (!doc || version == null) throw new ConvexError("That Document is no longer Published.")
    const recent = await ctx.db.query("consistencyRuns").withIndex("by_startedAt").order("desc").take(10)
    const now = Date.now()
    const running = recent.find(
      (r) => r.status === "running" && now - r.startedAt < 30 * 60 * 1000 && (r.documentId == null || r.documentId === doc._id),
    )
    if (running) {
      throw new ConvexError("A Consistency check is already running for this Document. New Findings appear in Findings when it is done.")
    }
    // The Consistency check is an AI run, so it counts against the Wiki budget like a check.
    const actionId = await recordAiAction(ctx, { action: "wikiCheck", personId: args.personId, wikiId: check?.wikiId ?? null })
    await ctx.db.patch(actionId, { ok: true })
    await ctx.scheduler.runAfter(0, internal.ai.consistency.checkDocument, { documentId: doc._id, version })
    return { started: true }
  },
})

/** "Run the Consistency check on these two Documents". Any Finding comes from that check. */
export const runConsistencyOnPair = action({
  args: { checkId: v.id("wikiChecks"), claimIndex: v.number(), personId: v.id("people") },
  handler: async (ctx, args): Promise<{ started: boolean }> => {
    await requireUser(ctx)
    return await ctx.runMutation(internal.ai.wikiCheck.startPairCheck, args)
  },
})
