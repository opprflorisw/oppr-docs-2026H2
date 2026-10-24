// Proposed revisions (CONTEXT.md: Proposed revision; ADR 0003: AI prepares,
// humans publish). The AI suggests surgical edits to the live version of a
// Published Document; this module turns the verified edits into a normal draft
// version that goes through review like any other. Nothing here approves or
// publishes.
import { ConvexError, v } from "convex/values"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  MutationCtx,
  QueryCtx,
} from "./_generated/server"
import { internal } from "./_generated/api"
import { Doc, Id } from "./_generated/dataModel"
import { requireUser, requireUserId } from "./lib/auth"
import { isPublished } from "./lib/published"
import { bodyChunks } from "./lib/chunking"

const DAY = 24 * 60 * 60 * 1000

// ---- TipTap blocks (pure) ---------------------------------------------------------

interface TNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TNode[]
  text?: string
  marks?: unknown[]
}

/** One editable passage of a body: a paragraph or heading, with where it sits. */
export interface BodyBlock {
  key: string
  path: number[]
  kind: "heading" | "paragraph" | "step" | "list" | "cell" | "callout"
  /** Human label, e.g. "step 4", "table row 2, column Tolerance", "warning callout". */
  label: string
  section: string | null
  text: string
}

function inlineText(n: TNode): string {
  if (n.type === "text") return n.text ?? ""
  if (n.type === "linkedAsset") return String(n.attrs?.label ?? "")
  if (n.type === "referenceDoc") return String(n.attrs?.code ?? n.attrs?.label ?? "")
  if (n.type === "hardBreak") return " "
  return (n.content ?? []).map(inlineText).join("")
}

/** Every paragraph and heading of a TipTap body, keyed B1..Bn in reading order. */
export function listBlocks(body: unknown): BodyBlock[] {
  const out: BodyBlock[] = []
  let section: string | null = null
  type Ctx = { kind: BodyBlock["kind"]; label: string }
  const push = (n: TNode, path: number[], ctx: Ctx) => {
    const text = inlineText(n)
    if (!text.trim()) return
    out.push({ key: `B${out.length + 1}`, path, kind: ctx.kind, label: ctx.label, section, text })
  }
  const visit = (n: TNode, path: number[], ctx: Ctx) => {
    if (n.type === "heading") {
      const text = inlineText(n).trim()
      if (text) section = text
      push(n, path, { kind: "heading", label: "heading" })
      return
    }
    if (n.type === "paragraph") {
      push(n, path, ctx)
      return
    }
    const kids = n.content ?? []
    if (n.type === "stepList") {
      kids.forEach((c, i) => visit(c, [...path, i], { kind: "step", label: `step ${i + 1}` }))
      return
    }
    if (n.type === "bulletList" || n.type === "orderedList") {
      kids.forEach((c, i) => visit(c, [...path, i], { kind: "list", label: `list item ${i + 1}` }))
      return
    }
    if (n.type === "callout") {
      const kind = String(n.attrs?.kind ?? "note")
      kids.forEach((c, i) => visit(c, [...path, i], { kind: "callout", label: `${kind} callout` }))
      return
    }
    if (n.type === "table") {
      const header = kids[0]?.content?.map((c) => inlineText(c).trim()) ?? []
      kids.forEach((row, r) =>
        (row.content ?? []).forEach((cell, c) => {
          const col = header[c] ? `column "${header[c]}"` : `column ${c + 1}`
          const label = r === 0 ? `table header, ${col}` : `table row ${r}, ${col}`
          visit(cell, [...path, r, c], { kind: "cell", label })
        }),
      )
      return
    }
    kids.forEach((c, i) => visit(c, [...path, i], ctx))
  }
  if (body && typeof body === "object") {
    const root = body as TNode
    ;(root.content ?? []).forEach((c, i) => visit(c, [i], { kind: "paragraph", label: "paragraph" }))
  }
  return out
}

function nodeAt(root: TNode, path: number[]): TNode | null {
  let n: TNode | undefined = root
  for (const i of path) {
    n = n?.content?.[i]
    if (!n) return null
  }
  return n ?? null
}

/** The replacement text as inline nodes; atoms whose label survives are kept. */
function afterNodes(after: string, marks: unknown[] | undefined, atoms: TNode[]): TNode[] {
  const out: TNode[] = []
  let rest = after
  for (const atom of atoms) {
    const label = inlineText(atom)
    if (!label || atom.type === "hardBreak") continue
    const at = rest.indexOf(label)
    if (at < 0) continue
    if (at > 0) out.push(textNode(rest.slice(0, at), marks))
    out.push(atom)
    rest = rest.slice(at + label.length)
  }
  if (rest) out.push(textNode(rest, marks))
  return out
}

function textNode(text: string, marks: unknown[] | undefined): TNode {
  return marks && marks.length > 0 ? { type: "text", text, marks } : { type: "text", text }
}

/**
 * Replace `before` with `after` inside one paragraph's inline content. Text
 * outside the replaced range keeps its marks; the replacement takes the marks
 * of the first text it overlaps. Returns null when `before` is not there.
 */
export function replaceInline(content: TNode[], before: string, after: string): TNode[] | null {
  const segs = content.map((n) => ({ n, text: inlineText(n) }))
  const full = segs.map((s) => s.text).join("")
  const start = full.indexOf(before)
  if (start < 0 || before.length === 0) return null
  const end = start + before.length
  const out: TNode[] = []
  const consumed: TNode[] = []
  let pos = 0
  let inserted = false
  let marks: unknown[] | undefined
  const pending: { idx: number } = { idx: -1 }
  for (const s of segs) {
    const a = pos
    const b = pos + s.text.length
    pos = b
    const overlaps = s.text.length > 0 ? a < end && b > start : false
    if (!overlaps) {
      out.push(s.n)
      continue
    }
    if (s.n.type !== "text") {
      consumed.push(s.n)
      if (!inserted) {
        pending.idx = out.length
        inserted = true
      }
      continue
    }
    const pre = s.text.slice(0, Math.max(0, start - a))
    const post = s.text.slice(Math.min(s.text.length, end - a))
    if (pre) out.push({ ...s.n, text: pre })
    if (!inserted) {
      marks = s.n.marks
      pending.idx = out.length
      inserted = true
    }
    if (post) out.push({ ...s.n, text: post })
  }
  if (pending.idx < 0) return null
  out.splice(pending.idx, 0, ...afterNodes(after, marks, consumed))
  // Join neighbouring text runs with the same marks, as the editor would.
  const merged: TNode[] = []
  for (const n of out) {
    const prev = merged[merged.length - 1]
    if (prev && prev.type === "text" && n.type === "text" && JSON.stringify(prev.marks ?? []) === JSON.stringify(n.marks ?? [])) {
      merged[merged.length - 1] = { ...prev, text: (prev.text ?? "") + (n.text ?? "") }
    } else merged.push(n)
  }
  return merged
}

export interface PlannedChange {
  blockKey: string
  before: string
  after: string
  reason: string
}

/**
 * Apply verified changes to a deep copy of a TipTap body. A change with an
 * empty `after` whose `before` is the whole passage removes that passage (and
 * its step or list item). Returns the new body and the changes that applied.
 */
export function applyChanges(
  body: unknown,
  changes: PlannedChange[],
): { body: unknown; applied: PlannedChange[]; failed: { change: PlannedChange; why: string }[] } {
  const copy = JSON.parse(JSON.stringify(body)) as TNode
  const blocks = new Map(listBlocks(copy).map((b) => [b.key, b]))
  const applied: PlannedChange[] = []
  const failed: { change: PlannedChange; why: string }[] = []
  const removed = new Set<string>()
  // Deepest and last first, so removing a passage never shifts another's path.
  const ordered = changes
    .map((c, i) => ({ c, i, block: blocks.get(c.blockKey) }))
    .sort((x, y) => {
      const a = x.block?.path ?? []
      const b = y.block?.path ?? []
      for (let k = 0; k < Math.max(a.length, b.length); k++) {
        const d = (b[k] ?? -1) - (a[k] ?? -1)
        if (d !== 0) return d
      }
      // Same passage: edits before a removal.
      return Number(x.c.after === "") - Number(y.c.after === "") || x.i - y.i
    })
  for (const { c, block } of ordered) {
    if (!block) {
      failed.push({ change: c, why: "it points to a passage that does not exist" })
      continue
    }
    if (removed.has(block.key)) {
      failed.push({ change: c, why: "another change removes the same passage" })
      continue
    }
    const node = nodeAt(copy, block.path)
    if (!node) {
      failed.push({ change: c, why: "the passage could not be found" })
      continue
    }
    const text = inlineText(node)
    if (c.after === "" && c.before.trim() === text.trim()) {
      const parentPath = block.path.slice(0, -1)
      const parent = nodeAt(copy, parentPath)
      const idx = block.path[block.path.length - 1]
      if (!parent?.content) {
        failed.push({ change: c, why: "the passage could not be removed" })
        continue
      }
      const grand = nodeAt(copy, parentPath.slice(0, -1))
      const onlyChild = parent.content.length === 1
      if (onlyChild && (parent.type === "stepItem" || parent.type === "listItem") && grand?.content) {
        if (grand.content.length > 1) grand.content.splice(parentPath[parentPath.length - 1], 1)
        else node.content = []
      } else if (onlyChild && (parent.type === "tableCell" || parent.type === "tableHeader" || parent.type === "callout")) {
        node.content = []
      } else {
        parent.content.splice(idx, 1)
      }
      removed.add(block.key)
      applied.push(c)
      continue
    }
    const next = replaceInline(node.content ?? [], c.before, c.after)
    if (!next) {
      failed.push({ change: c, why: "its 'before' text is not in the passage" })
      continue
    }
    node.content = next
    applied.push(c)
  }
  // Report in reading order.
  const order = (k: string) => Number(k.slice(1))
  applied.sort((a, b) => order(a.blockKey) - order(b.blockKey))
  return { body: copy, applied, failed }
}

// ---- Status helpers -----------------------------------------------------------

export type ProposalStatus =
  | "generating"
  | "ready"
  | "failed"
  | "discarded"
  | "in_review"
  | "published"
  | "superseded"

/**
 * Where a proposal stands now. A ready proposal follows its draft: in review,
 * approved, Published (the draft became the live version) or superseded (the
 * draft is gone or another version took its place).
 */
function statusOf(p: Doc<"proposedRevisions">, doc: Doc<"documents"> | null): ProposalStatus {
  if (p.state !== "ready") return p.state
  if (!doc || p.draftVersion == null) return "superseded"
  if (doc.liveVersion != null && doc.liveVersion >= p.draftVersion) {
    return doc.liveVersion === p.draftVersion ? "published" : "superseded"
  }
  if (doc.currentVersion !== p.draftVersion) return "superseded"
  if (doc.status === "in_review" || doc.status === "approved") return "in_review"
  if (doc.status === "archived") return "superseded"
  return "ready"
}

async function sourceInfo(ctx: QueryCtx, p: Doc<"proposedRevisions">) {
  if (p.source.kind !== "finding" || !p.source.findingId) {
    return { kind: p.source.kind, note: p.source.note, finding: null }
  }
  const f = await ctx.db.get(p.source.findingId)
  if (!f) return { kind: p.source.kind, note: p.source.note, finding: null }
  const other = f.a.documentId === p.documentId ? f.b : f.a
  return {
    kind: p.source.kind,
    note: p.source.note,
    finding: {
      _id: f._id,
      kind: f.kind,
      status: f.status,
      summary: f.summary,
      otherDocumentId: other.documentId,
      otherCode: other.namingCode,
      otherTitle: other.title,
    },
  }
}

async function present(ctx: QueryCtx, p: Doc<"proposedRevisions">, doc: Doc<"documents"> | null) {
  return {
    _id: p._id,
    documentId: p.documentId,
    namingCode: doc?.namingCode ?? "",
    title: doc?.title ?? "Deleted document",
    baseVersion: p.baseVersion,
    draftVersion: p.draftVersion,
    state: p.state,
    status: statusOf(p, doc),
    summary: p.summary,
    changes: p.changes.map((c) => ({ before: c.before, after: c.after, reason: c.reason })),
    error: p.error,
    createdAt: p.createdAt,
    source: await sourceInfo(ctx, p),
  }
}

// ---- Queries ------------------------------------------------------------------

/**
 * The proposal to show on a Document: the newest one that is generating,
 * ready, in review or failed in the last day. Older proposals are listed too.
 */
export const forDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const doc = await ctx.db.get(args.documentId)
    const rows = await ctx.db
      .query("proposedRevisions")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .order("desc")
      .take(20)
    const all = await Promise.all(rows.map((r) => present(ctx, r, doc)))
    const now = Date.now()
    const active =
      all.find(
        (p) =>
          p.status === "generating" ||
          p.status === "ready" ||
          p.status === "in_review" ||
          (p.status === "failed" && now - p.createdAt < DAY),
      ) ?? null
    return { active, history: all }
  },
})

/** Proposed revisions waiting for an Engineer (generating, ready or in review). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const rows = [
      ...(await ctx.db.query("proposedRevisions").withIndex("by_state", (q) => q.eq("state", "generating")).take(100)),
      ...(await ctx.db.query("proposedRevisions").withIndex("by_state", (q) => q.eq("state", "ready")).take(200)),
    ]
    const out = []
    for (const r of rows) {
      const p = await present(ctx, r, await ctx.db.get(r.documentId))
      if (p.status === "generating" || p.status === "ready" || p.status === "in_review") out.push(p)
    }
    return out.sort((a, b) => b.createdAt - a.createdAt)
  },
})

// ---- Lifecycle ------------------------------------------------------------------

/** Why a Document cannot get a Proposed revision right now, or null. */
export function proposalBlocker(doc: Doc<"documents">): string | null {
  if (!isPublished(doc) || doc.status !== "published") {
    if (doc.liveVersion != null && doc.currentVersion !== doc.liveVersion) {
      return `${doc.namingCode} already has a working draft (v${doc.currentVersion}). Finish or discard that draft first, so two revisions never compete.`
    }
    return `${doc.namingCode} is not Published. A Proposed revision starts from the Published version.`
  }
  if (doc.origin === "wrapped") {
    return `${doc.namingCode} is a Wrapped manual. Its supplier PDF is never edited, only replaced by a newer PDF.`
  }
  if (doc.currentVersion !== doc.liveVersion) {
    return `${doc.namingCode} already has a working draft (v${doc.currentVersion}). Finish or discard that draft first.`
  }
  return null
}

/** Called by ai/revision.propose: checks the request and inserts the row. */
export const start = internalMutation({
  args: {
    documentId: v.id("documents"),
    source: v.object({
      kind: v.union(v.literal("finding"), v.literal("insight"), v.literal("health")),
      findingId: v.optional(v.id("findings")),
      note: v.string(),
    }),
    userId: v.union(v.id("users"), v.null()),
  },
  handler: async (ctx, args): Promise<Id<"proposedRevisions">> => {
    const doc = await ctx.db.get(args.documentId)
    if (!doc) throw new ConvexError("This document no longer exists.")
    const blocker = proposalBlocker(doc)
    if (blocker) throw new ConvexError(blocker)
    const live = await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", doc._id).eq("version", doc.liveVersion as number),
      )
      .unique()
    if (!live || live.bodyKind !== "tiptap" || !live.bodyJson) {
      throw new ConvexError(`${doc.namingCode} has no editable text body to revise.`)
    }
    if (args.source.kind === "finding") {
      if (!args.source.findingId) throw new ConvexError("Pick the Finding this revision should resolve.")
      const f = await ctx.db.get(args.source.findingId)
      if (!f) throw new ConvexError("That Finding no longer exists.")
      if (f.status !== "open") throw new ConvexError("That Finding is already closed.")
      if (f.documentA !== doc._id && f.documentB !== doc._id) {
        throw new ConvexError(`That Finding is not about ${doc.namingCode}.`)
      }
    }
    const busy = await ctx.db
      .query("proposedRevisions")
      .withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
      .order("desc")
      .take(10)
    if (busy.some((p) => p.state === "generating" && Date.now() - p.createdAt < 10 * 60 * 1000)) {
      throw new ConvexError(`A Proposed revision for ${doc.namingCode} is already being prepared.`)
    }
    const id = await ctx.db.insert("proposedRevisions", {
      documentId: doc._id,
      baseVersion: doc.liveVersion as number,
      draftVersion: null,
      state: "generating",
      source: {
        kind: args.source.kind,
        ...(args.source.findingId ? { findingId: args.source.findingId } : {}),
        note: args.source.note.trim().slice(0, 500),
      },
      summary: "",
      changes: [],
      error: null,
      createdBy: args.userId,
      createdAt: Date.now(),
    })
    await ctx.scheduler.runAfter(0, internal.ai.revision.generate, { proposedRevisionId: id })
    return id
  },
})

/** Everything the generator needs: the live body as blocks and the signal. */
export const loadForGeneration = internalQuery({
  args: { proposedRevisionId: v.id("proposedRevisions") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.proposedRevisionId)
    if (!p || p.state !== "generating") return null
    const doc = await ctx.db.get(p.documentId)
    if (!doc) return null
    const live = await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", doc._id).eq("version", p.baseVersion),
      )
      .unique()
    const blocks = live?.bodyJson ? listBlocks(live.bodyJson) : []

    let finding: null | {
      kind: "contradiction" | "duplicate"
      summary: string
      mine: { quote: string; section: string | null }
      other: { namingCode: string; title: string; version: number; quote: string; section: string | null }
    } = null
    if (p.source.kind === "finding" && p.source.findingId) {
      const f = await ctx.db.get(p.source.findingId)
      if (f) {
        const mineIsA = f.a.documentId === doc._id
        const mine = mineIsA ? f.a : f.b
        const other = mineIsA ? f.b : f.a
        finding = {
          kind: f.kind,
          summary: f.summary,
          mine: { quote: mine.quote, section: mine.section },
          other: {
            namingCode: other.namingCode,
            title: other.title,
            version: other.version,
            quote: other.quote,
            section: other.section,
          },
        }
      }
    }

    // Insight signal: the latest report's themes and recent questions/flags.
    const since = Date.now() - 90 * DAY
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
    const report = await ctx.db
      .query("insightReports")
      .withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
      .order("desc")
      .first()
    const seen = new Set<string>()
    const questions: { question: string; answered: boolean }[] = []
    for (const a of asks) {
      const k = a.question.trim().toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      questions.push({ question: a.question.trim(), answered: a.answerFound })
      if (questions.length >= 40) break
    }
    return {
      proposal: { source: p.source, baseVersion: p.baseVersion },
      doc: { _id: doc._id, namingCode: doc.namingCode, title: doc.title },
      blocks,
      finding,
      themes: report?.state === "ready" ? report.themes : [],
      questions,
      flags: flags.slice(0, 30).map((f) => f.note),
    }
  },
})

export const markFailed = internalMutation({
  args: { proposedRevisionId: v.id("proposedRevisions"), error: v.string(), summary: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.proposedRevisionId)
    if (!p || p.state !== "generating") return
    await ctx.db.patch(p._id, {
      state: "failed",
      error: args.error.slice(0, 600),
      ...(args.summary ? { summary: args.summary.slice(0, 600) } : {}),
    })
  },
})

/**
 * Turns verified edits into a new draft version, the same way
 * documents.createNewVersion forks one: currentVersion + 1, status draft, the
 * live version stays in use, chunks for the draft, embeddings scheduled. The
 * draft then goes through normal review. Never approves or publishes.
 */
export const applyProposal = internalMutation({
  args: {
    proposedRevisionId: v.id("proposedRevisions"),
    summary: v.string(),
    changes: v.array(
      v.object({ blockKey: v.string(), before: v.string(), after: v.string(), reason: v.string() }),
    ),
    // Sentences about changes left out by the checks, appended to the summary.
    droppedNote: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.proposedRevisionId)
    if (!p || p.state !== "generating") return
    const fail = (error: string) =>
      ctx.db.patch(p._id, { state: "failed" as const, error, summary: args.summary.slice(0, 600) })
    const doc = await ctx.db.get(p.documentId)
    if (!doc) return fail("The document was deleted while the revision was prepared.")
    if (doc.liveVersion !== p.baseVersion || doc.status !== "published" || doc.currentVersion !== doc.liveVersion) {
      return fail(
        `${doc.namingCode} changed while the revision was prepared (a new version was started or Published). Prepare it again from the version in use now.`,
      )
    }
    const liveRow = await ctx.db
      .query("documentVersions")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", doc._id).eq("version", p.baseVersion),
      )
      .unique()
    if (!liveRow?.bodyJson) return fail("The Published version has no text body.")

    const result = applyChanges(liveRow.bodyJson, args.changes)
    if (result.applied.length === 0) {
      return fail("None of the suggested changes could be applied to the Published text.")
    }
    for (const f of result.failed) {
      console.warn(`[revision ${p._id}] change not applied (${f.why}): ${f.change.before.slice(0, 80)}`)
    }

    // Link each change to the live passage it edits (null when not chunked).
    const liveChunks = await ctx.db
      .query("chunks")
      .withIndex("by_documentId_and_version", (q) =>
        q.eq("documentId", doc._id).eq("version", p.baseVersion),
      )
      .collect()
    const chunkFor = (before: string): Id<"chunks"> | null =>
      liveChunks.find((c) => c.text.includes(before.trim()))?._id ?? null

    const now = Date.now()
    const newVersion = doc.currentVersion + 1
    const summary = args.summary.trim()
    await ctx.db.patch(doc._id, {
      liveVersion: p.baseVersion,
      currentVersion: newVersion,
      status: "draft",
      authorId: doc.authorId ?? p.createdBy,
      updatedAt: now,
    })
    await ctx.db.insert("documentVersions", {
      documentId: doc._id,
      version: newVersion,
      bodyKind: "tiptap",
      bodyJson: result.body,
      pdfStorageId: liveRow.pdfStorageId ?? null,
      publishedAt: now,
      changeNote: `Proposed revision: ${summary}`.slice(0, 500),
      // The person who asked for it authors the draft; the AI signs nothing.
      signoffs: p.createdBy ? [{ role: "author", userId: p.createdBy, at: now }] : [],
    })
    const chunks = bodyChunks(result.body)
    for (let i = 0; i < chunks.length; i++) {
      await ctx.db.insert("chunks", {
        documentId: doc._id,
        version: newVersion,
        seq: i,
        text: chunks[i].text,
        pageOrSection: chunks[i].section,
        embedding: null,
        embeddingModel: null,
      })
    }
    await ctx.runMutation(internal.images.recomputeUsagesForVersion, {
      documentId: doc._id,
      documentVersion: newVersion,
      body: result.body,
    })
    await ctx.scheduler.runAfter(0, internal.ai.embed.embedMissingInternal, { documentId: doc._id })

    const notApplied = result.failed.length
      ? ` ${result.failed.length} more ${result.failed.length === 1 ? "change was" : "changes were"} left out because ${result.failed.length === 1 ? "it" : "they"} could not be placed in the text.`
      : ""
    await ctx.db.patch(p._id, {
      state: "ready",
      draftVersion: newVersion,
      summary: `${summary}${args.droppedNote ? ` ${args.droppedNote}` : ""}${notApplied}`.slice(0, 1200),
      changes: result.applied.map((c) => ({
        before: c.before,
        after: c.after,
        reason: c.reason,
        chunkId: chunkFor(c.before),
      })),
      error: null,
    })
    if (p.source.kind === "finding" && p.source.findingId) {
      const f = await ctx.db.get(p.source.findingId)
      if (f) await ctx.db.patch(f._id, { proposedRevisionId: p._id })
    }
  },
})

async function removeDraftVersion(ctx: MutationCtx, doc: Doc<"documents">, version: number) {
  const row = await ctx.db
    .query("documentVersions")
    .withIndex("by_documentId_and_version", (q) => q.eq("documentId", doc._id).eq("version", version))
    .unique()
  if (row) await ctx.db.delete(row._id)
  const chunks = await ctx.db
    .query("chunks")
    .withIndex("by_documentId_and_version", (q) => q.eq("documentId", doc._id).eq("version", version))
    .collect()
  for (const c of chunks) await ctx.db.delete(c._id)
  const usages = await ctx.db
    .query("imageUsages")
    .withIndex("by_documentId_and_version", (q) => q.eq("documentId", doc._id).eq("documentVersion", version))
    .collect()
  for (const u of usages) await ctx.db.delete(u._id)
  await ctx.db.patch(doc._id, {
    currentVersion: doc.liveVersion as number,
    status: "published",
  })
}

/**
 * Discard a Proposed revision. When its draft is still exactly as the AI
 * prepared it (nobody saved, submitted or signed it), the draft version is
 * removed too and the Document is back to its Published state. When someone
 * already worked on the draft, the draft stays: it is their work now, and the
 * proposal is only marked discarded.
 */
export const discard = mutation({
  args: { proposedRevisionId: v.id("proposedRevisions") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const p = await ctx.db.get(args.proposedRevisionId)
    if (!p) throw new ConvexError("This Proposed revision no longer exists.")
    if (p.state === "discarded") return { draftRemoved: false, draftKept: false }
    const doc = await ctx.db.get(p.documentId)
    const status = statusOf(p, doc)
    if (status === "published") throw new ConvexError("This revision is already Published and cannot be discarded.")
    if (status === "in_review") {
      throw new ConvexError(
        "Its draft is in review. Send the draft back to draft first, or let the reviewer reject it.",
      )
    }

    let draftRemoved = false
    let draftKept = false
    if (doc && p.state === "ready" && p.draftVersion != null && status === "ready") {
      const row = await ctx.db
        .query("documentVersions")
        .withIndex("by_documentId_and_version", (q) =>
          q.eq("documentId", doc._id).eq("version", p.draftVersion as number),
        )
        .unique()
      // Saving the draft moves publishedAt and updatedAt on; a sign-off beyond
      // the author's means review started. Either way it is no longer untouched.
      const untouched =
        row != null &&
        doc.status === "draft" &&
        row.publishedAt - row._creationTime < 2000 &&
        doc.updatedAt - row._creationTime < 2000 &&
        (row.signoffs ?? []).every((s) => s.role === "author")
      if (untouched) {
        await removeDraftVersion(ctx, doc, p.draftVersion)
        draftRemoved = true
      } else {
        draftKept = true
      }
    }
    await ctx.db.patch(p._id, { state: "discarded" })
    if (p.source.findingId) {
      const f = await ctx.db.get(p.source.findingId)
      if (f && f.proposedRevisionId === p._id) await ctx.db.patch(f._id, { proposedRevisionId: null })
    }
    return { draftRemoved, draftKept }
  },
})
