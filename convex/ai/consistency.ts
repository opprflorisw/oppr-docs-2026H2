// Consistency check (CONTEXT.md: Consistency check, Finding).
//
// Finds Published passages that contradict or duplicate a passage in another
// Published document, so Ask never gives conflicting answers silently.
//
//   1. Candidate pairs, cheap and deterministic first. Only live-version
//      chunks of Published documents take part (convex/lib/published.ts), so
//      a draft can never produce a Finding.
//        a. Lexical: the two passages share subject words (content stems) and
//           differ on a fact (a value in the same unit, or a code of the same
//           family): "die bolts ... 40 Nm" against "die bolts ... 45 Nm".
//        b. Semantic: the vector index, per passage, for the nearest passages
//           in other documents: duplicates and contradictions in other words.
//      Pairs are ranked by meaning plus a differing fact, capped per passage,
//      per document pair and per run, and every cap
//      is logged with what it dropped.
//   2. Claude judges the pairs in batches: contradiction, duplicate or none,
//      with a one-sentence summary for an Engineer and a verbatim quote from
//      each side.
//   3. Code verifies each quote occurs in its passage (after normalise) and
//      drops the pair otherwise. The AI never decides alone what is quoted.
//   4. Findings are saved by convex/findings.ts, which never re-reports an
//      open, dismissed or resolved pair at the same versions.
import { v } from "convex/values"
import { z } from "zod"
import { ActionCtx, internalAction } from "../_generated/server"
import { internal } from "../_generated/api"
import { Id } from "../_generated/dataModel"
import { claudeConfigured, claudeJson, describeClaudeError } from "./llm"
import { contentStems, factTokens, normalise } from "./grounding"
import type { CorpusChunk, CorpusDoc } from "../findings"

// ---- Tuning ------------------------------------------------------------------------

/** Passages shorter than this (headings, titles) never take part. */
const MIN_CHARS = 25
/** Nearest passages asked from the vector index per passage. */
const VECTOR_LIMIT = 24
/** Nearest passages from other Published documents kept per passage. */
const SEMANTIC_TOP = 6
/**
 * Below this cosine score two passages are not about the same thing. Measured
 * on the seed: the same instruction in other words scores about 0.95,
 * unrelated passages of the same plant 0.74 to 0.85, so this lets in some
 * noise and the ranking (rescore: meaning, differing facts, shared words) decides what is judged.
 */
const SEMANTIC_MIN = 0.8
/** At most this many pairs of passages per pair of documents. */
const MAX_PER_DOC_PAIR = 6
/** How often one passage may appear in the judged pairs (keeps table rows from flooding the run). */
const MAX_PER_PASSAGE = 2
/** At most this many pairs judged per run. */
const MAX_PAIRS_LIBRARY = 200
const MAX_PAIRS_DOCUMENT = 40
/** Pairs per Claude call, and calls at once. */
const BATCH_SIZE = 8
const CONCURRENCY = 3
/** Publish-time check waits for embeddings: delays between tries (ms). */
const EMBED_WAIT_MS = [15_000, 30_000, 45_000, 60_000, 60_000, 60_000]

// ---- Lexical features --------------------------------------------------------------

interface Features {
  stems: Set<string>
  /** Values per canonical unit ("NM" -> {"40"}). */
  quantities: Map<string, Set<string>>
  /** Codes per family prefix ("PX-" -> {"PX-4400"}). */
  codes: Map<string, Set<string>>
}

const NAMING_CODE_RE = /^[A-Z]{2,}-[A-Z]{2,}-[A-Z]{2,}-\d+$/

function features(text: string): Features {
  const quantities = new Map<string, Set<string>>()
  const codes = new Map<string, Set<string>>()
  for (const t of factTokens(text)) {
    const q = /^(\d[\d.-]*) (.+)$/.exec(t)
    if (q) {
      // Counted nouns ("#PIPE") are too loose to signal a conflict.
      if (q[2].startsWith("#")) continue
      const set = quantities.get(q[2]) ?? new Set<string>()
      set.add(q[1])
      quantities.set(q[2], set)
      continue
    }
    if (/[A-Z]/.test(t) && /\d/.test(t) && !NAMING_CODE_RE.test(t)) {
      const family = /^[A-Z]+-?/.exec(t)?.[0] ?? t
      const set = codes.get(family) ?? new Set<string>()
      set.add(t)
      codes.set(family, set)
    }
  }
  // How often something is done is a fact too ("once a day" vs "every shift").
  const freq = frequencies(text)
  if (freq.size) quantities.set("/FREQ", freq)
  return { stems: new Set(contentStems(text)), quantities, codes }
}

const FREQ_RES: [RegExp, string][] = [
  [/\bonce (?:a|per) day\b|\bdaily\b|\bevery day\b/i, "DAY"],
  [/\bevery shift\b|\beach shift\b|\bper shift\b/i, "SHIFT"],
  [/\bonce (?:a|per) week\b|\bweekly\b|\bevery week\b/i, "WEEK"],
  [/\bonce (?:a|per) month\b|\bmonthly\b|\bevery month\b/i, "MONTH"],
]

function frequencies(text: string): Set<string> {
  const out = new Set<string>()
  for (const [re, tag] of FREQ_RES) if (re.test(text)) out.add(tag)
  return out
}

/** A short table row ("Zone 2 | Set point: 190 °C"): many look alike and differ on purpose. */
function isTableRow(text: string): boolean {
  return text.includes("|") && text.length < 90
}

/** A bare heading carries no instruction to compare. */
function isHeading(text: string): boolean {
  const t = text.trim()
  return t.length < 60 && !/[.:;!?]/.test(t) && !/\d/.test(t)
}

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x))

/** A fact both passages state in the same unit or code family, with other values. */
function factConflict(x: Features, y: Features): boolean {
  for (const [unit, xs] of x.quantities) {
    const ys = y.quantities.get(unit)
    if (ys && !sameSet(xs, ys)) return true
  }
  for (const [family, xs] of x.codes) {
    const ys = y.codes.get(family)
    if (ys && !sameSet(xs, ys)) return true
  }
  return false
}

function overlap(x: Features, y: Features): { shared: number; ratio: number } {
  let shared = 0
  for (const s of x.stems) if (y.stems.has(s)) shared += 1
  const smaller = Math.min(x.stems.size, y.stems.size)
  return { shared, ratio: smaller === 0 ? 0 : shared / smaller }
}

// ---- Candidate pairs ----------------------------------------------------------------

interface Passage {
  doc: CorpusDoc
  chunk: CorpusChunk
  f: Features
}

interface Candidate {
  x: Passage
  y: Passage
  score: number
  via: "lexical" | "semantic" | "both"
}

function usable(c: CorpusChunk): boolean {
  return c.text.trim().length >= MIN_CHARS
}

function passagesOf(corpus: CorpusDoc[]): Map<string, Passage> {
  const out = new Map<string, Passage>()
  for (const doc of corpus) {
    for (const chunk of doc.chunks) {
      if (!usable(chunk) || isHeading(chunk.text)) continue
      const f = features(chunk.text)
      if (f.stems.size < 2) continue
      out.set(chunk.chunkId, { doc, chunk, f })
    }
  }
  return out
}

const pairId = (a: string, b: string) => (a < b ? `${a}~${b}` : `${b}~${a}`)

function addCandidate(
  pool: Map<string, Candidate>,
  x: Passage,
  y: Passage,
  score: number,
  via: "lexical" | "semantic",
) {
  const key = pairId(x.chunk.chunkId, y.chunk.chunkId)
  const prev = pool.get(key)
  if (!prev) {
    pool.set(key, { x, y, score, via })
    return
  }
  const both = prev.via === "both" || prev.via !== via
  pool.set(key, { ...prev, score: Math.max(prev.score, score) + (both ? 0.1 : 0), via: both ? "both" : via })
}

/** Lexical pairs: shared subject words and a differing fact. */
function lexicalPairs(sources: Passage[], all: Passage[], pool: Map<string, Candidate>) {
  for (const x of sources) {
    for (const y of all) {
      if (x.doc.documentId === y.doc.documentId) continue
      const { shared, ratio } = overlap(x.f, y.f)
      if (shared < 2 || ratio < 0.3) continue
      if (factConflict(x.f, y.f)) {
        // Initial score only: rescore() sets the final ranking.
        addCandidate(pool, x, y, 1 + ratio, "lexical")
      } else if (shared >= 5 && ratio >= 0.7) {
        addCandidate(pool, x, y, 0.5 + ratio / 2, "lexical")
      }
    }
  }
}

/** The embedding of every live Published passage, by chunk id. */
async function loadVectors(ctx: ActionCtx, corpus: CorpusDoc[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>()
  for (const doc of corpus) {
    const rows: { chunkId: Id<"chunks">; embedding: number[] }[] = await ctx.runQuery(
      internal.findings.chunkEmbeddings,
      { documentId: doc.documentId, version: doc.version },
    )
    for (const r of rows) out.set(r.chunkId as string, r.embedding)
  }
  return out
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

/**
 * Final ranking. Shared words and a differing value find candidates, but on
 * their own they rank unrelated passages high (zone 2 at 190 °C against a
 * warning that mentions 220 °C). So every pair is scored on how close the two
 * passages are in meaning, plus a bonus for a differing fact and for shared
 * subject words. Short table rows rank lower: they differ on purpose.
 */
function rescore(pool: Map<string, Candidate>, vectors: Map<string, number[]>) {
  for (const [key, c] of pool) {
    const vx = vectors.get(c.x.chunk.chunkId)
    const vy = vectors.get(c.y.chunk.chunkId)
    // Without vectors (not embedded yet) fall back to a middling similarity.
    const sim = vx && vy ? cosine(vx, vy) : 0.82
    const { ratio } = overlap(c.x.f, c.y.f)
    const conflict = factConflict(c.x.f, c.y.f)
    const rows = isTableRow(c.x.chunk.text) && isTableRow(c.y.chunk.text)
    const score = sim + (conflict ? 0.12 : 0) + 0.1 * ratio - (rows ? 0.1 : 0)
    pool.set(key, { ...c, score })
  }
}

/** Semantic pairs: the nearest passages in other Published documents. */
async function semanticPairs(
  ctx: ActionCtx,
  sources: CorpusDoc[],
  passages: Map<string, Passage>,
  pool: Map<string, Candidate>,
  byId: Map<string, number[]>,
): Promise<{ searched: number; notEmbedded: number }> {
  let searched = 0
  let notEmbedded = 0
  for (const doc of sources) {
    const mine = doc.chunks.filter((c) => passages.has(c.chunkId))
    notEmbedded += mine.filter((c) => !byId.has(c.chunkId)).length
    const work = mine.filter((c) => byId.has(c.chunkId))
    for (let i = 0; i < work.length; i += 8) {
      await Promise.all(
        work.slice(i, i + 8).map(async (c) => {
          const hits = await ctx.vectorSearch("chunks", "by_embedding", {
            vector: byId.get(c.chunkId)!,
            limit: VECTOR_LIMIT,
          })
          searched += 1
          const x = passages.get(c.chunkId)!
          // Only passages in the corpus count: live versions of Published
          // documents. Drafts, old versions and the same document drop out.
          const kept = hits
            .filter((h) => h._score >= SEMANTIC_MIN)
            .map((h) => ({ h, y: passages.get(h._id) }))
            .filter((r): r is { h: (typeof hits)[number]; y: Passage } => r.y != null && r.y.doc.documentId !== doc.documentId)
            .slice(0, SEMANTIC_TOP)
          for (const { h, y } of kept) {
            const bonus = factConflict(x.f, y.f) ? 0.15 : 0
            addCandidate(pool, x, y, h._score + bonus, "semantic")
          }
        }),
      )
    }
  }
  return { searched, notEmbedded }
}

/** Ranks the pool, caps per document pair and per run, and says what it dropped. */
function selectPairs(pool: Map<string, Candidate>, max: number, label: string): Candidate[] {
  const ranked = [...pool.values()].sort((a, b) => b.score - a.score)
  const perDocPair = new Map<string, number>()
  const perPassage = new Map<string, number>()
  const picked: Candidate[] = []
  let cappedPerPassage = 0
  let cappedPerPair = 0
  let cappedRun = 0
  for (const c of ranked) {
    const dp = pairId(c.x.doc.documentId, c.y.doc.documentId)
    const n = perDocPair.get(dp) ?? 0
    if (n >= MAX_PER_DOC_PAIR) {
      cappedPerPair += 1
      continue
    }
    const px = perPassage.get(c.x.chunk.chunkId) ?? 0
    const py = perPassage.get(c.y.chunk.chunkId) ?? 0
    if (px >= MAX_PER_PASSAGE || py >= MAX_PER_PASSAGE) {
      cappedPerPassage += 1
      continue
    }
    if (picked.length >= max) {
      cappedRun += 1
      continue
    }
    perDocPair.set(dp, n + 1)
    perPassage.set(c.x.chunk.chunkId, px + 1)
    perPassage.set(c.y.chunk.chunkId, py + 1)
    picked.push(c)
  }
  console.log(
    `Consistency ${label}: ${pool.size} candidate pairs, judging ${picked.length}` +
      (cappedPerPair ? `, ${cappedPerPair} dropped by the cap of ${MAX_PER_DOC_PAIR} per document pair` : "") +
      (cappedPerPassage ? `, ${cappedPerPassage} dropped by the cap of ${MAX_PER_PASSAGE} per passage` : "") +
      (cappedRun ? `, ${cappedRun} dropped by the run cap of ${max} (lowest ranked first)` : ""),
  )
  if (cappedRun) {
    const lost = ranked.filter((c) => !picked.includes(c)).slice(0, 5)
    for (const c of lost) {
      console.log(
        `  not judged (score ${c.score.toFixed(2)}): ${c.x.doc.namingCode} "${c.x.chunk.text.slice(0, 60)}" / ${c.y.doc.namingCode} "${c.y.chunk.text.slice(0, 60)}"`,
      )
    }
  }
  return picked
}

// ---- Judging ------------------------------------------------------------------------

const JudgeOut = z.object({
  results: z.array(
    z.object({
      pair: z.string(),
      kind: z.enum(["contradiction", "duplicate", "none"]),
      summary: z.string(),
      quoteA: z.string(),
      quoteB: z.string(),
    }),
  ),
})

const JUDGE_SYSTEM = [
  "You are the Consistency check inside Oppr Knowledge, the controlled knowledge base of a plastic pipe extrusion plant.",
  "You get numbered PAIRS of passages. Side A and side B always come from two different Published documents (SOPs, work instructions, LMRAs and supplier manuals). Decide for each pair whether the two passages contradict each other, duplicate each other, or neither.",
  "",
  "CONTRADICTION: both passages are about the same thing (the same equipment or part, the same task, the same parameter, under the same conditions) and a person cannot follow both. Examples:",
  "- A tightening torque of 40 Nm against 45 Nm for the same die bolts.",
  "- \"Never set the barrel above 230 °C\" against \"maximum barrel temperature 220 °C\": the first allows 225 °C, which the second forbids.",
  "- \"Calibrate the gauge once a day\" against \"calibrate at the start of every shift\".",
  "If one passage allows something the other forbids (a higher limit, a lower frequency, a skipped step, a different order), it is a contradiction.",
  "",
  "NOT a contradiction (answer none):",
  "- Different equipment, pipe sizes, SDR classes, materials, products, lines or phases of work (start-up against normal running, cold against hot), even when the wording is alike.",
  "- A value that lies inside the other passage's range (190 °C against 170-220 °C), or one passage being stricter or more detailed while following it still satisfies the other.",
  "- One passage covering something the other does not mention at all.",
  "- A cross-reference (\"follow the lockout procedure\") next to the procedure itself.",
  "When in doubt, answer none. A false Finding costs an Engineer's time and trust.",
  "",
  "DUPLICATE: both passages state the same substantial instruction or setting (the same steps or the same values for the same equipment), so that if one is changed the other must be changed too. Short generic reminders (wear gloves, lock out first, inform the shift leader), titles, headings and cross-references are not duplicates. If the passages share a subject but give different values, it is a contradiction, not a duplicate.",
  "",
  "Only report pairs that are a contradiction or a duplicate. Leave every other pair out of `results`. If the same disagreement appears in several pairs, report it once, on the pair that states it most directly. Duplicates are different: report EVERY pair that repeats the other side, even when several pairs come from the same two documents.",
  "",
  "For each reported pair:",
  "- `pair`: the pair key, exactly as given (for example \"P3\").",
  "- `summary`: ONE sentence for an Engineer that names both documents by type or naming code and states both values or instructions, for example: \"The changeover SOP says 40 Nm for the die bolts, the Krauss supplier manual says 45 Nm.\" For a duplicate, say what both documents repeat. At most 200 characters. Plain words, no dashes as punctuation, no advice.",
  "- `quoteA` and `quoteB`: the shortest span from side A and from side B that shows the disagreement or the repetition, usually one sentence or one table row. Copy it EXACTLY, character for character, from that side's TEXT. Do not shorten with an ellipsis, do not fix typos, do not add words, do not combine two separate places. Code checks every quote and drops the pair when a quote cannot be found.",
].join("\n")

interface Verified {
  kind: "contradiction" | "duplicate"
  summary: string
  a: SideOut
  b: SideOut
}
interface SideOut {
  documentId: Id<"documents">
  namingCode: string
  title: string
  version: number
  chunkId: Id<"chunks">
  section: string | null
  quote: string
}

const squash = (s: string) => normalise(s).replace(/\s+/g, " ").trim()
const stripEnds = (s: string) =>
  s
    .trim()
    .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, "")
    .replace(/^(?:\.\.\.|…)\s*|\s*(?:\.\.\.|…)$/g, "")
    .trim()

/** The quote as it occurs in the passage (or null when it does not). */
function verifyQuote(quote: string, chunk: CorpusChunk): string | null {
  const q = stripEnds(quote)
  if (q.length < 8) return null
  const nq = squash(q)
  const nqLoose = nq.replace(/[.;:,]$/, "")
  for (const text of [chunk.text, chunk.raw]) {
    const t = squash(text)
    if (t.includes(nq) || (nqLoose.length >= 8 && t.includes(nqLoose))) return q
  }
  return null
}

function sideOf(p: Passage, quote: string): SideOut {
  return {
    documentId: p.doc.documentId,
    namingCode: p.doc.namingCode,
    title: p.doc.title,
    version: p.doc.version,
    chunkId: p.chunk.chunkId,
    section: p.chunk.section,
    quote,
  }
}

function describeSide(p: Passage): string {
  const kind = p.doc.wrapped ? "supplier manual" : "document"
  const where = p.chunk.section && p.chunk.section !== p.doc.title ? `, section "${p.chunk.section}"` : ""
  return `${p.doc.namingCode} v${p.doc.version} (${kind}: ${p.doc.title}${where})`
}

async function judgeBatch(
  batch: Candidate[],
  offset: number,
): Promise<{ verified: Verified[]; dropped: number }> {
  const keyed = batch.map((c, i) => ({ key: `P${offset + i + 1}`, c }))
  const prompt = [
    "PAIRS:",
    "",
    ...keyed.flatMap(({ key, c }) => [
      `[${key}]`,
      `A: ${describeSide(c.x)}`,
      `TEXT A: ${c.x.chunk.text}`,
      `B: ${describeSide(c.y)}`,
      `TEXT B: ${c.y.chunk.text}`,
      "",
    ]),
  ].join("\n")

  const out = await claudeJson({
    system: JUDGE_SYSTEM,
    messages: [{ role: "user", content: prompt }],
    schema: JudgeOut,
    effort: "high",
    // Above ~21k the SDK insists on streaming; 16k leaves room for thinking.
    maxTokens: 16000,
  })

  const byKey = new Map(keyed.map((k) => [k.key, k.c]))
  const verified: Verified[] = []
  let dropped = 0
  for (const r of out.results) {
    if (r.kind === "none") continue
    const c = byKey.get(r.pair.trim().replace(/^\[|\]$/g, ""))
    if (!c) {
      dropped += 1
      console.log(`Consistency: dropped a result for unknown pair ${r.pair}`)
      continue
    }
    const qa = verifyQuote(r.quoteA, c.x.chunk)
    const qb = verifyQuote(r.quoteB, c.y.chunk)
    const summary = r.summary.replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim().slice(0, 300)
    if (!qa || !qb) {
      dropped += 1
      console.log(
        `Consistency: dropped ${r.kind} ${c.x.doc.namingCode} / ${c.y.doc.namingCode}: quote not found in its passage (${!qa ? `A: "${r.quoteA.slice(0, 80)}"` : ""}${!qa && !qb ? ", " : ""}${!qb ? `B: "${r.quoteB.slice(0, 80)}"` : ""})`,
      )
      continue
    }
    if (r.kind === "contradiction" && squash(qa) === squash(qb)) {
      dropped += 1
      console.log(`Consistency: dropped contradiction ${c.x.doc.namingCode} / ${c.y.doc.namingCode}: both quotes say the same`)
      continue
    }
    if (!summary) {
      dropped += 1
      continue
    }
    verified.push({ kind: r.kind, summary, a: sideOf(c.x, qa), b: sideOf(c.y, qb) })
  }
  return { verified, dropped }
}

/** Judges all pairs in bounded batches; a failed batch is logged, not fatal. */
async function judgeAll(pairs: Candidate[]): Promise<{
  verified: Verified[]
  dropped: number
  failedBatches: number
  lastError: string | null
}> {
  // Pairs of the same two documents go together, so the model can report a
  // disagreement once.
  const sorted = [...pairs].sort((a, b) =>
    pairId(a.x.doc.documentId, a.y.doc.documentId).localeCompare(pairId(b.x.doc.documentId, b.y.doc.documentId)),
  )
  const batches: Candidate[][] = []
  for (let i = 0; i < sorted.length; i += BATCH_SIZE) batches.push(sorted.slice(i, i + BATCH_SIZE))

  const verified: Verified[] = []
  let dropped = 0
  let failedBatches = 0
  let lastError: string | null = null
  let next = 0
  async function worker() {
    while (next < batches.length) {
      const i = next++
      try {
        const r = await judgeBatch(batches[i], i * BATCH_SIZE)
        verified.push(...r.verified)
        dropped += r.dropped
      } catch (err) {
        failedBatches += 1
        lastError = describeClaudeError(err)
        console.error(`Consistency: batch ${i + 1}/${batches.length} failed: ${lastError}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, () => worker()))
  return { verified, dropped, failedBatches, lastError }
}

/**
 * Documents restate key facts on purpose (the burn first aid, a drying
 * setting), so one shared fact is not worth an Engineer's time. A duplicate
 * counts only when at least this many passages of the same two documents
 * repeat each other: a copied section that will drift apart.
 */
const MIN_DUPLICATE_PASSAGES = 3

/** One duplicate per pair of documents; contradictions stay one per disagreement. */
function collapse(verified: Verified[]): Verified[] {
  const dupCount = new Map<string, number>()
  for (const f of verified) {
    if (f.kind !== "duplicate") continue
    const k = pairId(f.a.documentId, f.b.documentId)
    dupCount.set(k, (dupCount.get(k) ?? 0) + 1)
  }
  const out: Verified[] = []
  const dupSeen = new Set<string>()
  for (const f of verified) {
    if (f.kind === "duplicate") {
      const k = pairId(f.a.documentId, f.b.documentId)
      if ((dupCount.get(k) ?? 0) < MIN_DUPLICATE_PASSAGES || dupSeen.has(k)) continue
      dupSeen.add(k)
    }
    out.push(f)
  }
  return out
}

// ---- Runs ---------------------------------------------------------------------------

type Trigger = "publish" | "weekly" | "manual" | "seed"

async function execute(
  ctx: ActionCtx,
  opts: { trigger: Trigger; documentId: Id<"documents"> | null },
): Promise<{ pairsChecked: number; findingsNew: number }> {
  const runId: Id<"consistencyRuns"> = await ctx.runMutation(internal.findings.startRun, {
    trigger: opts.trigger,
    documentId: opts.documentId,
  })
  const label = opts.documentId ? `${opts.trigger} ${opts.documentId}` : opts.trigger
  const fail = async (error: string, pairsChecked = 0) => {
    console.error(`Consistency ${label} failed: ${error}`)
    await ctx.runMutation(internal.findings.finishRun, {
      runId,
      status: "failed",
      pairsChecked,
      findingsNew: 0,
      error: error.slice(0, 400),
    })
    return { pairsChecked, findingsNew: 0 }
  }

  try {
    if (!claudeConfigured()) return await fail("No Claude API key is set on this deployment.")

    const resolved: number = await ctx.runMutation(internal.findings.resolveStale, {})
    if (resolved) console.log(`Consistency ${label}: ${resolved} stale Findings resolved`)

    const corpus: CorpusDoc[] = await ctx.runQuery(internal.findings.publishedCorpus, {})
    const passages = passagesOf(corpus)
    const all = [...passages.values()]

    let sources: CorpusDoc[]
    if (opts.documentId) {
      const target = corpus.find((d) => d.documentId === opts.documentId)
      if (!target) {
        await ctx.runMutation(internal.findings.finishRun, {
          runId,
          status: "done",
          pairsChecked: 0,
          findingsNew: 0,
          error: null,
        })
        return { pairsChecked: 0, findingsNew: 0 }
      }
      sources = [target]
    } else {
      sources = corpus
    }
    const sourceIds = new Set(sources.map((d) => d.documentId as string))
    const sourcePassages = all.filter((p) => sourceIds.has(p.doc.documentId))

    const pool = new Map<string, Candidate>()
    lexicalPairs(sourcePassages, all, pool)
    const lexicalCount = pool.size
    const vectors = await loadVectors(ctx, corpus)
    const sem = await semanticPairs(ctx, sources, passages, pool, vectors)
    rescore(pool, vectors)
    console.log(
      `Consistency ${label}: ${corpus.length} Published documents, ${all.length} passages; ` +
        `${lexicalCount} lexical pairs, ${sem.searched} vector searches` +
        (sem.notEmbedded ? `, ${sem.notEmbedded} passages not embedded yet (lexical only)` : ""),
    )

    const pairs = selectPairs(pool, opts.documentId ? MAX_PAIRS_DOCUMENT : MAX_PAIRS_LIBRARY, label)
    if (pairs.length === 0) {
      await ctx.runMutation(internal.findings.finishRun, {
        runId,
        status: "done",
        pairsChecked: 0,
        findingsNew: 0,
        error: null,
      })
      return { pairsChecked: 0, findingsNew: 0 }
    }

    const judged = await judgeAll(pairs)
    const findings = collapse(judged.verified)
    const findingsNew: number = await ctx.runMutation(internal.findings.saveFindings, {
      trigger: opts.trigger,
      findings,
    })
    console.log(
      `Consistency ${label}: judged ${pairs.length} pairs, ${judged.verified.length} verified, ` +
        `${judged.dropped} dropped by the quote check, ${findingsNew} new Findings` +
        (judged.failedBatches ? `, ${judged.failedBatches} batches failed` : ""),
    )
    const allFailed = judged.failedBatches > 0 && judged.failedBatches * BATCH_SIZE >= pairs.length
    await ctx.runMutation(internal.findings.finishRun, {
      runId,
      status: allFailed ? "failed" : "done",
      pairsChecked: pairs.length,
      findingsNew,
      error: judged.failedBatches
        ? `${judged.failedBatches} of ${Math.ceil(pairs.length / BATCH_SIZE)} batches could not be judged: ${judged.lastError}`.slice(0, 400)
        : null,
    })
    return { pairsChecked: pairs.length, findingsNew }
  } catch (err) {
    return await fail(err instanceof Error ? err.message : String(err))
  }
}

/** Check one newly Published version against the rest of Published Knowledge. */
export const checkDocument = internalAction({
  args: { documentId: v.id("documents"), version: v.number(), attempt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const attempt = args.attempt ?? 0
    const state: { state: "gone" | "superseded" | "live"; chunks: number; missing: number } =
      await ctx.runQuery(internal.findings.versionState, {
        documentId: args.documentId,
        version: args.version,
      })
    if (state.state !== "live") {
      console.log(
        `Consistency publish ${args.documentId} v${args.version}: skipped, ${state.state === "gone" ? "the document is gone" : "not the Published version"}`,
      )
      return
    }
    // Wait for the version's passages (a Wrapped manual's text may still be
    // extracted) and their embeddings, so the semantic search sees it.
    const waiting = state.chunks === 0 || state.missing > 0
    if (waiting && attempt < EMBED_WAIT_MS.length) {
      if (attempt === 1 && state.missing > 0) {
        await ctx.scheduler.runAfter(0, internal.ai.embed.embedMissingInternal, { documentId: args.documentId })
      }
      console.log(
        state.chunks === 0
          ? `Consistency publish ${args.documentId} v${args.version}: no passages yet, retry ${attempt + 1}`
          : `Consistency publish ${args.documentId} v${args.version}: ${state.missing} of ${state.chunks} passages not embedded yet, retry ${attempt + 1}`,
      )
      await ctx.scheduler.runAfter(EMBED_WAIT_MS[attempt], internal.ai.consistency.checkDocument, {
        documentId: args.documentId,
        version: args.version,
        attempt: attempt + 1,
      })
      return
    }
    if (state.chunks === 0) {
      console.log(`Consistency publish ${args.documentId} v${args.version}: skipped, the version has no text passages`)
      return
    }
    if (state.missing > 0) {
      console.log(`Consistency publish ${args.documentId}: still ${state.missing} passages without embeddings, checking them lexically only`)
    }
    await execute(ctx, { trigger: "publish", documentId: args.documentId })
  },
})

/** Sweep across all Published Knowledge (weekly cron, manual, after seeding). */
export const runAll = internalAction({
  args: {
    trigger: v.union(v.literal("weekly"), v.literal("manual"), v.literal("seed")),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ pairsChecked: number; findingsNew: number; skipped: boolean }> => {
    const active: boolean = await ctx.runQuery(internal.findings.isLibraryRunActive, {})
    if (active) {
      console.log(`Consistency ${args.trigger}: skipped, a library-wide check is already running`)
      return { pairsChecked: 0, findingsNew: 0, skipped: true }
    }
    // Right after seeding, embeddings may still be on their way: wait for
    // them (bounded), so the semantic search sees every passage. A run started
    // by hand goes at once: someone is watching the page.
    const attempt = args.attempt ?? 0
    if (args.trigger !== "manual" && attempt < EMBED_WAIT_MS.length) {
      const corpus: CorpusDoc[] = await ctx.runQuery(internal.findings.publishedCorpus, {})
      const missing = corpus.reduce((n, d) => n + d.chunks.filter((c) => !c.embedded).length, 0)
      if (missing > 0) {
        console.log(`Consistency ${args.trigger}: ${missing} passages not embedded yet, retry ${attempt + 1}`)
        await ctx.scheduler.runAfter(EMBED_WAIT_MS[attempt], internal.ai.consistency.runAll, {
          trigger: args.trigger,
          attempt: attempt + 1,
        })
        return { pairsChecked: 0, findingsNew: 0, skipped: true }
      }
    }
    const r = await execute(ctx, { trigger: args.trigger, documentId: null })
    return { ...r, skipped: false }
  },
})


