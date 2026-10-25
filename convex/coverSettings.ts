import { ConvexError, v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireUser, requireUserId } from "./lib/auth"
import { requireEngineerOrAdmin } from "./lib/roles"

// Single-row settings for the PDF export cover/header/footer. `get` returns
// the row (with the logo resolved to a fetchable URL so the export path can
// inline it as a data URL) or null when nothing has been configured yet.

export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const row = await ctx.db.query("coverSettings").first()
    if (!row) return null
    let logoUrl: string | null = null
    if (row.logoImageId) {
      const img = await ctx.db.get(row.logoImageId)
      if (img) {
        logoUrl =
          img.source === "url"
            ? img.externalUrl
            : img.storageId
              ? await ctx.storage.getUrl(img.storageId)
              : null
      }
    }
    return { ...row, logoUrl }
  },
})

export const upsert = mutation({
  args: {
    companyName: v.union(v.string(), v.null()),
    headerText: v.union(v.string(), v.null()),
    footerText: v.union(v.string(), v.null()),
    titleSize: v.union(v.literal("sm"), v.literal("md"), v.literal("lg")),
    logoImageId: v.union(v.id("images"), v.null()),
    showPageNumbers: v.boolean(),
    confidentialityLabel: v.union(v.string(), v.null()),
    defaultWatermark: v.union(
      v.literal("none"),
      v.literal("controlled"),
      v.literal("draft"),
      v.literal("review"),
      v.null(),
    ),
    accentColor: v.union(v.string(), v.null()),
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    const { personId: _personId, ...fields } = args
    const row = { ...fields, updatedAt: Date.now() }
    const existing = await ctx.db.query("coverSettings").first()
    if (existing) {
      await ctx.db.patch(existing._id, row)
      return existing._id
    }
    return await ctx.db.insert("coverSettings", row)
  },
})

// Settings, Company: the company name and logo live here (one source) and are
// used on the title page, the Floor simulator, Training records and MCP.
export const setCompany = mutation({
  args: {
    companyName: v.union(v.string(), v.null()),
    logoImageId: v.union(v.id("images"), v.null()),
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    const companyName = args.companyName?.trim() || null
    if (companyName && companyName.length > 120) throw new ConvexError("Keep the company name under 120 characters.")
    if (args.logoImageId && !(await ctx.db.get(args.logoImageId))) throw new ConvexError("That logo image no longer exists.")
    const patch = { companyName, logoImageId: args.logoImageId, updatedAt: Date.now() }
    const existing = await ctx.db.query("coverSettings").first()
    if (existing) {
      await ctx.db.patch(existing._id, patch)
      return existing._id
    }
    return await ctx.db.insert("coverSettings", {
      ...patch,
      headerText: null,
      footerText: null,
      titleSize: "md",
      showPageNumbers: true,
      confidentialityLabel: null,
      defaultWatermark: null,
      accentColor: null,
    })
  },
})

/** The company name for labels on screen; "Oppr Knowledge" until one is set. */
export const company = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const row = await ctx.db.query("coverSettings").first()
    return { name: row?.companyName?.trim() || null }
  },
})
