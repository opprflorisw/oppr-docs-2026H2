// The Wiki Outline and its blocks (docs/specs/wiki-upgrade.md 6.4;
// docs/adr/0007). People shape the Outline through unapplied changes; every
// claim still cites a live Published passage. Readers see only `wikis.content`,
// which compose builds from the live Outline and the live blocks with a
// visible status.
//
// One block id has at most three rows: the live row, its unapplied edit
// (state "staged", `stagedOf` the live row) and its unapplied removal (state
// "removedStaged"). A new block exists only as a staged row until Apply.
import { ConvexError, v } from "convex/values"
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { requireUser, requireUserId } from "./lib/auth"
import { isEngineerOrAdmin, requireEngineerOrAdmin } from "./lib/roles"
import { allowance } from "./lib/aiBudget"
import { isPublished } from "./lib/published"
import { resolveScope } from "./lib/scope"
import { headingFact } from "./ai/grounding"
import { requestGeneration } from "./wikis"
import {
  dependsOnOf,
  generatedRow,
  liveBlocks,
  logWikiEvent,
  newWikiId,
  orderBetween,
  orderKey,
  recompose,
  storeBuild,
  type WikiBlockRow,
} from "./lib/wikiServer"
import {
  BLOCKS_APPLY,
  DEFAULT_MAX_DANGER,
  MAX_MAX_DANGER,
  MAX_PINNED_CHUNKS,
  MAX_WRITTEN_CHARS,
  allPoints,
  isContentV2,
  pointKey,
  type BuildSummary,
  type EditorBlock,
  type EditorState,
  type LegacyWikiContent,
  type Outline,
  type OutlineSection,
} from "./lib/wikiTypes"
import {
  blockKindValidator,
  blockStatusValidator,
  blockFoldValidator,
  calloutToneValidator,
  foldValidator,
  lengthValidator,
  pointValidator,
  readingLevelValidator,
  saveBlockGenerationArgs,
  sourceSetValidator,
} from "./lib/wikiValidators"

const ALSO_EDITING_MS = 10 * 60 * 1000
const MAX_HEADING = 120
const MAX_INSTRUCTION = 200
const NOT_ENGINEER = "You are no longer checked in as an Engineer."

function requireEngineer(ctx: QueryCtx, personId: Id<"people"> | undefined) {
  return requireEngineerOrAdmin(ctx, personId, NOT_ENGINEER)
}

async function wikiOrThrow(ctx: QueryCtx, wikiId: Id<"wikis">) {
  const wiki = await ctx.db.get(wikiId)
  if (!wiki) throw new ConvexError("Wiki not found")
  return wiki
}

function settingsOf(wiki: Doc<"wikis">) {
  return {
    confirmByAnother: wiki.confirmByAnother ?? wiki.startHere != null,
    maxDanger: wiki.maxDanger ?? DEFAULT_MAX_DANGER,
    readingLevel: wiki.readingLevel ?? null,
    length: wiki.length ?? null,
  }
}

/** Common start of every edit: signed in, checked in as Engineer, Wiki with an Outline. */
async function beginEdit(ctx: MutationCtx, wikiId: Id<"wikis">, personId: Id<"people"> | undefined) {
  await requireUserId(ctx)
  const person = await requireEngineer(ctx, personId)
  const wiki = await wikiOrThrow(ctx, wikiId)
  if (!wiki.outline) throw new ConvexError("This Wiki is still being upgraded to sections and blocks. Try again in a minute.")
  return { person, wiki, outline: wiki.outline }
}

/** The Outline as it will be after Apply. */
function workingOutline(wiki: Doc<"wikis">): Outline {
  return wiki.outlineStaged ?? wiki.outline ?? { sections: [], introEnabled: true }
}

async function stageOutline(ctx: MutationCtx, wiki: Doc<"wikis">, outline: Outline, personId: Id<"people">) {
  await ctx.db.patch(wiki._id, {
    outlineStaged: outline,
    outlineUpdatedAt: Date.now(),
    outlineUpdatedBy: personId,
    stagedVersion: (wiki.stagedVersion ?? 0) + 1,
  })
}

async function bumpStaged(ctx: MutationCtx, wikiId: Id<"wikis">) {
  const wiki = await ctx.db.get(wikiId)
  if (wiki) await ctx.db.patch(wikiId, { stagedVersion: (wiki.stagedVersion ?? 0) + 1 })
}

interface Rows {
  live: Doc<"wikiBlocks"> | null
  staged: Doc<"wikiBlocks"> | null
  removed: Doc<"wikiBlocks"> | null
}

async function rowsOf(ctx: QueryCtx, wikiId: Id<"wikis">, blockId: string): Promise<Rows> {
  const rows = await ctx.db
    .query("wikiBlocks")
    .withIndex("by_wikiId_and_blockId", (q) => q.eq("wikiId", wikiId).eq("blockId", blockId))
    .take(10)
  return {
    live: rows.find((r) => r.state === "live") ?? null,
    staged: rows.find((r) => r.state === "staged") ?? null,
    removed: rows.find((r) => r.state === "removedStaged") ?? null,
  }
}

async function rowsOrThrow(ctx: QueryCtx, wikiId: Id<"wikis">, blockId: string) {
  const r = await rowsOf(ctx, wikiId, blockId)
  if (!r.live && !r.staged) throw new ConvexError("This block no longer exists.")
  return r
}

function copyOf(row: Doc<"wikiBlocks">): WikiBlockRow {
  const { _id, _creationTime, ...rest } = row
  return rest
}

/** The unapplied edit of a block: the staged row, made from the live one when there is none yet. */
async function ensureStaged(ctx: MutationCtx, rows: Rows, personId: Id<"people">): Promise<Doc<"wikiBlocks">> {
  if (rows.staged) return rows.staged
  const live = rows.live!
  const id = await ctx.db.insert("wikiBlocks", {
    ...copyOf(live),
    state: "staged",
    stagedOf: live._id,
    // A system rebuild still running on the live row lands there, never on
    // this copy, which keeps the live row's last points meanwhile.
    generationTicket: live.generationTicket + 1,
    ...(live.status === "generating" ? { status: live.points.length ? ("grounded" as const) : ("gap" as const) } : {}),
    updatedAt: Date.now(),
    updatedBy: personId,
  })
  return (await ctx.db.get(id))!
}

/** Every block of a section after Apply (staged edit over live, removals left out), in order. */
async function sectionBlocks(ctx: QueryCtx, wikiId: Id<"wikis">, sectionId: string) {
  const rows = await ctx.db
    .query("wikiBlocks")
    .withIndex("by_wikiId_and_state", (q) => q.eq("wikiId", wikiId))
    .take(1000)
  const byId = new Map<string, Rows>()
  for (const r of rows) {
    const x = byId.get(r.blockId) ?? { live: null, staged: null, removed: null }
    if (r.state === "live") x.live = r
    else if (r.state === "staged") x.staged = r
    else x.removed = r
    byId.set(r.blockId, x)
  }
  return [...byId.values()]
    .filter((x) => !x.removed && (x.staged ?? x.live)?.sectionId === sectionId)
    .map((x) => ({ rows: x, row: (x.staged ?? x.live)! }))
    .sort((a, b) => a.row.order.localeCompare(b.row.order))
}

/** Danger callouts after Apply, without `exceptBlockId` (D5). */
async function dangerCount(ctx: QueryCtx, wikiId: Id<"wikis">, exceptBlockId?: string) {
  const rows = await ctx.db
    .query("wikiBlocks")
    .withIndex("by_wikiId_and_state", (q) => q.eq("wikiId", wikiId))
    .take(1000)
  const removed = new Set(rows.filter((r) => r.state === "removedStaged").map((r) => r.blockId))
  const ids = new Set<string>()
  for (const r of rows) {
    if (r.state === "removedStaged" || removed.has(r.blockId) || r.blockId === exceptBlockId) continue
    const staged = rows.find((x) => x.blockId === r.blockId && x.state === "staged")
    const eff = staged ?? r
    if (eff.kind === "callout" && eff.tone === "danger") ids.add(r.blockId)
  }
  return ids.size
}

async function assertDangerRoom(ctx: QueryCtx, wiki: Doc<"wikis">, exceptBlockId?: string) {
  const max = wiki.maxDanger ?? DEFAULT_MAX_DANGER
  const n = await dangerCount(ctx, wiki._id, exceptBlockId)
  if (n >= max) {
    const word = ["No", "One", "Two", "Three", "Four", "Five"][n] ?? String(n)
    throw new ConvexError(
      `${word} danger ${n === 1 ? "callout" : "callouts"} already; make this a warning callout, or raise the limit (reason required).`,
    )
  }
}

function cleanText(s: string | undefined, max: number, what: string): string | undefined {
  if (s === undefined) return undefined
  const t = s.trim()
  if (t.length > max) throw new ConvexError(`${what} can be at most ${max} characters.`)
  return t
}

/** A heading is structure, not a claim (ADR 0007): it may not carry a value or a Document code. */
function cleanHeading(s: string | undefined, current?: string): string | undefined {
  const heading = cleanText(s, MAX_HEADING, "A heading")
  // An unchanged heading (sent along with another field) is not refused again.
  const fact = heading && heading !== current ? headingFact(heading) : null
  if (fact) throw new ConvexError(`A heading names a topic. Put "${fact}" in a block, where it is checked against Published.`)
  return heading
}

/** Renumber a section's blocks (all their rows) when there is no room between two keys. */
async function renumber(ctx: MutationCtx, wikiId: Id<"wikis">, sectionId: string) {
  const list = await sectionBlocks(ctx, wikiId, sectionId)
  for (const [i, x] of list.entries()) {
    const order = orderKey(i + 1)
    for (const r of [x.rows.live, x.rows.staged, x.rows.removed]) if (r) await ctx.db.patch(r._id, { order })
  }
}

// ---- Queries -----------------------------------------------------------------

/** Everything the edit layer needs for one Wiki (spec 6.4). */
export const editorState = query({
  args: { wikiId: v.id("wikis"), personId: v.optional(v.id("people")) },
  handler: async (ctx, args): Promise<EditorState | null> => {
    await requireUser(ctx)
    // Unapplied, unchecked and awaiting text is for Engineers only (spec 2.4).
    if (!args.personId || !isEngineerOrAdmin(await ctx.db.get(args.personId))) return null
    const wiki = await ctx.db.get(args.wikiId)
    if (!wiki) return null
    const names = new Map<string, string | null>()
    const nameOf = async (id: Id<"people"> | undefined | null) => {
      if (!id) return null
      if (!names.has(id)) names.set(id, (await ctx.db.get(id))?.name ?? null)
      return names.get(id) ?? null
    }
    const rows = await ctx.db
      .query("wikiBlocks")
      .withIndex("by_wikiId_and_state", (q) => q.eq("wikiId", args.wikiId))
      .take(1000)
    // The stored check evidence, so verdicts and passages survive a reload and
    // a confirmer who did not run the check reads the same quotes (spec 3.5 step 5).
    const checks = new Map<string, EditorBlock["check"]>()
    const checkOf = async (id: Id<"wikiChecks"> | undefined): Promise<EditorBlock["check"]> => {
      if (!id) return null
      if (!checks.has(id)) {
        const c = await ctx.db.get(id)
        checks.set(
          id,
          c?.ok
            ? { checkId: c._id, claims: c.claims, stats: c.stats, text: c.text, at: c.at, personId: c.personId, personName: await nameOf(c.personId) }
            : null,
        )
      }
      return checks.get(id) ?? null
    }
    const blocks: EditorBlock[] = []
    for (const r of rows)
      blocks.push({
        ...r,
        authorName: await nameOf(r.authorPersonId),
        confirmedByName: await nameOf(r.confirmedBy),
        check: await checkOf(r.checkId),
      })
    const staged = rows.filter((r) => r.state !== "live")
    const now = Date.now()
    const recent = new Map<string, { personId: Id<"people">; name: string; at: number }>()
    for (const r of staged) {
      if (!r.updatedBy || r.updatedBy === args.personId || now - r.updatedAt > ALSO_EDITING_MS) continue
      const name = await nameOf(r.updatedBy)
      const prev = recent.get(r.updatedBy)
      if (name && (!prev || prev.at < r.updatedAt)) recent.set(r.updatedBy, { personId: r.updatedBy, name, at: r.updatedAt })
    }
    if (
      wiki.outlineStaged &&
      wiki.outlineUpdatedBy &&
      wiki.outlineUpdatedBy !== args.personId &&
      now - (wiki.outlineUpdatedAt ?? 0) < ALSO_EDITING_MS
    ) {
      const name = await nameOf(wiki.outlineUpdatedBy)
      if (name && !recent.has(wiki.outlineUpdatedBy))
        recent.set(wiki.outlineUpdatedBy, { personId: wiki.outlineUpdatedBy, name, at: wiki.outlineUpdatedAt ?? now })
    }
    const eventRows = await ctx.db
      .query("wikiEvents")
      .withIndex("by_wikiId_and_at", (q) => q.eq("wikiId", args.wikiId))
      .order("desc")
      .take(20)
    const events = []
    for (const e of eventRows)
      events.push({
        _id: e._id,
        at: e.at,
        personName: await nameOf(e.personId),
        kind: e.kind,
        blockId: e.blockId ?? null,
        sectionId: e.sectionId ?? null,
        detail: e.detail,
      })
    return {
      wikiId: wiki._id,
      outline: wiki.outline ?? null,
      outlineStaged: wiki.outlineStaged ?? null,
      stagedVersion: wiki.stagedVersion ?? 0,
      blocks,
      stagedCount: staged.length + (wiki.outlineStaged ? 1 : 0),
      alsoEditing: [...recent.values()],
      allowance: await allowance(ctx, { personId: args.personId ?? null, wikiId: wiki._id }),
      settings: settingsOf(wiki),
      events,
    }
  },
})

/** The last 10 builds, for Restore previous build (spec 3.1). */
export const builds = query({
  args: { wikiId: v.id("wikis") },
  handler: async (ctx, args): Promise<BuildSummary[]> => {
    await requireUser(ctx)
    const rows = await ctx.db
      .query("wikiBuilds")
      .withIndex("by_wikiId", (q) => q.eq("wikiId", args.wikiId))
      .order("desc")
      .take(10)
    const out: BuildSummary[] = []
    for (const b of rows) {
      const person = b.personId ? await ctx.db.get(b.personId) : null
      out.push({
        _id: b._id,
        builtAt: b.builtAt,
        reason: b.reason ?? "build",
        trigger: b.trigger,
        personName: person?.name ?? null,
        points: b.content.reduce((n, s) => n + s.points.length, 0),
        sources: b.sources.map((s) => `${s.namingCode} v${s.version}`),
        restorable: !!(b.contentV2 || b.legacyContent),
      })
    }
    return out
  },
})

// ---- Outline mutations (checked-in Engineer or Admin; each writes wikiEvents) ---

const personArg = { personId: v.optional(v.id("people")) }

/** Adds a section to the unapplied Outline and returns its id. Its first block is added by the editor. */
export const addSection = mutation({
  args: {
    wikiId: v.id("wikis"),
    afterSectionId: v.union(v.string(), v.null()),
    heading: v.string(),
    instruction: v.optional(v.string()),
    safety: v.optional(v.boolean()),
    firstBlockKind: v.optional(blockKindValidator),
    ...personArg,
  },
  handler: async (ctx, args): Promise<string> => {
    const { person, wiki } = await beginEdit(ctx, args.wikiId, args.personId)
    const heading = cleanHeading(args.heading)!
    if (!heading) throw new ConvexError("Give the section a heading.")
    const instruction = cleanText(args.instruction, MAX_INSTRUCTION, "An instruction")
    const outline = workingOutline(wiki)
    const sections = [...outline.sections]
    let at = args.afterSectionId === null ? 0 : sections.findIndex((s) => s.id === args.afterSectionId) + 1
    if (args.afterSectionId !== null && at === 0) throw new ConvexError("That section no longer exists.")
    // The introduction stays first.
    while (at < sections.length && sections[at].role === "intro") at++
    const section: OutlineSection = {
      id: newWikiId("s"),
      heading,
      ...(instruction ? { instruction } : {}),
      ...(args.safety ? { safety: true } : {}),
      fold: "open",
    }
    sections.splice(at, 0, section)
    await stageOutline(ctx, wiki, { ...outline, sections }, person._id)
    await logWikiEvent(ctx, wiki._id, person._id, "outlineChanged", `Section "${heading}" added by ${person.name}`, { sectionId: section.id })
    return section.id
  },
})

/** Heading, instruction, safety, fold default. */
export const updateSection = mutation({
  args: {
    wikiId: v.id("wikis"),
    sectionId: v.string(),
    heading: v.optional(v.string()),
    instruction: v.optional(v.string()),
    safety: v.optional(v.boolean()),
    fold: v.optional(foldValidator),
    ...personArg,
  },
  handler: async (ctx, args): Promise<null> => {
    const { person, wiki } = await beginEdit(ctx, args.wikiId, args.personId)
    const outline = workingOutline(wiki)
    const old = outline.sections.find((s) => s.id === args.sectionId)
    if (!old) throw new ConvexError("That section no longer exists.")
    const heading = cleanHeading(args.heading, old.heading)
    if (heading === "") throw new ConvexError("Give the section a heading.")
    const instruction = cleanText(args.instruction, MAX_INSTRUCTION, "An instruction")
    const next: OutlineSection = { ...old }
    if (heading !== undefined) next.heading = heading
    if (instruction !== undefined) {
      if (instruction) next.instruction = instruction
      else delete next.instruction
    }
    if (args.safety !== undefined && old.role !== "intro") {
      if (args.safety) next.safety = true
      else delete next.safety
    }
    if (args.fold !== undefined) next.fold = args.fold
    // Safety sections cannot be closed by default (spec 3.2).
    if (next.safety) next.fold = "open"
    const changes = [
      heading !== undefined && heading !== old.heading ? `renamed to "${heading}"` : null,
      instruction !== undefined && instruction !== (old.instruction ?? "") ? "instruction changed" : null,
      !!next.safety !== !!old.safety ? (next.safety ? "made a safety section" : "no longer a safety section") : null,
      next.fold !== old.fold ? `${next.fold} by default` : null,
    ].filter(Boolean)
    if (changes.length === 0) return null
    await stageOutline(
      ctx,
      wiki,
      { ...outline, sections: outline.sections.map((s) => (s.id === old.id ? next : s)) },
      person._id,
    )
    await logWikiEvent(ctx, wiki._id, person._id, "outlineChanged", `Section "${old.heading}" ${changes.join(", ")} by ${person.name}`, { sectionId: old.id })
    return null
  },
})

/** Move one place up or down (no drag and drop in the MVP). The introduction stays first. */
export const moveSection = mutation({
  args: {
    wikiId: v.id("wikis"),
    sectionId: v.string(),
    direction: v.union(v.literal("up"), v.literal("down")),
    ...personArg,
  },
  handler: async (ctx, args): Promise<null> => {
    const { person, wiki } = await beginEdit(ctx, args.wikiId, args.personId)
    const outline = workingOutline(wiki)
    const sections = [...outline.sections]
    const i = sections.findIndex((s) => s.id === args.sectionId)
    if (i < 0) throw new ConvexError("That section no longer exists.")
    const j = args.direction === "up" ? i - 1 : i + 1
    if (j < 0 || j >= sections.length || sections[i].role === "intro" || sections[j].role === "intro") return null
    ;[sections[i], sections[j]] = [sections[j], sections[i]]
    await stageOutline(ctx, wiki, { ...outline, sections }, person._id)
    await logWikiEvent(ctx, wiki._id, person._id, "outlineChanged", `Section "${sections[j].heading}" moved ${args.direction} by ${person.name}`, { sectionId: args.sectionId })
    return null
  },
})

/** Removes a section from the unapplied Outline. A safety section needs a reason (logged). */
export const removeSection = mutation({
  args: { wikiId: v.id("wikis"), sectionId: v.string(), reason: v.optional(v.string()), ...personArg },
  handler: async (ctx, args): Promise<null> => {
    const { person, wiki } = await beginEdit(ctx, args.wikiId, args.personId)
    const outline = workingOutline(wiki)
    const section = outline.sections.find((s) => s.id === args.sectionId)
    if (!section) throw new ConvexError("That section no longer exists.")
    const reason = args.reason?.trim() ?? ""
    if (section.role === "intro") {
      await stageOutline(ctx, wiki, { ...outline, introEnabled: false }, person._id)
      await logWikiEvent(ctx, wiki._id, person._id, "outlineChanged", `Introduction switched off by ${person.name}`, { sectionId: section.id })
      return null
    }
    if (section.safety && !reason) throw new ConvexError("Say why this safety section is removed.")
    // Blocks that exist only as unapplied changes go with it; live ones go on Apply.
    for (const x of await sectionBlocks(ctx, wiki._id, section.id))
      if (!x.rows.live) for (const r of [x.rows.staged, x.rows.removed]) if (r) await ctx.db.delete(r._id)
    await stageOutline(ctx, wiki, { ...outline, sections: outline.sections.filter((s) => s.id !== section.id) }, person._id)
    await logWikiEvent(
      ctx,
      wiki._id,
      person._id,
      "outlineChanged",
      `Section "${section.heading}" removed by ${person.name}${reason ? `: ${reason}` : ""}`,
      { sectionId: section.id },
    )
    return null
  },
})

// ---- Block mutations ---------------------------------------------------------------

/**
 * Adds a staged block after `afterBlockId` (null: first in the section) and
 * returns its blockId. The editor then calls ai.wikiBlock.generateBlock for a
 * generated block, so budget messages reach the button. "Write by hand"
 * passes origin "written" (kind prose).
 */
export const addBlock = mutation({
  args: {
    wikiId: v.id("wikis"),
    sectionId: v.string(),
    afterBlockId: v.union(v.string(), v.null()),
    kind: blockKindValidator,
    origin: v.optional(v.union(v.literal("generated"), v.literal("written"))),
    instruction: v.optional(v.string()),
    tone: v.optional(calloutToneValidator),
    sourceSet: v.optional(sourceSetValidator),
    readingLevel: v.optional(readingLevelValidator),
    length: v.optional(lengthValidator),
    ...personArg,
  },
  handler: async (ctx, args): Promise<string> => {
    const { person, wiki } = await beginEdit(ctx, args.wikiId, args.personId)
    const outline = workingOutline(wiki)
    const section = outline.sections.find((s) => s.id === args.sectionId)
    if (!section) throw new ConvexError("That section no longer exists.")
    if (args.kind === "gap" || args.kind === "images") throw new ConvexError("This kind of block is made by the build, not added by hand.")
    const origin = args.origin ?? "generated"
    const kind = origin === "written" ? "prose" : args.kind
    const tone = kind === "callout" ? (args.tone ?? "tip") : undefined
    if (tone === "danger") await assertDangerRoom(ctx, wiki)
    const instruction = cleanText(args.instruction, MAX_INSTRUCTION, "An instruction")

    const list = await sectionBlocks(ctx, wiki._id, section.id)
    const i = args.afterBlockId === null ? -1 : list.findIndex((x) => x.row.blockId === args.afterBlockId)
    if (args.afterBlockId !== null && i < 0) throw new ConvexError("That block no longer exists.")
    let order = orderBetween(i >= 0 ? list[i].row.order : null, list[i + 1]?.row.order ?? null)
    if (order === null) {
      await renumber(ctx, wiki._id, section.id)
      const fresh = await sectionBlocks(ctx, wiki._id, section.id)
      order = orderBetween(i >= 0 ? fresh[i].row.order : null, fresh[i + 1]?.row.order ?? null) ?? orderKey(fresh.length + 1)
    }
    const blockId = newWikiId("b")
    const now = Date.now()
    await ctx.db.insert("wikiBlocks", {
      wikiId: wiki._id,
      sectionId: section.id,
      blockId,
      order,
      state: "staged",
      kind,
      origin,
      status: origin === "written" ? "unchecked" : "generating",
      ...(tone ? { tone } : {}),
      ...(instruction ? { instruction } : {}),
      ...(args.readingLevel ? { readingLevel: args.readingLevel } : {}),
      ...(args.length ? { length: args.length } : {}),
      sourceSet: args.sourceSet ?? "scope",
      pinnedChunkIds: [],
      hiddenPointKeys: [],
      points: [],
      ...(origin === "written" ? { writtenText: "", authorPersonId: person._id } : {}),
      dependsOn: [],
      generationTicket: 0,
      droppedPoints: 0,
      updatedAt: now,
      updatedBy: person._id,
    })
    await bumpStaged(ctx, wiki._id)
    await logWikiEvent(
      ctx,
      wiki._id,
      person._id,
      "blockAdded",
      `${origin === "written" ? "Written" : "Generated"} ${kind} block added to "${section.heading}" by ${person.name}`,
      { blockId, sectionId: section.id },
    )
    return blockId
  },
})

/** Fold, tone, instruction, source set, pinned passages, reading level, length. Stages a copy of a live block. */
export const updateBlock = mutation({
  args: {
    wikiId: v.id("wikis"),
    blockId: v.string(),
    fold: v.optional(v.union(blockFoldValidator, v.null())),
    tone: v.optional(calloutToneValidator),
    instruction: v.optional(v.string()),
    sourceSet: v.optional(sourceSetValidator),
    pinnedChunkIds: v.optional(v.array(v.id("chunks"))),
    readingLevel: v.optional(readingLevelValidator),
    length: v.optional(lengthValidator),
    ...personArg,
  },
  handler: async (ctx, args): Promise<null> => {
    const { person, wiki } = await beginEdit(ctx, args.wikiId, args.personId)
    const rows = await rowsOrThrow(ctx, wiki._id, args.blockId)
    const current = rows.staged ?? rows.live!
    if (args.tone === "danger" && current.tone !== "danger") await assertDangerRoom(ctx, wiki, args.blockId)
    if (args.pinnedChunkIds && args.pinnedChunkIds.length > MAX_PINNED_CHUNKS)
      throw new ConvexError(`A block can pin at most ${MAX_PINNED_CHUNKS} passages.`)
    const instruction = cleanText(args.instruction, MAX_INSTRUCTION, "An instruction")
    const row = await ensureStaged(ctx, rows, person._id)
    await ctx.db.patch(row._id, {
      ...(args.fold !== undefined ? { fold: args.fold ?? undefined } : {}),
      ...(args.tone !== undefined && row.kind === "callout" ? { tone: args.tone } : {}),
      ...(instruction !== undefined ? { instruction: instruction || undefined } : {}),
      ...(args.sourceSet !== undefined ? { sourceSet: args.sourceSet } : {}),
      ...(args.pinnedChunkIds !== undefined ? { pinnedChunkIds: [...new Set(args.pinnedChunkIds)] } : {}),
      ...(args.readingLevel !== undefined ? { readingLevel: args.readingLevel } : {}),
      ...(args.length !== undefined ? { length: args.length } : {}),
      updatedAt: Date.now(),
      updatedBy: person._id,
    })
    await bumpStaged(ctx, wiki._id)
    await logWikiEvent(ctx, wiki._id, person._id, "blockChanged", `Block settings changed by ${person.name}`, { blockId: args.blockId, sectionId: row.sectionId })
    return null
  },
})

/** Move one place up or down within its section (staged on both blocks). */
export const moveBlock = mutation({
  args: {
    wikiId: v.id("wikis"),
    blockId: v.string(),
    direction: v.union(v.literal("up"), v.literal("down")),
    ...personArg,
  },
  handler: async (ctx, args): Promise<null> => {
    const { person, wiki } = await beginEdit(ctx, args.wikiId, args.personId)
    const rows = await rowsOrThrow(ctx, wiki._id, args.blockId)
    const sectionId = (rows.staged ?? rows.live!).sectionId
    const list = await sectionBlocks(ctx, wiki._id, sectionId)
    const i = list.findIndex((x) => x.row.blockId === args.blockId)
    const j = args.direction === "up" ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= list.length) return null
    const a = await ensureStaged(ctx, list[i].rows, person._id)
    const b = await ensureStaged(ctx, list[j].rows, person._id)
    let [oa, ob] = [a.order, b.order]
    if (oa === ob) {
      oa = orderKey(i + 1)
      ob = orderKey(j + 1)
    }
    const now = Date.now()
    await ctx.db.patch(a._id, { order: ob, updatedAt: now, updatedBy: person._id })
    await ctx.db.patch(b._id, { order: oa, updatedAt: now, updatedBy: person._id })
    await bumpStaged(ctx, wiki._id)
    await logWikiEvent(ctx, wiki._id, person._id, "blockChanged", `Block moved ${args.direction} by ${person.name}`, { blockId: args.blockId, sectionId })
    return null
  },
})

/** Stages the removal of a live block; a block that was never applied is deleted at once. */
export const removeBlock = mutation({
  args: { wikiId: v.id("wikis"), blockId: v.string(), reason: v.optional(v.string()), ...personArg },
  handler: async (ctx, args): Promise<null> => {
    const { person, wiki } = await beginEdit(ctx, args.wikiId, args.personId)
    const rows = await rowsOrThrow(ctx, wiki._id, args.blockId)
    const sectionId = (rows.staged ?? rows.live!).sectionId
    if (rows.staged) await ctx.db.delete(rows.staged._id)
    if (rows.live && !rows.removed)
      await ctx.db.insert("wikiBlocks", {
        ...copyOf(rows.live),
        state: "removedStaged",
        stagedOf: rows.live._id,
        updatedAt: Date.now(),
        updatedBy: person._id,
      })
    await bumpStaged(ctx, wiki._id)
    const reason = args.reason?.trim()
    await logWikiEvent(ctx, wiki._id, person._id, "blockRemoved", `Block removed by ${person.name}${reason ? `: ${reason}` : ""}`, { blockId: args.blockId, sectionId })
    return null
  },
})

/** Drops the unapplied version (edit or removal) of one block (spec 3.3 Discard). */
export const discardBlock = mutation({
  args: { wikiId: v.id("wikis"), blockId: v.string(), ...personArg },
  handler: async (ctx, args): Promise<null> => {
    const { person, wiki } = await beginEdit(ctx, args.wikiId, args.personId)
    const rows = await rowsOf(ctx, wiki._id, args.blockId)
    for (const r of [rows.staged, rows.removed]) if (r) await ctx.db.delete(r._id)
    await bumpStaged(ctx, wiki._id)
    await logWikiEvent(ctx, wiki._id, person._id, "blockChanged", `Unapplied change discarded by ${person.name}`, { blockId: args.blockId })
    return null
  },
})

/** Stores hand-written text (max 1,200 chars); the block goes back to `unchecked`. */
export const setWrittenText = mutation({
  args: { wikiId: v.id("wikis"), blockId: v.string(), text: v.string(), ...personArg },
  handler: async (ctx, args): Promise<null> => {
    const { person, wiki } = await beginEdit(ctx, args.wikiId, args.personId)
    const text = args.text.trim()
    if (text.length > MAX_WRITTEN_CHARS) throw new ConvexError(`Write at most ${MAX_WRITTEN_CHARS} characters.`)
    const rows = await rowsOrThrow(ctx, wiki._id, args.blockId)
    const row = await ensureStaged(ctx, rows, person._id)
    await ctx.db.patch(row._id, {
      writtenText: text,
      // A generated block whose wording a person changes becomes "edited".
      origin: row.origin === "generated" ? "edited" : row.origin,
      kind: row.kind === "intro" || row.kind === "keyPoints" || row.kind === "prose" ? row.kind : "prose",
      // The author is whoever wrote the text now on the block, so they can never confirm it.
      authorPersonId: person._id,
      status: "unchecked",
      // A generation still running for this block lands as stale.
      generationTicket: row.generationTicket + 1,
      points: [],
      checkId: undefined,
      checkedAt: undefined,
      confirmedBy: undefined,
      confirmedAt: undefined,
      sentBackNote: undefined,
      dependsOn: [],
      updatedAt: Date.now(),
      updatedBy: person._id,
    })
    await bumpStaged(ctx, wiki._id)
    await logWikiEvent(ctx, wiki._id, person._id, "blockChanged", `Text written by ${person.name}; not checked yet`, { blockId: args.blockId, sectionId: row.sectionId })
    return null
  },
})

// ---- Apply, discard, confirm, restore ------------------------------------------------

/**
 * Applies every unapplied change at once, recomposes, stores the build and
 * logs it. Refused with a ConvexError when `stagedVersion` is not the current
 * one; returns `blockedBy` (nothing applied) when a staged block is
 * unchecked, contradicts, notCovered or generating.
 */
export const applyStaged = mutation({
  args: { wikiId: v.id("wikis"), stagedVersion: v.number(), ...personArg },
  handler: async (
    ctx,
    args,
  ): Promise<{ applied: number; blockedBy: { blockId: string; status: Doc<"wikiBlocks">["status"] }[] }> => {
    const { person, wiki } = await beginEdit(ctx, args.wikiId, args.personId)
    const rows = await ctx.db
      .query("wikiBlocks")
      .withIndex("by_wikiId_and_state", (q) => q.eq("wikiId", wiki._id))
      .take(1000)
    if ((wiki.stagedVersion ?? 0) !== args.stagedVersion) {
      const latest = [...rows.filter((r) => r.state !== "live" && r.updatedBy), ...(wiki.outlineUpdatedBy ? [{ updatedBy: wiki.outlineUpdatedBy, updatedAt: wiki.outlineUpdatedAt ?? 0 }] : [])]
        .sort((a, b) => b.updatedAt - a.updatedAt)[0]
      const who = latest?.updatedBy ? (await ctx.db.get(latest.updatedBy))?.name : null
      throw new ConvexError(`${who && latest?.updatedBy !== person._id ? who : "Someone"} changed this since you opened Preview.`)
    }
    const staged = rows.filter((r) => r.state === "staged")
    const removed = rows.filter((r) => r.state === "removedStaged")
    const blockedBy = staged.filter((r) => BLOCKS_APPLY.includes(r.status)).map((r) => ({ blockId: r.blockId, status: r.status }))
    if (blockedBy.length) return { applied: 0, blockedBy }
    const outline = workingOutline(wiki)
    const sectionIds = new Set(outline.sections.map((s) => s.id))
    const live = new Map(rows.filter((r) => r.state === "live").map((r) => [r.blockId, r]))
    let applied = wiki.outlineStaged ? 1 : 0
    for (const r of removed) {
      const l = live.get(r.blockId)
      if (l) await ctx.db.delete(l._id)
      live.delete(r.blockId)
      await ctx.db.delete(r._id)
      applied += 1
    }
    for (const r of staged) {
      const l = live.get(r.blockId)
      if (l) await ctx.db.delete(l._id)
      live.delete(r.blockId)
      if (!sectionIds.has(r.sectionId)) {
        await ctx.db.delete(r._id)
        continue
      }
      await ctx.db.patch(r._id, { state: "live", stagedOf: undefined })
      applied += 1
    }
    // Live blocks of removed sections go with them.
    for (const l of live.values()) if (!sectionIds.has(l.sectionId)) await ctx.db.delete(l._id)
    await ctx.db.patch(wiki._id, {
      outline,
      outlineStaged: undefined,
      outlineUpdatedAt: Date.now(),
      outlineUpdatedBy: person._id,
      stagedVersion: (wiki.stagedVersion ?? 0) + 1,
    })
    const res = await recompose(ctx, wiki._id)
    await storeBuild(ctx, wiki, "apply", person._id, res?.content ?? null)
    await logWikiEvent(ctx, wiki._id, person._id, "applied", `${applied} unapplied ${applied === 1 ? "change" : "changes"} applied by ${person.name}`)
    return { applied, blockedBy: [] }
  },
})

/** Drops every unapplied change of this Wiki. */
export const discardStaged = mutation({
  args: { wikiId: v.id("wikis"), ...personArg },
  handler: async (ctx, args): Promise<{ discarded: number }> => {
    const { person, wiki } = await beginEdit(ctx, args.wikiId, args.personId)
    const rows = await ctx.db
      .query("wikiBlocks")
      .withIndex("by_wikiId_and_state", (q) => q.eq("wikiId", wiki._id))
      .take(1000)
    let discarded = wiki.outlineStaged ? 1 : 0
    for (const r of rows)
      if (r.state !== "live") {
        await ctx.db.delete(r._id)
        discarded += 1
      }
    await ctx.db.patch(wiki._id, { outlineStaged: undefined, stagedVersion: (wiki.stagedVersion ?? 0) + 1 })
    await logWikiEvent(ctx, wiki._id, person._id, "outlineChanged", `${discarded} unapplied ${discarded === 1 ? "change" : "changes"} discarded by ${person.name}`)
    return { discarded }
  },
})

async function awaitingRow(ctx: QueryCtx, wikiId: Id<"wikis">, blockId: string) {
  const rows = await rowsOrThrow(ctx, wikiId, blockId)
  const row = [rows.staged, rows.live].find((r) => r?.status === "awaitingConfirm")
  if (!row) throw new ConvexError("This block does not wait for a confirm.")
  return row
}

/** A second Engineer confirms an `awaitingConfirm` block; its author cannot. */
export const confirmBlock = mutation({
  args: { wikiId: v.id("wikis"), blockId: v.string(), ...personArg },
  handler: async (ctx, args): Promise<null> => {
    const { person, wiki } = await beginEdit(ctx, args.wikiId, args.personId)
    const row = await awaitingRow(ctx, wiki._id, args.blockId)
    const check = row.checkId ? await ctx.db.get(row.checkId) : null
    if (row.origin === "generated" || !row.authorPersonId || !check?.ok || check.text.trim() !== (row.writtenText ?? "").trim())
      throw new ConvexError("This block has no check of its written text. Check it again first.")
    if (row.authorPersonId === person._id) throw new ConvexError("You wrote this block, so another Engineer must confirm it.")
    if (check.personId === person._id) throw new ConvexError("You ran the check on this block, so another Engineer must confirm it.")
    const now = Date.now()
    await ctx.db.patch(row._id, { status: "checked", confirmedBy: person._id, confirmedAt: now, updatedAt: now })
    await logWikiEvent(ctx, wiki._id, person._id, "confirmed", `Confirmed by ${person.name}`, { blockId: args.blockId, sectionId: row.sectionId })
    if (row.state === "live") {
      // Readers see the confirmed block now: store the build, so Restore can return to it.
      const res = await recompose(ctx, wiki._id)
      await storeBuild(ctx, wiki, "confirm", person._id, res?.content ?? null)
    }
    return null
  },
})

/** Returns an `awaitingConfirm` block to its author as `unchecked`, with a note. */
export const sendBack = mutation({
  args: { wikiId: v.id("wikis"), blockId: v.string(), note: v.string(), ...personArg },
  handler: async (ctx, args): Promise<null> => {
    const { person, wiki } = await beginEdit(ctx, args.wikiId, args.personId)
    const note = args.note.trim()
    if (!note) throw new ConvexError("Add a note for the author.")
    const row = await awaitingRow(ctx, wiki._id, args.blockId)
    await ctx.db.patch(row._id, { status: "unchecked", sentBackNote: note.slice(0, 500), updatedAt: Date.now(), updatedBy: person._id })
    await logWikiEvent(ctx, wiki._id, person._id, "sentBack", `Sent back by ${person.name}: ${note.slice(0, 200)}`, { blockId: args.blockId, sectionId: row.sectionId })
    return null
  },
})

const BUILD_REASON: Record<NonNullable<Doc<"wikiBuilds">["reason"]>, string> = {
  build: "build",
  apply: "applied changes",
  confirm: "confirmed block",
  restore: "restore",
  preMigration: "before the move to the new layout",
}

/** Writes a stored build back as a new build (nothing is deleted from history); blocked while an AI job runs. */
export const restoreBuild = mutation({
  args: { wikiId: v.id("wikis"), buildId: v.id("wikiBuilds"), reason: v.string(), ...personArg },
  handler: async (ctx, args): Promise<null> => {
    await requireUserId(ctx)
    const person = await requireEngineer(ctx, args.personId)
    const wiki = await wikiOrThrow(ctx, args.wikiId)
    const reason = args.reason.trim()
    if (!reason) throw new ConvexError("Say why you restore this build.")
    const build = await ctx.db.get(args.buildId)
    if (!build || build.wikiId !== wiki._id) throw new ConvexError("That build no longer exists.")
    if (!build.contentV2 && !build.legacyContent) throw new ConvexError("This older build cannot be restored.")
    const rows = await ctx.db
      .query("wikiBlocks")
      .withIndex("by_wikiId_and_state", (q) => q.eq("wikiId", wiki._id))
      .take(1000)
    if (wiki.status === "generating" || rows.some((r) => r.status === "generating"))
      throw new ConvexError("An AI job is running for this Wiki. Restore when it is done.")
    if (rows.some((r) => r.state !== "live") || wiki.outlineStaged)
      throw new ConvexError("Apply or discard the unapplied changes first.")
    await restoreInto(ctx, wiki, build)
    // Restored written blocks are verified by code again and citations of a
    // version that is no longer live drop out, as at every compose (spec 3.8).
    const res = await recompose(ctx, wiki._id)
    const fresh = (await ctx.db.get(wiki._id))!
    await storeBuild(ctx, fresh, "restore", person._id, res ? res.content : isContentV2(fresh.content) ? fresh.content : null)
    // No clock time here: the server does not know the plant's time zone, and the event has its own time.
    const by = build.personId ? (await ctx.db.get(build.personId))?.name : null
    const what = BUILD_REASON[build.reason ?? "build"]
    await logWikiEvent(ctx, wiki._id, person._id, "restored", `Earlier build (${what}${by ? ` by ${by}` : ""}) restored by ${person.name}: ${reason.slice(0, 200)}`)
    return null
  },
})

/** Puts a stored build back: Outline, live blocks and content (v2), or the legacy content without an Outline. */
async function restoreInto(ctx: MutationCtx, wiki: Doc<"wikis">, build: Doc<"wikiBuilds">) {
  for (const r of await ctx.db
    .query("wikiBlocks")
    .withIndex("by_wikiId_and_state", (q) => q.eq("wikiId", wiki._id))
    .take(1000))
    await ctx.db.delete(r._id)
  const titles = new Map(wiki.sources.map((s) => [s.documentId as string, s.title]))
  const sources = []
  for (const s of build.sources) {
    const title = titles.get(s.documentId) ?? (await ctx.db.get(s.documentId))?.title ?? s.namingCode
    sources.push({ ...s, title })
  }
  const now = Date.now()
  if (build.contentV2) {
    for (const b of build.blocks ?? []) await ctx.db.insert("wikiBlocks", { ...b, state: "live", stagedOf: undefined, updatedAt: now })
    await ctx.db.patch(wiki._id, {
      outline: build.outline,
      outlineStaged: undefined,
      content: build.contentV2,
      contentV2Pending: undefined,
      sources,
      stagedVersion: (wiki.stagedVersion ?? 0) + 1,
      updatedAt: now,
    })
  } else {
    await ctx.db.patch(wiki._id, {
      outline: undefined,
      outlineStaged: undefined,
      content: build.legacyContent,
      contentV2Pending: undefined,
      sources,
      stagedVersion: (wiki.stagedVersion ?? 0) + 1,
      updatedAt: now,
    })
  }
}

/** Second-Engineer confirm, danger limit (raising it needs a reason, at most 5, D5), reading level, length. */
export const updateSettings = mutation({
  args: {
    wikiId: v.id("wikis"),
    confirmByAnother: v.optional(v.boolean()),
    maxDanger: v.optional(v.number()),
    reason: v.optional(v.string()),
    readingLevel: v.optional(readingLevelValidator),
    length: v.optional(lengthValidator),
    ...personArg,
  },
  handler: async (ctx, args): Promise<null> => {
    await requireUserId(ctx)
    const person = await requireEngineer(ctx, args.personId)
    const wiki = await wikiOrThrow(ctx, args.wikiId)
    const before = settingsOf(wiki)
    const reason = args.reason?.trim() ?? ""
    const changes: string[] = []
    const patch: Partial<Doc<"wikis">> = {}
    if (args.maxDanger !== undefined && args.maxDanger !== before.maxDanger) {
      const n = Math.round(args.maxDanger)
      if (n < 1 || n > MAX_MAX_DANGER) throw new ConvexError(`The danger limit is between 1 and ${MAX_MAX_DANGER}.`)
      if (n > before.maxDanger && !reason) throw new ConvexError("Say why this Wiki needs more danger callouts.")
      patch.maxDanger = n
      changes.push(`danger limit ${before.maxDanger} to ${n}`)
    }
    if (args.confirmByAnother !== undefined && args.confirmByAnother !== before.confirmByAnother) {
      patch.confirmByAnother = args.confirmByAnother
      changes.push(args.confirmByAnother ? "second Engineer confirms written text" : "no second Engineer needed")
    }
    if (args.readingLevel !== undefined && args.readingLevel !== before.readingLevel) {
      patch.readingLevel = args.readingLevel
      changes.push(`reading level ${args.readingLevel === "floor" ? "Floor" : "Office"}`)
    }
    if (args.length !== undefined && args.length !== before.length) {
      patch.length = args.length
      changes.push(`length ${args.length === "oneScreen" ? "One screen" : args.length === "full" ? "Full" : "Normal"}`)
    }
    if (changes.length === 0) return null
    await ctx.db.patch(wiki._id, { ...patch, updatedAt: Date.now() })
    await logWikiEvent(ctx, wiki._id, person._id, "settingChanged", `${changes.join(", ")} by ${person.name}${reason ? `: ${reason}` : ""}`)
    if (patch.maxDanger !== undefined) await recompose(ctx, wiki._id)
    return null
  },
})

/**
 * Adds a Published Document to the Wiki's Scope ("suggested by AI search"
 * when viaAi) and regenerates only `forBlockId` when given, not the Wiki.
 */
export const addToScope = mutation({
  args: {
    wikiId: v.id("wikis"),
    documentId: v.id("documents"),
    viaAi: v.boolean(),
    forBlockId: v.optional(v.string()),
    ...personArg,
  },
  handler: async (ctx, args): Promise<null> => {
    await requireUserId(ctx)
    const person = await requireEngineer(ctx, args.personId)
    const wiki = await wikiOrThrow(ctx, args.wikiId)
    const doc = await ctx.db.get(args.documentId)
    if (!doc || !isPublished(doc)) throw new ConvexError("Only a Published Document can be added to the Scope.")
    const { published } = await resolveScope(ctx, wiki.scope)
    if (!published.some((d) => d._id === doc._id)) {
      await ctx.db.patch(wiki._id, {
        scope: {
          ...wiki.scope,
          documentIds: [...wiki.scope.documentIds.filter((id) => id !== doc._id), doc._id],
          excludedDocumentIds: (wiki.scope.excludedDocumentIds ?? []).filter((id) => id !== doc._id),
        },
        updatedAt: Date.now(),
      })
      await logWikiEvent(
        ctx,
        wiki._id,
        person._id,
        "scopeChanged",
        `${doc.namingCode} added by ${person.name}${args.viaAi ? ", suggested by AI search" : ""}`,
        args.forBlockId ? { blockId: args.forBlockId } : {},
      )
    }
    if (args.forBlockId) {
      const rows = await rowsOf(ctx, wiki._id, args.forBlockId)
      const row = rows.staged ?? rows.live
      if (row?.origin === "generated" && !rows.removed)
        await ctx.scheduler.runAfter(0, internal.ai.wikiBlock.regenerateBlock, { wikiId: wiki._id, blockId: args.forBlockId })
    }
    return null
  },
})

/** One read of a Wiki (spec 7.5): no person, no text. The reader sends one per page visit, on leave. */
export const recordRead = mutation({
  args: {
    wikiId: v.id("wikis"),
    surface: v.union(v.literal("desktop"), v.literal("phone")),
    maxSectionIndex: v.number(),
    sectionCount: v.number(),
    foldToggles: v.number(),
    checkedIn: v.boolean(),
  },
  handler: async (ctx, args): Promise<null> => {
    await requireUserId(ctx)
    if (!(await ctx.db.get(args.wikiId))) return null
    await ctx.db.insert("wikiReads", {
      ...args,
      at: Date.now(),
      maxSectionIndex: Math.max(0, Math.round(args.maxSectionIndex)),
      sectionCount: Math.max(0, Math.round(args.sectionCount)),
      foldToggles: Math.max(0, Math.min(1000, Math.round(args.foldToggles))),
    })
    return null
  },
})

// ---- Internal ------------------------------------------------------------------

/**
 * Starts a block generation (ai.wikiBlock calls this first): bumps the
 * block's ticket, sets `generating`, and returns what the generator needs.
 * A person regenerating a live block gets a staged copy (Keep or Discard
 * before Apply); a system rebuild regenerates the live row in place.
 */
export const beginBlockGeneration = internalMutation({
  args: { wikiId: v.id("wikis"), blockId: v.string(), personId: v.optional(v.union(v.id("people"), v.null())) },
  handler: async (ctx, args) => {
    const wiki = await wikiOrThrow(ctx, args.wikiId)
    const rows = await rowsOf(ctx, args.wikiId, args.blockId)
    if (!rows.live && !rows.staged) throw new ConvexError("Block not found")
    if (rows.removed) throw new ConvexError("This block is removed in the unapplied changes.")
    const row = rows.staged ?? (args.personId ? await ensureStaged(ctx, rows, args.personId) : rows.live!)
    if (row.origin !== "generated") throw new ConvexError("Written blocks are never regenerated.")
    const ticket = row.generationTicket + 1
    await ctx.db.patch(row._id, { generationTicket: ticket, status: "generating", error: undefined, updatedAt: Date.now() })
    if (row.state === "staged") await bumpStaged(ctx, wiki._id)
    const outline = wiki.outlineStaged ?? wiki.outline
    const section = outline?.sections.find((s) => s.id === row.sectionId) ?? null
    return {
      ticket,
      block: {
        blockId: row.blockId,
        kind: row.kind,
        tone: row.tone ?? null,
        instruction: row.instruction ?? null,
        sourceSet: row.sourceSet,
        pinnedChunkIds: row.pinnedChunkIds,
        hiddenPointKeys: row.hiddenPointKeys,
        readingLevel: row.readingLevel ?? wiki.readingLevel ?? null,
        length: row.length ?? wiki.length ?? null,
      },
      section: section ? { id: section.id, heading: section.heading, instruction: section.instruction ?? null, safety: section.safety ?? false } : null,
      wiki: {
        title: wiki.title,
        purpose: wiki.purpose,
        scope: wiki.scope,
        maxDanger: wiki.maxDanger ?? DEFAULT_MAX_DANGER,
      },
    }
  },
})

/**
 * A finished block generation (SaveBlockGenerationArgs). Rejects a stale
 * ticket. Generated blocks land as `grounded` (or `gap`); `error` sets
 * `failed` and keeps the previous points. A live row is recomposed at once.
 */
export const saveBlockGeneration = internalMutation({
  args: saveBlockGenerationArgs,
  handler: async (ctx, args): Promise<boolean> => {
    const rows = await rowsOf(ctx, args.wikiId, args.blockId)
    // The row the generation started on: same ticket, and still generated
    // (text a person wrote meanwhile is never overwritten).
    const row = [rows.staged, rows.live].find((r) => r && r.generationTicket === args.ticket && r.origin === "generated")
    if (!row) return false
    const now = Date.now()
    if (args.error) {
      // A block that never had content cannot stay "failed" forever as a live row: keep the previous points.
      await ctx.db.patch(row._id, { status: row.points.length && row.state === "live" ? "grounded" : "failed", error: args.error.slice(0, 300), updatedAt: now })
      return true
    }
    const gap = args.gap || args.points.length === 0
    await ctx.db.patch(row._id, {
      points: gap ? [] : args.points,
      status: gap ? "gap" : "grounded",
      ...(args.columns?.length && !row.columns?.length ? { columns: args.columns } : {}),
      dependsOn: dependsOnOf(args.points),
      droppedPoints: args.dropped.length,
      error: undefined,
      updatedAt: now,
    })
    await logWikiEvent(ctx, args.wikiId, null, "blockChanged", gap ? "Generated: no Published source covers this" : `Generated ${args.points.length} points (${args.model})`, { blockId: args.blockId, sectionId: row.sectionId })
    if (row.state === "live") await recompose(ctx, args.wikiId)
    return true
  },
})

/**
 * The outcome of a Check against Published on a block (Lane C). Sets the
 * status from the verdicts (spec 3.5 step 3) and the cited points.
 */
export const saveCheckResult = internalMutation({
  args: {
    wikiId: v.id("wikis"),
    blockId: v.string(),
    checkId: v.id("wikiChecks"),
    status: blockStatusValidator,
    points: v.array(pointValidator),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const rows = await rowsOf(ctx, args.wikiId, args.blockId)
    const check = await ctx.db.get(args.checkId)
    if (!check?.ok) return false
    const current = rows.staged ?? rows.live
    // Only text a person wrote into this block is checked; a generated block,
    // or text that changed while the check ran, keeps its status.
    if (!current || rows.removed || current.origin === "generated" || (current.writtenText ?? "").trim() !== check.text.trim()) return false
    // A check runs on the text being written: stage a copy of a live block first.
    const row = rows.staged ?? (await ensureStaged(ctx, rows, check.personId))
    await ctx.db.patch(row._id, {
      status: args.status,
      points: args.points,
      dependsOn: dependsOnOf(args.points),
      checkId: args.checkId,
      // "verified" in the origin line only when the check passed.
      checkedAt: args.status === "checked" || args.status === "awaitingConfirm" ? check.at : undefined,
      confirmedBy: undefined,
      confirmedAt: undefined,
      updatedAt: Date.now(),
    })
    await bumpStaged(ctx, args.wikiId)
    await logWikiEvent(ctx, args.wikiId, check.personId, "checkRun", `Check against Published: ${args.status}`, { blockId: args.blockId, sectionId: row.sectionId })
    return true
  },
})

/** Outline plus live visible blocks into `wikis.content` (mode "legacy": into `contentV2Pending`). */
export const compose = internalMutation({
  args: { wikiId: v.id("wikis"), mode: v.union(v.literal("normal"), v.literal("legacy")) },
  handler: async (ctx, args) => {
    const res = await recompose(ctx, args.wikiId, args.mode)
    return res ? { points: allPoints(res.content).length, ...res.stats, needsRecheck: res.recheck.length } : null
  },
})

// ---- Migration (spec 6.3) ---------------------------------------------------------------

function keyMultiset(keys: string[]) {
  const m = new Map<string, number>()
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1)
  return m
}

function sameMultiset(a: Map<string, number>, b: Map<string, number>) {
  if (a.size !== b.size) return false
  for (const [k, n] of a) if (b.get(k) !== n) return false
  return true
}

/**
 * Moves legacy Wikis to the Outline. Per Wiki: snapshot first; one section
 * and one generated block per legacy section with its points unchanged; an
 * intro section with an intro and a key points block to generate; compose in
 * legacy mode into `contentV2Pending`; the point multiset must be equal or
 * everything is undone. Readers keep the old content until the intro build
 * swaps it (wikis.saveGeneration). Idempotent: a Wiki with an Outline is skipped.
 *
 * Run: npx convex run wikiBlocks:migrateLegacy
 */
export const migrateLegacy = internalMutation({
  args: { wikiId: v.optional(v.id("wikis")) },
  handler: async (ctx, args): Promise<{ migrated: number; skipped: number; problems: string[] }> => {
    const wikis = args.wikiId ? [await wikiOrThrow(ctx, args.wikiId)] : await ctx.db.query("wikis").take(200)
    let migrated = 0
    let skipped = 0
    const problems: string[] = []
    for (const wiki of wikis) {
      if (wiki.outline || !wiki.content || isContentV2(wiki.content)) {
        skipped += 1
        continue
      }
      const legacy = wiki.content as LegacyWikiContent
      const now = Date.now()
      await ctx.db.insert("wikiBuilds", {
        wikiId: wiki._id,
        builtAt: now,
        trigger: "migration",
        sources: wiki.sources.map((s) => ({ documentId: s.documentId, namingCode: s.namingCode, version: s.version })),
        content: legacy.sections.map((s) => ({
          heading: s.heading,
          points: s.points.map((p) => ({ text: p.text, chunkIds: p.citations.map((c) => c.chunkId) })),
        })),
        reason: "preMigration",
        personId: null,
        legacyContent: legacy,
        scope: wiki.scope,
        title: wiki.title,
        purpose: wiki.purpose,
      })
      const introId = newWikiId("s")
      const outline: Outline = { sections: [{ id: introId, heading: "Introduction", role: "intro", fold: "open" }], introEnabled: true }
      const inserted: Id<"wikiBlocks">[] = []
      inserted.push(await ctx.db.insert("wikiBlocks", generatedRow(wiki._id, introId, newWikiId("b"), 1, "intro", [], 0, { status: "generating" })))
      inserted.push(await ctx.db.insert("wikiBlocks", generatedRow(wiki._id, introId, newWikiId("b"), 2, "keyPoints", [], 0, { status: "generating" })))
      for (const s of legacy.sections) {
        const sid = newWikiId("s")
        outline.sections.push({ id: sid, heading: s.heading, instruction: s.heading.slice(0, MAX_INSTRUCTION), ...(s.safety ? { safety: true } : {}), fold: "open" })
        const points = s.points.map((p) => ({ ...p, pointKey: pointKey(p.text) }))
        inserted.push(
          await ctx.db.insert("wikiBlocks", generatedRow(wiki._id, sid, newWikiId("b"), 1, s.kind ?? "bullets", points, 0, { columns: s.columns })),
        )
      }
      await ctx.db.patch(wiki._id, { outline, outlineUpdatedAt: now })
      const res = await recompose(ctx, wiki._id, "legacy")
      const want = keyMultiset(legacy.sections.flatMap((s) => s.points.map((p) => pointKey(p.text))))
      const got = keyMultiset(allPoints(res?.content ?? null).map((p) => p.pointKey))
      if (!res?.content || !sameMultiset(want, got)) {
        for (const id of inserted) await ctx.db.delete(id)
        await ctx.db.patch(wiki._id, { outline: undefined, contentV2Pending: undefined })
        problems.push(
          `${wiki.title}: legacy ${[...want.values()].reduce((a, b) => a + b, 0)} points, composed ${[...got.values()].reduce((a, b) => a + b, 0)}; left unchanged`,
        )
        continue
      }
      await logWikiEvent(ctx, wiki._id, null, "migrated", `Moved to sections and blocks: ${legacy.sections.length} sections, ${allPoints(res.content).length} points kept; introduction is being written`)
      // Only the intro and key points are rebuilt (they are "generating"); the swap happens when they land.
      await requestGeneration(ctx, wiki._id, "migration")
      migrated += 1
    }
    return { migrated, skipped, problems }
  },
})

/** Restores the preMigration build and removes the Outline and its blocks. */
export const rollbackMigration = internalMutation({
  args: { wikiId: v.id("wikis") },
  handler: async (ctx, args): Promise<{ ok: boolean; points?: number }> => {
    const wiki = await wikiOrThrow(ctx, args.wikiId)
    const build = (
      await ctx.db
        .query("wikiBuilds")
        .withIndex("by_wikiId", (q) => q.eq("wikiId", wiki._id))
        .order("desc")
        .take(200)
    ).find((b) => b.reason === "preMigration" && b.legacyContent)
    if (!build) return { ok: false }
    await restoreInto(ctx, wiki, build)
    await logWikiEvent(ctx, wiki._id, null, "restored", "Migration rolled back to the content before the upgrade")
    return { ok: true, points: allPoints(build.legacyContent).length }
  },
})

// ---- Measures (spec 7.5) -------------------------------------------------------------------

function weekOf(t: number) {
  const d = new Date(t)
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}

function median(xs: number[]) {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** MVP measures per week (spec 7.5). Run: npx convex run wikiBlocks:wikiMetrics */
export const wikiMetrics = internalQuery({
  args: {},
  handler: async (
    ctx,
  ): Promise<
    {
      week: string
      introShare: number
      blocksAdded: number
      blocksApplied: number
      medianDepth: { desktop: number; phone: number }
      foldTogglesPerRead: { desktop: number; phone: number }
    }[]
  > => {
    const wikis = await ctx.db.query("wikis").take(500)
    const built = wikis.filter((w) => w.content)
    const withIntro = built.filter((w) => isContentV2(w.content) && w.content.sections.some((s) => s.blocks.some((b) => b.kind === "intro")))
    const introShare = built.length ? withIntro.length / built.length : 0
    const since = Date.now() - 8 * 7 * 24 * 60 * 60 * 1000
    const weeks = new Map<string, { added: Set<string>; applied: number; reads: Doc<"wikiReads">[] }>()
    const at = (w: string) => {
      if (!weeks.has(w)) weeks.set(w, { added: new Set(), applied: 0, reads: [] })
      return weeks.get(w)!
    }
    for (const w of wikis) {
      const events = await ctx.db
        .query("wikiEvents")
        .withIndex("by_wikiId_and_at", (q) => q.eq("wikiId", w._id).gte("at", since))
        .take(2000)
      const live = new Set((await liveBlocks(ctx, w._id)).map((b) => b.blockId))
      for (const e of events) {
        if (e.kind === "blockAdded" && e.personId && e.blockId) {
          const bucket = at(weekOf(e.at))
          bucket.added.add(e.blockId)
          if (live.has(e.blockId)) bucket.applied += 1
        }
      }
      const reads = await ctx.db
        .query("wikiReads")
        .withIndex("by_wikiId_and_at", (q) => q.eq("wikiId", w._id).gte("at", since))
        .take(5000)
      for (const r of reads) at(weekOf(r.at)).reads.push(r)
    }
    const per = (reads: Doc<"wikiReads">[], surface: "desktop" | "phone") => {
      const rs = reads.filter((r) => r.surface === surface)
      return {
        depth: median(rs.map((r) => (r.sectionCount ? Math.min(1, (r.maxSectionIndex + 1) / r.sectionCount) : 0))),
        folds: rs.length ? rs.reduce((n, r) => n + r.foldToggles, 0) / rs.length : 0,
      }
    }
    return [...weeks.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([week, x]) => {
        const d = per(x.reads, "desktop")
        const p = per(x.reads, "phone")
        return {
          week,
          introShare,
          blocksAdded: x.added.size,
          blocksApplied: x.applied,
          medianDepth: { desktop: d.depth, phone: p.depth },
          foldTogglesPerRead: { desktop: d.folds, phone: p.folds },
        }
      })
  },
})
