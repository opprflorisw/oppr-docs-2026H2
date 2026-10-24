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
    // One view per person (or anonymous) per document per minute is enough.
    const now = Date.now()
    if (args.documentId) {
      const recent = await ctx.db
        .query("usageEvents")
        .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId!))
        .order("desc")
        .first()
      if (
        recent &&
        recent.kind === args.kind &&
        recent.personId === (args.personId ?? null) &&
        now - recent.at < 60_000
      )
        return
    }
    await ctx.db.insert("usageEvents", {
      at: now,
      kind: args.kind,
      documentId: args.documentId ?? null,
      assetId: args.assetId ?? null,
      personId: await validPerson(ctx, args.personId),
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
