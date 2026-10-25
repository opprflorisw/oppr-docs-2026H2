import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { MutationCtx, QueryCtx } from "./_generated/server"
import { requireUser, requireUserId } from "./lib/auth"
import { requireEngineerOrAdmin } from "./lib/roles"

// Naming code format: {LOCATION}-{DISCIPLINE}-{TYPE}-{NNNN}
// e.g. HOL-OPS-SOP-0001. The sequence is per (location, discipline, type)
// triplet, allocated atomically from a namingCounters row.

// Legacy fallback maps. Document types are now an editable vocabulary
// (namingTypes table), but these keep the original four resolving even before
// the table is seeded and let parseNamingCode (sync, can't query) backfill the
// built-in tokens.
export const TYPE_TOKEN: Record<string, string> = {
  sop: "SOP",
  manual: "MAN",
  work_instruction: "WI",
  lmra: "LMRA",
}

export function typeToken(type: string): string {
  return TYPE_TOKEN[type] ?? "DOC"
}

const TOKEN_TO_TYPE: Record<string, string> = {
  SOP: "sop",
  MAN: "manual",
  WI: "work_instruction",
  LMRA: "lmra",
}

// Resolve a type slug to its naming-code token from the namingTypes table,
// falling back to the legacy map (and finally "DOC"). Call from a query or
// mutation context.
export async function resolveTypeToken(
  ctx: { db: MutationCtx["db"] | QueryCtx["db"] },
  slug: string,
): Promise<string> {
  const row = await ctx.db
    .query("namingTypes")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique()
  return row?.token ?? TYPE_TOKEN[slug] ?? "DOC"
}

// Inverse of formatCode. Used to backfill location/discipline on documents
// created before those fields existed — the code is the source of truth.
export function parseNamingCode(code: string): {
  location: string
  discipline: string
  type: string | null
  seq: number
} | null {
  const m = /^([A-Z0-9]+)-([A-Z0-9]+)-([A-Z0-9]+)-(\d+)$/.exec(code)
  if (!m) return null
  return {
    location: m[1],
    discipline: m[2],
    type: TOKEN_TO_TYPE[m[3]] ?? null,
    seq: parseInt(m[4], 10),
  }
}

export function counterKey(
  location: string,
  discipline: string,
  type: string,
): string {
  return `${location}|${discipline}|${type}`
}

function formatCodeWithToken(
  location: string,
  discipline: string,
  token: string,
  seq: number,
): string {
  return `${location}-${discipline}-${token}-${seq.toString().padStart(4, "0")}`
}

// Atomically allocate the next code for a triplet. Reads + patches the counter
// row in the same mutation, so two concurrent allocations on the same triplet
// conflict on that row and Convex's OCC retries one of them. Different triplets
// never contend. Call from inside a mutation.
export async function allocateNamingCode(
  ctx: MutationCtx,
  location: string,
  discipline: string,
  type: string,
): Promise<string> {
  const key = counterKey(location, discipline, type)
  const existing = await ctx.db
    .query("namingCounters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique()
  const next = (existing?.value ?? 0) + 1
  if (existing) {
    await ctx.db.patch(existing._id, { value: next })
  } else {
    await ctx.db.insert("namingCounters", { key, value: next })
  }
  const token = await resolveTypeToken(ctx, type)
  return formatCodeWithToken(location, discipline, token, next)
}

// Non-mutating preview of the next code for the metadata panel. May be stale by
// one if a concurrent create lands first; the real code is allocated on create.
export const peekNextCode = query({
  args: {
    location: v.string(),
    discipline: v.string(),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const key = counterKey(args.location, args.discipline, args.type)
    const existing = await ctx.db
      .query("namingCounters")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique()
    const next = (existing?.value ?? 0) + 1
    const token = await resolveTypeToken(ctx, args.type)
    return {
      code: formatCodeWithToken(args.location, args.discipline, token, next),
      seq: next,
    }
  },
})

// ---- Vocabulary --------------------------------------------------------------

export const listVocabulary = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const locations = await ctx.db.query("namingLocations").take(200)
    const disciplines = await ctx.db.query("namingDisciplines").take(200)
    locations.sort((a, b) => a.code.localeCompare(b.code))
    disciplines.sort((a, b) => a.code.localeCompare(b.code))
    return { locations, disciplines }
  },
})

const ENTITY = {
  location: "namingLocations" as const,
  discipline: "namingDisciplines" as const,
}

export const addVocabulary = mutation({
  args: {
    kind: v.union(v.literal("location"), v.literal("discipline")),
    code: v.string(),
    label: v.string(),
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    const code = args.code.trim().toUpperCase()
    const label = args.label.trim()
    if (!code) throw new Error("Code is required")
    if (!/^[A-Z0-9]+$/.test(code))
      throw new Error("Code must be letters/numbers only")
    const table = ENTITY[args.kind]
    const clash = await ctx.db
      .query(table)
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique()
    if (clash) throw new Error(`${code} already exists`)
    return await ctx.db.insert(table, { code, label: label || code })
  },
})

export const updateVocabulary = mutation({
  args: {
    kind: v.union(v.literal("location"), v.literal("discipline")),
    id: v.string(),
    label: v.string(),
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    const table = ENTITY[args.kind]
    const typed = ctx.db.normalizeId(table, args.id)
    if (!typed) throw new Error("Not found")
    await ctx.db.patch(typed, { label: args.label.trim() })
  },
})

export const removeVocabulary = mutation({
  args: {
    kind: v.union(v.literal("location"), v.literal("discipline")),
    id: v.string(),
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    const table = ENTITY[args.kind]
    const typed = ctx.db.normalizeId(table, args.id)
    if (!typed) throw new Error("Not found")
    await ctx.db.delete(typed)
  },
})

// Seed a default vocabulary if empty. Idempotent.
export const seedDefaultsIfEmpty = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx)
    const locCount = (await ctx.db.query("namingLocations").take(1)).length
    const discCount = (await ctx.db.query("namingDisciplines").take(1)).length
    if (locCount === 0) {
      for (const [code, label] of [
        ["HOL", "Holliday"],
        ["ANT", "Antwerp"],
      ]) {
        await ctx.db.insert("namingLocations", { code, label })
      }
    }
    if (discCount === 0) {
      for (const [code, label] of [
        ["OPS", "Operations"],
        ["MNT", "Maintenance"],
        ["QA", "Quality"],
        ["HSE", "Health, Safety & Environment"],
      ]) {
        await ctx.db.insert("namingDisciplines", { code, label })
      }
    }
    return { ok: true }
  },
})
