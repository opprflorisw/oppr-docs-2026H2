import { v } from "convex/values"
import {
  createAccount,
  invalidateSessions,
  modifyAccountCredentials,
} from "@convex-dev/auth/server"
import { internal } from "./_generated/api"
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server"
import { normalizeLogin, PASSWORD_PROVIDER } from "./auth"

// Password accounts are managed from the CLI / Convex dashboard only, never
// from the app, so a signed-in guest can't mint more accounts.
//
//   npx convex run accounts:create '{"email":"cas@example.com","password":"...","name":"Cas"}'
//   npx convex run accounts:list
//   npx convex run accounts:setPassword '{"email":"cas@example.com","password":"..."}'
//   npx convex run accounts:remove '{"email":"cas@example.com"}'
//
// Add --prod to target production.

const MIN_PASSWORD_LENGTH = 10

function checkPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }
}

export const create = internalAction({
  args: { email: v.string(), password: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, { email, password, name }) => {
    const login = normalizeLogin(email)
    if (!login) throw new Error("Email is required")
    checkPassword(password)
    const existing = await ctx.runQuery(internal.accounts.findAccount, { email: login })
    if (existing) throw new Error(`An account for ${login} already exists`)
    const { user } = await createAccount(ctx, {
      provider: PASSWORD_PROVIDER,
      account: { id: login, secret: password },
      profile: { email: login, ...(name ? { name } : {}) },
    })
    return { email: login, userId: user._id }
  },
})

export const setPassword = internalAction({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, { email, password }) => {
    const login = normalizeLogin(email)
    checkPassword(password)
    const existing = await ctx.runQuery(internal.accounts.findAccount, { email: login })
    if (!existing) throw new Error(`No account for ${login}`)
    await modifyAccountCredentials(ctx, {
      provider: PASSWORD_PROVIDER,
      account: { id: login, secret: password },
    })
    await invalidateSessions(ctx, { userId: existing.userId })
    return { email: login, signedOut: true }
  },
})

export const remove = internalAction({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const login = normalizeLogin(email)
    const existing = await ctx.runQuery(internal.accounts.findAccount, { email: login })
    if (!existing) throw new Error(`No account for ${login}`)
    await ctx.runMutation(internal.accounts.deleteAccount, { accountId: existing._id })
    await invalidateSessions(ctx, { userId: existing.userId })
    return { email: login, removed: true }
  },
})

export const list = internalQuery({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db
      .query("authAccounts")
      .filter((q) => q.eq(q.field("provider"), PASSWORD_PROVIDER))
      .take(500)
    return await Promise.all(
      accounts.map(async (a) => {
        const user = await ctx.db.get(a.userId)
        return { email: a.providerAccountId, name: user?.name ?? null }
      }),
    )
  },
})

export const findAccount = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", PASSWORD_PROVIDER).eq("providerAccountId", email),
      )
      .unique()
  },
})

export const deleteAccount = internalMutation({
  args: { accountId: v.id("authAccounts") },
  handler: async (ctx, { accountId }) => {
    await ctx.db.delete(accountId)
  },
})
