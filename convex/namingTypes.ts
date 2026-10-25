import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server"
import { v } from "convex/values"
import { requireUser, requireUserId } from "./lib/auth"
import { requireEngineerOrAdmin } from "./lib/roles"

// Document type vocabulary. The four originals plus Toolbox talk and Policy.
// icon/color are string ids resolved client-side (src/lib/typeMeta.ts) so the
// badge stays a pure component while the set is editable.
const FACTORY_TYPES = [
  { slug: "sop", token: "SOP", label: "SOP", icon: "FileText", color: "sky" },
  { slug: "manual", token: "MAN", label: "Manual", icon: "BookOpen", color: "violet" },
  { slug: "work_instruction", token: "WI", label: "Work instruction", icon: "ListChecks", color: "emerald" },
  { slug: "lmra", token: "LMRA", label: "LMRA", icon: "ShieldAlert", color: "rose" },
  { slug: "toolbox", token: "TBOX", label: "Toolbox talk", icon: "Presentation", color: "amber" },
  { slug: "policy", token: "POL", label: "Policy", icon: "Landmark", color: "indigo" },
] as const

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const rows = await ctx.db.query("namingTypes").take(200)
    rows.sort((a, b) => a.sortOrder - b.sortOrder)
    return rows
  },
})

export const seedIfEmpty = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx)
    const existing = await ctx.db.query("namingTypes").take(1)
    if (existing.length > 0) return { ok: true, seeded: false }
    for (let i = 0; i < FACTORY_TYPES.length; i++) {
      const t = FACTORY_TYPES[i]
      await ctx.db.insert("namingTypes", {
        slug: t.slug,
        token: t.token,
        label: t.label,
        icon: t.icon,
        color: t.color,
        active: true,
        builtIn: true,
        sortOrder: i,
      })
    }
    return { ok: true, seeded: true }
  },
})

// Adds factory types missing from an existing vocabulary (seedIfEmpty only
// runs on an empty table), so a built-in template's type gets its own token
// instead of the "DOC" fallback. Skips a type whose token is already taken.
export async function addMissingFactoryTypes(ctx: MutationCtx): Promise<string[]> {
  const rows = await ctx.db.query("namingTypes").take(200)
  if (rows.length === 0) return []
  let order = rows.reduce((m, t) => Math.max(m, t.sortOrder), -1)
  const added: string[] = []
  for (const t of FACTORY_TYPES) {
    if (rows.some((r) => r.slug === t.slug || r.token === t.token)) continue
    await ctx.db.insert("namingTypes", {
      slug: t.slug,
      token: t.token,
      label: t.label,
      icon: t.icon,
      color: t.color,
      active: true,
      builtIn: true,
      sortOrder: ++order,
    })
    added.push(t.slug)
  }
  return added
}

export const ensureFactoryTypes = internalMutation({
  args: {},
  handler: async (ctx) => ({ added: await addMissingFactoryTypes(ctx) }),
})

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export const add = mutation({
  args: {
    token: v.string(),
    label: v.string(),
    icon: v.string(),
    color: v.string(),
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    const token = args.token.trim().toUpperCase()
    const label = args.label.trim()
    if (!token) throw new Error("Token is required")
    if (!/^[A-Z0-9]+$/.test(token))
      throw new Error("Token must be letters/numbers only")
    if (!label) throw new Error("Label is required")

    const tokenClash = await ctx.db
      .query("namingTypes")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique()
    if (tokenClash) throw new Error(`Token ${token} already exists`)

    let slug = slugify(label) || token.toLowerCase()
    // Ensure slug uniqueness (slugs are the stored documents.type value).
    const slugClash = await ctx.db
      .query("namingTypes")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique()
    if (slugClash) slug = `${slug}_${token.toLowerCase()}`

    const all = await ctx.db.query("namingTypes").take(200)
    const maxOrder = all.reduce((m, t) => Math.max(m, t.sortOrder), -1)
    return await ctx.db.insert("namingTypes", {
      slug,
      token,
      label,
      icon: args.icon,
      color: args.color,
      active: true,
      builtIn: false,
      sortOrder: maxOrder + 1,
    })
  },
})

export const update = mutation({
  args: {
    id: v.id("namingTypes"),
    label: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    const row = await ctx.db.get(args.id)
    if (!row) throw new Error("Type not found")
    const patch: Record<string, unknown> = {}
    if (args.label !== undefined && args.label.trim())
      patch.label = args.label.trim()
    if (args.icon !== undefined) patch.icon = args.icon
    if (args.color !== undefined) patch.color = args.color
    await ctx.db.patch(args.id, patch)
  },
})

export const setActive = mutation({
  args: { id: v.id("namingTypes"), active: v.boolean(), personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    const row = await ctx.db.get(args.id)
    if (!row) throw new Error("Type not found")
    await ctx.db.patch(args.id, { active: args.active })
  },
})

export const remove = mutation({
  args: { id: v.id("namingTypes"), personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    const row = await ctx.db.get(args.id)
    if (!row) throw new Error("Type not found")
    if (row.builtIn)
      throw new Error("Built-in types can't be deleted. Turn it off instead.")
    // Refuse if any document uses this type slug — its naming code is immutable.
    const docs = await ctx.db.query("documents").take(2000)
    if (docs.some((d) => d.type === row.slug))
      throw new Error("Documents use this type. Turn it off instead.")
    await ctx.db.delete(args.id)
  },
})
