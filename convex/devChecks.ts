import { v } from "convex/values"
import { internalAction, internalMutation, internalQuery } from "./_generated/server"
import { internal } from "./_generated/api"
import { Doc, Id } from "./_generated/dataModel"
import { checkPoint, ProvidedExcerpt } from "./ai/grounding"
import { publishApproved } from "./documents"
import { resolveScope } from "./lib/scope"
import { requestGeneration } from "./wikis"
import { publishedVersion } from "./lib/published"

// Repeatable checks for slices 0 and 1 (docs/test-set.md). They exercise the
// real code paths on the fresh seed. DEV ONLY: the regeneration check
// publishes a document, so run `seedKnowledge:run` afterwards.
//
//   npx convex run seedKnowledge:run
//   npx convex run devChecks:run
//   npx convex run seedKnowledge:run

// Text that exists only in drafts of the seed (see convex/seedKnowledge.ts).
const DRAFT_ONLY = ["PX-9917", "MT-5521", "BL-7730"]

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
    const chunks = await ctx.db.query("chunks").take(5000)
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
      chunks: chunks.map((c) => ({ _id: c._id, documentId: c.documentId, version: c.version, text: c.text })),
      wikis,
    }
  },
})

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
    await publishApproved(ctx, approved, user._id)
    return { version: approved.currentVersion }
  },
})

function wikiText(w: Doc<"wikis"> | null): string {
  if (!w?.content) return ""
  return w.content.sections
    .flatMap((s) => [s.heading, ...s.points.map((p) => p.text)])
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

export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<{ passed: number; failed: number; checks: Check[] }> => {
    const checks: Check[] = []
    const add = (id: string, name: string, pass: boolean, evidence: string) =>
      checks.push({ id, name, pass, evidence })

    const snap = await ctx.runQuery(internal.devChecks.snapshot, {})
    const docByCode = new Map(snap.docs.map((d) => [d.namingCode, d]))
    const allChunkIds = snap.chunks.map((c) => c._id)

    // ---- 3. Ask serves Published only, in every scope ----
    const scopes: ({ kind: "library" } | { kind: "doc"; id: Id<"documents"> } | { kind: "asset"; id: Id<"assets"> })[] = [
      { kind: "library" },
      ...snap.docs.map((d) => ({ kind: "doc" as const, id: d._id })),
      ...snap.assets.map((id) => ({ kind: "asset" as const, id })),
    ]
    let served = 0
    const askLeaks: string[] = []
    for (const scope of scopes) {
      const rows: { text: string; documentNamingCode: string; chunkId: Id<"chunks"> }[] = await ctx.runQuery(
        internal.ai.ask.lookupAfterSearch,
        { chunkIds: allChunkIds, scope },
      )
      const overview: string = await ctx.runQuery(internal.ai.ask.buildScopeOverview, { scope })
      served += rows.length
      for (const r of rows) {
        const chunk = snap.chunks.find((c) => c._id === r.chunkId)!
        const doc = snap.docs.find((d) => d._id === chunk.documentId)!
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
    const probe = await waitForWiki(ctx, probeId, (w) => w.status !== "generating", 60000)
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

    const wikis = [...snap.wikis.map((w) => w._id), probeId]
    let points = 0
    const ungrounded: string[] = []
    for (const id of wikis) {
      const w = await ctx.runQuery(internal.devChecks.getWiki, { id })
      if (!w?.content) continue
      const inScope = new Map(
        (await ctx.runQuery(internal.devChecks.wikiScopeDocs, { wikiId: id })).map((d: { _id: Id<"documents">; version: number | null }) => [d._id, d.version]),
      )
      const after = await ctx.runQuery(internal.devChecks.snapshot, {})
      const chunkById = new Map(after.chunks.map((c) => [c._id, c]))
      for (const s of w.content.sections) {
        for (const p of s.points) {
          points += 1
          const provided = new Map<string, ProvidedExcerpt>()
          let traceable = p.citations.length > 0
          for (const c of p.citations) {
            const chunk = chunkById.get(c.chunkId)
            if (!chunk || chunk.documentId !== c.documentId || inScope.get(c.documentId) !== chunk.version) {
              traceable = false
              continue
            }
            provided.set(c.chunkId, { key: c.chunkId, text: chunk.text })
          }
          const recheck = checkPoint({ text: p.text, sources: p.citations.map((c) => c.chunkId) }, provided)
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

    // ---- Grounding check self-test ----
    const provided = new Map<string, ProvidedExcerpt>([
      ["E1", { key: "E1", text: "Tighten the die bolts crosswise to 40 Nm." }],
      ["E2", { key: "E2", text: "Purge with purge compound PX-4400 at 190 °C." }],
    ])
    const cases: [string, string[], boolean][] = [
      ["Tighten the die bolts to 40 Nm.", ["E1"], true],
      ["Tighten the die bolts to 45 Nm.", ["E1"], false],
      ["Purge with PX-9917.", ["E2"], false],
      ["Purge at 190 °C.", ["E9"], false],
      ["Purge the barrel before a colour change.", [], false],
      ["Use PX-4400 and tighten to 40 Nm.", ["E1", "E2"], true],
    ]
    const wrong = cases.filter(([text, sources, expect]) => checkPoint({ text, sources }, provided).ok !== expect)
    add(
      "G",
      "Grounding check accepts supported points and rejects unsupported ones",
      wrong.length === 0,
      wrong.length === 0 ? `${cases.length}/${cases.length} cases as expected` : `wrong: ${wrong.map((c) => c[0]).join("; ")}`,
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

    // ---- 6. Regeneration on publish ----
    const seeded = snap.wikis.find((w) => w.title === "Line 2 changeover essentials")
    if (!seeded) {
      add("6", "Wiki rebuilds after a source is published", false, "seeded Wiki not found; run seedKnowledge:run first")
    } else {
      const before = await ctx.runQuery(internal.devChecks.getWiki, { id: seeded._id })
      const t0 = Date.now()
      const { version } = await ctx.runMutation(internal.devChecks.publishWorkingDraft, { namingCode: "EXT-OPS-SOP-0001" })
      const after = await waitForWiki(
        ctx,
        seeded._id,
        (w) =>
          w.status === "ready" &&
          (w.generatedAt ?? 0) > (before?.generatedAt ?? 0) &&
          w.sources.some((s) => s.namingCode === "EXT-OPS-SOP-0001" && s.version === version),
        60000,
      )
      const ms = Date.now() - t0
      const nowUses = wikiText(after.wiki).includes("PX-9917")
      add(
        "6",
        "Wiki rebuilds within a minute after a source is published",
        Boolean(after.wiki?.sources.some((s) => s.namingCode === "EXT-OPS-SOP-0001" && s.version === version)) && ms < 60000,
        `published EXT-OPS-SOP-0001 v${version}; Wiki rebuilt from v${after.wiki?.sources.find((s) => s.namingCode === "EXT-OPS-SOP-0001")?.version} in ${ms} ms; new text (PX-9917) now present: ${nowUses ? "yes" : "no"}`,
      )
    }

    const failed = checks.filter((c) => !c.pass).length
    return { passed: checks.length - failed, failed, checks }
  },
})
