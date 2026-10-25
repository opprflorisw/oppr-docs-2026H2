// Data access for the MCP endpoint (docs/adr/0004). Internal only: the
// endpoint (server.ts) authenticates the key, then calls these.
//
// Rules, the same as Ask (convex/lib/published.ts):
//   - Reads see the live Published version of non-archived Documents only.
//     Drafts, documents in review and the next edition being drafted are
//     invisible.
//   - `areas` is the key's area limit (empty = all areas). Every read and
//     write stays inside it.
//   - Writes create drafts and signals only. Nothing here publishes,
//     approves, signs off or deletes.
import { v } from "convex/values"
import { internalMutation, internalQuery, MutationCtx, QueryCtx } from "../_generated/server"
import { internal } from "../_generated/api"
import { Doc, Id } from "../_generated/dataModel"
import { isPublished, publishedVersion } from "../lib/published"
import { bodyChunks } from "../lib/chunking"
import { allocateNamingCode } from "../naming"
import { EXPIRING_WINDOW_DAYS, effectiveLevel, isExpired, shiftOf } from "../skills"
import { BLOCK_FORMAT, CALLOUT_LEVELS, MAX_DRAFTS_PER_HOUR } from "./tools"
import { ImportBlock, blocksToTiptap, tiptapToText } from "./render"

const DAY = 24 * 60 * 60 * 1000
type Ctx = QueryCtx | MutationCtx

const areasArg = v.array(v.string())

function inAreas(areas: string[], code: string | null | undefined): boolean {
  return areas.length === 0 || (!!code && areas.includes(code))
}

/** Area label → code. Assets store the area label in `location`. */
async function areaCodeByLabel(ctx: Ctx) {
  const rows = await ctx.db.query("namingLocations").take(200)
  return new Map(rows.map((r) => [r.label, r.code]))
}

function assetArea(a: Doc<"assets">, byLabel: Map<string, string>): string | null {
  if (!a.location) return null
  const code = byLabel.get(a.location)
  if (code) return code
  // Some rows may store the code itself.
  return [...byLabel.values()].includes(a.location) ? a.location : null
}

async function publishedDocs(ctx: Ctx, areas: string[]) {
  const docs = await ctx.db.query("documents").take(2000)
  return docs.filter((d) => isPublished(d) && inAreas(areas, d.location))
}

async function docByCode(ctx: Ctx, code: string) {
  return await ctx.db
    .query("documents")
    .withIndex("by_namingCode", (q) => q.eq("namingCode", code.trim().toUpperCase()))
    .unique()
}

async function liveChunks(ctx: Ctx, d: Doc<"documents">) {
  const version = publishedVersion(d)
  if (version == null) return []
  return await ctx.db
    .query("chunks")
    .withIndex("by_documentId_and_version", (q) => q.eq("documentId", d._id).eq("version", version))
    .take(2000)
}

async function ppeLabelMap(ctx: Ctx) {
  const rows = await ctx.db.query("ppeItems").take(200)
  return new Map(rows.map((r) => [r.slug, r.labelEn ?? r.label]))
}

// ---- read:published ------------------------------------------------------------

export const structure = internalQuery({
  args: { areas: areasArg },
  handler: async (ctx, args) => {
    const [locations, disciplines, types, assets, ppe, docs] = await Promise.all([
      ctx.db.query("namingLocations").take(200),
      ctx.db.query("namingDisciplines").take(200),
      ctx.db.query("namingTypes").take(200),
      ctx.db.query("assets").take(1000),
      ctx.db.query("ppeItems").take(200),
      publishedDocs(ctx, args.areas),
    ])
    const byLabel = new Map(locations.map((l) => [l.label, l.code]))
    const examples = docs
      .map((d) => ({ code: d.namingCode, title: d.title }))
      .sort((a, b) => a.code.localeCompare(b.code))
      .filter((d, i, all) => i === 0 || d.code.split("-").slice(0, 3).join("-") !== all[i - 1].code.split("-").slice(0, 3).join("-"))
      .slice(0, 6)
    const cover = await ctx.db.query("coverSettings").first()
    return {
      companyName: cover?.companyName?.trim() || null,
      areas: locations
        .filter((l) => inAreas(args.areas, l.code))
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((l) => ({ code: l.code, label: l.label })),
      disciplines: disciplines
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((d) => ({ code: d.code, label: d.label })),
      types: types
        .filter((t) => t.active)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((t) => ({ slug: t.slug, token: t.token, label: t.label })),
      namingPattern: "{AREA}-{DISCIPLINE}-{TYPE TOKEN}-{NNNN}",
      namingExamples: examples,
      assets: assets
        .map((a) => ({ code: a.code, name: a.name, area: assetArea(a, byLabel) }))
        .filter((a) => inAreas(args.areas, a.area))
        .sort((a, b) => a.code.localeCompare(b.code)),
      ppe: ppe
        .filter((p) => p.active)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((p) => ({ slug: p.slug, label: p.labelEn ?? p.label })),
      warningLevels: [...CALLOUT_LEVELS],
      blockFormat: BLOCK_FORMAT,
      keyAreaLimit: args.areas,
    }
  },
})

/** Published document ids inside the areas (for a filtered vector search). */
export const publishedDocIds = internalQuery({
  args: { areas: areasArg },
  handler: async (ctx, args) => (await publishedDocs(ctx, args.areas)).map((d) => d._id),
})

export interface Passage {
  chunkId: Id<"chunks">
  documentId: Id<"documents">
  namingCode: string
  title: string
  version: number
  section: string | null
  text: string
  score: number
}

/** Chunks from a vector search, kept only when they belong to a live Published version in the areas. */
export const passages = internalQuery({
  args: { chunkIds: v.array(v.id("chunks")), areas: areasArg },
  handler: async (ctx, args): Promise<Omit<Passage, "score">[]> => {
    const chunks = (await Promise.all(args.chunkIds.map((id) => ctx.db.get(id)))).filter(
      (c): c is Doc<"chunks"> => c !== null,
    )
    const docs = new Map<string, Doc<"documents"> | null>()
    const out: Omit<Passage, "score">[] = []
    for (const c of chunks) {
      if (!docs.has(c.documentId)) docs.set(c.documentId, await ctx.db.get(c.documentId))
      const d = docs.get(c.documentId)
      if (!d || c.version !== publishedVersion(d) || !inAreas(args.areas, d.location)) continue
      out.push({
        chunkId: c._id,
        documentId: d._id,
        namingCode: d.namingCode,
        title: d.title,
        version: c.version,
        section: c.pageOrSection,
        text: c.text,
      })
    }
    return out
  },
})

function terms(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}°.-]+/u)
        .map((w) => w.replace(/^[.-]+|[.-]+$/g, ""))
        .filter((w) => w.length >= 3),
    ),
  ]
}

/** Fallback when the query cannot be embedded: term overlap over live passages. */
export const lexicalSearch = internalQuery({
  args: { query: v.string(), areas: areasArg, limit: v.number() },
  handler: async (ctx, args): Promise<Passage[]> => {
    const want = terms(args.query)
    if (want.length === 0) return []
    const out: Passage[] = []
    for (const d of await publishedDocs(ctx, args.areas)) {
      const titleHits = want.filter((w) => d.title.toLowerCase().includes(w)).length
      for (const c of await liveChunks(ctx, d)) {
        const text = c.text.toLowerCase()
        const hits = want.filter((w) => text.includes(w)).length
        if (hits === 0) continue
        out.push({
          chunkId: c._id,
          documentId: d._id,
          namingCode: d.namingCode,
          title: d.title,
          version: c.version,
          section: c.pageOrSection,
          text: c.text,
          score: Math.round(((hits + titleHits * 0.25) / want.length) * 100) / 100,
        })
      }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, args.limit)
  },
})

/** Fallback for find_similar: word overlap between the incoming text and each Published document. */
export const lexicalSimilar = internalQuery({
  args: { text: v.string(), areas: areasArg },
  handler: async (ctx, args) => {
    const incoming = new Set(terms(args.text))
    if (incoming.size === 0) return []
    const out: { documentId: Id<"documents">; namingCode: string; title: string; version: number; score: number }[] = []
    for (const d of await publishedDocs(ctx, args.areas)) {
      const words = new Set(terms(`${d.title} ${(await liveChunks(ctx, d)).map((c) => c.text).join(" ")}`))
      let shared = 0
      for (const w of incoming) if (words.has(w)) shared++
      // Dice coefficient: high only when both texts mostly share their words.
      const score = Math.round(((2 * shared) / Math.max(1, incoming.size + words.size)) * 100) / 100
      out.push({ documentId: d._id, namingCode: d.namingCode, title: d.title, version: d.liveVersion!, score })
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 5)
  },
})

export const getDocument = internalQuery({
  args: { code: v.string(), areas: areasArg },
  handler: async (ctx, args) => {
    const d = await docByCode(ctx, args.code)
    if (!d) return { status: "not_found" as const }
    if (!inAreas(args.areas, d.location)) return { status: "out_of_area" as const, area: d.location ?? null }
    const version = publishedVersion(d)
    if (version == null)
      return { status: "not_published" as const, title: d.title, archived: d.status === "archived", docStatus: d.status as string }

    const row = await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) => q.eq("documentId", d._id).eq("version", version))
      .unique()
    const links = await ctx.db
      .query("documentAssets")
      .withIndex("by_documentId", (q) => q.eq("documentId", d._id))
      .take(100)
    const assets = (await Promise.all(links.map((l) => ctx.db.get(l.assetId))))
      .filter((a): a is Doc<"assets"> => a !== null)
      .map((a) => ({ code: a.code, name: a.name }))
      .sort((a, b) => a.code.localeCompare(b.code))
    const typeRow = await ctx.db
      .query("namingTypes")
      .withIndex("by_slug", (q) => q.eq("slug", d.type))
      .unique()
    const approverSignoff = (row?.signoffs ?? []).filter((s) => s.role === "approver").pop()
    const approver = approverSignoff?.personId ? await ctx.db.get(approverSignoff.personId) : null
    const owner = d.ownerId ? await ctx.db.get(d.ownerId) : null
    const disc = d.discipline
      ? await ctx.db
          .query("namingDisciplines")
          .withIndex("by_code", (q) => q.eq("code", d.discipline!))
          .unique()
      : null
    const loc = d.location
      ? await ctx.db
          .query("namingLocations")
          .withIndex("by_code", (q) => q.eq("code", d.location!))
          .unique()
      : null

    const meta = {
      documentId: d._id,
      namingCode: d.namingCode,
      title: d.title,
      type: typeRow?.label ?? d.type,
      area: d.location ?? null,
      areaLabel: loc?.label ?? null,
      discipline: d.discipline ?? null,
      disciplineLabel: disc?.label ?? null,
      version,
      publishedAt: row?.publishedAt ?? null,
      nextReviewAt: d.nextReviewAt ?? null,
      // A login name only; an email address is not shown to outside models.
      owner: owner?.name ?? null,
      approvedBy: approver ? `${approver.name} (${approver.role})` : null,
      supplier: d.supplier ?? null,
      wrapped: row?.bodyKind === "pdf",
      pdfPageCount: row?.pdfPageCount ?? null,
      changeNote: row?.changeNote ?? null,
      assets,
    }
    if (row?.bodyKind === "pdf") {
      const pages = new Map<string, string[]>()
      for (const c of await liveChunks(ctx, d)) {
        const key = c.pageOrSection ?? "Page ?"
        pages.set(key, [...(pages.get(key) ?? []), c.text])
      }
      return {
        status: "ok" as const,
        meta,
        text: null,
        pages: [...pages.entries()].map(([section, texts]) => ({
          page: Number(/(\d+)/.exec(section)?.[1] ?? 0),
          text: texts.join("\n"),
        })),
      }
    }
    return {
      status: "ok" as const,
      meta,
      text: tiptapToText(row?.bodyJson ?? null, await ppeLabelMap(ctx)),
      pages: null,
    }
  },
})

export const listAssets = internalQuery({
  args: { areas: areasArg },
  handler: async (ctx, args) => {
    const byLabel = await areaCodeByLabel(ctx)
    const assets = await ctx.db.query("assets").take(1000)
    const out = []
    for (const a of assets) {
      const area = assetArea(a, byLabel)
      if (!inAreas(args.areas, area)) continue
      const links = await ctx.db
        .query("documentAssets")
        .withIndex("by_assetId", (q) => q.eq("assetId", a._id))
        .take(500)
      const docs = (await Promise.all(links.map((l) => ctx.db.get(l.documentId)))).filter(
        (d): d is Doc<"documents"> => d !== null && isPublished(d) && inAreas(args.areas, d.location),
      )
      out.push({
        code: a.code,
        name: a.name,
        area,
        description: a.description,
        publishedDocuments: docs.length,
        documentCodes: docs.map((d) => d.namingCode).sort(),
      })
    }
    return out.sort((a, b) => a.code.localeCompare(b.code))
  },
})

// ---- read:people ------------------------------------------------------------------

function levelStatus(row: Doc<"skillLevels">, now: number) {
  if (row.retrainNeeded && row.level >= 1) return "re-train needed"
  if (isExpired(row, now)) return "expired"
  if (row.expiresAt != null && row.expiresAt - now <= EXPIRING_WINDOW_DAYS * DAY) return "expiring"
  return "valid"
}

export const skillCoverage = internalQuery({
  args: { skill: v.optional(v.string()), profile: v.optional(v.string()), areas: areasArg },
  handler: async (ctx, args) => {
    const now = Date.now()
    const skills = (await ctx.db.query("skills").take(500).then((r) => r.filter((s) => !s.archived)))
      .filter((s) => s.area == null || inAreas(args.areas, s.area))
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const profiles = (await ctx.db.query("skillProfiles").take(200)).sort((a, b) => a.sortOrder - b.sortOrder)
    const people = (await ctx.db.query("people").take(500)).sort((a, b) => a.sortOrder - b.sortOrder)
    const personById = new Map(people.map((p) => [p._id, p]))
    const skillById = new Map(skills.map((s) => [s._id, s]))

    if (args.skill) {
      const needle = args.skill.trim().toLowerCase()
      const matched = skills.filter((s) => s.name.toLowerCase().includes(needle)).slice(0, 3)
      if (matched.length === 0)
        return { mode: "not_found" as const, what: "Skill", available: skills.map((s) => s.name) }
      const out = []
      for (const s of matched) {
        const rows = await ctx.db
          .query("skillLevels")
          .withIndex("by_skillId", (q) => q.eq("skillId", s._id))
          .take(500)
        const holders = rows
          .filter((r) => r.level >= 1)
          .map((r) => {
            const p = personById.get(r.personId)
            return {
              name: p?.name ?? "Unknown",
              role: p?.role ?? "",
              shift: p ? shiftOf(p) : null,
              level: r.level,
              effectiveLevel: effectiveLevel(r, now),
              status: levelStatus(r, now),
              expiresAt: r.expiresAt,
            }
          })
          .sort((a, b) => b.effectiveLevel - a.effectiveLevel || a.name.localeCompare(b.name))
        out.push({ name: s.name, area: s.area, validityMonths: s.validityMonths, holders })
      }
      return { mode: "skill" as const, skills: out }
    }

    if (args.profile) {
      const needle = args.profile.trim().toLowerCase()
      const profile = profiles.find((p) => p.name.toLowerCase().includes(needle))
      if (!profile) return { mode: "not_found" as const, what: "Skill profile", available: profiles.map((p) => p.name) }
      const requirements = profile.targets.filter((t) => t.level > 0 && skillById.has(t.skillId))
      const qualified: { name: string; role: string; shift: string | null; expiringSoon: string[] }[] = []
      const almost: { name: string; role: string; shift: string | null; missing: string[] }[] = []
      for (const person of people) {
        const rows = await ctx.db
          .query("skillLevels")
          .withIndex("by_personId", (q) => q.eq("personId", person._id))
          .take(500)
        const levels = new Map(rows.map((r) => [r.skillId, r]))
        const missing: string[] = []
        const expiringSoon: string[] = []
        for (const r of requirements) {
          const row = levels.get(r.skillId)
          const name = skillById.get(r.skillId)!.name
          const eff = effectiveLevel(row, now)
          if (row?.retrainNeeded && row.level >= 1) missing.push(`${name}: re-train needed`)
          else if (isExpired(row, now)) missing.push(`${name}: expired`)
          else if (eff < r.level) missing.push(`${name}: level ${eff} of ${r.level}`)
          else if (row?.expiresAt != null && row.expiresAt - now <= EXPIRING_WINDOW_DAYS * DAY)
            expiringSoon.push(name)
        }
        const base = { name: person.name, role: person.role, shift: shiftOf(person) }
        if (requirements.length > 0 && missing.length === 0) qualified.push({ ...base, expiringSoon })
        else if ((person.profileIds ?? []).includes(profile._id)) almost.push({ ...base, missing })
      }
      return {
        mode: "profile" as const,
        profile: profile.name,
        requirements: requirements.map((r) => ({ skill: skillById.get(r.skillId)!.name, level: r.level })),
        qualified,
        almost: almost.sort((a, b) => a.missing.length - b.missing.length),
      }
    }

    const overview = []
    for (const s of skills) {
      const rows = await ctx.db
        .query("skillLevels")
        .withIndex("by_skillId", (q) => q.eq("skillId", s._id))
        .take(500)
      const valid = rows.filter((r) => !(r.retrainNeeded && r.level >= 1))
      overview.push({
        name: s.name,
        area: s.area,
        trained: valid.filter((r) => effectiveLevel(r, now) >= 1).length,
        qualified: valid.filter((r) => effectiveLevel(r, now) >= 2).length,
        canTrain: valid.filter((r) => effectiveLevel(r, now) >= 3).length,
        expiring: rows.filter((r) => levelStatus(r, now) === "expiring").length,
        retrain: rows.filter((r) => r.retrainNeeded && r.level >= 1).length,
      })
    }
    return { mode: "overview" as const, skills: overview, profiles: profiles.map((p) => p.name) }
  },
})

export const trainingRecords = internalQuery({
  args: { documentCode: v.optional(v.string()), person: v.optional(v.string()), areas: areasArg },
  handler: async (ctx, args) => {
    let trainingFilter: Set<string> | null = null
    let documentNote: string | null = null
    if (args.documentCode) {
      const d = await docByCode(ctx, args.documentCode)
      if (!d) return { status: "not_found" as const, what: `No document with naming code ${args.documentCode.toUpperCase()}.` }
      if (!inAreas(args.areas, d.location))
        return { status: "out_of_area" as const, what: `${d.namingCode} is in area ${d.location}.` }
      documentNote = `${d.namingCode} · ${d.title}`
      trainingFilter = new Set()
      for (const t of await ctx.db.query("trainings").take(500)) {
        const versions = await ctx.db
          .query("trainingVersions")
          .withIndex("by_trainingId_and_version", (q) => q.eq("trainingId", t._id))
          .take(50)
        if (versions.some((tv) => tv.objectives.some((o) => o.documentId === d._id))) trainingFilter.add(t._id)
      }
    }
    const needle = args.person?.trim().toLowerCase() ?? null
    const people = await ctx.db.query("people").take(500)
    const personById = new Map(people.map((p) => [p._id, p]))
    const trainings = new Map((await ctx.db.query("trainings").take(500)).map((t) => [t._id, t]))
    const rows = (await ctx.db.query("trainingRecords").take(2000)).sort((a, b) => b.passedAt - a.passedAt)
    const out = []
    for (const r of rows) {
      const p = personById.get(r.personId)
      if (needle && !(p?.name.toLowerCase().includes(needle) ?? false)) continue
      if (trainingFilter && !trainingFilter.has(r.trainingId)) continue
      const t = trainings.get(r.trainingId)
      if (args.areas.length > 0 && !inAreas(args.areas, t?.area ?? null)) continue
      out.push({
        person: p?.name ?? "Unknown",
        role: p?.role ?? "",
        trainingCode: r.trainingCode,
        trainingTitle: r.trainingTitle,
        trainingVersion: r.trainingVersion,
        passedAt: r.passedAt,
        score: r.score,
      })
      if (out.length >= 100) break
    }
    return { status: "ok" as const, documentNote, records: out }
  },
})

// ---- write:drafts -----------------------------------------------------------------

export const importDraft = internalMutation({
  args: {
    keyId: v.id("mcpKeys"),
    title: v.string(),
    type: v.string(),
    area: v.string(),
    discipline: v.string(),
    assetCodes: v.array(v.string()),
    sourceNote: v.string(),
    blocks: v.any(),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId)
    if (!key || key.revokedAt != null) return { ok: false as const, errors: ["This key is no longer valid."] }

    // Rate limit: drafts created by this key in the last hour.
    const hourAgo = Date.now() - 60 * 60 * 1000
    const recent = await ctx.db
      .query("mcpCalls")
      .withIndex("by_keyId", (q) => q.eq("keyId", key._id))
      .order("desc")
      .take(500)
    const made = recent.filter((c) => c.at >= hourAgo && c.tool === "oppr_import_draft" && c.ok).length
    if (made >= MAX_DRAFTS_PER_HOUR)
      return {
        ok: false as const,
        errors: [`This key already created ${made} drafts in the last hour. The limit is ${MAX_DRAFTS_PER_HOUR} per hour. Try again later.`],
      }

    const errors: string[] = []
    const area = args.area.trim().toUpperCase()
    const discipline = args.discipline.trim().toUpperCase()
    const locations = await ctx.db.query("namingLocations").take(200)
    const disciplines = await ctx.db.query("namingDisciplines").take(200)
    const types = (await ctx.db.query("namingTypes").take(200)).filter((t) => t.active)
    const ppeSlugs = new Set((await ctx.db.query("ppeItems").take(200)).filter((p) => p.active).map((p) => p.slug))

    const allowedAreas = locations.map((l) => l.code).filter((c) => inAreas(key.areaCodes, c))
    if (!locations.some((l) => l.code === area))
      errors.push(`area "${args.area}" is not valid. Valid areas: ${allowedAreas.join(", ")}.`)
    else if (!inAreas(key.areaCodes, area))
      errors.push(`This key is limited to areas ${key.areaCodes.join(", ")}, so it cannot create a draft in ${area}.`)
    if (!disciplines.some((d) => d.code === discipline))
      errors.push(`discipline "${args.discipline}" is not valid. Valid disciplines: ${disciplines.map((d) => d.code).join(", ")}.`)
    if (!types.some((t) => t.slug === args.type))
      errors.push(`type "${args.type}" is not valid. Valid types: ${types.map((t) => t.slug).join(", ")}.`)

    const byLabel = new Map(locations.map((l) => [l.label, l.code]))
    const assets: { id: Id<"assets">; code: string }[] = []
    for (const raw of [...new Set(args.assetCodes.map((c) => c.trim().toUpperCase()))]) {
      const a = await ctx.db
        .query("assets")
        .withIndex("by_code", (q) => q.eq("code", raw))
        .first()
      if (!a) {
        errors.push(`Asset "${raw}" does not exist. Call oppr_list_assets for valid codes.`)
        continue
      }
      if (!inAreas(key.areaCodes, assetArea(a, byLabel))) {
        errors.push(`Asset ${raw} is outside this key's areas (${key.areaCodes.join(", ")}).`)
        continue
      }
      assets.push({ id: a._id, code: a.code })
    }

    const blocks = args.blocks as ImportBlock[]
    blocks.forEach((b, i) => {
      if (b.kind !== "ppe") return
      const bad = b.items.filter((s) => !ppeSlugs.has(s))
      if (bad.length)
        errors.push(`blocks[${i}] has unknown PPE slugs: ${bad.join(", ")}. Valid slugs: ${[...ppeSlugs].join(", ")}.`)
    })
    if (!blocks.some((b) => b.kind !== "heading"))
      errors.push("The body has only headings. Add the actual content as paragraphs, steps, tables or warnings.")

    if (errors.length > 0) return { ok: false as const, errors }

    const now = Date.now()
    const body = blocksToTiptap(blocks, assets)
    const namingCode = await allocateNamingCode(ctx, area, discipline, args.type)
    const title = args.title.replace(/\s+/g, " ").trim()
    const documentId = await ctx.db.insert("documents", {
      namingCode,
      location: area,
      discipline,
      title,
      type: args.type,
      status: "draft",
      currentVersion: 1,
      ownerId: key.createdBy,
      authorId: key.createdBy,
      reviewerId: null,
      approverId: null,
      tags: [],
      updatedAt: now,
      origin: "mcp",
    })
    await ctx.db.insert("documentVersions", {
      documentId,
      version: 1,
      bodyKind: "tiptap",
      bodyJson: body,
      pdfStorageId: null,
      publishedAt: now,
      // No sign-off: the outside model is not an author who can sign. An
      // Engineer takes the draft through the normal review (ADR 0003).
      signoffs: [],
      changeNote: `Imported through MCP by key "${key.name}". Source: ${args.sourceNote.trim().slice(0, 500)}`,
    })
    const chunks = bodyChunks(body)
    for (const [i, c] of chunks.entries()) {
      await ctx.db.insert("chunks", {
        documentId,
        version: 1,
        seq: i + 1,
        text: c.text,
        pageOrSection: c.section,
        embedding: null,
        embeddingModel: null,
      })
    }
    for (const a of assets) await ctx.db.insert("documentAssets", { documentId, assetId: a.id })
    await ctx.scheduler.runAfter(0, internal.ai.embed.embedMissingInternal, { documentId })
    return { ok: true as const, documentId, namingCode, title, chunks: chunks.length, assets: assets.map((a) => a.code) }
  },
})

// ---- write:signals ----------------------------------------------------------------

export const reportSignal = internalMutation({
  args: {
    keyId: v.id("mcpKeys"),
    documentCode: v.string(),
    kind: v.union(v.literal("unclear"), v.literal("incident"), v.literal("suggestion")),
    note: v.string(),
    section: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId)
    if (!key || key.revokedAt != null) return { ok: false as const, error: "This key is no longer valid." }
    const d = await docByCode(ctx, args.documentCode)
    if (!d) return { ok: false as const, error: `No document with naming code ${args.documentCode.toUpperCase()}.` }
    if (!inAreas(key.areaCodes, d.location))
      return {
        ok: false as const,
        error: `${d.namingCode} is in area ${d.location}. This key is limited to areas ${key.areaCodes.join(", ")}.`,
      }
    const version = publishedVersion(d)
    if (version == null)
      return {
        ok: false as const,
        error: `${d.namingCode} has no Published version, so there is nothing to report on yet. Signals are for Published documents.`,
      }

    let chunkId: Id<"chunks"> | null = null
    let matchedSection: string | null = null
    if (args.section) {
      const want = args.section.trim().toLowerCase()
      const chunks = await liveChunks(ctx, d)
      const hit =
        chunks.find((c) => (c.pageOrSection ?? "").toLowerCase() === want) ??
        chunks.find((c) => (c.pageOrSection ?? "").toLowerCase().includes(want)) ??
        chunks.find((c) => c.text.toLowerCase().includes(want))
      if (hit) {
        chunkId = hit._id
        matchedSection = hit.pageOrSection
      }
    }
    const label = { unclear: "Unclear", incident: "Incident", suggestion: "Suggestion" }[args.kind]
    await ctx.db.insert("contentFlags", {
      documentId: d._id,
      version,
      chunkId,
      source: "mcp",
      attemptId: null,
      note: `${label} (via MCP, ${key.name}): ${args.note.trim().slice(0, 1000)}`,
      personId: null,
      at: Date.now(),
    })
    return {
      ok: true as const,
      documentId: d._id,
      namingCode: d.namingCode,
      title: d.title,
      version,
      section: matchedSection,
      sectionAsked: args.section ?? null,
    }
  },
})
