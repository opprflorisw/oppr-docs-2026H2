// The guided writer (CONTEXT.md: Guided creation) for Documents, and the
// passage half of "Find images and passages".
//
// `writerTurn`: the Engineer says what the Document should cover, the
// assistant asks one guided question at a time (with quick answers) and
// fills a Draft: purpose, steps, PPE, hazards and Plant terms. Safety
// elements and terms the assistant thinks of on its own come back as
// proposals the person adds with one click. The Draft is inserted into the
// editor only when the person presses Insert, and the Document still goes
// through review: the AI never publishes (docs/adr/0003).
//
// `findPassages`: Published passages for words or a photo, through the same
// chunk vector index as Ask and the MCP server. A photo is embedded with the
// multimodal embedding model, so it lands in the same space as the text.
import { ConvexError, v } from "convex/values"
import type { Infer } from "convex/values"
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai"
import type { ResponseSchema } from "@google/generative-ai"
import { z } from "zod"
import { action, internalQuery } from "../_generated/server"
import type { ActionCtx } from "../_generated/server"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { requireUser } from "../lib/auth"
import { CHAT_MODEL } from "./constants"
import { embedImageBytes } from "./imageEmbed"
import { claudeConfigured, claudeJson, describeClaudeError } from "./llm"
import { aiStubEnabled } from "./wiki"
import { embedText } from "../mcp/embedding"
import type { Passage } from "../mcp/data"

// ---- Shapes -------------------------------------------------------------------

const HAZARD_LEVELS = ["danger", "warning", "caution"] as const
type HazardLevel = (typeof HAZARD_LEVELS)[number]

const hazardV = v.object({
  level: v.union(v.literal("danger"), v.literal("warning"), v.literal("caution")),
  text: v.string(),
})
const termV = v.object({ term: v.string(), meaning: v.string() })

const writerDraftV = v.object({
  title: v.optional(v.string()),
  purpose: v.string(),
  ppe: v.array(v.string()),
  hazards: v.array(hazardV),
  steps: v.array(v.object({ id: v.string(), text: v.string(), hasImage: v.boolean() })),
  terms: v.array(termV),
})

export interface WriterHazard {
  level: HazardLevel
  text: string
}
export interface WriterTerm {
  term: string
  meaning: string
}
export interface WriterImageRequest {
  what: string
  where: string
  viewpoint: string
  style: string
  safety: string
}
export interface WriterSource {
  documentId: Id<"documents">
  namingCode: string
  title: string
}
/** Where a proposal comes from: a Published Document, or the Plant. */
export type ProposalSource =
  | { kind: "document"; documentId: Id<"documents">; namingCode: string; title: string }
  | { kind: "plant" }
export type ProposedHazard = WriterHazard & { source: ProposalSource | null }
export type ProposedTerm = WriterTerm & { source: ProposalSource | null }
export interface WriterTurnResult {
  reply: string
  question: { text: string; choices: string[] } | null
  draft: {
    title: string
    purpose: string
    ppe: string[]
    hazards: WriterHazard[]
    /** `id` is the id of an existing step, or "" for a new one. */
    steps: { id: string; text: string }[]
    terms: WriterTerm[]
  }
  proposals: {
    ppe: { slug: string; label: string }[]
    hazards: ProposedHazard[]
    terms: ProposedTerm[]
  }
  imageRequest: WriterImageRequest | null
  sources: WriterSource[]
  ready: boolean
  /** True when the offline stand-in answered (no AI). */
  stub: boolean
}

// The model's answer, before it is checked against the catalogue.
const WriterOut = z.object({
  reply: z.string(),
  question: z.string(),
  choices: z.array(z.string()),
  title: z.string(),
  purpose: z.string(),
  steps: z.array(z.object({ id: z.string(), text: z.string() })),
  ppe: z.array(z.string()),
  hazards: z.array(z.object({ level: z.enum(HAZARD_LEVELS), text: z.string() })),
  terms: z.array(z.object({ term: z.string(), meaning: z.string() })),
  proposePpe: z.array(z.string()),
  proposeHazards: z.array(z.object({ level: z.enum(HAZARD_LEVELS), text: z.string(), source: z.string() })),
  proposeTerms: z.array(z.object({ term: z.string(), meaning: z.string(), source: z.string() })),
  imageWanted: z.boolean(),
  imageWhat: z.string(),
  imageWhere: z.string(),
  imageViewpoint: z.string(),
  imageStyle: z.string(),
  imageSafety: z.string(),
  ready: z.boolean(),
})
type WriterOutT = z.infer<typeof WriterOut>

const S = SchemaType
const str = { type: S.STRING } as const
const hazardSchema: ResponseSchema = {
  type: S.OBJECT,
  properties: { level: { type: S.STRING, format: "enum", enum: [...HAZARD_LEVELS] }, text: str },
  required: ["level", "text"],
}
const termSchema: ResponseSchema = {
  type: S.OBJECT,
  properties: { term: str, meaning: str },
  required: ["term", "meaning"],
}
const sourcedHazardSchema: ResponseSchema = {
  type: S.OBJECT,
  properties: { level: { type: S.STRING, format: "enum", enum: [...HAZARD_LEVELS] }, text: str, source: str },
  required: ["level", "text", "source"],
}
const sourcedTermSchema: ResponseSchema = {
  type: S.OBJECT,
  properties: { term: str, meaning: str, source: str },
  required: ["term", "meaning", "source"],
}
const WRITER_SCHEMA: ResponseSchema = {
  type: S.OBJECT,
  properties: {
    reply: str,
    question: str,
    choices: { type: S.ARRAY, items: str },
    title: str,
    purpose: str,
    steps: {
      type: S.ARRAY,
      items: { type: S.OBJECT, properties: { id: str, text: str }, required: ["id", "text"] },
    },
    ppe: { type: S.ARRAY, items: str },
    hazards: { type: S.ARRAY, items: hazardSchema },
    terms: { type: S.ARRAY, items: termSchema },
    proposePpe: { type: S.ARRAY, items: str },
    proposeHazards: { type: S.ARRAY, items: sourcedHazardSchema },
    proposeTerms: { type: S.ARRAY, items: sourcedTermSchema },
    imageWanted: { type: S.BOOLEAN },
    imageWhat: str,
    imageWhere: str,
    imageViewpoint: str,
    imageStyle: str,
    imageSafety: str,
    ready: { type: S.BOOLEAN },
  },
  required: [
    "reply",
    "question",
    "choices",
    "title",
    "purpose",
    "steps",
    "ppe",
    "hazards",
    "terms",
    "proposePpe",
    "proposeHazards",
    "proposeTerms",
    "imageWanted",
    "imageWhat",
    "imageWhere",
    "imageViewpoint",
    "imageStyle",
    "imageSafety",
    "ready",
  ],
}

const WRITER_SYSTEM = [
  "You help an engineer in a factory write a controlled Document (an SOP, work instruction, LMRA or similar) in Oppr Knowledge, through a short guided conversation.",
  "You work on a DRAFT with fields: title (a short document title, at most 8 words; keep the one in CURRENT DRAFT once set), purpose (one line: who does what, when), steps (the procedure, one action per step), ppe (PPE slugs from the catalogue), hazards (safety warnings with a level danger, warning or caution) and terms (plant terms a reader must know, with a short meaning).",
  "The person sees the draft next to the conversation and can edit it. CURRENT DRAFT holds their latest edits and wins over anything said earlier.",
  "Guided questions: ask exactly ONE short question per turn in `question`, with 2 to 4 short quick answers in `choices` the person can click (each at most 6 words). Work through, in this order and skipping what is already known: what task and for whom; where (area, line or Asset); the start and end condition; the main hazards and checks; anything easy to get wrong. When the draft is complete, ask nothing: leave `question` empty and `choices` empty.",
  "Make a first draft as soon as you can. Do not wait for every answer: fill the steps from what you know and from SOURCES, then ask the next question.",
  "The conversation sets the topic. DOCUMENT describes whatever is open in the editor and may be unrelated or empty: when the person describes another task, machine or area, follow the person, use their machine and area everywhere (steps, hazards, image place), and do not comment on the open document.",
  "Rules:",
  "- Always return the COMPLETE next draft. Copy fields from CURRENT DRAFT unchanged unless the latest MESSAGE asks to change them or you are filling an empty field. Never clear what the person wrote.",
  "- Steps: keep the `id` of an existing step you keep or rewrite; use an empty id for a new step. Imperative, one action per step, at most 25 words. Keep numbers, units, setpoints and codes exactly as in SOURCES. Never invent a setpoint: when a value is unknown write it as [value to confirm]. The person must fill those in before inserting, so ask for the missing value in your next question.",
  "- Values in hazards and steps (temperatures, pressures, times) come only from SOURCES, quoted exactly. PLANT is background, not a source for values. When SOURCES and PLANT give different values for the same thing, do not pick one: write [value to confirm: <value in SOURCES> or <value in PLANT>].",
  "- Plain words: write an abbreviation out in full the first time it appears, with the short form in brackets, for example lockout/tagout (LOTO) or personal protective equipment (PPE).",
  "- Safety elements you think of yourself go in proposePpe, proposeHazards and proposeTerms, NOT in ppe, hazards or terms. The person adds them with one click. Only put them in ppe, hazards or terms when the person asks for it in so many words.",
  "- proposePpe: only slugs from PPE CATALOGUE that are not already in the draft. proposeHazards: hazards from PLANT and SOURCES that apply to this task and are not in the draft yet, each a complete sentence a reader understands on its own. proposeTerms: terms from the PLANT glossary used in the steps, not in the draft yet. Propose at most 4 of each, and only new ones on each turn.",
  "- `source` on each proposed hazard and term: the naming code of the SOURCES passage it comes from (for example EXT-OPS-SOP-0002), or PLANT when it comes from the plant briefing. Never leave it empty and never name a code that is not in SOURCES.",
  "- When the person asks for an image, a picture, a photo or an illustration, set imageWanted true and fill imageWhat (the subject), imageWhere (place in the plant), imageViewpoint (for example close-up, operator's view, overview), imageStyle (photo, technical drawing or simple illustration) and imageSafety (safety marks to show, or empty). Otherwise set imageWanted false and leave those fields empty.",
  "- `reply` is at most two short sentences in the language of the person's message, and does not repeat the question or list the draft. Use the plant's own words from PLANT.",
  "- Set `ready` true once purpose and at least three steps are filled and the main hazards are covered or proposed. Then say: Check the draft and press Insert, or tell me what to change.",
  "- You never publish, approve or save. The person inserts the draft into the Document, and it still goes through review.",
].join("\n")

// ---- Context --------------------------------------------------------------------

export const writerContext = internalQuery({
  args: { assetIds: v.array(v.id("assets")), areaCode: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const ppeRows = await ctx.db.query("ppeItems").take(200)
    const ppe = ppeRows
      .filter((r) => r.active)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => ({ slug: r.slug, label: r.labelEn ?? r.label }))
    const area = args.areaCode
      ? await ctx.db
          .query("namingLocations")
          .withIndex("by_code", (q) => q.eq("code", args.areaCode as string))
          .unique()
      : null
    const assets = []
    for (const id of args.assetIds.slice(0, 12)) {
      const a = await ctx.db.get(id)
      if (a) assets.push({ code: a.code, name: a.name, location: a.location })
    }
    return { ppe, area: area ? { code: area.code, label: area.label } : null, assets }
  },
})

/** The briefing for the whole plant: the open document's area need not be the topic. */
async function plantBriefing(ctx: ActionCtx): Promise<string> {
  try {
    const text: string = await ctx.runQuery(internal.plant.context.forAi, {})
    return text.slice(0, 4000)
  } catch (err) {
    console.warn("plant briefing unavailable:", err)
    return ""
  }
}

// ---- Passage search -------------------------------------------------------------

export type FoundPassage = Passage & { matchedBy: "text" | "image" | "words" }

/** A photo in the same vector space as the chunk text (multimodal embedding). */
async function embedPhoto(ctx: ActionCtx, storageId: Id<"_storage">): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set on this deployment")
  const blob = await ctx.storage.get(storageId)
  if (!blob) throw new ConvexError("The photo could not be read. Try adding it again.")
  if (blob.size > 12 * 1024 * 1024) throw new ConvexError("The photo is too large. Use one under 12 MB.")
  return await embedImageBytes(new Uint8Array(await blob.arrayBuffer()), blob.type || "image/jpeg", apiKey)
}

const NAMING_CODE = /[A-Z]{2,4}-[A-Z]{2,4}-[A-Z]+-\d{4}/g

/**
 * Short lines, References sections and lists of naming codes match almost
 * anything about the plant, so they are left out of the results (the same
 * rule as the MCP server's search).
 */
function isHub(p: { section: string | null; text: string }): boolean {
  const t = p.text.replace(/\s+/g, " ").trim()
  if (t.length < 60) return true
  if (/^references?$/i.test((p.section ?? "").trim())) return true
  return (t.match(NAMING_CODE) ?? []).join("").length / t.length > 0.25
}

async function vectorPassages(
  ctx: ActionCtx,
  vector: number[],
  areas: string[],
  limit: number,
  matchedBy: FoundPassage["matchedBy"],
): Promise<FoundPassage[]> {
  let results: { _id: Id<"chunks">; _score: number }[]
  if (areas.length === 0) {
    results = await ctx.vectorSearch("chunks", "by_embedding", { vector, limit: Math.min(limit * 3, 64) })
  } else {
    const ids: Id<"documents">[] = await ctx.runQuery(internal.mcp.data.publishedDocIds, { areas })
    if (ids.length === 0) return []
    const slice = ids.slice(0, 64)
    results = await ctx.vectorSearch("chunks", "by_embedding", {
      vector,
      limit: Math.min(limit * 3, 64),
      filter: (q) => q.or(...slice.map((id) => q.eq("documentId", id))),
    })
  }
  const score = new Map(results.map((r) => [String(r._id), r._score]))
  // Drafts and older versions are dropped here: Published passages only.
  const rows: Omit<Passage, "score">[] = await ctx.runQuery(internal.mcp.data.passages, {
    chunkIds: results.map((r) => r._id),
    areas,
  })
  return rows
    .map((r) => ({ ...r, score: score.get(String(r.chunkId)) ?? 0, matchedBy }))
    .filter((r) => !isHub(r))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

async function searchPassages(
  ctx: ActionCtx,
  args: { query: string; storageId: Id<"_storage"> | null; areas: string[]; limit: number },
): Promise<{ passages: FoundPassage[]; note: string | null }> {
  const query = args.query.trim()
  let note: string | null = null
  const out: FoundPassage[] = []
  if (args.storageId) {
    try {
      out.push(...(await vectorPassages(ctx, await embedPhoto(ctx, args.storageId), args.areas, args.limit, "image")))
    } catch (err) {
      if (err instanceof ConvexError) throw err
      console.warn("photo passage search failed:", err)
      note = "Passages could not be matched to the photo right now. Add a few words to search by text."
    }
  }
  if (query) {
    try {
      out.push(...(await vectorPassages(ctx, await embedText(query), args.areas, args.limit, "text")))
    } catch (err) {
      console.warn("text passage search fell back to words:", err)
      const rows: Passage[] = await ctx.runQuery(internal.mcp.data.lexicalSearch, {
        query,
        areas: args.areas,
        limit: args.limit,
      })
      out.push(...rows.filter((r) => !isHub(r)).map((r) => ({ ...r, matchedBy: "words" as const })))
    }
  }
  // One entry per passage, best match first.
  const best = new Map<string, FoundPassage>()
  for (const p of out) {
    const prev = best.get(String(p.chunkId))
    if (!prev || p.score > prev.score) best.set(String(p.chunkId), p)
  }
  return { passages: [...best.values()].sort((a, b) => b.score - a.score).slice(0, args.limit), note }
}

/** Published passages for words, a photo, or both. */
export const findPassages = action({
  args: {
    query: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    areaCodes: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ passages: FoundPassage[]; note: string | null }> => {
    await requireUser(ctx)
    if (!args.query?.trim() && !args.storageId) return { passages: [], note: null }
    return await searchPassages(ctx, {
      query: (args.query ?? "").slice(0, 500),
      storageId: args.storageId ?? null,
      areas: args.areaCodes ?? [],
      limit: Math.min(Math.max(args.limit ?? 8, 1), 20),
    })
  },
})

// ---- The guided writer ----------------------------------------------------------

function geminiJson(apiKey: string, system: string) {
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: CHAT_MODEL,
    systemInstruction: system,
    generationConfig: { responseMimeType: "application/json", responseSchema: WRITER_SCHEMA, temperature: 0.3 },
  })
}

const clean = (s: unknown, max = 400) =>
  String(s ?? "").replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim().slice(0, max)
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()

export const writerTurn = action({
  args: {
    messages: v.array(v.object({ role: v.union(v.literal("user"), v.literal("assistant")), text: v.string() })),
    draft: writerDraftV,
    context: v.object({
      documentType: v.string(),
      title: v.string(),
      areaCode: v.union(v.string(), v.null()),
      assetIds: v.array(v.id("assets")),
    }),
  },
  handler: async (ctx, args): Promise<WriterTurnResult> => {
    await requireUser(ctx)

    // Alternating turns that start with the person (see ai/wiki.ts guide).
    const history: { role: "user" | "assistant"; text: string }[] = []
    for (const m of args.messages.slice(-14)) {
      const prev = history[history.length - 1]
      if (!prev && m.role === "assistant") continue
      if (prev && prev.role === m.role) prev.text = `${prev.text}\n${m.text}`
      else history.push({ role: m.role, text: m.text.slice(0, 4000) })
    }
    const latest = history[history.length - 1]
    if (!latest || latest.role !== "user") throw new ConvexError("There is no message to answer.")

    const info = await ctx.runQuery(internal.ai.guidedChat.writerContext, {
      assetIds: args.context.assetIds,
      areaCode: args.context.areaCode,
    })
    const ppeBySlug = new Map(info.ppe.map((p) => [p.slug, p.label]))

    if (aiStubEnabled()) return stubTurn(args.draft, latest.text, info.ppe)

    const useClaude = claudeConfigured()
    const apiKey = process.env.GEMINI_API_KEY
    if (!useClaude && !apiKey) {
      throw new ConvexError("The assistant is not available on this server (no AI key). Fill in the draft yourself.")
    }

    const searchText = [args.context.title, args.draft.purpose, latest.text].filter(Boolean).join(". ")
    const [briefing, found] = await Promise.all([
      plantBriefing(ctx),
      searchPassages(ctx, { query: searchText, storageId: null, areas: [], limit: 6 }).catch(() => ({
        passages: [] as FoundPassage[],
        note: null,
      })),
    ])
    const passages = found.passages

    const contextText = [
      `DOCUMENT: type ${args.context.documentType}; title "${args.context.title || "untitled"}"${
        info.area ? `; area ${info.area.code} (${info.area.label})` : ""
      }${info.assets.length ? `; Assets ${info.assets.map((a) => `${a.code} ${a.name}`).join(", ")}` : ""}`,
      "PPE CATALOGUE (slug: label):",
      ...info.ppe.map((p) => `- ${p.slug}: ${p.label}`),
      "PLANT:",
      briefing || "(no plant briefing yet)",
      "SOURCES (Published passages, quote values exactly):",
      ...(passages.length
        ? passages.map((p) => `- ${p.namingCode} ${p.title}${p.section ? ` / ${p.section}` : ""}: ${clean(p.text, 600)}`)
        : ["(none found)"]),
    ].join("\n")
    const currentDraft = JSON.stringify({
      title: args.draft.title ?? "",
      purpose: args.draft.purpose,
      steps: args.draft.steps.map((s) => ({ id: s.id, text: s.text })),
      ppe: args.draft.ppe,
      hazards: args.draft.hazards,
      terms: args.draft.terms,
    })
    const turn = `CURRENT DRAFT: ${currentDraft}\n\nMESSAGE: ${latest.text}`

    let out: WriterOutT
    try {
      if (useClaude) {
        out = await claudeJson({
          system: `${WRITER_SYSTEM}\n\n${contextText}`,
          messages: [
            ...history.slice(0, -1).map((m) => ({ role: m.role, content: m.text })),
            { role: "user" as const, content: turn },
          ],
          schema: WriterOut,
          effort: "low",
          maxTokens: 6000,
        })
      } else {
        const contents = [
          { role: "user", parts: [{ text: contextText }] },
          { role: "model", parts: [{ text: "Understood." }] },
          ...history.slice(0, -1).map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.text }],
          })),
          { role: "user", parts: [{ text: turn }] },
        ]
        const result = await geminiJson(apiKey!, WRITER_SYSTEM).generateContent({ contents })
        out = JSON.parse(result.response.text()) as WriterOutT
      }
    } catch (err) {
      console.error("Guided writer failed:", useClaude ? describeClaudeError(err) : err)
      throw new ConvexError("The assistant is not responding right now. Your draft is kept, and you can fill it in yourself.")
    }

    return shapeResult(out, args.draft, ppeBySlug, passages)
  },
})

type DraftIn = Infer<typeof writerDraftV>

/** The passage a proposal names, or the Plant; null when it names nothing it was given. */
function sourceOf(raw: unknown, passages: FoundPassage[]): ProposalSource | null {
  const s = String(raw ?? "").trim()
  if (!s) return null
  const code = s.match(NAMING_CODE)?.[0]
  if (code) {
    const p = passages.find((x) => x.namingCode === code)
    return p ? { kind: "document", documentId: p.documentId, namingCode: p.namingCode, title: p.title } : null
  }
  return /plant/i.test(s) ? { kind: "plant" } : null
}

/** Checks the model's answer against the draft and the catalogue. */
function shapeResult(
  out: WriterOutT,
  before: DraftIn,
  ppeBySlug: Map<string, string>,
  passages: FoundPassage[],
): WriterTurnResult {
  const knownIds = new Set(before.steps.map((s) => s.id))
  const steps = (out.steps ?? [])
    .map((s) => ({ id: knownIds.has(s.id) ? s.id : "", text: clean(s.text, 600) }))
    .filter((s) => s.text)
  const level = (l: unknown): HazardLevel => (HAZARD_LEVELS.includes(l as HazardLevel) ? (l as HazardLevel) : "warning")
  const hazards = (out.hazards ?? []).map((h) => ({ level: level(h.level), text: clean(h.text) })).filter((h) => h.text)
  const terms = (out.terms ?? [])
    .map((t) => ({ term: clean(t.term, 80), meaning: clean(t.meaning, 300) }))
    .filter((t) => t.term)
  const ppe = [...new Set((out.ppe ?? []).map((s) => s.trim()).filter((s) => ppeBySlug.has(s)))]

  const draft = {
    // An empty answer never wipes what the person had.
    title: before.title?.trim() || clean(out.title, 90).replace(/[.]+$/, ""),
    purpose: clean(out.purpose, 300) || before.purpose,
    steps: steps.length > 0 || before.steps.length === 0 ? steps : before.steps.map(({ id, text }) => ({ id, text })),
    ppe,
    hazards,
    terms,
  }

  const haveHazard = new Set(draft.hazards.map((h) => norm(h.text)))
  const haveTerm = new Set(draft.terms.map((t) => norm(t.term)))
  const proposals = {
    ppe: [...new Set(out.proposePpe ?? [])]
      .filter((s) => ppeBySlug.has(s) && !draft.ppe.includes(s))
      .slice(0, 4)
      .map((slug) => ({ slug, label: ppeBySlug.get(slug)! })),
    hazards: (out.proposeHazards ?? [])
      .map((h) => ({ level: level(h.level), text: clean(h.text), source: sourceOf(h.source, passages) }))
      .filter((h) => h.text && !haveHazard.has(norm(h.text)))
      .slice(0, 4),
    terms: (out.proposeTerms ?? [])
      .map((t) => ({ term: clean(t.term, 80), meaning: clean(t.meaning, 300), source: sourceOf(t.source, passages) }))
      .filter((t) => t.term && !haveTerm.has(norm(t.term)))
      .slice(0, 4),
  }

  const choices = (out.choices ?? []).map((c) => clean(c, 60)).filter(Boolean).slice(0, 4)
  const questionText = clean(out.question, 300)
  const imageRequest: WriterImageRequest | null = out.imageWanted
    ? {
        what: clean(out.imageWhat, 200),
        where: clean(out.imageWhere, 200),
        viewpoint: clean(out.imageViewpoint, 80),
        style: clean(out.imageStyle, 80),
        safety: clean(out.imageSafety, 200),
      }
    : null

  const sources: WriterSource[] = []
  for (const p of passages) {
    if (sources.some((s) => s.documentId === p.documentId)) continue
    sources.push({ documentId: p.documentId, namingCode: p.namingCode, title: p.title })
  }

  return {
    reply: clean(out.reply, 600) || "I've updated the draft.",
    question: questionText ? { text: questionText, choices } : null,
    draft,
    proposals,
    imageRequest,
    sources: sources.slice(0, 4),
    ready: Boolean(out.ready) && draft.steps.length >= 3 && draft.purpose !== "",
    stub: false,
  }
}

// Offline stand-in (OPPR_AI_STUB=1): no AI. Each sentence of the message
// becomes a step, and the questions follow a fixed order.
function stubTurn(
  draft: DraftIn,
  message: string,
  ppe: { slug: string; label: string }[],
): WriterTurnResult {
  const sentences = message
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
  const steps = [...draft.steps.map(({ id, text }) => ({ id, text })), ...sentences.map((text) => ({ id: "", text }))]
  const order: { text: string; choices: string[] }[] = [
    { text: "Where is this done?", choices: ["At the line", "In the lab", "At the warehouse"] },
    { text: "What can go wrong or hurt someone?", choices: ["Hot surfaces", "Moving parts", "Nothing special"] },
    { text: "Is there a check at the end?", choices: ["Yes, a visual check", "Yes, a measurement", "No"] },
  ]
  const asked = Math.min(steps.length > 0 ? Math.floor(steps.length / 2) : 0, order.length)
  return {
    reply: "Offline stand-in, no AI: I added your words as steps.",
    question: asked < order.length ? order[asked] : null,
    draft: {
      title: draft.title ?? "",
      purpose: draft.purpose || sentences[0] || "",
      ppe: draft.ppe,
      hazards: draft.hazards,
      steps,
      terms: draft.terms,
    },
    proposals: {
      ppe: ppe.filter((p) => ["gloves", "glasses"].includes(p.slug) && !draft.ppe.includes(p.slug)),
      hazards: [],
      terms: [],
    },
    imageRequest: /\b(image|picture|photo|illustration)\b/i.test(message)
      ? { what: message.slice(0, 120), where: "", viewpoint: "", style: "", safety: "" }
      : null,
    sources: [],
    ready: steps.length >= 3,
    stub: true,
  }
}
