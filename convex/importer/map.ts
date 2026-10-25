// AI structural mapping pass for the importer.
//
// Reads the extracted markdown from an import_jobs row, calls Gemini with
// the appropriate template instruction, parses the JSON, and writes the
// result back via internal mutations. Same Gemini REST shape as ai/embed.ts.

import { v } from "convex/values"
import { action } from "../_generated/server"
import { internal } from "../_generated/api"
import { requireUser } from "../lib/auth"
import { geminiText } from "../ai/gemini"
import type { MeterSpec } from "../lib/aiMeter"
import { TEMPLATES, buildSystemPrompt, targetIsLogSpec } from "./templates"

interface ImportJobLite {
  _id: string
  extractedMarkdown: string | null
  targetTemplate: "sop" | "workInstructionLog" | "manual" | "lmra" | "auto"
  defaultMode: "verbatim" | "improve"
  sourceFilename: string
}

export const runMapping = action({
  args: { jobId: v.id("importJobs") },
  handler: async (ctx, args): Promise<{ ok: true } | { ok: false; error: string }> => {
    await requireUser(ctx)
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      await ctx.runMutation(internal.importer.jobs.recordMappingFailure, {
        jobId: args.jobId,
        error: "GEMINI_API_KEY is not set on this deployment",
      })
      return { ok: false, error: "GEMINI_API_KEY is not set" }
    }

    const job: ImportJobLite | null = await ctx.runQuery(
      internal.importer.jobs.getInternal,
      { id: args.jobId },
    )
    if (!job) {
      return { ok: false, error: "Job not found" }
    }
    if (!job.extractedMarkdown) {
      await ctx.runMutation(internal.importer.jobs.recordMappingFailure, {
        jobId: args.jobId,
        error: "Cannot map: this job has no extracted text.",
      })
      return { ok: false, error: "No extracted markdown" }
    }

    const targetTemplate =
      job.targetTemplate === "auto"
        ? autoDetectTarget(job.extractedMarkdown)
        : job.targetTemplate
    const template = TEMPLATES[targetTemplate]

    const systemPrompt = buildSystemPrompt(template, job.defaultMode)
    const userPrompt = [
      `SOURCE FILENAME: ${job.sourceFilename}`,
      ``,
      `EXTRACTED MARKDOWN:`,
      job.extractedMarkdown.slice(0, 60_000),
    ].join("\n")

    let parsed: unknown
    try {
      parsed = await callGemini({ ctx, feature: "import", target: { kind: "importJob", id: args.jobId } }, systemPrompt, userPrompt)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await ctx.runMutation(internal.importer.jobs.recordMappingFailure, {
        jobId: args.jobId,
        error: `Gemini call failed: ${message}`,
      })
      return { ok: false, error: message }
    }

    if (!parsed || typeof parsed !== "object") {
      await ctx.runMutation(internal.importer.jobs.recordMappingFailure, {
        jobId: args.jobId,
        error: "Gemini returned non-object response.",
      })
      return { ok: false, error: "Bad response shape" }
    }

    if (targetIsLogSpec(targetTemplate)) {
      const obj = parsed as Record<string, unknown>
      const title = typeof obj.title === "string" ? obj.title : null
      await ctx.runMutation(internal.importer.jobs.recordMapping, {
        jobId: args.jobId,
        mappedBody: null,
        mappedLogSpec: parsed,
        mappingNotes: typeof obj.notes === "string" ? obj.notes : null,
        suggestedNamingCode: null,
        suggestedTitle: title,
      })
    } else {
      const obj = parsed as Record<string, unknown>
      const title = typeof obj.title === "string" ? obj.title : null
      const namingCode =
        typeof obj.namingCodeSuggestion === "string"
          ? obj.namingCodeSuggestion
          : null
      await ctx.runMutation(internal.importer.jobs.recordMapping, {
        jobId: args.jobId,
        mappedBody: parsed,
        mappedLogSpec: null,
        mappingNotes:
          typeof obj.summary === "string" ? (obj.summary as string) : null,
        suggestedNamingCode: namingCode,
        suggestedTitle: title,
      })
    }

    return { ok: true }
  },
})

async function callGemini(m: MeterSpec, systemPrompt: string, userPrompt: string): Promise<unknown> {
  const text = await geminiText(m, [{ text: userPrompt }], { system: systemPrompt, json: true })
  // Tolerate markdown fences just in case.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const head = cleaned.slice(0, 200)
    throw new Error(`Failed to parse JSON response. Starts with: ${head}`)
  }
}

// Cheap heuristic for auto-detect. Counts numbered-list lines vs prose
// paragraphs. If the source is dominated by short numbered actions, lean
// toward workInstructionLog; otherwise SOP.
function autoDetectTarget(
  markdown: string,
): "sop" | "workInstructionLog" {
  const numberedLines = (markdown.match(/^\s*\d+\.\s+/gm) ?? []).length
  const paragraphs = markdown
    .split(/\n{2,}/)
    .filter((p) => p.trim().length > 100).length
  // Heuristic: > 4 numbered actions and few long paragraphs → log.
  if (numberedLines >= 4 && paragraphs <= numberedLines * 1.5) {
    return "workInstructionLog"
  }
  return "sop"
}
