// Who may do what (CONTEXT.md: Operator, Engineer, Checked in).
// Admin is an Engineer who also looks after the plant's settings: every
// check that asks for an Engineer lets an Admin through. Archived people
// can no longer check in, so they pass no check.
import { ConvexError } from "convex/values"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"

type Ctx = QueryCtx | MutationCtx

type Kinded = Pick<Doc<"people">, "kind" | "archived">

/** True for an Engineer or an Admin who is not archived. */
export function isEngineerOrAdmin<T extends Kinded>(person: T | null | undefined): person is T & { kind: "engineer" | "admin" } {
  if (!person || person.archived) return false
  return person.kind === "engineer" || person.kind === "admin"
}

export function isAdmin<T extends Kinded>(person: T | null | undefined): person is T & { kind: "admin" } {
  return !!person && !person.archived && person.kind === "admin"
}

/**
 * The checked-in person when they are an Engineer or an Admin; throws a
 * readable error otherwise. `message` replaces the default error text.
 */
export async function requireEngineerOrAdmin(
  ctx: Ctx,
  personId: Id<"people"> | null | undefined,
  message = "Check in as an Engineer to do this.",
): Promise<Doc<"people">> {
  if (!personId) throw new ConvexError(message)
  const person = await ctx.db.get(personId)
  if (!person || !isEngineerOrAdmin(person)) throw new ConvexError(message)
  return person
}
