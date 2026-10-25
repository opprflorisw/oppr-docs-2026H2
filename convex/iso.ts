import { query } from "./_generated/server"
import { requireUser } from "./lib/auth"
import { isPublished } from "./lib/published"

const CAP = 2000

// Evidence counts for the ISO 9001 page. Read-only and bounded: each table is
// read up to CAP rows, and `capped` says when a number is a lower bound.
export const evidence = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const now = Date.now()
    let capped = false
    const take = async <T>(rows: Promise<T[]>) => {
      const r = await rows
      if (r.length >= CAP) capped = true
      return r
    }

    const docs = await take(ctx.db.query("documents").take(CAP))
    const published = docs.filter(isPublished)
    const trainings = await take(ctx.db.query("trainings").take(CAP))
    const records = await take(ctx.db.query("trainingRecords").take(CAP))
    const levels = await take(ctx.db.query("skillLevels").take(CAP))
    const assignments = await take(ctx.db.query("trainingAssignments").take(CAP))
    const handedIn = await take(
      ctx.db
        .query("captures")
        .withIndex("by_status", (q) => q.eq("status", "ready"))
        .take(CAP),
    )

    return {
      capped,
      documents: {
        published: published.length,
        wrappedPublished: published.filter((d) => d.origin === "wrapped").length,
        withReviewDate: published.filter((d) => d.nextReviewAt != null).length,
        reviewsOverdue: published.filter((d) => d.nextReviewAt != null && d.nextReviewAt < now).length,
        awaitingSignoff: docs.filter((d) => d.status === "in_review" || d.status === "approved").length,
        withdrawn: docs.filter((d) => d.status === "archived").length,
      },
      trainings: {
        published: trainings.filter((t) => t.liveVersion != null && t.status !== "archived" && !t.isPractice).length,
        needsReview: trainings.filter((t) => t.needsReview && t.status !== "archived").length,
      },
      people: {
        trainingRecords: records.length,
        signedOff: levels.filter((l) => l.source === "signoff" && l.level >= 2).length,
        retrainNeeded: levels.filter((l) => l.retrainNeeded).length,
        expired: levels.filter((l) => l.expiresAt != null && l.expiresAt < now && l.level > 0).length,
        assignmentsOverdue: assignments.filter((a) => a.status === "open" && a.dueAt < now).length,
      },
      capturesProcessed: handedIn.length,
    }
  },
})
