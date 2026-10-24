// MCP connection keys and the audit log (docs/adr/0004).
//
// A key is made by a checked-in Engineer in the app. The secret ("opk_...")
// is returned once and only its SHA-256 hash is stored. The MCP endpoint
// (convex/mcp/server.ts) looks keys up by hash and writes one mcpCalls row
// per tool call.
import { v } from "convex/values"
import { internalMutation, internalQuery, mutation, query } from "../_generated/server"
import { Doc, Id } from "../_generated/dataModel"
import { requireUserId } from "../lib/auth"
import { requireEngineer } from "../documents"

export const SCOPES = ["read:published", "read:people", "write:drafts", "write:signals"] as const
export type Scope = (typeof SCOPES)[number]

const scopeV = v.union(
  v.literal("read:published"),
  v.literal("read:people"),
  v.literal("write:drafts"),
  v.literal("write:signals"),
)
const modelHostV = v.union(v.literal("customer-cloud"), v.literal("self-hosted"), v.literal("other"))

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

function newSecret(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const body = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
  return `opk_${body}`
}

async function insertKey(
  ctx: import("../_generated/server").MutationCtx,
  args: {
    name: string
    scopes: Scope[]
    areaCodes: string[]
    modelHost: Doc<"mcpKeys">["modelHost"]
    createdBy: Id<"users">
  },
) {
  const name = args.name.trim()
  if (!name) throw new Error("Give the key a name, for example the assistant or system that will use it.")
  if (args.scopes.length === 0) throw new Error("Choose at least one access level.")
  const secret = newSecret()
  const keyId = await ctx.db.insert("mcpKeys", {
    name: name.slice(0, 80),
    prefix: secret.slice(0, 8),
    hash: await sha256Hex(secret),
    scopes: [...new Set(args.scopes)],
    areaCodes: [...new Set(args.areaCodes.map((a) => a.trim().toUpperCase()).filter(Boolean))],
    modelHost: args.modelHost,
    createdBy: args.createdBy,
    createdAt: Date.now(),
    lastUsedAt: null,
    revokedAt: null,
  })
  return { keyId, secret, prefix: secret.slice(0, 8) }
}

/** Make a key. Engineer-only: a key can bring drafts and personal data in and out. */
export const createKey = mutation({
  args: {
    name: v.string(),
    scopes: v.array(scopeV),
    areaCodes: v.array(v.string()),
    modelHost: modelHostV,
    personId: v.id("people"),
  },
  handler: async (ctx, args): Promise<{ keyId: Id<"mcpKeys">; secret: string; prefix: string }> => {
    const userId = await requireUserId(ctx)
    await requireEngineer(ctx, args.personId)
    return await insertKey(ctx, { ...args, createdBy: userId })
  },
})

/** For tests and the dev verifier only. */
export const createKeyInternal = internalMutation({
  args: {
    name: v.string(),
    scopes: v.array(scopeV),
    areaCodes: v.array(v.string()),
    modelHost: modelHostV,
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").first()
    if (!user) throw new Error("No user to own the key")
    return await insertKey(ctx, { ...args, createdBy: user._id })
  },
})

/** For tests and the dev verifier only: revoke every key whose name starts with the prefix. */
export const revokeKeysByNameInternal = internalMutation({
  args: { namePrefix: v.string() },
  handler: async (ctx, args) => {
    const prefix = args.namePrefix.trim()
    if (!prefix) throw new Error("Give a name prefix")
    let revoked = 0
    for (const k of await ctx.db.query("mcpKeys").take(500)) {
      if (k.revokedAt == null && k.name.startsWith(prefix)) {
        await ctx.db.patch(k._id, { revokedAt: Date.now() })
        revoked++
      }
    }
    return revoked
  },
})

export const revokeKey = mutation({
  args: { keyId: v.id("mcpKeys"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineer(ctx, args.personId)
    const key = await ctx.db.get(args.keyId)
    if (!key) throw new Error("Key not found")
    if (key.revokedAt == null) await ctx.db.patch(args.keyId, { revokedAt: Date.now() })
  },
})

export const listKeys = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx)
    const keys = await ctx.db.query("mcpKeys").order("desc").take(100)
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000
    const out = []
    for (const k of keys) {
      const user = await ctx.db.get(k.createdBy)
      const calls = await ctx.db
        .query("mcpCalls")
        .withIndex("by_keyId", (q) => q.eq("keyId", k._id))
        .order("desc")
        .take(500)
      out.push({
        _id: k._id,
        name: k.name,
        prefix: k.prefix,
        scopes: k.scopes,
        areaCodes: k.areaCodes,
        modelHost: k.modelHost,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
        revokedAt: k.revokedAt,
        createdByName: user?.name ?? user?.email ?? "Unknown",
        calls7d: calls.filter((c) => c.at >= weekAgo).length,
      })
    }
    return out
  },
})

export const recentCalls = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const rows = await ctx.db
      .query("mcpCalls")
      .withIndex("by_at")
      .order("desc")
      .take(Math.min(args.limit ?? 50, 200))
    const names = new Map<string, string>()
    const out = []
    for (const r of rows) {
      if (!names.has(r.keyId)) names.set(r.keyId, (await ctx.db.get(r.keyId))?.name ?? "Deleted key")
      const doc = r.documentId ? await ctx.db.get(r.documentId) : null
      out.push({
        _id: r._id,
        keyName: names.get(r.keyId)!,
        tool: r.tool,
        ok: r.ok,
        summary: r.summary,
        documentId: r.documentId,
        documentCode: doc?.namingCode ?? null,
        at: r.at,
        durationMs: r.durationMs,
      })
    }
    return out
  },
})

// ---- Used by the endpoint -------------------------------------------------------

export const keyByHash = internalQuery({
  args: { hash: v.string() },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query("mcpKeys")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .first()
    if (!key || key.revokedAt != null) return null
    return key
  },
})

export const logCall = internalMutation({
  args: {
    keyId: v.id("mcpKeys"),
    tool: v.string(),
    ok: v.boolean(),
    summary: v.string(),
    documentId: v.union(v.id("documents"), v.null()),
    durationMs: v.number(),
  },
  handler: async (ctx, args) => {
    const at = Date.now()
    await ctx.db.insert("mcpCalls", { ...args, summary: args.summary.slice(0, 300), at })
    await ctx.db.patch(args.keyId, { lastUsedAt: at })
  },
})
