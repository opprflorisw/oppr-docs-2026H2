// The one AI meter (spec 6.7, CONTEXT.md: AI usage). Every model call in the
// app goes through `meter`, which writes one `aiUsage` row of kind "call":
// feature, provider, model, tokens or items, latency, ok, person and target.
// Never the prompt or the answer.
//
// Raw model calls (the Anthropic SDK, the Gemini SDK, fetch to
// generativelanguage.googleapis.com) live only in the gateways
// convex/ai/llm.ts and convex/ai/gemini.ts, which take a `MeterSpec` and call
// `meter` here. `node scripts/check-ai-meter.mjs` enforces that.
import type { ActionCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"
import { ConvexError } from "convex/values"
import { internal } from "../_generated/api"
import { featureBlocked } from "./aiUsageView"

/** Known features. `feature` is stored as a string, so new ones need no schema change. */
export const AI_FEATURES = [
  "wiki.build",
  "wiki.block",
  "wiki.check",
  "wiki.find",
  "wiki.restyle",
  "wiki.rewrite",
  "wiki.guide",
  "ask",
  "writer",
  "training",
  "capture",
  "consistency",
  "revision",
  "insights",
  "plant",
  "image.generate",
  "image.describe",
  "embed.passage",
  "embed.query",
  "embed.image",
  "mcp",
  "import",
  "other",
] as const
export type AiFeature = (typeof AI_FEATURES)[number]

export type AiProvider = "anthropic" | "google" | "stub"

/** What the call reports about its own size. Missing numbers count as 0. */
export interface UsageInfo {
  tokensIn?: number
  tokensOut?: number
  /** Images generated or items embedded. */
  units?: number
}

export interface MeterTarget {
  kind: "wiki" | "document" | "training" | "capture" | "asset" | "plant" | "mcpKey" | (string & {})
  id: string
}

export interface MeterOptions {
  feature: AiFeature
  provider: AiProvider
  model: string
  /** Null for system jobs (publish rebuilds, nightly runs, migration). */
  personId?: Id<"people"> | null
  target?: MeterTarget
}

/** What a metered call returns: its value plus the usage numbers from the provider response. */
export interface Metered<T> {
  value: T
  usage?: UsageInfo
}

export type MeterCtx = Pick<ActionCtx, "runMutation">

/** Who and what a gateway call (claudeJson, geminiText, geminiEmbed...) is for; the gateway adds provider and model. */
export interface MeterSpec {
  ctx: MeterCtx
  feature: AiFeature
  personId?: Id<"people"> | null
  target?: MeterTarget
}

function clean(n: number | undefined): number {
  return Math.max(0, Math.round(n ?? 0))
}

function errorText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 300)
}

// The Plan's stop answer, per isolate, for a minute (spec 6.7: Plans and limits).
const GATE_FOR = 60_000
let gate: { at: number; stop: string | null; blockedFeatures: string[] } | null = null

/**
 * Throws a ConvexError when a Plan with "stop at the limit" has used up this
 * month's allowance. Off by default (no Plan), and a failed check never
 * blocks a call.
 */
async function checkPlan(ctx: MeterCtx, opts: MeterOptions) {
  if (opts.provider === "stub") return
  if (!gate || Date.now() - gate.at > GATE_FOR) {
    try {
      gate = { at: Date.now(), ...(await ctx.runMutation(internal.aiUsage.planGate, {})) }
    } catch (e) {
      console.error("aiMeter: could not check the Plan", e)
      return
    }
  }
  const stop = gate.stop ?? featureBlocked(opts.feature, gate.blockedFeatures)
  if (stop) throw new ConvexError(stop)
}

async function writeRow(
  ctx: MeterCtx,
  opts: MeterOptions,
  row: { time: number; usage?: UsageInfo; latencyMs: number; ok: boolean; error?: string },
) {
  try {
    await ctx.runMutation(internal.aiUsage.record, {
      time: row.time,
      feature: opts.feature,
      provider: opts.provider,
      model: opts.model,
      tokensIn: clean(row.usage?.tokensIn),
      tokensOut: clean(row.usage?.tokensOut),
      units: clean(row.usage?.units),
      latencyMs: Math.max(0, Math.round(row.latencyMs)),
      ok: row.ok,
      ...(row.error !== undefined ? { error: row.error } : {}),
      personId: opts.personId ?? null,
      ...(opts.target ? { targetKind: opts.target.kind, targetId: opts.target.id } : {}),
    })
  } catch (e) {
    console.error("aiMeter: could not record usage", e)
  }
}

/**
 * Runs `call`, measures its latency and records one `aiUsage` row. A failed
 * call is recorded with `ok: false` and its error is rethrown unchanged. A
 * failure to record never fails the call. When a Plan says stop and its
 * monthly allowance is used up, throws before calling.
 *
 *   const text = await meter(ctx, { feature: "wiki.block", provider: "anthropic",
 *     model: CLAUDE_MODEL, personId, target: { kind: "wiki", id: wikiId } },
 *     async () => {
 *       const r = await client.messages.create(...)
 *       return { value: r, usage: { tokensIn: r.usage.input_tokens, tokensOut: r.usage.output_tokens } }
 *     })
 */
export async function meter<T>(ctx: MeterCtx, opts: MeterOptions, call: () => Promise<Metered<T>>): Promise<T> {
  await checkPlan(ctx, opts)
  const started = Date.now()
  let result: Metered<T> | undefined
  let error: string | undefined
  try {
    result = await call()
    return result.value
  } catch (e) {
    error = errorText(e)
    throw e
  } finally {
    await writeRow(ctx, opts, {
      time: started,
      usage: result?.usage,
      latencyMs: Date.now() - started,
      ok: error === undefined,
      error,
    })
  }
}

/**
 * For bulk jobs (re-embedding the library, image backfills): many calls of
 * one kind summed into one `aiUsage` row per `flush`, so a backfill of 2,000
 * passages does not write 2,000 rows. Failed calls go into a second row with
 * `ok: false`. `units` counts the calls that succeeded.
 */
export function usageTally(ctx: MeterCtx, opts: MeterOptions) {
  const started = Date.now()
  const ok = { tokensIn: 0, tokensOut: 0, units: 0, latencyMs: 0 }
  const failed = { count: 0, latencyMs: 0, error: "" }
  return {
    async run<T>(call: () => Promise<Metered<T>>): Promise<T> {
      await checkPlan(ctx, opts)
      const t = Date.now()
      try {
        const r = await call()
        ok.tokensIn += clean(r.usage?.tokensIn)
        ok.tokensOut += clean(r.usage?.tokensOut)
        ok.units += r.usage?.units === undefined ? 1 : clean(r.usage.units)
        ok.latencyMs += Date.now() - t
        return r.value
      } catch (e) {
        failed.count += 1
        failed.latencyMs += Date.now() - t
        failed.error = errorText(e)
        throw e
      }
    },
    async flush(): Promise<void> {
      if (ok.units > 0)
        await writeRow(ctx, opts, {
          time: started,
          usage: { tokensIn: ok.tokensIn, tokensOut: ok.tokensOut, units: ok.units },
          latencyMs: ok.latencyMs,
          ok: true,
        })
      if (failed.count > 0)
        await writeRow(ctx, opts, {
          time: started,
          usage: { units: failed.count },
          latencyMs: failed.latencyMs,
          ok: false,
          error: `${failed.count} failed; last: ${failed.error}`.slice(0, 300),
        })
      ok.tokensIn = ok.tokensOut = ok.units = ok.latencyMs = 0
      failed.count = failed.latencyMs = 0
    },
  }
}

/** Rough token count for text a provider does not report usage for (embeddings). An estimate, like every cost here. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
