// Findings (CONTEXT.md: Consistency check, Finding).
// SCAFFOLD: owned by the Consistency track. Replace the stub below; keep the
// exported name and signature, it is called from lib/onPublish.ts.
import { MutationCtx } from "./_generated/server"
import type { PublishEvent } from "./lib/onPublish"

/**
 * Called inside the publishing transaction. Resolves open Findings that
 * involve an older version of this Document ("resolved by publishing a
 * revision"), and schedules the Consistency check of the new version.
 */
export async function findingsAfterPublish(ctx: MutationCtx, event: PublishEvent) {
  void ctx
  void event
}
