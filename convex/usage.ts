import { v } from "convex/values"
import { internalMutation, mutation } from "./_generated/server"
import { Id } from "./_generated/dataModel"
import { requireUserId } from "./lib/auth"

// Usage signals (CONTEXT.md: Usage, Document insights, Knowledge health).
// Append-only, written by the server; read by the Insights track.

async function validPerson(
  ctx: { db: { get: (id: Id<"people">) => Promise<unknown> } },
  personId: string | null | undefined,
): Promise<Id<"people"> | null> {
  if (!personId) return null
  try {
    const p = await ctx.db.get(personId as Id<"people">)
    return p ? (personId as Id<"people">) : null
  } catch {
    return null
  }
}

// Reopening the same Document (or Scanning the same Asset) within this window
// counts once.
const DEDUPE_MS = 30 * 60_000

/** A Document was opened, or an Asset was Scanned. Called by the readers. */
export const record = mutation({
  args: {
    kind: v.union(v.literal("view"), v.literal("scan")),
    documentId: v.optional(v.id("documents")),
    assetId: v.optional(v.id("assets")),
    personId: v.optional(v.union(v.id("people"), v.null())),
    surface: v.union(v.literal("desktop"), v.literal("floor")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const now = Date.now()
    const personId = await validPerson(ctx, args.personId)
    if (args.kind === "view" && args.documentId) {
      // Only Published Knowledge is read on the floor: opening a draft (an
      // Engineer working on it) is not a view.
      const doc = await ctx.db.get(args.documentId)
      if (!doc || doc.liveVersion == null) return
    }
    // Reopening the same item within a short window is one view or Scan, per
    // person (or per surface when Anonymous).
    const recent = args.documentId
      ? await ctx.db
          .query("usageEvents")
          .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId!))
          .order("desc")
          .take(50)
      : args.assetId
        ? await ctx.db
            .query("usageEvents")
            .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId!))
            .order("desc")
            .take(50)
        : []
    const duplicate = recent.some(
      (r) =>
        now - r.at < DEDUPE_MS &&
        r.kind === args.kind &&
        r.personId === personId &&
        (personId != null || r.surface === args.surface),
    )
    if (duplicate) return
    await ctx.db.insert("usageEvents", {
      at: now,
      kind: args.kind,
      documentId: args.documentId ?? null,
      assetId: args.assetId ?? null,
      personId,
      surface: args.surface,
    })
  },
})

/** One Ask question, logged by ai/ask.askStream when the answer is done. */
export const logAsk = internalMutation({
  args: {
    scope: v.union(
      v.object({ kind: v.literal("doc"), id: v.id("documents") }),
      v.object({ kind: v.literal("asset"), id: v.id("assets") }),
      v.object({ kind: v.literal("library") }),
    ),
    question: v.string(),
    answerFound: v.boolean(),
    citedDocumentIds: v.array(v.id("documents")),
    personId: v.union(v.string(), v.null()),
    surface: v.union(v.literal("desktop"), v.literal("floor")),
  },
  handler: async (ctx, args) => {
    const cited = Array.from(new Set(args.citedDocumentIds))
    const primary =
      args.scope.kind === "doc" ? args.scope.id : (cited[0] ?? null)
    await ctx.db.insert("askEvents", {
      at: Date.now(),
      scopeKind: args.scope.kind,
      scopeId: args.scope.kind === "library" ? "" : args.scope.id,
      question: args.question,
      answerFound: args.answerFound,
      citedDocumentIds: cited,
      primaryDocumentId: primary,
      personId: await validPerson(ctx, args.personId),
      surface: args.surface,
    })
  },
})
