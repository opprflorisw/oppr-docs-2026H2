// The Plant ontology for Knowledge (docs/adr/0006). Everyone reads it; a
// checked-in Engineer (or Admin) edits it. Areas are namingLocations, one
// source; plantAreas only adds a description and a site to an area code.
import { ConvexError, v } from "convex/values"
import { internalMutation, internalQuery, mutation, query } from "../_generated/server"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { requireUser } from "../lib/auth"
import { requireEngineerOrAdmin } from "../lib/roles"
import { isPublished } from "../lib/published"
import { plantItemKind, plantLinks, plantRelationType } from "./schema"

type PlantItemKind = Doc<"plantItems">["kind"]

const EMPTY_LINKS = { documentIds: [], assetIds: [], trainingIds: [], skillIds: [] }

/** Editing the Plant is an Engineer's job (Admin passes every Engineer check). */
function requirePlantEditor(ctx: MutationCtx, personId: Id<"people">) {
  return requireEngineerOrAdmin(ctx, personId, "Check in as an Engineer to change the Plant.")
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

function cleanList(xs: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of xs) {
    const c = clean(x)
    if (!c || seen.has(c.toLowerCase())) continue
    seen.add(c.toLowerCase())
    out.push(c)
  }
  return out
}

async function loadAll(ctx: QueryCtx) {
  const [profile, areas, areaInfo, items, relations] = await Promise.all([
    ctx.db.query("plantProfile").first(),
    ctx.db.query("namingLocations").take(200),
    ctx.db.query("plantAreas").take(200),
    ctx.db.query("plantItems").take(2000),
    ctx.db.query("plantRelations").take(4000),
  ])
  items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  areas.sort((a, b) => a.code.localeCompare(b.code))
  return { profile, areas, areaInfo, items, relations }
}

// ---- Read ---------------------------------------------------------------------------

/** Everything the Plant page shows, with linked records resolved to labels. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const { profile, areas, areaInfo, items, relations } = await loadAll(ctx)
    const cover = await ctx.db.query("coverSettings").first()

    const docIds = new Set<Id<"documents">>()
    const assetIds = new Set<Id<"assets">>()
    const trainingIds = new Set<Id<"trainings">>()
    const skillIds = new Set<Id<"skills">>()
    for (const it of items) {
      it.links.documentIds.forEach((x) => docIds.add(x))
      it.links.assetIds.forEach((x) => assetIds.add(x))
      it.links.trainingIds.forEach((x) => trainingIds.add(x))
      it.links.skillIds.forEach((x) => skillIds.add(x))
    }
    const documents: Record<string, { code: string; title: string; published: boolean }> = {}
    for (const id of docIds) {
      const d = await ctx.db.get(id)
      if (d) documents[id] = { code: d.namingCode, title: d.title, published: isPublished(d) }
    }
    const trainings: Record<string, { code: string; title: string }> = {}
    for (const id of trainingIds) {
      const t = await ctx.db.get(id)
      if (t) trainings[id] = { code: t.code, title: t.title }
    }
    const skills: Record<string, { name: string }> = {}
    for (const id of skillIds) {
      const s = await ctx.db.get(id)
      if (s) skills[id] = { name: s.name }
    }
    // Every Asset, for the Structure tree (site > area > line > Asset).
    const allAssets = await ctx.db.query("assets").take(500)
    allAssets.sort((a, b) => a.code.localeCompare(b.code))
    const assets = allAssets.map((a) => ({
      _id: a._id,
      code: a.code,
      name: a.name,
      location: a.location,
      linked: assetIds.has(a._id),
    }))

    const pendingProposals = (
      await ctx.db
        .query("plantProposals")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .take(500)
    ).length

    return {
      companyName: cover?.companyName ?? null,
      profile,
      areas: areas.map((a) => {
        const info = areaInfo.find((x) => x.areaCode === a.code)
        return {
          code: a.code,
          label: a.label,
          description: info?.description ?? "",
          siteId: info?.siteId ?? null,
        }
      }),
      items,
      relations,
      documents,
      trainings,
      skills,
      assets,
      pendingProposals,
    }
  },
})

/** What an item can link to: Documents, Assets, Trainings and Skills. */
export const linkOptions = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const [docs, assets, trainings, skills] = await Promise.all([
      ctx.db.query("documents").take(1000),
      ctx.db.query("assets").take(500),
      ctx.db.query("trainings").take(500),
      ctx.db.query("skills").take(500).then((r) => r.filter((s) => !s.archived)),
    ])
    return {
      documents: docs
        .filter((d) => d.status !== "archived")
        .map((d) => ({ id: d._id, label: d.namingCode, sub: d.title }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      assets: assets
        .map((a) => ({ id: a._id, label: a.code, sub: a.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      trainings: trainings
        .map((t) => ({ id: t._id, label: t.code, sub: t.title }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      skills: skills
        .map((s) => ({ id: s._id, label: s.name, sub: s.area ?? "" }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    }
  },
})

/** The glossary for the phone: terms with their other words, read-only. */
export const glossary = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const terms = await ctx.db
      .query("plantItems")
      .withIndex("by_kind", (q) => q.eq("kind", "term"))
      .take(1000)
    return terms
      .map((t) => ({ _id: t._id, name: t.name, synonyms: t.synonyms, description: t.description, areaCode: t.areaCode }))
      .sort((a, b) => a.name.localeCompare(b.name))
  },
})

/** Small list for Ctrl+K: every Plant item with its kind. */
export const searchIndex = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const items = await ctx.db.query("plantItems").take(2000)
    return items.map((i) => ({ _id: i._id, kind: i.kind, name: i.name, code: i.code, synonyms: i.synonyms }))
  },
})

// ---- Write --------------------------------------------------------------------------

export const saveProfile = mutation({
  args: {
    personId: v.id("people"),
    about: v.string(),
    history: v.string(),
    productsAndCustomers: v.string(),
    qualityPolicy: v.string(),
    certifications: v.array(v.string()),
    headcount: v.union(v.number(), v.null()),
    keyFacts: v.array(v.object({ label: v.string(), value: v.string() })),
  },
  handler: async (ctx, args) => {
    await requirePlantEditor(ctx, args.personId)
    const { personId, ...rest } = args
    const row = {
      ...rest,
      about: rest.about.trim(),
      history: rest.history.trim(),
      productsAndCustomers: rest.productsAndCustomers.trim(),
      qualityPolicy: rest.qualityPolicy.trim(),
      certifications: cleanList(rest.certifications),
      keyFacts: rest.keyFacts
        .map((f) => ({ label: clean(f.label), value: clean(f.value) }))
        .filter((f) => f.label && f.value),
      headcount: rest.headcount != null && rest.headcount >= 0 ? Math.round(rest.headcount) : null,
      updatedAt: Date.now(),
      updatedByPersonId: personId,
    }
    const existing = await ctx.db.query("plantProfile").first()
    if (existing) await ctx.db.replace(existing._id, row)
    else await ctx.db.insert("plantProfile", row)
  },
})

export const saveArea = mutation({
  args: {
    personId: v.id("people"),
    areaCode: v.string(),
    description: v.string(),
    siteId: v.union(v.id("plantItems"), v.null()),
  },
  handler: async (ctx, args) => {
    await requirePlantEditor(ctx, args.personId)
    const area = await ctx.db
      .query("namingLocations")
      .withIndex("by_code", (q) => q.eq("code", args.areaCode))
      .first()
    if (!area) throw new ConvexError("This area does not exist. Areas are managed in Settings, Naming.")
    if (args.siteId) {
      const site = await ctx.db.get(args.siteId)
      if (!site || site.kind !== "site") throw new ConvexError("Pick a site from the list.")
    }
    const row = { areaCode: args.areaCode, description: args.description.trim(), siteId: args.siteId }
    const existing = await ctx.db
      .query("plantAreas")
      .withIndex("by_areaCode", (q) => q.eq("areaCode", args.areaCode))
      .first()
    if (existing) await ctx.db.replace(existing._id, row)
    else await ctx.db.insert("plantAreas", row)
  },
})

async function checkLinks(ctx: MutationCtx, links: Doc<"plantItems">["links"]) {
  const keep = async <T extends string>(ids: T[]) => {
    const out: T[] = []
    for (const id of Array.from(new Set(ids))) {
      if (await ctx.db.get(id as never)) out.push(id)
    }
    return out
  }
  return {
    documentIds: await keep(links.documentIds),
    assetIds: await keep(links.assetIds),
    trainingIds: await keep(links.trainingIds),
    skillIds: await keep(links.skillIds),
  }
}

async function findByName(ctx: QueryCtx, kind: PlantItemKind, name: string) {
  const rows = await ctx.db
    .query("plantItems")
    .withIndex("by_kind", (q) => q.eq("kind", kind))
    .take(2000)
  const n = clean(name).toLowerCase()
  return rows.find((r) => r.name.toLowerCase() === n) ?? null
}

async function nextSortOrder(ctx: QueryCtx, kind: PlantItemKind) {
  const last = await ctx.db
    .query("plantItems")
    .withIndex("by_kind", (q) => q.eq("kind", kind))
    .order("desc")
    .first()
  return (last?.sortOrder ?? 0) + 1
}

export const saveItem = mutation({
  args: {
    personId: v.id("people"),
    id: v.optional(v.id("plantItems")),
    kind: plantItemKind,
    name: v.string(),
    code: v.union(v.string(), v.null()),
    description: v.string(),
    areaCode: v.union(v.string(), v.null()),
    synonyms: v.array(v.string()),
    links: plantLinks,
  },
  handler: async (ctx, args): Promise<Id<"plantItems">> => {
    await requirePlantEditor(ctx, args.personId)
    const name = clean(args.name)
    if (!name) throw new ConvexError("Give it a name.")
    const same = await findByName(ctx, args.kind, name)
    if (same && same._id !== args.id) throw new ConvexError(`"${same.name}" already exists here.`)
    const fields = {
      kind: args.kind,
      name,
      code: args.code ? clean(args.code) || null : null,
      description: args.description.trim(),
      areaCode: args.areaCode || null,
      synonyms: cleanList(args.synonyms).filter((s) => s.toLowerCase() !== name.toLowerCase()),
      links: await checkLinks(ctx, args.links),
      updatedAt: Date.now(),
    }
    if (args.id) {
      const existing = await ctx.db.get(args.id)
      if (!existing) throw new ConvexError("This item was removed.")
      await ctx.db.patch(args.id, fields)
      return args.id
    }
    return await ctx.db.insert("plantItems", {
      ...fields,
      source: "manual",
      sortOrder: await nextSortOrder(ctx, args.kind),
    })
  },
})

export const removeItem = mutation({
  args: { personId: v.id("people"), id: v.id("plantItems") },
  handler: async (ctx, args) => {
    await requirePlantEditor(ctx, args.personId)
    const item = await ctx.db.get(args.id)
    if (!item) return
    for (const r of await ctx.db.query("plantRelations").withIndex("by_from", (q) => q.eq("fromId", args.id)).take(1000))
      await ctx.db.delete(r._id)
    for (const r of await ctx.db.query("plantRelations").withIndex("by_to", (q) => q.eq("toId", args.id)).take(1000))
      await ctx.db.delete(r._id)
    if (item.kind === "site") {
      for (const a of await ctx.db.query("plantAreas").take(200))
        if (a.siteId === args.id) await ctx.db.patch(a._id, { siteId: null })
    }
    await ctx.db.delete(args.id)
  },
})

export const addRelation = mutation({
  args: {
    personId: v.id("people"),
    fromId: v.id("plantItems"),
    toId: v.id("plantItems"),
    type: plantRelationType,
  },
  handler: async (ctx, args) => {
    await requirePlantEditor(ctx, args.personId)
    if (args.fromId === args.toId) throw new ConvexError("An item cannot relate to itself.")
    if (!(await ctx.db.get(args.fromId)) || !(await ctx.db.get(args.toId)))
      throw new ConvexError("One of the items was removed.")
    const existing = await ctx.db
      .query("plantRelations")
      .withIndex("by_from", (q) => q.eq("fromId", args.fromId))
      .take(1000)
    if (existing.some((r) => r.toId === args.toId && r.type === args.type)) return
    await ctx.db.insert("plantRelations", { fromId: args.fromId, toId: args.toId, type: args.type })
  },
})

export const removeRelation = mutation({
  args: { personId: v.id("people"), id: v.id("plantRelations") },
  handler: async (ctx, args) => {
    await requirePlantEditor(ctx, args.personId)
    if (await ctx.db.get(args.id)) await ctx.db.delete(args.id)
  },
})

// ---- Proposals (AI drafts, an Engineer confirms) ---------------------------------------

export const proposals = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const rows = await ctx.db
      .query("plantProposals")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(200)
    const out = []
    for (const p of rows) {
      const sources: { id: Id<"documents">; code: string; title: string }[] = []
      for (const id of p.sourceDocumentIds) {
        const d = await ctx.db.get(id)
        if (d) sources.push({ id, code: d.namingCode, title: d.title })
      }
      const existing = await findByName(ctx, p.kind, p.name)
      out.push({ ...p, sources, existsAs: existing ? existing._id : null })
    }
    return out
  },
})

/** Turn one pending proposal into a Plant item (or add its words and sources to an existing one). */
async function acceptOne(
  ctx: MutationCtx,
  p: Doc<"plantProposals">,
  personId: Id<"people">,
  edits: { name?: string; description?: string; synonyms?: string[] } = {},
): Promise<Id<"plantItems">> {
  const name = clean(edits.name ?? p.name)
  if (!name) throw new ConvexError("Give it a name.")
  const description = (edits.description ?? p.description).trim()
  const synonyms = cleanList(edits.synonyms ?? p.synonyms).filter((s) => s.toLowerCase() !== name.toLowerCase())
  const documentIds = await checkLinks(ctx, { ...EMPTY_LINKS, documentIds: p.sourceDocumentIds })
  let itemId: Id<"plantItems">
  const existing = await findByName(ctx, p.kind, name)
  if (existing) {
    // Same item already there: add what is new, never overwrite.
    await ctx.db.patch(existing._id, {
      synonyms: cleanList([...existing.synonyms, ...synonyms]),
      description: existing.description || description,
      links: {
        ...existing.links,
        documentIds: Array.from(new Set([...existing.links.documentIds, ...documentIds.documentIds])),
      },
      updatedAt: Date.now(),
    })
    itemId = existing._id
  } else {
    itemId = await ctx.db.insert("plantItems", {
      kind: p.kind,
      name,
      code: null,
      description,
      areaCode: p.areaCode,
      synonyms,
      links: documentIds,
      source: "ai",
      sortOrder: await nextSortOrder(ctx, p.kind),
      updatedAt: Date.now(),
    })
  }
  await ctx.db.patch(p._id, { status: "accepted", decidedAt: Date.now(), decidedByPersonId: personId, itemId })
  return itemId
}

function rejectOne(ctx: MutationCtx, p: Doc<"plantProposals">, personId: Id<"people">) {
  return ctx.db.patch(p._id, { status: "rejected", decidedAt: Date.now(), decidedByPersonId: personId })
}

export const acceptProposal = mutation({
  args: {
    personId: v.id("people"),
    id: v.id("plantProposals"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    synonyms: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<Id<"plantItems">> => {
    await requirePlantEditor(ctx, args.personId)
    const p = await ctx.db.get(args.id)
    if (!p || p.status !== "pending") throw new ConvexError("This proposal was already handled.")
    return await acceptOne(ctx, p, args.personId, args)
  },
})

export const rejectProposal = mutation({
  args: { personId: v.id("people"), id: v.id("plantProposals") },
  handler: async (ctx, args) => {
    await requirePlantEditor(ctx, args.personId)
    const p = await ctx.db.get(args.id)
    if (!p || p.status !== "pending") return
    await rejectOne(ctx, p, args.personId)
  },
})

/** Accept or reject every pending proposal at once, optionally of one kind. Still an Engineer's decision. */
export const decideAllProposals = mutation({
  args: {
    personId: v.id("people"),
    decision: v.union(v.literal("accept"), v.literal("reject")),
    kind: v.optional(plantItemKind),
  },
  handler: async (ctx, args): Promise<number> => {
    await requirePlantEditor(ctx, args.personId)
    const rows = (
      await ctx.db
        .query("plantProposals")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .take(500)
    ).filter((p) => !args.kind || p.kind === args.kind)
    for (const p of rows) {
      if (args.decision === "accept") await acceptOne(ctx, p, args.personId)
      else await rejectOne(ctx, p, args.personId)
    }
    return rows.length
  },
})

/** Engineer check for the proposing action (actions cannot read the db). */
export const checkEditor = internalMutation({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    await requirePlantEditor(ctx, args.personId)
  },
})

/** Published passages plus what the Plant already knows, for proposing. */
export const proposalInput = internalQuery({
  args: {},
  handler: async (ctx) => {
    const docs = (await ctx.db.query("documents").take(1000)).filter(isPublished)
    const sources: { id: Id<"documents">; code: string; title: string; text: string }[] = []
    for (const d of docs) {
      const chunks = await ctx.db
        .query("chunks")
        .withIndex("by_documentId_and_version", (q) =>
          q.eq("documentId", d._id).eq("version", d.liveVersion as number),
        )
        .take(400)
      chunks.sort((a, b) => a.seq - b.seq)
      sources.push({ id: d._id, code: d.namingCode, title: d.title, text: chunks.map((c) => c.text).join("\n") })
    }
    const items = await ctx.db.query("plantItems").take(2000)
    const pending = await ctx.db
      .query("plantProposals")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(500)
    const rejected = await ctx.db
      .query("plantProposals")
      .withIndex("by_status", (q) => q.eq("status", "rejected"))
      .take(500)
    const areas = await ctx.db.query("namingLocations").take(200)
    return {
      sources,
      known: [...items, ...pending, ...rejected].map((i) => `${i.kind}: ${i.name}`),
      areas: areas.map((a) => ({ code: a.code, label: a.label })),
      pendingCount: pending.length,
    }
  },
})

export const storeProposals = internalMutation({
  args: {
    proposals: v.array(
      v.object({
        kind: plantItemKind,
        name: v.string(),
        description: v.string(),
        areaCode: v.union(v.string(), v.null()),
        synonyms: v.array(v.string()),
        reason: v.string(),
        sourceDocumentIds: v.array(v.id("documents")),
      }),
    ),
  },
  handler: async (ctx, args): Promise<number> => {
    const areas = new Set((await ctx.db.query("namingLocations").take(200)).map((a) => a.code))
    const seen = new Set(
      [
        ...(await ctx.db.query("plantItems").take(2000)),
        ...(await ctx.db.query("plantProposals").take(2000)),
      ].map((i) => `${i.kind}:${i.name.toLowerCase()}`),
    )
    let n = 0
    for (const p of args.proposals) {
      const name = clean(p.name)
      const key = `${p.kind}:${name.toLowerCase()}`
      if (!name || seen.has(key)) continue
      seen.add(key)
      await ctx.db.insert("plantProposals", {
        kind: p.kind,
        name,
        description: p.description.trim(),
        areaCode: p.areaCode && areas.has(p.areaCode) ? p.areaCode : null,
        synonyms: cleanList(p.synonyms),
        reason: p.reason.trim(),
        sourceDocumentIds: p.sourceDocumentIds,
        status: "pending",
        createdAt: Date.now(),
        decidedAt: null,
        decidedByPersonId: null,
        itemId: null,
      })
      n += 1
    }
    return n
  },
})
