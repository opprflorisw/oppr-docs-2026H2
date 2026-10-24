// Skills, Skill profiles and the Skill matrix (CONTEXT.md: Learn).
// SCAFFOLD: owned by the Skills track. Replace the stubs below; keep the
// exported names and signatures: skillsAfterPublish is called from
// lib/onPublish.ts, onTrainingPassed from the Trainings track.
import { v } from "convex/values"
import { internalMutation, MutationCtx } from "./_generated/server"
import type { PublishEvent } from "./lib/onPublish"

/**
 * Called inside the publishing transaction. On a Significant change, every
 * holder (level >= 1) of a Skill linked to this Document is flagged
 * "re-train needed", with a reason naming the Document and version.
 */
export async function skillsAfterPublish(ctx: MutationCtx, event: PublishEvent) {
  void ctx
  void event
}

/**
 * A person passed a published Training: raise every Skill linked to that
 * Training to at least level 1 (CONTEXT.md: Skill levels), clear
 * "re-train needed", set expiresAt from validityMonths, log a skillEvent.
 */
export const onTrainingPassed = internalMutation({
  args: {
    personId: v.id("people"),
    trainingId: v.id("trainings"),
    recordId: v.id("trainingRecords"),
  },
  handler: async (ctx, args) => {
    void ctx
    void args
  },
})
