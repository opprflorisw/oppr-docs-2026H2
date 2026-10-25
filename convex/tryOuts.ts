// Try-outs (TWI Job Instruction step 3: the person does the job while a
// trainer watches). After passing a Training, the trainee asks a trainer for
// a try-out. The trainer ticks a checklist built from the breakdown (each
// step, each key point, "Explained the reason"), adds a note and optionally a
// photo and the Asset, and signs as the checked-in person.
//
// Who may sign: never the trainee; an Engineer, or someone at level 3
// ("Can teach it") on a Skill the Training proves. All OK raises the linked
// Skills to level 2 ("Can do it") with the evidence on the skillEvent. Any
// Coach keeps the level as it is and the trainee asks again when ready.
//
// A "walkthrough" request (after two not-passed Attempts) uses the same
// table: the trainee asks for help at the line; signing it only closes it.
import { ConvexError, v } from "convex/values"
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server"
import { Doc, Id } from "./_generated/dataModel"
import { requireUserId } from "./lib/auth"
import { getVersion } from "./trainings"
import { addMonths, effectiveLevel } from "./skills"
import { isEngineerOrAdmin } from "./lib/roles"

type Ctx = QueryCtx | MutationCtx

/** Skills that prove this Training: explicit links only (skills.trainingIds). */
export async function skillsForTraining(ctx: Ctx, trainingId: Id<"trainings">) {
  const skills = await ctx.db.query("skills").take(500)
  return skills.filter((s) => s.trainingIds.includes(trainingId))
}

/** The try-out checklist: breakdown, else the version's own checklist, else the objectives. */
export function checklistOf(row: Doc<"trainingVersions">): string[] {
  if (row.breakdown && row.breakdown.length > 0) {
    const out: string[] = []
    for (const b of row.breakdown) {
      out.push(b.step)
      for (const k of b.keyPoints) out.push(k)
    }
    out.push("Explained the reason for each key point")
    return out
  }
  if (row.tryOut && row.tryOut.checklist.length > 0) return row.tryOut.checklist
  return row.objectives.map((o) => o.text)
}

async function levelOf(ctx: Ctx, personId: Id<"people">, skillId: Id<"skills">) {
  return await ctx.db
    .query("skillLevels")
    .withIndex("by_personId_and_skillId", (q) => q.eq("personId", personId).eq("skillId", skillId))
    .unique()
}

/** May this person sign a try-out of these Skills? Returns why not, or null. */
async function whyCannotSign(ctx: Ctx, signer: Doc<"people">, traineeId: Id<"people">, skillIds: Id<"skills">[]) {
  if (signer._id === traineeId) return "You cannot sign your own try-out. Ask a trainer or an Engineer."
  if (isEngineerOrAdmin(signer)) return null
  const now = Date.now()
  for (const id of skillIds) {
    if (effectiveLevel(await levelOf(ctx, signer._id, id), now) >= 3) return null
  }
  return "Only someone at level 3 (Can teach it) on this Skill, or an Engineer, can sign this try-out."
}

/** Trainers for a Training: people at level 3 on a linked Skill first, then Engineers. */
async function trainersFor(ctx: Ctx, skillIds: Id<"skills">[], traineeId: Id<"people">) {
  const now = Date.now()
  const out: { _id: Id<"people">; name: string; role: string; kind: Doc<"people">["kind"]; level3: boolean }[] = []
  for (const p of await ctx.db.query("people").take(500)) {
    if (p._id === traineeId || p.archived) continue
    let level3 = false
    for (const id of skillIds) if (effectiveLevel(await levelOf(ctx, p._id, id), now) >= 3) level3 = true
    if (level3 || isEngineerOrAdmin(p)) out.push({ _id: p._id, name: p.name, role: p.role, kind: p.kind, level3 })
  }
  return out.sort((a, b) => Number(b.level3) - Number(a.level3) || Number(a.kind !== "operator") - Number(b.kind !== "operator") || a.name.localeCompare(b.name))
}

// ---- Mutations ----------------------------------------------------------------

/**
 * The trainee asks for a try-out after passing (kind "tryout", the default),
 * or for a walk-through at the line after failing (kind "walkthrough").
 * trainerId null leaves it to any qualified trainer or Engineer.
 */
export const request = mutation({
  args: {
    attemptId: v.id("trainingAttempts"),
    trainerId: v.union(v.id("people"), v.null()),
    personId: v.id("people"),
    kind: v.optional(v.union(v.literal("tryout"), v.literal("walkthrough"))),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const a = await ctx.db.get(args.attemptId)
    if (!a) throw new ConvexError("This Attempt no longer exists.")
    if (a.personId !== args.personId) throw new ConvexError("Only the person who did the Training can ask for this.")
    const kind = args.kind ?? "tryout"
    if (kind === "tryout" && a.status !== "passed") throw new ConvexError("Pass the Training first, then ask for a try-out.")
    const skills = await skillsForTraining(ctx, a.trainingId)
    if (args.trainerId) {
      const trainer = await ctx.db.get(args.trainerId)
      if (!trainer) throw new ConvexError("This trainer no longer exists.")
      if (kind === "tryout") {
        const why = await whyCannotSign(ctx, trainer, a.personId, skills.map((s) => s._id))
        if (why) throw new ConvexError(`${trainer.name} cannot sign this try-out. ${why}`)
      } else if (trainer._id === a.personId) throw new ConvexError("Pick someone else to walk you through it.")
    }
    const existing = (
      await ctx.db
        .query("tryOutRequests")
        .withIndex("by_personId", (q) => q.eq("personId", a.personId))
        .take(200)
    ).find((r) => r.trainingId === a.trainingId && r.status === "open" && (r.kind ?? "tryout") === kind)
    if (existing) {
      await ctx.db.patch(existing._id, { trainerId: args.trainerId, attemptId: a._id })
      return existing._id
    }
    return await ctx.db.insert("tryOutRequests", {
      personId: a.personId,
      trainingId: a.trainingId,
      trainingVersion: a.trainingVersion,
      attemptId: a._id,
      skillIds: skills.map((s) => s._id),
      trainerId: args.trainerId,
      status: "open",
      createdAt: Date.now(),
      doneAt: null,
      kind,
    })
  },
})

/** The trainee takes back an open request. */
export const cancel = mutation({
  args: { requestId: v.id("tryOutRequests"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const r = await ctx.db.get(args.requestId)
    if (!r || r.status !== "open") return
    const p = await ctx.db.get(args.personId)
    if (r.personId !== args.personId && !isEngineerOrAdmin(p))
      throw new ConvexError("Only the trainee or an Engineer can cancel this request.")
    await ctx.db.patch(r._id, { status: "cancelled", doneAt: Date.now() })
  },
})

const itemValidator = v.object({
  label: v.string(),
  result: v.union(v.literal("ok"), v.literal("coach")),
  note: v.optional(v.string()),
})

/**
 * The trainer signs the try-out. result "passed" needs every item OK; it
 * raises the linked Skills to level 2 with evidence. "again" keeps the level
 * and the trainee sees the coach notes.
 */
export const sign = mutation({
  args: {
    requestId: v.id("tryOutRequests"),
    items: v.array(itemValidator),
    note: v.optional(v.string()),
    assetId: v.optional(v.union(v.id("assets"), v.null())),
    photoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    result: v.optional(v.union(v.literal("passed"), v.literal("again"))),
    personId: v.id("people"),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const r = await ctx.db.get(args.requestId)
    if (!r) throw new ConvexError("This request no longer exists.")
    if (r.status !== "open") throw new ConvexError("This request is already closed.")
    const signer = await ctx.db.get(args.personId)
    if (!signer) throw new ConvexError("Check in first: a try-out is signed by a named person.")
    const now = Date.now()
    const note = args.note?.trim() || undefined

    if ((r.kind ?? "tryout") === "walkthrough") {
      if (signer._id === r.personId) throw new ConvexError("Someone else marks the walk-through as done.")
      await ctx.db.patch(r._id, { status: "done", doneAt: now, trainerId: r.trainerId ?? signer._id })
      return { result: "done" as const, raised: 0 }
    }

    const why = await whyCannotSign(ctx, signer, r.personId, r.skillIds)
    if (why) throw new ConvexError(why)
    if (args.items.length === 0) throw new ConvexError("Tick each item of the checklist first.")
    const allOk = args.items.every((i) => i.result === "ok")
    const result = args.result ?? (allOk ? "passed" : "again")
    if (result === "passed" && !allOk) throw new ConvexError("Every item must be OK to pass. Mark it Coach to try again later.")
    if (result === "again" && !note && !args.items.some((i) => i.note?.trim()))
      throw new ConvexError("Write what to practise, so the trainee knows what to work on.")

    const items = args.items.map((i) => ({ label: i.label.trim(), result: i.result, note: i.note?.trim() || undefined }))
    let trainerLevel = isEngineerOrAdmin(signer) ? 3 : 0
    for (const id of r.skillIds) trainerLevel = Math.max(trainerLevel, effectiveLevel(await levelOf(ctx, signer._id, id), now))
    const attempt = r.attemptId ? await ctx.db.get(r.attemptId) : null
    if (attempt) {
      await ctx.db.patch(attempt._id, {
        tryOut: {
          result,
          signedBy: signer._id,
          at: now,
          checked: items.filter((i) => i.result === "ok").map((i) => i.label),
          note,
          items,
          assetId: args.assetId ?? undefined,
          photoStorageId: args.photoStorageId ?? undefined,
          trainerLevel,
        },
      })
    }
    await ctx.db.patch(r._id, { status: "done", doneAt: now, result, trainerId: signer._id })

    let raised = 0
    if (result === "passed") {
      const t = await ctx.db.get(r.trainingId)
      const row = await getVersion(ctx, r.trainingId, r.trainingVersion)
      const src = row?.objectives[0]
      const evidence = {
        documentId: src?.documentId,
        namingCode: src?.namingCode,
        documentVersion: src?.documentVersion,
        assetId: args.assetId ?? undefined,
        note,
        checked: items.map((i) => i.label),
      }
      for (const skillId of r.skillIds) {
        const skill = await ctx.db.get(skillId)
        if (!skill) continue
        const lvl = await levelOf(ctx, r.personId, skillId)
        const eff = effectiveLevel(lvl, now)
        const expiresAt = skill.validityMonths ? addMonths(now, skill.validityMonths) : null
        if (eff >= 2 && !lvl?.retrainNeeded) continue
        const target = Math.max(2, eff)
        const fields = {
          level: target,
          source: "signoff" as const,
          signedOffBy: signer._id,
          achievedAt: now,
          expiresAt,
          retrainNeeded: false,
          retrainReason: null,
          retrainDueAt: undefined,
        }
        if (lvl) await ctx.db.patch(lvl._id, fields)
        else await ctx.db.insert("skillLevels", { personId: r.personId, skillId, recordId: null, ...fields })
        await ctx.db.insert("skillEvents", {
          personId: r.personId,
          skillId,
          fromLevel: eff,
          toLevel: target,
          reason: `Try-out of ${t?.code ?? "the Training"} v${r.trainingVersion} signed by ${signer.name}`,
          byPersonId: signer._id,
          at: now,
          evidence,
        })
        raised++
      }
    }
    return { result, raised }
  },
})

// ---- Queries ------------------------------------------------------------------

async function requestView(ctx: QueryCtx, r: Doc<"tryOutRequests">) {
  const [trainee, trainer, t] = await Promise.all([
    ctx.db.get(r.personId),
    r.trainerId ? ctx.db.get(r.trainerId) : null,
    ctx.db.get(r.trainingId),
  ])
  return {
    _id: r._id,
    kind: r.kind ?? "tryout",
    status: r.status,
    result: r.result ?? null,
    createdAt: r.createdAt,
    doneAt: r.doneAt,
    attemptId: r.attemptId,
    personId: r.personId,
    personName: trainee?.name ?? "Unknown person",
    trainerId: r.trainerId,
    trainerName: trainer?.name ?? null,
    trainingId: r.trainingId,
    trainingCode: t?.code ?? "?",
    trainingTitle: t?.title ?? "Deleted Training",
    trainingVersion: r.trainingVersion,
  }
}

/**
 * Open requests this person can act on: addressed to them, or open to anyone
 * when they are an Engineer or level 3 on a linked Skill. Newest first.
 */
export const inbox = query({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const me = await ctx.db.get(args.personId)
    if (!me) return []
    const out = []
    const mine = await ctx.db
      .query("tryOutRequests")
      .withIndex("by_trainerId", (q) => q.eq("trainerId", args.personId))
      .take(200)
    const open = await ctx.db
      .query("tryOutRequests")
      .withIndex("by_trainerId", (q) => q.eq("trainerId", null))
      .take(200)
    for (const r of [...mine, ...open]) {
      if (r.status !== "open" || r.personId === me._id) continue
      if (r.trainerId === null && (r.kind ?? "tryout") === "tryout" && (await whyCannotSign(ctx, me, r.personId, r.skillIds)))
        continue
      if (r.trainerId === null && (r.kind ?? "tryout") === "walkthrough" && !isEngineerOrAdmin(me)) continue
      out.push(await requestView(ctx, r))
    }
    return out.sort((a, b) => b.createdAt - a.createdAt)
  },
})

/** The trainee's own requests (open and recent), for "Waiting for Sanne since Tue". */
export const mine = query({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const rows = await ctx.db
      .query("tryOutRequests")
      .withIndex("by_personId", (q) => q.eq("personId", args.personId))
      .order("desc")
      .take(50)
    const out = []
    for (const r of rows) if (r.status !== "cancelled") out.push(await requestView(ctx, r))
    return out
  },
})

/** Trainers who may sign a try-out of this Training for this trainee. */
export const trainers = query({
  args: { trainingId: v.id("trainings"), personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const skills = await skillsForTraining(ctx, args.trainingId)
    return await trainersFor(ctx, skills.map((s) => s._id), args.personId)
  },
})

/** One request with everything the trainer needs on the phone: the checklist, the Asset, the Skills. */
export const get = query({
  args: { requestId: v.id("tryOutRequests") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const r = await ctx.db.get(args.requestId)
    if (!r) return null
    const base = await requestView(ctx, r)
    const row = await getVersion(ctx, r.trainingId, r.trainingVersion)
    const skills = []
    for (const id of r.skillIds) {
      const s = await ctx.db.get(id)
      if (s) skills.push({ _id: s._id, name: s.name })
    }
    // The Asset where it is usually done: a Round's first stop, else an Asset of the first source document.
    let asset: { _id: Id<"assets">; code: string; name: string } | null = null
    const stopAsset = row?.stops[0]?.assetId
    const docId = row?.objectives[0]?.documentId
    const link = !stopAsset && docId
      ? await ctx.db.query("documentAssets").withIndex("by_documentId", (q) => q.eq("documentId", docId)).first()
      : null
    const assetId = stopAsset ?? link?.assetId
    if (assetId) {
      const a = await ctx.db.get(assetId)
      if (a) asset = { _id: a._id, code: a.code, name: a.name }
    }
    const attempt = r.attemptId ? await ctx.db.get(r.attemptId) : null
    const tryOut = attempt?.tryOut
    const signer = tryOut ? await ctx.db.get(tryOut.signedBy) : null
    return {
      ...base,
      purpose: row?.purpose ?? "",
      breakdown: (row?.breakdown ?? []).map((b) => ({
        id: b.id,
        step: b.step,
        keyPoints: b.keyPoints,
        keyPointKinds: b.keyPointKinds ?? [],
        reasons: b.reasons,
      })),
      checklist: row ? checklistOf(row) : [],
      sources: Array.from(
        new Map((row?.objectives ?? []).map((o) => [String(o.documentId), { documentId: o.documentId, namingCode: o.namingCode, version: o.documentVersion }])).values(),
      ),
      skills,
      asset,
      tryOut: tryOut
        ? {
            ...tryOut,
            signedByName: signer?.name ?? null,
            photoUrl: tryOut.photoStorageId ? await ctx.storage.getUrl(tryOut.photoStorageId) : null,
          }
        : null,
      trainers: await trainersFor(ctx, r.skillIds, r.personId),
    }
  },
})
