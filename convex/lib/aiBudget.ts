// Cost guard for Wiki AI actions (spec 6.6, D4). Counts `aiUsage` rows of
// kind "action": one per Generate, Check, Find sources, Restyle or build.
// A failed action (`ok: false`) does not count; a running one (no `ok` yet)
// does, so parallel presses cannot slip past a cap.
//
// Actions call it as:
//   const actionId = await ctx.runMutation(internal.lib.aiBudget.start, { action, personId, wikiId })
//   try { ...meter(...) calls...; await ctx.runMutation(internal.lib.aiBudget.finish, { actionId, ok: true }) }
//   catch (e) { await ctx.runMutation(internal.lib.aiBudget.finish, { actionId, ok: false, error }); throw e }
import { ConvexError, v } from "convex/values"
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import type { AiAllowance, WikiAiAction } from "./wikiTypes"

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
// A running action older than this is treated as finished (its job died).
const RUNNING_FOR = 10 * 60 * 1000

export const BUDGET_DEFAULTS = {
  personHourly: { wikiBlock: 30, wikiCheck: 20, wikiFind: 40 },
  wikiDaily: 60,
  systemDaily: 200,
  systemPerWikiDaily: 6,
  deploymentDaily: 1000,
  runningBlocksPerWiki: 3,
} as const

export const ACTION_FEATURE: Record<WikiAiAction, string> = {
  wikiBuild: "wiki.build",
  wikiBlock: "wiki.block",
  wikiCheck: "wiki.check",
  wikiFind: "wiki.find",
  wikiRestyle: "wiki.restyle",
}

export const wikiAiActionValidator = v.union(
  v.literal("wikiBuild"),
  v.literal("wikiBlock"),
  v.literal("wikiCheck"),
  v.literal("wikiFind"),
  v.literal("wikiRestyle"),
)

type PersonCapped = keyof typeof BUDGET_DEFAULTS.personHourly

async function settingsRow(ctx: QueryCtx): Promise<Doc<"aiSettings"> | null> {
  return await ctx.db.query("aiSettings").first()
}

/** The caps in force: aiSettings over the defaults. */
export async function budgetLimits(ctx: QueryCtx) {
  const s = await settingsRow(ctx)
  return {
    off: process.env.OPPR_WIKI_AI_OFF === "1" || s?.wikiAiOff === true,
    personHourly: {
      wikiBlock: s?.personHourly?.wikiBlock ?? BUDGET_DEFAULTS.personHourly.wikiBlock,
      wikiCheck: s?.personHourly?.wikiCheck ?? BUDGET_DEFAULTS.personHourly.wikiCheck,
      wikiFind: s?.personHourly?.wikiFind ?? BUDGET_DEFAULTS.personHourly.wikiFind,
    },
    wikiDaily: s?.wikiDailyCap ?? BUDGET_DEFAULTS.wikiDaily,
    systemDaily: s?.systemDailyCap ?? BUDGET_DEFAULTS.systemDaily,
    systemPerWikiDaily: s?.systemPerWikiDaily ?? BUDGET_DEFAULTS.systemPerWikiDaily,
    deploymentDaily: s?.deploymentDailyCap ?? BUDGET_DEFAULTS.deploymentDaily,
  }
}

const counts = (r: Doc<"aiUsage">) => r.ok !== false

/** Counted action rows in a window, oldest first, stopping after `cap` + 1. */
async function counted(
  rows: AsyncIterable<Doc<"aiUsage">>,
  cap: number,
  keep: (r: Doc<"aiUsage">) => boolean = () => true,
): Promise<Doc<"aiUsage">[]> {
  const out: Doc<"aiUsage">[] = []
  for await (const r of rows) {
    if (!counts(r) || !keep(r)) continue
    out.push(r)
    if (out.length > cap) break
  }
  return out
}

function personRows(ctx: QueryCtx, personId: Id<"people"> | null, since: number) {
  return ctx.db
    .query("aiUsage")
    .withIndex("by_personId_and_kind_and_time", (q) =>
      q.eq("personId", personId).eq("kind", "action").gte("time", since),
    )
}

function wikiRows(ctx: QueryCtx, wikiId: Id<"wikis">, since: number) {
  return ctx.db
    .query("aiUsage")
    .withIndex("by_targetId_and_kind_and_time", (q) =>
      q.eq("targetId", wikiId as string).eq("kind", "action").gte("time", since),
    )
}

function allRows(ctx: QueryCtx, since: number) {
  return ctx.db
    .query("aiUsage")
    .withIndex("by_kind_and_time", (q) => q.eq("kind", "action").gte("time", since))
}

function minutesUntilFree(rows: Doc<"aiUsage">[], window: number, now: number) {
  const oldest = rows[0]?.time ?? now
  return Math.max(1, Math.ceil((oldest + window - now) / 60000))
}

function later(minutes: number) {
  return minutes >= 90 ? `${Math.ceil(minutes / 60)} h` : `${minutes} min`
}

/**
 * Throws a ConvexError with a plain message when this action may not start
 * now. `personId` null means the system bucket (migration, publish rebuilds,
 * nightly cron).
 */
export async function assertBudget(
  ctx: QueryCtx,
  args: { personId: Id<"people"> | null; wikiId: Id<"wikis"> | null; action: WikiAiAction },
) {
  const now = Date.now()
  const lim = await budgetLimits(ctx)
  if (lim.off) throw new ConvexError("AI is switched off for Wikis.")

  if (args.personId && args.action in lim.personHourly) {
    const cap = lim.personHourly[args.action as PersonCapped]
    const rows = await counted(personRows(ctx, args.personId, now - HOUR), cap, (r) => r.action === args.action)
    if (rows.length >= cap) throw new ConvexError(`Busy: try again in ${later(minutesUntilFree(rows, HOUR, now))}.`)
  }
  if (!args.personId) {
    const rows = await counted(personRows(ctx, null, now - DAY), lim.systemDaily)
    if (rows.length >= lim.systemDaily)
      throw new ConvexError(`Daily limit for automatic rebuilds reached. Try again in ${later(minutesUntilFree(rows, DAY, now))}.`)
    if (args.wikiId && args.action === "wikiBuild") {
      const own = await counted(
        personRows(ctx, null, now - DAY),
        lim.systemPerWikiDaily,
        (r) => r.targetId === args.wikiId && r.action === "wikiBuild",
      )
      if (own.length >= lim.systemPerWikiDaily)
        throw new ConvexError("This Wiki was rebuilt automatically too often today.")
    }
  }
  if (args.wikiId) {
    const rows = await counted(wikiRows(ctx, args.wikiId, now - DAY), lim.wikiDaily)
    if (rows.length >= lim.wikiDaily)
      throw new ConvexError(`Daily limit for this Wiki reached. Try again in ${later(minutesUntilFree(rows, DAY, now))}.`)
    if (args.action === "wikiBlock") {
      const running = rows.filter((r) => r.action === "wikiBlock" && r.ok === undefined && now - r.time < RUNNING_FOR)
      if (running.length >= BUDGET_DEFAULTS.runningBlocksPerWiki)
        throw new ConvexError("Three blocks are already being generated for this Wiki. Try again when one is done.")
    }
  }
  const all = await counted(allRows(ctx, now - DAY), lim.deploymentDaily)
  if (all.length >= lim.deploymentDaily)
    throw new ConvexError(`Daily AI limit for this deployment reached. Try again in ${later(minutesUntilFree(all, DAY, now))}.`)
}

/** Checks the caps and records the action as running. Returns the row to finish. */
export async function recordAiAction(
  ctx: MutationCtx,
  args: { personId: Id<"people"> | null; wikiId: Id<"wikis"> | null; action: WikiAiAction },
): Promise<Id<"aiUsage">> {
  await assertBudget(ctx, args)
  const time = Date.now()
  return await ctx.db.insert("aiUsage", {
    kind: "action",
    time,
    day: new Date(time).toISOString().slice(0, 10),
    feature: ACTION_FEATURE[args.action],
    provider: "none",
    model: "",
    tokensIn: 0,
    tokensOut: 0,
    units: 0,
    latencyMs: 0,
    personId: args.personId,
    action: args.action,
    ...(args.wikiId ? { targetKind: "wiki", targetId: args.wikiId as string } : {}),
  })
}

/** What is left, for the edit bar (spec 3.1, 6.6). */
export async function allowance(
  ctx: QueryCtx,
  args: { personId: Id<"people"> | null; wikiId: Id<"wikis"> | null },
): Promise<AiAllowance> {
  const now = Date.now()
  const lim = await budgetLimits(ctx)
  let person: AiAllowance["person"] = null
  if (args.personId) {
    const rows = await counted(personRows(ctx, args.personId, now - HOUR), 1000)
    const used = (a: PersonCapped) => rows.filter((r) => r.action === a).length
    person = {
      wikiBlock: Math.max(0, lim.personHourly.wikiBlock - used("wikiBlock")),
      wikiCheck: Math.max(0, lim.personHourly.wikiCheck - used("wikiCheck")),
      wikiFind: Math.max(0, lim.personHourly.wikiFind - used("wikiFind")),
    }
  }
  const wikiUsed = args.wikiId ? (await counted(wikiRows(ctx, args.wikiId, now - DAY), lim.wikiDaily)).length : 0
  const allUsed = (await counted(allRows(ctx, now - DAY), lim.deploymentDaily)).length
  return {
    off: lim.off,
    person,
    wiki: Math.max(0, lim.wikiDaily - wikiUsed),
    deployment: Math.max(0, lim.deploymentDaily - allUsed),
  }
}

// ---- For actions (they have no ctx.db) -------------------------------------------

/** Check the caps and record a running action. Throws a ConvexError when refused. */
export const start = internalMutation({
  args: {
    action: wikiAiActionValidator,
    personId: v.union(v.id("people"), v.null()),
    wikiId: v.union(v.id("wikis"), v.null()),
  },
  handler: async (ctx, args): Promise<Id<"aiUsage">> => await recordAiAction(ctx, args),
})

/** Mark a running action done. `ok: false` takes it out of every count (spec 3.5 step 4). */
export const finish = internalMutation({
  args: { actionId: v.id("aiUsage"), ok: v.boolean(), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.actionId)
    if (!row || row.kind !== "action") return
    await ctx.db.patch(args.actionId, {
      ok: args.ok,
      latencyMs: Date.now() - row.time,
      ...(args.error ? { error: args.error.slice(0, 300) } : {}),
    })
  },
})

export const allowanceFor = internalQuery({
  args: { personId: v.union(v.id("people"), v.null()), wikiId: v.union(v.id("wikis"), v.null()) },
  handler: async (ctx, args): Promise<AiAllowance> => await allowance(ctx, args),
})
