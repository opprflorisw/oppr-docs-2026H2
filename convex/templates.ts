import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { requireUser, requireUserId } from "./lib/auth"
import { requireEngineerOrAdmin } from "./lib/roles"

// Type slug references the editable namingTypes vocabulary.
const docTypeValidator = v.string()

export const list = query({
  args: { type: v.optional(docTypeValidator) },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    let rows = await ctx.db.query("templates").take(500)
    if (args.type) rows = rows.filter((t) => t.type === args.type)
    rows.sort(
      (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
    )
    return rows
  },
})

export const get = query({
  args: { id: v.id("templates") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    return await ctx.db.get(args.id)
  },
})

export const create = mutation({
  args: {
    name: v.string(),
    type: docTypeValidator,
    description: v.union(v.string(), v.null()),
    bodyJson: v.any(),
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    const name = args.name.trim()
    if (!name) throw new Error("Template name is required")
    return await ctx.db.insert("templates", {
      name,
      type: args.type,
      description: args.description,
      bodyJson: args.bodyJson,
      updatedAt: Date.now(),
    })
  },
})

export const update = mutation({
  args: {
    id: v.id("templates"),
    name: v.string(),
    type: docTypeValidator,
    description: v.union(v.string(), v.null()),
    bodyJson: v.any(),
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    const t = await ctx.db.get(args.id)
    if (!t) throw new Error("Template not found")
    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      type: args.type,
      description: args.description,
      bodyJson: args.bodyJson,
      updatedAt: Date.now(),
    })
  },
})

export const duplicate = mutation({
  args: { id: v.id("templates"), personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    const t = await ctx.db.get(args.id)
    if (!t) throw new Error("Template not found")
    return await ctx.db.insert("templates", {
      name: `${t.name} (copy)`,
      type: t.type,
      description: t.description,
      bodyJson: t.bodyJson,
      updatedAt: Date.now(),
    })
  },
})

export const remove = mutation({
  args: { id: v.id("templates"), personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    await ctx.db.delete(args.id)
  },
})

// Seed the templates table from a caller-supplied set of skeletons (the
// originals defined in src/components/docs/DocumentTemplates.ts). Idempotent:
// only inserts when the table is empty.
export const seedIfEmpty = mutation({
  args: {
    templates: v.array(
      v.object({
        name: v.string(),
        type: docTypeValidator,
        description: v.union(v.string(), v.null()),
        bodyJson: v.any(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const existing = (await ctx.db.query("templates").take(1)).length
    if (existing > 0) return { skipped: true }
    const now = Date.now()
    for (const t of args.templates) {
      await ctx.db.insert("templates", {
        name: t.name,
        type: t.type,
        description: t.description,
        bodyJson: t.bodyJson,
        updatedAt: now,
      })
    }
    return { ok: true, inserted: args.templates.length }
  },
})
