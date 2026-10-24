import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { Doc, Id } from "./_generated/dataModel"
import { requireUserId } from "./lib/auth"

const scopeKindArg = v.union(
  v.literal("doc"),
  v.literal("asset"),
  v.literal("library"),
)

// Ask history belongs to the person, not the login account (CONTEXT.md:
// Checked in makes Ask personal). A shared floor login holds one thread per
// checked-in person and one Anonymous thread, which the client replaces with
// a fresh one after a check-out. `who` is "person:<peopleId>" or
// "anon:<thread key>"; it is folded into the stored scopeId so the existing
// index keeps working.
const whoArg = v.optional(v.string())
function sessionScopeId(scopeId: string, who: string | undefined): string {
  const w = who && /^(person|anon):[A-Za-z0-9_-]{1,64}$/.test(who) ? who : "anon:default"
  return `${scopeId}#${w}`
}

const citationValidator = v.object({
  documentId: v.id("documents"),
  documentTitle: v.string(),
  chunkId: v.id("chunks"),
  pageOrSection: v.union(v.string(), v.null()),
  excerpt: v.string(),
  origin: v.union(
    v.literal("asset-link"),
    v.literal("cross-link"),
    v.literal("log"),
  ),
})

export const listSessions = query({
  args: {
    scopeKind: scopeKindArg,
    scopeId: v.string(),
    who: whoArg,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const sessions = await ctx.db
      .query("qaSessions")
      .withIndex("by_userId_and_scopeKind_and_scopeId", (q) =>
        q
          .eq("userId", userId)
          .eq("scopeKind", args.scopeKind)
          .eq("scopeId", sessionScopeId(args.scopeId, args.who)),
      )
      .take(50)
    sessions.sort((a, b) => b._creationTime - a._creationTime)
    return sessions
  },
})

export const getSession = query({
  args: { id: v.id("qaSessions") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const session = await ctx.db.get(args.id)
    if (!session || session.userId !== userId) return null
    return session
  },
})

export const listMessages = query({
  args: { sessionId: v.id("qaSessions") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const session = await ctx.db.get(args.sessionId)
    if (!session || session.userId !== userId) return []
    const messages = await ctx.db
      .query("qaMessages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .take(500)
    messages.sort((a, b) => a._creationTime - b._creationTime)
    return messages
  },
})

export const createSession = mutation({
  args: {
    scopeKind: scopeKindArg,
    scopeId: v.string(),
    who: whoArg,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    return await ctx.db.insert("qaSessions", {
      userId,
      scopeKind: args.scopeKind,
      scopeId: sessionScopeId(args.scopeId, args.who),
    })
  },
})

export const addMessage = mutation({
  args: {
    sessionId: v.id("qaSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
    citations: v.union(v.array(citationValidator), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const session = await ctx.db.get(args.sessionId)
    if (!session || session.userId !== userId) {
      throw new Error("Session not found")
    }
    return await ctx.db.insert("qaMessages", {
      sessionId: args.sessionId,
      role: args.role,
      text: args.text,
      citations: args.citations,
    })
  },
})

export const deleteMessages = mutation({
  args: { sessionId: v.id("qaSessions") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const session = await ctx.db.get(args.sessionId)
    if (!session || session.userId !== userId) return
    let deleted = 0
    while (true) {
      const batch: Doc<"qaMessages">[] = await ctx.db
        .query("qaMessages")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
        .take(200)
      if (batch.length === 0) break
      for (const m of batch) {
        await ctx.db.delete(m._id)
        deleted += 1
      }
      if (batch.length < 200) break
    }
    return { deleted }
  },
})

export const popLastTurn = mutation({
  args: { sessionId: v.id("qaSessions") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const session = await ctx.db.get(args.sessionId)
    if (!session || session.userId !== userId) return null
    const all = await ctx.db
      .query("qaMessages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .take(500)
    all.sort((a, b) => a._creationTime - b._creationTime)
    if (all.length === 0) return null
    const tail = all.slice(-2)
    let lastUserText: string | null = null
    for (const m of tail) {
      if (m.role === "user") lastUserText = m.text
      await ctx.db.delete(m._id)
    }
    return lastUserText
  },
})

export const ensureSession = mutation({
  args: {
    scopeKind: scopeKindArg,
    scopeId: v.string(),
    who: whoArg,
  },
  handler: async (ctx, args): Promise<Id<"qaSessions">> => {
    const userId = await requireUserId(ctx)
    const existing = await ctx.db
      .query("qaSessions")
      .withIndex("by_userId_and_scopeKind_and_scopeId", (q) =>
        q
          .eq("userId", userId)
          .eq("scopeKind", args.scopeKind)
          .eq("scopeId", sessionScopeId(args.scopeId, args.who)),
      )
      .first()
    if (existing) return existing._id
    return await ctx.db.insert("qaSessions", {
      userId,
      scopeKind: args.scopeKind,
      scopeId: sessionScopeId(args.scopeId, args.who),
    })
  },
})
