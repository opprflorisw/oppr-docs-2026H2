// Who may see and change a Capture (docs/adr/0005, Privacy):
//   - While recording, a Capture is visible only to its author.
//   - After hand-in, its author and checked-in Engineers (people.kind) see it.
//   - Media can be deleted by the author or by an Engineer.
// Every function takes the checked-in personId, like Attempts do.
import { ConvexError } from "convex/values"
import { MutationCtx, QueryCtx } from "../_generated/server"
import { Doc, Id } from "../_generated/dataModel"

type Ctx = QueryCtx | MutationCtx

export async function requirePerson(ctx: Ctx, personId: Id<"people">): Promise<Doc<"people">> {
  const person = await ctx.db.get(personId)
  if (!person) throw new ConvexError("Check in first: a Capture needs to know who you are.")
  return person
}

export async function requireEngineerPerson(ctx: Ctx, personId: Id<"people">): Promise<Doc<"people">> {
  const person = await requirePerson(ctx, personId)
  if (person.kind !== "engineer") throw new ConvexError("Check in as an Engineer to do this.")
  return person
}

export const isEngineer = (p: Doc<"people"> | null | undefined) => p?.kind === "engineer"

/** True when `person` may read `capture`. */
export function canSee(capture: Doc<"captures">, person: Doc<"people">): boolean {
  if (capture.authorId === person._id) return true
  return capture.status !== "recording" && isEngineer(person)
}

/** The Capture, when it exists and the person may read it; otherwise null. */
export async function visibleCapture(
  ctx: Ctx,
  captureId: Id<"captures">,
  person: Doc<"people">,
): Promise<Doc<"captures"> | null> {
  const c = await ctx.db.get(captureId)
  if (!c || !canSee(c, person)) return null
  return c
}

/** Same as visibleCapture, but throws a readable error for mutations. */
export async function loadVisible(ctx: Ctx, captureId: Id<"captures">, person: Doc<"people">) {
  const c = await ctx.db.get(captureId)
  if (!c) throw new ConvexError("This Capture no longer exists.")
  if (!canSee(c, person)) {
    throw new ConvexError(
      c.status === "recording"
        ? "This Capture is still being recorded. Only its author can see it until it is handed in."
        : "Only the author and Engineers can see a handed-in Capture.",
    )
  }
  return c
}

export async function loadOwnRecording(ctx: Ctx, captureId: Id<"captures">, personId: Id<"people">) {
  await requirePerson(ctx, personId)
  const c = await ctx.db.get(captureId)
  if (!c) throw new ConvexError("This Capture no longer exists.")
  if (c.authorId !== personId) {
    const owner = await ctx.db.get(c.authorId)
    throw new ConvexError(`This Capture belongs to ${owner?.name ?? "someone else"}. Check in as them to continue.`)
  }
  if (c.status !== "recording") throw new ConvexError("This Capture is already handed in.")
  return c
}

/** "Start-up of line 2 after a stop" and "start-up of Line 2 after a stop." group together. */
export function jobKey(job: string | undefined | null): string {
  return (job ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

/** Recorded time in ms, with paused stretches left out. */
export function recordedMs(c: Doc<"captures">, now = Date.now()): number {
  const end = c.pausedAt ?? c.endedAt ?? now
  return Math.max(0, end - c.startedAt - (c.pausedMs ?? 0))
}
