// Document insights and Knowledge health (CONTEXT.md: Document insights,
// Knowledge health, Usage). Reads the append-only signals (askEvents,
// usageEvents, contentFlags), open Findings and Proposed revisions. Knowledge
// health looks at Published Documents only: the goal is a smaller, better
// library, not a bigger one.
import { v } from "convex/values"
import { internalMutation, internalQuery, mutation, query, QueryCtx } from "./_generated/server"
import { Doc, Id } from "./_generated/dataModel"
import { requireUser } from "./lib/auth"
import { isPublished } from "./lib/published"
import { proposalBlocker } from "./revisions"

const DAY = 24 * 60 * 60 * 1000
export const WINDOW_DAYS = 90
const REVIEW_WINDOW_DAYS = 30
// "Asked but unclear": at least this many questions with this share unanswered,
// or this many "unclear or wrong" marks.
const UNCLEAR_MIN_QUESTIONS = 3
const UNCLEAR_RATE = 0.25
const UNCLEAR_MIN_FLAGS = 2

// ---- Question grouping --------------------------------------------------------

const STOP = new Set(
  (
    "a an the is are was were be do does did i we you it to of in on for at by with and or " +
    "what which how when where who why can should must may long often much many there this that " +
    "my our your me us need have has after before from into about"
  ).split(" "),
)

/** A rough key so "How long do I purge?" and "how long to purge" group together. */
export function questionKey(q: string): string {
  const words = q
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 4 ? w.slice(0, 5) : w))
  return Array.from(new Set(words)).sort().join(" ") || q.trim().toLowerCase()
}

export interface QuestionGroup {
  question: string
  count: number
  lastAt: number
  unanswered: number
  /** The latest time it was asked, the answer was not in the document. */
  latestUnanswered: boolean
}

function groupQuestions(asks: Doc<"askEvents">[]): QuestionGroup[] {
  const byKey = new Map<string, QuestionGroup>()
  for (const a of [...asks].sort((x, y) => y.at - x.at)) {
    const k = questionKey(a.question)
    const g = byKey.get(k)
    if (g) {
      g.count++
      if (!a.answerFound) g.unanswered++
    } else {
      byKey.set(k, {
        question: a.question.trim(),
        count: 1,
        lastAt: a.at,
        unanswered: a.answerFound ? 0 : 1,
        latestUnanswered: !a.answerFound,
      })
    }
  }
  return Array.from(byKey.values()) // most recent first
}

// ---- Document insights --------------------------------------------------------

async function openFindingsFor(ctx: QueryCtx, documentId: Id<"documents">) {
  const a = await ctx.db
    .query("findings")
    .withIndex("by_documentA_and_status", (q) => q.eq("documentA", documentId).eq("status", "open"))
    .take(50)
  const b = await ctx.db
    .query("findings")
    .withIndex("by_documentB_and_status", (q) => q.eq("documentB", documentId).eq("status", "open"))
    .take(50)
  return [...a, ...b]
}

/** Signals for one Document over the last 90 days. */
export const documentInsights = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const doc = await ctx.db.get(args.documentId)
    if (!doc) return null
    const now = Date.now()
    const since = now - WINDOW_DAYS * DAY

    const asks = (
      await ctx.db
        .query("askEvents")
        .withIndex("by_primaryDocumentId", (q) => q.eq("primaryDocumentId", doc._id))
        .order("desc")
        .take(1000)
    ).filter((a) => a.at >= since)
    const usage = (
      await ctx.db
        .query("usageEvents")
        .withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
        .order("desc")
        .take(2000)
    ).filter((u) => u.at >= since)
    const views = usage.filter((u) => u.kind === "view")
    // A Scan of a linked Asset lists this Document on the phone.
    const links = await ctx.db
      .query("documentAssets")
      .withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
      .take(20)
    let scans = 0
    for (const l of links) {
      const rows = await ctx.db
        .query("usageEvents")
        .withIndex("by_assetId", (q) => q.eq("assetId", l.assetId))
        .order("desc")
        .take(500)
      scans += rows.filter((u) => u.kind === "scan" && u.at >= since).length
    }
    const flags = (
      await ctx.db
        .query("contentFlags")
        .withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
        .order("desc")
        .take(500)
    ).filter((f) => f.at >= since)

    const groups = groupQuestions(asks)
    // The newest finished report stays on screen while a refresh runs or
    // after a refresh fails; `refresh` says what the newest attempt did.
    const reports = await ctx.db
      .query("insightReports")
      .withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
      .order("desc")
      .take(5)
    const report = reports.find((r) => r.state === "ready") ?? null
    const newest = reports[0] ?? null
    const refresh =
      newest && newest.state !== "ready" ? { state: newest.state, error: newest.error } : null
    const findings = await openFindingsFor(ctx, doc._id)

    // 13 weekly buckets, oldest first, for a small trend.
    const weeks = Array.from({ length: 13 }, () => ({ views: 0, questions: 0 }))
    const bucket = (at: number) => 12 - Math.min(12, Math.floor((now - at) / (7 * DAY)))
    for (const u of views) weeks[bucket(u.at)].views++
    for (const a of asks) weeks[bucket(a.at)].questions++

    return {
      documentId: doc._id,
      namingCode: doc.namingCode,
      published: isPublished(doc),
      // Why "Prepare a revision" is not possible now, or null.
      proposeBlocker: proposalBlocker(doc),
      windowDays: WINDOW_DAYS,
      counts: {
        views: views.length,
        scans,
        questions: asks.length,
        unanswered: asks.filter((a) => !a.answerFound).length,
        flags: flags.length,
        people: new Set(asks.map((a) => a.personId).filter(Boolean)).size,
        anonymous: asks.filter((a) => a.personId == null).length,
      },
      weeks,
      questions: groups.slice(0, 30),
      unansweredQuestions: groups.filter((g) => g.unanswered > 0).slice(0, 30),
      flags: flags.slice(0, 20).map((f) => ({ _id: f._id, note: f.note, at: f.at, source: f.source })),
      report: report
        ? {
            _id: report._id,
            state: report.state,
            version: report.version,
            themes: report.themes,
            questionCount: report.questionCount,
            unansweredCount: report.unansweredCount,
            flagCount: report.flagCount,
            generatedAt: report.generatedAt,
            error: report.error,
            // New questions since the report was made.
            newSince:
              report.generatedAt == null ? 0 : asks.filter((a) => a.at > (report.generatedAt as number)).length,
          }
        : null,
      refresh,
      openFindings: findings.length,
    }
  },
})

// ---- Knowledge health -----------------------------------------------------------

type Action =
  | { kind: "open"; label: string; href: string }
  | { kind: "propose"; label: string; documentId: Id<"documents">; source: "insight" | "health" | "finding"; findingId?: Id<"findings"> }

export interface HealthItem {
  documentId: Id<"documents">
  namingCode: string
  title: string
  reason: string
  action: Action
  /** Secondary link, e.g. the other document of a Finding. */
  related?: { documentId: Id<"documents">; namingCode: string; title: string }
  tone: "info" | "warn" | "danger"
}

interface DocSignals {
  views: number
  scans: number
  questions: number
  unanswered: number
  flags: number
  lastUsedAt: number | null
}

async function computeHealth(ctx: QueryCtx) {
  const now = Date.now()
  const since = now - WINDOW_DAYS * DAY
  // Reads are capped to stay within Convex limits; the newest events come
  // first, so a cap drops the oldest days of the window, never the newest.
  const docs = await ctx.db.query("documents").take(1000)
  const published = docs.filter(isPublished)
  const byId = new Map(docs.map((d) => [d._id, d]))

  const signals = new Map<Id<"documents">, DocSignals>()
  const sig = (id: Id<"documents">) => {
    let s = signals.get(id)
    if (!s) {
      s = { views: 0, scans: 0, questions: 0, unanswered: 0, flags: 0, lastUsedAt: null }
      signals.set(id, s)
    }
    return s
  }
  const touch = (s: DocSignals, at: number) => {
    if (s.lastUsedAt == null || at > s.lastUsedAt) s.lastUsedAt = at
  }

  const asks = await ctx.db
    .query("askEvents")
    .withIndex("by_at", (q) => q.gte("at", since))
    .order("desc")
    .take(3000)
  // Questions no Published document answered and none was cited for.
  const orphanAsks: Doc<"askEvents">[] = []
  for (const a of asks) {
    if (!a.primaryDocumentId) {
      if (!a.answerFound) orphanAsks.push(a)
      continue
    }
    const s = sig(a.primaryDocumentId)
    s.questions++
    if (!a.answerFound) s.unanswered++
    touch(s, a.at)
  }
  const usage = await ctx.db
    .query("usageEvents")
    .withIndex("by_at", (q) => q.gte("at", since))
    .order("desc")
    .take(5000)
  const links = await ctx.db.query("documentAssets").take(2000)
  const docsOfAsset = new Map<string, Id<"documents">[]>()
  for (const l of links) {
    const list = docsOfAsset.get(l.assetId) ?? []
    list.push(l.documentId)
    docsOfAsset.set(l.assetId, list)
  }
  for (const u of usage) {
    if (u.kind === "view" && u.documentId) {
      const s = sig(u.documentId)
      s.views++
      touch(s, u.at)
    } else if (u.kind === "scan" && u.assetId) {
      for (const d of docsOfAsset.get(u.assetId) ?? []) sig(d).scans++
    }
  }
  const flags = (await ctx.db.query("contentFlags").order("desc").take(1000)).filter((f) => f.at >= since)
  for (const f of flags) sig(f.documentId).flags++

  const openFindings = await ctx.db
    .query("findings")
    .withIndex("by_status", (q) => q.eq("status", "open"))
    .take(500)
  const findingCount = new Map<Id<"documents">, number>()
  for (const f of openFindings) {
    findingCount.set(f.documentA, (findingCount.get(f.documentA) ?? 0) + 1)
    findingCount.set(f.documentB, (findingCount.get(f.documentB) ?? 0) + 1)
  }

  const proposals = [
    ...(await ctx.db.query("proposedRevisions").withIndex("by_state", (q) => q.eq("state", "generating")).take(100)),
    ...(await ctx.db.query("proposedRevisions").withIndex("by_state", (q) => q.eq("state", "ready")).take(200)),
  ].filter((p) => {
    const d = byId.get(p.documentId)
    if (!d) return false
    if (p.state === "generating") return true
    // Ready and its draft is still the working edition (not yet Published).
    return p.draftVersion != null && d.currentVersion === p.draftVersion && d.liveVersion !== p.draftVersion
  })
  const proposalDocs = new Set(proposals.map((p) => p.documentId))

  const canPropose = (d: Doc<"documents">) =>
    d.status === "published" && d.origin !== "wrapped" && d.currentVersion === d.liveVersion

  const open = (d: Doc<"documents">, label = "Open"): Action => ({ kind: "open", label, href: `/docs/${d._id}` })
  const base = (d: Doc<"documents">) => ({ documentId: d._id, namingCode: d.namingCode, title: d.title })
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

  // Never used: nobody opened it or asked about it in 90 days.
  const neverUsed: HealthItem[] = []
  // Asked but unclear.
  const unclear: (HealthItem & { score: number })[] = []
  const table = []
  for (const d of published) {
    const s = signals.get(d._id) ?? { views: 0, scans: 0, questions: 0, unanswered: 0, flags: 0, lastUsedAt: null }
    if (s.views === 0 && s.questions === 0) {
      neverUsed.push({
        ...base(d),
        tone: "warn",
        reason:
          s.scans > 0
            ? `Nobody opened it or asked about it in ${WINDOW_DAYS} days, although its Assets were Scanned ${plural(s.scans, "time")}. Check whether it is still needed, or merge it into a document people do read.`
            : `Nobody opened it, Scanned its Assets or asked about it in ${WINDOW_DAYS} days. Check whether it is still needed; an unused document is a candidate for archiving.`,
        action: open(d, "Review for archiving"),
      })
    }
    const rate = s.questions > 0 ? s.unanswered / s.questions : 0
    const isUnclear =
      (s.questions >= UNCLEAR_MIN_QUESTIONS && rate >= UNCLEAR_RATE) || s.flags >= UNCLEAR_MIN_FLAGS
    if (isUnclear) {
      const parts: string[] = []
      if (s.unanswered > 0) parts.push(`${s.unanswered} of ${plural(s.questions, "question")} went unanswered`)
      else if (s.questions > 0) parts.push(`${plural(s.questions, "question")} asked`)
      if (s.flags > 0) parts.push(`${plural(s.flags, "mark")} as unclear or wrong`)
      const hasProposal = proposalDocs.has(d._id)
      unclear.push({
        ...base(d),
        tone: rate >= 0.5 || s.flags >= 4 ? "danger" : "warn",
        score: s.unanswered * 2 + s.flags * 2 + s.questions,
        reason: `${parts.join(", ")} in ${WINDOW_DAYS} days. People look for answers here that it does not give clearly.`,
        action: hasProposal
          ? open(d, "Open the Proposed revision")
          : canPropose(d)
            ? { kind: "propose", label: "Prepare a revision", documentId: d._id, source: "health" }
            : open(d),
      })
    }
    const nextReview = d.nextReviewAt ?? null
    table.push({
      ...base(d),
      type: d.type,
      origin: d.origin ?? "editor",
      version: d.liveVersion as number,
      ...s,
      openFindings: findingCount.get(d._id) ?? 0,
      reviewInDays: nextReview == null ? null : Math.ceil((nextReview - now) / DAY),
      hasProposal: proposalDocs.has(d._id),
      unclear: isUnclear,
      neverUsed: s.views === 0 && s.questions === 0,
    })
  }
  unclear.sort((a, b) => b.score - a.score)

  // Overlaps and contradictions: open Findings between Published documents.
  const findingItems = (kind: "duplicate" | "contradiction"): HealthItem[] =>
    openFindings
      .filter((f) => f.kind === kind)
      .sort((a, b) => b.detectedAt - a.detectedAt)
      .flatMap((f) => {
        const a = byId.get(f.documentA)
        const b = byId.get(f.documentB)
        if (!a || !b) return []
        // Revise the side that can be revised (never a Wrapped manual).
        const target = canPropose(a) ? a : canPropose(b) ? b : null
        const other = target === b ? a : b
        const proposed = f.proposedRevisionId != null
        return [
          {
            ...base(target ?? a),
            related: base(other),
            tone: kind === "contradiction" ? ("danger" as const) : ("warn" as const),
            reason: f.summary,
            action: proposed
              ? open(target ?? a, "Open the Proposed revision")
              : target
                ? ({ kind: "propose", label: "Prepare a revision", documentId: target._id, source: "finding", findingId: f._id } as Action)
                : ({ kind: "open", label: "Open the Finding", href: `/library/findings?f=${f._id}` } as Action),
          },
        ]
      })
  const overlaps = findingItems("duplicate")
  const contradictions = findingItems("contradiction")

  // Reviews due in the next 30 days or overdue.
  const reviewsDue: (HealthItem & { days: number })[] = published
    .filter((d) => d.nextReviewAt != null && d.nextReviewAt <= now + REVIEW_WINDOW_DAYS * DAY)
    .map((d) => {
      const days = Math.ceil(((d.nextReviewAt as number) - now) / DAY)
      const inProgress = d.currentVersion !== d.liveVersion
      return {
        ...base(d),
        days,
        tone: days < 0 ? ("danger" as const) : ("warn" as const),
        reason:
          (days < 0
            ? `Periodic review overdue by ${plural(-days, "day")}.`
            : days === 0
              ? "Periodic review due today."
              : `Periodic review due in ${plural(days, "day")}.`) +
          (inProgress ? ` A revision (v${d.currentVersion}) is already in progress.` : ""),
        action: { kind: "open" as const, label: "Check", href: `/docs/${d._id}?panel=review` },
      }
    })
    .sort((a, b) => a.days - b.days)

  const proposalItems: HealthItem[] = proposals
    .sort((a, b) => b.createdAt - a.createdAt)
    .flatMap((p) => {
      const d = byId.get(p.documentId)
      if (!d) return []
      const from =
        p.source.kind === "finding" ? "a Finding" : p.source.kind === "health" ? "Knowledge health" : "Document insights"
      return [
        {
          ...base(d),
          tone: "info" as const,
          reason:
            p.state === "generating"
              ? `Being prepared from ${from}.`
              : `${p.summary || "Proposed revision"} (from ${from}, ${plural(p.changes.length, "change")}, draft v${p.draftVersion}).`,
          action: { kind: "open" as const, label: p.state === "generating" ? "Open" : "Review the changes", href: `/docs/${d._id}` },
        },
      ]
    })

  const mostUsed = table
    .filter((r) => r.views + r.questions > 0)
    .sort((a, b) => b.views + b.questions * 3 - (a.views + a.questions * 3))
    .slice(0, 5)
    .map((r) => ({
      documentId: r.documentId,
      namingCode: r.namingCode,
      title: r.title,
      views: r.views,
      scans: r.scans,
      questions: r.questions,
    }))

  // Group the orphan questions; name the Asset they were asked at.
  const assetCodes = new Map<string, string>()
  const notInLibrary = []
  for (const g of groupQuestions(orphanAsks).slice(0, 15)) {
    const ev = orphanAsks.find((a) => a.question.trim() === g.question)
    let where: string | null = null
    let pending: { documentId: Id<"documents">; namingCode: string; status: string } | null = null
    if (ev?.scopeKind === "asset" && ev.scopeId) {
      if (!assetCodes.has(ev.scopeId)) {
        const asset = await ctx.db.get(ev.scopeId as Id<"assets">)
        assetCodes.set(ev.scopeId, asset ? `${asset.code} ${asset.name}` : "")
      }
      where = assetCodes.get(ev.scopeId) || null
      // A document for this Asset may exist that is not Published yet.
      const draft = links
        .filter((l) => l.assetId === ev.scopeId)
        .map((l) => byId.get(l.documentId))
        .find((d): d is Doc<"documents"> => d != null && !isPublished(d) && d.status !== "archived")
      if (draft) pending = { documentId: draft._id, namingCode: draft.namingCode, status: draft.status }
    }
    notInLibrary.push({ ...g, where, pending })
  }

  // The headline counts documents, not items: one document can be unused,
  // unclear, in a Finding and due for review at once. Every row in those
  // sections counts, so the headline matches what the page shows.
  const needsDecision = new Set<string>()
  for (const i of [...neverUsed, ...unclear, ...overlaps, ...contradictions, ...reviewsDue]) {
    needsDecision.add(i.documentId)
    if (i.related) needsDecision.add(i.related.documentId)
  }
  const publishedIds = new Set<string>(published.map((d) => d._id))

  const totalQuestions = asks.length
  const answered = asks.filter((a) => a.answerFound).length
  return {
    windowDays: WINDOW_DAYS,
    stats: {
      published: published.length,
      // Distinct Published documents with at least one decision to make.
      needsDecision: Array.from(needsDecision).filter((id) => publishedIds.has(id)).length,
      neverUsed: neverUsed.length,
      unclear: unclear.length,
      overlaps: overlaps.length,
      contradictions: contradictions.length,
      reviewsDue: reviewsDue.length,
      overdue: reviewsDue.filter((r) => r.days < 0).length,
      proposals: proposalItems.length,
      questions: totalQuestions,
      notInLibrary: orphanAsks.length,
      answeredRate: totalQuestions > 0 ? answered / totalQuestions : null,
      views: usage.filter((u) => u.kind === "view").length,
      scans: usage.filter((u) => u.kind === "scan").length,
    },
    neverUsed,
    unclear: unclear.map(({ score: _score, ...rest }) => rest),
    overlaps,
    contradictions,
    reviewsDue: reviewsDue.map(({ days: _days, ...rest }) => rest),
    proposals: proposalItems,
    mostUsed,
    notInLibrary,
    table: table.sort((a, b) => a.namingCode.localeCompare(b.namingCode)),
  }
}

/** Library-wide Knowledge health over the last 90 days (Published only). */
export const health = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    return await computeHealth(ctx)
  },
})

/** Three small numbers for the Home aside. */
export const homeStats = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const h = await computeHealth(ctx)
    return {
      neverUsed: h.stats.neverUsed,
      unclear: h.stats.unclear,
      openFindings: h.stats.overlaps + h.stats.contradictions,
      proposals: h.stats.proposals,
      questions: h.stats.questions,
      answeredRate: h.stats.answeredRate,
    }
  },
})

// ---- Insight reports (ai/insights.ts writes them) -------------------------------

/** Inserts a "generating" report row, unless one is already running. */
export const startReport = internalMutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args): Promise<{ reportId: Id<"insightReports">; started: boolean } | null> => {
    const doc = await ctx.db.get(args.documentId)
    if (!doc) return null
    const latest = await ctx.db
      .query("insightReports")
      .withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
      .order("desc")
      .first()
    if (latest && latest.state === "generating" && Date.now() - latest._creationTime < 5 * 60 * 1000) {
      return { reportId: latest._id, started: false }
    }
    const reportId = await ctx.db.insert("insightReports", {
      documentId: doc._id,
      version: doc.liveVersion ?? doc.currentVersion,
      state: "generating",
      questionCount: 0,
      unansweredCount: 0,
      flagCount: 0,
      themes: [],
      generatedAt: null,
      error: null,
    })
    return { reportId, started: true }
  },
})

/** The questions and marks a report is built from (last 90 days). */
export const loadForReport = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId)
    if (!doc) return null
    const since = Date.now() - WINDOW_DAYS * DAY
    const asks = (
      await ctx.db
        .query("askEvents")
        .withIndex("by_primaryDocumentId", (q) => q.eq("primaryDocumentId", doc._id))
        .order("desc")
        .take(400)
    ).filter((a) => a.at >= since)
    const flags = (
      await ctx.db
        .query("contentFlags")
        .withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
        .order("desc")
        .take(100)
    ).filter((f) => f.at >= since)
    // Section headings of the version in use, so themes can name where.
    const live = doc.liveVersion ?? null
    const sections: string[] = []
    if (live != null) {
      const chunks = await ctx.db
        .query("chunks")
        .withIndex("by_documentId_and_version", (q) => q.eq("documentId", doc._id).eq("version", live))
        .take(400)
      for (const c of chunks) if (c.pageOrSection && !sections.includes(c.pageOrSection)) sections.push(c.pageOrSection)
    }
    return {
      namingCode: doc.namingCode,
      title: doc.title,
      version: live ?? doc.currentVersion,
      sections: sections.slice(0, 40),
      asks: asks.map((a) => ({ question: a.question.trim(), answerFound: a.answerFound })),
      flags: flags.map((f) => f.note.trim()).filter(Boolean),
    }
  },
})

export const saveReport = internalMutation({
  args: {
    reportId: v.id("insightReports"),
    state: v.union(v.literal("ready"), v.literal("failed")),
    questionCount: v.number(),
    unansweredCount: v.number(),
    flagCount: v.number(),
    themes: v.array(
      v.object({
        title: v.string(),
        detail: v.string(),
        severity: v.union(v.literal("info"), v.literal("unclear"), v.literal("gap")),
        examples: v.array(v.string()),
      }),
    ),
    error: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reportId)
    if (!row) return
    const { reportId: _id, ...rest } = args
    await ctx.db.patch(row._id, { ...rest, generatedAt: Date.now() })
    // Keep the history short: the latest few reports per document.
    const older = await ctx.db
      .query("insightReports")
      .withIndex("by_documentId", (q) => q.eq("documentId", row.documentId))
      .order("desc")
      .take(20)
    for (const r of older.slice(5)) await ctx.db.delete(r._id)
  },
})

// ---- Ask feedback on the floor -----------------------------------------------

const ASK_FEEDBACK_REASONS = {
  wrong_machine: "Wrong machine",
  out_of_date: "Out of date",
  missing_step: "Missing step",
  other: "Other",
} as const

/**
 * "Helpful" or "Unclear or wrong?" under an Ask answer on the phone. Unclear
 * marks become content flags (source "ask") on each cited Published document,
 * so they show in Document insights and inform the next revision. Helpful is
 * only acknowledged: it changes nothing in the documents.
 */
export const askFeedback = mutation({
  args: {
    verdict: v.union(v.literal("helpful"), v.literal("unclear")),
    reason: v.optional(
      v.union(v.literal("wrong_machine"), v.literal("out_of_date"), v.literal("missing_step"), v.literal("other")),
    ),
    question: v.string(),
    citations: v.array(v.object({ documentId: v.id("documents"), chunkId: v.union(v.id("chunks"), v.null()) })),
    personId: v.union(v.id("people"), v.null()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    if (args.verdict === "helpful") return { flagged: 0 }
    const label = ASK_FEEDBACK_REASONS[args.reason ?? "other"]
    const question = args.question.trim().slice(0, 300)
    const note = question ? `Ask answer marked "${label}". Question: ${question}` : `Ask answer marked "${label}".`
    const seen = new Set<string>()
    let flagged = 0
    for (const c of args.citations.slice(0, 12)) {
      if (seen.has(c.documentId)) continue
      seen.add(c.documentId)
      const d = await ctx.db.get(c.documentId)
      if (!d || !isPublished(d) || d.liveVersion == null) continue
      await ctx.db.insert("contentFlags", {
        documentId: d._id,
        version: d.liveVersion,
        chunkId: c.chunkId,
        source: "ask",
        note,
        personId: args.personId,
        at: Date.now(),
      })
      flagged += 1
    }
    return { flagged }
  },
})
