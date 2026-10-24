// Proposed revisions (CONTEXT.md: Proposed revision; ADR 0003).
// SCAFFOLD: owned by the Insights track. Replace the stub below; keep the
// exported name and args: the Findings UI calls it ("Prepare a revision").
import { v } from "convex/values"
import { action } from "../_generated/server"
import { Id } from "../_generated/dataModel"

/**
 * Starts a Proposed revision for a Published Document from a signal (an open
 * Finding, the Document's insights, or Knowledge health). Returns the new
 * proposedRevisions id at once; generation runs in the background. The AI
 * only prepares a draft version: it never approves or publishes.
 */
export const propose = action({
  args: {
    documentId: v.id("documents"),
    source: v.object({
      kind: v.union(v.literal("finding"), v.literal("insight"), v.literal("health")),
      findingId: v.optional(v.id("findings")),
      note: v.string(),
    }),
  },
  handler: async (ctx, args): Promise<Id<"proposedRevisions">> => {
    void ctx
    void args
    throw new Error("Proposed revisions are not built yet.")
  },
})
