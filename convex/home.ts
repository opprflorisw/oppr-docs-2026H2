import { query } from "./_generated/server"
import { requireUser } from "./lib/auth"
import { isPublished } from "./lib/published"

const DAY = 24 * 60 * 60 * 1000
// A periodic review shows up in the inbox this long before it is due.
export const REVIEW_WINDOW_DAYS = 30

// Home for an Engineer: what needs a decision today, plus a small Knowledge
// health snapshot. Every inbox item carries one obvious next action.
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const now = Date.now()
    const docs = await ctx.db.query("documents").take(2000)
    const wikis = await ctx.db.query("wikis").take(500)

    const approvals = docs
      .filter((d) => d.status === "in_review" || d.status === "approved")
      .map((d) => ({
        _id: d._id,
        namingCode: d.namingCode,
        title: d.title,
        version: d.currentVersion,
        status: d.status,
        isRevision: d.liveVersion != null,
        updatedAt: d.updatedAt,
      }))
      .sort((a, b) => a.updatedAt - b.updatedAt)

    const reviews = docs
      .filter(
        (d) =>
          isPublished(d) &&
          d.nextReviewAt != null &&
          d.nextReviewAt <= now + REVIEW_WINDOW_DAYS * DAY,
      )
      .map((d) => ({
        _id: d._id,
        namingCode: d.namingCode,
        title: d.title,
        version: d.liveVersion as number,
        nextReviewAt: d.nextReviewAt as number,
        daysLeft: Math.ceil(((d.nextReviewAt as number) - now) / DAY),
        // A newer edition already in progress counts as the review underway.
        revisionInProgress: d.currentVersion !== d.liveVersion,
      }))
      .sort((a, b) => a.nextReviewAt - b.nextReviewAt)

    const published = docs.filter(isPublished)
    return {
      approvals,
      reviews,
      health: {
        published: published.length,
        inProgress: docs.filter(
          (d) => d.status !== "archived" && d.status !== "pre_draft" && d.currentVersion !== d.liveVersion,
        ).length,
        reviewDue: reviews.length,
        overdue: reviews.filter((r) => r.daysLeft < 0).length,
        archived: docs.filter((d) => d.status === "archived").length,
        wikis: wikis.length,
      },
    }
  },
})
