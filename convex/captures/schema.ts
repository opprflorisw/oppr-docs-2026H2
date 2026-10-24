import { defineTable } from "convex/server"
import { v } from "convex/values"

// Captures (CONTEXT.md, docs/adr/0005): an operator records how they do the
// work on the phone; the AI organizes it into Moments; several Captures of
// the same job form a Capture set that shows Variations. Raw input only:
// nothing here is Knowledge, and Ask, Wiki and MCP never read it.

export const momentKind = v.union(
  v.literal("step"),
  v.literal("safety"),
  v.literal("quality"),
  v.literal("tip"),
  v.literal("problem"),
  v.literal("question"),
)

export const captureTables = {
  captures: defineTable({
    title: v.string(),
    /** The job being captured, e.g. "Start-up of line 2". Used to group Captures. */
    job: v.optional(v.string()),
    authorId: v.id("people"),
    status: v.union(
      v.literal("recording"),
      v.literal("handed_in"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    handedInAt: v.optional(v.number()),
    /** Short AI summary once processed. */
    summary: v.optional(v.string()),
    /** Suggested categories/tags from the AI, e.g. "start-up", "line 2". */
    tags: v.optional(v.array(v.string())),
    error: v.optional(v.string()),
    seeded: v.optional(v.boolean()),
  })
    .index("by_authorId", ["authorId"])
    .index("by_status", ["status"]),

  captureEntries: defineTable({
    captureId: v.id("captures"),
    kind: v.union(
      v.literal("note"),
      v.literal("voice"),
      v.literal("photo"),
      v.literal("video"),
      v.literal("scan"),
    ),
    at: v.number(),
    /** Typed note text. */
    text: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    mimeType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    /** The Asset scanned, or the last scanned Asset when this Entry was made. */
    assetId: v.optional(v.id("assets")),
    /** AI results. */
    transcript: v.optional(v.string()),
    description: v.optional(v.string()),
    analysis: v.optional(
      v.union(v.literal("pending"), v.literal("done"), v.literal("skipped"), v.literal("failed")),
    ),
    analysisNote: v.optional(v.string()),
    /** Media removed for privacy; the Entry row stays as a trace. */
    mediaDeletedAt: v.optional(v.number()),
  }).index("by_captureId_and_at", ["captureId", "at"]),

  captureMoments: defineTable({
    captureId: v.id("captures"),
    order: v.number(),
    kind: momentKind,
    title: v.string(),
    detail: v.string(),
    assetId: v.optional(v.id("assets")),
    entryIds: v.array(v.id("captureEntries")),
  }).index("by_captureId_and_order", ["captureId", "order"]),

  captureSets: defineTable({
    title: v.string(),
    job: v.optional(v.string()),
    captureIds: v.array(v.id("captures")),
    createdBy: v.id("people"),
    createdAt: v.number(),
    status: v.union(v.literal("idle"), v.literal("combining"), v.literal("ready"), v.literal("failed")),
    error: v.optional(v.string()),
    /** The combined step list, once combined. */
    combined: v.optional(
      v.object({
        summary: v.string(),
        steps: v.array(
          v.object({
            title: v.string(),
            detail: v.string(),
            kind: momentKind,
            /** Captures that show this step. */
            supportedBy: v.array(v.id("captures")),
            /** How individual Captures do it differently, or skip it. */
            variations: v.array(
              v.object({
                captureId: v.id("captures"),
                kind: v.union(v.literal("different"), v.literal("skipped"), v.literal("extra")),
                text: v.string(),
              }),
            ),
            /** Where this step disagrees with Published Knowledge. */
            conflict: v.optional(
              v.object({ documentId: v.id("documents"), namingCode: v.string(), quote: v.string(), note: v.string() }),
            ),
            /** The Engineer's choice for a step with Variations. */
            decision: v.optional(v.string()),
            evidenceEntryIds: v.optional(v.array(v.id("captureEntries"))),
          }),
        ),
        combinedAt: v.number(),
      }),
    ),
    /** Drafts made from this set. */
    draftDocumentIds: v.optional(v.array(v.id("documents"))),
  }).index("by_createdAt", ["createdAt"]),
}
