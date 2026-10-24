// Wrapped manuals (CONTEXT.md: Wrapped manual).
// SCAFFOLD: owned by the Wrapped manuals track. Replace the stub below; keep
// the exported name and args, it is scheduled from lib/onPublish.ts.
import { v } from "convex/values"
import { internalAction } from "./_generated/server"

/**
 * Re-stamp the supplier PDF of one version with its current naming code,
 * version and status (lib/pdfStamp.ts), store it as the version's
 * pdfStorageId (the old stamped blob is deleted, the supplier original in
 * sourcePdfStorageId is never touched) and record stampLabel.
 */
export const stampVersion = internalAction({
  args: { documentId: v.id("documents"), version: v.number() },
  handler: async (ctx, args) => {
    void ctx
    void args
  },
})
