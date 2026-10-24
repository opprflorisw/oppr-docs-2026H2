// Document insights report (CONTEXT.md: Document insights). Claude groups
// what people Ask about a Document, and what they mark unclear or wrong, into
// a few themes. Code keeps only example questions that people really asked
// (exact match) and only calls a theme a "gap" when the document really failed
// to answer one of its questions. Informs the next revision, never the
// current one.
import { ConvexError, v } from "convex/values"
import { z } from "zod"
import { action, internalAction, ActionCtx } from "../_generated/server"
import { internal } from "../_generated/api"
import { Id } from "../_generated/dataModel"
import { requireUserId } from "../lib/auth"
import { claudeConfigured, claudeJson, describeClaudeError } from "./llm"

const Out = z.object({
  themes: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      severity: z.enum(["info", "unclear", "gap"]),
      examples: z.array(z.string()),
    }),
  ),
})

const SYSTEM = [
  "You analyse how people on a factory floor use one controlled document in Oppr Knowledge.",
  "You get the QUESTIONS people asked about it in the last 90 days (each marked ANSWERED or NOT ANSWERED by the document) and the MARKS where someone found it unclear or wrong.",
  "Group them into 2 to 5 themes that an Engineer can act on when revising the document.",
  "",
  "Each theme:",
  "- title: 3 to 7 words, plain, for example \"Purge time after a colour change\".",
  "- detail: one or two sentences: what people want to know, how often, and where the document falls short. Name the section when SECTIONS makes it clear. Do not state values or instructions from the document and do not answer the questions.",
  "- severity: \"gap\" when the document does not answer it (NOT ANSWERED questions); \"unclear\" when the answer is there but people keep asking or mark it unclear; \"info\" for normal interest that needs no change.",
  "- examples: 1 to 3 questions or marks copied EXACTLY, character for character, from the lists. Never reword them; code drops any example that is not an exact copy.",
  "",
  "Order themes by how much they matter for the next revision: gaps first, then unclear, then info. Plain language, no em dashes.",
].join("\n")

type Loaded = {
  namingCode: string
  title: string
  version: number
  sections: string[]
  asks: { question: string; answerFound: boolean }[]
  flags: string[]
} | null

async function begin(ctx: ActionCtx, documentId: Id<"documents">) {
  const res: { reportId: Id<"insightReports">; started: boolean } | null = await ctx.runMutation(
    internal.insights.startReport,
    { documentId },
  )
  if (!res) throw new ConvexError("This document no longer exists.")
  if (res.started) {
    await ctx.scheduler.runAfter(0, internal.ai.insights.generate, { documentId, reportId: res.reportId })
  }
  return res.reportId
}

/** Refresh a Document's insight themes. Any signed-in person may ask for it. */
export const refreshReport = action({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args): Promise<Id<"insightReports">> => {
    await requireUserId(ctx)
    return await begin(ctx, args.documentId)
  },
})

/** Same, for the seed and schedulers. */
export const refreshReportInternal = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args): Promise<Id<"insightReports">> => {
    return await begin(ctx, args.documentId)
  },
})

export const generate = internalAction({
  args: { documentId: v.id("documents"), reportId: v.id("insightReports") },
  handler: async (ctx, args): Promise<void> => {
    const input: Loaded = await ctx.runQuery(internal.insights.loadForReport, { documentId: args.documentId })
    const save = async (
      state: "ready" | "failed",
      themes: z.infer<typeof Out>["themes"],
      error: string | null,
    ) => {
      await ctx.runMutation(internal.insights.saveReport, {
        reportId: args.reportId,
        state,
        questionCount: input?.asks.length ?? 0,
        unansweredCount: input?.asks.filter((a) => !a.answerFound).length ?? 0,
        flagCount: input?.flags.length ?? 0,
        themes,
        error,
      })
    }
    if (!input) return save("failed", [], "This document no longer exists.")
    if (input.asks.length === 0 && input.flags.length === 0) {
      // Nothing to group: a ready report without themes says so honestly.
      return save("ready", [], null)
    }
    if (!claudeConfigured()) return save("failed", [], "No AI key is set on this deployment.")

    // Deduplicate exact repeats, newest first, and keep the prompt bounded.
    const seen = new Map<string, { question: string; answered: boolean; count: number }>()
    for (const a of input.asks) {
      const k = a.question
      const s = seen.get(k)
      if (s) {
        s.count++
        if (a.answerFound) s.answered = true
      } else seen.set(k, { question: a.question, answered: a.answerFound, count: 1 })
    }
    const questions = Array.from(seen.values()).slice(0, 150)
    const flags = Array.from(new Set(input.flags)).slice(0, 40)

    const prompt = [
      `DOCUMENT: ${input.namingCode} v${input.version} · ${input.title}`,
      input.sections.length ? `SECTIONS: ${input.sections.join(" | ")}` : "",
      "",
      "QUESTIONS:",
      ...questions.map(
        (q) => `- [${q.answered ? "ANSWERED" : "NOT ANSWERED"}${q.count > 1 ? `, asked ${q.count} times` : ""}] ${q.question}`,
      ),
      flags.length ? "\nMARKS (unclear or wrong):" : "",
      ...flags.map((f) => `- ${f}`),
    ]
      .filter((l) => l !== "")
      .join("\n")

    let out: z.infer<typeof Out>
    try {
      out = await claudeJson({
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
        schema: Out,
        effort: "low",
        maxTokens: 4000,
      })
    } catch (err) {
      return save("failed", [], describeClaudeError(err))
    }

    // ---- Checks in code ----------------------------------------------------
    const exact = new Map<string, { unanswered: boolean }>()
    for (const q of questions) exact.set(q.question.trim(), { unanswered: !q.answered })
    for (const f of flags) exact.set(f.trim(), { unanswered: false })
    const clean = (s: string) => s.replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim()
    let droppedExamples = 0
    const themes = out.themes
      .slice(0, 5)
      .map((t) => {
        const examples = Array.from(new Set(t.examples.map((e) => e.trim()))).filter((e) => {
          const ok = exact.has(e)
          if (!ok) droppedExamples++
          return ok
        })
        let severity = t.severity
        // A gap must rest on a question the document did not answer.
        if (severity === "gap" && !examples.some((e) => exact.get(e)?.unanswered)) severity = "unclear"
        return { title: clean(t.title), detail: clean(t.detail), severity, examples: examples.slice(0, 3) }
      })
      // A theme with no real example cannot be traced to a signal.
      .filter((t) => t.title && t.examples.length > 0)
    if (droppedExamples > 0) {
      console.warn(`[insights ${input.namingCode}] dropped ${droppedExamples} example(s) that were not exact questions`)
    }
    const rank = { gap: 0, unclear: 1, info: 2 } as const
    themes.sort((a, b) => rank[a.severity] - rank[b.severity])
    if (themes.length === 0) {
      return save("failed", [], "The AI's themes could not be traced to real questions, so none are shown.")
    }
    await save("ready", themes, null)
  },
})
