// Consistency check (CONTEXT.md: Consistency check, Finding).
// SCAFFOLD: owned by the Consistency track. Replace the stubs; keep the
// exported names and args: crons.ts and findingsAfterPublish schedule them.
import { v } from "convex/values"
import { internalAction } from "../_generated/server"

/** Check one newly Published version against the rest of Published Knowledge. */
export const checkDocument = internalAction({
  args: { documentId: v.id("documents"), version: v.number() },
  handler: async (ctx, args) => {
    void ctx
    void args
  },
})

/** Weekly sweep across all Published Knowledge. */
export const runAll = internalAction({
  args: {
    trigger: v.union(v.literal("weekly"), v.literal("manual"), v.literal("seed")),
  },
  handler: async (ctx, args) => {
    void ctx
    void args
  },
})
