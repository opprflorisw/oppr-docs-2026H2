import { ConvexError, v } from "convex/values"
import type { ResponseSchema } from "@google/generative-ai"
import { z } from "zod"
import { action, internalAction, internalQuery, type ActionCtx, type QueryCtx } from "../_generated/server"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { requireUser } from "../lib/auth"
import { resolveScope } from "../lib/scope"
import { publishedVersion } from "../lib/published"
import { openFindingsTouching, stillStands } from "../findings"
import { meter, type AiFeature, type MeterSpec, type MeterTarget } from "../lib/aiMeter"
import { CHAT_MODEL } from "./constants"
import { CLAUDE_MODEL, claudeConfigured, claudeJson, describeClaudeError } from "./llm"
import { geminiConfigured, geminiSchemaJson } from "./gemini"
import {
  checkPoint,
  checkProse,
  shareRunSources,
  checkTableRow,
  contentStems,
  introSentenceProblem,
  INTRO_MAX_SENTENCES,
  INTRO_MAX_WORDS,
  splitSentences,
  support,
  wordCount,
  type DropReason,
  type DroppedPoint,
  type ProvidedExcerpt,
  headingFact,
} from "./grounding"
import { loadScopeOptions, type WikiFormat } from "../wikis"
import {
  DEFAULT_MAX_DANGER,
  MAX_DROPPED_DETAIL,
  pointKey,
  type BlockKind,
  type BlockOrigin,
  type BlockStatus,
  type CalloutTone,
  type Citation,
  type DroppedDetail,
  type GeneratedBlock,
  type Length,
  type Outline,
  type Point,
  type ProposedSection,
  type ReadingLevel,
  type SaveGenerationArgs,
  type SourceRef,
  type SourceSet,
} from "../lib/wikiTypes"

// Wiki generation (docs/specs/wiki-upgrade.md 3.3, 4.4, 4.9, 6.4; ADR 0003,
// 0007) and the Guided creation assistant for Wikis. The AI only fills
// blocks: every sentence it writes is grounded by code against the passage it
// cites, and anything that fails is dropped before it is saved.

/** Stored on every build and block, so a reviewer can tell prompt versions apart. */
export const PROMPT_VERSION = "wiki-v2.1"

// ---- Model calls (every one through the meter) --------------------------------

/**
 * Dev-only stand-in, enabled with `npx convex env set OPPR_AI_STUB 1`. It uses
 * no AI: blocks are filled with passages as they are (so they are grounded by
 * construction) and the guide matches words. Never enable it on production.
 */
export function aiStubEnabled(): boolean {
  return process.env.OPPR_AI_STUB === "1"
}

export const STUB_INTRO_PREFIX = "Offline stand-in, no AI:"

type Provider = "anthropic" | "google" | "stub"

/** The model a Wiki call uses now: the stub, Claude, Gemini, or none. */
export function currentModel(): { provider: Provider; model: string } | null {
  if (aiStubEnabled()) return { provider: "stub", model: "stub" }
  if (claudeConfigured()) return { provider: "anthropic", model: CLAUDE_MODEL }
  if (geminiConfigured()) return { provider: "google", model: CHAT_MODEL }
  return null
}

type JsonSchema = {
  type?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  enum?: string[]
}

/** Gemini's response schema from the same zod schema Claude gets (SchemaType values are these strings). */
function toGemini(s: JsonSchema): ResponseSchema {
  const out = (x: object) => x as ResponseSchema
  switch (s.type) {
    case "object":
      return out({
        type: "object",
        properties: Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, x]) => [k, toGemini(x)])),
        required: s.required ?? [],
      })
    case "array":
      return out({ type: "array", items: toGemini(s.items ?? {}) })
    case "boolean":
      return out({ type: "boolean" })
    case "number":
    case "integer":
      return out({ type: "number" })
    default:
      return out(s.enum ? { type: "string", format: "enum", enum: s.enum } : { type: "string" })
  }
}

export interface Turn {
  role: "user" | "assistant"
  content: string
}

/**
 * One structured model call through the metered gateways: Claude when its
 * key is set, otherwise Gemini. Throws a readable Error when it fails.
 */
export async function callJson<S extends z.ZodType>(
  ctx: Pick<ActionCtx, "runMutation">,
  opts: {
    feature: AiFeature
    personId: Id<"people"> | null
    target?: MeterTarget
    system: string
    messages: Turn[]
    schema: S
    effort: "low" | "medium" | "high"
    maxTokens?: number
  },
): Promise<{ value: z.infer<S>; model: string }> {
  const m = currentModel()
  if (!m || m.provider === "stub") throw new Error("No AI key is set on this deployment.")
  const spec: MeterSpec = { ctx, feature: opts.feature, personId: opts.personId, target: opts.target }
  if (m.provider === "anthropic") {
    try {
      const value = await claudeJson({
        system: opts.system,
        messages: opts.messages,
        schema: opts.schema,
        effort: opts.effort,
        maxTokens: opts.maxTokens,
        meter: spec,
      })
      return { value, model: m.model }
    } catch (err) {
      throw new Error(describeClaudeError(err))
    }
  }
  const text = await geminiSchemaJson(
    spec,
    { system: opts.system, schema: toGemini(z.toJSONSchema(opts.schema) as JsonSchema) },
    { contents: opts.messages.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })) },
  )
  return { value: JSON.parse(text) as z.infer<S>, model: m.model }
}

/** The stub makes no model call, but it is still one AI action on the meter. */
export async function meterStub(
  ctx: Pick<ActionCtx, "runMutation">,
  feature: AiFeature,
  personId: Id<"people"> | null,
  target?: MeterTarget,
) {
  await meter(ctx, { feature, provider: "stub", model: "stub", personId, target }, async () => ({ value: null }))
}

/** The plain message of a ConvexError or Error, for the UI. */
export function errorText(err: unknown): string {
  if (err instanceof ConvexError) return typeof err.data === "string" ? err.data : JSON.stringify(err.data)
  return err instanceof Error ? err.message : String(err)
}

// ---- Excerpts and grounding ---------------------------------------------------

export interface ExcerptDoc {
  documentId: Id<"documents">
  namingCode: string
  title: string
  version: number
  chunks: { chunkId: Id<"chunks">; text: string; section: string | null }[]
}

export interface Excerpts {
  provided: Map<string, ProvidedExcerpt>
  cite: (keys: string[]) => Citation[]
  /** Prompt lines: one DOCUMENT line per document, then one line per excerpt. */
  lines: string[]
  /** Excerpt key of each chunk. */
  keyOf: Map<string, string>
}

/** Numbers every excerpt with a short key (E1, E2, ...) the model cites. */
export function numberExcerpts(docs: ExcerptDoc[]): Excerpts {
  const provided = new Map<string, ProvidedExcerpt>()
  const meta = new Map<string, Citation>()
  const keyOf = new Map<string, string>()
  const lines: string[] = []
  let n = 0
  for (const doc of docs) {
    if (doc.chunks.length === 0) continue
    lines.push(`DOCUMENT ${doc.namingCode} v${doc.version}: ${doc.title}`)
    for (const c of doc.chunks) {
      const key = `E${++n}`
      provided.set(key, { key, text: c.text, label: `${doc.namingCode} v${doc.version} ${doc.title}` })
      meta.set(key, {
        chunkId: c.chunkId,
        documentId: doc.documentId,
        namingCode: doc.namingCode,
        version: doc.version,
        section: c.section,
      })
      keyOf.set(c.chunkId, key)
      lines.push(`[${key}]${c.section ? ` (${c.section})` : ""} ${c.text}`)
    }
    lines.push("")
  }
  return { provided, cite: (keys) => keys.map((k) => meta.get(k)!), lines, keyOf }
}

export interface RawItem {
  text?: string
  cells?: string[]
  sources?: string[]
}

function toPoint(text: string, sources: string[], ex: Excerpts, cells?: string[]): Point {
  return { text, pointKey: pointKey(text), ...(cells ? { cells } : {}), citations: ex.cite(sources) }
}

/**
 * Grounds what the model wrote for one block. Prose and the intro are checked
 * sentence by sentence (checkProse), a table row cell by cell (checkTableRow),
 * everything else point by point (checkPoint). Failures are returned, never kept.
 */
export function groundItems(
  items: RawItem[],
  kind: BlockKind,
  columns: string[],
  ex: Excerpts,
): { points: Point[]; dropped: DroppedPoint[] } {
  const points: Point[] = []
  const dropped: DroppedPoint[] = []
  const list = Array.isArray(items) ? items : []
  if (kind === "intro" || kind === "prose") {
    const r = checkProse(
      list.map((i) => ({ text: String(i?.text ?? ""), sources: Array.isArray(i?.sources) ? i.sources.map(String) : [] })),
      ex.provided,
    )
    return { points: shareRunSources(r.kept, ex.provided).map((p) => toPoint(p.text, p.sources, ex)), dropped: r.dropped }
  }
  const isTable = kind === "table" && columns.length >= 2
  const listed: { text: string; sources: string[] }[] = []
  for (const i of list) {
    const sources = Array.isArray(i?.sources) ? i.sources.map(String) : []
    if (isTable) {
      const r = checkTableRow({ columns, cells: Array.isArray(i?.cells) ? i.cells.map(String) : [], sources }, ex.provided)
      if (r.ok) points.push(toPoint(r.point.text, r.point.sources, ex, r.point.cells))
      else dropped.push((r as { dropped: DroppedPoint }).dropped)
      continue
    }
    const r = checkPoint({ text: String(i?.text ?? ""), sources }, ex.provided)
    if (r.ok) listed.push(r.point)
    else dropped.push((r as { dropped: DroppedPoint }).dropped)
  }
  for (const p of shareRunSources(listed, ex.provided)) points.push(toPoint(p.text, p.sources, ex))
  return { points, dropped }
}

// ---- Page-level steps after grounding (spec 4.4, 5.4, D5) -----------------------

export interface FindingSide {
  chunkId: Id<"chunks"> | null
  namingCode: string
  version: number
  quote: string
}

export interface OpenFinding {
  findingId: Id<"findings">
  a: FindingSide
  b: FindingSide
}

export interface PageBlock {
  ref: string
  kind: BlockKind
  tone?: CalloutTone
  columns?: string[]
  points: Point[]
  dropped: DroppedPoint[]
  hidden?: string[]
  /** Already on the page and not rebuilt now: its points count as said, and are never dropped. */
  fixed?: boolean
}

const chunkSet = (p: Point) => p.citations.map((c) => String(c.chunkId)).sort().join(",")

/**
 * Runs on every page a build or block generation produces, in this order:
 * hidden points removed; `disputed` set from the open Finding a point leans
 * on, or the point withheld when the other side cannot be quoted (5.4); each
 * fact kept once, by priority danger callout, intro, key points, then page
 * order (4.4); danger callouts past `maxDanger` turned into warnings (D5).
 * Mutates the blocks; returns how many callouts were turned.
 */
export function finishPage(blocks: PageBlock[], opts: { findings: OpenFinding[]; maxDanger: number | null }): number {
  for (const b of blocks) {
    if (b.fixed) continue
    const hidden = new Set(b.hidden ?? [])
    const kept: Point[] = []
    for (const p of b.points) {
      if (hidden.has(p.pointKey)) continue
      const chunks = new Set(p.citations.map((c) => String(c.chunkId)))
      const f = opts.findings.find(
        (x) => (x.a.chunkId && chunks.has(x.a.chunkId)) || (x.b.chunkId && chunks.has(x.b.chunkId)),
      )
      if (f) {
        const other = f.a.chunkId && chunks.has(f.a.chunkId) ? f.b : f.a
        if (!other.quote.trim()) {
          b.dropped.push({ text: p.text, reason: "disputed", detail: `${other.namingCode} v${other.version} could not be quoted` })
          continue
        }
        p.disputed = {
          findingId: f.findingId,
          otherNamingCode: other.namingCode,
          otherVersion: other.version,
          otherQuote: other.quote.slice(0, 400),
        }
      }
      kept.push(p)
    }
    b.points = kept
  }

  const seen: { key: string; chunks: string; text: string }[] = []
  for (const b of blocks)
    if (b.fixed) for (const p of b.points) seen.push({ key: p.pointKey, chunks: chunkSet(p), text: p.text })
  const rank = (b: PageBlock) =>
    b.kind === "callout" && b.tone === "danger" ? 0 : b.kind === "intro" ? 1 : b.kind === "keyPoints" ? 2 : 3
  const order = blocks.map((b, i) => ({ b, i })).sort((x, y) => rank(x.b) - rank(y.b) || x.i - y.i)
  for (const { b } of order) {
    if (b.fixed) continue
    b.points = b.points.filter((p) => {
      const chunks = chunkSet(p)
      const dup = seen.some(
        (s) =>
          s.key === p.pointKey ||
          (s.chunks === chunks && support(p.text, s.text) >= 0.8 && support(s.text, p.text) >= 0.8),
      )
      if (dup) {
        b.dropped.push({ text: p.text, reason: "duplicate" })
        return false
      }
      seen.push({ key: p.pointKey, chunks, text: p.text })
      return true
    })
  }

  let turned = 0
  if (opts.maxDanger != null) {
    let dangers = 0
    for (const b of blocks) {
      if (b.kind !== "callout" || b.tone !== "danger" || b.points.length === 0) continue
      dangers += 1
      if (dangers > opts.maxDanger && !b.fixed) {
        b.tone = "warning"
        turned += 1
      }
    }
  }
  return turned
}

/** Intro rules code can enforce (4.9): no heading restated, no "This Wiki" opener, 4 sentences, under 90 words. */
export function finishIntro(points: Point[], dropped: DroppedPoint[], headings: string[]): Point[] {
  const out: Point[] = []
  let words = 0
  for (const p of points) {
    const problem = introSentenceProblem(p.text, headings)
    if (problem) {
      dropped.push({ text: p.text, reason: "intro-rule", detail: problem })
      continue
    }
    const w = wordCount(p.text)
    if (out.length >= INTRO_MAX_SENTENCES || words + w >= INTRO_MAX_WORDS) {
      dropped.push({ text: p.text, reason: "over-length", detail: `the introduction stays under ${INTRO_MAX_WORDS} words` })
      continue
    }
    out.push(p)
    words += w
  }
  return out
}

export const MAX_KEY_POINTS = 5

const LENGTH_CAPS: Record<Length, { sections: number; points: number }> = {
  oneScreen: { sections: 5, points: 4 },
  normal: { sections: 8, points: 8 },
  full: { sections: Infinity, points: 15 },
}

export function lengthCaps(length: Length | null) {
  return LENGTH_CAPS[length ?? "normal"]
}

/** Floor when the purpose names operators or shifts (spec 3.3), Office otherwise. */
export function readingLevelFor(level: ReadingLevel | null, purpose: string): ReadingLevel {
  return level ?? (/\b(?:operators?|shifts?|ploeg\w*)\b/i.test(purpose) ? "floor" : "office")
}

/** Keeps at most `max` points, the rest recorded as left out for length. */
export function capPoints(points: Point[], max: number, dropped: DroppedPoint[]): Point[] {
  if (points.length <= max) return points
  for (const p of points.slice(max)) dropped.push({ text: p.text, reason: "over-length", detail: "the chosen length" })
  return points.slice(0, max)
}

const DROP_TEXT: Record<DropReason, string> = {
  "no-valid-source": "It cited no passage that was read",
  "no-citation": "It had no source",
  "unsupported-token": "A value or code in it is not in the cited passage",
  "weak-support": "The cited passage does not say this",
  "negation-mismatch": "It turns around what the passage says",
  "meaning-mismatch": "It changes what the passage says",
  duplicate: "It is already said elsewhere on this page",
  disputed: "It rests on Documents that disagree, and the other side could not be quoted",
  "over-length": "Left out to keep to the chosen length",
  "intro-rule": "It breaks a rule for the introduction",
}

/** The first MAX_DROPPED_DETAIL dropped points with a plain-language reason (Phase 1.5 sheet). */
export function dropDetails(items: { dropped: DroppedPoint; blockId?: string }[]): DroppedDetail[] {
  return items.slice(0, MAX_DROPPED_DETAIL).map(({ dropped: d, blockId }) => ({
    text: d.text.slice(0, 300),
    reason: d.reason,
    detail: d.detail ? `${DROP_TEXT[d.reason] ?? d.reason}: ${d.detail}` : DROP_TEXT[d.reason] ?? d.reason,
    ...(blockId ? { blockId } : {}),
  }))
}

// ---- The prompt contract (spec 4.9) ---------------------------------------------

const WRITING_RULES = [
  "You write part of a Wiki inside Oppr Knowledge, a factory's controlled knowledge base.",
  "A Wiki is a page for the reader named in PURPOSE AND AUDIENCE, built ONLY from the numbered EXCERPTS of Published documents you are given. Nothing else you know counts.",
  "People read it at a machine, in the office or on a printout. Every sentence and point is checked by code against the excerpts it cites; one that fails the check is deleted, so a careless sentence is simply lost.",
  "",
  "Writing:",
  "- One fact or one instruction per sentence or point, in plain language that fits the reader. Use the imperative for instructions.",
  "- Stay close to the wording of the excerpt. Paraphrase only to make it shorter or clearer, never to add meaning.",
  "- Write numbers as digits with the unit exactly as the excerpt writes it (40 Nm, 190 °C, 20 %, 170-220 °C). Copy codes such as PX-4400 or EXL-201 exactly.",
  "- Keep every prohibition and warning as strong as the excerpt says it: never turn \"never\" or \"do not\" into a permission, and never drop a condition (\"while the line is only stopped\", \"at operating temperature\").",
  "- Do not invent step numbers, reasons, consequences, tolerances or best practices that the excerpts do not state.",
  "- Do not add qualifiers the excerpt does not use: no \"usually\", \"likely\", \"always\", \"at least\", \"at most\", \"minimum\", \"maximum\" or \"only\" unless the cited excerpt says it. Keep \"or\" as \"or\".",
  "- Every sentence states a fact from the excerpts. Write no sentence that carries no fact (no \"Read on\", no \"Here is what you need to know\").",
  "- Never use em dashes. Use a comma, a colon or a full stop instead.",
  "",
  "Citing:",
  "- `sources` lists the keys of the excerpts that state what the sentence or point says (for example [\"E3\", \"E7\"]). Only use keys that appear in EXCERPTS.",
  "- Cite the excerpt that states the fact, not one that is merely about the same topic. If a sentence combines facts from several excerpts, cite every one of them.",
  "- Sentences in a row that rest on the same excerpts must give exactly the same `sources` list (the same keys). The page shows one marker for such a run of up to 3 sentences, so the text reads as running prose. Write a paragraph from one group of excerpts, then move to the next, rather than switching excerpts every sentence.",
  "- Example: [{text: \"Raw material moves from the silos to the mixers.\", sources: [\"E2\", \"E5\"]}, {text: \"The mixers feed the extruders.\", sources: [\"E2\", \"E5\"]}] gives one marker; giving the second sentence only [\"E5\"] would give two.",
  "- If two excerpts disagree (two documents give different values), write ONE sentence or point that states both values, says which document gives which (by document type or title, such as \"the changeover SOP\" and \"the supplier manual\"), and cites both. Do not choose between them and do not average them.",
]

const LEVEL_RULES: Record<ReadingLevel, string> = {
  floor:
    "READING LEVEL: Floor. Sentences under 15 words, everyday words, one fact per sentence, imperative for actions.",
  office:
    "READING LEVEL: Office. Sentences under 22 words, full technical terms; you may say why when an excerpt says why.",
}

const LENGTH_RULES: Record<Length, string> = {
  oneScreen: "LENGTH: One screen. At most 5 sections and 4 points per section.",
  normal: "LENGTH: Normal. At most 8 sections and 8 points per section.",
  full: "LENGTH: Full. As many sections as the excerpts support, at most 15 points per section.",
}

const KIND_RULES = [
  "Block kinds:",
  "- prose: a paragraph of 2 to 4 sentences, each its own point with its own sources.",
  "- bullets: separate facts, one per point.",
  "- steps: a procedure whose order matters. Points in the order of the excerpts, one action each, no numbers in the text.",
  "- table: values that compare across the same columns (settings, limits, intervals, PPE per task). Set `columns` to 2 to 4 short headings taken from the excerpts; each point is one row: `cells` holds the row's values in column order, copied from the excerpt, and `text` repeats the row as one sentence. Every other kind sets `columns` and `cells` to [].",
  "- callout: 1 to 3 short points that must stand out.",
]

const INTRO_RULES = [
  "Introduction (`intro`): 2 to 4 sentences, under 90 words in total. Every sentence cites; sentences that rest on the same excerpts share one `sources` list, so the introduction shows 2 or 3 markers, not one per sentence.",
  "- Sentence 1 says what the plant or area does within these excerpts. Sentence 2 says how it fits together (flow, areas, lines). Sentences 3 and 4 say what matters most for this reader.",
  "- No sentence restates the title or a section heading. Never open with \"This Wiki\", \"This guide\" or \"In this overview\": code writes what the Wiki covers.",
  "Key points (`keyPoints`): at most 5 short lines, the facts the reader must remember if they read nothing else (the main hazard, the critical value, the step people get wrong). Each cites its excerpts. A key point says a fact shorter; never copy a sentence from the introduction or a section word for word.",
  "",
  "Example of an acceptable introduction (illustrative wording only; never copy its facts, every fact you write must come from the cited excerpts):",
  "\"Pijpwerk Noord makes PE pressure pipe: compound is prepared in Mixing, extruded on the lines in Extrusion and released by Quality Control. Raw material moves one way, from the silos through the mixers to the extruders, and every coil is held until its gauge and pressure checks pass. The highest risks in your first month are hot work at the die and barrel, which only trained people do with the line locked out. Release decisions belong to Quality Control, so a coil on hold stays on hold until they clear it.\"",
]

const FORMAT_RULES: Record<WikiFormat, string[]> = {
  overview: [
    "FORMAT: Overview. Sections of key facts. Use steps where the excerpts give a procedure and a table where they give comparable values; bullets otherwise.",
  ],
  steps: [
    "FORMAT: Step by step. Build the Wiki around doing the job: an optional safety section first, then \"Before you start\", then one or more steps sections in the order of the job, then \"When you are done\" or \"If something goes wrong\" when the excerpts cover it.",
  ],
  reference: [
    "FORMAT: Quick reference. Build the Wiki for looking things up: prefer tables for values, settings, limits, intervals and codes, and short bullets for rules. A safety section stays first when it applies.",
  ],
}

function settingLines(level: ReadingLevel, length: Length | null) {
  return [LEVEL_RULES[level], LENGTH_RULES[length ?? "normal"]]
}

function proposeSystem(format: WikiFormat, level: ReadingLevel, length: Length | null, maxDanger: number) {
  return [
    ...WRITING_RULES,
    "",
    ...settingLines(level, length),
    "",
    ...INTRO_RULES,
    "",
    "Sections:",
    "- Each section has a short heading in sentence case (only the first word and names capitalised) that says what the reader gets, such as \"Before you start\" or \"Settings per pipe size\", and a one-line `instruction` saying what it covers for this reader (\"For a plant manager: who decides what in week 1\").",
    "- A section holds one or more blocks. Open a section with 3 or more points with a prose block of one or two sentences that leads into it.",
    "- A callout sets `tone`: \"danger\" only for what can hurt someone, \"warning\" for what can damage product or equipment, \"tip\" for help. Use tone \"danger\" for at most " +
      `${maxDanger} callouts in the whole Wiki. Every other block sets \`tone\` to "none".`,
    "- Set `safety` to true on a section about hazards, PPE, lockout or what never to do. Put it first when it applies to the whole job. Keep safety sections short.",
    "- Each fact appears once on the page: not in two sections, not in a section and a callout.",
    "- Leave out what does not serve the purpose. If the excerpts do not cover something the purpose asks for, leave it out rather than fill the gap.",
    "",
    ...KIND_RULES,
    "",
    ...FORMAT_RULES[format],
  ].join("\n")
}

function outlineSystem(level: ReadingLevel, length: Length | null, ids: string[]) {
  return [
    ...WRITING_RULES,
    "",
    ...settingLines(level, length),
    "",
    ...INTRO_RULES,
    "",
    `OUTLINE: Engineers fixed this Wiki's sections and blocks. Fill exactly these blocks by id: [${ids.join(", ")}]. Keep their headings and kinds; do not invent sections or blocks.`,
    "- Return each block's `blockId` and its points, following the block's kind and instruction. A block marked \"own reading level\" or \"own length\" follows that instead.",
    "- Return in `gaps` the id of every block whose instruction the excerpts cannot support, with no points for it. Do not fill a gap with loosely related facts.",
    "- ALREADY ON THE PAGE lists facts that other blocks show. Do not repeat them.",
    "",
    ...KIND_RULES,
  ].join("\n")
}

export function blockSystem(level: ReadingLevel, length: Length | null) {
  return [
    ...WRITING_RULES,
    "",
    ...settingLines(level, length),
    "",
    "TASK: Write ONE block of a Wiki section, of the kind given in BLOCK, from the excerpts only. It covers what the block's instruction asks, for the reader in PURPOSE AND AUDIENCE.",
    "- If the excerpts do not support the instruction, set `gap` to true and return no points. Do not fill a gap with loosely related facts.",
    "- ALREADY ON THE PAGE lists facts that other blocks show. Do not repeat them.",
    "- For kind intro, follow the introduction rules below; for kind keyPoints, the key points rules.",
    "",
    ...KIND_RULES,
    "",
    ...INTRO_RULES,
  ].join("\n")
}

/** "Use the Published wording" (spec 3.5): the Engineer's claim restated from its passages. */
export function rewriteSystem() {
  return [
    ...WRITING_RULES,
    "",
    "TASK: An Engineer wrote CLAIM, but the Published excerpts say it differently. Rewrite the claim in one or two sentences so that it states exactly what the EXCERPTS say about the same subject, as close to the excerpt's wording as you can. Keep the Engineer's topic. Keep no value, code or condition from the claim that the excerpts do not state. Each sentence cites its excerpts in `sources`.",
  ].join("\n")
}

const Sentence = z.object({ text: z.string(), sources: z.array(z.string()) })
const Item = z.object({ text: z.string(), cells: z.array(z.string()), sources: z.array(z.string()) })
const ProposeOut = z.object({
  intro: z.array(Sentence),
  keyPoints: z.array(Sentence),
  sections: z.array(
    z.object({
      heading: z.string(),
      instruction: z.string(),
      safety: z.boolean(),
      blocks: z.array(
        z.object({
          kind: z.enum(["prose", "bullets", "steps", "table", "callout"]),
          tone: z.enum(["none", "danger", "warning", "tip"]),
          columns: z.array(z.string()),
          points: z.array(Item),
        }),
      ),
    }),
  ),
})
const OutlineOut = z.object({
  intro: z.array(Sentence),
  keyPoints: z.array(Sentence),
  blocks: z.array(z.object({ blockId: z.string(), columns: z.array(z.string()), points: z.array(Item) })),
  gaps: z.array(z.string()),
})
export const BlockOut = z.object({ gap: z.boolean(), columns: z.array(z.string()), points: z.array(Item) })
type ProposeRaw = z.infer<typeof ProposeOut>
type OutlineRaw = z.infer<typeof OutlineOut>

// ---- Context for a build or a block ----------------------------------------------

export interface ContextBlock {
  blockId: string
  sectionId: string
  order: string
  kind: BlockKind
  origin: BlockOrigin
  status: BlockStatus
  tone: CalloutTone | null
  columns: string[] | null
  instruction: string | null
  sourceSet: SourceSet
  pinnedChunkIds: Id<"chunks">[]
  hiddenPointKeys: string[]
  readingLevel: ReadingLevel | null
  length: Length | null
  dependsOn: { documentId: Id<"documents">; version: number }[]
  points: Point[]
}

export interface GenerationContext {
  title: string
  purpose: string
  outline: Outline | null
  lastTrigger: string | null
  /** documentId@version of the last build's sources. */
  builtFrom: string[]
  settings: { maxDanger: number; readingLevel: ReadingLevel | null; length: Length | null }
  /** Published Documents in Scope, at their live version. */
  scopeDocs: { documentId: Id<"documents">; version: number }[]
  /** Live version of every Document a block depends on (null: no longer Published). */
  liveVersions: { documentId: Id<"documents">; version: number | null }[]
  /** Live block rows, in Outline order. */
  blocks: ContextBlock[]
  findings: OpenFinding[]
}

async function openContradictionSides(ctx: QueryCtx, documentIds: Id<"documents">[]): Promise<OpenFinding[]> {
  const seen = new Set<string>()
  const out: OpenFinding[] = []
  const side = (s: { chunkId: Id<"chunks"> | null; namingCode: string; version: number; quote: string }) => ({
    chunkId: s.chunkId,
    namingCode: s.namingCode,
    version: s.version,
    quote: s.quote,
  })
  for (const id of documentIds.slice(0, 40)) {
    for (const f of await openFindingsTouching(ctx, id)) {
      if (f.kind !== "contradiction" || seen.has(f._id)) continue
      seen.add(f._id)
      if (await stillStands(ctx, f)) out.push({ findingId: f._id, a: side(f.a), b: side(f.b) })
    }
  }
  return out
}

export const generationContext = internalQuery({
  args: { wikiId: v.id("wikis") },
  handler: async (ctx, args): Promise<GenerationContext | null> => {
    const wiki = await ctx.db.get(args.wikiId)
    if (!wiki) return null
    const { published } = await resolveScope(ctx, wiki.scope)
    const rows = await ctx.db
      .query("wikiBlocks")
      .withIndex("by_wikiId_and_state", (q) => q.eq("wikiId", args.wikiId).eq("state", "live"))
      .take(1000)
    const sectionIndex = new Map((wiki.outline?.sections ?? []).map((s, i) => [s.id, i]))
    rows.sort(
      (a, b) => (sectionIndex.get(a.sectionId) ?? 1e9) - (sectionIndex.get(b.sectionId) ?? 1e9) || a.order.localeCompare(b.order),
    )
    const live = new Map<string, number | null>(published.map((d) => [d._id as string, d.liveVersion as number]))
    for (const r of rows)
      for (const d of r.dependsOn)
        if (!live.has(d.documentId)) {
          const doc = await ctx.db.get(d.documentId)
          live.set(d.documentId, doc ? publishedVersion(doc) : null)
        }
    return {
      title: wiki.title,
      purpose: wiki.purpose,
      outline: wiki.outline ?? null,
      lastTrigger: wiki.lastTrigger,
      builtFrom: wiki.sources.map((s) => `${s.documentId}@${s.version}`),
      settings: {
        maxDanger: wiki.maxDanger ?? DEFAULT_MAX_DANGER,
        readingLevel: wiki.readingLevel ?? null,
        length: wiki.length ?? null,
      },
      scopeDocs: published.map((d) => ({ documentId: d._id, version: d.liveVersion as number })),
      liveVersions: [...live].map(([documentId, version]) => ({ documentId: documentId as Id<"documents">, version })),
      blocks: rows.map((r) => ({
        blockId: r.blockId,
        sectionId: r.sectionId,
        order: r.order,
        kind: r.kind,
        origin: r.origin,
        status: r.status,
        tone: r.tone ?? null,
        columns: r.columns ?? null,
        instruction: r.instruction ?? null,
        sourceSet: r.sourceSet,
        pinnedChunkIds: r.pinnedChunkIds,
        hiddenPointKeys: r.hiddenPointKeys,
        readingLevel: r.readingLevel ?? null,
        length: r.length ?? null,
        dependsOn: r.dependsOn,
        points: r.points,
      })),
      findings: await openContradictionSides(
        ctx,
        published.map((d) => d._id),
      ),
    }
  },
})

/** Blocks of other sections and the rest of the page, as fixed blocks for finishPage. */
export function fixedBlocks(blocks: ContextBlock[]): PageBlock[] {
  return blocks.map((b) => ({
    ref: b.blockId,
    kind: b.kind,
    tone: b.tone ?? undefined,
    points: b.points.filter((p) => !b.hiddenPointKeys.includes(p.pointKey)),
    dropped: [],
    fixed: true,
  }))
}

/** "ALREADY ON THE PAGE" lines for the prompt. */
export function alreadyOnPage(blocks: PageBlock[], max = 80): string[] {
  const lines = blocks.flatMap((b) => b.points.map((p) => `- ${p.text}`))
  return lines.length ? ["ALREADY ON THE PAGE:", ...lines.slice(0, max), ""] : []
}

async function plantBriefing(ctx: Pick<ActionCtx, "runQuery">): Promise<string[]> {
  try {
    const briefing: string = await ctx.runQuery(internal.plant.context.forAi, {})
    return briefing
      ? [briefing, "Use the briefing only to understand the plant's words. Never write a sentence or point from it.", ""]
      : []
  } catch (err) {
    console.warn("Wiki: plant briefing failed", err)
    return []
  }
}

// ---- The full build ----------------------------------------------------------------

interface GenerationDoc extends ExcerptDoc {
  excerptsTotal: number
}

// Triggers a person pressed (create, Scope change, Rebuild now) or the dev
// checks: every generated block is rebuilt. Publish, archive, delete and the
// nightly run rebuild only blocks whose sources changed (spec 3.8).
const MANUAL_TRIGGER = /^(?:created by|scope changed by|rebuilt by) |^devChecks$/

interface BuildPlan {
  shared: ContextBlock[]
  own: ContextBlock[]
  intro: ContextBlock | null
  keyPoints: ContextBlock | null
}

function planOutlineBuild(gc: GenerationContext): BuildPlan {
  const force = MANUAL_TRIGGER.test(gc.lastTrigger ?? "")
  const live = new Map(gc.liveVersions.map((d) => [d.documentId as string, d.version]))
  const scopeNow = new Set(gc.scopeDocs.map((d) => `${d.documentId}@${d.version}`))
  const before = new Set(gc.builtFrom)
  const changedDocs = new Set<string>()
  for (const k of scopeNow) if (!before.has(k)) changedDocs.add(k.split("@")[0])
  for (const k of before) if (!scopeNow.has(k)) changedDocs.add(k.split("@")[0])
  const introSection = gc.outline?.sections.find((s) => s.role === "intro")
  const plan: BuildPlan = { shared: [], own: [], intro: null, keyPoints: null }
  let anyRebuilt = false
  for (const b of gc.blocks) {
    if (b.origin !== "generated" || b.kind === "images") continue
    const stale = b.dependsOn.some((d) => live.get(d.documentId) !== d.version)
    const sourcesChanged =
      b.sourceSet === "scope" ? changedDocs.size > 0 : b.sourceSet.documentIds.some((id) => changedDocs.has(id))
    const needs = force || b.status === "generating" || b.status === "failed" || stale || sourcesChanged
    if (b.sectionId === introSection?.id && (b.kind === "intro" || b.kind === "keyPoints")) {
      if (gc.outline?.introEnabled === false) continue
      if (b.kind === "intro") plan.intro = needs ? b : plan.intro
      else plan.keyPoints = needs ? b : plan.keyPoints
      continue
    }
    if (!needs) continue
    anyRebuilt = true
    if (b.sourceSet !== "scope" || b.pinnedChunkIds.length > 0) plan.own.push(b)
    else plan.shared.push(b)
  }
  // The intro and key points summarise the page: rebuild them with it.
  if (anyRebuilt && introSection && gc.outline?.introEnabled !== false) {
    const own = gc.blocks.filter((b) => b.sectionId === introSection.id && b.origin === "generated")
    plan.intro ??= own.find((b) => b.kind === "intro") ?? null
    plan.keyPoints ??= own.find((b) => b.kind === "keyPoints") ?? null
  }
  return plan
}

// A heading names a topic and is never checked (ADR 0007), so a value or
// Document code the AI put in it is taken out, the same rule people get.
function topicHeading(heading: string): string {
  let h = heading.trim()
  for (let fact = headingFact(h); fact; fact = headingFact(h)) {
    const next = h.replace(fact, " ").replace(/\s{2,}/g, " ").replace(/\s+([,.:;)])/g, "$1").trim()
    if (next === h) {
      // The value is spelled differently in the heading: drop every word with a digit.
      h = h.split(/\s+/).filter((w) => !/\d/.test(w)).join(" ")
      break
    }
    h = next
  }
  return h.replace(/^(for|of|at|with)\s+/i, "").replace(/\s+(for|of|at|with)$/i, "").trim()
}

function introHeadings(title: string, headings: string[]) {
  return [title, ...headings.filter((h) => h.toLowerCase() !== "introduction")]
}

/** Intro and key points from raw sentences: grounded, rubric applied, capped. */
function introAndKeys(
  raw: { intro: RawItem[]; keyPoints: RawItem[] },
  ex: Excerpts,
  headings: string[],
): { intro: PageBlock; keyPoints: PageBlock } {
  const i = groundItems(raw.intro, "intro", [], ex)
  const k = groundItems(raw.keyPoints, "keyPoints", [], ex)
  return {
    intro: { ref: "intro", kind: "intro", points: finishIntro(i.points, i.dropped, headings), dropped: i.dropped },
    keyPoints: { ref: "keyPoints", kind: "keyPoints", points: capPoints(k.points, MAX_KEY_POINTS, k.dropped), dropped: k.dropped },
  }
}

function asGenerated(b: PageBlock, blockId: string): GeneratedBlock {
  return {
    blockId,
    points: b.points,
    dropped: b.dropped,
    ...(b.points.length === 0 ? { gap: true } : {}),
    ...(b.kind === "table" && b.columns?.length ? { columns: b.columns } : {}),
  }
}

export const generate = internalAction({
  args: {
    wikiId: v.id("wikis"),
    ticket: v.number(),
    // Who pressed the button; absent or null for system rebuilds (publish, nightly, migration).
    personId: v.optional(v.union(v.id("people"), v.null())),
  },
  handler: async (ctx, args): Promise<void> => {
    const input: {
      title: string
      purpose: string
      format: WikiFormat
      ticket: number
      docs: GenerationDoc[]
    } | null = await ctx.runQuery(internal.wikis.loadForGeneration, { wikiId: args.wikiId })
    // Deleted, or a newer request already took over.
    if (!input || input.ticket !== args.ticket) return
    const gc: GenerationContext | null = await ctx.runQuery(internal.ai.wiki.generationContext, { wikiId: args.wikiId })
    if (!gc) return
    const personId = args.personId ?? null
    const target = { kind: "wiki", id: args.wikiId as string }
    const mode: SaveGenerationArgs["mode"] = gc.outline ? "outline" : "propose"
    const sources: SourceRef[] = input.docs.map((d) => ({
      documentId: d.documentId,
      namingCode: d.namingCode,
      title: d.title,
      version: d.version,
      excerptsUsed: d.chunks.length,
      excerptsTotal: d.excerptsTotal,
    }))
    const model = currentModel()
    const save: Save = (fields) =>
      ctx.runMutation(internal.wikis.saveGeneration, {
        wikiId: args.wikiId,
        ticket: args.ticket,
        promptVersion: PROMPT_VERSION,
        sources,
        mode,
        model: fields.model ?? model?.model ?? "none",
        ...fields,
      })
    const failed = (error: string) => save({ status: "failed", error: error.slice(0, 400), droppedPoints: 0 })

    const withText = input.docs.filter((d) => d.chunks.length > 0)
    if (withText.length === 0) {
      await save({ status: "empty", error: null, droppedPoints: 0 })
      return
    }
    const plan = mode === "outline" ? planOutlineBuild(gc) : null
    const scheduleOwn = async () => {
      for (const b of plan?.own ?? [])
        await ctx.scheduler.runAfter(0, internal.ai.wikiBlock.regenerateBlock, { wikiId: args.wikiId, blockId: b.blockId })
    }
    if (plan && plan.shared.length === 0 && !plan.intro && !plan.keyPoints) {
      // No shared block changed: recompose only, no AI call here.
      await save({ status: "ready", error: null, blocks: [], droppedPoints: 0 })
      await scheduleOwn()
      return
    }
    if (!model) {
      await failed("No AI key is set on this deployment.")
      return
    }

    let actionId: Id<"aiUsage">
    try {
      actionId = await ctx.runMutation(internal.lib.aiBudget.start, { action: "wikiBuild", personId, wikiId: args.wikiId })
    } catch (err) {
      await failed(errorText(err))
      return
    }
    let ok = false
    let error: string | undefined
    try {
      const ex = numberExcerpts(withText)
      const level = readingLevelFor(gc.settings.readingLevel, input.purpose)
      const caps = lengthCaps(gc.settings.length)
      const header = [
        ...(model.provider === "stub" ? [] : await plantBriefing(ctx)),
        `WIKI TITLE: ${input.title}`,
        `PURPOSE AND AUDIENCE: ${input.purpose || "(not specified)"}`,
        "",
      ]
      if (plan) {
        await buildOutline(ctx, { gc, plan, ex, docs: withText, header, level, caps, personId, target, model, save })
        await scheduleOwn()
      } else {
        await buildProposed(ctx, {
          gc,
          ex,
          docs: withText,
          header,
          format: input.format,
          level,
          caps,
          personId,
          target,
          model,
          save,
          failed,
        })
      }
      ok = true
    } catch (err) {
      error = errorText(err)
      await failed(`Generation failed: ${error}`)
    } finally {
      await ctx.runMutation(internal.lib.aiBudget.finish, { actionId, ok, ...(error ? { error } : {}) })
    }
  },
})

type Save = (
  fields: Omit<SaveGenerationArgs, "wikiId" | "ticket" | "promptVersion" | "sources" | "mode" | "model"> & { model?: string },
) => Promise<unknown>

interface BuildInput {
  gc: GenerationContext
  ex: Excerpts
  docs: ExcerptDoc[]
  header: string[]
  level: ReadingLevel
  caps: { sections: number; points: number }
  personId: Id<"people"> | null
  target: MeterTarget
  model: { provider: Provider; model: string }
  save: Save
}

/** First build: the AI proposes the sections and blocks, which become the Outline. */
async function buildProposed(
  ctx: ActionCtx,
  b: BuildInput & { format: WikiFormat; failed: (e: string) => Promise<unknown> },
) {
  let raw: ProposeRaw
  if (b.model.provider === "stub") {
    await meterStub(ctx, "wiki.build", b.personId, b.target)
    raw = stubPropose(b.docs, b.ex)
  } else {
    raw = (
      await callJson(ctx, {
        feature: "wiki.build",
        personId: b.personId,
        target: b.target,
        system: proposeSystem(b.format, b.level, b.gc.settings.length, b.gc.settings.maxDanger),
        messages: [{ role: "user", content: [...b.header, "EXCERPTS:", ...b.ex.lines].join("\n") }],
        schema: ProposeOut,
        effort: "medium",
      })
    ).value
  }

  const sections: { s: ProposeRaw["sections"][number]; blocks: PageBlock[] }[] = []
  const lengthDropped: DroppedPoint[] = []
  for (const s of (raw.sections ?? []).slice(0, 40)) {
    s.heading = topicHeading(String(s.heading ?? ""))
    if (!s.heading) continue
    const blocks: PageBlock[] = []
    let left = b.caps.points
    for (const [i, rb] of (s.blocks ?? []).entries()) {
      const columns = Array.isArray(rb.columns) ? rb.columns.map((c) => String(c).trim()).filter(Boolean) : []
      const kind: BlockKind =
        rb.kind === "table" ? (columns.length >= 2 ? "table" : "bullets") : PROPOSED_KINDS.includes(rb.kind) ? rb.kind : "bullets"
      const g = groundItems(rb.points ?? [], kind, columns, b.ex)
      let points = kind === "callout" ? capPoints(g.points, 3, g.dropped) : g.points
      points = capPoints(points, Math.max(0, left), g.dropped)
      left -= points.length
      const tone: CalloutTone | undefined =
        kind === "callout" ? (rb.tone === "danger" || rb.tone === "warning" ? rb.tone : "tip") : undefined
      blocks.push({ ref: `${sections.length}.${i}`, kind, tone, ...(kind === "table" ? { columns } : {}), points, dropped: g.dropped })
    }
    sections.push({ s, blocks })
  }
  // Sections past the length cap are left out whole, after the ones that hold points.
  const filled = sections.filter((x) => x.blocks.some((bl) => bl.points.length > 0))
  for (const x of filled.slice(b.caps.sections))
    for (const bl of x.blocks) for (const p of bl.points) lengthDropped.push({ text: p.text, reason: "over-length", detail: "the chosen length" })
  const kept = filled.slice(0, b.caps.sections)

  const headings = introHeadings(b.gc.title, kept.map((x) => String(x.s.heading).trim()))
  const top = introAndKeys(raw, b.ex, headings)
  const all = [top.intro, top.keyPoints, ...kept.flatMap((x) => x.blocks)]
  const turned = finishPage(all, { findings: b.gc.findings, maxDanger: b.gc.settings.maxDanger })

  const proposed: ProposedSection[] = kept
    .map((x) => ({
      heading: String(x.s.heading).trim(),
      ...(String(x.s.instruction ?? "").trim() ? { instruction: String(x.s.instruction).trim().slice(0, 200) } : {}),
      ...(x.s.safety ? { safety: true } : {}),
      blocks: x.blocks
        .filter((bl) => bl.points.length > 0)
        .map((bl) => ({
          kind: bl.kind,
          ...(bl.tone ? { tone: bl.tone } : {}),
          ...(bl.columns ? { columns: bl.columns } : {}),
          points: bl.points,
        })),
    }))
    .filter((s) => s.blocks.length > 0)

  const dropped = [
    ...all.flatMap((bl) => bl.dropped.map((d) => ({ dropped: d }))),
    ...lengthDropped.map((d) => ({ dropped: d })),
  ]
  for (const d of dropped) logDrop(b.target.id, d.dropped)
  if (turned) console.log(`Wiki ${b.target.id}: ${turned} danger callouts turned into warnings (maxDanger ${b.gc.settings.maxDanger})`)
  if (proposed.length === 0) {
    await b.failed("The model returned nothing that could be traced to a Published source.")
    return
  }
  await b.save({
    model: b.model.model,
    status: "ready",
    error: null,
    proposed,
    intro: asGenerated(top.intro, ""),
    keyPoints: asGenerated(top.keyPoints, ""),
    droppedPoints: dropped.length,
    droppedDetail: dropDetails(dropped),
  })
}

/** Later builds: one call fills the Outline's generated blocks that need it, by id. */
async function buildOutline(ctx: ActionCtx, b: BuildInput & { plan: BuildPlan }) {
  const { gc, plan } = b
  const sectionOf = new Map((gc.outline?.sections ?? []).map((s) => [s.id, s]))
  const ids = plan.shared.map((x) => x.blockId)
  let raw: OutlineRaw
  const rebuilt = new Set([...ids, plan.intro?.blockId, plan.keyPoints?.blockId].filter(Boolean) as string[])
  const fixed = fixedBlocks(gc.blocks.filter((x) => !rebuilt.has(x.blockId)))
  if (b.model.provider === "stub") {
    await meterStub(ctx, "wiki.build", b.personId, b.target)
    raw = stubOutline(plan.shared, sectionOf, b.docs, b.ex)
  } else {
    const blockLines = plan.shared.flatMap((x) => {
      const s = sectionOf.get(x.sectionId)
      return [
        `BLOCK ${x.blockId}: kind ${x.kind}${x.tone ? `, tone ${x.tone}` : ""}${x.columns?.length ? `, columns ${x.columns.join(" | ")}` : ""}` +
          `${x.readingLevel ? `, own reading level ${x.readingLevel}` : ""}${x.length ? `, own length ${x.length}` : ""}`,
        `  in section "${s?.heading ?? ""}"${s?.safety ? " (safety)" : ""}${s?.instruction ? `: ${s.instruction}` : ""}`,
        ...(x.instruction ? [`  instruction: ${x.instruction}`] : []),
      ]
    })
    const wants = [
      plan.intro ? "Write the introduction (`intro`)." : "Return `intro` as [].",
      plan.keyPoints ? "Write the key points (`keyPoints`)." : "Return `keyPoints` as [].",
    ]
    raw = (
      await callJson(ctx, {
        feature: "wiki.build",
        personId: b.personId,
        target: b.target,
        system: outlineSystem(b.level, gc.settings.length, ids),
        messages: [
          {
            role: "user",
            content: [
              ...b.header,
              "SECTIONS (in page order): " + (gc.outline?.sections ?? []).filter((s) => s.role !== "intro").map((s) => s.heading).join("; "),
              ...wants,
              "",
              ...(blockLines.length ? ["BLOCKS TO FILL:", ...blockLines, ""] : ["BLOCKS TO FILL: none", ""]),
              ...alreadyOnPage(fixed),
              "EXCERPTS:",
              ...b.ex.lines,
            ].join("\n"),
          },
        ],
        schema: OutlineOut,
        effort: "medium",
      })
    ).value
  }

  const gaps = new Set((raw.gaps ?? []).map(String))
  const byId = new Map((raw.blocks ?? []).map((x) => [String(x.blockId), x]))
  const filled: { row: ContextBlock; page: PageBlock }[] = plan.shared.map((row) => {
    const out = byId.get(row.blockId)
    if (!out || gaps.has(row.blockId)) return { row, page: { ref: row.blockId, kind: row.kind, tone: row.tone ?? undefined, points: [], dropped: [] } }
    const columns = row.columns?.length ? row.columns : (out.columns ?? []).map(String)
    const g = groundItems(out.points ?? [], row.kind, columns, b.ex)
    const cap = lengthCaps(row.length ?? gc.settings.length).points
    const points = capPoints(row.kind === "callout" ? capPoints(g.points, 3, g.dropped) : g.points, cap, g.dropped)
    return {
      row,
      page: {
        ref: row.blockId,
        kind: row.kind,
        tone: row.tone ?? undefined,
        ...(row.kind === "table" && columns.length ? { columns } : {}),
        points,
        dropped: g.dropped,
        hidden: row.hiddenPointKeys,
      },
    }
  })

  const headings = introHeadings(gc.title, (gc.outline?.sections ?? []).map((s) => s.heading))
  const top = introAndKeys({ intro: plan.intro ? raw.intro : [], keyPoints: plan.keyPoints ? raw.keyPoints : [] }, b.ex, headings)
  top.intro.hidden = plan.intro?.hiddenPointKeys
  top.keyPoints.hidden = plan.keyPoints?.hiddenPointKeys
  // Page order: intro and key points, then the Outline's blocks.
  const page: PageBlock[] = [
    ...(plan.intro ? [top.intro] : []),
    ...(plan.keyPoints ? [top.keyPoints] : []),
    ...gc.blocks
      .filter((x) => !(x.blockId === plan.intro?.blockId || x.blockId === plan.keyPoints?.blockId))
      .map((x) => filled.find((f) => f.row.blockId === x.blockId)?.page ?? fixed.find((f) => f.ref === x.blockId)!)
      .filter(Boolean),
  ]
  // Danger tones of Outline blocks belong to people; compose applies the cap.
  finishPage(page, { findings: gc.findings, maxDanger: null })

  const dropped = [
    ...(plan.intro ? top.intro.dropped.map((d) => ({ dropped: d, blockId: plan.intro!.blockId })) : []),
    ...(plan.keyPoints ? top.keyPoints.dropped.map((d) => ({ dropped: d, blockId: plan.keyPoints!.blockId })) : []),
    ...filled.flatMap((f) => f.page.dropped.map((d) => ({ dropped: d, blockId: f.row.blockId }))),
  ]
  for (const d of dropped) logDrop(b.target.id, d.dropped)
  await b.save({
    model: b.model.model,
    status: "ready",
    error: null,
    blocks: filled.map((f) => asGenerated(f.page, f.row.blockId)),
    ...(plan.intro ? { intro: asGenerated(top.intro, plan.intro.blockId) } : {}),
    ...(plan.keyPoints ? { keyPoints: asGenerated(top.keyPoints, plan.keyPoints.blockId) } : {}),
    droppedPoints: dropped.length,
    droppedDetail: dropDetails(dropped),
  })
}

/** Visible in the Convex logs, for tuning the prompt and the check. */
export function logDrop(wikiId: string, why: DroppedPoint) {
  console.log(`Wiki ${wikiId}: dropped point (${why.reason}${why.detail ? `: ${why.detail}` : ""}): ${why.text}`)
}

// ---- Offline stand-in (deterministic, spec 6.4) -----------------------------------

export interface StubPassage {
  key: string
  text: string
  section: string | null
  docIndex: number
}

export function stubPassages(docs: ExcerptDoc[], ex: Excerpts): StubPassage[] {
  return docs.flatMap((d, docIndex) =>
    d.chunks
      .filter((c) => c.text !== c.section && c.text.trim())
      .map((c) => ({ key: ex.keyOf.get(c.chunkId)!, text: c.text, section: c.section, docIndex })),
  )
}

const firstSentence = (text: string) => splitSentences(text)[0] ?? text

/** A fixed intro of 3 cited sentences and 3 key points, from the first passages. */
function stubTop(passages: StubPassage[]) {
  const sentence = (p: StubPassage) => ({ text: firstSentence(p.text), sources: [p.key] })
  return { intro: passages.slice(0, 3).map(sentence), keyPoints: passages.slice(3, 6).map(sentence) }
}

function stubPropose(docs: ExcerptDoc[], ex: Excerpts): ProposeRaw {
  const passages = stubPassages(docs, ex)
  // Sections use the passages the intro and key points did not, unless that leaves a document empty.
  const rest = passages.slice(6)
  const forDoc = (i: number) => {
    const unused = rest.filter((p) => p.docIndex === i)
    return (unused.length ? unused : passages.filter((p) => p.docIndex === i)).slice(0, 6)
  }
  return {
    ...stubTop(passages),
    sections: docs.map((d, i) => ({
      heading: d.title,
      instruction: "",
      safety: false,
      blocks: [
        {
          kind: "bullets" as const,
          tone: "none" as const,
          columns: [],
          points: forDoc(i).map((p) => ({ text: p.text, cells: [], sources: [p.key] })),
        },
      ],
    })),
  }
}

const PROPOSED_KINDS: BlockKind[] = ["prose", "bullets", "steps", "callout"]

const STUB_COUNT: Partial<Record<BlockKind, number>> = { prose: 2, callout: 1, intro: 3, keyPoints: 3 }

/** Fixed points per kind from the passages that share words with the block's heading and instructions. */
export function stubBlockItems(
  kind: BlockKind,
  topicText: string,
  passages: StubPassage[],
): { columns: string[]; items: RawItem[] } | null {
  const topic = new Set(contentStems(topicText))
  const scored = passages
    .map((p, i) => ({ p, i, s: contentStems(`${p.section ?? ""} ${p.text}`).filter((x) => topic.has(x)).length }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
  const n = STUB_COUNT[kind] ?? 4
  if (kind === "table") {
    const rows = scored.filter((x) => / \| /.test(x.p.text) && /^[^|]+: /.test(x.p.text))
    if (rows.length === 0) return null
    const columns = rows[0].p.text.split(" | ").map((c) => c.split(": ")[0].trim())
    const same = rows.filter((x) => x.p.text.split(" | ").map((c) => c.split(": ")[0].trim()).join("|") === columns.join("|"))
    return {
      columns,
      items: same.slice(0, n).map((x) => ({
        text: x.p.text,
        cells: x.p.text.split(" | ").map((c) => c.split(": ").slice(1).join(": ").trim()),
        sources: [x.p.key],
      })),
    }
  }
  if (scored.length === 0) return null
  const picked = scored.slice(0, n).sort((a, b) => a.i - b.i)
  const prose = kind === "prose" || kind === "intro"
  return {
    columns: [],
    items: picked.map((x) => ({ text: prose ? firstSentence(x.p.text) : x.p.text, cells: [], sources: [x.p.key] })),
  }
}

function stubOutline(
  shared: ContextBlock[],
  sectionOf: Map<string, { heading: string; instruction?: string }>,
  docs: ExcerptDoc[],
  ex: Excerpts,
): OutlineRaw {
  const passages = stubPassages(docs, ex)
  const gaps: string[] = []
  const blocks: OutlineRaw["blocks"] = []
  for (const b of shared) {
    const s = sectionOf.get(b.sectionId)
    const got = stubBlockItems(b.kind, `${s?.heading ?? ""} ${s?.instruction ?? ""} ${b.instruction ?? ""}`, passages)
    if (!got) gaps.push(b.blockId)
    else blocks.push({ blockId: b.blockId, columns: got.columns, points: got.items.map((i) => ({ text: i.text ?? "", cells: i.cells ?? [], sources: i.sources ?? [] })) })
  }
  return { ...stubTop(passages), blocks, gaps }
}

// ---- Guided creation --------------------------------------------------------

const GuideOut = z.object({
  reply: z.string(),
  title: z.string(),
  purpose: z.string(),
  format: z.enum(["overview", "steps", "reference"]),
  areas: z.array(z.string()),
  disciplines: z.array(z.string()),
  assetCodes: z.array(z.string()),
  documentCodes: z.array(z.string()),
  ready: z.boolean(),
})

const GUIDE_SYSTEM = [
  "You help an engineer create a Wiki in Oppr Knowledge through a short conversation.",
  "A Wiki is an AI-generated page of published knowledge for a specific audience. Its Scope decides which published documents it is built from.",
  "A Scope combines any of: areas (plant areas), disciplines, assets (machines) and specific documents. A document is included when it is linked to a chosen asset, chosen explicitly, or matches the chosen areas and disciplines.",
  "You work on a DRAFT with fields: title, purpose, format, areas, disciplines, assetCodes, documentCodes.",
  "`format` is how the Wiki reads: \"overview\" (sections of key facts, the default), \"steps\" (step by step, built around doing the job in order) or \"reference\" (quick reference: tables of values, settings and limits).",
  "The person sees the draft next to the conversation and can edit any field themselves. CURRENT DRAFT always holds their latest edits and wins over anything said earlier.",
  "Rules:",
  "- Always return the COMPLETE next draft. Copy every field from CURRENT DRAFT unchanged unless the latest MESSAGE asks to change it. Never clear a field the person set.",
  "- When the person asks for a step list, a procedure, a checklist or \"step by step\", set format to \"steps\". For a cheat sheet, quick reference, values or a table, set \"reference\". For an overview or summary, set \"overview\". You CAN set the format: never say you cannot.",
  "- Only use codes that appear in OPTIONS. Never invent codes. If nothing in OPTIONS fits the request, keep the Scope as it is, say so, and name the closest options.",
  "- Choose the narrowest Scope that covers what they asked for. Prefer assets and areas over listing many documents. A Wiki reads well from about 3 to 8 documents.",
  "- Title: 2 to 6 words in sentence case (only the first word and names capitalised), names the subject, does not contain the word Wiki. For example \"Line 2 changeover essentials\".",
  "- Purpose: one line in the form \"For <role> who <task>\", for example \"For night-shift operators who run changeovers on line 2\".",
  "- `reply` is at most two short sentences, in the language of the person's message. Do not list the draft field by field: the screen already shows which fields changed. Mention a choice only when it is not obvious.",
  "- Ask at most ONE question, and only when you cannot fill a fitting Scope or the audience without it. If you can make a reasonable draft, make it and do not ask.",
  "- Set `ready` to true once the draft has a title, a purpose and a non-empty Scope that fits the request. Then end the reply with: Check the draft and press Create, or tell me what to change.",
  "- You never create the Wiki yourself and never say it was created. The person presses Create.",
].join("\n")

export const guideOptions = internalQuery({
  args: {},
  handler: async (ctx) => loadScopeOptions(ctx),
})

const formatArg = v.union(v.literal("overview"), v.literal("steps"), v.literal("reference"))

const draftValidator = v.object({
  title: v.string(),
  purpose: v.string(),
  format: v.optional(formatArg),
  scope: v.object({
    areas: v.array(v.string()),
    disciplines: v.array(v.string()),
    assetIds: v.array(v.id("assets")),
    documentIds: v.array(v.id("documents")),
    excludedDocumentIds: v.optional(v.array(v.id("documents"))),
  }),
})

type Options = Awaited<ReturnType<typeof loadScopeOptions>>

/** A format asked for in so many words wins over what the model returns. */
export function formatAskedFor(message: string): WikiFormat | null {
  const m = message.toLowerCase()
  if (/\bstep[- ]?(?:by[- ]step|list|s\b)|\bprocedure\b|\bchecklist\b|\bin order\b/.test(m)) return "steps"
  if (/\bquick[- ]?ref|\breference\b|\bcheat[- ]?sheet\b|\btable\b|\bvalues\b|\bsettings\b/.test(m)) return "reference"
  if (/\boverview\b|\bsummary\b/.test(m)) return "overview"
  return null
}

export const guide = action({
  args: {
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        text: v.string(),
      }),
    ),
    draft: draftValidator,
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const options: Options = await ctx.runQuery(internal.ai.wiki.guideOptions, {})
    if (aiStubEnabled()) return stubGuide(args.messages, args.draft, options)
    if (!currentModel()) {
      throw new ConvexError(
        "The assistant is not available on this server (no AI key). Fill in the draft yourself.",
      )
    }

    const assetCode = new Map(options.assets.map((a) => [String(a._id), a.code]))
    const docCode = new Map(options.documents.map((d) => [String(d._id), d.namingCode]))

    const optionsText = [
      "AREAS:",
      ...options.areas.map((a) => `- ${a.code}: ${a.label}`),
      "DISCIPLINES:",
      ...options.disciplines.map((d) => `- ${d.code}: ${d.label}`),
      "ASSETS:",
      ...options.assets.map((a) => `- ${a.code}: ${a.name}${a.location ? ` (${a.location})` : ""}`),
      "PUBLISHED DOCUMENTS:",
      ...options.documents.map(
        (d) => `- ${d.namingCode}: ${d.title} [area ${d.area ?? "-"}, discipline ${d.discipline ?? "-"}]`,
      ),
      // The plant's own words (incl. Dutch), so "de zeefwissel" finds its area.
      await ctx.runQuery(internal.plant.context.forAi, {}).catch(() => ""),
    ].join("\n")

    const currentFormat: WikiFormat = args.draft.format ?? "overview"
    const currentDraft = JSON.stringify({
      title: args.draft.title,
      purpose: args.draft.purpose,
      format: currentFormat,
      areas: args.draft.scope.areas,
      disciplines: args.draft.scope.disciplines,
      assetCodes: args.draft.scope.assetIds.map((id) => assetCode.get(String(id))).filter(Boolean),
      documentCodes: args.draft.scope.documentIds.map((id) => docCode.get(String(id))).filter(Boolean),
    })

    // Both models expect alternating turns that start with the person: skip a
    // leading assistant turn and merge runs from the same side (a retry after
    // a failed answer leaves two person turns in a row).
    const history: { role: "user" | "assistant"; text: string }[] = []
    for (const m of args.messages.slice(-12)) {
      const prev = history[history.length - 1]
      if (!prev && m.role === "assistant") continue
      if (prev && prev.role === m.role) prev.text = `${prev.text}\n${m.text}`
      else history.push({ role: m.role, text: m.text })
    }
    const latest = history[history.length - 1]
    if (!latest || latest.role !== "user") throw new ConvexError("There is no message to answer.")

    let out: z.infer<typeof GuideOut>
    try {
      out = (
        await callJson(ctx, {
          feature: "wiki.guide",
          personId: args.personId ?? null,
          system: `${GUIDE_SYSTEM}\n\nOPTIONS:\n${optionsText}`,
          messages: [
            ...history.slice(0, -1).map((m) => ({ role: m.role, content: m.text })),
            { role: "user" as const, content: `CURRENT DRAFT: ${currentDraft}\n\nMESSAGE: ${latest.text}` },
          ],
          schema: GuideOut,
          effort: "low",
          maxTokens: 4000,
        })
      ).value
    } catch (err) {
      console.error("Wiki guide failed:", errorText(err))
      throw new ConvexError(
        "The assistant is not responding right now. Your draft is kept, and you can fill it in yourself.",
      )
    }

    // Map codes back to ids, dropping anything not in OPTIONS.
    const areaSet = new Set(options.areas.map((a) => a.code))
    const discSet = new Set(options.disciplines.map((d) => d.code))
    const assetByCode = new Map(options.assets.map((a) => [a.code.toUpperCase(), a._id]))
    const docByCode = new Map(options.documents.map((d) => [d.namingCode.toUpperCase(), d._id]))
    const uniq = <T,>(xs: T[]) => Array.from(new Set(xs))
    const documentIds = uniq(
      (out.documentCodes ?? [])
        .map((c) => docByCode.get(c.toUpperCase()))
        .filter((x): x is Id<"documents"> => x !== undefined),
    )
    const scope = {
      areas: uniq((out.areas ?? []).map((s) => s.toUpperCase()).filter((s) => areaSet.has(s))),
      disciplines: uniq((out.disciplines ?? []).map((s) => s.toUpperCase()).filter((s) => discSet.has(s))),
      assetIds: uniq(
        (out.assetCodes ?? [])
          .map((c) => assetByCode.get(c.toUpperCase()))
          .filter((x): x is Id<"assets"> => x !== undefined),
      ),
      documentIds,
      // Documents taken out by hand stay out, unless now picked by name.
      excludedDocumentIds: (args.draft.scope.excludedDocumentIds ?? []).filter((id) => !documentIds.includes(id)),
    }
    const scopeEmpty =
      scope.areas.length + scope.disciplines.length + scope.assetIds.length + scope.documentIds.length === 0
    // An empty title or purpose from the model never wipes what the person had.
    const title = String(out.title ?? "").trim() || args.draft.title
    const purpose = String(out.purpose ?? "").trim() || args.draft.purpose
    const modelFormat = ["overview", "steps", "reference"].includes(String(out.format))
      ? (out.format as WikiFormat)
      : currentFormat
    const format = formatAskedFor(latest.text) ?? modelFormat

    return {
      reply: String(out.reply ?? "").trim() || "I've updated the draft.",
      draft: { title, purpose, format, scope },
      ready: Boolean(out.ready) && !scopeEmpty && title.trim() !== "",
    }
  },
})

function stubGuide(
  messages: { role: "user" | "assistant"; text: string }[],
  draft: {
    title: string
    purpose: string
    format?: WikiFormat
    scope: {
      areas: string[]
      disciplines: string[]
      assetIds: Id<"assets">[]
      documentIds: Id<"documents">[]
      excludedDocumentIds?: Id<"documents">[]
    }
  },
  options: Options,
) {
  // Only the latest message adds to the Draft. The Draft already holds what
  // earlier turns matched plus the person's own edits, so a chip they removed
  // by hand is not put back by something they said before.
  const last = messages.filter((m) => m.role === "user").at(-1)?.text ?? ""
  const hay = last.toLowerCase()
  const words = (s: string) =>
    s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3)
  // "line 2" and "hall 2" only count as a whole phrase, never as the bare word.
  const phrases = (s: string): string[] => s.toLowerCase().match(/\b(?:line|hall)\s*\d+\b/g) ?? []
  const mentions = (code: string, label: string) =>
    hay.includes(code.toLowerCase()) ||
    phrases(label).some((p) => phrases(hay).includes(p)) ||
    words(label).some((w) => !["hall", "line", "with"].includes(w) && hay.includes(w))
  const uniq = <T,>(xs: T[]) => Array.from(new Set(xs))

  const newAreas = options.areas.filter((a) => mentions(a.code, a.label))
  const newDisciplines = options.disciplines.filter((d) => hay.includes(d.label.toLowerCase()))
  const newAssets = options.assets.filter((a) => mentions(a.code, a.name))
  const newDocs = options.documents.filter(
    (d) =>
      hay.includes(d.namingCode.toLowerCase()) ||
      words(d.title).some((w) => w.length >= 6 && hay.includes(w)),
  )
  const scope = {
    areas: uniq([...draft.scope.areas, ...newAreas.map((a) => a.code)]),
    disciplines: uniq([...draft.scope.disciplines, ...newDisciplines.map((d) => d.code)]),
    assetIds: uniq([...draft.scope.assetIds, ...newAssets.map((a) => a._id)]),
    documentIds: uniq([...draft.scope.documentIds, ...newDocs.map((d) => d._id)]),
    excludedDocumentIds: draft.scope.excludedDocumentIds ?? [],
  }
  const scopeSize =
    scope.areas.length + scope.disciplines.length + scope.assetIds.length + scope.documentIds.length
  const matched = [
    ...newAreas.map((a) => a.label),
    ...newDisciplines.map((d) => d.label),
    ...newAssets.map((a) => a.code),
    ...newDocs.map((d) => d.namingCode),
  ]
  const asked = formatAskedFor(last)
  const format = asked ?? draft.format ?? "overview"

  const title = draft.title || last.replace(/^(make|create|build|i want|i need)( me)?( a)?( wiki)?( (about|on|for))?\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 70)
  const titleCased = title ? title.charAt(0).toUpperCase() + title.slice(1) : ""
  const purpose = draft.purpose || (last.length > 20 ? last.trim() : "")
  const ready = scopeSize > 0 && titleCased !== ""

  let reply: string
  if (options.documents.length === 0) {
    reply = "Nothing is published yet, so a Wiki would have nothing to draw from. Publish a document first."
  } else if (matched.length > 0) {
    reply = `I matched your words to: ${matched.join(", ")}. Check the draft and press Create, or adjust any field.`
  } else if (asked) {
    reply = `The format is now ${asked === "steps" ? "Step by step" : asked === "reference" ? "Quick reference" : "Overview"}.`
  } else if (ready) {
    reply = "I found nothing new to match in that message. Change any field in the draft yourself, or press Create."
  } else {
    reply = "I could not match an area, machine or document in your words. Name one, or pick it in the draft."
  }
  return {
    reply: `${STUB_INTRO_PREFIX} ${reply}`,
    draft: { title: titleCased, purpose, format, scope },
    ready,
  }
}
