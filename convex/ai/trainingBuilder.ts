// AI for the Training builder (CONTEXT.md: Training, Learning objective;
// ADR 0002 and 0003). The AI drafts, a person confirms:
// - draftBreakdown: the TWI job breakdown (important steps, key points with
//   their kind, reasons), every row citing a Published passage.
// - draftQuestions: questions for the question bank (multiple choice and open
//   questions with key points), or one replacement question.
// - refreshSignals: "Still on point?", an analysis of the Attempts on the
//   version in use, saved in trainingSignals.
// Everything the model writes is checked in code against the cited passage
// (grounding.checkPoint). When the model is not available, code writes a
// plainer version from the passages, and says so.
import { ConvexError, v } from "convex/values"
import { z } from "zod"
import { action, type ActionCtx } from "../_generated/server"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { requireUser } from "../lib/auth"
import { claudeConfigured, claudeJson, describeClaudeError } from "./llm"
import { checkPoint, normalise, type ProvidedExcerpt } from "./grounding"
import { aiStubEnabled } from "./wiki"

const squash = (s: string) => normalise(s).replace(/\s+/g, " ").trim()
const quoteIn = (quote: string, text: string) => {
  const q = squash(quote)
  return q.length > 0 && squash(text).includes(q)
}
const uid = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8)}`
const canUseModel = () => claudeConfigured() && !aiStubEnabled()

const objectiveIn = v.object({
  id: v.string(),
  text: v.string(),
  documentId: v.id("documents"),
  chunkId: v.union(v.id("chunks"), v.null()),
  quote: v.string(),
})

interface ObjectiveIn {
  id: string
  text: string
  documentId: Id<"documents">
  chunkId: Id<"chunks"> | null
  quote: string
}

interface Passage {
  chunkId: Id<"chunks">
  text: string
  display: string
  section: string | null
}
interface LiveDoc {
  documentId: Id<"documents">
  namingCode: string
  title: string
  version: number
  passages: Passage[]
}

interface Citation {
  documentId: Id<"documents">
  namingCode: string
  version: number
  chunkId: Id<"chunks"> | null
  quote: string
}

type KeyPointKind = "safety" | "quality" | "knack"

const SAFETY_RE =
  /\b(warning|danger|caution|ppe|lockout|tagout|loto|isolat|guard|burn|hot|pinch|crush|never|do not|must not|gloves|goggles|face shield|helmet|hearing|emergency|stop button|e-stop)\b/i
const QUALITY_RE = /\b(tolerance|measure|check|inspect|reject|quality|spec|within|record|sample|gauge|calibrat|thickness|diameter)\b/i

function guessKind(text: string): KeyPointKind {
  if (SAFETY_RE.test(text)) return "safety"
  if (QUALITY_RE.test(text)) return "quality"
  return "knack"
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && !s.includes(" | "))
}

/** Where each objective's passage is in today's Published version. */
function locate(o: ObjectiveIn, docs: LiveDoc[]) {
  const doc = docs.find((d) => d.documentId === o.documentId)
  if (!doc) return null
  const passage =
    (o.chunkId ? doc.passages.find((p) => p.chunkId === o.chunkId) : undefined) ??
    doc.passages.find((p) => quoteIn(o.quote, p.text) || quoteIn(o.quote, p.display)) ??
    null
  if (!passage) return null
  const index = doc.passages.indexOf(passage)
  return { doc, passage, index }
}

function citationFor(doc: LiveDoc, p: Passage, quote?: string): Citation {
  const q = quote && (quoteIn(quote, p.text) || quoteIn(quote, p.display)) ? quote : p.text
  return { documentId: doc.documentId, namingCode: doc.namingCode, version: doc.version, chunkId: p.chunkId, quote: q }
}

/** A reason may explain in other words, but never adds a number, code or rule. */
function groundedReason(text: string, passage: Passage, label: string): boolean {
  if (!text.trim()) return false
  const provided = new Map<string, ProvidedExcerpt>([["P", { key: "P", text: passage.display, label }]])
  const r = checkPoint({ text, sources: ["P"] }, provided)
  if ("dropped" in r) return r.dropped.reason !== "unsupported-token" && r.dropped.reason !== "negation-mismatch"
  return true
}

/** A statement survives only when its numbers, codes and meaning are in the passage. */
function grounded(text: string, passage: Passage, label: string): boolean {
  if (!text.trim()) return false
  const provided = new Map<string, ProvidedExcerpt>([["P", { key: "P", text: passage.display, label }]])
  const r = checkPoint({ text, sources: ["P"] }, provided)
  if ("dropped" in r) return r.dropped.reason === "weak-support"
  return true
}

async function loadDocs(ctx: ActionCtx, objectives: ObjectiveIn[]): Promise<LiveDoc[]> {
  const ids = Array.from(new Set(objectives.map((o) => o.documentId)))
  return await ctx.runQuery(internal.trainingBuilder.passagesFor, { documentIds: ids })
}

// ---- Job breakdown ------------------------------------------------------------------

const BreakdownOut = z.object({
  rows: z.array(
    z.object({
      step: z.string(),
      source: z.string(),
      keyPoints: z.array(z.object({ text: z.string(), kind: z.enum(["safety", "quality", "knack"]) })),
      reasons: z.array(z.string()),
      objectives: z.array(z.string()),
    }),
  ),
  mustBeRight: z.array(z.string()),
})

const BREAKDOWN_SYSTEM = [
  "You write a TWI Job Breakdown for a Training in Oppr Knowledge, a factory's controlled knowledge base. An Engineer checks and edits it.",
  "A Job Breakdown lists the IMPORTANT STEPS of the job in the order the work is done, each with its KEY POINTS (what makes or breaks the step: safety, quality, or a knack that makes it easier) and the REASON for each key point.",
  "",
  "Rules:",
  "- Use ONLY the PASSAGES. Never add a number, code, setting or rule a passage does not state. Copy values with their units exactly.",
  "- `step`: a short verb phrase of what is done (\"Close the die gate\"), at most 10 words. Follow the order of the passages.",
  "- `source`: the key of the ONE passage the step is taken from (for example \"E7\").",
  "- `keyPoints`: 1 to 4 per step. `kind` is safety for anything that can hurt a person (WARNING, DANGER, PPE, lockout, hot surfaces), quality for anything that makes the product right or wrong, knack for a trick that makes the step easier or faster.",
  "- `reasons`: why the key points matter (what goes wrong otherwise: injury, scrap, damage), as the passages state or directly imply it. Use the WARNING, CAUTION and NOTE text and the consequences the passages name. Only when no passage gives any reason, return an empty list; never invent a number or rule.",
  "- `objectives`: the ids from OBJECTIVES this step teaches (may be empty).",
  "- 3 to 10 steps. Leave out table headers and document titles.",
  "- `mustBeRight`: ids of OBJECTIVES whose mistake can hurt someone or ruin the product. Every objective about a safety key point is must-be-right.",
].join("\n")

export const draftBreakdown = action({
  args: {
    title: v.string(),
    purpose: v.string(),
    objectives: v.array(objectiveIn),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    if (args.objectives.length === 0) throw new ConvexError("Add Learning objectives first: the breakdown is built from their passages.")
    const docs = await loadDocs(ctx, args.objectives)
    if (docs.length === 0) throw new ConvexError("None of the source documents is published any more.")

    // The passages around the objectives, in document order, with keys.
    const byKey = new Map<string, { doc: LiveDoc; passage: Passage }>()
    const blocks: string[] = []
    let n = 0
    for (const doc of docs) {
      blocks.push(`DOCUMENT ${doc.namingCode} v${doc.version}: ${doc.title}`)
      for (const p of doc.passages.slice(0, 80)) {
        n += 1
        const key = `E${n}`
        byKey.set(key, { doc, passage: p })
        blocks.push(`[${key}]${p.section ? ` (${p.section})` : ""} ${p.display}`)
      }
    }
    const objectiveIds = new Set(args.objectives.map((o) => o.id))
    // The model may answer "o2", "O2" or "2": map each to a real objective id.
    const toObjectiveId = (raw: string): string | null => {
      const x = raw.trim()
      if (objectiveIds.has(x)) return x
      const lower = x.toLowerCase()
      const hit = args.objectives.find((o) => o.id.toLowerCase() === lower)
      if (hit) return hit.id
      const n = Number(x.replace(/^o/i, ""))
      return Number.isInteger(n) && n >= 1 && n <= args.objectives.length ? args.objectives[n - 1].id : null
    }

    if (canUseModel()) {
      try {
        const out = await claudeJson({
          meter: { ctx, feature: "training" },
          system: BREAKDOWN_SYSTEM,
          messages: [
            {
              role: "user",
              content: [
                `TRAINING: ${args.title}`,
                `PURPOSE: ${args.purpose || "(not stated)"}`,
                "OBJECTIVES:",
                ...args.objectives.map((o) => `- id "${o.id}": ${o.text}`),
                "",
                "PASSAGES:",
                blocks.join("\n"),
              ].join("\n"),
            },
          ],
          schema: BreakdownOut,
          effort: "low",
          maxTokens: 8000,
        })
        let dropped = 0
        const rows = []
        for (const r of out.rows.slice(0, 20)) {
          const hit = byKey.get(r.source.trim())
          if (!hit) {
            dropped += 1
            continue
          }
          const label = `${hit.doc.namingCode} ${hit.doc.title} ${hit.passage.section ?? ""}`
          if (!grounded(r.step, hit.passage, label)) {
            dropped += 1
            continue
          }
          const kps = r.keyPoints.filter((k) => grounded(k.text, hit.passage, label))
          dropped += r.keyPoints.length - kps.length
          const reasons = r.reasons.filter((x) => groundedReason(x, hit.passage, label))
          rows.push({
            id: uid("b"),
            step: r.step.trim(),
            keyPoints: kps.map((k) => k.text.trim()),
            keyPointKinds: kps.map((k) => (SAFETY_RE.test(k.text) ? "safety" : k.kind) as KeyPointKind),
            reasons,
            objectiveIds: r.objectives.map(toObjectiveId).filter((x): x is string => x !== null),
            citation: citationFor(hit.doc, hit.passage),
          })
        }
        if (rows.length > 0) {
          const critical = new Set(out.mustBeRight.map(toObjectiveId).filter((x): x is string => x !== null))
          for (const r of rows)
            if (r.keyPointKinds.includes("safety")) r.objectiveIds.forEach((id) => critical.add(id))
          return { rows, critical: Array.from(critical), byCode: false, dropped }
        }
      } catch (err) {
        console.error("Training builder breakdown failed:", describeClaudeError(err))
      }
    }

    // Code fallback: one step per objective, in passage order, key points
    // from the passage sentences. Reasons are left for the author.
    const located = args.objectives
      .map((o) => ({ o, at: locate(o, docs) }))
      .filter((x): x is { o: ObjectiveIn; at: NonNullable<ReturnType<typeof locate>> } => x.at !== null)
      .sort(
        (a, b) =>
          docs.indexOf(a.at.doc) - docs.indexOf(b.at.doc) || a.at.index - b.at.index,
      )
    const rows = located.map(({ o, at }) => {
      const kps = sentencesOf(o.quote).slice(0, 3)
      const keyPoints = kps.length > 0 ? kps : [o.quote.slice(0, 200)]
      return {
        id: uid("b"),
        step: o.text,
        keyPoints,
        keyPointKinds: keyPoints.map(guessKind),
        reasons: [] as string[],
        objectiveIds: [o.id],
        citation: citationFor(at.doc, at.passage, o.quote),
      }
    })
    const critical = rows.filter((r) => r.keyPointKinds.includes("safety")).flatMap((r) => r.objectiveIds)
    return { rows, critical, byCode: true, dropped: 0 }
  },
})

// ---- Question bank ------------------------------------------------------------------

const QuestionsOut = z.object({
  questions: z.array(
    z.object({
      objective: z.string(),
      kind: z.enum(["choice", "open"]),
      prompt: z.string(),
      correct: z.string(),
      distractors: z.array(z.object({ text: z.string(), whyWrong: z.string() })),
      keyPoints: z.array(z.string()),
      modelAnswer: z.string(),
      explanation: z.string(),
    }),
  ),
})

const QUESTION_SYSTEM = [
  "You write questions for the question bank of a Training in Oppr Knowledge, a factory's controlled knowledge base. An Engineer checks every question before it is used.",
  "Each Learning objective comes with the PASSAGE of a published document. Every question tests its objective using ONLY that passage.",
  "Code checks every answer and explanation against the passage, and deletes a question that states something the passage does not say.",
  "",
  "Two kinds of question:",
  "- choice: `prompt` is one clear question about the situation on the floor (\"You are about to ...\", \"What do you do when ...\"). `correct` is the right answer (short, stated by the passage, values copied exactly). `distractors`: exactly 3 plausible wrong answers of the same form and length, each with `whyWrong` (one sentence from the passage that shows why it is wrong). keyPoints [] and modelAnswer \"\".",
  "- open: `prompt` asks the person to explain in their own words (\"Describe what you do when ...\", \"Explain why ...\"). `keyPoints`: 2 to 4 short points a good answer must name, each stated by the passage. `modelAnswer`: a short good answer. correct \"\" and distractors [].",
  "- Never give the answer away in the prompt. Never state the value in the prompt. No \"which is NOT\" and no \"all of the above\".",
  "- `explanation`: one or two sentences in the words of the passage.",
  "- `objective`: the key of the objective (for example \"O2\").",
  "Write exactly the number of questions of each kind asked for each objective, and never repeat or closely reword a question under ASKED BEFORE.",
].join("\n")

interface DraftedQuestion {
  id: string
  objectiveId: string
  kind: "choice" | "open"
  prompt: string
  options: string[]
  correctIndex: number
  keyPoints?: string[]
  modelAnswer?: string
  explanation: string
  whyWrong?: string[]
  citation: Citation
  source: "ai"
  /** True when code wrote it because the model was not available or failed the check. */
  byCode: boolean
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function lowerFirst(s: string) {
  return s.length > 1 && /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s
}

/** An open question written by code: explain the objective in your own words. */
function fallbackOpen(o: ObjectiveIn, cite: Citation): DraftedQuestion {
  const points = sentencesOf(o.quote).slice(0, 3)
  return {
    id: uid("qb"),
    objectiveId: o.id,
    kind: "open",
    prompt: `In your own words: how do you ${lowerFirst(o.text.replace(/[.\s]+$/, ""))}?`,
    options: [],
    correctIndex: -1,
    keyPoints: points.length > 0 ? points : [o.quote.slice(0, 200)],
    modelAnswer: o.quote.slice(0, 300),
    explanation: `${cite.namingCode} v${cite.version} states: "${o.quote.slice(0, 240)}"`,
    citation: cite,
    source: "ai",
    byCode: true,
  }
}

export const draftQuestions = action({
  args: {
    title: v.string(),
    purpose: v.string(),
    objectives: v.array(objectiveIn),
    /** Only these objectives (for "Regenerate" or "Add a question"). */
    onlyObjectiveIds: v.optional(v.array(v.string())),
    choicePerObjective: v.number(),
    openPerObjective: v.number(),
    /** Prompts already in the bank, never repeated. */
    avoid: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<{ items: DraftedQuestion[]; dropped: number; byCode: boolean }> => {
    await requireUser(ctx)
    const choiceN = Math.max(0, Math.min(3, Math.round(args.choicePerObjective)))
    const openN = Math.max(0, Math.min(2, Math.round(args.openPerObjective)))
    if (choiceN + openN === 0) throw new ConvexError("Ask for at least one question.")
    const wanted = args.onlyObjectiveIds
      ? args.objectives.filter((o) => args.onlyObjectiveIds!.includes(o.id))
      : args.objectives
    if (wanted.length === 0) throw new ConvexError("Add Learning objectives first: every question tests one.")
    const docs = await loadDocs(ctx, wanted)
    const located = wanted
      .map((o) => ({ o, at: locate(o, docs) }))
      .filter((x): x is { o: ObjectiveIn; at: NonNullable<ReturnType<typeof locate>> } => x.at !== null)
    if (located.length === 0)
      throw new ConvexError("The passages of these objectives are no longer in the Published documents. Pick new passages first.")

    const items: DraftedQuestion[] = []
    let dropped = 0
    const counts = new Map<string, { choice: number; open: number }>(located.map(({ o }) => [o.id, { choice: 0, open: 0 }]))

    if (canUseModel()) {
      try {
        const out = await claudeJson({
          meter: { ctx, feature: "training" },
          system: QUESTION_SYSTEM,
          messages: [
            {
              role: "user",
              content: [
                `TRAINING: ${args.title}`,
                `PURPOSE: ${args.purpose || "(not stated)"}`,
                `PER OBJECTIVE: ${choiceN} choice, ${openN} open`,
                `VARIATION SEED: ${Math.random().toString(36).slice(2, 10)}`,
                "",
                "OBJECTIVES:",
                ...located.map(({ o, at }, i) =>
                  [
                    `[O${i + 1}] OBJECTIVE: ${o.text}`,
                    `SOURCE: ${at.doc.namingCode} v${at.doc.version} ${at.doc.title}${at.passage.section ? `, "${at.passage.section}"` : ""}`,
                    `PASSAGE: ${at.passage.display}`,
                  ].join("\n"),
                ),
                "",
                "ASKED BEFORE:",
                args.avoid.length ? args.avoid.slice(0, 60).map((p) => `- ${p}`).join("\n") : "(nothing)",
              ].join("\n"),
            },
          ],
          schema: QuestionsOut,
          effort: "low",
          maxTokens: 12000,
        })
        for (const q of out.questions) {
          const k = Number(q.objective.trim().replace(/^O/i, ""))
          const hit = located[k - 1]
          if (!hit) continue
          const c = counts.get(hit.o.id)!
          const label = `${hit.at.doc.namingCode} ${hit.at.doc.title} ${hit.at.passage.section ?? ""}`
          const cite = citationFor(hit.at.doc, hit.at.passage, hit.o.quote)
          if (q.kind === "choice") {
            if (c.choice >= choiceN) continue
            const wrong = q.distractors.filter((d) => d.text.trim() && squash(d.text) !== squash(q.correct)).slice(0, 3)
            if (
              !q.prompt.trim() ||
              wrong.length < 2 ||
              !grounded(q.correct, hit.at.passage, label) ||
              (q.explanation.trim() && !grounded(q.explanation, hit.at.passage, label))
            ) {
              dropped += 1
              continue
            }
            // Code decides where the right answer sits, never the model.
            const options = shuffle([q.correct.trim(), ...wrong.map((d) => d.text.trim())])
            const correctIndex = options.indexOf(q.correct.trim())
            const whyWrong = options
              .filter((_, i) => i !== correctIndex)
              .map((opt) => wrong.find((d) => d.text.trim() === opt)?.whyWrong.trim() ?? "")
            items.push({
              id: uid("qb"),
              objectiveId: hit.o.id,
              kind: "choice",
              prompt: q.prompt.trim(),
              options,
              correctIndex,
              explanation: q.explanation.trim(),
              whyWrong,
              citation: cite,
              source: "ai",
              byCode: false,
            })
            c.choice += 1
          } else {
            if (c.open >= openN) continue
            const keyPoints = q.keyPoints.map((x) => x.trim()).filter((x) => grounded(x, hit.at.passage, label))
            if (!q.prompt.trim() || keyPoints.length === 0) {
              dropped += 1
              continue
            }
            items.push({
              id: uid("qb"),
              objectiveId: hit.o.id,
              kind: "open",
              prompt: q.prompt.trim(),
              options: [],
              correctIndex: -1,
              keyPoints,
              modelAnswer: q.modelAnswer.trim() || undefined,
              explanation: q.explanation.trim(),
              citation: cite,
              source: "ai",
              byCode: false,
            })
            c.open += 1
          }
        }
      } catch (err) {
        console.error("Training builder questions failed:", describeClaudeError(err))
      }
    }

    // Every objective gets at least one question: code writes an open
    // question from the passage where the model did not deliver.
    let byCode = false
    for (const { o, at } of located) {
      const c = counts.get(o.id)!
      if (c.choice + c.open > 0) continue
      items.push(fallbackOpen(o, citationFor(at.doc, at.passage, o.quote)))
      byCode = true
    }
    return { items, dropped, byCode }
  },
})

// ---- Still on point? ------------------------------------------------------------

const SignalsOut = z.object({
  summary: z.string(),
  items: z.array(
    z.object({
      kind: z.enum(["misconception", "unclear_question", "document_gap", "too_easy", "practice_differs"]),
      objective: z.string(),
      text: z.string(),
      count: z.number(),
      examples: z.array(z.string()),
      suggestion: z.string(),
    }),
  ),
})

const SIGNALS_SYSTEM = [
  "You review how people answered the questions of a Training in Oppr Knowledge, a factory's controlled knowledge base, and tell the Engineer who owns it whether the Training is still on point.",
  "You get the Learning objectives with their source passage, and every answer: chosen options, open answers with their grade, and flags people raised.",
  "Report only patterns that several answers show (count at least 2), as items of these kinds:",
  "- misconception: many people believe the same wrong thing.",
  "- unclear_question: a question is answered wrong or flagged because of how it is asked, not because people do not know.",
  "- document_gap: the source passage does not say what people need, or says it ambiguously; the document should change.",
  "- too_easy: an objective nobody gets wrong, so it proves little.",
  "- practice_differs: answers show that people do the job differently on the floor than the document says.",
  "Each item: `objective` the objective id (or \"\"), `text` one plain sentence, `count` how many answers show it, `examples` up to 3 short quotes of real answers, `suggestion` one concrete next step for the Engineer.",
  "`summary`: at most two sentences in plain words. If nothing needs attention, say so and return no items except too_easy ones.",
  "Never invent answers that are not in the data.",
].join("\n")

interface SignalInput {
  trainingId: Id<"trainings">
  code: string
  title: string
  version: number
  purpose: string
  objectives: { id: string; text: string; documentId: Id<"documents">; namingCode: string; quote: string }[]
  attempts: number
  answers: {
    objectiveId: string
    kind: "choice" | "open"
    prompt: string
    options: string[]
    correctIndex: number
    answerIndex: number | null
    answerText: string | null
    verdict: "good" | "partly" | "not_yet" | null
    missing: string[]
    misconception: string | null
    flag: string | null
  }[]
}

type SignalItem = {
  kind: "misconception" | "unclear_question" | "document_gap" | "too_easy" | "practice_differs"
  objectiveId?: string
  questionId?: string
  text: string
  count: number
  examples: string[]
  suggestion: string
}

/** The same analysis by counting, when the model is not available. */
function countSignals(input: SignalInput): { summary: string; items: SignalItem[] } {
  const items: SignalItem[] = []
  for (const o of input.objectives) {
    const answers = input.answers.filter((a) => a.objectiveId === o.id)
    if (answers.length === 0) continue
    const wrong = answers.filter((a) =>
      a.kind === "open" ? a.verdict === "not_yet" : a.answerIndex != null && a.answerIndex !== a.correctIndex,
    )
    const flags = answers.filter((a) => a.flag)
    // The wrong option most people chose.
    const chosen = new Map<string, number>()
    for (const a of wrong) {
      const txt = a.kind === "open" ? a.misconception ?? "" : a.options[a.answerIndex ?? -1] ?? ""
      if (txt) chosen.set(txt, (chosen.get(txt) ?? 0) + 1)
    }
    const top = [...chosen.entries()].sort((a, b) => b[1] - a[1])[0]
    if (top && top[1] >= 2) {
      items.push({
        kind: "misconception",
        objectiveId: o.id,
        text: `${top[1]} people answered "${top[0].slice(0, 120)}" on "${o.text}".`,
        count: top[1],
        examples: [top[0].slice(0, 160)],
        suggestion: `Check whether ${o.namingCode} is clear on this point, and add the reason to the breakdown.`,
      })
    }
    if (flags.length >= 2) {
      items.push({
        kind: "unclear_question",
        objectiveId: o.id,
        text: `${flags.length} people marked a question on "${o.text}" as unclear or wrong.`,
        count: flags.length,
        examples: flags.slice(0, 3).map((a) => (a.flag ?? "").slice(0, 160)),
        suggestion: "Read the flagged question again and rewrite or replace it in the question bank.",
      })
    }
    if (answers.length >= 5 && wrong.length === 0) {
      items.push({
        kind: "too_easy",
        objectiveId: o.id,
        text: `Nobody got "${o.text}" wrong in ${answers.length} answers.`,
        count: answers.length,
        examples: [],
        suggestion: "Ask about a situation where the mistake happens, or an open question.",
      })
    }
  }
  const attention = items.filter((i) => i.kind !== "too_easy").length
  return {
    summary:
      input.answers.length === 0
        ? "No answers yet to analyse."
        : attention === 0
          ? `Analysed ${input.answers.length} answers by counting. Nothing needs attention.`
          : `Analysed ${input.answers.length} answers by counting. ${attention} ${attention === 1 ? "point needs" : "points need"} attention.`,
    items,
  }
}

export const refreshSignals = action({
  args: { trainingId: v.id("trainings") },
  handler: async (ctx, args): Promise<{ items: number }> => {
    await requireUser(ctx)
    const input: SignalInput | null = await ctx.runQuery(internal.trainingBuilder.signalInput, {
      trainingId: args.trainingId,
    })
    if (!input) throw new ConvexError("This Training no longer exists.")
    const signalsId: Id<"trainingSignals"> = await ctx.runMutation(internal.trainingBuilder.startSignals, {
      trainingId: args.trainingId,
      version: input.version,
    })
    try {
      let result = countSignals(input)
      if (canUseModel() && input.answers.length >= 3) {
        try {
          const objKey = new Map(input.objectives.map((o, i) => [o.id, `O${i + 1}`]))
          const keyObj = new Map(input.objectives.map((o, i) => [`O${i + 1}`, o.id]))
          const out = await claudeJson({
            meter: { ctx, feature: "training" },
            system: SIGNALS_SYSTEM,
            messages: [
              {
                role: "user",
                content: [
                  `TRAINING: ${input.code} v${input.version} ${input.title}`,
                  `PURPOSE: ${input.purpose || "(not stated)"}`,
                  "",
                  "OBJECTIVES:",
                  ...input.objectives.map((o, i) => `[O${i + 1}] ${o.text}\n  SOURCE ${o.namingCode}: ${o.quote}`),
                  "",
                  `ANSWERS (${input.answers.length} from ${input.attempts} Attempts):`,
                  ...input.answers.slice(0, 400).map((a) => {
                    const head = `[${objKey.get(a.objectiveId) ?? "?"}] ${a.prompt}`
                    if (a.kind === "open")
                      return `${head}\n  OPEN ANSWER: ${a.answerText ?? ""}\n  GRADE: ${a.verdict ?? "not graded"}${a.missing.length ? `, missing: ${a.missing.join("; ")}` : ""}${a.misconception ? `, misconception: ${a.misconception}` : ""}${a.flag ? `\n  FLAG: ${a.flag}` : ""}`
                    const given = a.answerIndex != null ? a.options[a.answerIndex] : "(none)"
                    return `${head}\n  CHOSE: ${given} (${a.answerIndex === a.correctIndex ? "right" : `wrong; right is ${a.options[a.correctIndex]}`})${a.flag ? `\n  FLAG: ${a.flag}` : ""}`
                  }),
                ].join("\n"),
              },
            ],
            schema: SignalsOut,
            effort: "low",
            maxTokens: 6000,
          })
          result = {
            summary: out.summary.trim(),
            items: out.items
              .filter((i) => i.count >= 1 && i.text.trim())
              .slice(0, 12)
              .map((i) => ({
                kind: i.kind,
                ...(keyObj.get(i.objective.trim()) ? { objectiveId: keyObj.get(i.objective.trim())! } : {}),
                text: i.text.trim(),
                count: Math.max(1, Math.round(i.count)),
                examples: i.examples.map((x) => x.trim().slice(0, 240)).filter(Boolean).slice(0, 3),
                suggestion: i.suggestion.trim(),
              })),
          }
        } catch (err) {
          console.error("Training signals analysis failed, counted instead:", describeClaudeError(err))
        }
      }
      await ctx.runMutation(internal.trainingBuilder.finishSignals, {
        signalsId,
        attemptsAnalysed: input.attempts,
        summary: result.summary,
        items: result.items,
      })
      return { items: result.items.length }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await ctx.runMutation(internal.trainingBuilder.failSignals, { signalsId, error: message.slice(0, 300) })
      throw new ConvexError("The analysis could not be finished. Try again in a moment.")
    }
  },
})
