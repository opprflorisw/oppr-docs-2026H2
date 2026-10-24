// AI for Trainings: the Guided creation assistant, and the fresh questions of
// every Attempt (CONTEXT.md: Training, Attempt; ADR 0002 and 0003).
//
// The assistant only ever returns a Draft; a person presses Create and an
// Engineer signs it off. Attempt questions are generated output from
// Published passages only: the correct option and the explanation are checked
// in code against the objective's passage (grounding.checkPoint), and the
// option order is shuffled by code, never taken from the model.
import { ConvexError, v } from "convex/values"
import { z } from "zod"
import { action, internalAction } from "../_generated/server"
import { internal } from "../_generated/api"
import { Id } from "../_generated/dataModel"
import { requireUser } from "../lib/auth"
import { claudeConfigured, claudeJson, describeClaudeError } from "./llm"
import { checkPoint, factTokens, normalise, ProvidedExcerpt, support } from "./grounding"
import { aiStubEnabled } from "./wiki"
import { EMBEDDING_DIM, EMBEDDING_MODEL } from "./constants"

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
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

async function embedText(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(`${GEMINI_BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: { parts: [{ text }] }, outputDimensionality: EMBEDDING_DIM }),
  })
  if (!res.ok) throw new Error(`Gemini embed ${res.status}`)
  const json = (await res.json()) as { embedding?: { values?: number[] } }
  if (!Array.isArray(json.embedding?.values)) throw new Error("No embedding returned")
  return json.embedding!.values!
}

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
  "- Objectives: propose 3 to 8 for a new Training. Each states one thing the person must know or do, in plain words, starting with a verb (for example \"Tighten the die bolts in the right pattern and to the right torque\"). It must be fully covered by ONE passage in PASSAGES.",
  "- `source` is the key of that passage (for example \"E12\"). Only keys from PASSAGES. Keep the source of an existing objective unless asked. `quote` is the shortest sentence or phrase of that passage that states it, copied character for character; use the whole passage if unsure.",
  "- An objective never adds a number, code or rule its passage does not state. Prefer safety-critical points and the steps where mistakes happen. Leave out table headers and titles.",
  "- `id`: copy the id of an existing objective you keep; use \"\" for a new one.",
  "- Only passages of the documents listed under PASSAGES are available this turn. If the request needs another published document, add its code to documentCodes and say you will pick its passages on the next turn.",
  "- Stops (kind round only): one per Asset, in walking order. `objectiveNumbers` are 1-based positions in YOUR objectives list. Each objective is tested at exactly one stop, usually the Asset its document is about. `hint` tells the person how to find the Asset (one short line). `evidence` is photo or note only when seeing the real thing proves something (a guard in place, a gauge reading); otherwise none. For a course return stops as [].",
  "- area is an area code from OPTIONS, or the area of the main source document.",
  "- passMark is 80 and questionsPerObjective is 1 unless the person asks otherwise (passMark 50 to 100, questionsPerObjective 1 to 3).",
  "- title: 2 to 6 words naming the subject, without the word Training. purpose: one line saying who it is for and what they must be able to do.",
  "- `reply` is at most two short sentences in the language of the person. Do not repeat the draft field by field. Ask at most ONE question, and only when you cannot make a sensible draft without it.",
  "- Set ready to true once the draft has a title, at least one objective with a valid source and, for a Round, stops that cover every objective. Then end the reply with: Check the draft and press Create, or tell me what to change.",
  "- You never create, approve or publish the Training. The person presses Create, and an Engineer reviews it.",
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
  },
  handler: async (ctx, args): Promise<{ reply: string; draft: GuideDraft; ready: boolean }> => {
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
          const vector = await embedText(`${draft.title}\n${latest.text}`, apiKey)
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
          { role: "user" as const, content: `CURRENT DRAFT: ${currentDraft}\n\nMESSAGE: ${latest.text}` },
        ],
        schema: GuideOut,
        effort: "low",
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
          continue
        }
      } else if (kept) {
        source = { documentId: kept.documentId, chunkId: kept.chunkId, quote: kept.quote }
      }
      if (!source) {
        dropped += 1
        continue
      }
      let id = kept ? kept.id : `o${objectives.length + 1}`
      while (usedIds.has(id) || (!kept && existing.has(id))) id = `${id}n`
      usedIds.add(id)
      idAtPosition.set(i + 1, id)
      objectives.push({ id, text, ...source })
    }

    const kind = out.kind === "round" ? "round" : "course"
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
    if (dropped > 0) {
      reply += ` I left out ${dropped} ${dropped === 1 ? "objective" : "objectives"} I could not trace to a published passage.`
    }
    return { reply, draft: next, ready: Boolean(out.ready) && complete }
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
  "- `distractors`: exactly 3 wrong answers of the same form and length as the correct one, plausible to someone who did not read the passage, and clearly wrong according to it (a different number, the wrong order, a step that is skipped, a rule turned around). Never use a product, asset or document code that does not appear in the passages.",
  "- `explanation`: one or two sentences that say why the correct answer is right, in the words of the passage. Keep every \"never\", \"do not\" and condition as strong as the passage says it.",
  "- `objective`: the key of the objective it tests (for example \"O2\").",
  "",
  "Write exactly the number of questions asked per objective. Make them fresh: use the VARIATION SEED to pick a different angle, wording and situation, and never repeat or closely reword a question listed under ASKED BEFORE.",
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
}

interface GenInput {
  personRole: string
  training: { code: string; title: string; kind: "course" | "round"; purpose: string }
  questionsPerObjective: number
  objectives: GenObjective[]
  pool: { text: string; section: string | null; namingCode: string }[]
  previousPrompts: string[]
}

interface Built {
  objectiveId: string
  stopIndex: number | null
  prompt: string
  correct: string
  distractors: string[]
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

/** One question the model wrote, checked against its objective's passage. Null when it fails. */
function verify(
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
  for (const d of raw.distractors) {
    const t = d.trim()
    if (!t || seen.has(squash(t))) continue
    seen.add(squash(t))
    distractors.push(t)
  }
  if (distractors.length < 3) return { reason: "fewer than 3 distinct wrong options" }
  const options = distractors.slice(0, 3)
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
    explanation,
    citation: {
      documentId: o.documentId,
      namingCode: o.namingCode,
      version: o.version!,
      chunkId: o.chunkId,
      quote: o.quote,
    },
  }
}

/**
 * Written by code when the model's questions for an objective all fail the
 * check: "which statement is in the document" with the quoted passage as the
 * answer and other passages as the wrong options. Grounded by construction.
 */
function fallbackQuestion(o: GenObjective, pool: GenInput["pool"]): Built | null {
  const others = shuffle(
    pool.filter((p) => !quoteIn(o.quote, p.text) && squash(p.text) !== squash(o.quote) && p.section !== o.section),
  )
  const sameDoc = others.filter((p) => p.namingCode === o.namingCode)
  const picks = [...sameDoc, ...others.filter((p) => p.namingCode !== o.namingCode)].slice(0, 3)
  if (picks.length < 3) return null
  const cut = (s: string) => (s.length > 220 ? `${s.slice(0, 217)}...` : s)
  return {
    objectiveId: o.id,
    stopIndex: o.stopIndex,
    prompt: `${o.text.replace(/[.\s]+$/, "")}. Which of these does ${o.namingCode} say${o.section ? ` under "${o.section}"` : ""}?`,
    correct: cut(o.quote),
    distractors: picks.map((p) => cut(p.text)),
    explanation: `${o.namingCode} v${o.version} states: "${o.quote}"`,
    citation: {
      documentId: o.documentId,
      namingCode: o.namingCode,
      version: o.version!,
      chunkId: o.chunkId,
      quote: o.quote,
    },
  }
}

async function askModel(input: GenInput, objectives: GenObjective[], perObjective: number, avoid: string[]) {
  const blocks = objectives.map((o, i) =>
    [
      `[O${i + 1}] OBJECTIVE: ${o.text}`,
      `SOURCE: ${o.namingCode} v${o.version} ${o.documentTitle}${o.section ? `, section "${o.section}"` : ""}`,
      `PASSAGE: ${o.passage}`,
    ].join("\n"),
  )
  const prompt = [
    `TRAINING: ${input.training.code} ${input.training.title}`,
    `PURPOSE: ${input.training.purpose || "(not stated)"}`,
    `AUDIENCE: ${input.personRole}`,
    `QUESTIONS PER OBJECTIVE: ${perObjective}`,
    `VARIATION SEED: ${Math.random().toString(36).slice(2, 10)}`,
    "",
    "OBJECTIVES:",
    blocks.join("\n\n"),
    "",
    "ASKED BEFORE (do not repeat):",
    avoid.length ? avoid.map((p) => `- ${p}`).join("\n") : "(nothing)",
  ].join("\n")
  return await claudeJson({
    system: QUESTION_SYSTEM,
    messages: [{ role: "user", content: prompt }],
    schema: QuestionsOut,
    effort: "low",
    maxTokens: 12000,
  })
}

export const generateQuestions = internalAction({
  args: { attemptId: v.id("trainingAttempts") },
  handler: async (ctx, args): Promise<void> => {
    const input: GenInput | null = await ctx.runQuery(internal.attempts.loadForGeneration, {
      attemptId: args.attemptId,
    })
    if (!input) return
    const fail = (error: string) => ctx.runMutation(internal.attempts.failGeneration, { attemptId: args.attemptId, error })

    const objectives = input.objectives.filter((o) => o.passage && o.version != null)
    if (objectives.length < input.objectives.length || objectives.length === 0) {
      await fail("A source passage of this Training is no longer published. An Engineer must review the Training first.")
      return
    }
    const per = Math.max(1, Math.min(3, input.questionsPerObjective))
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

    // At most two model calls: everything, then once more for what failed.
    for (let round = 0; round < 2 && canUseModel; round++) {
      const missing = objectives.filter((o) => (byObjective.get(o.id)?.length ?? 0) < per)
      if (missing.length === 0) break
      let out: z.infer<typeof QuestionsOut>
      try {
        out = await askModel(input, missing, per, asked)
      } catch (err) {
        const why = describeClaudeError(err)
        console.error(`Attempt ${args.attemptId}: question generation failed: ${why}`)
        if (round === 0) {
          await fail("The questions could not be prepared right now. Try again in a moment.")
          return
        }
        break
      }
      for (const q of out.questions) {
        const k = Number(q.objective.trim().replace(/^O/i, ""))
        const o = missing[k - 1]
        if (!o) continue
        const list = byObjective.get(o.id)!
        if (list.length >= per) continue
        const r = verify(q, o, allowedCodes, trainingContext)
        if ("reason" in r) {
          dropped += 1
          console.log(`Attempt ${args.attemptId}: dropped question for ${o.id} (${r.reason}): ${q.prompt}`)
          continue
        }
        list.push(r)
        asked.push(r.prompt)
      }
    }

    // Every objective is tested, always: fill any gap with a question built by code.
    for (const o of objectives) {
      const list = byObjective.get(o.id)!
      while (list.length < per) {
        const fb = fallbackQuestion(o, input.pool)
        if (!fb) break
        list.push(fb)
      }
      if (list.length === 0) {
        await fail("The questions could not be traced to their sources. An Engineer should check this Training.")
        return
      }
    }
    if (dropped > 0) console.log(`Attempt ${args.attemptId}: ${dropped} generated questions failed the source check`)

    const ordered = objectives
      .map((o, i) => ({ o, i }))
      .sort((a, b) => (a.o.stopIndex ?? -1) - (b.o.stopIndex ?? -1) || a.i - b.i)
      .flatMap(({ o }) => byObjective.get(o.id)!)
    const questions = ordered.map((b, i) => {
      // Code decides where the right answer sits, never the model.
      const options = shuffle([b.correct, ...b.distractors])
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
      }
    })
    await ctx.runMutation(internal.attempts.saveQuestions, { attemptId: args.attemptId, questions })
  },
})
