import { ConvexError, v } from "convex/values"
import {
  internalMutation,
  internalQuery,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from "./_generated/server"
import { internal } from "./_generated/api"
import { Doc, Id } from "./_generated/dataModel"
import { requireUser, requireUserId } from "./lib/auth"
import { resolveScope, Scope, ScopeReason, scopeIsEmpty } from "./lib/scope"
import { isPublished } from "./lib/published"
import { contentStems, normalise, withTableHeaders } from "./ai/grounding"
import { openFindingsTouching, stillStands } from "./findings"
import { requireEngineerOrAdmin } from "./lib/roles"
import {
  MAX_DROPPED_DETAIL,
  allPoints,
  normaliseContent,
  type ComposedSection,
  type StoredWikiContent,
  type WikiContentV2,
} from "./lib/wikiTypes"
import { saveGenerationArgs } from "./lib/wikiValidators"
import { applyGeneration, compactSnapshot, logWikiEvent, recompose, storeBuild } from "./lib/wikiServer"

/** Same chunks, with table rows carrying their column headers. */
function withHeaders(chunks: Doc<"chunks">[]): Doc<"chunks">[] {
  const texts = withTableHeaders(chunks.map((c) => ({ text: c.text, section: c.pageOrSection })))
  return chunks.map((c, i) => ({ ...c, text: texts[i] }))
}

// Wikis (CONTEXT.md): AI-generated overviews of Published Knowledge inside a
// Scope. Engineers set the title, purpose, format and Scope (through Guided
// creation); the content is always generated. Generation lives in
// convex/ai/wiki.ts.

export const scopeValidator = v.object({
  areas: v.array(v.string()),
  disciplines: v.array(v.string()),
  assetIds: v.array(v.id("assets")),
  documentIds: v.array(v.id("documents")),
  excludedDocumentIds: v.optional(v.array(v.id("documents"))),
})

export const formatValidator = v.union(
  v.literal("overview"),
  v.literal("steps"),
  v.literal("reference"),
)
export type WikiFormat = "overview" | "steps" | "reference"

// Cap per generation so a broad Scope stays within one model call.
export const MAX_WIKI_CHUNKS = 160
// A small Scope (a handful of documents) is read in full, up to this many
// passages: a 3 to 6 document Wiki should never skip parts of its sources.
const SMALL_SCOPE_DOCS = 6
const SMALL_SCOPE_MAX_CHUNKS = 480
// Every document that is read at all gets at least this many passages, so a
// very broad Scope reads fewer documents properly instead of all of them
// by one line each.
const MIN_CHUNKS_PER_DOC = 2
const SAFETY_RE = /\b(?:never|warning|caution|danger|must|lockout|tagout|ppe|gloves|hot|burn|isolat\w*|do not|don't)\b/i
const FACT_RE = /\d/
// Builds listed for the History drawer, Restore and the diff. Retention (D3):
// a build is kept 365 days, and the newest KEEP_BUILDS are kept whatever their age.
const KEEP_BUILDS = 10
const KEEP_BUILDS_MS = 365 * 24 * 60 * 60 * 1000
// A point stays marked "New" this long after the build that added it.
const NEW_FOR_MS = 14 * 24 * 60 * 60 * 1000
// At most this many pictures from the source documents on one Wiki.
const MAX_FIGURES = 6

/**
 * Split the chunk budget fairly: small documents are read in full and what
 * they leave over goes to the larger ones (water-filling).
 */
export function allocate(sizes: number[], budget: number): number[] {
  const out = sizes.map(() => 0)
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[a] - sizes[b])
  let left = budget
  order.forEach((i, pos) => {
    const share = Math.floor(left / (order.length - pos))
    out[i] = Math.min(sizes[i], share)
    left -= out[i]
  })
  return out
}

/**
 * Which passages of a document to read when it does not fit: those that
 * match the Wiki's title and purpose, safety statements and passages with
 * numbers or codes first; bare headings last. Returned in document order.
 */
export function pickChunks<T extends { seq: number; text: string; pageOrSection: string | null }>(
  chunks: T[],
  n: number,
  topic: Set<string>,
): T[] {
  if (chunks.length <= n) return chunks
  const score = (c: T) => {
    if (c.text === c.pageOrSection) return -1
    const overlap = contentStems(c.text).filter((s) => topic.has(s)).length
    return overlap + (SAFETY_RE.test(c.text) ? 2 : 0) + (FACT_RE.test(c.text) ? 1 : 0)
  }
  return chunks
    .map((c) => ({ c, s: score(c) }))
    .sort((a, b) => b.s - a.s || a.c.seq - b.c.seq)
    .slice(0, n)
    .map((x) => x.c)
    .sort((a, b) => a.seq - b.seq)
}

/** How many passages one build reads for a Scope of these sizes. */
function readBudget(docCount: number, totalChunks: number) {
  return docCount <= SMALL_SCOPE_DOCS
    ? Math.max(MAX_WIKI_CHUNKS, Math.min(totalChunks, SMALL_SCOPE_MAX_CHUNKS))
    : MAX_WIKI_CHUNKS
}

/** Changing a Wiki is Engineer work (plan: Engineer gating). */
function requireEngineer(ctx: QueryCtx, personId: Id<"people"> | undefined) {
  return requireEngineerOrAdmin(ctx, personId, "Check in as an Engineer to change this Wiki.")
}

// ---- Shared reading helpers ---------------------------------------------------

type OutdatedReason = "newer_version" | "archived" | "not_published" | "deleted" | "out_of_scope"

/**
 * Which sources no longer match the Published state of their Document. A
 * source is stale when its Document published a newer version, was archived,
 * stopped being Published or was deleted after this content was generated.
 */
async function sourceStatus(ctx: QueryCtx, wiki: Doc<"wikis">) {
  const stale = new Map<string, { reason: OutdatedReason; liveVersion: number | null }>()
  const publishedAt = new Map<string, number>()
  const docs = new Map<string, Doc<"documents">>()
  for (const s of wiki.sources) {
    const d = await ctx.db.get(s.documentId)
    if (d) docs.set(String(s.documentId), d)
    const row = await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", s.documentId).eq("version", s.version),
      )
      .unique()
    if (row) publishedAt.set(String(s.documentId), row.publishedAt)
    if (!d) stale.set(String(s.documentId), { reason: "deleted", liveVersion: null })
    else if (d.status === "archived")
      stale.set(String(s.documentId), { reason: "archived", liveVersion: null })
    else if (!isPublished(d))
      stale.set(String(s.documentId), { reason: "not_published", liveVersion: null })
    else if (d.liveVersion !== s.version)
      stale.set(String(s.documentId), { reason: "newer_version", liveVersion: d.liveVersion as number })
  }
  // After a scope edit, sources that are no longer in scope are withheld too,
  // until the rebuild replaces them.
  const { published } = await resolveScope(ctx, wiki.scope)
  const inScope = new Set(published.map((d) => String(d._id)))
  for (const s of wiki.sources) {
    const key = String(s.documentId)
    if (!stale.has(key) && !inScope.has(key)) {
      stale.set(key, { reason: "out_of_scope", liveVersion: null })
    }
  }
  return { stale, publishedAt, docs }
}

/**
 * The content with only points whose every citation still points at the
 * Published version of its Document. A point that leans on a superseded,
 * archived or deleted source is withheld until the Wiki is rebuilt, so
 * obsolete text is never shown as truth (ISO 9001 7.5.3.2 d). This also
 * covers a failed rebuild, which keeps the previous content. Gap blocks stay.
 */
/** Minutes to read at 200 words a minute: headings, points and table cells. */
function readingMinutes(sections: ComposedSection[]): number {
  const words = sections
    .flatMap((s) => [s.heading, ...s.blocks.flatMap((b) => b.points.map((p) => (p.cells ? p.cells.join(" ") : p.text)))])
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

function visiblePoints(wiki: Doc<"wikis">, stale: Map<string, unknown>) {
  let hidden = 0
  let shown = 0
  const v2 = normaliseContent(wiki.content, wiki.sources)
  const sections: ComposedSection[] = (v2?.sections ?? [])
    .map((section) => ({
      ...section,
      blocks: section.blocks
        .map((block) => ({
          ...block,
          points: block.points.filter((p) => {
            const ok = p.citations.every((c) => !stale.has(String(c.documentId)))
            if (ok) shown += 1
            else hidden += 1
            return ok
          }),
        }))
        .filter((b) => b.points.length > 0 || b.kind === "gap"),
    }))
    .filter((section) => section.blocks.length > 0)
  const content: WikiContentV2 | null = v2 ? { ...v2, sections } : null
  return { content, sections, hidden, shown }
}

/** The introduction's sentences as one paragraph (MCP). */
function introText(content: WikiContentV2 | null): string {
  const intro = content?.sections.find((s) => s.role === "intro")?.blocks.find((b) => b.kind === "intro")
  return intro ? intro.points.map((p) => p.text).join(" ") : ""
}

/** Identity of a point across builds: its wording, or the passages it cites. */
function pointKeys(p: { text: string; chunkIds: string[] }): string[] {
  const t = `t:${normalise(p.text)}`
  return p.chunkIds.length ? [t, `c:${[...p.chunkIds].sort().join(",")}`] : [t]
}

function snapshot(content: StoredWikiContent | null) {
  return compactSnapshot(normaliseContent(content))
}

/** Retention (D3): drop builds older than 365 days beyond the newest KEEP_BUILDS. */
async function pruneBuilds(ctx: MutationCtx, wikiId: Id<"wikis">) {
  const cutoff = Date.now() - KEEP_BUILDS_MS
  const builds = await ctx.db
    .query("wikiBuilds")
    .withIndex("by_wikiId", (q) => q.eq("wikiId", wikiId))
    .order("desc")
    .take(KEEP_BUILDS + 200)
  for (const old of builds.slice(KEEP_BUILDS)) if (old.builtAt < cutoff) await ctx.db.delete(old._id)
}

async function buildsOf(ctx: QueryCtx, wikiId: Id<"wikis">) {
  const rows = await ctx.db
    .query("wikiBuilds")
    .withIndex("by_wikiId", (q) => q.eq("wikiId", wikiId))
    .order("desc")
    .take(KEEP_BUILDS)
  return rows
}

/** What the latest build added and removed compared with the one before. */
function diffBuilds(latest: Doc<"wikiBuilds"> | undefined, previous: Doc<"wikiBuilds"> | undefined) {
  if (!latest || !previous) return null
  const before = new Set(previous.content.flatMap((s) => s.points.flatMap((p) => pointKeys(p))))
  const after = new Set(latest.content.flatMap((s) => s.points.flatMap((p) => pointKeys(p))))
  const added = latest.content.flatMap((s) =>
    s.points.filter((p) => !pointKeys(p).some((k) => before.has(k))).map((p) => ({ heading: s.heading, text: p.text })),
  )
  const removed = previous.content.flatMap((s) =>
    s.points.filter((p) => !pointKeys(p).some((k) => after.has(k))).map((p) => ({ heading: s.heading, text: p.text })),
  )
  // Which source versions changed between the two builds.
  const prevVersion = new Map(previous.sources.map((s) => [String(s.documentId), s.version]))
  const changedSources = latest.sources
    .filter((s) => prevVersion.get(String(s.documentId)) !== s.version)
    .map((s) => `${s.namingCode} v${s.version}`)
  return {
    added,
    removed,
    changedSources,
    sinceBuildAt: previous.builtAt,
    builtAt: latest.builtAt,
    trigger: latest.trigger,
  }
}

/** Open contradiction Findings among these documents, still standing. */
async function openContradictions(ctx: QueryCtx, documentIds: Id<"documents">[]) {
  const seen = new Set<string>()
  const out: Doc<"findings">[] = []
  for (const id of documentIds.slice(0, 40)) {
    for (const f of await openFindingsTouching(ctx, id)) {
      if (f.kind !== "contradiction" || seen.has(f._id)) continue
      seen.add(f._id)
      if (await stillStands(ctx, f)) out.push(f)
    }
  }
  return out
}

/**
 * The open Finding a point leans on: it cites one of the two disagreeing
 * passages, or it cites both documents of the contradiction.
 */
function findingForPoint(
  citations: { chunkId: Id<"chunks">; documentId: Id<"documents"> }[],
  findings: Doc<"findings">[],
) {
  const chunks = new Set(citations.map((c) => String(c.chunkId)))
  const docs = new Set(citations.map((c) => String(c.documentId)))
  for (const f of findings) {
    if ((f.a.chunkId && chunks.has(String(f.a.chunkId))) || (f.b.chunkId && chunks.has(String(f.b.chunkId))))
      return f
    if (docs.has(String(f.a.documentId)) && docs.has(String(f.b.documentId))) return f
  }
  return null
}

async function areaLabels(ctx: QueryCtx) {
  return new Map((await ctx.db.query("namingLocations").take(200)).map((a) => [a.code, a.label]))
}

/** Areas and Assets a Wiki covers, for browsing on the Wiki home. */
async function coverage(
  ctx: QueryCtx,
  wiki: Doc<"wikis">,
  docs: Map<string, Doc<"documents">>,
  labels: Map<string, string>,
) {
  const areaCodes = new Set(wiki.scope.areas)
  for (const d of docs.values()) if (d.location) areaCodes.add(d.location)
  const assets: { _id: Id<"assets">; code: string; name: string }[] = []
  const seen = new Set<string>()
  const push = (a: Doc<"assets"> | null) => {
    if (!a || seen.has(a._id)) return
    seen.add(a._id)
    assets.push({ _id: a._id, code: a.code, name: a.name })
  }
  for (const id of wiki.scope.assetIds) push(await ctx.db.get(id))
  // Assets linked to the documents it was built from.
  for (const d of docs.values()) {
    const links = await ctx.db
      .query("documentAssets")
      .withIndex("by_documentId", (q) => q.eq("documentId", d._id))
      .take(20)
    for (const l of links) push(await ctx.db.get(l.assetId))
  }
  return {
    areas: [...areaCodes].sort().map((code) => ({ code, label: labels.get(code) ?? code })),
    assets: assets.sort((a, b) => a.code.localeCompare(b.code)),
  }
}

// ---- Queries ----------------------------------------------------------------

/** Every Wiki, with what the Wiki home needs to search, browse and rank. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const wikis = await ctx.db.query("wikis").take(200)
    wikis.sort((a, b) => b.updatedAt - a.updatedAt)
    const labels = await areaLabels(ctx)
    const out = []
    for (const w of wikis) {
      const { stale, docs } = await sourceStatus(ctx, w)
      const visible = visiblePoints(w, stale)
      const bodySections = visible.sections.filter((s) => s.role !== "intro")
      const builds = await buildsOf(ctx, w._id)
      const diff = diffBuilds(builds[0], builds[1])
      const cov = await coverage(ctx, w, docs, labels)
      out.push({
        _id: w._id,
        title: w.title,
        purpose: w.purpose,
        status: w.status,
        format: (w.format ?? "overview") as WikiFormat,
        sourceCount: w.sources.length,
        sectionCount: bodySections.length,
        pointCount: visible.shown,
        // Same count as the Wiki page's "N min read" (readingMinutes there).
        readMinutes: readingMinutes(visible.sections),
        outdatedCount: stale.size,
        generatedAt: w.generatedAt,
        updatedAt: w.updatedAt,
        headings: bodySections.map((s) => s.heading),
        sourceCodes: w.sources.map((s) => s.namingCode),
        areas: cov.areas,
        assets: cov.assets,
        views: w.views ?? 0,
        lastViewedAt: w.lastViewedAt ?? null,
        startHere: w.startHere ?? null,
        change: diff
          ? {
              at: diff.builtAt,
              added: diff.added.length,
              removed: diff.removed.length,
              trigger: diff.trigger,
              changedSources: diff.changedSources,
              // The Wiki sections the change touched, for "What changed".
              changedHeadings: [...new Set([...diff.added, ...diff.removed].map((p) => p.heading))].slice(0, 3),
            }
          : null,
        firstBuiltAt: builds.length > 0 ? builds[builds.length - 1].builtAt : null,
      })
    }
    return out
  },
})

export const get = query({
  args: { id: v.id("wikis") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const wiki = await ctx.db.get(args.id)
    if (!wiki) return null
    const { stale, publishedAt, docs } = await sourceStatus(ctx, wiki)
    const visible = visiblePoints(wiki, stale)

    // Trust layer: open contradictions among the sources, and what the last
    // build changed.
    const findings = await openContradictions(
      ctx,
      wiki.sources.map((s) => s.documentId),
    )
    const builds = await buildsOf(ctx, wiki._id)
    const diff = diffBuilds(builds[0], builds[1])
    const addedKeys = new Set(
      diff && Date.now() - diff.builtAt < NEW_FOR_MS
        ? diff.added.map((p) => `t:${normalise(p.text)}`)
        : [],
    )

    const enrich = (p: (typeof visible.sections)[number]["blocks"][number]["points"][number]) => {
      const f = findingForPoint(p.citations, findings)
      return {
        ...p,
        findingId: f?._id ?? null,
        findingSummary: f?.summary ?? null,
        isNew: addedKeys.has(`t:${normalise(p.text)}`),
      }
    }
    const v2Sections = visible.sections.map((s) => ({
      ...s,
      blocks: s.blocks.map((b) => ({ ...b, points: b.points.map(enrich) })),
    }))
    const contentV2 = visible.content ? { ...visible.content, sections: v2Sections } : null

    // The cited passages, for hover previews and for jumping to the spot.
    const excerpts: Record<string, string> = {}
    for (const point of allPoints(contentV2)) {
      for (const c of point.citations) {
        if (excerpts[c.chunkId] !== undefined) continue
        const chunk = await ctx.db.get(c.chunkId)
        if (chunk) excerpts[c.chunkId] = chunk.text
      }
    }

    // One figure per body section, by section id.
    const body = v2Sections.filter((s) => s.role !== "intro")
    const figures = await pickFigures(
      ctx,
      body.map((s) => ({ heading: s.heading, points: s.blocks.flatMap((b) => b.points) })),
    )
    const figuresBySection: Record<string, (typeof figures)[number]> = {}
    for (const [i, f] of Object.entries(figures)) figuresBySection[body[Number(i)].id] = f
    const labels = await areaLabels(ctx)
    const cov = await coverage(ctx, wiki, docs, labels)

    // Health strip: open contradictions, overdue reviews, points left out.
    const now = Date.now()
    const reviewsOverdueDocs = wiki.sources
      .filter((s) => {
        const d = docs.get(String(s.documentId))
        return d?.nextReviewAt != null && d.nextReviewAt < now
      })
      .map((s) => ({ documentId: s.documentId, namingCode: s.namingCode, title: s.title }))

    return {
      ...wiki,
      format: (wiki.format ?? "overview") as WikiFormat,
      // The stored content is not sent: readers use contentV2.
      content: undefined,
      contentV2Pending: undefined,
      // Unapplied Outline changes are for Engineers only (wikiBlocks.editorState).
      outlineStaged: undefined,
      stagedVersion: undefined,
      outlineUpdatedBy: undefined,
      outlineUpdatedAt: undefined,
      // Text the build left out failed its check; readers get only the count (health.leftOut).
      droppedDetail: undefined,
      // The composed read model (spec 2.1): read this. Points carry findingId,
      // findingSummary and isNew; only visible blocks are ever in it.
      contentV2,
      figuresBySection,
      settings: {
        confirmByAnother: wiki.confirmByAnother ?? wiki.startHere != null,
        maxDanger: wiki.maxDanger ?? 2,
        readingLevel: wiki.readingLevel ?? null,
        length: wiki.length ?? null,
      },
      // Built without AI: "Offline stand-in, no AI" in the meta line (spec 5.3).
      stub: wiki.model === "stub" || (contentV2?.coverage.stub ?? false),
      sources: wiki.sources.map((s) => ({
        ...s,
        publishedAt: publishedAt.get(String(s.documentId)) ?? null,
        outdated: stale.get(String(s.documentId)) ?? null,
      })),
      outdated: wiki.sources
        .filter((s) => stale.has(String(s.documentId)))
        .map((s) => s.namingCode),
      hiddenPoints: visible.hidden,
      excerpts,
      scopeLabels: await scopeLabels(ctx, wiki.scope),
      areas: cov.areas,
      assets: cov.assets,
      health: {
        openFindings: findings.length,
        pointsWithFinding: v2Sections.flatMap((s) => s.blocks.flatMap((b) => b.points)).filter((p) => p.findingId).length,
        reviewsOverdue: reviewsOverdueDocs.length,
        reviewsOverdueDocs,
        leftOut: wiki.droppedPoints,
      },
      findings: findings.map((f) => ({
        _id: f._id,
        summary: f.summary,
        a: f.a.namingCode,
        b: f.b.namingCode,
      })),
      diff,
      builds: builds.map((b) => ({
        _id: b._id,
        builtAt: b.builtAt,
        trigger: b.trigger,
        sources: b.sources.map((s) => `${s.namingCode} v${s.version}`),
        points: b.content.reduce((n, s) => n + s.points.length, 0),
      })),
    }
  },
})

/**
 * Pictures from the source documents, placed with the section they show:
 * an image of a cited document version whose description shares the most
 * words with the section. Each picture is used once.
 */
async function pickFigures(
  ctx: QueryCtx,
  sections: { heading: string; points: { text: string; citations: { documentId: Id<"documents">; version: number }[] }[] }[],
) {
  const out: Record<number, { url: string; alt: string; namingCode: string; documentId: Id<"documents"> }> = {}
  const used = new Set<string>()
  const cache = new Map<string, { image: Doc<"images">; stems: Set<string> }[]>()
  let count = 0
  for (let i = 0; i < sections.length && count < MAX_FIGURES; i++) {
    const s = sections[i]
    const want = new Set(contentStems(`${s.heading} ${s.points.map((p) => p.text).join(" ")}`))
    const cited = new Map<string, { documentId: Id<"documents">; version: number }>()
    for (const p of s.points) for (const c of p.citations) cited.set(`${c.documentId}@${c.version}`, c)
    let best: { image: Doc<"images">; score: number; documentId: Id<"documents"> } | null = null
    for (const [key, c] of cited) {
      if (!cache.has(key)) {
        const usages = await ctx.db
          .query("imageUsages")
          .withIndex("by_documentId_and_version", (q) =>
            q.eq("documentId", c.documentId).eq("documentVersion", c.version),
          )
          .take(20)
        const images = []
        for (const u of usages) {
          if (u.context !== "body") continue
          const image = await ctx.db.get(u.imageId)
          if (image) images.push({ image, stems: new Set(contentStems(image.altText)) })
        }
        cache.set(key, images)
      }
      for (const { image, stems } of cache.get(key)!) {
        if (used.has(image._id)) continue
        const score = [...stems].filter((x) => want.has(x)).length
        if (score >= 3 && (!best || score > best.score)) best = { image, score, documentId: c.documentId }
      }
    }
    if (!best) continue
    const url = best.image.storageId
      ? await ctx.storage.getUrl(best.image.storageId)
      : best.image.externalUrl
    if (!url) continue
    used.add(best.image._id)
    const doc = await ctx.db.get(best.documentId)
    out[i] = { url, alt: best.image.altText, namingCode: doc?.namingCode ?? "", documentId: best.documentId }
    count += 1
  }
  return out
}

/** Wikis built from this Document (rail card, publish dialog). */
export const listForDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const wikis = await ctx.db.query("wikis").take(500)
    const out = []
    for (const w of wikis) {
      const used = w.sources.some((s) => s.documentId === args.documentId)
      let inScope = used
      if (!inScope) {
        const { published } = await resolveScope(ctx, w.scope)
        inScope = published.some((d) => d._id === args.documentId)
      }
      if (inScope) out.push(summaryOf(w))
    }
    return out
  },
})

/** Wikis about this Asset: it is in the Scope, or a source is linked to it. */
export const listForAsset = query({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const linked = new Set(
      (
        await ctx.db
          .query("documentAssets")
          .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId))
          .take(500)
      ).map((l) => String(l.documentId)),
    )
    const wikis = await ctx.db.query("wikis").take(500)
    const direct = []
    const viaDocs = []
    for (const w of wikis) {
      if (w.scope.assetIds.includes(args.assetId)) direct.push(summaryOf(w))
      else if (w.sources.some((s) => linked.has(String(s.documentId)))) viaDocs.push(summaryOf(w))
    }
    return [...direct, ...viaDocs]
  },
})

function summaryOf(w: Doc<"wikis">) {
  return {
    _id: w._id,
    title: w.title,
    pointCount: allPoints(w.content).length,
    status: w.status,
    builtAt: w.generatedAt,
  }
}

/** Wikis that show a point resting on this Finding (Findings page). */
export const findingsImpact = query({
  args: { findingId: v.id("findings") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const f = await ctx.db.get(args.findingId)
    if (!f) return []
    const wikis = await ctx.db.query("wikis").take(500)
    const out = []
    for (const w of wikis) {
      const points = allPoints(w.content)
      const n = points.filter((p) => findingForPoint(p.citations, [f]) !== null).length
      if (n > 0) out.push({ _id: w._id, title: w.title, points: n })
    }
    return out
  },
})

/** Live preview for the Draft: what this Scope would be built from. */
export const previewScope = query({
  args: { scope: scopeValidator },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const { published, excluded, removed, reasons } = await resolveScope(ctx, args.scope)
    // How much of the Scope one build can read (the coverage meter).
    let totalChunks = 0
    const sizes: number[] = []
    for (const d of published) {
      const n = (
        await ctx.db
          .query("chunks")
          .withIndex("by_documentId_and_version", (q) =>
            q.eq("documentId", d._id).eq("version", d.liveVersion as number),
          )
          .take(2000)
      ).length
      sizes.push(n)
      totalChunks += n
    }
    const budget = readBudget(published.length, totalChunks)
    const readShare = totalChunks === 0 ? 1 : Math.min(1, budget / totalChunks)
    const assetCode = new Map<string, string>()
    for (const id of args.scope.assetIds) {
      const a = await ctx.db.get(id)
      if (a) assetCode.set(String(a._id), a.code)
    }
    const labels = await areaLabels(ctx)
    const discLabels = new Map(
      (await ctx.db.query("namingDisciplines").take(200)).map((d) => [d.code, d.label]),
    )
    const reasonText = (r: ScopeReason | undefined) =>
      !r
        ? ""
        : r.kind === "picked"
          ? "Picked by name"
          : r.kind === "asset"
            ? `Linked to ${r.assetCode}`
            : [
                r.area ? `In ${labels.get(r.area) ?? r.area}` : null,
                r.discipline ? `about ${discLabels.get(r.discipline) ?? r.discipline}` : null,
              ]
                .filter(Boolean)
                .join(", ")
    return {
      empty: scopeIsEmpty(args.scope),
      published: published.map((d, i) => ({
        _id: d._id,
        namingCode: d.namingCode,
        title: d.title,
        version: d.liveVersion as number,
        passages: sizes[i],
        reason: reasonText(reasons.get(String(d._id))),
        picked: reasons.get(String(d._id))?.kind === "picked",
      })),
      excluded: excluded.map((d) => ({
        _id: d._id,
        namingCode: d.namingCode,
        title: d.title,
        status: d.status,
      })),
      removed: removed.map((d) => ({
        _id: d._id,
        namingCode: d.namingCode,
        title: d.title,
      })),
      coverage: { passages: totalChunks, readable: Math.min(budget, totalChunks), readShare },
      sentence: scopeSentence(args.scope, labels, discLabels, [...assetCode.values()], removed.length),
    }
  },
})

/** "Published documents in Hall 2 about Health and safety, plus everything linked to EXL-201, plus 1 picked document". */
function scopeSentence(
  scope: Scope,
  areaLabel: Map<string, string>,
  discLabel: Map<string, string>,
  assetCodes: string[],
  removed: number,
) {
  const parts: string[] = []
  const list = (xs: string[]) =>
    xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`
  if (scope.areas.length || scope.disciplines.length) {
    const areas = scope.areas.map((c) => areaLabel.get(c) ?? c)
    const discs = scope.disciplines.map((c) => discLabel.get(c) ?? c)
    parts.push(
      `Published documents${areas.length ? ` in ${list(areas)}` : ""}${discs.length ? ` about ${list(discs)}` : ""}`,
    )
  }
  if (assetCodes.length) parts.push(`everything linked to ${list(assetCodes)}`)
  if (scope.documentIds.length)
    parts.push(`${scope.documentIds.length} picked ${scope.documentIds.length === 1 ? "document" : "documents"}`)
  if (parts.length === 0) return "Nothing chosen yet."
  const first = parts[0].startsWith("Published") ? parts[0] : `Published ${parts[0]}`
  const text = [first, ...parts.slice(1)].join(", plus ")
  return `${text}${removed ? `, minus ${removed} taken out by hand` : ""}.`
}

/** Everything a Scope can be built from, for the Draft's pickers. */
export const scopeOptions = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    return await loadScopeOptions(ctx)
  },
})

export async function loadScopeOptions(ctx: QueryCtx) {
  const areas = await ctx.db.query("namingLocations").take(200)
  const disciplines = await ctx.db.query("namingDisciplines").take(200)
  const assets = await ctx.db.query("assets").take(500)
  const docs = (await ctx.db.query("documents").take(2000)).filter(isPublished)
  return {
    areas: areas
      .map((a) => ({ code: a.code, label: a.label }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    disciplines: disciplines
      .map((d) => ({ code: d.code, label: d.label }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    assets: assets
      .map((a) => ({
        _id: a._id,
        code: a.code,
        name: a.name,
        location: a.location,
      }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    documents: docs
      .map((d) => ({
        _id: d._id,
        namingCode: d.namingCode,
        title: d.title,
        type: d.type,
        area: d.location ?? null,
        discipline: d.discipline ?? null,
      }))
      .sort((a, b) => a.namingCode.localeCompare(b.namingCode)),
  }
}

async function scopeLabels(ctx: QueryCtx, scope: Scope) {
  const assets = (
    await Promise.all(scope.assetIds.map((id) => ctx.db.get(id)))
  ).filter((a): a is Doc<"assets"> => a !== null)
  const docs = (
    await Promise.all(scope.documentIds.map((id) => ctx.db.get(id)))
  ).filter((d): d is Doc<"documents"> => d !== null)
  const removed = (
    await Promise.all((scope.excludedDocumentIds ?? []).map((id) => ctx.db.get(id)))
  ).filter((d): d is Doc<"documents"> => d !== null)
  const areaLabel = await areaLabels(ctx)
  const discLabel = new Map(
    (await ctx.db.query("namingDisciplines").take(200)).map((d) => [d.code, d.label]),
  )
  return {
    areas: scope.areas.map((c) => areaLabel.get(c) ?? c),
    disciplines: scope.disciplines.map((c) => discLabel.get(c) ?? c),
    assets: assets.map((a) => `${a.code} ${a.name}`),
    documents: docs.map((d) => `${d.namingCode} ${d.title}`),
    removed: removed.map((d) => `${d.namingCode} ${d.title}`),
  }
}

// ---- Mutations --------------------------------------------------------------

function cleanInput(title: string, purpose: string, scope: Scope) {
  const t = title.trim()
  if (!t) throw new ConvexError("Give the Wiki a title.")
  if (!purpose.trim()) throw new ConvexError("Say who the Wiki is for and what they need from it.")
  if (scopeIsEmpty(scope))
    throw new ConvexError("Choose at least one area, discipline, Asset or Document.")
  const excluded = (scope.excludedDocumentIds ?? []).filter((id) => !scope.documentIds.includes(id))
  return {
    title: t,
    purpose: purpose.trim(),
    scope: { ...scope, excludedDocumentIds: excluded.length ? excluded : undefined },
  }
}

export const create = mutation({
  args: {
    title: v.string(),
    purpose: v.string(),
    scope: scopeValidator,
    format: v.optional(formatValidator),
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const person = await requireEngineer(ctx, args.personId)
    const input = cleanInput(args.title, args.purpose, args.scope)
    const now = Date.now()
    const id = await ctx.db.insert("wikis", {
      ...input,
      format: args.format ?? "overview",
      createdByPersonId: person._id,
      status: "generating",
      content: null,
      sources: [],
      generatedAt: null,
      generationTicket: 0,
      requestedAt: null,
      lastTrigger: null,
      droppedPoints: 0,
      error: null,
      createdBy: userId,
      updatedAt: now,
    })
    await logWikiEvent(ctx, id, person._id, "created", `"${input.title}" created by ${person.name}`)
    await requestGeneration(ctx, id, `created by ${person.name}`, person._id)
    return id
  },
})

export const update = mutation({
  args: {
    id: v.id("wikis"),
    title: v.string(),
    purpose: v.string(),
    scope: scopeValidator,
    format: v.optional(formatValidator),
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const person = await requireEngineer(ctx, args.personId)
    const wiki = await ctx.db.get(args.id)
    if (!wiki) throw new ConvexError("Wiki not found")
    const input = cleanInput(args.title, args.purpose, args.scope)
    await ctx.db.patch(args.id, {
      ...input,
      ...(args.format ? { format: args.format } : {}),
      updatedAt: Date.now(),
    })
    await logWikiEvent(ctx, args.id, person._id, "scopeChanged", `Title, purpose or Scope changed by ${person.name}`)
    await requestGeneration(ctx, args.id, `scope changed by ${person.name}`, person._id)
  },
})

export const regenerate = mutation({
  args: { id: v.id("wikis"), personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const person = await requireEngineer(ctx, args.personId)
    if (!(await ctx.db.get(args.id))) throw new ConvexError("Wiki not found")
    await requestGeneration(ctx, args.id, `rebuilt by ${person.name}`, person._id)
  },
})

export const remove = mutation({
  args: { id: v.id("wikis"), personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const person = await requireEngineer(ctx, args.personId)
    const wiki = await ctx.db.get(args.id)
    if (!wiki) return
    // The wikiEvents rows stay (spec 5.3): the trail outlives the Wiki.
    await logWikiEvent(ctx, args.id, person._id, "deleted", `"${wiki.title}" deleted by ${person.name}`)
    for (const b of await buildsOf(ctx, args.id)) await ctx.db.delete(b._id)
    for (const b of await ctx.db
      .query("wikiBlocks")
      .withIndex("by_wikiId_and_state", (q) => q.eq("wikiId", args.id))
      .take(1000))
      await ctx.db.delete(b._id)
    await ctx.db.delete(args.id)
  },
})

/** Put a Wiki on the "Start here" path for new people, or take it off. */
export const setStartHere = mutation({
  args: { id: v.id("wikis"), on: v.boolean(), personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineer(ctx, args.personId)
    const wiki = await ctx.db.get(args.id)
    if (!wiki) throw new ConvexError("Wiki not found")
    if (!args.on) {
      await ctx.db.patch(args.id, { startHere: undefined })
      return
    }
    if (wiki.startHere != null) return
    const all = await ctx.db.query("wikis").take(500)
    const last = Math.max(0, ...all.map((w) => w.startHere ?? 0))
    await ctx.db.patch(args.id, { startHere: last + 1 })
  },
})

/** Move a Wiki one place up or down the "Start here" path. */
export const moveStartHere = mutation({
  args: { id: v.id("wikis"), direction: v.union(v.literal("up"), v.literal("down")), personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineer(ctx, args.personId)
    const path = (await ctx.db.query("wikis").take(500))
      .filter((w) => w.startHere != null)
      .sort((a, b) => (a.startHere as number) - (b.startHere as number))
    const i = path.findIndex((w) => w._id === args.id)
    const j = args.direction === "up" ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= path.length) return
    ;[path[i], path[j]] = [path[j], path[i]]
    for (let k = 0; k < path.length; k++) await ctx.db.patch(path[k]._id, { startHere: k + 1 })
  },
})

/** Counts an opening of the Wiki, for "Most used" on the Wiki home. */
export const recordView = mutation({
  args: { id: v.id("wikis") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const wiki = await ctx.db.get(args.id)
    if (!wiki) return
    await ctx.db.patch(args.id, { views: (wiki.views ?? 0) + 1, lastViewedAt: Date.now() })
  },
})

/**
 * Hand out a new generation ticket and schedule a run. Content stays visible
 * while the new run works; only the newest ticket may write its result.
 * `personId` is who pressed the button; null for system rebuilds (publish,
 * nightly, migration), which count against the system AI budget.
 */
export async function requestGeneration(
  ctx: MutationCtx,
  wikiId: Id<"wikis">,
  trigger: string,
  personId: Id<"people"> | null = null,
) {
  const wiki = await ctx.db.get(wikiId)
  if (!wiki) return
  const ticket = wiki.generationTicket + 1
  await ctx.db.patch(wikiId, {
    generationTicket: ticket,
    status: "generating",
    requestedAt: Date.now(),
    lastTrigger: trigger,
    error: null,
    rebuildScheduledAt: undefined,
  })
  await ctx.scheduler.runAfter(0, internal.ai.wiki.generate, { wikiId, ticket, personId })
}

// Publish triggers coalesce per Wiki (spec 3.8): the rebuild runs this long
// after the first trigger, and later triggers in that window join it. Until
// then readers never see stale text: points on a superseded version are
// withheld (visiblePoints).
export const REBUILD_COALESCE_MS = 10 * 60 * 1000

/** Called from the Document lifecycle whenever a Document's Published state changes. */
export async function regenerateWikisForDocument(
  ctx: MutationCtx,
  documentId: Id<"documents">,
  trigger: string,
) {
  const wikis = await ctx.db.query("wikis").take(500)
  const now = Date.now()
  for (const w of wikis) {
    const usedBefore = w.sources.some((s) => s.documentId === documentId)
    let inScope = usedBefore
    if (!inScope) {
      const { published } = await resolveScope(ctx, w.scope)
      inScope = published.some((d) => d._id === documentId)
    }
    if (!inScope) continue
    if (w.rebuildScheduledAt && w.rebuildScheduledAt > now) continue
    await ctx.db.patch(w._id, { rebuildScheduledAt: now + REBUILD_COALESCE_MS })
    await ctx.scheduler.runAfter(REBUILD_COALESCE_MS, internal.wikis.runScheduledRebuild, { wikiId: w._id, trigger })
  }
}

/** The coalesced rebuild after a publish. A no-op when it already ran (Rebuild now, or the dev check). */
export const runScheduledRebuild = internalMutation({
  args: { wikiId: v.id("wikis"), trigger: v.string() },
  handler: async (ctx, args) => {
    const wiki = await ctx.db.get(args.wikiId)
    if (!wiki?.rebuildScheduledAt) return false
    await requestGeneration(ctx, args.wikiId, args.trigger)
    return true
  },
})

export const regenerateAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    // A safety net for missed publish-time runs. A Wiki whose sources are all
    // still the live versions of exactly the documents in its scope is
    // already correct, so it is not rebuilt (each build is a paid AI call).
    const wikis = await ctx.db.query("wikis").take(500)
    let queued = 0
    for (const w of wikis) {
      const { published } = await resolveScope(ctx, w.scope)
      const want = published.map((d) => `${d._id}@${d.liveVersion}`).sort().join(",")
      const have = w.sources.map((s) => `${s.documentId}@${s.version}`).sort().join(",")
      const healthy = w.status === "ready" || w.status === "empty"
      if (healthy && want === have) continue
      await requestGeneration(ctx, w._id, "schedule")
      queued += 1
    }
    return queued
  },
})

// ---- Generation support (used by convex/ai/wiki.ts) -------------------------

export const loadForGeneration = internalQuery({
  args: { wikiId: v.id("wikis") },
  handler: async (ctx, args) => {
    const wiki = await ctx.db.get(args.wikiId)
    if (!wiki) return null
    const { published } = await resolveScope(ctx, wiki.scope)
    // The Outline's headings and instructions steer which passages a broad Scope reads.
    const outlineWords = (wiki.outline?.sections ?? []).map((s) => `${s.heading} ${s.instruction ?? ""}`).join(" ")
    const topic = new Set(contentStems(`${wiki.title} ${wiki.purpose} ${outlineWords}`))
    // Only the live version's passages: never a draft, never an older edition.
    const all: { d: Doc<"documents">; version: number; chunks: Doc<"chunks">[] }[] = []
    for (const d of published) {
      const version = d.liveVersion as number
      const chunks = await ctx.db
        .query("chunks")
        .withIndex("by_documentId_and_version", (q) =>
          q.eq("documentId", d._id).eq("version", version),
        )
        .take(2000)
      all.push({ d, version, chunks: chunks.sort((a, b) => a.seq - b.seq) })
    }
    // A Scope too broad to read every document properly reads the documents
    // whose title fits the Wiki best. The rest are listed as not read, never
    // silently ignored.
    const totalChunks = all.reduce((n, x) => n + x.chunks.length, 0)
    const budget = readBudget(all.length, totalChunks)
    const maxDocs = Math.floor(budget / MIN_CHUNKS_PER_DOC)
    const readable = new Set(
      all
        .map((x, i) => ({ i, s: contentStems(x.d.title).filter((s) => topic.has(s)).length }))
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .slice(0, maxDocs)
        .map((x) => x.i),
    )
    const budgets = allocate(
      all.map((x, i) => (readable.has(i) ? x.chunks.length : 0)),
      budget,
    )
    const docs = all.map((x, i) => ({
      documentId: x.d._id,
      namingCode: x.d.namingCode,
      title: x.d.title,
      version: x.version,
      excerptsTotal: x.chunks.length,
      chunks: pickChunks(withHeaders(x.chunks), budgets[i], topic).map((c) => ({
        chunkId: c._id,
        text: c.text,
        section: c.pageOrSection,
      })),
    }))
    return {
      title: wiki.title,
      purpose: wiki.purpose,
      format: (wiki.format ?? "overview") as WikiFormat,
      ticket: wiki.generationTicket,
      docs,
    }
  },
})

/**
 * A finished build (SaveGenerationArgs, convex/lib/wikiTypes.ts). Mode
 * "propose" creates the Outline, mode "outline" fills generated blocks by id;
 * then the Wiki is composed and, when its content changed, the build is stored
 * whole. A migrated Wiki keeps its old content until its introduction lands
 * (spec 6.3 step 5), then swaps to the composed content.
 */
export const saveGeneration = internalMutation({
  args: saveGenerationArgs,
  handler: async (ctx, args) => {
    const wiki = await ctx.db.get(args.wikiId)
    // A newer request superseded this run: discard its result.
    if (!wiki || wiki.generationTicket !== args.ticket) return false
    const now = Date.now()
    if (args.status === "failed") {
      // Keep the last good content; just report the failure.
      await ctx.db.patch(args.wikiId, {
        status: wiki.content ? "ready" : "failed",
        error: args.error,
        updatedAt: now,
      })
      return true
    }
    const meta = {
      sources: args.sources,
      droppedPoints: args.droppedPoints,
      droppedDetail: (args.droppedDetail ?? []).slice(0, MAX_DROPPED_DETAIL),
      model: args.model,
      promptVersion: args.promptVersion,
      generatedAt: now,
      error: null,
      updatedAt: now,
    }
    if (args.status === "empty") {
      // Nothing Published in Scope (check 7): no content, the Outline stays for later.
      await ctx.db.patch(args.wikiId, { ...meta, status: "empty", content: null, contentV2Pending: undefined })
      await logWikiEvent(ctx, args.wikiId, null, "rebuilt", `Nothing Published in Scope (${wiki.lastTrigger ?? "build"})`)
      return true
    }
    const before = compactSnapshot(normaliseContent(wiki.content))
    await applyGeneration(ctx, wiki, args)
    await ctx.db.patch(args.wikiId, meta)

    const pending = wiki.contentV2Pending
    if (pending) {
      const intro = (
        await ctx.db
          .query("wikiBlocks")
          .withIndex("by_wikiId_and_state", (q) => q.eq("wikiId", args.wikiId).eq("state", "live"))
          .take(1000)
      ).find((r) => r.kind === "intro")
      if (intro && intro.status !== "grounded" && intro.status !== "gap") {
        // Not ready to swap: readers keep the old content.
        await recompose(ctx, args.wikiId, "legacy")
        await ctx.db.patch(args.wikiId, { status: "ready" })
        return true
      }
    }
    const res = await recompose(ctx, args.wikiId)
    const content = res?.content ?? null
    await ctx.db.patch(args.wikiId, { status: content ? "ready" : "empty", contentV2Pending: undefined })
    const fresh = (await ctx.db.get(args.wikiId))!
    const changed = JSON.stringify(compactSnapshot(content)) !== JSON.stringify(before)
    if (changed || args.mode === "propose") {
      await storeBuild(ctx, fresh, "build", null, content)
      await pruneBuilds(ctx, args.wikiId)
    }
    if (pending && res) {
      const s = res.stats
      await logWikiEvent(
        ctx,
        args.wikiId,
        null,
        "migrated",
        `Introduction written; now on sections and blocks. Dedupe dropped ${s.deduped} repeated ${s.deduped === 1 ? "point" : "points"}; ` +
          `${s.withheld} withheld; ${s.turned} danger ${s.turned === 1 ? "callout" : "callouts"} turned into a warning`,
      )
    }
    const rebuilt = (args.blocks?.length ?? 0) + (args.intro ? 1 : 0) + (args.keyPoints ? 1 : 0) + (args.proposed?.length ?? 0)
    if (rebuilt > 0 || changed)
      await logWikiEvent(
        ctx,
        args.wikiId,
        null,
        "rebuilt",
        `Built from ${args.sources.length} documents (${wiki.lastTrigger ?? "build"}); ${args.droppedPoints} points left out`,
      )
    return true
  },
})

// ---- Dev checks ---------------------------------------------------------------

/**
 * Two saved builds of a throwaway Wiki leave 2 wikiBuilds rows and a diff.
 * Everything it writes is deleted again.
 * Run: npx convex run wikis:testBuildHistory
 */
export const testBuildHistory = internalMutation({
  args: {},
  handler: async (ctx) => {
    const chunk = await ctx.db.query("chunks").first()
    if (!chunk) return { ok: false, reason: "no chunks" }
    const doc = await ctx.db.get(chunk.documentId)
    if (!doc) return { ok: false, reason: "no document" }
    const cite = {
      chunkId: chunk._id,
      documentId: doc._id,
      namingCode: doc.namingCode,
      version: chunk.version,
      section: chunk.pageOrSection,
    }
    const id = await ctx.db.insert("wikis", {
      title: "Build history check",
      purpose: "Dev check",
      scope: { areas: [], disciplines: [], assetIds: [], documentIds: [doc._id] },
      status: "generating",
      content: null,
      sources: [],
      generatedAt: null,
      generationTicket: 1,
      requestedAt: null,
      lastTrigger: "check",
      droppedPoints: 0,
      error: null,
      createdBy: null,
      updatedAt: Date.now(),
    })
    const sources = [{ documentId: doc._id, namingCode: doc.namingCode, title: doc.title, version: chunk.version }]
    const save = async (texts: string[]) => {
      const wiki = (await ctx.db.get(id))!
      const content = {
        intro: "",
        sections: [{ heading: "Check", points: texts.map((text) => ({ text, citations: [cite] })) }],
      }
      await ctx.db.insert("wikiBuilds", {
        wikiId: id,
        builtAt: Date.now(),
        trigger: wiki.lastTrigger,
        sources: sources.map((s) => ({ documentId: s.documentId, namingCode: s.namingCode, version: s.version })),
        content: snapshot(content).map((s) => ({
          ...s,
          // Distinct passages per point so the diff matches on wording.
          points: s.points.map((p) => ({ ...p, chunkIds: [] })),
        })),
      })
      await ctx.db.patch(id, { content, sources, status: "ready", generatedAt: Date.now() })
    }
    await save(["Alpha point one.", "Beta point two."])
    await save(["Alpha point one.", "Gamma point three."])
    const builds = await buildsOf(ctx, id)
    const diff = diffBuilds(builds[0], builds[1])
    for (const b of builds) await ctx.db.delete(b._id)
    await ctx.db.delete(id)
    return {
      ok: builds.length === 2 && diff !== null && diff.added.length === 1 && diff.removed.length === 1,
      builds: builds.length,
      diff: diff && { added: diff.added.map((p) => p.text), removed: diff.removed.map((p) => p.text) },
    }
  },
})

/** Wiki mutations refuse Anonymous. Run: npx convex run wikis:testGating */
export const testGating = internalMutation({
  args: {},
  handler: async (ctx) => {
    const operator = (await ctx.db.query("people").take(100)).find((p) => p.kind === "operator")
    const engineer = (await ctx.db.query("people").take(100)).find((p) => p.kind === "engineer")
    const tries = async (personId: Id<"people"> | undefined) => {
      try {
        await requireEngineer(ctx, personId)
        return "allowed"
      } catch (e) {
        return `refused: ${e instanceof ConvexError ? String(e.data) : String(e)}`
      }
    }
    return {
      anonymous: await tries(undefined),
      operator: operator ? await tries(operator._id) : "no operator",
      engineer: engineer ? await tries(engineer._id) : "no engineer",
    }
  },
})

// ---- MCP (read-only, docs/adr/0004): oppr_list_wikis and oppr_get_wiki ----------------
// Only what a reader sees: Ready Wikis, and only points whose every citation
// is the Published version of its source. A key limited to areas sees a Wiki
// only when every source document lies inside its limit.

function wikiInAreas(wiki: Doc<"wikis">, docs: Map<string, Doc<"documents">>, areas: string[]) {
  if (areas.length === 0) return true
  return wiki.sources.every((s) => {
    const d = docs.get(String(s.documentId))
    return !!d?.location && areas.includes(d.location)
  })
}

export const mcpList = internalQuery({
  args: { areas: v.array(v.string()) },
  handler: async (ctx, args) => {
    const wikis = await ctx.db.query("wikis").take(200)
    wikis.sort((a, b) => b.updatedAt - a.updatedAt)
    const out = []
    for (const w of wikis) {
      if (w.status !== "ready" || !w.content) continue
      const { stale, docs } = await sourceStatus(ctx, w)
      if (!wikiInAreas(w, docs, args.areas)) continue
      const visible = visiblePoints(w, stale)
      if (visible.shown === 0) continue
      out.push({
        id: w._id as string,
        title: w.title,
        purpose: w.purpose,
        format: w.format ?? "overview",
        sections: visible.sections.filter((s) => s.role !== "intro").map((s) => s.heading),
        pointCount: visible.shown,
        withheldPoints: visible.hidden,
        builtAt: w.generatedAt,
        sources: w.sources
          .filter((s) => !stale.has(String(s.documentId)))
          .map((s) => ({ code: s.namingCode, version: s.version, title: s.title })),
      })
    }
    return out
  },
})

export const mcpGet = internalQuery({
  args: { wiki: v.string(), areas: v.array(v.string()) },
  handler: async (ctx, args) => {
    const needle = args.wiki.trim()
    const byId = ctx.db.normalizeId("wikis", needle)
    let wiki = byId ? await ctx.db.get(byId) : null
    if (!wiki) {
      const lower = needle.toLowerCase()
      const all = await ctx.db.query("wikis").take(200)
      wiki =
        all.find((w) => w.title.toLowerCase() === lower) ??
        all.find((w) => w.title.toLowerCase().includes(lower)) ??
        null
    }
    if (!wiki) return { status: "not_found" as const }
    const { stale, docs } = await sourceStatus(ctx, wiki)
    if (!wikiInAreas(wiki, docs, args.areas)) return { status: "out_of_area" as const, title: wiki.title }
    if (wiki.status !== "ready" || !wiki.content) {
      return { status: "not_ready" as const, title: wiki.title, wikiStatus: wiki.status }
    }
    const visible = visiblePoints(wiki, stale)
    return {
      status: "ok" as const,
      id: wiki._id as string,
      title: wiki.title,
      purpose: wiki.purpose,
      format: wiki.format ?? "overview",
      // Only composed blocks are in content: never staged, unchecked or awaiting text.
      intro: introText(visible.content),
      builtAt: wiki.generatedAt,
      withheldPoints: visible.hidden,
      sections: visible.sections
        .filter((s) => s.role !== "intro")
        .map((s) => {
          const main = s.blocks.find((b) => b.kind === "bullets" || b.kind === "steps" || b.kind === "table")
          return {
            heading: s.heading,
            kind: main?.kind ?? "bullets",
            safety: s.safety ?? false,
            columns: main?.columns ?? null,
            points: s.blocks.flatMap((b) =>
              b.points.map((p) => ({
                text: p.text,
                cells: p.cells ?? null,
                cites: [...new Set(p.citations.map((c) => `${c.namingCode} v${c.version}${c.section ? `, ${c.section}` : ""}`))],
                block: b.kind,
                origin: b.origin,
                writtenBy: b.authorName ?? null,
                ...(p.disputed
                  ? { disputed: `${p.disputed.otherNamingCode} v${p.disputed.otherVersion} says: ${p.disputed.otherQuote}` }
                  : {}),
              })),
            ),
          }
        })
        .filter((s) => s.points.length > 0),
      sources: wiki.sources
        .filter((s) => !stale.has(String(s.documentId)))
        .map((s) => ({ code: s.namingCode, version: s.version, title: s.title, documentId: s.documentId as string })),
    }
  },
})
