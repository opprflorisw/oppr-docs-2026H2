// AI usage and cost tracker (spec 6.7, CONTEXT.md: AI usage, Price table,
// Plan). `record` is what convex/lib/aiMeter.ts writes for every model call;
// the queries feed the AI usage tab on /dev/ai; the limits and the Plan are
// edited there by an Admin.
//
// Reads stay small: the page asks for the closed days (a range that ends at
// the start of today, so new calls never invalidate it) and for today
// separately, both through the by_kind_and_time index, and never more than
// MAX_ROWS rows per read.
import { ConvexError, v } from "convex/values"
import { action, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { requireUser } from "./lib/auth"
import { isAdmin, isEngineerOrAdmin } from "./lib/roles"
import { BUDGET_DEFAULTS, budgetLimits } from "./lib/aiBudget"
import { costOf, priceForCall } from "./aiPrices"
import {
  aggregateRows,
  CSV_HEADER,
  csvLine,
  dayStart,
  featureMatches as matches,
  targetDimension,
  utcDayOf,
  type CallRow,
  type UsageAgg,
} from "./lib/aiUsageView"

const DAY = 24 * 60 * 60 * 1000
const MAX_ROWS = 6000
const MONTH_SCAN = 10000

type Row = CallRow & { targetKind: string | null }

// ---- Writing -----------------------------------------------------------------

/** One model call. Written only through convex/lib/aiMeter.ts. */
export const record = internalMutation({
  args: {
    time: v.number(),
    feature: v.string(),
    provider: v.string(),
    model: v.string(),
    tokensIn: v.number(),
    tokensOut: v.number(),
    units: v.number(),
    latencyMs: v.number(),
    ok: v.boolean(),
    error: v.optional(v.string()),
    personId: v.union(v.id("people"), v.null()),
    targetKind: v.optional(v.string()),
    targetId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const estCost = costOf(args, await priceForCall(ctx, args.model, args.time))
    return await ctx.db.insert("aiUsage", {
      kind: "call",
      day: utcDayOf(args.time),
      ...args,
      ...(estCost !== undefined ? { estCost } : {}),
    })
  },
})

// ---- Who may look -------------------------------------------------------------

async function viewer(ctx: QueryCtx, personId: Id<"people"> | undefined): Promise<Doc<"people"> | null> {
  await requireUser(ctx)
  return personId ? await ctx.db.get(personId) : null
}

async function requireAdmin(ctx: QueryCtx, personId: Id<"people"> | undefined): Promise<Doc<"people">> {
  const person = await viewer(ctx, personId)
  if (!isAdmin(person)) throw new ConvexError("Check in as an Admin to change AI limits and the Plan.")
  return person
}

// ---- Reading -----------------------------------------------------------------

function toCallRow(r: Doc<"aiUsage">): Row {
  return {
    id: r._id,
    time: r.time,
    feature: r.feature,
    provider: r.provider,
    model: r.model,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    units: r.units,
    latencyMs: r.latencyMs,
    ok: r.ok !== false,
    error: r.error ?? null,
    cost: r.estCost ?? null,
    personKey: r.personId,
    targetKind: r.targetKind ?? null,
    targetKey: r.targetId ?? null,
    calls: r.calls ?? 1,
  }
}

async function callRows(ctx: QueryCtx, from: number, to: number, max: number) {
  const rows = await ctx.db
    .query("aiUsage")
    .withIndex("by_kind_and_time", (q) => q.eq("kind", "call").gte("time", from).lt("time", to))
    .take(max + 1)
  return { rows: rows.slice(0, max), truncated: rows.length > max }
}

/** Names for the person, Wiki, Document and other target keys in these rows. */
async function labelsFor(ctx: QueryCtx, rows: Row[]): Promise<Record<string, string>> {
  const labels: Record<string, string> = { system: "System jobs" }
  const people = new Set<string>()
  const targets = new Map<string, string>()
  for (const r of rows) {
    if (r.personKey) people.add(r.personKey)
    if (r.targetKey && r.targetKind) targets.set(r.targetKey, r.targetKind)
  }
  for (const id of people) {
    const pid = ctx.db.normalizeId("people", id)
    labels[id] = (pid ? (await ctx.db.get(pid))?.name : null) ?? "Unknown person"
  }
  for (const [id, kind] of targets) {
    const dim = targetDimension(kind)
    if (dim === "wiki") {
      const wid = ctx.db.normalizeId("wikis", id)
      labels[id] = (wid ? (await ctx.db.get(wid))?.title : null) ?? "Deleted Wiki"
    } else if (dim === "document") {
      const did = ctx.db.normalizeId("documents", id)
      const d = did ? await ctx.db.get(did) : null
      labels[id] = d ? `${d.namingCode} ${d.title}` : "Deleted Document"
    } else {
      labels[id] = `${kind} ${id.length > 12 ? `${id.slice(0, 6)}...` : id}`
    }
  }
  return labels
}

/**
 * Per-day totals and breakdowns of AI calls from `fromDay` through `toDay`
 * (UTC days, inclusive). Engineers and Admins; null for everyone else.
 */
export const usage = query({
  args: { personId: v.optional(v.id("people")), fromDay: v.string(), toDay: v.string() },
  handler: async (ctx, args): Promise<UsageAgg | null> => {
    if (!isEngineerOrAdmin(await viewer(ctx, args.personId))) return null
    const from = dayStart(args.fromDay)
    const to = dayStart(args.toDay) + DAY
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 62 * DAY)
      throw new ConvexError("Choose at most 62 days.")
    const { rows, truncated } = await callRows(ctx, from, to, MAX_ROWS)
    const calls = rows.map(toCallRow)
    return { days: aggregateRows(calls), labels: await labelsFor(ctx, calls), truncated, rows: calls.length }
  },
})

export const exportPage = internalQuery({
  args: { from: v.number(), to: v.number(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<{ lines: string[]; isDone: boolean; cursor: string }> => {
    const page = await ctx.db
      .query("aiUsage")
      .withIndex("by_kind_and_time", (q) => q.eq("kind", "call").gte("time", args.from).lt("time", args.to))
      .paginate({ cursor: args.cursor, numItems: 2000 })
    const rows = page.page.map(toCallRow)
    const labels = await labelsFor(ctx, rows)
    return { lines: rows.map((r) => csvLine(r, labels)), isDone: page.isDone, cursor: page.continueCursor }
  },
})

export const checkViewer = internalQuery({
  args: { personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    if (!isEngineerOrAdmin(await viewer(ctx, args.personId)))
      throw new ConvexError("Check in as an Engineer or Admin to export AI usage.")
    return null
  },
})

/** Every call from `fromDay` through `toDay` as CSV, at most 50,000 rows. */
export const exportCsv = action({
  args: { personId: v.optional(v.id("people")), fromDay: v.string(), toDay: v.string() },
  handler: async (ctx, args): Promise<{ csv: string; rows: number; truncated: boolean }> => {
    await ctx.runQuery(internal.aiUsage.checkViewer, { personId: args.personId })
    const from = dayStart(args.fromDay)
    const to = dayStart(args.toDay) + DAY
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw new ConvexError("Choose a valid range.")
    const lines: string[] = [CSV_HEADER.join(",")]
    let cursor: string | null = null
    for (;;) {
      const page: { lines: string[]; isDone: boolean; cursor: string } = await ctx.runQuery(internal.aiUsage.exportPage, {
        from,
        to,
        cursor,
      })
      lines.push(...page.lines)
      const rows = lines.length - 1
      if (page.isDone) return { csv: lines.join("\n"), rows, truncated: false }
      if (rows >= 50000) return { csv: lines.join("\n"), rows, truncated: true }
      cursor = page.cursor
    }
  },
})

// ---- Limits and the Plan --------------------------------------------------------

type PlanDoc = NonNullable<Doc<"aiSettings">["plan"]>

function monthStart(now: number): number {
  const d = new Date(now)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
}

/**
 * This calendar month (UTC) against the Plan. An AI action is one model call
 * that worked; one credit is one USD of estimated model cost.
 */
async function planUsage(ctx: QueryCtx, plan: PlanDoc, now: number) {
  const from = monthStart(now)
  const { rows, truncated } = await callRows(ctx, from, now + 1, MONTH_SCAN)
  let actions = 0
  let credits = 0
  const perFeature = new Map<string, number>()
  for (const r of rows) {
    if (r.ok === false) continue
    const n = r.calls ?? 1
    actions += n
    credits += r.estCost ?? 0
    for (const f of plan.featureLimits ?? [])
      if (matches(r.feature, f.feature)) perFeature.set(f.feature, (perFeature.get(f.feature) ?? 0) + n)
  }
  let overall: string | null = null
  if (plan.monthlyActions !== undefined && actions >= plan.monthlyActions)
    overall = `${actions.toLocaleString("en")} of ${plan.monthlyActions.toLocaleString("en")} AI actions used`
  else if (plan.monthlyCredits !== undefined && credits >= plan.monthlyCredits)
    overall = `${credits.toFixed(2)} of ${plan.monthlyCredits} credits used`
  return {
    monthStart: from,
    actions,
    credits,
    features: (plan.featureLimits ?? []).map((f) => ({ feature: f.feature, monthly: f.monthly, used: perFeature.get(f.feature) ?? 0 })),
    overall,
    truncated,
  }
}

/** Limits in force, the kill switch, today's Wiki AI actions and the Plan with this month's use. */
export const limits = query({
  args: { personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    const person = await viewer(ctx, args.personId)
    if (!isEngineerOrAdmin(person)) return null
    const settings = await ctx.db.query("aiSettings").first()
    const lim = await budgetLimits(ctx)
    // Wiki AI actions in the last 24 hours (the deployment limit is rolling).
    const since = Date.now() - DAY
    let actionsToday = 0
    for await (const r of ctx.db
      .query("aiUsage")
      .withIndex("by_kind_and_time", (q) => q.eq("kind", "action").gte("time", since))) {
      if (r.ok !== false) actionsToday++
      if (actionsToday > lim.deploymentDaily) break
    }
    const plan = settings?.plan ?? null
    return {
      canEdit: isAdmin(person),
      killSwitch: { env: process.env.OPPR_WIKI_AI_OFF === "1", setting: settings?.wikiAiOff === true },
      caps: {
        deploymentDaily: lim.deploymentDaily,
        wikiDaily: lim.wikiDaily,
        systemDaily: lim.systemDaily,
        systemPerWikiDaily: lim.systemPerWikiDaily,
        personHourly: lim.personHourly,
      },
      defaults: BUDGET_DEFAULTS,
      actionsToday,
      plan,
      planUsage: plan?.enabled ? await planUsage(ctx, plan, Date.now()) : null,
      updatedAt: settings?.updatedAt ?? null,
    }
  },
})

function wholeNumber(n: number | undefined, max: number, what: string): number | undefined {
  if (n === undefined) return undefined
  if (!Number.isInteger(n) || n < 0 || n > max)
    throw new ConvexError(`${what} must be a whole number from 0 to ${max.toLocaleString("en")}.`)
  return n
}

/** Changes the Wiki AI limits and the kill switch. A value left out keeps the current one. Admin only. */
export const setLimits = mutation({
  args: {
    personId: v.optional(v.id("people")),
    wikiAiOff: v.optional(v.boolean()),
    deploymentDailyCap: v.optional(v.number()),
    wikiDailyCap: v.optional(v.number()),
    systemDailyCap: v.optional(v.number()),
    systemPerWikiDaily: v.optional(v.number()),
    personHourly: v.optional(
      v.object({ wikiBlock: v.optional(v.number()), wikiCheck: v.optional(v.number()), wikiFind: v.optional(v.number()) }),
    ),
  },
  handler: async (ctx, { personId, ...a }) => {
    const admin = await requireAdmin(ctx, personId)
    const row = await ctx.db.query("aiSettings").first()
    const patch = {
      ...(a.wikiAiOff !== undefined ? { wikiAiOff: a.wikiAiOff } : {}),
      ...(a.deploymentDailyCap !== undefined
        ? { deploymentDailyCap: wholeNumber(a.deploymentDailyCap, 1_000_000, "The deployment limit") }
        : {}),
      ...(a.wikiDailyCap !== undefined ? { wikiDailyCap: wholeNumber(a.wikiDailyCap, 100_000, "The limit per Wiki") } : {}),
      ...(a.systemDailyCap !== undefined ? { systemDailyCap: wholeNumber(a.systemDailyCap, 100_000, "The system limit") } : {}),
      ...(a.systemPerWikiDaily !== undefined
        ? { systemPerWikiDaily: wholeNumber(a.systemPerWikiDaily, 1000, "Automatic rebuilds per Wiki") }
        : {}),
      ...(a.personHourly
        ? {
            personHourly: {
              ...row?.personHourly,
              ...(a.personHourly.wikiBlock !== undefined
                ? { wikiBlock: wholeNumber(a.personHourly.wikiBlock, 10_000, "Generations per hour") }
                : {}),
              ...(a.personHourly.wikiCheck !== undefined
                ? { wikiCheck: wholeNumber(a.personHourly.wikiCheck, 10_000, "Checks per hour") }
                : {}),
              ...(a.personHourly.wikiFind !== undefined
                ? { wikiFind: wholeNumber(a.personHourly.wikiFind, 10_000, "Searches per hour") }
                : {}),
            },
          }
        : {}),
      updatedAt: Date.now(),
      updatedBy: admin._id,
    }
    if (row) await ctx.db.patch(row._id, patch)
    else await ctx.db.insert("aiSettings", patch)
    return null
  },
})

const planValidator = v.object({
  enabled: v.boolean(),
  name: v.optional(v.string()),
  monthlyActions: v.optional(v.number()),
  monthlyCredits: v.optional(v.number()),
  featureLimits: v.optional(v.array(v.object({ feature: v.string(), monthly: v.number() }))),
  overage: v.optional(v.boolean()),
  atLimit: v.optional(v.union(v.literal("warn"), v.literal("stop"))),
})

/** Sets the Plan for this deployment's organisation, or turns it off. Admin only. */
export const setPlan = mutation({
  args: { personId: v.optional(v.id("people")), plan: planValidator },
  handler: async (ctx, { personId, plan }) => {
    const admin = await requireAdmin(ctx, personId)
    const features = (plan.featureLimits ?? [])
      .map((f) => ({ feature: f.feature.trim().toLowerCase(), monthly: wholeNumber(f.monthly, 10_000_000, "A feature limit")! }))
      .filter((f) => f.feature)
    if (new Set(features.map((f) => f.feature)).size !== features.length) throw new ConvexError("Each feature can have one limit.")
    if (plan.monthlyCredits !== undefined && (!Number.isFinite(plan.monthlyCredits) || plan.monthlyCredits < 0))
      throw new ConvexError("Credits must be 0 or more.")
    const clean: PlanDoc = {
      enabled: plan.enabled,
      ...(plan.name?.trim() ? { name: plan.name.trim().slice(0, 80) } : {}),
      ...(plan.monthlyActions !== undefined
        ? { monthlyActions: wholeNumber(plan.monthlyActions, 100_000_000, "AI actions per month") }
        : {}),
      ...(plan.monthlyCredits !== undefined ? { monthlyCredits: plan.monthlyCredits } : {}),
      ...(features.length ? { featureLimits: features } : {}),
      overage: plan.overage ?? false,
      atLimit: plan.atLimit ?? "warn",
    }
    const row = await ctx.db.query("aiSettings").first()
    const patch = { plan: clean, updatedAt: Date.now(), updatedBy: admin._id }
    if (row) await ctx.db.patch(row._id, patch)
    else await ctx.db.insert("aiSettings", patch)
    return null
  },
})

/**
 * Asked by the meter before a model call (it caches the answer for a
 * minute): a message when the Plan says stop and this month is at a limit.
 * With overage on, a limit only warns. A mutation because the meter only
 * has runMutation; it writes nothing.
 */
export const planGate = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ stop: string | null; blockedFeatures: string[] }> => {
    const plan = (await ctx.db.query("aiSettings").first())?.plan
    if (!plan?.enabled || plan.atLimit !== "stop" || plan.overage) return { stop: null, blockedFeatures: [] }
    const u = await planUsage(ctx, plan, Date.now())
    return {
      stop: u.overall ? `The Plan's AI allowance for this month is used up (${u.overall}).` : null,
      blockedFeatures: u.features.filter((f) => f.used >= f.monthly).map((f) => f.feature),
    }
  },
})

// ---- Daily rollups (spec 6.7) ------------------------------------------------------

/** Calls older than this are rolled up into one row per day and kind of call. */
const ROLLUP_AFTER_DAYS = 30
/** Budget markers (kind "action") only serve hourly and daily caps; older ones go. */
const KEEP_ACTIONS_DAYS = 30
const ROLLUP_BATCH = 2000

const rollupKey = (r: Doc<"aiUsage">) =>
  [
    r.feature,
    r.provider,
    r.model,
    r.personId ?? "",
    r.targetKind ?? "",
    r.targetId ?? "",
    r.ok === false ? "failed" : "ok",
    r.estCost === undefined ? "unpriced" : "priced",
  ].join("|")

/**
 * Daily job: removes budget markers older than 30 days and starts rolling up
 * the oldest day of AI calls that is past 30 days and not rolled up yet.
 * rollupDay calls this again when it finishes a day, until the cutoff.
 * Totals, breakdowns, the Plan and the CSV export count a rolled row by `calls`.
 */
export const rollupOld = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ day: string | null }> => {
    const now = Date.now()
    const oldActions = await ctx.db
      .query("aiUsage")
      .withIndex("by_kind_and_time", (q) => q.eq("kind", "action").lt("time", now - KEEP_ACTIONS_DAYS * DAY))
      .take(ROLLUP_BATCH)
    for (const r of oldActions) await ctx.db.delete(r._id)

    const cutoff = dayStart(utcDayOf(now - ROLLUP_AFTER_DAYS * DAY))
    const through = (await ctx.db.query("aiSettings").first())?.usageRolledThrough
    const from = through ? dayStart(through) + DAY : 0
    const first = await ctx.db
      .query("aiUsage")
      .withIndex("by_kind_and_time", (q) => q.eq("kind", "call").gte("time", from).lt("time", cutoff))
      .first()
    if (!first) return { day: null }
    const day = utcDayOf(first.time)
    await ctx.scheduler.runAfter(0, internal.aiUsage.rollupDay, { day })
    return { day }
  },
})

/** Rolls up one UTC day in batches, marks it done, then asks rollupOld for the next day. */
export const rollupDay = internalMutation({
  args: { day: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const from = dayStart(args.day)
    const rows = await ctx.db
      .query("aiUsage")
      .withIndex("by_kind_and_time", (q) => q.eq("kind", "call").gte("time", from).lt("time", from + DAY))
      .take(ROLLUP_BATCH)
    const rolled = new Map(rows.filter((r) => r.calls !== undefined).map((r) => [rollupKey(r), r]))
    const raw = rows.filter((r) => r.calls === undefined)
    const groups = new Map<string, Doc<"aiUsage">[]>()
    for (const r of raw) {
      const key = rollupKey(r)
      groups.set(key, [...(groups.get(key) ?? []), r])
    }
    for (const [key, group] of groups) {
      const sum = (f: (r: Doc<"aiUsage">) => number) => group.reduce((n, r) => n + f(r), 0)
      const priced = group.some((r) => r.estCost !== undefined)
      const add = {
        calls: group.length,
        tokensIn: sum((r) => r.tokensIn),
        tokensOut: sum((r) => r.tokensOut),
        units: sum((r) => r.units),
        latencyMs: sum((r) => r.latencyMs),
      }
      const cost = priced ? sum((r) => r.estCost ?? 0) : undefined
      const prev = rolled.get(key)
      if (prev) {
        await ctx.db.patch(prev._id, {
          calls: (prev.calls ?? 1) + add.calls,
          tokensIn: prev.tokensIn + add.tokensIn,
          tokensOut: prev.tokensOut + add.tokensOut,
          units: prev.units + add.units,
          latencyMs: prev.latencyMs + add.latencyMs,
          ...(cost !== undefined ? { estCost: (prev.estCost ?? 0) + cost } : {}),
        })
      } else {
        const r = group[0]
        const error = group.find((x) => x.error)?.error
        await ctx.db.insert("aiUsage", {
          kind: "call",
          time: from,
          day: args.day,
          feature: r.feature,
          provider: r.provider,
          model: r.model,
          ...add,
          ok: r.ok !== false,
          ...(r.ok === false && error ? { error } : {}),
          personId: r.personId,
          ...(r.targetKind ? { targetKind: r.targetKind } : {}),
          ...(r.targetId ? { targetId: r.targetId } : {}),
          ...(cost !== undefined ? { estCost: cost } : {}),
        })
      }
      for (const x of group) await ctx.db.delete(x._id)
    }
    if (rows.length === ROLLUP_BATCH && raw.length > 0) {
      await ctx.scheduler.runAfter(0, internal.aiUsage.rollupDay, args)
      return null
    }
    const settings = await ctx.db.query("aiSettings").first()
    if (settings) await ctx.db.patch(settings._id, { usageRolledThrough: args.day })
    else await ctx.db.insert("aiSettings", { usageRolledThrough: args.day, updatedAt: Date.now() })
    await ctx.scheduler.runAfter(0, internal.aiUsage.rollupOld, {})
    return null
  },
})
