import { ConvexError, v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { requireUser, requireUserId } from "./lib/auth"
import { isAdmin, requireEngineerOrAdmin } from "./lib/roles"
import { checkShiftKey } from "./people/shifts"

// The showcase people (CONTEXT.md: Operator, Engineer, plus Admin). Checking
// in is a client-side choice of one of these; there is no login per person.
// Archived people keep their records but drop out of every picker.

const kindValidator = v.union(v.literal("operator"), v.literal("engineer"), v.literal("admin"))

/** Everyone who can check in, in the set order. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const people = await ctx.db.query("people").take(500)
    return people.filter((p) => !p.archived).sort((a, b) => a.sortOrder - b.sortOrder)
  },
})

/** Everyone, archived people last (Settings, People and roles). */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const people = await ctx.db.query("people").take(500)
    return people.sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || a.sortOrder - b.sortOrder)
  },
})

const MESSAGE = "Check in as an Engineer or Admin to change people."

const DEFAULT_ROLE: Record<Doc<"people">["kind"], string> = {
  operator: "Operator",
  engineer: "Engineer",
  admin: "Admin",
}

function clean(s: string | null | undefined, max: number, label: string): string | undefined {
  const out = (s ?? "").trim().replace(/\s+/g, " ")
  if (out.length > max) throw new ConvexError(`Keep the ${label} under ${max} characters.`)
  return out || undefined
}

function cleanEmail(s: string | null | undefined): string | undefined {
  const out = clean(s, 120, "email address")
  if (out && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out)) throw new ConvexError("That email address does not look right.")
  return out?.toLowerCase()
}

/** Only an Admin makes someone an Admin, or changes an Admin. */
function checkAdminChange(me: Doc<"people">, target: Doc<"people"> | null, nextKind: Doc<"people">["kind"] | undefined) {
  const touchesAdmin = nextKind === "admin" || target?.kind === "admin"
  if (touchesAdmin && !isAdmin(me)) throw new ConvexError("Only an Admin can make someone an Admin or change an Admin.")
}

const fields = {
  name: v.optional(v.string()),
  kind: v.optional(kindValidator),
  role: v.optional(v.string()),
  area: v.optional(v.union(v.string(), v.null())),
  shift: v.optional(v.union(v.string(), v.null())),
  team: v.optional(v.union(v.string(), v.null())),
  email: v.optional(v.union(v.string(), v.null())),
}

export const create = mutation({
  args: { ...fields, name: v.string(), kind: kindValidator, personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const me = await requireEngineerOrAdmin(ctx, args.personId, MESSAGE)
    checkAdminChange(me, null, args.kind)
    const name = clean(args.name, 60, "name")
    if (!name) throw new ConvexError("Write the person's name.")
    const all = await ctx.db.query("people").take(500)
    if (all.length >= 400) throw new ConvexError("This showcase holds up to 400 people.")
    if (all.some((p) => !p.archived && p.name.toLowerCase() === name.toLowerCase()))
      throw new ConvexError(`${name} is already on the list.`)
    return await ctx.db.insert("people", {
      name,
      kind: args.kind,
      role: clean(args.role, 80, "role") ?? DEFAULT_ROLE[args.kind],
      area: clean(args.area, 20, "area") ?? null,
      shift: await checkShiftKey(ctx, args.shift),
      team: clean(args.team, 60, "team name"),
      email: cleanEmail(args.email),
      sortOrder: all.reduce((m, p) => Math.max(m, p.sortOrder), -1) + 1,
    })
  },
})

export const update = mutation({
  args: { ...fields, id: v.id("people"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const me = await requireEngineerOrAdmin(ctx, args.personId, MESSAGE)
    const target = await ctx.db.get(args.id)
    if (!target) throw new ConvexError("This person no longer exists.")
    checkAdminChange(me, target, args.kind)
    if (args.kind !== undefined && args.kind !== target.kind && target._id === me._id)
      throw new ConvexError("You cannot change your own kind. Ask another Engineer or Admin.")
    const patch: Partial<Doc<"people">> = {}
    if (args.name !== undefined) {
      const name = clean(args.name, 60, "name")
      if (!name) throw new ConvexError("Write the person's name.")
      patch.name = name
    }
    if (args.kind !== undefined) patch.kind = args.kind
    if (args.role !== undefined) patch.role = clean(args.role, 80, "role") ?? target.role
    if (args.area !== undefined) patch.area = clean(args.area, 20, "area") ?? null
    if (args.shift !== undefined) patch.shift = await checkShiftKey(ctx, args.shift)
    if (args.team !== undefined) patch.team = clean(args.team, 60, "team name")
    if (args.email !== undefined) patch.email = cleanEmail(args.email)
    await ctx.db.patch(target._id, patch)
  },
})

/** Archive (no longer checks in, records stay) or bring back. */
export const setArchived = mutation({
  args: { id: v.id("people"), archived: v.boolean(), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const me = await requireEngineerOrAdmin(ctx, args.personId, MESSAGE)
    const target = await ctx.db.get(args.id)
    if (!target) throw new ConvexError("This person no longer exists.")
    checkAdminChange(me, target, undefined)
    if (args.archived && target._id === me._id) throw new ConvexError("You cannot archive yourself while checked in.")
    await ctx.db.patch(
      target._id,
      args.archived ? { archived: true, archivedAt: Date.now() } : { archived: false, archivedAt: undefined },
    )
  },
})

/**
 * The Skill profiles a person is measured against in the Skill matrix. Set by
 * a checked-in Engineer (engineerPersonId), like the rest of the catalogue.
 */
export const assignProfiles = mutation({
  args: {
    personId: v.id("people"),
    profileIds: v.array(v.id("skillProfiles")),
    engineerPersonId: v.id("people"),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.engineerPersonId, "Check in as an Engineer to sign this off.")
    const person = await ctx.db.get(args.personId)
    if (!person) throw new Error("This person no longer exists.")
    const profileIds: Id<"skillProfiles">[] = []
    for (const id of new Set(args.profileIds)) {
      if (!(await ctx.db.get(id))) throw new Error("A Skill profile no longer exists.")
      profileIds.push(id)
    }
    await ctx.db.patch(person._id, { profileIds })
  },
})
