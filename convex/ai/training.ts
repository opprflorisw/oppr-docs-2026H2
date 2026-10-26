// AI for Trainings: the Guided creation assistant, and the fresh questions of
// every Attempt (CONTEXT.md: Training, Attempt; ADR 0002 and 0003).
//
// The assistant only ever returns a Draft; a person saves or sends it and an
// Engineer signs it off. Attempt questions are generated output from
// Published passages only: the correct option and the explanation are checked
// in code against the objective's passage (grounding.checkPoint), and the
// option order is shuffled by code, never taken from the model.
import { ConvexError, v } from "convex/values"
import { z } from "zod"
import { action, internalAction, internalQuery } from "../_generated/server"
import { internal } from "../_generated/api"
import { Id } from "../_generated/dataModel"
import { requireUser } from "../lib/auth"
import { claudeConfigured, claudeJson, describeClaudeError } from "./llm"
import { checkPoint, factTokens, normalise, ProvidedExcerpt, support } from "./grounding"
import { aiStubEnabled } from "./wiki"
import { embedText, geminiText, toBase64, type GeminiPart } from "./gemini"
import type { MeterSpec } from "../lib/aiMeter"
import { getVersion, makeDocCache, resolveObjective, type SampleQuestion } from "../trainings"

const MAX_GUIDE_DOCS = 5
const MAX_PASSAGES_PER_DOC = 70
const MAX_GUIDE_OBJECTIVES = 10

const squash = (s: string) => normalise(s).replace(/\s+/g, " ").trim()
const quoteIn = (quote: string, text: string) => {
  const q = squash(quote)
  return q.length > 0 && squash(text).includes(q)
}
/** Codes such as PX-4400 or EXL-201 in a text (quantities carry a space or are bare numbers). */
const codesIn = (text: string) => factTokens(text).filter((t) => /[A-Z]/.test(t) && !t.includes(" "))
/** Bare numbers in a text, after the grounding normalisation ("fifteen" -> 15, "1,5" -> 1.5). */
const numbersIn = (text: string) => (normalise(text).match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)))

// ---- Guided creation ------------------------------------------------------------

const GuideOut = z.object({
  reply: z.string(),
  title: z.string(),
  kind: z.enum(["course", "round"]),
  area: z.string(),
  purpose: z.string(),
  documentCodes: z.array(z.string()),
  objectives: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      source: z.string(),
      quote: z.string(),
    }),
  ),
  stops: z.array(
    z.object({
      assetCode: z.string(),
      objectiveNumbers: z.array(z.number()),
      hint: z.string(),
      evidence: z.enum(["none", "photo", "note"]),
    }),
  ),
  passMark: z.number(),
  questionsPerObjective: z.number(),
  ready: z.boolean(),
})

const GUIDE_SYSTEM = [
  "You help an engineer create a Training in Oppr Knowledge, a factory's controlled knowledge base, through a short conversation.",
  "A Training is the fixed, approved definition of what a person must prove. It has Learning objectives, each one traceable to a passage of a published document. Every Attempt generates fresh multiple-choice questions that test every objective, so each objective must be testable from its passage alone.",
  "A Training is either a course (done at a desk or on a phone) or a Round (done in the plant like a treasure hunt: the person walks to Assets in order, scans each one and answers the questions for that stop, or adds a photo or note).",
  "You work on a DRAFT with fields: title, kind, area, purpose, documentCodes (source documents), objectives, stops (Rounds only), passMark, questionsPerObjective.",
  "The person sees the draft next to the conversation and can edit any field. CURRENT DRAFT always holds their latest edits and wins over anything said earlier.",
  "",
  "Rules:",
  "- Always return the COMPLETE next draft. Copy every field from CURRENT DRAFT unchanged unless the latest MESSAGE asks to change it, or it is empty and you can fill it. Never drop an objective or stop the person made unless they ask.",
  "- Only use codes that appear in OPTIONS. Never invent codes.",
  "- Objectives: propose 3 to 8 for a new Training. Each states one thing the person must know or do, in plain words, starting with a verb (for example \"Tighten the die bolts in the right pattern and to the right torque\"). It must be fully covered by ONE passage in PASSAGES. Use an observable verb (tighten, check, set, tell, wear, stop), never \"know\" or \"understand\".",
  "- An objective NEVER states the value, number or setting the person must know: write \"Tighten the die bolts to the right torque\", not \"Tighten the die bolts to 40 Nm\". The value stays in the passage, so the question can ask for it.",
  "- When KIND IS LOCKED is given, keep that kind. Ask before you would change it.",
  "- `source` is the key of that passage (for example \"E12\"). Only keys from PASSAGES. Keep the source of an existing objective unless asked. `quote` is the shortest sentence or phrase of that passage that states it, copied character for character; use the whole passage if unsure.",
  "- An objective never adds a number, code or rule its passage does not state. Prefer safety-critical points and the steps where mistakes happen. Leave out table headers and titles.",
  "- `id`: copy the id of an existing objective you keep; use \"\" for a new one.",
  "- Only passages of the documents listed under PASSAGES are available this turn. If the request needs another published document, add its code to documentCodes and say you will pick its passages on the next turn.",
  "- Stops (kind round only): one per Asset, in walking order. `objectiveNumbers` are 1-based positions in YOUR objectives list. Each objective is tested at exactly one stop, usually the Asset its document is about. `hint` tells the person how to find the Asset (one short line). `evidence` is photo or note only when seeing the real thing proves something (a guard in place, a gauge reading); otherwise none. For a course return stops as [].",
  "- area is an area code from OPTIONS, or the area of the main source document.",
  "- passMark is 80 and questionsPerObjective is 1 unless the person asks otherwise (passMark 50 to 100, questionsPerObjective 1 to 3).",
  "- title: 2 to 6 words naming the subject, without the word Training. purpose: one line saying who it is for and what they must be able to do.",
  "- `reply` is at most two short sentences in the language of the person. Do not repeat the draft field by field. Ask at most ONE question, and only when you cannot make a sensible draft without it.",
  "- Set ready to true once the draft has a title, at least one objective with a valid source and, for a Round, stops that cover every objective. Then end the reply with: Check the draft, then press Save draft or Send for review, or tell me what to change. Never state how many objectives there are; the person sees the list.",
  "- You never create, approve or publish the Training. The person presses Save draft or Send for review, and another Engineer reviews it.",
].join("\n")

const objectiveIn = v.object({
  id: v.string(),
  text: v.string(),
  documentId: v.id("documents"),
  chunkId: v.union(v.id("chunks"), v.null()),
  quote: v.string(),
})

const guideDraftValidator = v.object({
  title: v.string(),
  kind: v.union(v.literal("course"), v.literal("round")),
  area: v.union(v.string(), v.null()),
  purpose: v.string(),
  documentIds: v.array(v.id("documents")),
  objectives: v.array(objectiveIn),
  stops: v.array(
    v.object({
      assetId: v.id("assets"),
      objectiveIds: v.array(v.string()),
      hint: v.string(),
      evidence: v.union(v.literal("none"), v.literal("photo"), v.literal("note")),
    }),
  ),
  passMark: v.number(),
  questionsPerObjective: v.number(),
})

interface GuideDraft {
  title: string
  kind: "course" | "round"
  area: string | null
  purpose: string
  documentIds: Id<"documents">[]
  objectives: {
    id: string
    text: string
    documentId: Id<"documents">
    chunkId: Id<"chunks"> | null
    quote: string
  }[]
  stops: {
    assetId: Id<"assets">
    objectiveIds: string[]
    hint: string
    evidence: "none" | "photo" | "note"
  }[]
  passMark: number
  questionsPerObjective: number
}

interface GuidePassage {
  chunkId: Id<"chunks">
  text: string
  display: string
  section: string | null
}
interface GuideDoc {
  documentId: Id<"documents">
  namingCode: string
  title: string
  version: number
  passages: GuidePassage[]
}
interface GuideOptions {
  areas: { code: string; label: string }[]
  assets: { _id: Id<"assets">; code: string; name: string; documentIds: Id<"documents">[] }[]
  documents: {
    _id: Id<"documents">
    namingCode: string
    title: string
    version: number
    area: string | null
    discipline: string | null
  }[]
}

export const guide = action({
  args: {
    messages: v.array(
      v.object({ role: v.union(v.literal("user"), v.literal("assistant")), text: v.string() }),
    ),
    draft: guideDraftValidator,
    /** The person chose the kind (Training or Round) on purpose: the assistant keeps it. */
    kindLocked: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    reply: string
    draft: GuideDraft
    ready: boolean
    existing: { _id: Id<"trainings">; code: string; title: string; kind: "course" | "round"; status: string }[]
    droppedObjectives: string[]
  }> => {
    await requireUser(ctx)
    if (aiStubEnabled() || !claudeConfigured()) {
      throw new ConvexError("The assistant is not available on this server. Fill in the draft yourself.")
    }
    const draft = args.draft as GuideDraft

    const history: { role: "user" | "assistant"; text: string }[] = []
    for (const m of args.messages.slice(-12)) {
      const prev = history[history.length - 1]
      if (!prev && m.role === "assistant") continue
      if (prev && prev.role === m.role) prev.text = `${prev.text}\n${m.text}`
      else history.push({ role: m.role, text: m.text })
    }
    const latest = history[history.length - 1]
    if (!latest || latest.role !== "user") throw new ConvexError("There is no message to answer.")

    // Which documents' passages the model sees this turn: the draft's own,
    // plus the closest published ones to what the person asked for.
    const candidates: Id<"documents">[] = []
    const addCandidate = (id: Id<"documents">) => {
      if (!candidates.includes(id)) candidates.push(id)
    }
    draft.objectives.forEach((o) => addCandidate(o.documentId))
    draft.documentIds.forEach(addCandidate)
    const first: { options: GuideOptions } = await ctx.runQuery(internal.trainings.guideContext, { documentIds: [] })
    const options = first.options
    const hay = history.filter((m) => m.role === "user").map((m) => m.text).join("\n")
    for (const d of options.documents) if (hay.toUpperCase().includes(d.namingCode)) addCandidate(d._id)
    for (const a of options.assets) if (hay.toUpperCase().includes(a.code)) a.documentIds.forEach(addCandidate)
    if (candidates.length < MAX_GUIDE_DOCS) {
      const apiKey = process.env.GEMINI_API_KEY
      if (apiKey) {
        try {
          const vector = await embedText({ ctx, feature: "training" }, `${draft.title}\n${latest.text}`)
          const hits = await ctx.vectorSearch("chunks", "by_embedding", { vector, limit: 40 })
          const docIds: Id<"documents">[] = await ctx.runQuery(internal.trainings.docsForChunks, {
            chunkIds: hits.map((h) => h._id),
          })
          for (const id of docIds.slice(0, 3)) addCandidate(id)
        } catch (err) {
          console.log("Training guide: vector search skipped:", err instanceof Error ? err.message : err)
        }
      }
    }
    const published = new Set(options.documents.map((d) => String(d._id)))
    const chosen = candidates.filter((id) => published.has(String(id))).slice(0, 8)
    const ctxData: { docs: GuideDoc[] } = await ctx.runQuery(internal.trainings.guideContext, { documentIds: chosen })

    // Number every passage with a key the model can cite.
    const byKey = new Map<string, { doc: GuideDoc; passage: GuidePassage }>()
    const keyOfChunk = new Map<string, string>()
    const blocks: string[] = []
    let n = 0
    for (const doc of ctxData.docs) {
      blocks.push(`DOCUMENT ${doc.namingCode} v${doc.version}: ${doc.title}`)
      for (const p of doc.passages.slice(0, MAX_PASSAGES_PER_DOC)) {
        n += 1
        const key = `E${n}`
        byKey.set(key, { doc, passage: p })
        keyOfChunk.set(String(p.chunkId), key)
        blocks.push(`[${key}]${p.section ? ` (${p.section})` : ""} ${p.display}`)
      }
      blocks.push("")
    }

    const assetById = new Map(options.assets.map((a) => [String(a._id), a]))
    const docById = new Map(options.documents.map((d) => [String(d._id), d]))
    const optionsText = [
      "AREAS:",
      ...options.areas.map((a) => `- ${a.code}: ${a.label}`),
      "ASSETS:",
      ...options.assets.map((a) => `- ${a.code}: ${a.name}`),
      "PUBLISHED DOCUMENTS:",
      ...options.documents.map((d) => `- ${d.namingCode} v${d.version}: ${d.title} [area ${d.area ?? "-"}]`),
    ].join("\n")
    const currentDraft = JSON.stringify({
      title: draft.title,
      kind: draft.kind,
      area: draft.area ?? "",
      purpose: draft.purpose,
      documentCodes: draft.documentIds.map((id) => docById.get(String(id))?.namingCode).filter(Boolean),
      objectives: draft.objectives.map((o) => ({
        id: o.id,
        text: o.text,
        source: (o.chunkId && keyOfChunk.get(String(o.chunkId))) || "",
        quote: o.quote,
      })),
      stops: draft.stops.map((s) => ({
        assetCode: assetById.get(String(s.assetId))?.code ?? "",
        objectiveNumbers: s.objectiveIds
          .map((id) => draft.objectives.findIndex((o) => o.id === id) + 1)
          .filter((x) => x > 0),
        hint: s.hint,
        evidence: s.evidence,
      })),
      passMark: draft.passMark,
      questionsPerObjective: draft.questionsPerObjective,
    })

    let out: z.infer<typeof GuideOut>
    try {
      out = await claudeJson({
        system: `${GUIDE_SYSTEM}\n\nOPTIONS:\n${optionsText}\n\nPASSAGES:\n${blocks.length ? blocks.join("\n") : "(none yet)"}`,
        messages: [
          ...history.slice(0, -1).map((m) => ({ role: m.role, content: m.text })),
          {
            role: "user" as const,
            content: `${args.kindLocked ? `KIND IS LOCKED: ${draft.kind}\n\n` : ""}CURRENT DRAFT: ${currentDraft}\n\nMESSAGE: ${latest.text}`,
          },
        ],
        schema: GuideOut,
        effort: "low",
        meter: { ctx, feature: "training" },
        maxTokens: 8000,
      })
    } catch (err) {
      console.error("Training guide failed:", describeClaudeError(err))
      throw new ConvexError(
        "The assistant is not responding right now. Your draft is kept, and you can fill it in yourself.",
      )
    }

    // ---- Sanitise: codes to ids, keys to passages, objectives checked in code.
    const existing = new Map(draft.objectives.map((o) => [o.id, o]))
    const usedIds = new Set<string>()
    const objectives: GuideDraft["objectives"] = []
    const idAtPosition = new Map<number, string>()
    let dropped = 0
    const droppedObjectives: string[] = []
    for (const [i, o] of out.objectives.entries()) {
      if (objectives.length >= MAX_GUIDE_OBJECTIVES) break
      const text = o.text.trim()
      if (!text) continue
      const hit = byKey.get(o.source.trim())
      const kept = existing.get(o.id.trim())
      let source: { documentId: Id<"documents">; chunkId: Id<"chunks"> | null; quote: string } | null = null
      if (hit) {
        const quote = o.quote.trim() && quoteIn(o.quote, hit.passage.text) ? o.quote.trim() : hit.passage.text
        source = { documentId: hit.doc.documentId, chunkId: hit.passage.chunkId, quote }
        // The objective may not state a number, code or rule its passage lacks.
        const provided = new Map<string, ProvidedExcerpt>([
          ["P", { key: "P", text: hit.passage.display, label: `${hit.doc.namingCode} ${hit.doc.title} ${hit.passage.section ?? ""}` }],
        ])
        const check = checkPoint({ text, sources: ["P"] }, provided)
        const why = "dropped" in check ? check.dropped : null
        if (why && why.reason !== "weak-support") {
          console.log(`Training guide: dropped objective (${why.reason} ${why.detail ?? ""}): ${text}`)
          dropped += 1
          droppedObjectives.push(text)
          continue
        }
      } else if (kept) {
        source = { documentId: kept.documentId, chunkId: kept.chunkId, quote: kept.quote }
      }
      if (!source) {
        dropped += 1
        droppedObjectives.push(text)
        continue
      }
      let id = kept ? kept.id : `o${objectives.length + 1}`
      while (usedIds.has(id) || (!kept && existing.has(id))) id = `${id}n`
      usedIds.add(id)
      idAtPosition.set(i + 1, id)
      objectives.push({ id, text, ...source })
    }

    const kind = args.kindLocked ? draft.kind : out.kind === "round" ? "round" : "course"
    const assetByCode = new Map(options.assets.map((a) => [a.code.toUpperCase(), a]))
    const stops: GuideDraft["stops"] = []
    if (kind === "round") {
      for (const s of out.stops) {
        const asset = assetByCode.get(s.assetCode.trim().toUpperCase())
        if (!asset || stops.some((x) => x.assetId === asset._id)) continue
        stops.push({
          assetId: asset._id,
          objectiveIds: Array.from(
            new Set(s.objectiveNumbers.map((k) => idAtPosition.get(k)).filter((x): x is string => !!x)),
          ),
          hint: s.hint.trim(),
          evidence: s.evidence,
        })
      }
    }

    const docByCode = new Map(options.documents.map((d) => [d.namingCode.toUpperCase(), d._id]))
    const documentIds: Id<"documents">[] = []
    for (const c of out.documentCodes) {
      const id = docByCode.get(c.trim().toUpperCase())
      if (id && !documentIds.includes(id)) documentIds.push(id)
    }
    for (const o of objectives) if (!documentIds.includes(o.documentId)) documentIds.push(o.documentId)

    const areaCodes = new Set(options.areas.map((a) => a.code))
    const area = areaCodes.has(out.area.trim().toUpperCase()) ? out.area.trim().toUpperCase() : draft.area
    const clamp = (x: number, lo: number, hi: number, fallback: number) =>
      Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : fallback
    const next: GuideDraft = {
      title: out.title.trim() || draft.title,
      kind,
      area,
      purpose: out.purpose.trim() || draft.purpose,
      documentIds,
      objectives,
      stops,
      passMark: clamp(out.passMark, 50, 100, draft.passMark),
      questionsPerObjective: clamp(out.questionsPerObjective, 1, 3, draft.questionsPerObjective),
    }
    const covered = new Set(stops.flatMap((s) => s.objectiveIds))
    const complete =
      next.title !== "" &&
      objectives.length > 0 &&
      (kind === "course" || (stops.length > 0 && objectives.every((o) => covered.has(o.id))))
    let reply = out.reply.trim() || "I've updated the draft."
    // The model miscounts; the count in the reply always comes from the list.
    const count = objectives.length
    reply = reply
      .replace(
        /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)(\s+(?:new\s+)?(?:learning\s+)?)objectives?\b/gi,
        (_m, mid: string) => `${count}${mid}${count === 1 ? "objective" : "objectives"}`,
      )
      .replace(/\b(?:een|twee|drie|vier|vijf|zes|zeven|acht|negen|tien|\d+)(\s+(?:nieuwe\s+)?)leerdoel(?:en)?\b/gi, (_m, mid: string) => `${count}${mid}${count === 1 ? "leerdoel" : "leerdoelen"}`)
      .replace(/press Create\b/g, "press Save draft or Send for review")
    if (dropped > 0) {
      reply += ` I left out ${dropped} ${dropped === 1 ? "objective" : "objectives"} I could not trace to a published passage: ${droppedObjectives.map((x) => `"${x}"`).join(", ")}.`
    }
    // Trainings that already use these source documents (the duplicate warning in step 1).
    const sameSource: { _id: Id<"trainings">; code: string; title: string; kind: "course" | "round"; status: string }[] = await ctx.runQuery(
      internal.trainings.existingForDocuments,
      { documentIds },
    )
    return { reply, draft: next, ready: Boolean(out.ready) && complete, existing: sameSource, droppedObjectives }
  },
})

// ---- Attempt questions ----------------------------------------------------------

const QuestionsOut = z.object({
  questions: z.array(
    z.object({
      objective: z.string(),
      prompt: z.string(),
      correct: z.string(),
      distractors: z.array(z.string()),
      whyWrong: z.array(z.string()),
      explanation: z.string(),
    }),
  ),
})

const QUESTION_SYSTEM = [
  "You write the questions of one Attempt of a Training in Oppr Knowledge, a factory's controlled knowledge base.",
  "Each Learning objective comes with the PASSAGE of a published document it is based on. Every question tests its objective using ONLY that passage. Nothing else you know counts.",
  "Code checks every question against its passage. A question whose correct answer or explanation states something the passage does not say is deleted.",
  "",
  "Each question:",
  "- `prompt`: one clear question for the person named under AUDIENCE, about the situation on the floor (\"You are about to ...\", \"What do you do when ...\", \"Which value ...\"). Do not give the answer away in the prompt. No \"which of these is NOT\" and no \"all of the above\".",
  "- `correct`: the right answer, short (a few words up to one sentence), stated by the passage. Copy numbers with their units and any codes exactly as the passage writes them.",
  "- `distractors`: exactly 3 wrong answers of the same form and length as the correct one, plausible to someone who did not read the passage, and clearly wrong according to it (a different number, the wrong order, a step that is skipped, a rule turned around). Never use a product, asset or document code that does not appear in the passages. The correct answer must not be longer or more detailed than the wrong ones.",
  "- `whyWrong`: one short sentence per distractor, in the same order, saying why it is wrong in the words of the passage (\"The passage says 190 °C, not 230 °C.\").",
  "- The prompt never contains the value or wording of the correct answer. Ask for the value instead of stating it.",
  "- For a table passage: name the row and the column header in the prompt; the options differ only in the value, never in the row.",
  "- `explanation`: one or two sentences that say why the correct answer is right, in the words of the passage. Keep every \"never\", \"do not\" and condition as strong as the passage says it.",
  "- `objective`: the key of the objective it tests (for example \"O2\").",
  "",
  "Write exactly the number of questions asked per objective. When an objective asks for 2, take two different angles (for example the value, and what goes wrong without it). Make them fresh: use the VARIATION SEED to pick a different angle, wording and situation, never repeat or closely reword a question listed under ASKED BEFORE, and word the correct answer differently from the answers listed under CORRECT BEFORE.",
].join("\n")

interface GenObjective {
  id: string
  text: string
  documentId: Id<"documents">
  namingCode: string
  documentTitle: string
  version: number | null
  chunkId: Id<"chunks"> | null
  passage: string | null
  section: string | null
  quote: string
  stopIndex: number | null
  critical?: boolean
}

interface GenInput {
  personRole: string
  training: { code: string; title: string; kind: "course" | "round"; purpose: string }
  questionsPerObjective: number
  objectives: GenObjective[]
  pool: { text: string; section: string | null; namingCode: string }[]
  previousPrompts: string[]
  previousCorrect?: string[]
  missedBefore?: string[]
}

interface Built {
  objectiveId: string
  stopIndex: number | null
  prompt: string
  correct: string
  distractors: string[]
  /** Parallel to distractors. */
  whyWrong: string[]
  source: "model" | "fallback"
  explanation: string
  citation: {
    documentId: Id<"documents">
    namingCode: string
    version: number
    chunkId: Id<"chunks"> | null
    quote: string
  }
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** A section label worth showing: never a page number. */
const sectionLabel = (s: string | null) => (s && !/^page\s*\d+$/i.test(s.trim()) ? s : null)

/** The sentence of the passage that states the answer best: stored as the citation quote. */
function matchedSentence(passage: string, answer: string, fallback: string): string {
  const sentences = passage
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12)
  let best = ""
  let bestScore = 0
  for (const s of sentences) {
    const sc = support(answer, s)
    if (sc > bestScore) {
      bestScore = sc
      best = s
    }
  }
  return bestScore >= 0.5 && best ? best : fallback
}

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y)
  return a.length === 0 ? 0 : a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2
}

/**
 * One question the model wrote, checked against its objective's passage.
 * Rejected when: a field is empty; fewer than 3 distinct wrong options; the
 * correct answer or explanation says what the passage does not; the prompt
 * gives the answer away (a fact of the correct answer, such as its number,
 * is in the prompt); the correct answer shares nothing with the passage; the
 * correct answer is more than 1.5 times as long as the median wrong one; a
 * code or number is invented; or a wrong option is supported by the passage.
 */
export function verify(
  raw: z.infer<typeof QuestionsOut>["questions"][number],
  o: GenObjective,
  allowedCodes: Set<string>,
  contextText: string,
): Built | { reason: string } {
  const contextNumbers = new Set(numbersIn(`${o.passage}\n${o.documentTitle}\n${o.section ?? ""}\n${contextText}`))
  const prompt = raw.prompt.trim()
  const correct = raw.correct.trim()
  const explanation = raw.explanation.trim()
  if (!prompt || !correct || !explanation) return { reason: "empty field" }
  const seen = new Set([squash(correct)])
  const distractors: string[] = []
  const why: string[] = []
  for (const [i, d] of raw.distractors.entries()) {
    const t = d.trim()
    if (!t || seen.has(squash(t))) continue
    seen.add(squash(t))
    distractors.push(t)
    why.push((raw.whyWrong?.[i] ?? "").trim())
  }
  if (distractors.length < 3) return { reason: "fewer than 3 distinct wrong options" }
  const options = distractors.slice(0, 3)
  const whyWrong = why.slice(0, 3)
  // The prompt must not state the answer: a value (number with or without a
  // unit) of the correct answer appearing in the prompt. A code such as
  // PX-4400 or EXL-201 may set the scene.
  const answerFacts = factTokens(correct).filter((t) => /\d/.test(t) && !(/[A-Z]/.test(t) && !t.includes(" ")))
  const promptFacts = new Set(factTokens(prompt))
  const promptNums = new Set(numbersIn(prompt))
  for (const f of answerFacts) {
    const n = numbersIn(f)
    if (promptFacts.has(f) || (n.length > 0 && n.every((x) => promptNums.has(x))))
      return { reason: `prompt gives the answer away (${f})` }
  }
  // The correct answer must be about the passage.
  if (o.passage && support(correct, o.passage) < 0.34 && !factTokens(correct).some((t) => factTokens(o.passage!).includes(t)))
    return { reason: "correct option is missing the passage's facts" }
  // A correct answer that is much longer than the wrong ones gives itself away.
  const med = median(options.map((d) => d.length))
  if (med > 0 && correct.length > 1.5 * med && correct.length - med > 12)
    return { reason: "correct option is much longer than the wrong ones" }
  const label = `${o.namingCode} v${o.version} ${o.documentTitle} ${o.section ?? ""}`
  const provided = new Map<string, ProvidedExcerpt>([["P", { key: "P", text: o.passage!, label }]])
  const checked = checkPoint({ text: `${correct}. ${explanation}`, sources: ["P"] }, provided)
  if ("dropped" in checked) return { reason: `${checked.dropped.reason}${checked.dropped.detail ? `: ${checked.dropped.detail}` : ""}` }
  // The prompt may set a scene ("line 2", "EXL-201"), but every code in it
  // must be a known one and every number must occur in the passage, its
  // document's title or the Training itself: no invented values.
  const known = new Set(factTokens(`${o.passage}\n${label}`))
  for (const code of codesIn(prompt)) {
    if (!allowedCodes.has(code) && !known.has(code)) return { reason: `prompt uses unknown code ${code}` }
  }
  const promptNumbers = numbersIn(prompt.replace(/\b[A-Z]{2,}(?:-[A-Z0-9]+)*-\d+[A-Z0-9]*\b/gi, " "))
  for (const n of promptNumbers) if (!contextNumbers.has(n)) return { reason: `prompt states ${n}` }
  for (const d of options) {
    for (const code of codesIn(d)) if (!allowedCodes.has(code)) return { reason: `wrong option uses unknown code ${code}` }
    // A wrong option the passage fully supports is not wrong.
    const tokens = factTokens(d)
    if (support(d, o.passage!) >= 0.9 && tokens.every((t) => known.has(t)) && squash(d).length > 12)
      return { reason: `wrong option is supported by the passage: ${d}` }
  }
  return {
    objectiveId: o.id,
    stopIndex: o.stopIndex,
    prompt,
    correct,
    distractors: options,
    whyWrong: whyWrong.map((w, i) => w || `${o.namingCode} does not say "${options[i]}".`),
    source: "model",
    explanation,
    citation: {
      documentId: o.documentId,
      namingCode: o.namingCode,
      version: o.version!,
      chunkId: o.chunkId,
      quote: o.passage ? matchedSentence(o.passage, `${correct}. ${explanation}`, o.quote) : o.quote,
    },
  }
}

// Word pairs a fallback distractor may swap: each turns a true statement
// into a false one of the same form.
const SWAPS: [string, string][] = [
  ["open", "close"],
  ["opened", "closed"],
  ["before", "after"],
  ["above", "below"],
  ["higher", "lower"],
  ["more than", "less than"],
  ["at least", "at most"],
  ["minimum", "maximum"],
  ["first", "last"],
  ["never", "always"],
  ["increase", "decrease"],
  ["rises", "drops"],
  ["clockwise", "anticlockwise"],
  ["empty", "full"],
  // Left out on purpose: "when"/"unless", "may"/"may not", "your own"/"every"
  // and "crosswise"/"one by one" broke the grammar of the sentence.
]
// Interchangeable things of the plant: swapping one for another makes a
// statement false (a role, a piece of protective equipment).
const KINDS: string[][] = [
  [
    "quality manager",
    "shift leader",
    "line operator",
    "mixing operator",
    "process engineer",
    "quality lab technician",
    "maintenance and safety engineer",
  ],
  ["heat-resistant gloves", "nitrile gloves", "cut-resistant gloves"],
  ["FFP2", "FFP1"],
  ["face shield", "bump cap"],
  ["personal lock", "shared lock"],
]
// First words of an instruction that "Do not" can turn around.
const IMPERATIVES = new Set(
  "attach call check clean close cool fill find fit follow go inform inspect isolate keep lay load lock measure mix open press pull purge put read release remove replace report scrap set sign start stop switch take tell tighten use wait wear weigh write".split(
    " ",
  ),
)

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const wordRe = (s: string) => new RegExp(`\\b${escapeRe(s)}\\b`, "i")
const keepCase = (from: string, to: string) => (/^[A-Z]/.test(from) ? to[0].toUpperCase() + to.slice(1) : to)

/** A number changed to another plausible value (same decimals, same sign). */
function otherNumbers(raw: string): string[] {
  const n = Number(raw)
  if (!Number.isFinite(n) || n === 0) return []
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0
  const fmt = (x: number) => x.toFixed(decimals)
  const step = decimals > 0 ? Math.pow(10, -decimals) : Math.abs(n) >= 20 ? 10 : 1
  return [n * 2, n / 2, n + Math.sign(n) * step * (Math.abs(n) >= 20 ? 3 : 2)]
    .map(fmt)
    .filter((x) => x !== raw && Number(x) !== 0 && Number(x) !== n)
}

/** One change each: a number, a word turned around ("open" -> "close") or a role or item swapped. */
function changedFacts(sentence: string): string[] {
  const out: string[] = []
  // Numbers that are values, not part of a code such as EXL-201 or FFP2.
  const numRe = /(?<![A-Za-z0-9.-])-?\d+(?:\.\d+)?(?![A-Za-z0-9.])/g
  for (const m of sentence.matchAll(numRe)) {
    for (const alt of otherNumbers(m[0]).slice(0, 2))
      out.push(sentence.slice(0, m.index) + alt + sentence.slice(m.index! + m[0].length))
  }
  for (const [a, b] of SWAPS) {
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      // "may" -> "may not" only where the sentence does not say "may not" already.
      if (to.startsWith(`${from} `) && wordRe(to).test(sentence)) continue
      const re = wordRe(from)
      const m = sentence.match(re)
      if (m) out.push(sentence.replace(re, keepCase(m[0], to)))
    }
  }
  for (const kind of KINDS) {
    for (const item of kind) {
      const re = wordRe(item)
      if (!re.test(sentence)) continue
      for (const other of kind.filter((r) => r !== item && !sentence.toLowerCase().includes(r.toLowerCase())).slice(0, 3))
        out.push(sentence.replace(re, other))
    }
  }
  return out
}

/**
 * False variants of a true sentence: one fact changed, then (when that
 * gives too few) the instruction negated or two facts changed at once.
 */
function falseVariants(sentence: string): string[] {
  const single = changedFacts(sentence)
  const out = [...single]
  const first = sentence.match(/^(\w+)\s/)?.[1] ?? ""
  if (/^(never|do not)\s/i.test(sentence))
    out.push(sentence.replace(/^(never|do not)\s+(\w)/i, (_, __, c: string) => c.toUpperCase()))
  else if (IMPERATIVES.has(first.toLowerCase())) out.push(`Do not ${sentence[0].toLowerCase()}${sentence.slice(1)}`)
  if (out.length < 3) {
    const same = squash(sentence)
    for (const v of single) for (const w of changedFacts(v)) if (squash(w) !== same) out.push(w)
  }
  return out
}

/**
 * Written by code when the model's questions for an objective all fail the
 * check: "which of these does the document say", with a sentence of the
 * cited passage as the answer and two or three false versions of that sentence
 * (a number changed, a word turned around, a role swapped) as the wrong
 * options. Never other true passages: those would be right answers too.
 * The sentence asked about varies between Attempts.
 */
function fallbackQuestion(o: GenObjective, pool: GenInput["pool"]): Built | null {
  const passage = o.passage ?? o.quote
  const sentences = passage
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 240 && !s.includes(" | "))
  // The objective's own quote first, then the passage's other sentences, in random order.
  const quoteSentences = sentences.filter((s) => quoteIn(s, o.quote) || quoteIn(o.quote, s))
  const candidates = [
    ...shuffle(quoteSentences.length > 0 ? quoteSentences : o.quote.length <= 240 ? [o.quote] : []),
    ...shuffle(sentences.filter((s) => !quoteSentences.includes(s))),
  ]
  // Prefer the quote, but sometimes ask about another sentence of the passage.
  if (candidates.length > 1 && Math.random() < 0.35) candidates.push(candidates.shift()!)
  const trueTexts = [passage, ...pool.map((p) => p.text)].map(squash)
  for (const sentence of candidates) {
    const seen = new Set([squash(sentence)])
    const wrong: string[] = []
    for (const v of shuffle(falseVariants(sentence))) {
      const k = squash(v)
      if (seen.has(k) || trueTexts.some((t) => t.includes(k))) continue
      seen.add(k)
      wrong.push(v)
      if (wrong.length === 3) break
    }
    // Three wrong options when the sentence allows it; two still make a fair question.
    if (wrong.length < 2) continue
    const section = sectionLabel(o.section)
    return {
      objectiveId: o.id,
      stopIndex: o.stopIndex,
      prompt: `${o.text.replace(/[.\s]+$/, "")}. Which of these does ${o.namingCode} say${section ? ` under "${section}"` : ""}?`,
      correct: sentence,
      distractors: wrong,
      whyWrong: wrong.map(() => `${o.namingCode} says: "${sentence}"`),
      source: "fallback",
      explanation: `${o.namingCode} v${o.version} states: "${sentence}"`,
      citation: {
        documentId: o.documentId,
        namingCode: o.namingCode,
        version: o.version!,
        chunkId: o.chunkId,
        quote: quoteIn(sentence, passage) ? sentence : o.quote,
      },
    }
  }
  return null
}

async function askModel(
  m: MeterSpec,
  input: GenInput,
  objectives: GenObjective[],
  perObjective: (o: GenObjective) => number,
  avoid: string[],
  maxTokens = 12000,
) {
  const blocks = objectives.map((o, i) =>
    [
      `[O${i + 1}] OBJECTIVE: ${o.text}`,
      `QUESTIONS: ${perObjective(o)}`,
      `SOURCE: ${o.namingCode} v${o.version} ${o.documentTitle}${sectionLabel(o.section) ? `, section "${o.section}"` : ""}`,
      `PASSAGE: ${o.passage}`,
    ].join("\n"),
  )
  const correctBefore = input.previousCorrect ?? []
  const prompt = [
    `TRAINING: ${input.training.code} ${input.training.title}`,
    `PURPOSE: ${input.training.purpose || "(not stated)"}`,
    `AUDIENCE: ${input.personRole}`,
    `VARIATION SEED: ${Math.random().toString(36).slice(2, 10)}`,
    "",
    "OBJECTIVES:",
    blocks.join("\n\n"),
    "",
    "ASKED BEFORE (do not repeat):",
    avoid.length ? avoid.map((p) => `- ${p}`).join("\n") : "(nothing)",
    "",
    "CORRECT BEFORE (word the correct answer differently):",
    correctBefore.length ? correctBefore.map((p) => `- ${p}`).join("\n") : "(nothing)",
  ].join("\n")
  return await claudeJson({
    system: QUESTION_SYSTEM,
    messages: [{ role: "user", content: prompt }],
    schema: QuestionsOut,
    effort: "low",
    maxTokens,
    meter: m,
  })
}

/** Questions per objective: two different angles for a must-be-right objective. */
const perFor = (input: GenInput) => (o: GenObjective) =>
  o.critical ? Math.max(2, Math.min(3, input.questionsPerObjective)) : Math.max(1, Math.min(3, input.questionsPerObjective))

/**
 * Writes and checks the questions for every objective of the input: one
 * model call for all, then one simpler call per objective that still lacks
 * questions, then code-written fallback questions. Every objective is tested.
 */
async function buildQuestions(
  m: MeterSpec,
  input: GenInput,
  log: string,
): Promise<{ ok: true; built: Built[] } | { ok: false; error: string }> {
  const objectives = input.objectives.filter((o) => o.passage && o.version != null)
  if (objectives.length < input.objectives.length || objectives.length === 0)
    return { ok: false, error: "A source passage of this Training is no longer published. An Engineer must review the Training first." }
  const per = perFor(input)
  const allowedCodes = new Set<string>()
  for (const o of objectives) for (const c of codesIn(`${o.passage}\n${o.namingCode}`)) allowedCodes.add(c)
  for (const p of input.pool) for (const c of codesIn(`${p.text}\n${p.namingCode}`)) allowedCodes.add(c)

  const byObjective = new Map<string, Built[]>(objectives.map((o) => [o.id, []]))
  let dropped = 0
  const asked = [...input.previousPrompts]
  const canUseModel = claudeConfigured() && !aiStubEnabled()
  const trainingContext = [
    `${input.training.code} ${input.training.title}`,
    input.training.purpose,
    ...objectives.map((o) => `${o.namingCode} ${o.documentTitle}`),
  ].join("\n")
  const take = (out: z.infer<typeof QuestionsOut>, batch: GenObjective[]) => {
    for (const q of out.questions) {
      const k = Number(q.objective.trim().replace(/^O/i, ""))
      const o = batch[k - 1]
      if (!o) continue
      const list = byObjective.get(o.id)!
      if (list.length >= per(o)) continue
      const r = verify(q, o, allowedCodes, trainingContext)
      if ("reason" in r) {
        dropped += 1
        console.log(`${log}: dropped question for ${o.id} (${r.reason}): ${q.prompt}`)
        continue
      }
      list.push(r)
      asked.push(r.prompt)
    }
  }

  if (canUseModel) {
    // 1. Everything in one call.
    try {
      take(await askModel(m, input, objectives, per, asked), objectives)
    } catch (err) {
      console.error(`${log}: question generation failed: ${describeClaudeError(err)}`)
      return { ok: false, error: "The questions could not be prepared right now. Try again in a moment." }
    }
    // 2. One simpler call per objective that is still short, before code writes it.
    for (const o of objectives) {
      if ((byObjective.get(o.id)?.length ?? 0) >= per(o)) continue
      try {
        take(await askModel(m, input, [o], per, asked, 4000), [o])
      } catch (err) {
        console.log(`${log}: single-objective retry for ${o.id} failed: ${describeClaudeError(err)}`)
      }
    }
  }

  // Every objective is tested, always: fill any gap with a question built by code.
  for (const o of objectives) {
    const list = byObjective.get(o.id)!
    let guard = 0
    while (list.length < per(o) && guard++ < 6) {
      const fb = fallbackQuestion(o, input.pool)
      if (!fb) break
      if (list.some((x) => squash(x.correct) === squash(fb.correct)) && guard < 6) continue
      list.push(fb)
    }
    if (list.length === 0) return { ok: false as const, error: "The questions could not be traced to their sources. An Engineer should check this Training." }
  }
  if (dropped > 0) console.log(`${log}: ${dropped} generated questions failed the source check`)
  const built = objectives
    .map((o, i) => ({ o, i }))
    .sort((a, b) => (a.o.stopIndex ?? -1) - (b.o.stopIndex ?? -1) || a.i - b.i)
    .flatMap(({ o }) => byObjective.get(o.id)!)
  return { ok: true, built }
}

/** A built question as stored: options shuffled by code, whyWrong in option order. */
function toStored(b: Built, i: number, critical: boolean) {
  const options = shuffle([b.correct, ...b.distractors])
  const whyOf = new Map(b.distractors.map((d, k) => [d, b.whyWrong[k] ?? ""]))
  return {
    id: `q${i + 1}`,
    objectiveId: b.objectiveId,
    stopIndex: b.stopIndex,
    prompt: b.prompt,
    options,
    correctIndex: options.indexOf(b.correct),
    explanation: b.explanation,
    citation: b.citation,
    answerIndex: null,
    answeredAt: null,
    flag: null,
    whyWrong: options.filter((x) => x !== b.correct).map((x) => whyOf.get(x) ?? ""),
    source: b.source,
    kind: "choice" as const,
    ...(critical ? { critical: true } : {}),
  }
}

export const generateQuestions = internalAction({
  args: { attemptId: v.id("trainingAttempts") },
  handler: async (ctx, args): Promise<void> => {
    const input: GenInput | null = await ctx.runQuery(internal.attempts.loadForGeneration, {
      attemptId: args.attemptId,
    })
    if (!input) return
    const fail = (error: string) => ctx.runMutation(internal.attempts.failGeneration, { attemptId: args.attemptId, error })
    // Everything was drawn from the question bank already.
    if (input.objectives.length === 0) {
      await ctx.runMutation(internal.attempts.saveQuestions, { attemptId: args.attemptId, questions: [] })
      return
    }
    const m: MeterSpec = { ctx, feature: "training", target: { kind: "trainingAttempt", id: args.attemptId } }
    const r = await buildQuestions(m, input, `Attempt ${args.attemptId}`)
    if ("error" in r) {
      await fail(r.error)
      return
    }
    const critical = new Set(input.objectives.filter((o) => o.critical).map((o) => o.id))
    const questions = r.built.map((b, i) => toStored(b, i, critical.has(b.objectiveId)))
    await ctx.runMutation(internal.attempts.saveQuestions, {
      attemptId: args.attemptId,
      questions,
      missedFirst: input.missedBefore ?? [],
    })
  },
})

// ---- Builder: sample questions and image questions ---------------------------------

interface BuilderObjective extends GenObjective {
  evidence?: "none" | "photo" | "note"
  images: { imageId: Id<"images">; alt: string }[]
}
interface BuilderContext {
  training: { code: string; title: string; kind: "course" | "round"; purpose: string; status: string }
  questionsPerObjective: number
  objectives: BuilderObjective[]
}

/** One unrecorded question per objective of the working version (trainings.sampleQuestions). */
export const sampleQuestionsInternal = internalAction({
  args: { trainingId: v.id("trainings"), objectiveIds: v.optional(v.array(v.string())) },
  handler: async (ctx, args): Promise<SampleQuestion[]> => {
    const c: BuilderContext | null = await ctx.runQuery(internal.ai.training.builderInput, { trainingId: args.trainingId })
    if (!c) throw new ConvexError("This Training no longer exists.")
    const objectives = c.objectives.filter((o) => !args.objectiveIds || args.objectiveIds.includes(o.id))
    const r = await buildQuestions(
      { ctx, feature: "training", target: { kind: "training", id: args.trainingId } },
      {
        personRole: "operator",
        training: c.training,
        questionsPerObjective: 1,
        objectives: objectives.map((o) => ({ ...o, critical: false })),
        pool: [],
        previousPrompts: [],
      },
      `Sample ${c.training.code}`,
    )
    if ("error" in r) throw new ConvexError(r.error)
    return r.built.map((b, i) => {
      const s = toStored(b, i, false)
      return {
        objectiveId: s.objectiveId,
        kind: "choice" as const,
        prompt: s.prompt,
        options: s.options,
        correctIndex: s.correctIndex,
        explanation: s.explanation,
        whyWrong: s.whyWrong,
        keyPoints: [],
        source: s.source,
        citation: s.citation,
      }
    })
  },
})

/** The working version's objectives with their passages and the pictures of their documents. */
export const builderInput = internalQuery({
  args: { trainingId: v.id("trainings") },
  handler: async (ctx, args): Promise<BuilderContext | null> => {
    const t = await ctx.db.get(args.trainingId)
    if (!t) return null
    const row = await getVersion(ctx, t._id, t.currentVersion)
    if (!row) return null
    const docs = makeDocCache(ctx)
    const imagesByDoc = new Map<string, { imageId: Id<"images">; alt: string }[]>()
    const objectives: BuilderObjective[] = []
    for (const o of row.objectives) {
      const live = await docs(o.documentId)
      const r = resolveObjective(live, o)
      const k = String(o.documentId)
      if (!imagesByDoc.has(k)) {
        const usages = await ctx.db
          .query("imageUsages")
          .withIndex("by_documentId_and_version", (q) =>
            q.eq("documentId", o.documentId).eq("documentVersion", r.liveVersion ?? o.documentVersion),
          )
          .take(50)
        const imgs: { imageId: Id<"images">; alt: string }[] = []
        for (const u of usages) {
          const img = await ctx.db.get(u.imageId)
          if (img && u.context !== "thumbnail" && !imgs.some((x) => x.imageId === img._id))
            imgs.push({ imageId: img._id, alt: img.altText || img.filename })
        }
        imagesByDoc.set(k, imgs)
      }
      const stop = t.kind === "round" ? row.stops.findIndex((s) => s.objectiveIds.includes(o.id)) : -1
      objectives.push({
        id: o.id,
        text: o.text,
        critical: !!o.critical,
        documentId: o.documentId,
        namingCode: o.namingCode,
        documentTitle: live?.doc.title ?? "",
        version: r.liveVersion,
        chunkId: r.passage?.chunkId ?? o.chunkId,
        passage: r.passage?.display ?? null,
        section: r.passage?.section ?? null,
        quote: o.quote,
        stopIndex: stop >= 0 ? stop : null,
        evidence: stop >= 0 ? row.stops[stop].evidence : "none",
        images: imagesByDoc.get(k) ?? [],
      })
    }
    return {
      training: { code: t.code, title: t.title, kind: t.kind, purpose: row.purpose, status: t.status },
      questionsPerObjective: row.questionsPerObjective,
      objectives,
    }
  },
})

// ---- Open answers: transcribe and grade ---------------------------------------------

const GradeOut = z.object({
  verdict: z.enum(["good", "partly", "not_yet"]),
  matched: z.array(z.string()),
  missing: z.array(z.string()),
  misconception: z.string(),
  feedback: z.string(),
})

const GRADE_SYSTEM = [
  "You grade one answer a factory operator gave in their own words to a Training question in Oppr Knowledge.",
  "Grade ONLY against the KEY POINTS and the cited PASSAGE of a published document. Spelling, grammar and wording do not matter; the meaning does. Spoken answers are transcripts and may be rough.",
  "- `matched`: the key points the answer names (copy the key point text). `missing`: the key points it leaves out (copy the key point text).",
  "- `verdict`: good when every key point is there in meaning and nothing said is wrong or unsafe; partly when some key points are there and nothing is unsafe; not_yet when most are missing or something said is wrong or unsafe.",
  "- `misconception`: when the answer states something wrong, say it in one short neutral sentence (\"Thinks the purge runs at 230 °C\"). Otherwise \"\".",
  "- `feedback`: at most two short sentences to the operator, in plain words: what was right, what to add, and what the document says, citing it as CODE vN. No em dashes.",
].join("\n")

const PHOTO_GRADE_PROMPT = (q: { prompt: string; keyPoints: string[]; passage: string; code: string }) =>
  [
    "A factory operator answered this Training question by taking a photo.",
    `QUESTION: ${q.prompt}`,
    `KEY POINTS the photo must show: ${q.keyPoints.map((k, i) => `(${i + 1}) ${k}`).join(" ")}`,
    `PASSAGE (${q.code}): ${q.passage}`,
    'Return JSON: {"verdict":"good"|"partly"|"not_yet"|"unclear","matched":[key point texts shown],"missing":[key point texts not shown],"misconception":"","feedback":"one or two plain sentences to the operator"}.',
    'Use "unclear" when the photo is too dark, blurred or does not show the subject, so a trainer must look.',
  ].join("\n")

function verdictScore(v: "good" | "partly" | "not_yet") {
  return v === "good" ? 1 : v === "partly" ? 0.5 : 0
}

/** Keeps only key point texts that are in the list (the model may reword them). */
function onlyKeyPoints(list: string[], keyPoints: string[]) {
  const out: string[] = []
  for (const x of list) {
    const hit = keyPoints.find((k) => squash(k) === squash(x)) ?? keyPoints.find((k) => support(x, k) >= 0.6)
    if (hit && !out.includes(hit)) out.push(hit)
  }
  return out
}

/**
 * Grades an open answer. Spoken answers are transcribed by Gemini first.
 * Typed and spoken answers are graded by Claude against the key points and
 * the cited passage (Gemini when Claude is not configured). Photo answers
 * are graded by Gemini vision; when that is unclear or fails, the grade is
 * left for the trainer (gradeError).
 */
export const gradeOpenAnswer = internalAction({
  args: { attemptId: v.id("trainingAttempts"), questionId: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const g: {
      prompt: string
      keyPoints: string[]
      explanation: string
      objective: string
      passage: string
      citation: { namingCode: string; version: number; quote: string }
      answerMode: "typed" | "voice" | "photo"
      answerText: string | null
      answerStorageId: Id<"_storage"> | null
      personRole: string
    } | null = await ctx.runQuery(internal.attempts.loadForGrading, args)
    if (!g) return
    const fail = (error: string) => ctx.runMutation(internal.attempts.failGrade, { ...args, error })
    const code = `${g.citation.namingCode} v${g.citation.version}`
    const m: MeterSpec = { ctx, feature: "training", target: { kind: "trainingAttempt", id: args.attemptId } }
    const gemini = (parts: GeminiPart[], json = false) =>
      geminiText(m, parts, { json, temperature: 0.1, maxOutputTokens: 2048 })
    try {
      if (aiStubEnabled()) {
        await fail("Automatic checking is off on this server. A trainer will check this answer.")
        return
      }
      let text = g.answerText ?? ""
      if (g.answerMode === "voice" && g.answerStorageId) {
        const blob = await ctx.storage.get(g.answerStorageId)
        if (!blob) throw new Error("The recording is missing.")
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const mime = (blob.type || "audio/webm").split(";")[0]
        const ask = "Transcribe this spoken answer of a factory operator word for word, in the language spoken. Keep numbers, units and machine codes exactly as said. Return only the transcript. If nothing can be heard, return: (nothing audible)"
        try {
          text = await gemini([{ inlineData: { mimeType: mime, data: toBase64(bytes) } }, { text: ask }])
        } catch (e) {
          if (mime !== "audio/webm") throw e
          text = await gemini([{ inlineData: { mimeType: "video/webm", data: toBase64(bytes) } }, { text: ask }])
        }
        await ctx.runMutation(internal.attempts.saveTranscript, { ...args, text })
        if (/^\(nothing audible\)$/i.test(text.trim())) {
          await ctx.runMutation(internal.attempts.saveGrade, {
            ...args,
            grade: {
              verdict: "not_yet",
              score: 0,
              matched: [],
              missing: g.keyPoints,
              feedback: "Nothing could be heard in the recording. Ask a trainer to check, or answer in writing next time.",
            },
          })
          return
        }
      }

      if (g.answerMode === "photo" && g.answerStorageId) {
        const blob = await ctx.storage.get(g.answerStorageId)
        if (!blob) throw new Error("The photo is missing.")
        const raw = await gemini(
          [
            { inlineData: { mimeType: (blob.type || "image/jpeg").split(";")[0], data: toBase64(new Uint8Array(await blob.arrayBuffer())) } },
            { text: PHOTO_GRADE_PROMPT({ prompt: g.prompt, keyPoints: g.keyPoints, passage: g.passage, code }) },
          ],
          true,
        )
        const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")) as {
          verdict?: string
          matched?: string[]
          missing?: string[]
          misconception?: string
          feedback?: string
        }
        if (parsed.verdict !== "good" && parsed.verdict !== "partly" && parsed.verdict !== "not_yet") {
          await fail("The photo could not be checked automatically. A trainer will look at it.")
          return
        }
        const matched = onlyKeyPoints(parsed.matched ?? [], g.keyPoints)
        await ctx.runMutation(internal.attempts.saveGrade, {
          ...args,
          grade: {
            verdict: parsed.verdict,
            score: verdictScore(parsed.verdict),
            matched,
            missing: g.keyPoints.filter((k) => !matched.includes(k)),
            ...(parsed.misconception?.trim() ? { misconception: parsed.misconception.trim() } : {}),
            feedback: (parsed.feedback ?? "").trim() || `Checked against ${code}.`,
          },
        })
        return
      }

      if (!text.trim()) {
        await fail("There is no answer text to check.")
        return
      }
      const user = [
        `QUESTION: ${g.prompt}`,
        `OBJECTIVE: ${g.objective}`,
        `KEY POINTS: ${g.keyPoints.map((k) => `\n- ${k}`).join("")}`,
        `PASSAGE (${code}): ${g.passage}`,
        `AUDIENCE: ${g.personRole}`,
        `ANSWER (${g.answerMode === "voice" ? "spoken, transcribed" : "typed"}): ${text}`,
      ].join("\n")
      let out: z.infer<typeof GradeOut>
      if (claudeConfigured()) {
        out = await claudeJson({ system: GRADE_SYSTEM, messages: [{ role: "user", content: user }], schema: GradeOut, effort: "low", maxTokens: 2000, meter: m })
      } else {
        const raw = await gemini(
          [{ text: `${GRADE_SYSTEM}\n\nReturn JSON with verdict, matched, missing, misconception, feedback.\n\n${user}` }],
          true,
        )
        out = GradeOut.parse(JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")))
      }
      const matched = onlyKeyPoints(out.matched, g.keyPoints)
      const missing = g.keyPoints.filter((k) => !matched.includes(k))
      // The verdict must agree with the key points: "good" needs every one of them.
      let verdict = out.verdict
      if (verdict === "good" && missing.length > 0) verdict = "partly"
      if (verdict === "partly" && matched.length === 0) verdict = "not_yet"
      await ctx.runMutation(internal.attempts.saveGrade, {
        ...args,
        grade: {
          verdict,
          score: verdictScore(verdict),
          matched,
          missing,
          ...(out.misconception.trim() ? { misconception: out.misconception.trim() } : {}),
          feedback: out.feedback.replace(/—/g, ",").trim() || `Checked against ${code}.`,
        },
      })
    } catch (err) {
      console.error(`Grading ${args.attemptId}/${args.questionId} failed:`, describeClaudeError(err))
      await fail("Your answer could not be checked automatically. A trainer will check it.")
    }
  },
})

// ---- Self check of the question verifier ----------------------------------------------

/**
 * Runs verify() on fixed cases, so the rules can be checked without a model:
 * npx convex run ai/training:verifySelfCheck
 */
export const verifySelfCheck = internalAction({
  args: {},
  handler: async () => {
    const o: GenObjective = {
      id: "o1",
      text: "Purge the barrel with the right compound at the right temperature",
      documentId: "x" as Id<"documents">,
      namingCode: "EXT-OPS-SOP-0001",
      documentTitle: "Colour changeover line 2",
      version: 1,
      chunkId: null,
      passage: "Purge the barrel with purge compound PX-4400 at 190 °C until the melt runs clean.",
      section: "Purge",
      quote: "Purge the barrel with purge compound PX-4400 at 190 °C until the melt runs clean.",
      stopIndex: null,
    }
    const codes = new Set(["PX-4400"])
    const base = {
      objective: "O1",
      correct: "PX-4400 at 190 °C",
      distractors: ["PX-4400 at 230 °C", "PX-4400 at 150 °C", "Fresh PE at 190 °C"],
      whyWrong: ["The SOP says 190 °C.", "The SOP says 190 °C.", "The SOP says purge compound PX-4400."],
      explanation: "Purge the barrel with purge compound PX-4400 at 190 °C until the melt runs clean.",
    }
    const cases = [
      { name: "good question passes", q: { ...base, prompt: "Which compound and temperature do you purge the barrel with?" }, expect: "pass" },
      { name: "prompt with the answer's number is rejected", q: { ...base, prompt: "You purge at 190 °C. Which compound do you use?" }, expect: "reject" },
      {
        name: "long correct option is rejected",
        q: {
          ...base,
          prompt: "Which compound and temperature do you purge the barrel with?",
          correct: "Purge compound PX-4400 at 190 °C until the melt runs completely clean and free of the old colour",
        },
        expect: "reject",
      },
    ]
    return cases.map((c) => {
      const r = verify(c.q, o, codes, "EXT-TRN-0001 Line 2 changeover")
      const got = "reason" in r ? "reject" : "pass"
      return {
        name: c.name,
        ok: got === c.expect,
        got,
        reason: "reason" in r ? r.reason : null,
        whyWrongLength: "reason" in r ? null : r.whyWrong.length,
        source: "reason" in r ? null : r.source,
      }
    })
  },
})
