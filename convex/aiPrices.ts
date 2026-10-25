// Price table (CONTEXT.md): what each model costs, per 1M tokens in and out,
// per image or per 1k embedded items, from an effective date. A call is
// priced with the row valid at its time when it is recorded, so a new price
// never rewrites history. Every amount is an estimate in USD from list prices;
// it is not what Oppr charges anyone (that is the Plan, and the user decides it).
//
// Admins edit the table on /dev/ai (Prices). A model the app uses gets its
// default list price the first time a call of it is recorded (`ensureDefault`).
import { ConvexError, v } from "convex/values"
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { requireUser } from "./lib/auth"
import { isAdmin, isEngineerOrAdmin } from "./lib/roles"
import { CLAUDE_MODEL } from "./ai/llm"
import { CHAT_MODEL, EMBEDDING_MODEL, IMAGE_MODEL } from "./ai/constants"

type PriceKind = Doc<"aiPrices">["kind"]

export interface DefaultPrice {
  provider: string
  model: string
  kind: PriceKind
  inPerMTok?: number
  outPerMTok?: number
  perImage?: number
  perKItems?: number
  note: string
}

/** List prices on 2026-10-25 for the models in use. Check them against the providers' pricing pages. */
export const DEFAULT_PRICES: DefaultPrice[] = [
  {
    provider: "anthropic",
    model: CLAUDE_MODEL,
    kind: "tokens",
    inPerMTok: 4,
    outPerMTok: 20,
    note: "Anthropic list price, standard tier.",
  },
  {
    provider: "google",
    model: CHAT_MODEL,
    kind: "tokens",
    inPerMTok: 0.25,
    outPerMTok: 1.5,
    note: "Gemini API list price, standard tier (text, image and video input).",
  },
  {
    provider: "google",
    model: EMBEDDING_MODEL,
    kind: "tokens",
    inPerMTok: 0.15,
    outPerMTok: 0,
    note: "Assumed equal to gemini-embedding-001 ($0.15 per 1M input tokens). Tokens are estimated, Gemini does not report them for embeddings. Verify.",
  },
  {
    provider: "google",
    model: IMAGE_MODEL,
    kind: "image",
    perImage: 0.039,
    note: "Assumed equal to Gemini Flash Image ($0.039 per image). Verify.",
  },
]

/** The row valid at `time` for this model, or null. */
export async function priceAt(ctx: QueryCtx, model: string, time: number): Promise<Doc<"aiPrices"> | null> {
  return await ctx.db
    .query("aiPrices")
    .withIndex("by_model_and_effectiveFrom", (q) => q.eq("model", model).lte("effectiveFrom", time))
    .order("desc")
    .first()
}

/**
 * The price for a call of `model` at `time`. A model in DEFAULT_PRICES with
 * no row at all gets its default row (effective from the start), so the
 * table seeds itself and the first call is already priced.
 */
export async function priceForCall(ctx: MutationCtx, model: string, time: number): Promise<Doc<"aiPrices"> | null> {
  const found = await priceAt(ctx, model, time)
  if (found) return found
  const any = await ctx.db
    .query("aiPrices")
    .withIndex("by_model_and_effectiveFrom", (q) => q.eq("model", model))
    .first()
  if (any) return null
  const d = DEFAULT_PRICES.find((p) => p.model === model)
  if (!d) return null
  const id = await ctx.db.insert("aiPrices", { ...d, effectiveFrom: 0, updatedAt: Date.now() })
  return await ctx.db.get(id)
}

/** Estimated USD cost of one call, from a price row; undefined without a price. */
export function costOf(
  row: Pick<Doc<"aiUsage">, "tokensIn" | "tokensOut" | "units">,
  price: Doc<"aiPrices"> | null,
): number | undefined {
  if (!price) return undefined
  if (price.kind === "tokens")
    return (row.tokensIn * (price.inPerMTok ?? 0) + row.tokensOut * (price.outPerMTok ?? 0)) / 1_000_000
  if (price.kind === "image") return row.units * (price.perImage ?? 0)
  return (row.units * (price.perKItems ?? 0)) / 1000
}

async function viewer(ctx: QueryCtx, personId: Id<"people"> | undefined) {
  await requireUser(ctx)
  return personId ? await ctx.db.get(personId) : null
}

async function requireAdmin(ctx: QueryCtx, personId: Id<"people"> | undefined): Promise<Doc<"people">> {
  const person = await viewer(ctx, personId)
  if (!isAdmin(person)) throw new ConvexError("Check in as an Admin to change prices.")
  return person
}

/** The whole table, newest first per model, with which row is in force now. Engineers and Admins. */
export const list = query({
  args: { personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    const person = await viewer(ctx, args.personId)
    if (!isEngineerOrAdmin(person)) return null
    const rows = await ctx.db.query("aiPrices").take(500)
    const now = Date.now()
    const current = new Map<string, Doc<"aiPrices">>()
    for (const r of rows) {
      if (r.effectiveFrom > now) continue
      const c = current.get(r.model)
      if (!c || r.effectiveFrom > c.effectiveFrom) current.set(r.model, r)
    }
    const names = new Map<string, string>()
    for (const r of rows) {
      if (r.updatedBy && !names.has(r.updatedBy)) names.set(r.updatedBy, (await ctx.db.get(r.updatedBy))?.name ?? "")
    }
    const missing = DEFAULT_PRICES.filter((d) => !rows.some((r) => r.model === d.model)).map((d) => d.model)
    return {
      canEdit: isAdmin(person),
      missingDefaults: missing,
      rows: rows
        .sort((a, b) => a.model.localeCompare(b.model) || b.effectiveFrom - a.effectiveFrom)
        .map((r) => ({
          ...r,
          inForce: current.get(r.model)?._id === r._id,
          updatedByName: r.updatedBy ? (names.get(r.updatedBy) ?? null) : null,
        })),
    }
  },
})

const priceFields = {
  provider: v.string(),
  model: v.string(),
  kind: v.union(v.literal("tokens"), v.literal("image"), v.literal("embedding")),
  inPerMTok: v.optional(v.number()),
  outPerMTok: v.optional(v.number()),
  perImage: v.optional(v.number()),
  perKItems: v.optional(v.number()),
  effectiveFrom: v.number(),
  note: v.optional(v.string()),
}

function checkPrice(a: { model: string; kind: PriceKind; inPerMTok?: number; outPerMTok?: number; perImage?: number; perKItems?: number }) {
  if (!a.model.trim()) throw new ConvexError("Name the model.")
  const nums = [a.inPerMTok, a.outPerMTok, a.perImage, a.perKItems].filter((n) => n !== undefined)
  if (nums.some((n) => !Number.isFinite(n) || n! < 0 || n! > 10_000)) throw new ConvexError("Prices must be between 0 and 10,000.")
  if (a.kind === "tokens" && a.inPerMTok === undefined) throw new ConvexError("Give the price per 1M input tokens.")
  if (a.kind === "image" && a.perImage === undefined) throw new ConvexError("Give the price per image.")
  if (a.kind === "embedding" && a.perKItems === undefined) throw new ConvexError("Give the price per 1k items.")
}

/**
 * A new price from a date. Calls already recorded keep their cost; calls
 * from `effectiveFrom` on use the new one. The same model and date replaces
 * that row. Admin only.
 */
export const setPrice = mutation({
  args: { personId: v.optional(v.id("people")), ...priceFields },
  handler: async (ctx, { personId, ...a }) => {
    const admin = await requireAdmin(ctx, personId)
    const model = a.model.trim()
    checkPrice({ ...a, model })
    const row = {
      provider: a.provider.trim() || "other",
      model,
      kind: a.kind,
      ...(a.kind === "tokens" ? { inPerMTok: a.inPerMTok, outPerMTok: a.outPerMTok ?? 0 } : {}),
      ...(a.kind === "image" ? { perImage: a.perImage } : {}),
      ...(a.kind === "embedding" ? { perKItems: a.perKItems } : {}),
      effectiveFrom: Math.max(0, Math.round(a.effectiveFrom)),
      ...(a.note?.trim() ? { note: a.note.trim().slice(0, 300) } : {}),
      updatedAt: Date.now(),
      updatedBy: admin._id,
    }
    const same = await ctx.db
      .query("aiPrices")
      .withIndex("by_model_and_effectiveFrom", (q) => q.eq("model", model).eq("effectiveFrom", row.effectiveFrom))
      .first()
    if (same) {
      await ctx.db.replace(same._id, row)
      return same._id
    }
    return await ctx.db.insert("aiPrices", row)
  },
})

/** Removes one price row (a mistake). Calls already recorded keep their cost. Admin only. */
export const removePrice = mutation({
  args: { personId: v.optional(v.id("people")), priceId: v.id("aiPrices") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.personId)
    await ctx.db.delete(args.priceId)
    return null
  },
})

/** Adds the default list price for every model in use that has no row yet. Admin only. */
export const addDefaults = mutation({
  args: { personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.personId)
    let added = 0
    for (const d of DEFAULT_PRICES) {
      const any = await ctx.db
        .query("aiPrices")
        .withIndex("by_model_and_effectiveFrom", (q) => q.eq("model", d.model))
        .first()
      if (any) continue
      await ctx.db.insert("aiPrices", { ...d, effectiveFrom: 0, updatedAt: Date.now(), updatedBy: admin._id })
      added++
    }
    return added
  },
})

/**
 * Prices calls recorded before their model had a price (cost unknown), up to
 * 2,000 per press, from the last 30 days. Calls that already have a cost are
 * never changed. Admin only.
 */
export const priceUnpriced = mutation({
  args: { personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.personId)
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000
    let priced = 0
    let scanned = 0
    for await (const r of ctx.db
      .query("aiUsage")
      .withIndex("by_kind_and_time", (q) => q.eq("kind", "call").gte("time", since))) {
      if (++scanned > 8000 || priced >= 2000) break
      if (r.estCost !== undefined) continue
      const cost = costOf(r, await priceAt(ctx, r.model, r.time))
      if (cost === undefined) continue
      await ctx.db.patch(r._id, { estCost: cost })
      priced++
    }
    return priced
  },
})
