// Floor simulator (CONTEXT.md: Floor simulator, Scan, Round).
//
// Reads for the page that stands in for being in the field: every Asset with
// what a Scan would show there (its Published Documents only) and how many
// live Rounds stop at it, and the live Rounds a checked-in person can walk.
// Read-only; the Round itself runs on convex/attempts.ts.
//
// ADR 0001: Assets are a shared registry. This module only reads the asset
// rows to count what hangs off them; it never writes them.
import { v } from "convex/values"
import { query, QueryCtx } from "./_generated/server"
import { Id } from "./_generated/dataModel"
import { requireUserId } from "./lib/auth"
import { isPublished } from "./lib/published"
import { getVersion, isTrainingLive } from "./trainings"

type Ctx = QueryCtx

/** Every live Round (a published Training of kind "round"), with its stops in order. */
async function liveRounds(ctx: Ctx) {
  const trainings = await ctx.db.query("trainings").take(500)
  const rounds = []
  for (const t of trainings) {
    if (t.kind !== "round" || !isTrainingLive(t) || t.isPractice) continue
    const row = await getVersion(ctx, t._id, t.liveVersion!)
    if (!row) continue
    const stops = []
    for (const s of row.stops) {
      const asset = await ctx.db.get(s.assetId)
      stops.push({ assetId: s.assetId, code: asset?.code ?? "?", name: asset?.name ?? "Deleted Asset" })
    }
    rounds.push({
      _id: t._id,
      code: t.code,
      title: t.title,
      area: t.area,
      version: t.liveVersion!,
      purpose: row.purpose,
      passMark: row.passMark,
      objectives: row.objectives.length,
      stops,
      needsReview: t.needsReview,
    })
  }
  return rounds.sort((a, b) => a.code.localeCompare(b.code))
}

export const plan = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx)
    const assets = await ctx.db.query("assets").take(200)
    assets.sort((a, b) => a.code.localeCompare(b.code))

    const roundsAt = new Map<string, number>()
    for (const r of await liveRounds(ctx)) {
      const ids: string[] = []
      for (const s of r.stops) if (!ids.includes(s.assetId)) ids.push(s.assetId)
      for (const id of ids) roundsAt.set(id, (roundsAt.get(id) ?? 0) + 1)
    }

    const out = []
    for (const a of assets) {
      const links = await ctx.db
        .query("documentAssets")
        .withIndex("by_assetId", (q) => q.eq("assetId", a._id))
        .take(200)
      const seen = new Set<Id<"documents">>()
      let publishedDocs = 0
      for (const l of links) {
        if (seen.has(l.documentId)) continue
        seen.add(l.documentId)
        const d = await ctx.db.get(l.documentId)
        if (d && isPublished(d)) publishedDocs += 1
      }
      out.push({
        _id: a._id,
        code: a.code,
        name: a.name,
        site: a.site,
        location: a.location,
        description: a.description,
        qrToken: a.qrToken,
        imageUrl: a.imageStorageId ? await ctx.storage.getUrl(a.imageStorageId) : null,
        publishedDocs,
        rounds: roundsAt.get(String(a._id)) ?? 0,
      })
    }
    return out
  },
})

/**
 * The live Rounds (practice Trainings left out), and for a checked-in person
 * where they stand on each: an open Attempt to continue, and when they last
 * passed it. Split into forYou (a Round that proves a Skill of the person's
 * profiles, or one in their area) and other. Without a person every Round
 * is forYou.
 */
export const rounds = query({
  args: { personId: v.optional(v.union(v.id("people"), v.null())) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const list = await liveRounds(ctx)
    const person = args.personId ? await ctx.db.get(args.personId) : null
    const mine = person
      ? await ctx.db
          .query("trainingAttempts")
          .withIndex("by_personId", (q) => q.eq("personId", person._id))
          .order("desc")
          .take(300)
      : []
    // Skills the person is measured against, through their profiles.
    const targetSkills = new Set<string>()
    if (person) {
      for (const id of person.profileIds ?? []) {
        const p = await ctx.db.get(id)
        for (const t of p?.targets ?? []) targetSkills.add(String(t.skillId))
      }
    }
    const skills = await ctx.db.query("skills").take(500)
    const rows = list.map((r) => {
      const open = mine.find(
        (a) =>
          a.trainingId === r._id &&
          a.trainingVersion === r.version &&
          (a.status === "in_progress" || a.status === "generating" || a.status === "error"),
      )
      const passed = mine.find((a) => a.trainingId === r._id && a.status === "passed")
      const last = mine.find((a) => a.trainingId === r._id && (a.status === "passed" || a.status === "failed"))
      const proves = skills.filter((s) => s.trainingIds.includes(r._id))
      const forYou =
        !person ||
        proves.some((s) => targetSkills.has(String(s._id))) ||
        (person.area != null && r.area != null && person.area === r.area)
      return {
        ...r,
        forYou,
        proves: proves.map((s) => ({ _id: s._id, name: s.name })),
        open: open
          ? {
              _id: open._id,
              status: open.status,
              answered: open.questions.filter((q) => q.answerIndex !== null || q.answeredAt !== null).length,
              total: open.questions.length,
              currentStop: open.round?.currentStop ?? 0,
            }
          : null,
        lastPassedAt: passed?.finishedAt ?? null,
        last: last ? { status: last.status, score: last.score, at: last.finishedAt ?? last.startedAt } : null,
      }
    })
    return { forYou: rows.filter((r) => r.forYou), other: rows.filter((r) => !r.forYou) }
  },
})
