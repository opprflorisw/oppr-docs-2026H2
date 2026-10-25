// The plant's shifts (Settings, People and roles): names, times, active, and
// whether a shift counts for shift cover. people.shift and
// coverageQuestions.shift hold a shift's key. Changing them needs a
// checked-in Engineer or Admin.
import { ConvexError, v } from "convex/values"
import { mutation, query } from "../_generated/server"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import type { Doc } from "../_generated/dataModel"
import { requireUser, requireUserId } from "../lib/auth"
import { requireEngineerOrAdmin } from "../lib/roles"

type Ctx = QueryCtx | MutationCtx

export type ShiftRow = Pick<Doc<"shifts">, "key" | "name" | "start" | "end" | "active" | "cover" | "sortOrder">

/** The seed's shifts, and what the app uses until the table has rows. */
export const DEFAULT_SHIFTS: ShiftRow[] = [
  { key: "early", name: "Early shift", start: "06:00", end: "14:00", active: true, cover: true, sortOrder: 0 },
  { key: "late", name: "Late shift", start: "14:00", end: "22:00", active: true, cover: true, sortOrder: 1 },
  { key: "night", name: "Night shift", start: "22:00", end: "06:00", active: true, cover: true, sortOrder: 2 },
  { key: "day", name: "Day shift", start: "08:00", end: "17:00", active: true, cover: false, sortOrder: 3 },
]

/** Every shift, active or not, in the order of the day. */
export async function loadShifts(ctx: Ctx): Promise<ShiftRow[]> {
  const rows = await ctx.db.query("shifts").withIndex("by_sortOrder").take(50)
  return rows.length > 0 ? rows : DEFAULT_SHIFTS
}

/**
 * A person's shift key: the stored shift, else read from the role text
 * ("Line operator, late shift"). Role words only match the standard shifts.
 */
export function shiftKeyOf(person: Pick<Doc<"people">, "shift" | "role">): string | null {
  if (person.shift) return person.shift
  if (/\bnight\b/i.test(person.role)) return "night"
  if (/\blate\b/i.test(person.role)) return "late"
  if (/\bearly\b/i.test(person.role)) return "early"
  if (/\bday\b/i.test(person.role)) return "day"
  return null
}

/** The shift key when that shift exists; no shift (null or empty) means none. */
export async function checkShiftKey(ctx: Ctx, shift: string | null | undefined): Promise<string | undefined> {
  if (!shift) return undefined
  if (!(await loadShifts(ctx)).some((s) => s.key === shift)) throw new ConvexError("That shift no longer exists.")
  return shift
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

function cleanTime(t: string, label: string) {
  const s = t.trim()
  const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(s)
  const out = m ? `${m[1].padStart(2, "0")}:${m[2] ?? "00"}` : s
  if (!TIME.test(out)) throw new ConvexError(`Write the ${label} time as hours and minutes, for example 06:00.`)
  return out
}

function cleanName(name: string) {
  const out = name.trim().replace(/\s+/g, " ")
  if (!out) throw new ConvexError("Give the shift a name, for example Weekend shift.")
  if (out.length > 40) throw new ConvexError("Keep the shift name under 40 characters.")
  return out
}

function keyFrom(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/\bshift\b/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "shift"
  )
}

/** Puts the defaults in the table the first time someone edits shifts. */
async function ensureRows(ctx: MutationCtx): Promise<Doc<"shifts">[]> {
  const rows = await ctx.db.query("shifts").withIndex("by_sortOrder").take(50)
  if (rows.length > 0) return rows
  for (const s of DEFAULT_SHIFTS) await ctx.db.insert("shifts", { ...s })
  return await ctx.db.query("shifts").withIndex("by_sortOrder").take(50)
}

const ADMIN_MESSAGE = "Check in as an Engineer or Admin to change shifts."

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const shifts = await loadShifts(ctx)
    const people = await ctx.db.query("people").take(500)
    return shifts.map((s) => ({
      ...s,
      people: people.filter((p) => !p.archived && shiftKeyOf(p) === s.key).length,
    }))
  },
})

export const create = mutation({
  args: {
    name: v.string(),
    start: v.string(),
    end: v.string(),
    cover: v.optional(v.boolean()),
    personId: v.id("people"),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId, ADMIN_MESSAGE)
    const rows = await ensureRows(ctx)
    if (rows.length >= 12) throw new ConvexError("There are already 12 shifts. Turn one off or remove it first.")
    const name = cleanName(args.name)
    if (rows.some((r) => r.name.toLowerCase() === name.toLowerCase()))
      throw new ConvexError(`There is already a shift called ${name}.`)
    const base = keyFrom(name)
    let key = base
    for (let i = 2; rows.some((r) => r.key === key); i++) key = `${base}-${i}`
    return await ctx.db.insert("shifts", {
      key,
      name,
      start: cleanTime(args.start, "start"),
      end: cleanTime(args.end, "end"),
      active: true,
      cover: args.cover ?? true,
      sortOrder: rows.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1,
    })
  },
})

export const update = mutation({
  args: {
    key: v.string(),
    name: v.optional(v.string()),
    start: v.optional(v.string()),
    end: v.optional(v.string()),
    active: v.optional(v.boolean()),
    cover: v.optional(v.boolean()),
    personId: v.id("people"),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId, ADMIN_MESSAGE)
    const rows = await ensureRows(ctx)
    const row = rows.find((r) => r.key === args.key)
    if (!row) throw new ConvexError("This shift no longer exists.")
    const patch: Partial<Doc<"shifts">> = {}
    if (args.name !== undefined) {
      const name = cleanName(args.name)
      if (rows.some((r) => r._id !== row._id && r.name.toLowerCase() === name.toLowerCase()))
        throw new ConvexError(`There is already a shift called ${name}.`)
      patch.name = name
    }
    if (args.start !== undefined) patch.start = cleanTime(args.start, "start")
    if (args.end !== undefined) patch.end = cleanTime(args.end, "end")
    if (args.cover !== undefined) patch.cover = args.cover
    if (args.active !== undefined) {
      if (!args.active && rows.filter((r) => r.active && r._id !== row._id).length === 0)
        throw new ConvexError("Keep at least one shift active.")
      patch.active = args.active
    }
    await ctx.db.patch(row._id, patch)
  },
})

/** Saves a new order: keys from first to last. */
export const reorder = mutation({
  args: { keys: v.array(v.string()), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId, ADMIN_MESSAGE)
    const rows = await ensureRows(ctx)
    const listed = new Set(args.keys)
    const ordered = [
      ...args.keys.flatMap((k) => rows.find((r) => r.key === k) ?? []),
      ...rows.filter((r) => !listed.has(r.key)),
    ]
    for (const [i, r] of ordered.entries()) if (r.sortOrder !== i) await ctx.db.patch(r._id, { sortOrder: i })
  },
})

/** Removes a shift nobody works and no coverage question asks about; otherwise turn it off. */
export const remove = mutation({
  args: { key: v.string(), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId, ADMIN_MESSAGE)
    const rows = await ensureRows(ctx)
    const row = rows.find((r) => r.key === args.key)
    if (!row) return
    const people = (await ctx.db.query("people").take(500)).filter((p) => p.shift === row.key)
    if (people.length > 0)
      throw new ConvexError(
        `${people.length === 1 ? people[0].name : `${people.length} people`} still work this shift. Move them or turn the shift off.`,
      )
    const questions = (await ctx.db.query("coverageQuestions").take(100)).filter((q) => q.shift === row.key)
    if (questions.length > 0) throw new ConvexError("A coverage question asks about this shift. Change it or turn the shift off.")
    if (rows.filter((r) => r.active && r._id !== row._id).length === 0)
      throw new ConvexError("Keep at least one shift active.")
    await ctx.db.delete(row._id)
  },
})
