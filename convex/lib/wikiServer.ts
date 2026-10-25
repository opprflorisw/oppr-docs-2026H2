// Server helpers for the Wiki Outline (spec 6.4, Lane A): ids, order keys,
// the event log, applying a build to the blocks, and compose. Shared by
// convex/wikis.ts and convex/wikiBlocks.ts.
import type { MutationCtx, QueryCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import type { WithoutSystemFields } from "convex/server"
import { checkPoint, support, withTableHeaders, type ProvidedExcerpt } from "../ai/grounding"
import { openFindingsTouching, stillStands } from "../findings"
import { publishedVersion } from "./published"
import { resolveScope } from "./scope"
import {
  DEFAULT_MAX_DANGER,
  VISIBLE_STATUSES,
  pointKey,
  type BlockKind,
  type CalloutTone,
  type Citation,
  type ComposedBlock,
  type ComposedSection,
  type Outline,
  type Point,
  type SourceRef,
  type WikiContentV2,
} from "./wikiTypes"
import type { SaveGenerationInput, WikiEventKind } from "./wikiValidators"

export type WikiBlockRow = WithoutSystemFields<Doc<"wikiBlocks">>

/** A short id for a section ("s...") or block ("b..."), unique within a Wiki. */
export function newWikiId(prefix: "s" | "b"): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

const ORDER_STEP = 1000

/** Order key for the n-th block of a section; compare keys as strings. */
export function orderKey(n: number): string {
  return Math.round(n * ORDER_STEP).toString().padStart(12, "0")
}

/** A key between two neighbours, or null when they are adjacent (renumber the section then). */
export function orderBetween(before: string | null, after: string | null): string | null {
  const a = before === null ? 0 : Number(before)
  const b = after === null ? a + 2 * ORDER_STEP : Number(after)
  if (b - a < 2) return null
  return Math.floor((a + b) / 2).toString().padStart(12, "0")
}

/** Append one row to the Wiki's audit trail (spec 5.3). */
export async function logWikiEvent(
  ctx: MutationCtx,
  wikiId: Id<"wikis">,
  personId: Id<"people"> | null,
  kind: WikiEventKind,
  detail: string,
  extra: { blockId?: string; sectionId?: string } = {},
) {
  await ctx.db.insert("wikiEvents", {
    wikiId,
    at: Date.now(),
    personId,
    kind,
    detail,
    ...(extra.blockId ? { blockId: extra.blockId } : {}),
    ...(extra.sectionId ? { sectionId: extra.sectionId } : {}),
  })
}

export async function liveBlocks(ctx: QueryCtx, wikiId: Id<"wikis">): Promise<Doc<"wikiBlocks">[]> {
  return await ctx.db
    .query("wikiBlocks")
    .withIndex("by_wikiId_and_state", (q) => q.eq("wikiId", wikiId).eq("state", "live"))
    .take(1000)
}

/** Block rows without system fields, for the lossless build snapshot. */
export function snapshotBlocks(rows: Doc<"wikiBlocks">[]): WikiBlockRow[] {
  return rows.map(({ _id, _creationTime, ...rest }) => rest)
}

export function dependsOnOf(points: Point[]) {
  const seen = new Map<string, { documentId: Id<"documents">; version: number }>()
  for (const p of points)
    for (const c of p.citations) seen.set(`${c.documentId}@${c.version}`, { documentId: c.documentId, version: c.version })
  return [...seen.values()]
}

export function generatedRow(
  wikiId: Id<"wikis">,
  sectionId: string,
  blockId: string,
  n: number,
  kind: BlockKind,
  points: Point[],
  ticket: number,
  extra: { tone?: CalloutTone; columns?: string[]; dropped?: number; gap?: boolean; status?: "generating" } = {},
): WikiBlockRow {
  const gap = extra.gap || (points.length === 0 && kind !== "images")
  return {
    wikiId,
    sectionId,
    blockId,
    order: orderKey(n),
    state: "live",
    kind,
    origin: "generated",
    status: extra.status ?? (gap ? "gap" : "grounded"),
    ...(extra.tone ? { tone: extra.tone } : {}),
    ...(extra.columns?.length ? { columns: extra.columns } : {}),
    sourceSet: "scope",
    pinnedChunkIds: [],
    hiddenPointKeys: [],
    points: gap ? [] : points,
    dependsOn: dependsOnOf(points),
    generationTicket: ticket,
    droppedPoints: extra.dropped ?? 0,
    updatedAt: Date.now(),
  }
}

/**
 * Writes a build into the Outline and its live blocks. Mode "propose" (first
 * build) creates the Outline; mode "outline" fills generated blocks by id and
 * never touches written or edited blocks. Does not compose.
 */
export async function applyGeneration(ctx: MutationCtx, wiki: Doc<"wikis">, args: SaveGenerationInput) {
  const now = Date.now()
  if (args.mode === "propose") {
    for (const old of await liveBlocks(ctx, wiki._id)) await ctx.db.delete(old._id)
    const outline: Outline = { sections: [], introEnabled: true }
    const rows: WikiBlockRow[] = []
    if (args.intro || args.keyPoints) {
      const sid = newWikiId("s")
      outline.sections.push({ id: sid, heading: "Introduction", role: "intro", fold: "open" })
      let n = 1
      if (args.intro)
        rows.push(generatedRow(wiki._id, sid, args.intro.blockId || newWikiId("b"), n++, "intro", args.intro.points, args.ticket, { dropped: args.intro.dropped.length, gap: args.intro.gap }))
      if (args.keyPoints)
        rows.push(generatedRow(wiki._id, sid, args.keyPoints.blockId || newWikiId("b"), n++, "keyPoints", args.keyPoints.points, args.ticket, { dropped: args.keyPoints.dropped.length, gap: args.keyPoints.gap }))
    }
    for (const s of args.proposed ?? []) {
      const sid = newWikiId("s")
      outline.sections.push({
        id: sid,
        heading: s.heading,
        ...(s.instruction ? { instruction: s.instruction } : {}),
        ...(s.safety ? { safety: true } : {}),
        fold: "open",
      })
      s.blocks.forEach((b, i) =>
        rows.push(generatedRow(wiki._id, sid, newWikiId("b"), i + 1, b.kind, b.points, args.ticket, { tone: b.tone, columns: b.columns })),
      )
    }
    for (const r of rows) await ctx.db.insert("wikiBlocks", r)
    await ctx.db.patch(wiki._id, { outline, outlineUpdatedAt: now })
    return
  }
  const fill = async (g: SaveGenerationInput["intro"]) => {
    if (!g) return
    const row = (
      await ctx.db
        .query("wikiBlocks")
        .withIndex("by_wikiId_and_blockId", (q) => q.eq("wikiId", wiki._id).eq("blockId", g.blockId))
        .take(5)
    ).find((r) => r.state === "live")
    if (!row || row.origin !== "generated") return
    const gap = g.gap || g.points.length === 0
    await ctx.db.patch(row._id, {
      points: gap ? [] : g.points,
      status: gap ? "gap" : "grounded",
      ...(g.columns?.length && !row.columns?.length ? { columns: g.columns } : {}),
      dependsOn: dependsOnOf(g.points),
      generationTicket: args.ticket,
      droppedPoints: g.dropped.length,
      error: undefined,
      updatedAt: now,
    })
  }
  for (const g of args.blocks ?? []) await fill(g)
  await fill(args.intro)
  await fill(args.keyPoints)
}

async function personName(ctx: QueryCtx, cache: Map<string, string | null>, id: Id<"people"> | undefined) {
  if (!id) return undefined
  if (!cache.has(id)) cache.set(id, (await ctx.db.get(id))?.name ?? null)
  return cache.get(id) ?? undefined
}

// ---- Compose ----------------------------------------------------------------------

interface OpenSide {
  chunkId: Id<"chunks"> | null
  documentId: Id<"documents">
  namingCode: string
  version: number
  quote: string
}

/** Open contradiction Findings, still standing, that touch any of these Documents. */
async function openSides(ctx: QueryCtx, documentIds: Id<"documents">[]) {
  const seen = new Set<string>()
  const out: { findingId: Id<"findings">; a: OpenSide; b: OpenSide }[] = []
  for (const id of documentIds.slice(0, 40)) {
    for (const f of await openFindingsTouching(ctx, id)) {
      if (f.kind !== "contradiction" || seen.has(f._id)) continue
      seen.add(f._id)
      if (!(await stillStands(ctx, f))) continue
      const side = (s: typeof f.a): OpenSide => ({
        chunkId: s.chunkId ?? null,
        documentId: s.documentId,
        namingCode: s.namingCode,
        version: s.version,
        quote: s.quote,
      })
      out.push({ findingId: f._id, a: side(f.a), b: side(f.b) })
    }
  }
  return out
}

/**
 * The live Published passage texts of one Document version (table rows with
 * their headers, as generation and the check read them), keyed by chunk id.
 */
async function versionTexts(
  ctx: QueryCtx,
  cache: Map<string, Map<string, { text: string; section: string | null }>>,
  documentId: Id<"documents">,
  version: number,
) {
  const key = `${documentId}@${version}`
  const hit = cache.get(key)
  if (hit) return hit
  const chunks = (
    await ctx.db
      .query("chunks")
      .withIndex("by_documentId_and_version", (q) => q.eq("documentId", documentId).eq("version", version))
      .take(2000)
  ).sort((a, b) => a.seq - b.seq)
  const texts = withTableHeaders(chunks.map((c) => ({ text: c.text, section: c.pageOrSection })))
  const map = new Map(chunks.map((c, i) => [c._id as string, { text: texts[i], section: c.pageOrSection }]))
  cache.set(key, map)
  return map
}

/**
 * Code-only re-verification of one written point (spec 3.8): every citation
 * must point at the live Published version of its Document (a passage of an
 * older version is remapped by section to the live one) and checkPoint must
 * pass on it again. Returns the point with its live citations, or null.
 */
async function reverify(
  ctx: QueryCtx,
  cache: Map<string, Map<string, { text: string; section: string | null }>>,
  p: Point,
  exempt: boolean,
): Promise<Point | null> {
  if (p.citations.length === 0) return null
  const provided = new Map<string, ProvidedExcerpt>()
  const citations: Citation[] = []
  for (const c of p.citations) {
    const doc = await ctx.db.get(c.documentId)
    const live = doc ? publishedVersion(doc) : null
    if (!doc || live == null) return null
    const texts = await versionTexts(ctx, cache, c.documentId, live)
    let chunkId = c.chunkId as string
    if (live !== c.version || !texts.has(chunkId)) {
      // Remap: the passage of the live version in the same section that best says it.
      let best: { id: string; s: number } | null = null
      for (const [id, t] of texts) {
        if (t.section !== c.section) continue
        const s = support(p.text, t.text)
        if (!best || s > best.s) best = { id, s }
      }
      if (!best) return null
      chunkId = best.id
    }
    const t = texts.get(chunkId)!
    provided.set(chunkId, { key: chunkId, text: t.text, label: `${doc.namingCode} v${live} ${doc.title}` })
    citations.push({ chunkId: chunkId as Id<"chunks">, documentId: c.documentId, namingCode: doc.namingCode, version: live, section: t.section })
  }
  const same = citations.every((c, i) => c.chunkId === p.citations[i].chunkId && c.version === p.citations[i].version)
  // A claim only the AI judge supported and a second Engineer confirmed is
  // exempt from checkPoint while its passage is unchanged (spec 5.1, W1).
  if (exempt && same) return p
  if (!checkPoint({ text: p.text, sources: [...provided.keys()] }, provided).ok) return null
  return same ? p : { ...p, citations }
}

/** Point keys a check settled only through the AI judge (a second Engineer confirmed them). */
async function judgeOnlyKeys(ctx: QueryCtx, row: Doc<"wikiBlocks">): Promise<Set<string>> {
  if (!row.checkId || !row.confirmedBy) return new Set()
  const check = await ctx.db.get(row.checkId)
  if (!check) return new Set()
  return new Set(
    check.claims
      .filter((c) => c.verdict === "supportedByJudge" || (c.verdict === "disputed" && c.via === "judge"))
      .map((c) => pointKey(c.text)),
  )
}

const chunkSet = (p: Point) => p.citations.map((c) => String(c.chunkId)).sort().join(",")

export interface ComposeStats {
  deduped: number
  withheld: number
  turned: number
}

export interface Composed {
  content: WikiContentV2 | null
  stats: ComposeStats
  /** Written or edited rows that no longer pass (set needsRecheck), and rows whose citations were remapped. */
  recheck: Id<"wikiBlocks">[]
  remapped: { rowId: Id<"wikiBlocks">; points: Point[] }[]
}

/**
 * Outline plus live blocks with a visible status, as the read model
 * (spec 6.4 compose). Content is null when the Wiki has no Outline.
 *
 * Mode "normal": no content when nothing in the Scope is Published (check 7),
 * written points re-verified by code (3.8) and inside the Scope, `disputed` set or
 * the point withheld when the other side cannot be quoted (5.4), each fact
 * kept once by priority danger callout, intro, key points, then page order
 * (4.4), danger callouts past `maxDanger` shown as warnings (D5). Mode
 * "legacy" (migration, 6.3) only sets `disputed` and never drops a point.
 */
export async function composeWiki(
  ctx: QueryCtx,
  wiki: Doc<"wikis">,
  opts: { sources: SourceRef[]; model?: string; mode: "normal" | "legacy" },
): Promise<Composed> {
  const stats: ComposeStats = { deduped: 0, withheld: 0, turned: 0 }
  const out: Composed = { content: null, stats, recheck: [], remapped: [] }
  if (!wiki.outline) return out
  const legacy = opts.mode === "legacy"
  const rows = await liveBlocks(ctx, wiki._id)
  const names = new Map<string, string | null>()
  const texts = new Map<string, Map<string, { text: string; section: string | null }>>()
  const cited = new Set<Id<"documents">>()
  for (const r of rows) for (const p of r.points) for (const c of p.citations) cited.add(c.documentId)
  const findings = await openSides(ctx, [...cited])
  // Every point, generated or written, must cite the live Published version
  // of a Document in the Scope (check 5, spec 2.5). Builds always do; a
  // restored build, or a written block after its Document left the Scope, may not.
  const liveInScope = legacy
    ? null
    : new Map((await resolveScope(ctx, wiki.scope)).published.map((d) => [d._id as string, publishedVersion(d)]))
  // Nothing Published in the Scope: no content at all (check 7), also not written blocks.
  if (liveInScope && liveInScope.size === 0) return out
  const inScope = (p: Point) =>
    !liveInScope || (p.citations.length > 0 && p.citations.every((c) => liveInScope.get(c.documentId) === c.version))

  const sections: ComposedSection[] = []
  for (const s of wiki.outline.sections) {
    if (s.role === "intro" && !wiki.outline.introEnabled) continue
    const own = rows
      .filter((r) => r.sectionId === s.id && VISIBLE_STATUSES.includes(r.status))
      .sort((a, b) => a.order.localeCompare(b.order))
    const blocks: ComposedBlock[] = []
    for (const r of own) {
      const hidden = new Set(r.hiddenPointKeys)
      const gap = r.status === "gap"
      let points = gap ? [] : r.points.filter((p) => !hidden.has(p.pointKey))
      const written = r.origin !== "generated"
      if (written && !legacy && !gap) {
        const exempt = await judgeOnlyKeys(ctx, r)
        const checked: Point[] = []
        let failed = false
        for (const p of points) {
          const ok = await reverify(ctx, texts, p, exempt.has(p.pointKey))
          if (!ok || !inScope(ok)) {
            failed = true
            break
          }
          checked.push(ok)
        }
        if (failed) {
          out.recheck.push(r._id)
          continue
        }
        if (checked.some((p, i) => p !== points[i])) out.remapped.push({ rowId: r._id, points: checked })
        points = checked
      } else if (liveInScope && !gap) {
        const live = points.filter(inScope)
        stats.withheld += points.length - live.length
        points = live
      }
      // State both values (5.4): a point on one side of an open contradiction shows the other side.
      const kept: Point[] = []
      for (const p of points) {
        const chunks = new Set(p.citations.map((c) => String(c.chunkId)))
        const f = findings.find((x) => (x.a.chunkId && chunks.has(x.a.chunkId)) || (x.b.chunkId && chunks.has(x.b.chunkId)))
        if (!f) {
          kept.push(p)
          continue
        }
        const other = f.a.chunkId && chunks.has(f.a.chunkId) ? f.b : f.a
        if (!other.quote.trim()) {
          if (legacy) kept.push(p)
          else stats.withheld += 1
          continue
        }
        kept.push({
          ...p,
          disputed: p.disputed ?? {
            findingId: f.findingId,
            otherNamingCode: other.namingCode,
            otherVersion: other.version,
            otherQuote: other.quote.slice(0, 400),
          },
        })
      }
      if (!gap && kept.length === 0 && !(r.kind === "images" && r.figureIds?.length)) continue
      const person = written ? await personName(ctx, names, r.authorPersonId) : undefined
      const confirmer = await personName(ctx, names, r.confirmedBy)
      blocks.push({
        id: r.blockId,
        kind: gap ? "gap" : r.kind,
        origin: r.origin,
        ...(r.tone ? { tone: r.tone } : {}),
        ...(r.columns ? { columns: r.columns } : {}),
        ...(r.fold ? { fold: r.fold } : {}),
        points: kept,
        ...(person ? { authorName: person } : {}),
        ...(r.checkedAt ? { checkedAt: r.checkedAt } : {}),
        ...(confirmer ? { confirmedByName: confirmer } : {}),
        ...(r.figureIds?.length ? { figureIds: r.figureIds } : {}),
      })
    }
    if (blocks.length === 0) continue
    sections.push({
      id: s.id,
      heading: s.heading,
      ...(s.role ? { role: s.role } : {}),
      ...(s.safety ? { safety: true } : {}),
      // Safety sections cannot be closed by default (spec 3.2).
      fold: s.safety ? "open" : s.fold,
      blocks,
    })
  }

  if (!legacy) {
    // Each fact once (4.4): danger callouts first, then the intro, key points, page order.
    const flat = sections.flatMap((s) => s.blocks)
    const rank = (b: ComposedBlock) =>
      b.kind === "callout" && b.tone === "danger" ? 0 : b.kind === "intro" ? 1 : b.kind === "keyPoints" ? 2 : 3
    const order = flat.map((b, i) => ({ b, i })).sort((x, y) => rank(x.b) - rank(y.b) || x.i - y.i)
    const seen: { key: string; chunks: string; text: string }[] = []
    for (const { b } of order) {
      b.points = b.points.filter((p) => {
        const chunks = chunkSet(p)
        const dup = seen.some(
          (s) => s.key === p.pointKey || (s.chunks === chunks && support(p.text, s.text) >= 0.8 && support(s.text, p.text) >= 0.8),
        )
        if (dup) {
          stats.deduped += 1
          return false
        }
        seen.push({ key: p.pointKey, chunks, text: p.text })
        return true
      })
    }
    // Danger cap (D5): callouts past the limit read as warnings.
    const max = wiki.maxDanger ?? DEFAULT_MAX_DANGER
    let dangers = 0
    for (const b of flat) {
      if (b.kind !== "callout" || b.tone !== "danger" || b.points.length === 0) continue
      dangers += 1
      if (dangers > max) {
        b.tone = "warning"
        stats.turned += 1
      }
    }
  }

  const composed: ComposedSection[] = sections
    .map((s) => ({
      ...s,
      blocks: s.blocks.filter((b) => b.kind === "gap" || b.points.length > 0),
    }))
    .filter((s) => s.blocks.length > 0)
  const body = composed.filter((s) => s.role !== "intro")
  out.content = {
    v: 2,
    sections: composed,
    coverage: {
      documents: opts.sources.length,
      passagesRead: opts.sources.reduce((n, x) => n + (x.excerptsUsed ?? 0), 0),
      passagesTotal: opts.sources.reduce((n, x) => n + (x.excerptsTotal ?? 0), 0),
      covers: body.filter((s) => s.blocks.some((b) => b.kind !== "gap")).map((s) => s.heading),
      notCovered: body.filter((s) => s.blocks.every((b) => b.kind === "gap")).map((s) => s.heading),
      ...(opts.model === "stub" ? { stub: true } : {}),
    },
  }
  return out
}

/**
 * Compose and write `wikis.content` (normal mode) or `contentV2Pending`
 * (legacy mode). Written blocks that no longer pass are set to needsRecheck.
 */
export async function recompose(
  ctx: MutationCtx,
  wikiId: Id<"wikis">,
  mode: "normal" | "legacy" = "normal",
): Promise<Composed | null> {
  const wiki = await ctx.db.get(wikiId)
  if (!wiki?.outline) return null
  const res = await composeWiki(ctx, wiki, { sources: wiki.sources, model: wiki.model, mode })
  const now = Date.now()
  for (const id of res.recheck) await ctx.db.patch(id, { status: "needsRecheck", updatedAt: now })
  for (const r of res.remapped) await ctx.db.patch(r.rowId, { points: r.points, dependsOn: dependsOnOf(r.points), updatedAt: now })
  if (mode === "legacy") await ctx.db.patch(wikiId, { contentV2Pending: res.content ?? undefined })
  else await ctx.db.patch(wikiId, { content: res.content, updatedAt: now })
  return res
}

/** Compact point snapshot of a build, for "what changed" between builds. */
export function compactSnapshot(content: WikiContentV2 | null) {
  return (content?.sections ?? []).map((s) => ({
    heading: s.heading,
    points: s.blocks.flatMap((b) => b.points).map((p) => ({ text: p.text, chunkIds: p.citations.map((c) => c.chunkId) })),
  }))
}

/** Store a whole build (spec 5.3): Restore and migration rollback read these. */
export async function storeBuild(
  ctx: MutationCtx,
  wiki: Doc<"wikis">,
  reason: "build" | "apply" | "confirm" | "restore",
  personId: Id<"people"> | null,
  content: WikiContentV2 | null,
) {
  const fresh = (await ctx.db.get(wiki._id)) ?? wiki
  await ctx.db.insert("wikiBuilds", {
    wikiId: wiki._id,
    builtAt: Date.now(),
    trigger: reason === "build" ? fresh.lastTrigger : reason,
    sources: fresh.sources.map((s) => ({ documentId: s.documentId, namingCode: s.namingCode, version: s.version })),
    content: compactSnapshot(content),
    reason,
    personId,
    ...(content ? { contentV2: content } : {}),
    ...(fresh.outline ? { outline: fresh.outline } : {}),
    blocks: snapshotBlocks(await liveBlocks(ctx, wiki._id)),
    scope: fresh.scope,
    title: fresh.title,
    purpose: fresh.purpose,
    ...(fresh.model ? { model: fresh.model } : {}),
    ...(fresh.promptVersion ? { promptVersion: fresh.promptVersion } : {}),
  })
}
