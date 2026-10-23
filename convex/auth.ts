import Resend from "@auth/core/providers/resend"
import { Password } from "@convex-dev/auth/providers/Password"
import { convexAuth } from "@convex-dev/auth/server"
import type { MutationCtx } from "./_generated/server"

const ALLOWED_DOMAIN = "oppr.ai"

export const PASSWORD_PROVIDER = "password"

export function normalizeLogin(value: unknown): string {
  return String(value ?? "").trim().toLowerCase()
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    // Password accounts are provisioned up front via `accounts:create`
    // (internal, CLI/dashboard only). Self-service sign-up is refused here;
    // the internal createAccount path does not go through profile().
    Password({
      id: PASSWORD_PROVIDER,
      profile(params) {
        if (params.flow !== "signIn") {
          throw new Error("InvalidAccountId")
        }
        return { email: normalizeLogin(params.email) }
      },
    }),
    // Magic link stays available for @oppr.ai addresses.
    Resend({
      from: process.env.AUTH_EMAIL ?? "Oppr DOCS <onboarding@resend.dev>",
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId) {
        return args.existingUserId
      }

      const email = args.profile.email?.toLowerCase()
      const isProvisioned = args.provider.id === PASSWORD_PROVIDER
      if (!email || (!isProvisioned && !email.endsWith(`@${ALLOWED_DOMAIN}`))) {
        throw new Error("InvalidAccountId")
      }

      // One user per email, whichever provider they first came in through.
      const existing = await (ctx as unknown as MutationCtx).db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .first()
      if (existing) {
        return existing._id
      }

      return await ctx.db.insert("users", {
        email,
        name: args.profile.name as string | undefined,
        image: args.profile.image as string | undefined,
        emailVerificationTime:
          args.type === "verification" ? Date.now() : undefined,
      })
    },
  },
})
