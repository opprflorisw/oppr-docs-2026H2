// Trainings (CONTEXT.md: Training; ADR 0002).
// SCAFFOLD: owned by the Trainings track. Replace the stub below; keep the
// exported name and signature, it is called from lib/onPublish.ts.
import { MutationCtx } from "./_generated/server"
import type { PublishEvent } from "./lib/onPublish"

/**
 * Called inside the publishing transaction. On a Significant change, every
 * Training whose live version uses this Document goes back to review
 * (needsReview = true, with a reason naming the Document and version).
 */
export async function trainingsAfterPublish(ctx: MutationCtx, event: PublishEvent) {
  void ctx
  void event
}
