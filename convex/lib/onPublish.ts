import { MutationCtx } from "../_generated/server"
import { internal } from "../_generated/api"
import { Id } from "../_generated/dataModel"
import { findingsAfterPublish } from "../findings"
import { markAffectedByPublish } from "../trainings"
import { skillsAfterPublish } from "../skills"

export interface PublishEvent {
  documentId: Id<"documents">
  // The version that just became the Published one.
  version: number
  // The version that was Published before, or null for a first publish.
  previousVersion: number | null
  // CONTEXT.md: Significant change. Always false for a first publish.
  significantChange: boolean
}

/**
 * Everything that follows a Document becoming Published, in one place.
 * Called from documents.publishApproved, inside the publishing transaction.
 * Wikis are handled there already. Each step lives with its own feature.
 */
export async function afterPublish(ctx: MutationCtx, event: PublishEvent) {
  const doc = await ctx.db.get(event.documentId)
  if (!doc) return

  // A Wrapped manual's PDF carries our naming code, version and status:
  // restamp it now that it is Published.
  if (doc.origin === "wrapped") {
    await ctx.scheduler.runAfter(0, internal.manuals.stampVersion, {
      documentId: event.documentId,
      version: event.version,
    })
  }

  // Findings on an older version are resolved by this publish; the new
  // version is checked against the rest of the Published Knowledge.
  await findingsAfterPublish(ctx, event)

  // A Significant change, or a removed passage that an objective cites,
  // sends linked Trainings back to review ...
  const passageRemoved = await markAffectedByPublish(ctx, event)

  // ... and flags the holders of linked Skills as "re-train needed". A
  // removed cited passage counts as Significant, whatever the author chose.
  await skillsAfterPublish(ctx, { ...event, significantChange: event.significantChange || (passageRemoved && event.previousVersion != null) })
}
