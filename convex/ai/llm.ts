import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import type { z } from "zod"

// Claude for structured generation (Wiki content, Guided creation).
// Used whenever ANTHROPIC_API_KEY is set on the deployment; otherwise the
// callers fall back to Gemini. Set on dev with:
//   npx convex env set ANTHROPIC_API_KEY <key>
//   npx convex env set ANTHROPIC_WORKSPACE_ID <wrkspc_...>   (only for a key
//     that is not scoped to a workspace)

export const CLAUDE_MODEL = "claude-opus-5-5"

export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

function client(): Anthropic {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultHeaders: workspace ? { "anthropic-workspace-id": workspace } : undefined,
  })
}

/**
 * One Claude call that must return JSON matching `schema`. Throws a readable
 * Error on refusal, truncation or an unparseable answer.
 */
export async function claudeJson<S extends z.ZodType>(opts: {
  system: string
  messages: Anthropic.MessageParam[]
  schema: S
  effort: "low" | "medium" | "high"
  maxTokens?: number
}): Promise<z.infer<S>> {
  const response = await client().messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    messages: opts.messages,
    output_config: { effort: opts.effort, format: zodOutputFormat(opts.schema) },
  })
  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined this request.")
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Claude's answer was cut off before it was complete.")
  }
  if (response.parsed_output == null) {
    throw new Error("Claude's answer did not match the expected format.")
  }
  return response.parsed_output as z.infer<S>
}

/** Turns SDK errors into one short sentence for the UI. */
export function describeClaudeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The Claude API key was rejected."
  if (err instanceof Anthropic.PermissionDeniedError) return "The Claude API key may not use this model or workspace."
  if (err instanceof Anthropic.RateLimitError) return "Claude is busy right now. Try again in a moment."
  if (err instanceof Anthropic.BadRequestError) return `Claude rejected the request: ${err.message}`.slice(0, 300)
  if (err instanceof Anthropic.APIError) return `Claude error ${err.status ?? ""}: ${err.message}`.slice(0, 300)
  return err instanceof Error ? err.message : String(err)
}
