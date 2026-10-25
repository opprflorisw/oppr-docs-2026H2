import { v } from "convex/values"
import { internalAction, internalMutation, internalQuery } from "./_generated/server"
import { internal } from "./_generated/api"
import { Doc, Id } from "./_generated/dataModel"
import { checkPoint, ProvidedExcerpt, withTableHeaders } from "./ai/grounding"
import { publishApproved } from "./documents"
import { resolveScope } from "./lib/scope"
import { allocate, MAX_WIKI_CHUNKS, pickChunks, requestGeneration } from "./wikis"
import { publishedVersion } from "./lib/published"
import { VISIBLE_STATUSES, allPoints, isContentV2, normaliseContent, pointKey, type Outline } from "./lib/wikiTypes"
import { assertBudget, allowance } from "./lib/aiBudget"
import { newWikiId, orderKey, recompose } from "./lib/wikiServer"
import { blockStatus, codeVerdict, splitClaims, valueConflict, type Found, type Settled } from "./ai/wikiCheck"
import { features } from "./ai/consistency"
import { splitSentences } from "./ai/grounding"
import { openFindingsTouching, stillStands } from "./findings"
import { walkBodyImages } from "./lib/imageWalker"
import { counterKey, parseNamingCode, resolveTypeToken } from "./naming"

// Repeatable checks for the showcase (docs/test-set.md). They exercise the
// real code paths on the fresh seed. DEV ONLY: the regeneration check
// publishes a document, so run `seedKnowledge:run` afterwards.
//
//   npx convex run seedKnowledge:run
//   npx convex run devChecks:run
//   npx convex run seedKnowledge:run

// Text that exists only in drafts of the seed (see convex/seedKnowledge.ts).
const DRAFT_ONLY = ["PX-9917", "MT-5521", "BL-7730"]
// A full Wiki build is one Claude call writing about 8k tokens: about 70 s.
const BUILD_WAIT_MS = 150_000

interface Check {
  id: string
  name: string
  pass: boolean
  evidence: string
}

export const snapshot = internalQuery({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query("documents").take(500)
    const assets = await ctx.db.query("assets").take(500)
    const links = await ctx.db.query("documentAssets").take(5000)
    const wikis = await ctx.db.query("wikis").take(100)
    return {
      docs: docs.map((d) => ({
        _id: d._id,
        namingCode: d.namingCode,
        status: d.status,
        liveVersion: d.liveVersion ?? null,
        currentVersion: d.currentVersion,
      })),
      assets: assets.map((a) => a._id),
      links: links.map((l) => ({ documentId: l.documentId, assetId: l.assetId })),
      wikis,
    }
  },
})

// Chunks carry 768-number embeddings, so reading them all in one query would
// pass the 16 MB read limit on a seeded plant: page through them instead.
export const chunkPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("chunks").paginate({ cursor: args.cursor, numItems: 400 })
    return {
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      chunks: page.page.map((c) => ({
        _id: c._id,
        documentId: c.documentId,
        version: c.version,
        seq: c.seq,
        section: c.pageOrSection,
        text: c.text,
      })),
    }
  },
})

type SnapChunk = { _id: Id<"chunks">; documentId: Id<"documents">; version: number; seq: number; section: string | null; text: string }

async function allChunks(ctx: { runQuery: (q: typeof internal.devChecks.chunkPage, a: { cursor: string | null }) => Promise<{ isDone: boolean; continueCursor: string; chunks: SnapChunk[] }> }): Promise<SnapChunk[]> {
  const out: SnapChunk[] = []
  let cursor: string | null = null
  for (;;) {
    const page: { isDone: boolean; continueCursor: string; chunks: SnapChunk[] } = await ctx.runQuery(internal.devChecks.chunkPage, { cursor })
    out.push(...page.chunks)
    if (page.isDone) return out
    cursor = page.continueCursor
  }
}

export const wikiScopeDocs = internalQuery({
  args: { wikiId: v.id("wikis") },
  handler: async (ctx, args) => {
    const w = await ctx.db.get(args.wikiId)
    if (!w) return []
    const { published } = await resolveScope(ctx, w.scope)
    return published.map((d) => ({ _id: d._id, version: publishedVersion(d) }))
  },
})

export const createProbeWiki = internalMutation({
  args: {
    title: v.string(),
    scope: v.object({
      areas: v.array(v.string()),
      disciplines: v.array(v.string()),
      assetIds: v.array(v.id("assets")),
      documentIds: v.array(v.id("documents")),
    }),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("wikis", {
      title: args.title,
      purpose: "Created by devChecks.",
      scope: args.scope,
      status: "generating",
      content: null,
      sources: [],
      generatedAt: null,
      generationTicket: 0,
      requestedAt: null,
      lastTrigger: null,
      droppedPoints: 0,
      error: null,
      createdBy: null,
      updatedAt: Date.now(),
    })
    await requestGeneration(ctx, id, "devChecks")
    return id
  },
})

export const getWiki = internalQuery({
  args: { id: v.id("wikis") },
  handler: async (ctx, args) => ctx.db.get(args.id),
})

/** Moves a document's working draft through review and publishes it. */
export const publishWorkingDraft = internalMutation({
  args: { namingCode: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("documents")
      .withIndex("by_namingCode", (q) => q.eq("namingCode", args.namingCode))
      .unique()
    if (!doc) throw new Error(`No document ${args.namingCode}`)
    const user = await ctx.db.query("users").first()
    if (!user) throw new Error("Needs at least one user for the sign-off trail")
    await ctx.db.patch(doc._id, { status: "approved" })
    const approved = (await ctx.db.get(doc._id)) as Doc<"documents">
    const engineer = (await ctx.db.query("people").take(50)).find((p) => p.kind === "engineer")
    await publishApproved(ctx, approved, user._id, engineer?._id)
    return { version: approved.currentVersion }
  },
})

/** Seed integrity: images, wrapped manuals and naming counters. */
export const seedIntegrity = internalQuery({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query("documents").take(500)
    const imageProblems: string[] = []
    const manualProblems: string[] = []
    let nativePublished = 0
    let imagesChecked = 0
    let manuals = 0
    let manualChunks = 0
    for (const d of docs) {
      const live = publishedVersion(d)
      if (live == null) continue
      const row = await ctx.db
        .query("documentVersions")
        .withIndex("by_documentId_and_version", (q) => q.eq("documentId", d._id).eq("version", live))
        .unique()
      if (!row) {
        imageProblems.push(`${d.namingCode}: live version v${live} missing`)
        continue
      }
      if (d.origin === "wrapped" || row.bodyKind === "pdf") {
        manuals++
        const stamped = row.pdfStorageId ? await ctx.db.system.get(row.pdfStorageId) : null
        const source = row.sourcePdfStorageId ? await ctx.db.system.get(row.sourcePdfStorageId) : null
        if (!stamped) manualProblems.push(`${d.namingCode}: no stamped PDF`)
        if (!source) manualProblems.push(`${d.namingCode}: no supplier original`)
        if (!row.stampLabel || !row.stampLabel.includes(`Published v${live}`))
          manualProblems.push(`${d.namingCode}: stamp says "${row.stampLabel ?? "nothing"}"`)
        const pages = row.pdfPageCount ?? 0
        if (pages < 1) manualProblems.push(`${d.namingCode}: no page count`)
        const chunks = await ctx.db
          .query("chunks")
          .withIndex("by_documentId_and_version", (q) => q.eq("documentId", d._id).eq("version", live))
          .take(2000)
        manualChunks += chunks.length
        if (chunks.length === 0) manualProblems.push(`${d.namingCode}: no page chunks`)
        const badPage = chunks.find((c) => {
          const m = /^Page (\d+)$/.exec(c.pageOrSection ?? "")
          return !m || Number(m[1]) < 1 || Number(m[1]) > pages
        })
        if (badPage) manualProblems.push(`${d.namingCode}: chunk section "${badPage.pageOrSection}" is not a page of the PDF`)
        continue
      }
      nativePublished++
      for (const ref of walkBodyImages(row.bodyJson)) {
        imagesChecked++
        if (!ref.imageId || ref.imageId.startsWith("key:")) {
          imageProblems.push(`${d.namingCode}: image "${ref.altText.slice(0, 40)}" not resolved`)
          continue
        }
        const img = await ctx.db.get(ref.imageId as Id<"images">)
        const file = img?.storageId ? await ctx.db.system.get(img.storageId) : null
        if (!img || !file) imageProblems.push(`${d.namingCode}: image ${ref.imageId} has no ${img ? "file" : "row"}`)
      }
    }

    const counters = new Map((await ctx.db.query("namingCounters").take(1000)).map((c) => [c.key, c.value]))
    const codes = new Set(docs.map((d) => d.namingCode))
    const counterProblems: string[] = []
    for (const d of docs) {
      const parsed = parseNamingCode(d.namingCode)
      if (!parsed || !d.location || !d.discipline) continue
      const key = counterKey(d.location, d.discipline, d.type)
      const value = counters.get(key) ?? 0
      if (value < parsed.seq) counterProblems.push(`${key} is at ${value}, below ${d.namingCode}`)
      const token = await resolveTypeToken(ctx, d.type)
      const next = `${d.location}-${d.discipline}-${token}-${String(value + 1).padStart(4, "0")}`
      if (codes.has(next)) counterProblems.push(`next code ${next} already exists`)
    }
    return {
      nativePublished,
      imagesChecked,
      imageProblems,
      manuals,
      manualChunks,
      manualProblems,
      counterKeys: counters.size,
      counterProblems: [...new Set(counterProblems)],
    }
  },
})

function wikiText(w: Doc<"wikis"> | null): string {
  const content = normaliseContent(w?.content)
  if (!content) return ""
  return content.sections
    .flatMap((s) => [s.heading, ...s.blocks.flatMap((b) => b.points.map((p) => p.text))])
    .join("\n")
}

async function waitForWiki(
  ctx: { runQuery: (q: typeof internal.devChecks.getWiki, a: { id: Id<"wikis"> }) => Promise<Doc<"wikis"> | null> },
  id: Id<"wikis">,
  done: (w: Doc<"wikis">) => boolean,
  timeoutMs: number,
): Promise<{ wiki: Doc<"wikis"> | null; ms: number }> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const w = await ctx.runQuery(internal.devChecks.getWiki, { id })
    if (w && done(w)) return { wiki: w, ms: Date.now() - start }
    await new Promise((r) => setTimeout(r, 500))
  }
  return { wiki: await ctx.runQuery(internal.devChecks.getWiki, { id }), ms: Date.now() - start }
}

/**
 * Check D: Training dates follow from what they rest on. Every Published
 * Training version is Published after each Document version it cites; every
 * Attempt and Training record of it comes after that; every Skill event that
 * names a pass ("Passed EXT-TRN-0002 v1") is on or after that record.
 */
export const trainingTimeline = internalQuery({
  args: {},
  handler: async (ctx) => {
    const day = (t: number) => new Date(t).toISOString().slice(0, 10)
    const problems: string[] = []
    const trainings = await ctx.db.query("trainings").take(500)
    const codeOf = new Map(trainings.map((t) => [t._id, t.code]))
    const publishedAt = new Map<string, number>()
    let versions = 0
    let citations = 0
    for (const t of trainings) {
      const rows = await ctx.db
        .query("trainingVersions")
        .withIndex("by_trainingId_and_version", (q) => q.eq("trainingId", t._id))
        .take(100)
      for (const tv of rows) {
        if (tv.publishedAt == null) continue
        versions++
        publishedAt.set(`${t._id}|${tv.version}`, tv.publishedAt)
        for (const o of tv.objectives) {
          citations++
          const dv = await ctx.db
            .query("documentVersions")
            .withIndex("by_documentId_and_version", (q) =>
              q.eq("documentId", o.documentId).eq("version", o.documentVersion),
            )
            .unique()
          if (!dv) problems.push(`${t.code} v${tv.version} cites missing ${o.namingCode} v${o.documentVersion}`)
          else if (!(dv.publishedAt < tv.publishedAt))
            problems.push(
              `${t.code} v${tv.version} Published ${day(tv.publishedAt)}, before ${o.namingCode} v${o.documentVersion} (${day(dv.publishedAt)})`,
            )
        }
      }
    }
    const attempts = await ctx.db.query("trainingAttempts").take(5000)
    for (const a of attempts) {
      const at = publishedAt.get(`${a.trainingId}|${a.trainingVersion}`)
      if (at == null) problems.push(`attempt on unpublished ${codeOf.get(a.trainingId)} v${a.trainingVersion}`)
      else if (a.startedAt < at)
        problems.push(`attempt ${codeOf.get(a.trainingId)} started ${day(a.startedAt)}, before its Publish ${day(at)}`)
    }
    const records = await ctx.db.query("trainingRecords").take(5000)
    for (const r of records) {
      const at = publishedAt.get(`${r.trainingId}|${r.trainingVersion}`)
      if (at == null) problems.push(`record of unpublished ${r.trainingCode} v${r.trainingVersion}`)
      else if (!(r.passedAt > at))
        problems.push(`record ${r.trainingCode} v${r.trainingVersion} passed ${day(r.passedAt)}, before its Publish ${day(at)}`)
    }
    const people = new Map((await ctx.db.query("people").take(500)).map((p) => [p._id, p.name]))
    const events = await ctx.db.query("skillEvents").take(5000)
    let fromTrainings = 0
    for (const e of events) {
      const m = /passed ([A-Z]{3}-TRN-\d{4}) v(\d+)/i.exec(e.reason)
      if (!m) continue
      fromTrainings++
      const hit = records.find(
        (r) => r.personId === e.personId && r.trainingCode === m[1] && r.trainingVersion === Number(m[2]) && r.passedAt <= e.at,
      )
      if (!hit)
        problems.push(`${people.get(e.personId) ?? "someone"}: "${e.reason}" on ${day(e.at)} has no record on or before it`)
    }
    return {
      versions,
      citations,
      attempts: attempts.length,
      records: records.length,
      events: fromTrainings,
      problems: [...new Set(problems)],
    }
  },
})

/** Open Findings with their two quotes, for check F. */
export const openFindings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("findings").take(500)
    return rows
      .filter((f) => f.status === "open")
      .map((f) => ({ kind: f.kind, a: f.a.namingCode, b: f.b.namingCode, text: `${f.a.quote} ${f.b.quote} ${f.summary}` }))
  },
})

// ---- Wiki upgrade checks (docs/specs/wiki-upgrade.md 8.2) ------------------------------

/**
 * Check 4, extended: block rows readers may not see never reach `content`
 * (and so neither MCP nor print), and draft-only text is in no block row.
 */
export const blockLeaks = internalQuery({
  args: {},
  handler: async (ctx) => {
    const problems: string[] = []
    let rows = 0
    for (const w of await ctx.db.query("wikis").take(200)) {
      const blocks = await ctx.db
        .query("wikiBlocks")
        .withIndex("by_wikiId_and_state", (q) => q.eq("wikiId", w._id))
        .take(1000)
      rows += blocks.length
      const shown = new Set(
        blocks.filter((b) => b.state === "live" && VISIBLE_STATUSES.includes(b.status)).map((b) => b.blockId),
      )
      const content = isContentV2(w.content) ? w.content : null
      for (const s of content?.sections ?? [])
        for (const b of s.blocks) if (!shown.has(b.id)) problems.push(`${w.title}: block ${b.id} is in content but not live and visible`)
      for (const b of blocks) {
        const text = [b.writtenText ?? "", ...b.points.map((p) => p.text)].join(" ")
        for (const d of DRAFT_ONLY) if (text.includes(d)) problems.push(`${w.title}: ${d} in a ${b.state} block row`)
      }
    }
    return { rows, problems }
  },
})

/** Points of composed written blocks that a second Engineer confirmed on the AI judge's word (exempt from checkPoint, W1). */
export const judgeConfirmedKeys = internalQuery({
  args: { wikiId: v.id("wikis") },
  handler: async (ctx, args) => {
    const keys: string[] = []
    for (const b of await ctx.db
      .query("wikiBlocks")
      .withIndex("by_wikiId_and_state", (q) => q.eq("wikiId", args.wikiId).eq("state", "live"))
      .take(1000)) {
      if (b.origin === "generated" || !b.confirmedBy || !b.checkId) continue
      const check = await ctx.db.get(b.checkId)
      for (const c of check?.claims ?? [])
        if (c.via === "judge" && (c.verdict === "supportedByJudge" || c.verdict === "disputed")) keys.push(pointKey(c.text))
    }
    return keys
  },
})

/** W1: every composed block is generated and grounded, or written and checked as ADR 0007 requires. */
export const composedBlockRules = internalQuery({
  args: {},
  handler: async (ctx) => {
    const problems: string[] = []
    let blocks = 0
    for (const w of await ctx.db.query("wikis").take(200)) {
      if (!isContentV2(w.content)) continue
      const rows = await ctx.db
        .query("wikiBlocks")
        .withIndex("by_wikiId_and_state", (q) => q.eq("wikiId", w._id).eq("state", "live"))
        .take(1000)
      const byId = new Map(rows.map((r) => [r.blockId, r]))
      for (const s of w.content.sections)
        for (const b of s.blocks) {
          blocks++
          const r = byId.get(b.id)
          if (!r) {
            problems.push(`${w.title}: ${b.id} has no live row`)
            continue
          }
          if (b.kind === "gap") {
            if (b.points.length) problems.push(`${w.title}: gap block ${b.id} has points`)
            continue
          }
          if (r.origin === "generated") {
            if (r.status !== "grounded") problems.push(`${w.title}: generated block ${b.id} is ${r.status}`)
            continue
          }
          if (r.status !== "checked") {
            problems.push(`${w.title}: written block ${b.id} is ${r.status}`)
            continue
          }
          const check = r.checkId ? await ctx.db.get(r.checkId) : null
          if (!check?.ok) {
            problems.push(`${w.title}: written block ${b.id} has no stored check`)
            continue
          }
          for (const c of check.claims) {
            const byCode = c.via === "code" && (c.verdict === "supported" || c.verdict === "disputed")
            const confirmed = !!r.confirmedBy && r.confirmedBy !== r.authorPersonId
            const byJudge = c.via === "judge" && (c.verdict === "supportedByJudge" || c.verdict === "disputed") && confirmed
            if (!byCode && !byJudge) problems.push(`${w.title}: written claim "${c.text.slice(0, 50)}" is ${c.verdict} via ${c.via}`)
          }
        }
    }
    return { blocks, problems }
  },
})

/** W5: no point cites one side of an open contradiction Finding without showing the other side. */
export const disputedShown = internalQuery({
  args: {},
  handler: async (ctx) => {
    const problems: string[] = []
    let checked = 0
    for (const w of await ctx.db.query("wikis").take(200)) {
      const points = allPoints(w.content)
      const docs = [...new Set(points.flatMap((p) => p.citations.map((c) => c.documentId)))]
      const sides = new Set<string>()
      for (const id of docs.slice(0, 40))
        for (const f of await openFindingsTouching(ctx, id)) {
          if (f.kind !== "contradiction" || !(await stillStands(ctx, f))) continue
          if (f.a.chunkId) sides.add(f.a.chunkId)
          if (f.b.chunkId) sides.add(f.b.chunkId)
        }
      for (const p of points) {
        if (!p.citations.some((c) => sides.has(c.chunkId))) continue
        checked++
        // Legacy content (not migrated yet) predates the rule.
        if (!p.disputed && isContentV2(w.content)) problems.push(`${w.title}: "${p.text.slice(0, 60)}"`)
      }
    }
    return { checked, problems }
  },
})

/**
 * W6: a written block whose cited passage no longer says it leaves `content`
 * at the next compose (code only), and one that still passes stays. Works on
 * a throwaway Wiki and deletes everything it wrote.
 */
export const reverifyWritten = internalMutation({
  args: {},
  handler: async (ctx) => {
    const docs = (await ctx.db.query("documents").take(500)).filter((d) => d.liveVersion != null && d.status !== "archived")
    let pick: { chunk: Doc<"chunks">; doc: Doc<"documents">; sentence: string } | null = null
    for (const d of docs) {
      const chunks = await ctx.db
        .query("chunks")
        .withIndex("by_documentId_and_version", (q) => q.eq("documentId", d._id).eq("version", d.liveVersion as number))
        .take(400)
      for (const c of chunks) {
        if (c.text.includes(" | ")) continue
        const sentence = splitSentences(c.text).find((x) => /\b\d{2,3}\s?(?:°C|Nm|minutes|mm|bar)\b/.test(x) && x.split(" ").length >= 6)
        if (sentence) {
          pick = { chunk: c, doc: d, sentence }
          break
        }
      }
      if (pick) break
    }
    if (!pick) return { ok: false, detail: "no Published passage with a value found" }
    const person = (await ctx.db.query("people").take(100)).find((p) => p.kind === "engineer")
    const changed = pick.sentence.replace(/\b(\d{2,3})(\s?(?:°C|Nm|minutes|mm|bar))\b/, (_m, n: string, u: string) => `${Number(n) + 7}${u}`)
    const cite = {
      chunkId: pick.chunk._id,
      documentId: pick.doc._id,
      namingCode: pick.doc.namingCode,
      version: pick.chunk.version,
      section: pick.chunk.pageOrSection,
    }
    const sid = newWikiId("s")
    const outline: Outline = { sections: [{ id: sid, heading: "Re-verification", fold: "open" }], introEnabled: false }
    const wikiId = await ctx.db.insert("wikis", {
      title: "devChecks W6",
      purpose: "Created by devChecks.",
      scope: { areas: [], disciplines: [], assetIds: [], documentIds: [pick.doc._id] },
      status: "ready",
      content: null,
      sources: [],
      generatedAt: null,
      generationTicket: 0,
      requestedAt: null,
      lastTrigger: null,
      droppedPoints: 0,
      error: null,
      createdBy: null,
      updatedAt: Date.now(),
      outline,
    })
    const row = (blockId: string, n: number, text: string) => ({
      wikiId,
      sectionId: sid,
      blockId,
      order: orderKey(n),
      state: "live" as const,
      kind: "prose" as const,
      origin: "written" as const,
      status: "checked" as const,
      sourceSet: "scope" as const,
      pinnedChunkIds: [],
      hiddenPointKeys: [],
      points: [{ text, pointKey: pointKey(text), citations: [cite] }],
      writtenText: text,
      dependsOn: [{ documentId: pick!.doc._id, version: pick!.chunk.version }],
      generationTicket: 0,
      droppedPoints: 0,
      ...(person ? { authorPersonId: person._id } : {}),
      updatedAt: Date.now(),
    })
    const keepId = await ctx.db.insert("wikiBlocks", row("bkeep", 1, pick.sentence))
    const dropId = await ctx.db.insert("wikiBlocks", row("bdrop", 2, changed))
    const res = await recompose(ctx, wikiId)
    const ids = new Set((res?.content?.sections ?? []).flatMap((s) => s.blocks.map((b) => b.id)))
    const dropRow = await ctx.db.get(dropId)
    const ok = ids.has("bkeep") && !ids.has("bdrop") && dropRow?.status === "needsRecheck"
    const detail = `kept "${pick.sentence.slice(0, 50)}" (${ids.has("bkeep") ? "shown" : "missing"}); changed value "${changed.slice(0, 50)}" ${ids.has("bdrop") ? "still shown" : "taken out"}, status ${dropRow?.status}`
    await ctx.db.delete(keepId)
    await ctx.db.delete(dropId)
    for (const e of await ctx.db.query("wikiEvents").withIndex("by_wikiId_and_at", (q) => q.eq("wikiId", wikiId)).take(50)) await ctx.db.delete(e._id)
    await ctx.db.delete(wikiId)
    return { ok, detail }
  },
})

/**
 * Budget (spec 6.6): the caps refuse the next action, failed actions do not
 * count, and the kill switch refuses everything. Writes test action rows and
 * deletes them in the same transaction, so nobody's allowance changes.
 */
export const budgetCaps = internalMutation({
  args: { wikiId: v.id("wikis") },
  handler: async (ctx, args) => {
    const people = await ctx.db.query("people").take(100)
    const engineers = people.filter((p) => p.kind === "engineer" || p.kind === "admin")
    const [a, b] = engineers
    if (!a || !b) return { ok: false, detail: "needs two Engineers" }
    const inserted: Id<"aiUsage">[] = []
    const add = async (n: number, row: { personId: Id<"people"> | null; action: string; ok?: boolean; wikiId?: Id<"wikis"> }) => {
      const time = Date.now() - 1000
      for (let i = 0; i < n; i++)
        inserted.push(
          await ctx.db.insert("aiUsage", {
            kind: "action",
            time,
            day: new Date(time).toISOString().slice(0, 10),
            feature: "devChecks",
            provider: "none",
            model: "",
            tokensIn: 0,
            tokensOut: 0,
            units: 0,
            latencyMs: 0,
            personId: row.personId,
            action: row.action,
            ...(row.ok !== undefined ? { ok: row.ok } : { ok: true }),
            ...(row.wikiId ? { targetKind: "wiki", targetId: row.wikiId as string } : {}),
          }),
        )
    }
    const clear = async () => {
      while (inserted.length) await ctx.db.delete(inserted.pop()!)
    }
    const refused = async (q: Parameters<typeof assertBudget>[1]) => {
      try {
        await assertBudget(ctx, q)
        return null
      } catch (e) {
        return e instanceof Error ? (e as { data?: unknown }).data ?? e.message : String(e)
      }
    }
    const out: string[] = []
    let ok = true
    // Person, per hour: the 31st block generation is refused; failed ones do not count.
    const left = (await allowance(ctx, { personId: a._id, wikiId: null })).person!.wikiBlock
    await add(Math.max(0, left - 1), { personId: a._id, action: "wikiBlock" })
    await add(5, { personId: a._id, action: "wikiBlock", ok: false })
    const allowed = await refused({ personId: a._id, wikiId: null, action: "wikiBlock" })
    await add(1, { personId: a._id, action: "wikiBlock" })
    const busy = await refused({ personId: a._id, wikiId: null, action: "wikiBlock" })
    ok &&= allowed === null && typeof busy === "string" && busy.startsWith("Busy")
    out.push(`person: last one allowed ${allowed === null ? "yes" : `no (${allowed})`}, next "${busy}"`)
    await clear()
    // Wiki, per day: the 61st action on one Wiki is refused.
    const wikiLeft = (await allowance(ctx, { personId: null, wikiId: args.wikiId })).wiki
    await add(wikiLeft, { personId: null, action: "wikiFind", wikiId: args.wikiId })
    const wikiFull = await refused({ personId: b._id, wikiId: args.wikiId, action: "wikiCheck" })
    ok &&= typeof wikiFull === "string" && wikiFull.startsWith("Daily limit for this Wiki")
    out.push(`Wiki: "${wikiFull}"`)
    await clear()
    // System, per day.
    const lim = (await ctx.db.query("aiSettings").first())?.systemDailyCap ?? 200
    await add(lim, { personId: null, action: "wikiBuild" })
    const sys = await refused({ personId: null, wikiId: null, action: "wikiBuild" })
    ok &&= typeof sys === "string" && sys.startsWith("Daily limit for automatic rebuilds")
    out.push(`system: "${sys}"`)
    await clear()
    // Kill switch (the setting; OPPR_WIKI_AI_OFF=1 works the same way).
    const settings = await ctx.db.query("aiSettings").first()
    const sid = settings?._id ?? (await ctx.db.insert("aiSettings", { updatedAt: Date.now() }))
    const was = settings?.wikiAiOff
    await ctx.db.patch(sid, { wikiAiOff: true })
    const off = await refused({ personId: a._id, wikiId: args.wikiId, action: "wikiBlock" })
    if (settings) await ctx.db.patch(sid, { wikiAiOff: was })
    else await ctx.db.delete(sid)
    ok &&= off === "AI is switched off for Wikis."
    out.push(`kill switch: "${off}"`)
    return { ok, detail: out.join("; ") }
  },
})

/** W2 setup: on a built Wiki, add a section with an instruction and a block to fill, rename one, move one. */
export const reshapeOutline = internalMutation({
  args: { wikiId: v.id("wikis") },
  handler: async (ctx, args) => {
    const w = await ctx.db.get(args.wikiId)
    if (!w?.outline) return null
    const sections = [...w.outline.sections]
    const body = sections.map((s, i) => ({ s, i })).filter((x) => x.s.role !== "intro")
    if (body.length < 2) return null
    const sid = newWikiId("s")
    sections.push({ id: sid, heading: "Who decides what in week 1", instruction: "Who decides what in week 1", fold: "open" })
    sections[body[0].i] = { ...sections[body[0].i], heading: `${sections[body[0].i].heading} (renamed)` }
    const [x, y] = [body[0].i, body[1].i]
    ;[sections[x], sections[y]] = [sections[y], sections[x]]
    await ctx.db.patch(args.wikiId, { outline: { ...w.outline, sections } })
    await ctx.db.insert("wikiBlocks", {
      wikiId: args.wikiId,
      sectionId: sid,
      blockId: newWikiId("b"),
      order: orderKey(1),
      state: "live",
      kind: "bullets",
      origin: "generated",
      status: "generating",
      instruction: "Who decides what in week 1",
      sourceSet: "scope",
      pinnedChunkIds: [],
      hiddenPointKeys: [],
      points: [],
      dependsOn: [],
      generationTicket: 0,
      droppedPoints: 0,
      updatedAt: Date.now(),
    })
    await requestGeneration(ctx, args.wikiId, "devChecks")
    return sections.map((s) => `${s.id}:${s.heading}`)
  },
})

/** Deletes a probe Wiki with its blocks, builds and events. Run: npx convex run devChecks:removeProbe '{"wikiId":"..."}' */
export const removeProbe = internalMutation({
  args: { wikiId: v.id("wikis") },
  handler: async (ctx, args) => {
    const w = await ctx.db.get(args.wikiId)
    if (!w || !w.title.startsWith("devChecks")) return false
    for (const r of await ctx.db.query("wikiBlocks").withIndex("by_wikiId_and_state", (q) => q.eq("wikiId", w._id)).take(1000)) await ctx.db.delete(r._id)
    for (const r of await ctx.db.query("wikiBuilds").withIndex("by_wikiId", (q) => q.eq("wikiId", w._id)).take(1000)) await ctx.db.delete(r._id)
    for (const r of await ctx.db.query("wikiEvents").withIndex("by_wikiId_and_at", (q) => q.eq("wikiId", w._id)).take(1000)) await ctx.db.delete(r._id)
    await ctx.db.delete(w._id)
    return true
  },
})

/** Check 6: the coalesced publish rebuild is due; run it now instead of in 10 minutes. */
export const runDueRebuild = internalMutation({
  args: { wikiId: v.id("wikis") },
  handler: async (ctx, args) => {
    const w = await ctx.db.get(args.wikiId)
    if (!w?.rebuildScheduledAt) return { scheduled: false }
    const dueIn = w.rebuildScheduledAt - Date.now()
    await requestGeneration(ctx, args.wikiId, w.lastTrigger ?? "publish")
    return { scheduled: true, dueIn }
  },
})

export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<{ passed: number; failed: number; checks: Check[] }> => {
    const checks: Check[] = []
    const add = (id: string, name: string, pass: boolean, evidence: string) =>
      checks.push({ id, name, pass, evidence })

    const snap = await ctx.runQuery(internal.devChecks.snapshot, {})
    const chunks = await allChunks(ctx)
    const chunkById = new Map(chunks.map((c) => [c._id, c]))
    const docById = new Map(snap.docs.map((d) => [d._id, d]))
    const docByCode = new Map(snap.docs.map((d) => [d.namingCode, d]))
    // What each scope is fed: every chunk that must NOT be served (drafts,
    // older versions, never-published documents), every chunk of the scope's
    // own documents, and a sample of other live chunks.
    const isLiveChunk = (c: SnapChunk) => {
      const d = docById.get(c.documentId)
      return !!d && d.status !== "archived" && d.liveVersion != null && c.version === d.liveVersion
    }
    const risky = chunks.filter((c) => !isLiveChunk(c)).map((c) => c._id)
    const sampleLive = chunks.filter(isLiveChunk).filter((_, i) => i % 25 === 0).map((c) => c._id)
    const feedFor = (scope: { kind: "library" } | { kind: "doc"; id: Id<"documents"> } | { kind: "asset"; id: Id<"assets"> }): Id<"chunks">[] => {
      if (scope.kind === "library") return chunks.map((c) => c._id)
      const own = new Set<string>(
        scope.kind === "doc" ? [scope.id] : snap.links.filter((l) => l.assetId === scope.id).map((l) => l.documentId),
      )
      return [...new Set([...risky, ...sampleLive, ...chunks.filter((c) => own.has(c.documentId)).map((c) => c._id)])]
    }

    // ---- D. Training dates follow from the Documents and passes they rest on ----
    const timeline = await ctx.runQuery(internal.devChecks.trainingTimeline, {})
    add(
      "D",
      "Trainings are Published after what they cite; records and Skill events after that",
      timeline.problems.length === 0,
      timeline.problems.length === 0
        ? `${timeline.versions} Published Training versions, ${timeline.citations} citations, ${timeline.attempts} attempts, ${timeline.records} records and ${timeline.events} Skill events from passes all in order`
        : timeline.problems.slice(0, 8).join("; "),
    )

    // ---- 3. Ask serves Published only, in every scope ----
    const scopes: ({ kind: "library" } | { kind: "doc"; id: Id<"documents"> } | { kind: "asset"; id: Id<"assets"> })[] = [
      { kind: "library" },
      ...snap.docs.map((d) => ({ kind: "doc" as const, id: d._id })),
      ...snap.assets.map((id) => ({ kind: "asset" as const, id })),
    ]
    let served = 0
    const askLeaks: string[] = []
    for (const scope of scopes) {
      const feed = feedFor(scope)
      const rows: { text: string; documentNamingCode: string; chunkId: Id<"chunks"> }[] = []
      for (let i = 0; i < feed.length; i += 400) {
        rows.push(
          ...(await ctx.runQuery(internal.ai.ask.lookupAfterSearch, { chunkIds: feed.slice(i, i + 400), scope })),
        )
      }
      const overview: string = await ctx.runQuery(internal.ai.ask.buildScopeOverview, { scope })
      served += rows.length
      for (const r of rows) {
        const chunk = chunkById.get(r.chunkId)!
        const doc = docById.get(chunk.documentId)!
        const okVersion = doc.status !== "archived" && doc.liveVersion != null && chunk.version === doc.liveVersion
        if (!okVersion) askLeaks.push(`${scope.kind}: ${doc.namingCode} v${chunk.version}`)
        for (const s of DRAFT_ONLY) if (r.text.includes(s)) askLeaks.push(`${scope.kind}: "${s}" in excerpt`)
      }
      for (const s of DRAFT_ONLY) if (overview.includes(s)) askLeaks.push(`${scope.kind}: "${s}" in overview`)
      for (const d of snap.docs.filter((d) => d.liveVersion == null)) {
        if (scope.kind === "library" && overview.includes(d.namingCode))
          askLeaks.push(`library overview lists unpublished ${d.namingCode}`)
      }
    }
    add(
      "3",
      "Ask never serves draft or unpublished text",
      askLeaks.length === 0,
      askLeaks.length === 0
        ? `${scopes.length} scopes, ${served} excerpts served, all from live versions; none contain ${DRAFT_ONLY.join(", ")}`
        : askLeaks.slice(0, 8).join("; "),
    )

    // ---- 4 + 5. Wiki leak test and grounding ----
    const sop = docByCode.get("EXT-OPS-SOP-0001")!
    const mixerDraft = docByCode.get("MIX-OPS-SOP-0001")!
    const probeId: Id<"wikis"> = await ctx.runMutation(internal.devChecks.createProbeWiki, {
      title: "devChecks probe",
      scope: { areas: ["EXT", "MIX"], disciplines: [], assetIds: [], documentIds: [sop._id, mixerDraft._id] },
    })
    const probe = await waitForWiki(ctx, probeId, (w) => w.status !== "generating", BUILD_WAIT_MS)
    const probeText = wikiText(probe.wiki)
    const leakHits = DRAFT_ONLY.filter((s) => probeText.includes(s))
    const sopSource = probe.wiki?.sources.find((s) => s.documentId === sop._id)
    add(
      "4",
      "Wiki never uses draft text; Built from shows the live version",
      probe.wiki?.status === "ready" && leakHits.length === 0 && sopSource?.version === sop.liveVersion &&
        !probe.wiki.sources.some((s) => s.documentId === mixerDraft._id),
      `status ${probe.wiki?.status}; draft-only strings found: ${leakHits.length ? leakHits.join(", ") : "none"}; ` +
        `EXT-OPS-SOP-0001 built from v${sopSource?.version} (live v${sop.liveVersion}, draft v${sop.currentVersion}); ` +
        `never-published MIX-OPS-SOP-0001 used: ${probe.wiki?.sources.some((s) => s.documentId === mixerDraft._id) ? "yes" : "no"}`,
    )

    {
      const leaks = await ctx.runQuery(internal.devChecks.blockLeaks, {})
      add(
        "4b",
        "Unapplied, unchecked and waiting blocks never reach readers; draft text is in no block",
        leaks.problems.length === 0,
        leaks.problems.length === 0
          ? `${leaks.rows} block rows checked; content holds only live, visible blocks; ${DRAFT_ONLY.join(", ")} in none`
          : leaks.problems.slice(0, 5).join("; "),
      )
    }

    const wikis = [...snap.wikis.map((w) => w._id), probeId]
    let points = 0
    const ungrounded: string[] = []
    for (const id of wikis) {
      const w = await ctx.runQuery(internal.devChecks.getWiki, { id })
      if (!w?.content) continue
      const inScope = new Map(
        (await ctx.runQuery(internal.devChecks.wikiScopeDocs, { wikiId: id })).map((d: { _id: Id<"documents">; version: number | null }) => [d._id, d.version]),
      )
      const after = await allChunks(ctx)
      // The generator reads table rows with their column headers; recheck
      // against exactly that text.
      const groups = new Map<string, SnapChunk[]>()
      for (const c of after) {
        const k = `${c.documentId}@${c.version}`
        groups.set(k, [...(groups.get(k) ?? []), c])
      }
      const readById = new Map<Id<"chunks">, SnapChunk>()
      for (const list of groups.values()) {
        list.sort((a, b) => a.seq - b.seq)
        const texts = withTableHeaders(list)
        list.forEach((c, i) => readById.set(c._id, { ...c, text: texts[i] }))
      }
      // Same label the generator gives the model (naming code, version, title).
      const titleOf = new Map(w.sources.map((src) => [src.documentId, src.title]))
      // Claims only the AI judge supported, confirmed by a second Engineer (W1 checks those rules).
      const judged = new Set<string>(await ctx.runQuery(internal.devChecks.judgeConfirmedKeys, { wikiId: id }))
      // Every point of every composed block: intro, prose, key points, callouts, rows, written.
      {
        for (const p of allPoints(w.content)) {
          points += 1
          const provided = new Map<string, ProvidedExcerpt>()
          let traceable = p.citations.length > 0
          for (const c of p.citations) {
            const chunk = readById.get(c.chunkId)
            if (!chunk || chunk.documentId !== c.documentId || inScope.get(c.documentId) !== chunk.version) {
              traceable = false
              continue
            }
            provided.set(c.chunkId, { key: c.chunkId, text: chunk.text, label: `${c.namingCode} v${c.version} ${titleOf.get(c.documentId) ?? ""}` })
          }
          const recheck = judged.has(p.pointKey) ? { ok: true } : checkPoint({ text: p.text, sources: p.citations.map((c) => c.chunkId) }, provided)
          if (!traceable || !recheck.ok) ungrounded.push(`${w.title}: "${p.text.slice(0, 60)}"`)
        }
      }
    }
    add(
      "5",
      "Every Wiki point traces to a Published passage in scope",
      points > 0 && ungrounded.length === 0,
      `${points - ungrounded.length}/${points} points traceable across ${wikis.length} Wikis` +
        (ungrounded.length ? `; failing: ${ungrounded.slice(0, 5).join("; ")}` : ""),
    )

    // ---- Grounding check self-test (pure, see convex/ai/grounding.ts) ----
    const provided = new Map<string, ProvidedExcerpt>([
      ["E1", { key: "E1", text: "Tighten the die bolts crosswise to 40 Nm.", label: "EXT-OPS-SOP-0001 v1" }],
      ["E2", { key: "E2", text: "Purge with purge compound PX-4400 at 190 °C until the melt runs clean, about 15 minutes." }],
      ["E3", { key: "E3", text: "Never reach into the haul-off or saw area while the line is only stopped. A stopped line can restart." }],
      ["E4", { key: "E4", text: "Keep the melt temperature between 170 and 220 °C." }],
      ["E5", { key: "E5", text: "Stop dosing when the hopper is below 20 %." }],
      ["E7", { key: "E7", text: "Set the calibration gap to 0,5 mm." }],
      ["E8", { key: "E8", text: "Start the screw rotation at 60 rpm before purging the barrel." }],
      ["E9", { key: "E9", text: "Keep the die above 190 °C during the changeover." }],
      ["E10", { key: "E10", text: "Leave the heater on during cleaning." }],
      ["E11", { key: "E11", text: "Reduce the screw speed to 60 rpm." }],
      ["E12", { key: "E12", text: "Only authorised staff may open the guarding." }],
      ["E13", { key: "E13", text: "Measure wall thickness on each of the first 15 pipes." }],
      ["E15", { key: "E15", text: "Parameter: Barrel temperature | Minimum: 170 °C | Maximum: 220 °C" }],
      ["E16", { key: "E16", text: "Replace the die bolts after 20 die changes or when the thread shows wear." }],
      ["E17", { key: "E17", text: "Wear heat-resistant gloves for any contact with the die." }],
      ["E18", { key: "E18", text: "Tighten the die bolts in a cross pattern to 45 Nm with the die at operating temperature." }],
      ["E14", { key: "E14", text: "Streaks of the old colour after 15 minutes | Purge not finished | Purge for another 5 minutes, then check again" }],
    ])
    // [case, point text, cited keys, expected to pass]
    const cases: [string, string, string[], boolean][] = [
      ["supported number", "Tighten the die bolts to 40 Nm.", ["E1"], true],
      ["wrong number", "Tighten the die bolts to 45 Nm.", ["E1"], false],
      ["draft-only code", "Purge with PX-9917.", ["E2"], false],
      ["unknown source key", "Purge at 190 °C.", ["E9"], false],
      ["no source", "Purge the barrel before a colour change.", [], false],
      ["two sources", "Use PX-4400 and tighten the die bolts to 40 Nm.", ["E1", "E2"], true],
      ["number as word", "Tighten the die bolts crosswise to forty Nm.", ["E1"], true],
      ["wrong number as word", "Tighten the die bolts crosswise to forty-five Nm.", ["E1"], false],
      ["unit swapped", "Tighten the die bolts to 40 °C.", ["E1"], false],
      ["range with en dash", "Keep the melt temperature at 170–220 °C.", ["E4"], true],
      ["range end changed", "Keep the melt temperature between 170 and 230 °C.", ["E4"], false],
      ["percent as word", "Stop dosing when the hopper is below 20 percent.", ["E5"], true],
      ["code with non-breaking hyphen", "Purge with purge compound PX‑4400.", ["E2"], true],
      ["code one digit off", "Purge with purge compound PX-4401.", ["E2"], false],
      ["document code from the cited label", "EXT-OPS-SOP-0001 says to tighten the die bolts to 40 Nm.", ["E1"], true],
      ["decimal comma", "Set the calibration gap to 0.5 mm.", ["E7"], true],
      ["negation dropped", "Reach into the haul-off or saw area while the line is only stopped.", ["E3"], false],
      ["negation kept", "Never reach into the saw area while the line is only stopped.", ["E3"], true],
      ["wrong excerpt with the same number", "Wear heat-resistant gloves above 190 °C.", ["E2"], false],
      ["merged claim cites one source", "Purge with PX-4400 and tighten the die bolts to 40 Nm.", ["E2"], false],
      ["order kept", "Start the screw rotation at 60 rpm before you purge the barrel.", ["E8"], true],
      ["order reversed", "Purge the barrel before you start the screw rotation at 60 rpm.", ["E8"], false],
      ["above kept", "Keep the die above 190 °C during the changeover.", ["E9"], true],
      ["above flipped to below", "Keep the die below 190 °C during the changeover.", ["E9"], false],
      ["on flipped to off", "Leave the heater off during cleaning.", ["E10"], false],
      ["reduce flipped to increase", "Increase the screw speed to 60 rpm.", ["E11"], false],
      ["restriction kept", "Only authorised staff may open the guarding.", ["E12"], true],
      ["restriction dropped", "Authorised staff may open the guarding.", ["E12"], false],
      ["counted noun kept", "Measure wall thickness on the first 15 pipes.", ["E13"], true],
      ["counted noun swapped", "Measure wall thickness for the first 15 minutes.", ["E13"], false],
      ["table row, one negated cell", "Streaks of the old colour after 15 minutes mean the purge is not finished. Purge for another 5 minutes, then check again.", ["E14"], true],
      ["min and max invented on a table row", "Barrel temperature must be 170 °C maximum and 220 °C minimum.", ["E15"], false],
      ["range from a table row kept", "Barrel temperature is 170 °C to 220 °C.", ["E15"], true],
      ["min and max from the table header kept", "Barrel temperature: minimum 170 °C, maximum 220 °C.", ["E15"], true],
      ["min and max swapped against the table header", "Barrel temperature: minimum 220 °C, maximum 170 °C.", ["E15"], false],
      ["or turned into and", "Replace the die bolts after 20 die changes and when the thread shows wear.", ["E16"], false],
      ["or kept", "Replace the die bolts after 20 die changes or when the thread shows wear.", ["E16"], true],
      ["restriction added", "Wear heat-resistant gloves only when touching the die.", ["E17"], false],
      ["at least instead of about", "Purge for at least 15 minutes.", ["E2"], false],
      ["hedge added", "Streaks of the old colour after 15 minutes usually mean the purge is not finished.", ["E14"], false],
      ["hot flipped to cold", "Tighten the die bolts to 45 Nm with the die cold.", ["E18"], false],
      ["table row, negation invented", "Streaks of the old colour after 15 minutes mean the purge is finished. Do not purge again.", ["E14"], false],
    ]
    const wrong = cases.filter(([, text, sources, expect]) => checkPoint({ text, sources }, provided).ok !== expect)
    add(
      "G",
      "Grounding check accepts supported points and rejects unsupported ones",
      wrong.length === 0,
      wrong.length === 0 ? `${cases.length}/${cases.length} cases as expected` : `wrong: ${wrong.map((c) => c[0]).join("; ")}`,
    )

    // ---- W3. Check against Published, the code stage (pure, convex/ai/wikiCheck.ts) ----
    {
      const P = (id: string, code: string, text: string, inScope = true): Found => ({
        chunkId: id as Id<"chunks">,
        documentId: `d${code}` as Id<"documents">,
        namingCode: code,
        title: `T ${code}`,
        version: 2,
        section: null,
        text,
        score: 0.8,
        inScope,
      })
      const barrel = P("c1", "EXT-MNT-MAN-0001", "Maximum barrel temperature on EXL-201 is 220 °C. Never run the barrel hotter.")
      const burn = P("c2", "EXT-HSE-SOP-0001", "First aid for burns: cool the burn under cool running water for 20 minutes. Do not use ice.")
      const guard = P("c3", "EXT-OPS-SOP-0002", "Do not open the guard while the line runs.")
      const range = P("c4", "EXT-OPS-SOP-0004", "Barrel temperature set point range is 170-220 °C for PE100.")
      const st = (verdict: Settled["result"]["verdict"], rests: Found | null): Settled => ({
        result: { text: "x", verdict, via: verdict === "supportedByJudge" ? "judge" : "code", reason: "", passages: [] },
        rests,
        statesBoth: false,
        disputed: null,
      })
      const cases: [string, boolean][] = [
        ["Supported by code", codeVerdict("Cool a burn under running water for 20 minutes.", [barrel, burn])?.verdict === "supported"],
        ["Differs (number)", codeVerdict("Barrel zones of EXL-201 are never above 230 °C.", [barrel, burn])?.verdict === "differs"],
        ["Differs (negation)", codeVerdict("Open the guard while the line runs.", [guard])?.verdict === "differs"],
        ["Not settled by code goes to the judge", codeVerdict("The canteen opens at 7 in the morning.", [burn, guard]) === null],
        ["Not covered gives notCovered", blockStatus([st("notCovered", null)], { confirmByAnother: false, scoped: true }) === "notCovered"],
        ["Judge-only support waits for a second Engineer", blockStatus([st("supported", burn), st("supportedByJudge", burn)], { confirmByAnother: false, scoped: true }) === "awaitingConfirm"],
        ["A value inside a range is no difference", valueConflict(features("Set the barrel to 200 °C."), features(range.text)) === null],
        ["Compound split into two claims", splitClaims("Wear gloves and keep the guard closed.").claims.length === 2],
        ["A range stays one claim", splitClaims("Keep the barrel between 170 and 220 °C.").claims.length === 1],
      ]
      const wrongW3 = cases.filter(([, pass]) => !pass).map(([n]) => n)
      add(
        "W3",
        "Check against Published: the code stage settles fixed claims as expected",
        wrongW3.length === 0,
        wrongW3.length === 0 ? `${cases.length}/${cases.length} cases as expected (no AI call)` : `wrong: ${wrongW3.join("; ")}`,
      )
    }

    // ---- Broad Scope: the passage budget (pure, see wikis.loadForGeneration) ----
    {
      const sizes = [3, 40, 400, 0]
      const got = allocate(sizes, MAX_WIKI_CHUNKS)
      const sum = got.reduce((a, b) => a + b, 0)
      const fair = got[0] === 3 && got[1] === 40 && got[2] === MAX_WIKI_CHUNKS - 43 && got[3] === 0 && sum <= MAX_WIKI_CHUNKS
      const long = Array.from({ length: 30 }, (_, i) => ({
        seq: i + 1,
        text: i === 0 ? "Heading" : i === 25 ? "Never open the saw guard while the blade turns." : `General remark about the line, part ${"abcdefghijklmnopqrstuvwxyz"[i % 26]}.`,
        pageOrSection: i === 0 ? "Heading" : "Body",
      }))
      const picked = pickChunks(long, 3, new Set<string>())
      const keepsSafety = picked.some((c) => c.seq === 26)
      const inOrder = picked.every((c, i) => i === 0 || picked[i - 1].seq < c.seq)
      const skipsHeading = !picked.some((c) => c.seq === 1)
      add(
        "B",
        "A broad Scope is read fairly and keeps safety passages",
        fair && keepsSafety && inOrder && skipsHeading,
        `budget for documents of [${sizes.join(", ")}] passages: [${got.join(", ")}] of ${MAX_WIKI_CHUNKS}; ` +
          `3 of 30 passages: safety passage kept ${keepsSafety ? "yes" : "no"}, document order ${inOrder ? "yes" : "no"}, bare heading skipped ${skipsHeading ? "yes" : "no"}`,
      )
    }

    // ---- Seed integrity (convex/seedKnowledge.ts) ----
    const integrity = await ctx.runQuery(internal.devChecks.seedIntegrity, {})
    add(
      "I",
      "Every Published native Document shows its images",
      integrity.nativePublished > 0 && integrity.imagesChecked > 0 && integrity.imageProblems.length === 0,
      `${integrity.imagesChecked} images across ${integrity.nativePublished} Published native Documents` +
        (integrity.imageProblems.length ? `; problems: ${integrity.imageProblems.slice(0, 5).join("; ")}` : ", all rows and files present"),
    )
    add(
      "M",
      "Every Published Wrapped manual has a stamped PDF and page passages",
      integrity.manuals > 0 && integrity.manualProblems.length === 0,
      `${integrity.manuals} Wrapped manuals, ${integrity.manualChunks} page passages` +
        (integrity.manualProblems.length ? `; problems: ${integrity.manualProblems.slice(0, 5).join("; ")}` : ", stamps say Published"),
    )
    {
      const leaks = chunks
        .filter(isLiveChunk)
        .flatMap((c) => DRAFT_ONLY.filter((s) => c.text.includes(s)).map((s) => `${docById.get(c.documentId)?.namingCode} v${c.version}: ${s}`))
      add(
        "S",
        "No Published passage contains draft-only text",
        leaks.length === 0,
        leaks.length === 0
          ? `${chunks.filter(isLiveChunk).length} Published passages checked for ${DRAFT_ONLY.join(", ")}`
          : leaks.slice(0, 5).join("; "),
      )
    }
    add(
      "N",
      "Naming counters continue after the seeded codes",
      integrity.counterKeys > 0 && integrity.counterProblems.length === 0,
      integrity.counterProblems.length === 0
        ? `${integrity.counterKeys} counters; the next code for every area, discipline and type is free`
        : integrity.counterProblems.slice(0, 5).join("; "),
    )

    // ---- 7. Empty scope ----
    const neverPublished = snap.docs.filter((d) => d.liveVersion == null).map((d) => d._id)
    const emptyId: Id<"wikis"> = await ctx.runMutation(internal.devChecks.createProbeWiki, {
      title: "devChecks empty",
      scope: { areas: [], disciplines: [], assetIds: [], documentIds: neverPublished },
    })
    const empty = await waitForWiki(ctx, emptyId, (w) => w.status !== "generating", 30000)
    add(
      "7",
      "A Scope with nothing Published gives an empty Wiki, not invented content",
      empty.wiki?.status === "empty" && empty.wiki.content === null,
      `status ${empty.wiki?.status}, content ${empty.wiki?.content === null ? "none" : "present"}`,
    )

    // ---- W1. Composed blocks follow ADR 0007 ----
    {
      const r = await ctx.runQuery(internal.devChecks.composedBlockRules, {})
      add(
        "W1",
        "Every composed block is grounded, or written and checked (judge-only claims confirmed by another Engineer)",
        r.blocks > 0 && r.problems.length === 0,
        `${r.blocks} composed blocks` + (r.problems.length ? `; ${r.problems.slice(0, 5).join("; ")}` : ", all as required"),
      )
    }

    // ---- W5. Both values stated on disputed points ----
    {
      const r = await ctx.runQuery(internal.devChecks.disputedShown, {})
      add(
        "W5",
        "No point rests on one side of an open contradiction without showing the other side",
        r.problems.length === 0,
        r.problems.length === 0 ? `${r.checked} points on a disputed passage, all show the other side` : r.problems.slice(0, 5).join("; "),
      )
    }

    // ---- W6. Written blocks are re-verified by code at compose ----
    {
      const r = await ctx.runMutation(internal.devChecks.reverifyWritten, {})
      add("W6", "A written block whose passage no longer says it leaves the Wiki at the next compose", r.ok, r.detail)
    }

    // ---- Budget: the caps in convex/lib/aiBudget.ts ----
    {
      const r = await ctx.runMutation(internal.devChecks.budgetCaps, { wikiId: probeId })
      add("A", "AI caps refuse the next action, ignore failed ones, and the kill switch stops all Wiki AI", r.ok, r.detail)
    }

    // ---- W2. The Outline survives a rebuild ----
    {
      const before = await ctx.runQuery(internal.devChecks.getWiki, { id: probeId })
      const shape: string[] | null = before?.outline ? await ctx.runMutation(internal.devChecks.reshapeOutline, { wikiId: probeId }) : null
      if (!shape) {
        add("W2", "Sections, headings and order survive a rebuild", false, `probe Wiki has no Outline to reshape (status ${before?.status})`)
      } else {
        const after = await waitForWiki(ctx, probeId, (w) => w.status !== "generating" && (w.generatedAt ?? 0) > (before?.generatedAt ?? 0), 120000)
        const got = (after.wiki?.outline?.sections ?? []).map((s) => `${s.id}:${s.heading}`)
        const same = JSON.stringify(got) === JSON.stringify(shape)
        add(
          "W2",
          "Sections, headings and order survive a rebuild",
          same && after.wiki?.status === "ready",
          `${shape.length} sections (one added with an instruction, one renamed, two swapped); after Rebuild: ${same ? "identical" : `changed to ${got.join(" | ")}`}, status ${after.wiki?.status}${after.wiki?.error ? ` (${after.wiki.error})` : ""}`,
        )
      }
    }

    // ---- 6. Regeneration on publish ----
    // ---- F. The Consistency check found every planted contradiction ----
    // Runs before check 6, which publishes a new version and re-checks.
    {
      const open: { kind: string; a: string; b: string; text: string }[] = await ctx.runQuery(
        internal.devChecks.openFindings,
        {},
      )
      const has = (kind: string, codes: [string, string], words: RegExp) =>
        open.some((f) => f.kind === kind && codes.includes(f.a) && codes.includes(f.b) && f.a !== f.b && words.test(f.text))
      const planted: [string, boolean][] = [
        ["40 vs 45 Nm die bolts", has("contradiction", ["EXT-OPS-SOP-0001", "EXT-MNT-MAN-0001"], /45\s*Nm/i)],
        ["230 vs 220 °C barrel", has("contradiction", ["EXT-OPS-SOP-0002", "EXT-MNT-MAN-0001"], /230/)],
        ["UT-200 calibration once a day vs every shift", has("contradiction", ["QCL-QA-SOP-0001", "QCL-QA-MAN-0001"], /shift/i)],
        ["vacuum tank section duplicated", has("duplicate", ["EXT-OPS-SOP-0002", "EXT-OPS-WI-0002"], /./)],
      ]
      const missing = planted.filter(([, ok]) => !ok).map(([n]) => n)
      add(
        "F",
        "The Consistency check finds the 3 planted contradictions and the planted duplicate",
        missing.length === 0,
        `${open.length} open Findings (${open.filter((f) => f.kind === "contradiction").length} contradictions); ` +
          (missing.length ? `missing: ${missing.join("; ")}` : "all 4 planted Findings present"),
      )
    }

    const seeded = snap.wikis.find((w) => w.title === "Line 2 changeover essentials")
    if (!seeded) {
      add("6", "Wiki rebuilds after a source is published", false, "seeded Wiki not found; run seedKnowledge:run first")
    } else {
      const before = await ctx.runQuery(internal.devChecks.getWiki, { id: seeded._id })
      const t0 = Date.now()
      const { version } = await ctx.runMutation(internal.devChecks.publishWorkingDraft, { namingCode: "EXT-OPS-SOP-0001" })
      // Publish triggers coalesce for 10 minutes (spec 3.8); run the due rebuild now.
      const due: { scheduled: boolean; dueIn?: number } = await ctx.runMutation(internal.devChecks.runDueRebuild, { wikiId: seeded._id })
      const after = await waitForWiki(
        ctx,
        seeded._id,
        (w) =>
          w.status === "ready" &&
          (w.generatedAt ?? 0) > (before?.generatedAt ?? 0) &&
          w.sources.some((s) => s.namingCode === "EXT-OPS-SOP-0001" && s.version === version),
        BUILD_WAIT_MS,
      )
      const ms = Date.now() - t0
      const nowUses = wikiText(after.wiki).includes("PX-9917")
      add(
        "6",
        "A publish schedules a coalesced Wiki rebuild that uses the new version",
        due.scheduled && Boolean(after.wiki?.sources.some((s) => s.namingCode === "EXT-OPS-SOP-0001" && s.version === version)) && ms < BUILD_WAIT_MS,
        `published EXT-OPS-SOP-0001 v${version}; rebuild ${due.scheduled ? `scheduled in ${Math.round((due.dueIn ?? 0) / 60000)} min, run now` : "NOT scheduled"}; Wiki rebuilt from v${after.wiki?.sources.find((s) => s.namingCode === "EXT-OPS-SOP-0001")?.version} in ${ms} ms; new text (PX-9917) now present: ${nowUses ? "yes" : "no"}`,
      )
    }

    // The probe Wikis are not left in the library.
    for (const id of [probeId, emptyId]) await ctx.runMutation(internal.devChecks.removeProbe, { wikiId: id })

    const failed = checks.filter((c) => !c.pass).length
    return { passed: checks.length - failed, failed, checks }
  },
})
