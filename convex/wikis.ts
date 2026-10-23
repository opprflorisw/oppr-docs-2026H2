import { v } from "convex/values"
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
import { resolveScope, Scope, scopeIsEmpty } from "./lib/scope"
import { isPublished } from "./lib/published"
import { contentStems } from "./ai/grounding"

// Wikis (CONTEXT.md): AI-generated overviews of Published Knowledge inside a
// Scope. People set the title, purpose and Scope (through Guided creation);
// the content is always generated. Generation lives in convex/ai/wiki.ts.

export const scopeValidator = v.object({
  areas: v.array(v.string()),
  disciplines: v.array(v.string()),
  assetIds: v.array(v.id("assets")),
  documentIds: v.array(v.id("documents")),
})

// Cap per generation so a broad Scope stays within one model call.
export const MAX_WIKI_CHUNKS = 160
// Every document that is read at all gets at least this many passages, so a
// very broad Scope reads fewer documents properly instead of all of them
// by one line each.
const MIN_CHUNKS_PER_DOC = 2
const SAFETY_RE = /\b(?:never|warning|caution|danger|must|lockout|tagout|ppe|gloves|hot|burn|isolat\w*|do not|don't)\b/i
const FACT_RE = /\d/

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

// ---- Queries ----------------------------------------------------------------

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const wikis = await ctx.db.query("wikis").take(200)
    wikis.sort((a, b) => b.updatedAt - a.updatedAt)
    const out = []
    for (const w of wikis) {
      const { stale } = await sourceStatus(ctx, w)
      const visible = visiblePoints(w, stale)
      out.push({
        _id: w._id,
        title: w.title,
        purpose: w.purpose,
        status: w.status,
        sourceCount: w.sources.length,
        pointCount: visible.shown,
        outdatedCount: stale.size,
        generatedAt: w.generatedAt,
        updatedAt: w.updatedAt,
      })
    }
    return out
  },
})

type OutdatedReason = "newer_version" | "archived" | "not_published" | "deleted"

/**
 * Which sources no longer match the Published state of their Document. A
 * source is stale when its Document published a newer version, was archived,
 * stopped being Published or was deleted after this content was generated.
 */
async function sourceStatus(ctx: QueryCtx, wiki: Doc<"wikis">) {
  const stale = new Map<string, { reason: OutdatedReason; liveVersion: number | null }>()
  const publishedAt = new Map<string, number>()
  for (const s of wiki.sources) {
    const d = await ctx.db.get(s.documentId)
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
  return { stale, publishedAt }
}

/**
 * Points whose every citation still points at the Published version of its
 * Document. A point that leans on a superseded, archived or deleted source is
 * withheld until the Wiki is rebuilt, so obsolete text is never shown as
 * truth (ISO 9001 7.5.3.2 d). This also covers a failed rebuild, which keeps
 * the previous content.
 */
function visiblePoints(wiki: Doc<"wikis">, stale: Map<string, unknown>) {
  let hidden = 0
  let shown = 0
  const sections = (wiki.content?.sections ?? [])
    .map((section) => {
      const points = section.points.filter((p) => {
        const ok = p.citations.every((c) => !stale.has(String(c.documentId)))
        if (ok) shown += 1
        else hidden += 1
        return ok
      })
      return { ...section, points }
    })
    .filter((section) => section.points.length > 0)
  return { sections, hidden, shown }
}

export const get = query({
  args: { id: v.id("wikis") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const wiki = await ctx.db.get(args.id)
    if (!wiki) return null
    const { stale, publishedAt } = await sourceStatus(ctx, wiki)
    const visible = visiblePoints(wiki, stale)
    const content = wiki.content
      ? { intro: wiki.content.intro, sections: visible.sections }
      : null
    // The cited passages, for hover previews and for jumping to the spot.
    const excerpts: Record<string, string> = {}
    for (const section of content?.sections ?? []) {
      for (const point of section.points) {
        for (const c of point.citations) {
          if (excerpts[c.chunkId] !== undefined) continue
          const chunk = await ctx.db.get(c.chunkId)
          if (chunk) excerpts[c.chunkId] = chunk.text
        }
      }
    }
    return {
      ...wiki,
      content,
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
    }
  },
})

/** Live preview for the Draft: what this Scope would be built from. */
export const previewScope = query({
  args: { scope: scopeValidator },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const { published, excluded } = await resolveScope(ctx, args.scope)
    return {
      empty: scopeIsEmpty(args.scope),
      published: published.map((d) => ({
        _id: d._id,
        namingCode: d.namingCode,
        title: d.title,
        version: d.liveVersion as number,
      })),
      excluded: excluded.map((d) => ({
        _id: d._id,
        namingCode: d.namingCode,
        title: d.title,
        status: d.status,
      })),
    }
  },
})

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
  return {
    areas: scope.areas,
    disciplines: scope.disciplines,
    assets: assets.map((a) => `${a.code} ${a.name}`),
    documents: docs.map((d) => `${d.namingCode} ${d.title}`),
  }
}

// ---- Mutations --------------------------------------------------------------

function cleanInput(title: string, purpose: string, scope: Scope) {
  const t = title.trim()
  if (!t) throw new Error("Give the Wiki a title.")
  if (scopeIsEmpty(scope))
    throw new Error("Choose at least one area, discipline, Asset or Document.")
  return { title: t, purpose: purpose.trim(), scope }
}

export const create = mutation({
  args: { title: v.string(), purpose: v.string(), scope: scopeValidator },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const input = cleanInput(args.title, args.purpose, args.scope)
    const now = Date.now()
    const id = await ctx.db.insert("wikis", {
      ...input,
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
    await requestGeneration(ctx, id, "created")
    return id
  },
})

export const update = mutation({
  args: {
    id: v.id("wikis"),
    title: v.string(),
    purpose: v.string(),
    scope: scopeValidator,
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const wiki = await ctx.db.get(args.id)
    if (!wiki) throw new Error("Wiki not found")
    const input = cleanInput(args.title, args.purpose, args.scope)
    await ctx.db.patch(args.id, { ...input, updatedAt: Date.now() })
    await requestGeneration(ctx, args.id, "scope changed")
  },
})

export const regenerate = mutation({
  args: { id: v.id("wikis") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    if (!(await ctx.db.get(args.id))) throw new Error("Wiki not found")
    await requestGeneration(ctx, args.id, "rebuilt by hand")
  },
})

export const remove = mutation({
  args: { id: v.id("wikis") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await ctx.db.delete(args.id)
  },
})

/**
 * Hand out a new generation ticket and schedule a run. Content stays visible
 * while the new run works; only the newest ticket may write its result.
 */
export async function requestGeneration(
  ctx: MutationCtx,
  wikiId: Id<"wikis">,
  trigger: string,
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
  })
  await ctx.scheduler.runAfter(0, internal.ai.wiki.generate, { wikiId, ticket })
}

/** Called from the Document lifecycle whenever a Document's Published state changes. */
export async function regenerateWikisForDocument(
  ctx: MutationCtx,
  documentId: Id<"documents">,
  trigger: string,
) {
  const wikis = await ctx.db.query("wikis").take(500)
  for (const w of wikis) {
    const usedBefore = w.sources.some((s) => s.documentId === documentId)
    let inScope = usedBefore
    if (!inScope) {
      const { published } = await resolveScope(ctx, w.scope)
      inScope = published.some((d) => d._id === documentId)
    }
    if (inScope) await requestGeneration(ctx, w._id, trigger)
  }
}

export const regenerateAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const wikis = await ctx.db.query("wikis").take(500)
    for (const w of wikis) await requestGeneration(ctx, w._id, "schedule")
    return wikis.length
  },
})

// ---- Generation support (used by convex/ai/wiki.ts) -------------------------

export const loadForGeneration = internalQuery({
  args: { wikiId: v.id("wikis") },
  handler: async (ctx, args) => {
    const wiki = await ctx.db.get(args.wikiId)
    if (!wiki) return null
    const { published } = await resolveScope(ctx, wiki.scope)
    const topic = new Set(contentStems(`${wiki.title} ${wiki.purpose}`))
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
    const maxDocs = Math.floor(MAX_WIKI_CHUNKS / MIN_CHUNKS_PER_DOC)
    const readable = new Set(
      all
        .map((x, i) => ({ i, s: contentStems(x.d.title).filter((s) => topic.has(s)).length }))
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .slice(0, maxDocs)
        .map((x) => x.i),
    )
    const budgets = allocate(
      all.map((x, i) => (readable.has(i) ? x.chunks.length : 0)),
      MAX_WIKI_CHUNKS,
    )
    const docs = all.map((x, i) => ({
      documentId: x.d._id,
      namingCode: x.d.namingCode,
      title: x.d.title,
      version: x.version,
      excerptsTotal: x.chunks.length,
      chunks: pickChunks(x.chunks, budgets[i], topic).map((c) => ({
        chunkId: c._id,
        text: c.text,
        section: c.pageOrSection,
      })),
    }))
    return {
      title: wiki.title,
      purpose: wiki.purpose,
      ticket: wiki.generationTicket,
      docs,
    }
  },
})

const citationValidator = v.object({
  chunkId: v.id("chunks"),
  documentId: v.id("documents"),
  namingCode: v.string(),
  version: v.number(),
  section: v.union(v.string(), v.null()),
})

export const saveGeneration = internalMutation({
  args: {
    wikiId: v.id("wikis"),
    ticket: v.number(),
    status: v.union(v.literal("ready"), v.literal("empty"), v.literal("failed")),
    content: v.union(
      v.null(),
      v.object({
        intro: v.string(),
        sections: v.array(
          v.object({
            heading: v.string(),
            points: v.array(
              v.object({
                text: v.string(),
                citations: v.array(citationValidator),
              }),
            ),
          }),
        ),
      }),
    ),
    sources: v.array(
      v.object({
        documentId: v.id("documents"),
        namingCode: v.string(),
        title: v.string(),
        version: v.number(),
        excerptsUsed: v.optional(v.number()),
        excerptsTotal: v.optional(v.number()),
      }),
    ),
    droppedPoints: v.number(),
    error: v.union(v.string(), v.null()),
  },
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
    await ctx.db.patch(args.wikiId, {
      status: args.status,
      content: args.content,
      sources: args.sources,
      droppedPoints: args.droppedPoints,
      generatedAt: now,
      error: null,
      updatedAt: now,
    })
    return true
  },
})
