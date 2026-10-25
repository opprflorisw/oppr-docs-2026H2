// Seed step: the demo plant's company logo (Pijpwerk Noord) on the PDF cover.
// Stores the bundled PNG once as an images row (tag "logo") and points
// coverSettings.logoImageId at it when the logo is unset or points at a row
// that no longer exists (the reseed wipes images but keeps coverSettings).
// A logo someone chose themselves is left alone. Safe to run again:
//   npx convex run seed/companyLogo:run
import { v } from "convex/values"
import { internalAction, internalMutation, internalQuery } from "../_generated/server"
import type { ActionCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"
import { internal } from "../_generated/api"
import { COMPANY_LOGO_PNG_BASE64 } from "./companyLogoPng"
import { decodeBase64 } from "./media"

const FILENAME = "pijpwerk-noord-logo.png"
const ALT = "Pijpwerk Noord logo"
const COMPANY = "Pijpwerk Noord"

export const state = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("images").order("desc").take(2000)
    const logo = rows.find((r) => r.filename === FILENAME && (r.tags ?? []).includes("logo"))
    return { logoImageId: logo?._id ?? null }
  },
})

export const attach = internalMutation({
  args: {
    storageId: v.union(v.id("_storage"), v.null()),
    imageId: v.union(v.id("images"), v.null()),
    byteSize: v.number(),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, args) => {
    let imageId = args.imageId
    if (!imageId) {
      if (!args.storageId) throw new Error("companyLogo: no storageId and no image")
      imageId = await ctx.db.insert("images", {
        source: "upload",
        storageId: args.storageId,
        externalUrl: null,
        filename: FILENAME,
        contentType: "image/png",
        byteSize: args.byteSize,
        width: args.width,
        height: args.height,
        sha256: null,
        altText: ALT,
        uploadedBy: null,
        createdAt: Date.now(),
        description: "Company logo of the Pijpwerk Noord plant, used on the PDF title page.",
        tags: ["logo"],
        kind: "illustration",
      })
    }

    const cover = await ctx.db.query("coverSettings").first()
    if (!cover) {
      await ctx.db.insert("coverSettings", {
        companyName: COMPANY,
        headerText: null,
        footerText: null,
        titleSize: "md",
        logoImageId: imageId,
        showPageNumbers: true,
        confidentialityLabel: null,
        defaultWatermark: null,
        accentColor: null,
        updatedAt: Date.now(),
      })
      return { imageId, coverUpdated: true }
    }
    const current = cover.logoImageId ? await ctx.db.get(cover.logoImageId) : null
    if (current) return { imageId, coverUpdated: false }
    await ctx.db.patch(cover._id, { logoImageId: imageId, updatedAt: Date.now() })
    return { imageId, coverUpdated: true }
  },
})

/** Ensures the logo image row exists and the cover points at a live logo. */
export async function ensureCompanyLogo(
  ctx: ActionCtx,
): Promise<{ imageId: Id<"images">; created: boolean; coverUpdated: boolean }> {
  const existing: { logoImageId: Id<"images"> | null } = await ctx.runQuery(internal.seed.companyLogo.state, {})
  let storageId: Id<"_storage"> | null = null
  const bytes = decodeBase64(COMPANY_LOGO_PNG_BASE64)
  // PNG IHDR: width and height are big-endian uint32 at byte 16 and 20.
  const view = new DataView(bytes.buffer)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (!existing.logoImageId) {
    storageId = await ctx.storage.store(new Blob([bytes as BlobPart], { type: "image/png" }))
  }
  const r: { imageId: Id<"images">; coverUpdated: boolean } = await ctx.runMutation(
    internal.seed.companyLogo.attach,
    { storageId, imageId: existing.logoImageId, byteSize: bytes.length, width, height },
  )
  return { imageId: r.imageId, created: !existing.logoImageId, coverUpdated: r.coverUpdated }
}

export const run = internalAction({
  args: {},
  handler: async (ctx) => await ensureCompanyLogo(ctx),
})
