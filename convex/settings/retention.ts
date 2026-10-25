// Captures media retention (Settings, Floor; docs/adr/0005 Privacy). Daily:
// removes the photo, video and audio of Entries in handed-in Captures that
// are older than the retention. The Entry stays as a trace with its text,
// transcript and description, the same as deleting media by hand. A file a
// Draft already embeds (images table) stays with that Draft. Does nothing
// while no retention is set.
import { internalMutation } from "../_generated/server"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import { readOrgSettings } from "../orgSettings"

const DAY = 24 * 60 * 60 * 1000
const BATCH = 100
const DONE: Doc<"captures">["status"][] = ["handed_in", "processing", "ready", "failed"]

export const purgeCaptureMedia = internalMutation({
  args: {},
  handler: async (ctx) => {
    const { floor } = await readOrgSettings(ctx)
    if (!floor.captureRetentionDays) return { removed: 0 }
    const cutoff = Date.now() - floor.captureRetentionDays * DAY

    const embedded = new Set<Id<"_storage">>()
    for (const img of await ctx.db.query("images").take(5000)) if (img.storageId) embedded.add(img.storageId)

    let removed = 0
    for (const status of DONE) {
      const captures = await ctx.db
        .query("captures")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(500)
      for (const c of captures) {
        if ((c.handedInAt ?? c.endedAt ?? c.startedAt) > cutoff) continue
        const entries = await ctx.db
          .query("captureEntries")
          .withIndex("by_captureId_and_at", (q) => q.eq("captureId", c._id))
          .take(500)
        for (const e of entries) {
          if (!e.storageId) continue
          if (!embedded.has(e.storageId)) await ctx.storage.delete(e.storageId)
          await ctx.db.patch(e._id, { storageId: undefined, mediaDeletedAt: Date.now() })
          removed++
          if (removed >= BATCH) {
            // More to do: continue in a fresh transaction.
            await ctx.scheduler.runAfter(0, internal.settings.retention.purgeCaptureMedia, {})
            return { removed }
          }
        }
      }
    }
    return { removed }
  },
})
