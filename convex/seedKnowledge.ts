import { v } from "convex/values"
import { internalAction, internalMutation, internalQuery, MutationCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import { Doc, Id, TableNames } from "./_generated/dataModel"
import { counterKey, parseNamingCode } from "./naming"
import { FACTORY_PPE } from "./ppe"
import { DEFAULT_REVIEW_MONTHS } from "./documents"
import { addMonths } from "./skills"
import { requestGeneration } from "./wikis"
import { bodyChunks, pdfPageChunks } from "./lib/chunking"
import type { Node, SeedDoc, SupplierManual } from "./seed/builders"
import {
  AREAS,
  ASSETS,
  DISCIPLINES,
  PEOPLE,
  SEED_DOCS,
  SEED_MANUALS,
  SIGNERS,
  SITE,
  TYPES,
  WIKIS,
  liveEdition,
} from "./seed/content"
import { ensureMediaImpl } from "./seed/media"
import { buildSupplierPdfs } from "./seed/supplierPdfs"

// The seed of Oppr Knowledge: one rich, believable plant, Pijpwerk Noord,
// that makes PE pressure pipe (docs/build/full-showcase-plan.md, content
// catalogue). 3 areas, 4 disciplines, 7 Assets, 11 people, 20 Documents
// (16 written in the editor, 4 wrapped supplier manuals), 3 Wikis, then
// Trainings, Skills and insights from their own seed modules.
//
// Content lives in convex/seed/docs and convex/seed/manuals; images and
// supplier PDFs are generated once and cached in seedMedia (never wiped).
//
// Built-in test fixtures (docs/test-set.md):
//   - EXT-OPS-SOP-0001 is Published v1 with a newer v2 draft that switches
//     purge compound PX-4400 to PX-9917. "PX-9917" must never appear in Ask,
//     a Wiki, a Training or the floor until v2 is published.
//   - MIX-OPS-SOP-0001 is a never-published draft mentioning MT-5521.
//   - EXT-OPS-WI-0001 is in review and mentions BL-7730.
//   - EXT-OPS-WI-0003 is approved (the Home inbox shows Publish).
//   - EXT-MNT-SOP-0001 is Published v1 with v2 in review, marked as a
//     Significant change.
//   - Periodic reviews: EXT-HSE-SOP-0001 overdue by 10 days, EXT-MNT-MAN-0001
//     due in 20 days, MIX-OPS-WI-0001 due in 60 days.
//   - Deliberate contradictions for the Consistency check: die bolts 40 Nm
//     (EXT-OPS-SOP-0001) vs 45 Nm (EXT-MNT-MAN-0001); barrel never above
//     230 °C (EXT-OPS-SOP-0002) vs 220 °C maximum (EXT-MNT-MAN-0001); gauge
//     calibration once a day (QCL-QA-SOP-0001) vs every shift
//     (QCL-QA-MAN-0001); and a duplicated vacuum tank section
//     (EXT-OPS-SOP-0002 and EXT-OPS-WI-0002).
//
// Wipes app data (users, auth tables, templates, cover settings and the
// seedMedia cache are kept). Safe to run again; run on dev only:
//   npx convex run seedKnowledge:run

const DAY = 24 * 60 * 60 * 1000
const COMPANY = "Pijpwerk Noord"

// Every app table, in delete order. Kept: users and auth tables, templates,
// coverSettings, seedMedia.
const WIPE_TABLES: TableNames[] = [
  "captureMoments",
  "captureDrafts",
  "captureEntries",
  "captureSets",
  "captures",
  "coverageQuestions",
  "trainingSignals",
  "trainingAssignments",
  "tryOutRequests",
  "wikiBuilds",
  "mcpCalls",
  "mcpKeys",
  "skillEvents",
  "skillLevels",
  "skillProfiles",
  "skills",
  "trainingRecords",
  "trainingAttempts",
  "trainingVersions",
  "trainings",
  "insightReports",
  "contentFlags",
  "usageEvents",
  "askEvents",
  "proposedRevisions",
  "findings",
  "consistencyRuns",
  "qaMessages",
  "qaSessions",
  "wikis",
  "chunks",
  "imageUsages",
  "images",
  "documentLogRefs",
  "documentAssets",
  "documentVersions",
  "documents",
  "importJobs",
  "assetLogs",
  "logs",
  "assets",
  "namingCounters",
  "namingTypes",
  "namingDisciplines",
  "namingLocations",
  "ppeItems",
  "people",
  "meta",
]

// ---- Wipe ----------------------------------------------------------------------------

/** Blobs a row owns (deleted with it unless the seedMedia cache holds them). */
function blobsOf(table: TableNames, row: Record<string, unknown>): string[] {
  const out: unknown[] = []
  if (table === "documentVersions") out.push(row.pdfStorageId, row.sourcePdfStorageId)
  if (table === "images") out.push(row.storageId)
  if (table === "importJobs") out.push(row.sourceStorageId)
  if (table === "assets") out.push(row.imageStorageId)
  if (table === "captureEntries") out.push(row.storageId)
  if (table === "trainingAttempts") {
    const round = row.round as { evidence?: { storageId?: unknown }[] } | null
    for (const e of round?.evidence ?? []) out.push(e.storageId)
  }
  return out.filter((x): x is string => typeof x === "string" && x.length > 0)
}

/** Deletes up to ~300 rows per call; the action calls it until done. */
export const wipeBatch = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ done: boolean; deleted: number }> => {
    const keep = new Set<string>((await ctx.db.query("seedMedia").take(2000)).map((m) => m.storageId))
    let budget = 300
    let deleted = 0
    for (const table of WIPE_TABLES) {
      if (budget <= 0) break
      const rows = await ctx.db.query(table).take(budget)
      for (const row of rows) {
        for (const blob of blobsOf(table, row as unknown as Record<string, unknown>)) {
          if (keep.has(blob)) continue
          try {
            await ctx.storage.delete(blob as Id<"_storage">)
          } catch {
            // Already gone.
          }
          keep.add(blob) // never delete the same blob twice
        }
        await ctx.db.delete(row._id)
        deleted++
      }
      budget -= rows.length
    }
    return { done: deleted === 0, deleted }
  },
})

// ---- Base: vocabulary, people, Assets, images -----------------------------------------

const mediaArg = v.array(
  v.object({
    key: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    byteSize: v.number(),
  }),
)

/** Alt text of each image key, from the first body that uses it. */
function altTexts(): Map<string, string> {
  const out = new Map<string, string>()
  const visit = (n: Node) => {
    if (n.type === "image") {
      const id = String(n.attrs?.["data-image-id"] ?? "")
      if (id.startsWith("key:") && !out.has(id.slice(4))) out.set(id.slice(4), String(n.attrs?.alt ?? ""))
    }
    for (const c of n.content ?? []) visit(c)
  }
  for (const d of SEED_DOCS) for (const e of d.editions) visit(e.body)
  return out
}

function extOf(contentType: string): string {
  return contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg"
}

export const writeBase = internalMutation({
  args: { now: v.number(), media: mediaArg },
  handler: async (ctx, args) => {
    const media = new Map(args.media.map((m) => [m.key, m]))

    for (const a of AREAS) await ctx.db.insert("namingLocations", { code: a.code, label: a.label })
    for (const d of DISCIPLINES) await ctx.db.insert("namingDisciplines", { code: d.code, label: d.label })
    for (const [i, ty] of TYPES.entries()) {
      await ctx.db.insert("namingTypes", { ...ty, active: true, builtIn: true, sortOrder: i })
    }
    for (const [i, item] of FACTORY_PPE.entries()) {
      await ctx.db.insert("ppeItems", {
        slug: item.slug,
        label: item.label,
        labelEn: item.label,
        labelNl: item.labelNl,
        description: item.description,
        descriptionNl: item.descriptionNl,
        pictogramId: item.pictogramId,
        storageId: null,
        active: true,
        builtIn: true,
        sortOrder: i,
      })
    }

    // Cover settings are kept across reseeds; the company on exported PDFs is
    // the seeded plant unless someone already set their own.
    const cover = await ctx.db.query("coverSettings").first()
    if (!cover) {
      await ctx.db.insert("coverSettings", {
        companyName: COMPANY,
        headerText: null,
        footerText: null,
        titleSize: "md",
        logoImageId: null,
        showPageNumbers: true,
        confidentialityLabel: null,
        defaultWatermark: null,
        accentColor: null,
        updatedAt: args.now,
      })
    } else if (!cover.companyName || /holliday/i.test(cover.companyName)) {
      await ctx.db.patch(cover._id, { companyName: COMPANY, updatedAt: args.now })
    }

    const people: { name: string; id: Id<"people"> }[] = []
    for (const [i, person] of PEOPLE.entries()) {
      people.push({ name: person.name, id: await ctx.db.insert("people", { ...person, sortOrder: i }) })
    }

    const assets: { code: string; id: Id<"assets"> }[] = []
    for (const [i, a] of ASSETS.entries()) {
      const id = await ctx.db.insert("assets", {
        code: a.code,
        name: a.name,
        site: SITE,
        location: AREAS.find((x) => x.code === a.area)?.label ?? null,
        qrToken: `qr-${a.code.toLowerCase()}`,
        description: a.description,
        level: 0,
        floorplan: null,
        isLinked: false,
        linkedLogCode: null,
        linkedLogName: null,
        linkedLogDescription: null,
        pinNumber: i + 1,
        pinX: a.pinX,
        pinY: a.pinY,
        imageStorageId: media.get(a.photo.key)?.storageId ?? null,
        source: "local",
      })
      assets.push({ code: a.code, id })
    }

    // Image library rows for every illustration used in a Document body.
    const alts = altTexts()
    const images: { key: string; id: Id<"images"> }[] = []
    for (const d of SEED_DOCS) {
      const firstPublished = d.editions[0].publishedDaysAgo
      for (const spec of d.images) {
        const m = media.get(spec.key)
        if (!m) continue
        const id = await ctx.db.insert("images", {
          source: "upload",
          storageId: m.storageId,
          externalUrl: null,
          filename: `${spec.key.replace(/\//g, "-")}.${extOf(m.contentType)}`,
          contentType: m.contentType,
          byteSize: m.byteSize,
          width: null,
          height: null,
          sha256: null,
          altText: alts.get(spec.key) ?? "",
          uploadedBy: null,
          createdAt: args.now - ((firstPublished ?? 1) + 7) * DAY,
        })
        images.push({ key: spec.key, id })
      }
    }
    return { people, assets, images }
  },
})

// ---- Documents -------------------------------------------------------------------------

interface Plan {
  code: string
  title: string
  type: string
  area: string
  discipline: string
  status: Doc<"documents">["status"]
  origin: "editor" | "wrapped"
  supplier: string | null
  editions: { publishedDaysAgo: number | null }[]
  nextReviewInDays: number | null
  tags: string[]
}

function plans(): Plan[] {
  const native: Plan[] = SEED_DOCS.map((d: SeedDoc) => ({
    code: d.code,
    title: d.title,
    type: d.type,
    area: d.area,
    discipline: d.discipline,
    status: d.status,
    origin: "editor",
    supplier: null,
    editions: d.editions.map((e) => ({ publishedDaysAgo: e.publishedDaysAgo })),
    nextReviewInDays: d.nextReviewInDays,
    tags: d.tags ?? [],
  }))
  const wrapped: Plan[] = SEED_MANUALS.map((m: SupplierManual) => ({
    code: m.code,
    title: m.title,
    type: "manual",
    area: m.area,
    discipline: m.discipline,
    status: "published",
    origin: "wrapped",
    supplier: m.supplier,
    editions: [{ publishedDaysAgo: m.publishedDaysAgo }],
    nextReviewInDays: m.nextReviewInDays,
    tags: [],
  }))
  return [...native, ...wrapped].sort((a, b) => a.code.localeCompare(b.code))
}

export const writeDocumentRows = internalMutation({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").first()
    const userId = user?._id ?? null
    const out: { code: string; id: Id<"documents"> }[] = []
    // Lifecycle roles as people (the seeded Engineers), the same names as the
    // version sign-offs: Owner is the author, then the reviewer and approver.
    // Drafts and documents in review show "Waiting for <name>" without a new submit.
    const engineers = new Map(
      (await ctx.db.query("people").take(200)).filter((x) => x.kind === "engineer").map((x) => [x.name, x._id]),
    )
    for (const p of plans()) {
      const live = liveEdition(p)
      const liveAgo = live != null ? p.editions[live - 1].publishedDaysAgo : null
      const lastAgo = p.editions[p.editions.length - 1].publishedDaysAgo
      const signers = SIGNERS[p.discipline] ?? SIGNERS.OPS
      const id = await ctx.db.insert("documents", {
        ownerPersonId: engineers.get(signers.author) ?? null,
        reviewerPersonId: engineers.get(signers.reviewer) ?? null,
        approverPersonId: engineers.get(signers.approver) ?? null,
        namingCode: p.code,
        location: p.area,
        discipline: p.discipline,
        title: p.title,
        type: p.type,
        status: p.status,
        currentVersion: p.editions.length,
        ...(live != null ? { liveVersion: live } : {}),
        ownerId: userId,
        authorId: userId,
        reviewerId: userId,
        approverId: userId,
        tags: p.tags,
        updatedAt: args.now - (lastAgo ?? 1) * DAY,
        reviewIntervalMonths: DEFAULT_REVIEW_MONTHS,
        nextReviewAt: live != null && p.nextReviewInDays != null ? args.now + p.nextReviewInDays * DAY : null,
        // The last review is the publish, or a later periodic review that
        // confirmed it: one interval before the next review is due.
        lastReviewedAt:
          liveAgo == null
            ? null
            : p.nextReviewInDays == null
              ? args.now - liveAgo * DAY
              : Math.max(
                  args.now - liveAgo * DAY,
                  addMonths(args.now + p.nextReviewInDays * DAY, -DEFAULT_REVIEW_MONTHS),
                ),
        origin: p.origin,
        supplier: p.supplier,
      })
      out.push({ code: p.code, id })
    }
    return out
  },
})

const refsArg = v.object({
  docs: v.array(v.object({ code: v.string(), id: v.id("documents") })),
  assets: v.array(v.object({ code: v.string(), id: v.id("assets") })),
  images: v.array(v.object({ key: v.string(), id: v.id("images") })),
  people: v.array(v.object({ name: v.string(), id: v.id("people") })),
})

/** Resolve CODE / KEY placeholders (builders.ts) to ids. Missing images are dropped. */
function resolveBody(
  body: Node,
  ids: { docs: Map<string, string>; assets: Map<string, string>; images: Map<string, string> },
): { body: Node; imageIds: string[]; assetCodes: string[] } {
  const imageIds: string[] = []
  const assetCodes: string[] = []
  const visit = (n: Node): Node | null => {
    const out: Node = { ...n, ...(n.attrs ? { attrs: { ...n.attrs } } : {}) }
    if (n.type === "image") {
      const ref = String(n.attrs?.["data-image-id"] ?? "")
      if (ref.startsWith("key:")) {
        const id = ids.images.get(ref.slice(4))
        if (!id) return null
        out.attrs!["data-image-id"] = id
        imageIds.push(id)
      }
    }
    if (n.type === "linkedAsset") {
      const code = String(n.attrs?.assetCode ?? "")
      out.attrs!.assetId = ids.assets.get(code) ?? null
      if (ids.assets.has(code)) assetCodes.push(code)
    }
    if (n.type === "referenceDoc") {
      out.attrs!.docId = ids.docs.get(String(n.attrs?.code ?? "")) ?? null
    }
    if (n.content) out.content = n.content.map(visit).filter((c): c is Node => c !== null)
    return out
  }
  return { body: visit(body)!, imageIds, assetCodes }
}

type Signoff = NonNullable<Doc<"documentVersions">["signoffs"]>[number]

function signoffsFor(
  discipline: string,
  stage: "published" | "approved" | "authored",
  at: number,
  userId: Id<"users"> | null,
  personId: (name: string) => Id<"people"> | undefined,
): Signoff[] {
  if (!userId) return []
  const s = SIGNERS[discipline] ?? SIGNERS.OPS
  // A Published version: written 9 days and reviewed 3 days before `at`.
  // A working version starts at `at` with the author's sign-off, so the
  // History drawer's "Started" date and the author date are the same day.
  if (stage === "published")
    return [
      { role: "author", userId, at: at - 9 * DAY, personId: personId(s.author) },
      { role: "reviewer", userId, at: at - 3 * DAY, personId: personId(s.reviewer) },
      { role: "approver", userId, at, personId: personId(s.approver) },
    ]
  const out: Signoff[] = [{ role: "author", userId, at, personId: personId(s.author) }]
  if (stage === "approved") out.push({ role: "reviewer", userId, at: at + 4 * DAY, personId: personId(s.reviewer) })
  return out
}

async function insertChunks(
  ctx: MutationCtx,
  documentId: Id<"documents">,
  version: number,
  chunks: { text: string; section: string | null }[],
) {
  for (const [seq, c] of chunks.entries()) {
    await ctx.db.insert("chunks", {
      documentId,
      version,
      seq: seq + 1,
      text: c.text,
      pageOrSection: c.section,
      embedding: null,
      embeddingModel: null,
    })
  }
  return chunks.length
}

/** Versions, chunks, Asset links and image usages of one Document. */
export const writeDocumentVersions = internalMutation({
  args: {
    code: v.string(),
    now: v.number(),
    refs: refsArg,
    manual: v.optional(
      v.object({
        sourceStorageId: v.id("_storage"),
        stampedStorageId: v.id("_storage"),
        pageTexts: v.array(v.string()),
        pageCount: v.number(),
        stampLabel: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").first()
    const userId = user?._id ?? null
    const docs = new Map(args.refs.docs.map((d) => [d.code, d.id as string]))
    const assets = new Map(args.refs.assets.map((a) => [a.code, a.id as string]))
    const images = new Map(args.refs.images.map((i) => [i.key, i.id as string]))
    const people = new Map(args.refs.people.map((p) => [p.name, p.id]))
    const personId = (name: string) => people.get(name)
    const documentId = docs.get(args.code) as Id<"documents"> | undefined
    if (!documentId) throw new Error(`No document row for ${args.code}`)
    const doc = await ctx.db.get(documentId)
    if (!doc) throw new Error(`Document row for ${args.code} disappeared`)

    let versions = 0
    let chunks = 0
    let usages = 0
    const linked = new Set<string>()

    const native = SEED_DOCS.find((d) => d.code === args.code)
    const wrapped = SEED_MANUALS.find((m) => m.code === args.code)
    if (native) {
      native.assets.forEach((c) => linked.add(c))
      for (const [i, ed] of native.editions.entries()) {
        const version = i + 1
        const isLast = version === native.editions.length
        const published = ed.publishedDaysAgo != null
        // A working version was started (and signed by its author) 8 days ago.
        const at = published ? args.now - ed.publishedDaysAgo! * DAY : args.now - 8 * DAY
        const stage = published ? "published" : isLast && native.status === "approved" ? "approved" : "authored"
        const resolved = resolveBody(ed.body, { docs, assets, images })
        await ctx.db.insert("documentVersions", {
          documentId,
          version,
          bodyKind: "tiptap",
          bodyJson: resolved.body,
          pdfStorageId: null,
          publishedAt: at,
          signoffs: signoffsFor(native.discipline, stage, at, userId, personId),
          ...(ed.significantChange != null ? { significantChange: ed.significantChange } : {}),
          ...(ed.changeNote != null ? { changeNote: ed.changeNote } : {}),
        })
        versions++
        chunks += await insertChunks(ctx, documentId, version, bodyChunks(resolved.body))
        // Asset links follow what the live and the working version mention.
        if (version === doc.liveVersion || isLast) resolved.assetCodes.forEach((c) => linked.add(c))
        for (const imageId of new Set(resolved.imageIds)) {
          await ctx.db.insert("imageUsages", {
            imageId: imageId as Id<"images">,
            documentId,
            documentVersion: version,
            context: "body",
            createdAt: at,
          })
          usages++
        }
      }
    } else if (wrapped && args.manual) {
      wrapped.assets.forEach((c) => linked.add(c))
      const at = args.now - wrapped.publishedDaysAgo * DAY
      await ctx.db.insert("documentVersions", {
        documentId,
        version: 1,
        bodyKind: "pdf",
        bodyJson: null,
        pdfStorageId: args.manual.stampedStorageId,
        sourcePdfStorageId: args.manual.sourceStorageId,
        pdfPageCount: args.manual.pageCount,
        stampLabel: args.manual.stampLabel,
        publishedAt: at,
        signoffs: signoffsFor(wrapped.discipline, "published", at, userId, personId),
      })
      versions++
      chunks += await insertChunks(ctx, documentId, 1, pdfPageChunks(args.manual.pageTexts))
    } else {
      throw new Error(`No content for ${args.code}`)
    }

    for (const code of linked) {
      const assetId = assets.get(code) as Id<"assets"> | undefined
      if (assetId) await ctx.db.insert("documentAssets", { documentId, assetId })
    }
    return { versions, chunks, usages, assets: linked.size }
  },
})

/** Naming counters: the next allocated code continues after the highest seeded one. */
export const writeCounters = internalMutation({
  args: {},
  handler: async (ctx) => {
    const max = new Map<string, number>()
    for (const d of await ctx.db.query("documents").take(2000)) {
      const parsed = parseNamingCode(d.namingCode)
      if (!parsed || !d.location || !d.discipline) continue
      const key = counterKey(d.location, d.discipline, d.type)
      max.set(key, Math.max(max.get(key) ?? 0, parsed.seq))
    }
    for (const [key, value] of max) await ctx.db.insert("namingCounters", { key, value })
    return max.size
  },
})

export const writeWikis = internalMutation({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").first()
    let n = 0
    for (const w of WIKIS) {
      const assetIds: Id<"assets">[] = []
      for (const code of w.scope.assetCodes) {
        const a = await ctx.db.query("assets").withIndex("by_code", (q) => q.eq("code", code)).first()
        if (a) assetIds.push(a._id)
      }
      const documentIds: Id<"documents">[] = []
      for (const code of w.scope.documentCodes) {
        const d = await ctx.db
          .query("documents")
          .withIndex("by_namingCode", (q) => q.eq("namingCode", code))
          .first()
        if (d) documentIds.push(d._id)
      }
      const id = await ctx.db.insert("wikis", {
        title: w.title,
        purpose: w.purpose,
        scope: { areas: w.scope.areas, disciplines: w.scope.disciplines, assetIds, documentIds },
        status: "generating",
        content: null,
        sources: [],
        generatedAt: null,
        generationTicket: 0,
        requestedAt: null,
        lastTrigger: null,
        droppedPoints: 0,
        error: null,
        createdBy: user?._id ?? null,
        updatedAt: args.now,
      })
      await requestGeneration(ctx, id, "seed")
      n++
    }
    return n
  },
})

export const counts = internalQuery({
  args: {},
  handler: async (ctx): Promise<Record<string, number>> => {
    const n = async (t: TableNames) => (await ctx.db.query(t).take(10000)).length
    return {
      people: await n("people"),
      assets: await n("assets"),
      documents: await n("documents"),
      versions: await n("documentVersions"),
      chunks: await n("chunks"),
      images: await n("images"),
      imageUsages: await n("imageUsages"),
      documentAssets: await n("documentAssets"),
      namingCounters: await n("namingCounters"),
      wikis: await n("wikis"),
      trainings: await n("trainings"),
      trainingRecords: await n("trainingRecords"),
      skills: await n("skills"),
      skillLevels: await n("skillLevels"),
      askEvents: await n("askEvents"),
      usageEvents: await n("usageEvents"),
    }
  },
})

// ---- Entry point ------------------------------------------------------------------------

export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<Record<string, unknown>> => {
    const t0 = Date.now()
    const now = Date.now()

    // 1. Images (cached; only missing or changed prompts cost anything).
    const media = await ensureMediaImpl(ctx, {})
    // 2. Supplier PDFs: render (original cached), stamp a Published v1 copy.
    const manuals = await buildSupplierPdfs(ctx, SEED_MANUALS, media.media, now)

    // 3. Wipe.
    let wiped = 0
    for (let i = 0; i < 1000; i++) {
      const r: { done: boolean; deleted: number } = await ctx.runMutation(internal.seedKnowledge.wipeBatch, {})
      wiped += r.deleted
      if (r.done) break
    }

    // 4. Vocabulary, people, Assets, image rows.
    const base: {
      people: { name: string; id: Id<"people"> }[]
      assets: { code: string; id: Id<"assets"> }[]
      images: { key: string; id: Id<"images"> }[]
    } = await ctx.runMutation(internal.seedKnowledge.writeBase, { now, media: media.media })

    // 5. Documents: rows first (so references resolve), then each one's versions.
    const docs: { code: string; id: Id<"documents"> }[] = await ctx.runMutation(
      internal.seedKnowledge.writeDocumentRows,
      { now },
    )
    const refs = { docs, ...base }
    let versions = 0
    let chunks = 0
    for (const d of docs) {
      const m = manuals.find((x) => x.code === d.code)
      const r: { versions: number; chunks: number } = await ctx.runMutation(
        internal.seedKnowledge.writeDocumentVersions,
        {
          code: d.code,
          now,
          refs,
          ...(m
            ? {
                manual: {
                  sourceStorageId: m.sourceStorageId,
                  stampedStorageId: m.stampedStorageId,
                  pageTexts: m.pageTexts,
                  pageCount: m.pageCount,
                  stampLabel: m.stampLabel,
                },
              }
            : {}),
        },
      )
      versions += r.versions
      chunks += r.chunks
    }
    await ctx.runMutation(internal.seedKnowledge.writeCounters, {})

    // 6. Trainings, Skills, insights (each owned by its track; a failure in
    //    one is reported, not fatal).
    const modules: Record<string, unknown> = {}
    const steps = [
      ["trainings", internal.seed.trainings.run],
      ["skills", internal.seed.skills.run],
      ["insights", internal.seed.insights.run],
      ["coverageQuestions", internal.seed.coverageQuestions.run],
      ["captures", internal.seed.captures.run],
      ["peopleSettings", internal.seed.peopleSettings.run],
      ["plant", internal.seed.plant.run],
      ["imagesMeta", internal.seed.imagesMeta.run],
    ] as const
    for (const [name, fn] of steps) {
      try {
        modules[name] = await ctx.runMutation(fn, {})
      } catch (e) {
        modules[name] = { error: e instanceof Error ? e.message : String(e) }
        console.error(`seed module ${name} failed:`, e)
      }
    }

    // Templates are kept by the wipe; upsert the seeded one by name so an
    // old row is renamed rather than shown with its old name.
    try {
      modules.templates = await ctx.runMutation(internal.seedTemplates.upsert, {})
    } catch (e) {
      modules.templates = { error: e instanceof Error ? e.message : String(e) }
    }

    // 7. Wikis (generated in the background).
    const wikis: number = await ctx.runMutation(internal.seedKnowledge.writeWikis, { now })

    // 8. Embeddings for Ask, staggered to stay under the rate limit, then the
    //    real Consistency check once they are written.
    for (const [i, d] of docs.entries()) {
      await ctx.scheduler.runAfter(i * 1500, internal.ai.embed.embedMissingInternal, { documentId: d.id })
    }
    await ctx.scheduler.runAfter(90_000, internal.ai.consistency.runAll, { trigger: "seed" })

    const totals: Record<string, number> = await ctx.runQuery(internal.seedKnowledge.counts, {})
    return {
      ok: true,
      seconds: Math.round((Date.now() - t0) / 1000),
      media: { generated: media.generated, reused: media.reused, failed: media.failed },
      supplierPdfs: manuals.map((m) => `${m.code}: ${m.pageCount} pages${m.cached ? " (cached)" : ""}`),
      wiped,
      written: { documents: docs.length, versions, chunks, wikis },
      modules,
      totals,
    }
  },
})
