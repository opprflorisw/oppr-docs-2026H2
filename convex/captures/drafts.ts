// Make a Draft from a Capture or a Capture set (docs/adr/0005, ADR 0003).
//
// The Draft goes through the normal document flow: a "draft" document with a
// naming code, origin "capture", one working version, chunks for the editor
// and no sign-offs. Nothing here publishes. The body is built from the
// Moments (one Capture) or the decided steps (a Capture set), with evidence
// photos embedded as images and a section that names the source Captures.
//
// typeCode: a naming type token (SOP, WI, LMRA, or any active type token or
// slug), or "LOG": a proposal for a new Oppr LOGS checklist, written as a
// draft work instruction with a checklist table and the tag "logs-proposal".
import { ConvexError, v } from "convex/values"
import { mutation, MutationCtx } from "../_generated/server"
import { internal } from "../_generated/api"
import { Doc, Id } from "../_generated/dataModel"
import { requireUserId } from "../lib/auth"
import { bodyChunks } from "../lib/chunking"
import { allocateNamingCode } from "../naming"
import { Node, b, bullets, callout, doc, h, p, steps, t } from "../seed/builders"
import { requireEngineerPerson } from "./access"
import { OMIT } from "./sets"

const MAX_PHOTOS = 8

type Kind = "step" | "safety" | "quality" | "tip" | "problem" | "question"

interface Item {
  kind: Kind
  title: string
  detail: string
  entryIds: Id<"captureEntries">[]
  assetIds: Id<"assets">[]
  /** Open point for the Engineer (undecided Variation or conflict). */
  open?: string
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim()
const sentence = (s: string) => {
  const c = clean(s)
  return c && !/[.!?:]$/.test(c) ? `${c}.` : c
}
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const capFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** "Title. Detail." without repeating the title when the detail starts with it. */
function stepText(it: Item): string {
  const title = sentence(it.title)
  const detail = sentence(it.detail)
  if (!detail || detail.toLowerCase().startsWith(clean(it.title).toLowerCase())) return detail || title
  return `${title} ${detail}`
}

function names(list: string[]): string {
  if (list.length <= 1) return list.join("")
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`
}

async function resolveType(ctx: MutationCtx, typeCode: string) {
  const code = typeCode.trim()
  const types = (await ctx.db.query("namingTypes").take(200)).filter((x) => x.active)
  const find = (c: string) =>
    types.find((x) => x.token.toUpperCase() === c.toUpperCase()) ?? types.find((x) => x.slug === c.toLowerCase())
  if (code.toUpperCase() === "LOG") {
    const wi = find("WI") ?? find("work_instruction") ?? find("SOP")
    if (!wi) throw new ConvexError("There is no work instruction type to write the checklist proposal in.")
    return { type: wi, form: "log" as const }
  }
  const t = find(code)
  if (!t) throw new ConvexError(`"${typeCode}" is not a document type. Use SOP, WI, LMRA or LOG.`)
  const form = t.token.toUpperCase() === "LMRA" ? ("lmra" as const) : ("procedure" as const)
  return { type: t, form }
}

export const makeDraft = mutation({
  args: {
    personId: v.id("people"),
    captureId: v.optional(v.id("captures")),
    setId: v.optional(v.id("captureSets")),
    typeCode: v.string(),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await requireEngineerPerson(ctx, args.personId)
    if (!!args.captureId === !!args.setId) throw new ConvexError("Make a Draft from one Capture or from one Capture set.")
    const { type, form } = await resolveType(ctx, args.typeCode)

    // ---- collect the items -------------------------------------------------
    let set: Doc<"captureSets"> | null = null
    let captures: Doc<"captures">[] = []
    let items: Item[] = []
    let summary = ""
    let job = ""
    if (args.captureId) {
      const c = await ctx.db.get(args.captureId)
      if (!c) throw new ConvexError("This Capture no longer exists.")
      if (c.status !== "ready") throw new ConvexError("This Capture is not processed yet. Wait for the Moments first.")
      captures = [c]
      summary = c.summary ?? ""
      job = c.job ?? c.title
      const moments = await ctx.db
        .query("captureMoments")
        .withIndex("by_captureId_and_order", (q) => q.eq("captureId", c._id))
        .take(300)
      items = moments.map((m) => ({
        kind: m.kind,
        title: m.title,
        detail: m.detail,
        entryIds: m.entryIds,
        assetIds: m.assetId ? [m.assetId] : [],
        open: m.kind === "question" ? sentence(`${m.title}. ${m.detail}`) : undefined,
      }))
    } else {
      set = await ctx.db.get(args.setId!)
      if (!set) throw new ConvexError("This Capture set no longer exists.")
      if (!set.combined) throw new ConvexError("Combine the Capture set first.")
      for (const id of set.captureIds) {
        const c = await ctx.db.get(id)
        if (c) captures.push(c)
      }
      summary = set.combined.summary
      job = set.job ?? set.title
      for (const st of set.combined.steps) {
        if (st.decision === OMIT) continue
        const evidence = st.evidenceEntryIds ?? []
        const assetIds: Id<"assets">[] = []
        for (const eid of evidence) {
          const e = await ctx.db.get(eid)
          if (e?.assetId && !assetIds.includes(e.assetId)) assetIds.push(e.assetId)
        }
        let open: string | undefined
        if (st.kind === "question") open = `Question from the floor: ${sentence(st.title)} ${sentence(st.detail)}`
        else if (!st.decision && st.conflict)
          open = `${clean(st.title)}: check against ${st.conflict.namingCode}, which says "${clean(st.conflict.quote)}". ${sentence(st.conflict.note)}`
        else if (!st.decision && st.variations.length > 0)
          open = `${clean(st.title)}: the Captures differ (${st.variations.map((vr) => clean(vr.text)).join("; ")}). Decide the standard.`

        items.push({
          kind: st.kind,
          title: st.title,
          detail: st.decision ?? st.detail,
          entryIds: evidence,
          assetIds,
          open,
        })
      }
    }
    if (items.filter((i) => i.kind !== "question").length === 0)
      throw new ConvexError("There is nothing to write yet: no steps were found.")

    // ---- where it is filed ---------------------------------------------------
    const assets: Doc<"assets">[] = []
    for (const id of [...new Set(items.flatMap((i) => i.assetIds))]) {
      const a = await ctx.db.get(id)
      if (a) assets.push(a)
    }
    const locations = await ctx.db.query("namingLocations").take(200)
    const disciplines = await ctx.db.query("namingDisciplines").take(200)
    if (locations.length === 0 || disciplines.length === 0) throw new ConvexError("Set up areas and disciplines first.")
    const areaCount = new Map<string, number>()
    for (const a of assets) {
      const code = locations.find((l) => l.label === a.location || l.code === a.location)?.code
      if (code) areaCount.set(code, (areaCount.get(code) ?? 0) + 1)
    }
    let area = [...areaCount.entries()].sort((x, y) => y[1] - x[1])[0]?.[0]
    if (!area) {
      for (const c of captures) {
        const author = await ctx.db.get(c.authorId)
        if (author?.area && locations.some((l) => l.code === author.area)) {
          area = author.area
          break
        }
      }
    }
    area = area ?? locations[0].code
    const wantDiscipline = form === "lmra" ? "HSE" : "OPS"
    const discipline = disciplines.find((d) => d.code === wantDiscipline)?.code ?? disciplines[0].code

    // ---- evidence photos -------------------------------------------------------
    const now = Date.now()
    const photoNodes: Node[] = []
    const used = new Set<string>()
    for (const [index, it] of items.entries()) {
      if (photoNodes.length >= MAX_PHOTOS) break
      for (const eid of it.entryIds) {
        if (photoNodes.length >= MAX_PHOTOS || used.has(eid)) continue
        const e = await ctx.db.get(eid)
        if (!e || e.kind !== "photo" || !e.storageId || e.mediaDeletedAt) continue
        used.add(eid)
        const alt = clean(
          `${form === "procedure" && it.kind === "step" ? `Step ${stepNumber(items, index)}: ` : ""}${it.title}. ${e.description ?? e.text ?? ""}`,
        ).slice(0, 300)
        const imageId = await ctx.db.insert("images", {
          source: "upload",
          storageId: e.storageId,
          externalUrl: null,
          filename: `capture-${e._id}.${(e.mimeType ?? "image/jpeg").split("/")[1]?.split(";")[0] ?? "jpg"}`,
          contentType: e.mimeType ?? "image/jpeg",
          byteSize: e.sizeBytes ?? null,
          width: null,
          height: null,
          sha256: null,
          altText: alt,
          uploadedBy: userId,
          createdAt: now,
        })
        photoNodes.push({
          type: "image",
          attrs: { src: "", alt, title: null, "data-image-id": imageId, width: 70, align: "center" },
        })
        break
      }
    }

    // ---- body -------------------------------------------------------------------
    const people = new Map<string, string>()
    for (const c of captures) {
      if (!people.has(c.authorId)) people.set(c.authorId, (await ctx.db.get(c.authorId))?.name ?? "an operator")
    }
    const jobTitle = capFirst(clean(job))
    const title =
      clean(args.title ?? "") ||
      (form === "log" ? `Proposal for a LOGS checklist: ${jobTitle}` : form === "lmra" ? `LMRA: ${jobTitle}` : jobTitle)

    const content: Node[] = [h(1, title)]
    if (assets.length > 0) {
      const parts: Node[] = [t("Applies to: ")]
      assets.forEach((a, i) => {
        if (i > 0) parts.push(t(", "))
        parts.push({ type: "linkedAsset", attrs: { assetId: a._id, assetCode: a.code, label: a.code } })
      })
      content.push({ type: "paragraph", content: parts })
    }
    content.push(
      callout(
        "notice",
        `Draft made from ${captures.length === 1 ? "a Capture" : `${captures.length} Captures`} by ${names([...new Set(people.values())])}. ` +
          (form === "log"
            ? "It proposes a new checklist for Oppr LOGS. Check every line before review; nothing in this Draft is Published."
            : "Check every step against the floor before review; nothing in this Draft is Published."),
      ),
    )
    if (clean(summary)) content.push(h(2, "Purpose"), p(sentence(summary)))

    const of = (k: Kind) => items.filter((i) => i.kind === k)
    const stepItems = of("step")
    const safety = of("safety")
    const quality = of("quality")
    const tips = of("tip")
    const problems = of("problem")

    if (form === "procedure") {
      if (safety.length > 0) {
        content.push(h(2, "Safety"))
        for (const s of safety) content.push(callout("warning", stepText(s)))
      }
      content.push(h(2, "Procedure"))
      content.push(steps(stepItems.length > 0 ? stepItems.map(stepText) : ["Add the steps of the job."]))
      if (quality.length > 0) content.push(h(2, "Checks"), grid([["Check", "What to look for"], ...quality.map((q) => [clean(q.title), clean(q.detail) || "-"])]))
      if (tips.length > 0) content.push(h(2, "Tips from the floor"), bullets(tips.map(stepText)))
      if (problems.length > 0)
        content.push(h(2, "If something goes wrong"), grid([["Problem", "What the operators did"], ...problems.map((x) => [clean(x.title), clean(x.detail) || "-"])]))
    } else if (form === "lmra") {
      content.push(h(2, "Hazards and controls"))
      if (safety.length > 0) content.push(grid([["Hazard", "Control"], ...safety.map((s) => [clean(s.title), clean(s.detail) || "-"])]))
      else content.push(callout("caution", "No hazards were recorded in the Captures. Add the hazards and their controls before review."))
      content.push(
        h(2, "Before you start"),
        bullets([
          "Do I know the job and the steps below?",
          "Do I wear the PPE the job needs?",
          "Is the work area clear and safe?",
          "If anything is not right: stop and tell the shift leader.",
        ]),
      )
      if (stepItems.length > 0) content.push(h(2, "Steps of the job"), steps(stepItems.map((s) => sentence(s.title))))
      if (problems.length > 0) content.push(h(2, "What can go wrong"), bullets(problems.map(stepText)))
    } else {
      const checks = [...stepItems, ...quality]
      content.push(
        h(2, "Checklist"),
        grid([
          ["#", "Check", "Expected", "OK / Not OK"],
          ...checks.map((c, i) => [String(i + 1), clean(c.title), clean(c.detail) || "-", ""]),
        ]),
      )
      if (safety.length > 0) content.push(h(2, "Safety points"), bullets(safety.map(stepText)))
      content.push(
        h(2, "Proposal"),
        p("Make this a checklist in Oppr LOGS for the Assets above, filled in at every run of the job. An Engineer sets it up in LOGS after review."),
      )
    }

    if (photoNodes.length > 0) content.push(h(2, "Photos from the floor"), ...photoNodes)

    const openPoints = items.map((i) => i.open).filter((x): x is string => !!x)
    if (openPoints.length > 0) {
      content.push(h(2, "Open points before review"))
      content.push(callout("caution", "Resolve these points and remove this section before you send the Draft for review."))
      content.push(bullets(openPoints))
    }

    content.push(h(2, "Source Captures"))
    content.push(
      bullets(
        captures.map((c) => [
          b(clean(c.title)),
          `, recorded by ${people.get(c.authorId) ?? "an operator"}, handed in ${day(c.handedInAt ?? c.startedAt)}.`,
        ]),
      ),
    )
    if (set) content.push(p(`Combined in the Capture set "${clean(set.title)}".`))
    const body = doc(...content)

    // ---- the document, through the normal draft path ---------------------------
    const namingCode = await allocateNamingCode(ctx, area, discipline, type.slug)
    const documentId = await ctx.db.insert("documents", {
      namingCode,
      location: area,
      discipline,
      title: title.slice(0, 200),
      type: type.slug,
      status: "draft",
      currentVersion: 1,
      ownerId: userId,
      authorId: userId,
      reviewerId: null,
      approverId: null,
      tags: [...new Set(["capture", ...(form === "log" ? ["logs-proposal"] : [])])],
      updatedAt: now,
      origin: "capture",
      // The Engineer who made the Draft owns it (people act through check-in).
      ownerPersonId: args.personId,
      captureSources: { setId: set?._id ?? null, captureIds: captures.map((c) => c._id) },
    })
    await ctx.db.insert("documentVersions", {
      documentId,
      version: 1,
      bodyKind: "tiptap",
      bodyJson: body,
      pdfStorageId: null,
      publishedAt: now,
      // The AI and the Captures prepared it; an Engineer signs in the normal review (ADR 0003).
      signoffs: [],
      changeNote: `Made from ${captures.length === 1 ? "Capture" : "Captures"} ${captures.map((c) => `"${clean(c.title)}"`).join(", ")}${set ? ` (Capture set "${clean(set.title)}")` : ""}.`.slice(0, 600),
    })
    for (const [i, c] of bodyChunks(body).entries()) {
      await ctx.db.insert("chunks", {
        documentId,
        version: 1,
        seq: i + 1,
        text: c.text,
        pageOrSection: c.section,
        embeddingModel: null,
      })
    }
    for (const a of assets) await ctx.db.insert("documentAssets", { documentId, assetId: a._id })
    await ctx.runMutation(internal.images.recomputeUsagesForVersion, { documentId, documentVersion: 1, body })
    await ctx.scheduler.runAfter(0, internal.ai.embed.embedMissingInternal, { documentId })

    await ctx.db.insert("captureDrafts", {
      documentId,
      captureId: args.captureId,
      setId: args.setId,
      captureIds: captures.map((c) => c._id),
      typeCode: args.typeCode.trim().toUpperCase(),
      createdBy: args.personId,
      createdAt: now,
    })
    if (set) await ctx.db.patch(set._id, { draftDocumentIds: [...(set.draftDocumentIds ?? []), documentId] })
    return { documentId, namingCode, title }
  },
})

/** Like builders.table, but an empty cell gets an empty paragraph (TipTap rejects empty text nodes). */
function grid(rows: string[][]): Node {
  return {
    type: "table",
    content: rows.map((row, r) => ({
      type: "tableRow",
      content: row.map((cell) => ({
        type: r === 0 ? "tableHeader" : "tableCell",
        attrs: { colspan: 1, rowspan: 1, colwidth: null },
        content: [cell.trim() ? p(cell) : { type: "paragraph" }],
      })),
    })),
  }
}

function stepNumber(items: Item[], index: number): number {
  return items.slice(0, index + 1).filter((i) => i.kind === "step").length
}
