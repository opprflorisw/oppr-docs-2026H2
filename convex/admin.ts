import { internalMutation } from "./_generated/server"

const APP_TABLES = [
  "meta",
  "assets",
  "assetLogs",
  "documents",
  "documentVersions",
  "documentAssets",
  "logs",
  "documentLogRefs",
  "chunkVectors",
  "chunks",
  "qaSessions",
  "qaMessages",
  "imageVectors",
  "images",
  "imageUsages",
  "importJobs",
] as const

export const wipeAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const counts: Record<string, number> = {}
    let storageDeleted = 0

    const docVersions = await ctx.db.query("documentVersions").collect()
    for (const dv of docVersions) {
      if (dv.pdfStorageId) {
        await ctx.storage.delete(dv.pdfStorageId)
        storageDeleted++
      }
    }

    const images = await ctx.db.query("images").collect()
    for (const img of images) {
      if (img.storageId) {
        await ctx.storage.delete(img.storageId)
        storageDeleted++
      }
    }

    const jobs = await ctx.db.query("importJobs").collect()
    for (const j of jobs) {
      if (j.sourceStorageId) {
        await ctx.storage.delete(j.sourceStorageId)
        storageDeleted++
      }
    }

    for (const table of APP_TABLES) {
      const rows = await ctx.db.query(table).collect()
      for (const row of rows) {
        await ctx.db.delete(row._id)
      }
      counts[table] = rows.length
    }

    return { ok: true, counts, storageDeleted }
  },
})
