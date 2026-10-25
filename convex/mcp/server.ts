// The MCP endpoint (docs/adr/0004): MCP Streamable HTTP, stateless, at
// POST /mcp on the Convex site URL. Every request carries an MCP key
// ("Authorization: Bearer opk_..."); the key's scopes decide which tools it
// sees and may call, and its area limit bounds every read and write.
//
// JSON-RPC 2.0, single message or batch, answered as application/json (no
// SSE). Methods: initialize, ping, tools/list, tools/call. Notifications get
// 202. Tool failures are results with isError: true, so the model can read
// them and correct itself. Every tools/call writes one audit row (mcpCalls).
//
// MCP can never publish, approve, sign off or delete (ADR 0003): those tools
// do not exist here.
import { ActionCtx, httpAction } from "../_generated/server"
import { internal } from "../_generated/api"
import { Doc, Id } from "../_generated/dataModel"
import { sha256Hex } from "./keys"
import {
  DEFAULT_PROTOCOL_VERSION,
  PROTOCOL_VERSIONS,
  SERVER_INSTRUCTIONS,
  SERVER_NAME,
  SERVER_VERSION,
  TOOLS,
  ToolName,
  toolByName,
} from "./tools"
import { validate } from "./validate"
import { embedText } from "../ai/gemini"
import type { Passage } from "./data"
import type { ImportBlock } from "./render"

type Key = Doc<"mcpKeys">
type Args = Record<string, unknown>

interface ToolResult {
  text: string
  structured?: Record<string, unknown>
  isError?: boolean
  /** One line for the audit log. */
  summary: string
  documentId?: Id<"documents"> | null
}

// ---- Small helpers ------------------------------------------------------------------

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:5173").replace(/\/+$/, "")
}

function docLink(documentId: string, page?: number | null): string {
  return `${appUrl()}/docs/${documentId}${page ? `?page=${page}` : ""}`
}

function pageOf(section: string | null): number | null {
  const m = /^Page (\d+)$/.exec(section ?? "")
  return m ? Number(m[1]) : null
}

function isoDate(at: number | null | undefined): string | null {
  return at == null ? null : new Date(at).toISOString().slice(0, 10)
}

function notPublishedReason(status: string): string {
  if (status === "in_review") return "It is in review,"
  if (status === "approved") return "It is approved but not Published yet,"
  return "It is a draft,"
}

function refuse(text: string, summary: string): ToolResult {
  return { text, summary, isError: true }
}

function quote(text: string, max = 600): string {
  const t = text.replace(/\s+/g, " ").trim()
  return t.length > max ? `${t.slice(0, max)}...` : t
}

const round2 = (n: number) => Math.round(n * 100) / 100

function areaLimitText(key: Key): string {
  return key.areaCodes.length ? `areas ${key.areaCodes.join(", ")}` : "all areas"
}

/** The areas a call may touch: the requested one (inside the key's limit) or the key's limit. */
function areasFor(key: Key, requested: unknown): { areas: string[] } | { refusal: ToolResult } {
  const want = typeof requested === "string" ? requested.trim().toUpperCase() : ""
  if (!want) return { areas: key.areaCodes }
  if (key.areaCodes.length > 0 && !key.areaCodes.includes(want)) {
    return {
      refusal: refuse(
        `This key is limited to ${areaLimitText(key)}. Area ${want} is outside that limit, so nothing was read.`,
        `refused: area ${want} outside key limit`,
      ),
    }
  }
  return { areas: [want] }
}

/** Vector search over chunks, sliced to the area's Published documents when the key or call is area-limited. */
async function vectorChunks(ctx: ActionCtx, vector: number[], areas: string[], limit: number) {
  if (areas.length === 0) {
    return await ctx.vectorSearch("chunks", "by_embedding", { vector, limit })
  }
  const ids: Id<"documents">[] = await ctx.runQuery(internal.mcp.data.publishedDocIds, { areas })
  if (ids.length === 0) return []
  const slice = ids.slice(0, 64)
  return await ctx.vectorSearch("chunks", "by_embedding", {
    vector,
    limit,
    filter: (q) => q.or(...slice.map((id) => q.eq("documentId", id))),
  })
}

function passageLine(p: Passage, i: number): string {
  const section = p.section ? ` · ${p.section}` : ""
  return [
    `${i + 1}. ${p.namingCode} · ${p.title} · v${p.version}${section} · match ${p.score.toFixed(2)}`,
    `   "${quote(p.text)}"`,
    `   ${docLink(p.documentId, pageOf(p.section))}`,
  ].join("\n")
}

function passageOut(p: Passage) {
  return {
    namingCode: p.namingCode,
    title: p.title,
    version: p.version,
    section: p.section,
    quote: p.text,
    score: round2(p.score),
    link: docLink(p.documentId, pageOf(p.section)),
  }
}

/**
 * Split an incoming document into passages about the size of an Oppr chunk
 * (one step, row or paragraph), so they compare like with like, and sample
 * at most `max` of them evenly so a long document is judged as a whole.
 */
function samplePassages(text: string, max = 12): string[] {
  let paras = text
    .split(/\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 25)
  // OCR output or pasted text often has few or no line breaks. Split it on
  // sentence ends and numbered steps too, so it still gives several passages
  // and the coverage vote means something.
  if (paras.length < 4) {
    paras = paras
      .flatMap((p) => p.split(/(?<=[.;])\s+|\s(?=\d{1,2}[.)]\s)/))
      .map((p) => p.trim())
      .filter((p) => p.length >= 25)
  }
  const merged: string[] = []
  let buf = ""
  for (const para of paras) {
    if (buf && buf.length + para.length > 300) {
      merged.push(buf)
      buf = ""
    }
    buf = buf ? `${buf} ${para}` : para
  }
  if (buf) merged.push(buf)
  if (merged.length <= max) return merged
  // Evenly spaced sample, so a long document is judged as a whole.
  return Array.from({ length: max }, (_, i) => merged[Math.floor((i * merged.length) / max)])
}

// find_similar (gemini-embedding at 768 dimensions). Text about this plant
// scores about 0.72 against any Published passage, so the raw similarity
// separates poorly; coverage (the share of incoming passages whose best
// match is in one document) is what tells "the same" from "related".
const STRONG_PASSAGE_MATCH = 0.84

const NAMING_CODE = /[A-Z]{2,4}-[A-Z]{2,4}-[A-Z]+-\d{4}/g

/**
 * A short line, a References section or a list of naming codes. These match
 * almost any text about the plant, so they act as hubs: they never vote in
 * find_similar and rank below real content in search.
 */
function isHub(p: { section: string | null; text: string }): boolean {
  const t = p.text.replace(/\s+/g, " ").trim()
  if (t.length < 60) return true
  if (/^references?$/i.test((p.section ?? "").trim())) return true
  const codeChars = (t.match(NAMING_CODE) ?? []).join("").length
  return codeChars / t.length > 0.25
}

function verdictOf(
  m: { score: number; coverage: number; wins: number },
  mode: "semantic" | "keyword",
  passageCount: number,
) {
  if (mode === "keyword") return m.score >= 0.6 ? "likely the same document" : m.score >= 0.3 ? "overlaps" : "new"
  // Too little text to judge as a whole: never say "the same" on one or two passages.
  if (m.coverage >= 0.6 && m.score >= 0.84 && passageCount >= 3 && m.wins >= 2) return "likely the same document"
  if (m.coverage >= 0.2 || m.score >= 0.84) return "overlaps"
  return "new"
}

// ---- Tool handlers ------------------------------------------------------------------

const HANDLERS: Record<ToolName, (ctx: ActionCtx, key: Key, args: Args) => Promise<ToolResult>> = {
  async oppr_get_structure(ctx, key) {
    const s = await ctx.runQuery(internal.mcp.data.structure, { areas: key.areaCodes })
    const lines = [
      `Plant structure of Oppr Knowledge${s.companyName ? ` (${s.companyName})` : ""}.${key.areaCodes.length ? ` This key is limited to ${areaLimitText(key)}.` : ""}`,
      "",
      "Areas (area code):",
      ...s.areas.map((a) => `- ${a.code}: ${a.label}`),
      "",
      "Disciplines (discipline code):",
      ...s.disciplines.map((d) => `- ${d.code}: ${d.label}`),
      "",
      "Document types (type slug, naming token):",
      ...s.types.map((t) => `- ${t.slug} (${t.token}): ${t.label}`),
      "",
      `Naming code pattern: ${s.namingPattern}. Oppr allocates the number; you never choose a code.`,
      ...(s.namingExamples.length
        ? ["Examples:", ...s.namingExamples.map((e) => `- ${e.code}: ${e.title}`)]
        : []),
      "",
      "Assets (code: name, area):",
      ...s.assets.map((a) => `- ${a.code}: ${a.name}, ${a.area ?? "no area"}`),
      "",
      `PPE slugs: ${s.ppe.map((p) => `${p.slug} (${p.label})`).join(", ")}`,
      `Warning levels: ${s.warningLevels.join(", ")}`,
      "",
      "Block format for oppr_import_draft:",
      s.blockFormat,
    ]
    return {
      text: lines.join("\n"),
      structured: s as unknown as Record<string, unknown>,
      summary: `structure: ${s.areas.length} areas, ${s.assets.length} assets`,
    }
  },

  async oppr_search(ctx, key, args) {
    const scoped = areasFor(key, args.area)
    if ("refusal" in scoped) return scoped.refusal
    const query = String(args.query).trim()
    const limit = typeof args.limit === "number" ? args.limit : 5
    let mode: "semantic" | "keyword" = "semantic"
    let results: Passage[]
    try {
      const vector = await embedText({ ctx, feature: "mcp", personId: null, target: { kind: "mcpKey", id: key._id } }, query)
      const hits = await vectorChunks(ctx, vector, scoped.areas, 40)
      const found: Omit<Passage, "score">[] = await ctx.runQuery(internal.mcp.data.passages, {
        chunkIds: hits.map((h) => h._id),
        areas: scoped.areas,
      })
      const score = new Map(hits.map((h) => [String(h._id), h._score]))
      results = found
        .map((p) => ({ ...p, score: score.get(String(p.chunkId)) ?? 0 }))
        .sort((a, b) => Number(isHub(a)) - Number(isHub(b)) || b.score - a.score)
        .slice(0, limit)
    } catch (err) {
      console.warn("MCP search: embedding failed, using keyword match", err)
      mode = "keyword"
      results = await ctx.runQuery(internal.mcp.data.lexicalSearch, { query, areas: scoped.areas, limit })
    }
    const where = scoped.areas.length ? ` in ${scoped.areas.join(", ")}` : ""
    const text =
      results.length === 0
        ? `No Published passages found for "${query}"${where}. Try other words, or call oppr_get_structure to see what the library covers.`
        : [
            `${results.length} Published passage${results.length === 1 ? "" : "s"} for "${query}"${where} (${mode} search):`,
            "",
            results.map(passageLine).join("\n\n"),
          ].join("\n")
    return {
      text,
      structured: { query, mode, results: results.map(passageOut) },
      summary: `${results.length} passages for "${quote(query, 80)}"`,
    }
  },

  async oppr_get_document(ctx, key, args) {
    const code = String(args.code).trim().toUpperCase()
    const r = await ctx.runQuery(internal.mcp.data.getDocument, { code, areas: key.areaCodes })
    if (r.status === "not_found")
      return refuse(
        `There is no document with naming code ${code}. Use oppr_search to find the right code.`,
        `not found: ${code}`,
      )
    if (r.status === "out_of_area")
      return refuse(
        `${code} is in area ${r.area ?? "unknown"}. This key is limited to ${areaLimitText(key)}, so it cannot read it.`,
        `refused: ${code} outside key areas`,
      )
    if (r.status === "not_published")
      return refuse(
        r.archived
          ? `${code} (${r.title}) is archived. It is no longer part of the knowledge base.`
          : `${code} (${r.title}) has never been Published. ${notPublishedReason(r.docStatus)} so it is not knowledge yet, and MCP cannot read it.`,
        `refused: ${code} not published`,
      )

    const m = r.meta
    const header = [
      `${m.namingCode} · ${m.title}`,
      `Type: ${m.type} · Area: ${m.area ?? "?"}${m.areaLabel ? ` (${m.areaLabel})` : ""} · Discipline: ${m.discipline ?? "?"}${m.disciplineLabel ? ` (${m.disciplineLabel})` : ""}`,
      `Published version: v${m.version}, published ${isoDate(m.publishedAt) ?? "?"} · Next review: ${isoDate(m.nextReviewAt) ?? "not set"}`,
      ...(m.approvedBy || m.owner
        ? [[m.approvedBy ? `Approved by: ${m.approvedBy}` : null, m.owner ? `Owner: ${m.owner}` : null].filter(Boolean).join(" · ")]
        : []),
      `Assets: ${m.assets.length ? m.assets.map((a) => `${a.code} (${a.name})`).join(", ") : "none"}`,
      `Link: ${docLink(m.documentId)}`,
    ]
    let body: string
    if (r.pages) {
      body = [
        `Wrapped supplier manual${m.supplier ? ` from ${m.supplier}` : ""}, ${m.pdfPageCount ?? r.pages.length} pages. The supplier PDF is the source; below is its text by page.`,
        ...r.pages.map((p) => `## Page ${p.page}\n${p.text}\nOpen this page: ${docLink(m.documentId, p.page)}`),
      ].join("\n\n")
    } else {
      body = r.text ?? ""
    }
    const { documentId, ...metaOut } = m
    return {
      text: `${header.join("\n")}\n\n---\n\n${body}`,
      structured: {
        ...metaOut,
        publishedAt: isoDate(m.publishedAt),
        nextReviewAt: isoDate(m.nextReviewAt),
        link: docLink(documentId),
        ...(r.pages
          ? { pages: r.pages.map((p) => ({ ...p, link: docLink(documentId, p.page) })) }
          : { content: body }),
      },
      summary: `read ${m.namingCode} v${m.version}`,
      documentId,
    }
  },

  async oppr_find_similar(ctx, key, args) {
    const title = String(args.title).trim()
    const text = String(args.text)
    const areas = key.areaCodes
    type Match = {
      namingCode: string
      title: string
      version: number
      score: number
      coverage: number
      wins: number
      link: string
      evidence: string | null
    }
    let mode: "semantic" | "keyword" = "semantic"
    let matches: Match[] = []
    let passageCount = 0
    try {
      const inputs = [`${title}\n${text.slice(0, 1500)}`, ...samplePassages(text)]
      const spec = { ctx, feature: "mcp" as const, personId: null, target: { kind: "mcpKey", id: key._id as string } }
      const vectors = await Promise.all(inputs.map((t) => embedText(spec, t)))
      const hitsPer = await Promise.all(vectors.map((vec) => vectorChunks(ctx, vec, areas, 40)))
      const allIds = [...new Set(hitsPer.flat().map((h) => h._id))]
      const found: Omit<Passage, "score">[] = await ctx.runQuery(internal.mcp.data.passages, {
        chunkIds: allIds,
        areas,
      })
      const byChunk = new Map(found.filter((p) => !isHub(p)).map((p) => [String(p.chunkId), p]))
      // Per Published document: for every incoming passage, its best match in
      // that document; the document's score is the mean over all passages.
      const best = new Map<string, { p: Omit<Passage, "score">; scores: number[]; top: { s: number; text: string } }>()
      hitsPer.forEach((hits, i) => {
        for (const h of hits) {
          const p = byChunk.get(String(h._id))
          if (!p) continue
          const entry = best.get(p.documentId) ?? {
            p,
            scores: Array(vectors.length).fill(0),
            top: { s: 0, text: "" },
          }
          entry.scores[i] = Math.max(entry.scores[i], h._score)
          if (h._score > entry.top.s) entry.top = { s: h._score, text: p.text }
          best.set(p.documentId, entry)
        }
      })
      // Coverage: the share of incoming passages (index 0 is the title and
      // opening, so it is left out) for which this document is the best match.
      const entries = [...best.values()]
      passageCount = Math.max(1, vectors.length - 1)
      const winners = new Map<string, number>()
      for (let i = 1; i < vectors.length; i++) {
        let bestDoc: string | null = null
        let bestScore = 0
        for (const e of entries)
          if (e.scores[i] > bestScore) {
            bestScore = e.scores[i]
            bestDoc = e.p.documentId
          }
        if (bestDoc && bestScore >= STRONG_PASSAGE_MATCH) winners.set(bestDoc, (winners.get(bestDoc) ?? 0) + 1)
      }
      matches = entries
        .map((e) => ({
          namingCode: e.p.namingCode,
          title: e.p.title,
          version: e.p.version,
          score: round2(e.scores.reduce((a, b) => a + b, 0) / e.scores.length),
          coverage: round2((winners.get(e.p.documentId) ?? 0) / passageCount),
          wins: winners.get(e.p.documentId) ?? 0,
          link: docLink(e.p.documentId),
          evidence: quote(e.top.text, 240),
        }))
        .sort((a, b) => b.coverage - a.coverage || b.score - a.score)
        .slice(0, 5)
    } catch (err) {
      console.warn("MCP find_similar: embedding failed, using word overlap", err)
      mode = "keyword"
      const rows = await ctx.runQuery(internal.mcp.data.lexicalSimilar, { text: `${title}\n${text}`, areas })
      matches = rows.map((r) => ({
        namingCode: r.namingCode,
        title: r.title,
        version: r.version,
        score: round2(r.score),
        coverage: round2(r.score),
        wins: 0,
        link: docLink(r.documentId),
        evidence: null,
      }))
    }

    const withVerdict = matches.map(({ wins, ...m }) => ({ ...m, verdict: verdictOf({ ...m, wins }, mode, passageCount) }))
    const top = withVerdict[0]
    const overall = !top ? "new" : top.verdict
    const advice =
      overall === "likely the same document"
        ? `Do not import it. ${top.namingCode} already covers this; report differences with oppr_report_signal (kind "suggestion") instead.`
        : overall === "overlaps"
          ? `Part of this already exists in ${top.namingCode}. Import only what is new, and mention the overlap in the sourceNote so the reviewing Engineer can merge.`
          : "Nothing similar is Published. It is safe to import as a draft with oppr_import_draft."
    const lines = [
      `Verdict for "${title}": ${overall}${key.areaCodes.length ? ` (checked against ${areaLimitText(key)})` : ""}.`,
      advice,
      "",
      ...(withVerdict.length
        ? [
            "Closest Published documents:",
            ...withVerdict.map(
              (m, i) =>
                `${i + 1}. ${m.namingCode} · ${m.title} · v${m.version} · similarity ${m.score.toFixed(2)}, coverage ${Math.round(m.coverage * 100)}% · ${m.verdict}\n   ${m.link}${m.evidence ? `\n   Closest passage: "${m.evidence}"` : ""}`,
            ),
          ]
        : ["No Published documents to compare with."]),
    ]
    return {
      text: lines.join("\n"),
      structured: { verdict: overall, mode, matches: withVerdict },
      summary: `"${quote(title, 60)}": ${overall}${top ? ` (${top.namingCode} ${top.score.toFixed(2)})` : ""}`,
    }
  },

  async oppr_list_assets(ctx, key, args) {
    const scoped = areasFor(key, args.area)
    if ("refusal" in scoped) return scoped.refusal
    const assets = await ctx.runQuery(internal.mcp.data.listAssets, { areas: scoped.areas })
    const lines = [
      `${assets.length} Asset${assets.length === 1 ? "" : "s"}${scoped.areas.length ? ` in ${scoped.areas.join(", ")}` : ""}:`,
      ...assets.map(
        (a) =>
          `- ${a.code}: ${a.name}, ${a.area ?? "no area"}. ${a.publishedDocuments} Published document${a.publishedDocuments === 1 ? "" : "s"}${a.documentCodes.length ? ` (${a.documentCodes.join(", ")})` : ""}`,
      ),
    ]
    return {
      text: lines.join("\n"),
      structured: { assets },
      summary: `${assets.length} assets`,
    }
  },

  async oppr_list_wikis(ctx, key) {
    const wikis = await ctx.runQuery(internal.wikis.mcpList, { areas: key.areaCodes })
    const lines = [
      wikis.length
        ? `${wikis.length} Wiki${wikis.length === 1 ? "" : "s"}${key.areaCodes.length ? ` within ${areaLimitText(key)}` : ""}. Built only from Published documents; cite the sources, not the Wiki.`
        : `No Wikis are ready${key.areaCodes.length ? ` within ${areaLimitText(key)}` : ""}.`,
      ...wikis.map(
        (w) =>
          `- ${w.title} (id ${w.id}): ${w.purpose} ${w.pointCount} facts in ${w.sections.length} sections (${w.sections.join("; ")}). Sources: ${w.sources.map((s) => `${s.code} v${s.version}`).join(", ") || "none"}. Built ${isoDate(w.builtAt) ?? "?"}. Link: ${appUrl()}/wiki/${w.id}`,
      ),
    ]
    return {
      text: lines.join("\n"),
      structured: {
        wikis: wikis.map((w) => ({ ...w, builtAt: isoDate(w.builtAt), link: `${appUrl()}/wiki/${w.id}` })),
      },
      summary: `${wikis.length} wikis`,
    }
  },

  async oppr_get_wiki(ctx, key, args) {
    const wanted = String(args.wiki).trim()
    const r = await ctx.runQuery(internal.wikis.mcpGet, { wiki: wanted, areas: key.areaCodes })
    if (r.status === "not_found")
      return refuse(`There is no Wiki "${wanted}". Use oppr_list_wikis to see the Wikis and their ids.`, `not found: wiki ${wanted}`)
    if (r.status === "out_of_area")
      return refuse(
        `The Wiki "${r.title}" is built from documents outside this key's limit (${areaLimitText(key)}), so it cannot be read.`,
        `refused: wiki outside key areas`,
      )
    if (r.status === "not_ready")
      return refuse(
        `The Wiki "${r.title}" is not ready (${r.wikiStatus}). Read its source documents with oppr_get_document instead.`,
        `refused: wiki not ready`,
      )
    const link = `${appUrl()}/wiki/${r.id}`
    const body: string[] = [
      `# ${r.title}`,
      r.purpose,
      `Generated overview, not a controlled document. Built ${isoDate(r.builtAt) ?? "?"} from ${r.sources.map((s) => `${s.code} v${s.version}`).join(", ")}. Link: ${link}`,
      ...(r.withheldPoints > 0
        ? [`${r.withheldPoints} fact${r.withheldPoints === 1 ? " is" : "s are"} left out because a source changed since the last build.`]
        : []),
      r.intro,
    ]
    for (const s of r.sections) {
      body.push(`## ${s.heading}${s.safety ? " (safety)" : ""}`)
      if (s.kind === "table" && s.columns) body.push(`| ${s.columns.join(" | ")} |`)
      s.points.forEach((p, i) => {
        const cite = p.cites.length ? ` [${p.cites.join("; ")}]` : ""
        if (s.kind === "table" && p.cells) body.push(`| ${p.cells.join(" | ")} |${cite}`)
        else if (s.kind === "steps") body.push(`${i + 1}. ${p.text}${cite}`)
        else body.push(`- ${p.text}${cite}`)
      })
    }
    body.push("## Sources", ...r.sources.map((s) => `- ${s.code} v${s.version}: ${s.title}. ${docLink(s.documentId)}`))
    return {
      text: body.join("\n\n"),
      structured: {
        ...r,
        builtAt: isoDate(r.builtAt),
        link,
        sources: r.sources.map(({ documentId, ...s }) => ({ ...s, link: docLink(documentId) })),
      },
      summary: `read wiki ${r.title}`,
    }
  },

  async oppr_skill_coverage(ctx, key, args) {
    const r = await ctx.runQuery(internal.mcp.data.skillCoverage, {
      skill: typeof args.skill === "string" ? args.skill : undefined,
      profile: typeof args.profile === "string" ? args.profile : undefined,
      areas: key.areaCodes,
    })
    const LEVEL = ["not trained", "trained", "qualified", "can train others"]
    if (r.mode === "not_found")
      return refuse(
        `No ${r.what} matches that name. Available: ${r.available.join(", ")}.`,
        `${r.what.toLowerCase()} not found`,
      )
    if (r.mode === "skill") {
      const lines: string[] = []
      for (const s of r.skills) {
        lines.push(`Skill: ${s.name}${s.area ? ` (${s.area})` : ""}${s.validityMonths ? `, valid ${s.validityMonths} months` : ""}`)
        if (s.holders.length === 0) lines.push("  Nobody holds this Skill yet.")
        const shifts = [...new Set(s.holders.map((h) => shiftName(h.shift)))]
        for (const shift of shifts) {
          lines.push(`  ${shift}:`)
          for (const h of s.holders.filter((x) => (shiftName(x.shift)) === shift)) {
            const flag = h.status === "valid" ? "" : `, ${h.status}${h.expiresAt ? ` (${isoDate(h.expiresAt)})` : ""}`
            lines.push(`  - ${h.name}, ${h.role}: level ${h.level} ${LEVEL[h.level] ?? ""}${flag}`)
          }
        }
        lines.push("")
      }
      return {
        text: lines.join("\n").trim(),
        structured: {
          skills: r.skills.map((s) => ({
            ...s,
            holders: s.holders.map((h) => ({ ...h, expiresAt: isoDate(h.expiresAt) })),
          })),
        },
        summary: `coverage for skill "${quote(String(args.skill), 60)}"`,
      }
    }
    if (r.mode === "profile") {
      const shifts = [...new Set(r.qualified.map((q) => shiftName(q.shift)))]
      const lines = [
        `Skill profile: ${r.profile}`,
        `Requires: ${r.requirements.map((q) => `${q.skill} at level ${q.level}`).join("; ")}`,
        "",
        `Meets every target (${r.qualified.length}):`,
        ...shifts.flatMap((shift) => [
          `  ${shift}:`,
          ...r.qualified
            .filter((q) => (shiftName(q.shift)) === shift)
            .map((q) => `  - ${q.name}, ${q.role}${q.expiringSoon.length ? ` (expiring soon: ${q.expiringSoon.join(", ")})` : ""}`),
        ]),
        ...(r.qualified.length === 0 ? ["  Nobody."] : []),
        "",
        `Holds the profile but not there yet (${r.almost.length}):`,
        ...r.almost.map(
          (a) =>
            `- ${a.name}, ${a.role}${a.shift && !a.role.toLowerCase().includes(a.shift.toLowerCase()) ? `, ${a.shift}` : ""}: ${a.missing.join("; ")}`,
        ),
      ]
      return { text: lines.join("\n"), structured: r, summary: `coverage for profile "${r.profile}"` }
    }
    const lines = [
      "Skill coverage overview (people per level that counts now; re-train needed and expired do not count):",
      ...r.skills.map(
        (s) =>
          `- ${s.name}${s.area ? ` (${s.area})` : ""}: ${s.trained} trained, ${s.qualified} qualified, ${s.canTrain} can train others${s.expiring ? `, ${s.expiring} expiring` : ""}${s.retrain ? `, ${s.retrain} re-train needed` : ""}`,
      ),
      "",
      `Skill profiles: ${r.profiles.join(", ")}. Ask with a skill or profile name for names per shift.`,
    ]
    return { text: lines.join("\n"), structured: r, summary: "skill coverage overview" }
  },

  async oppr_training_records(ctx, key, args) {
    const r = await ctx.runQuery(internal.mcp.data.trainingRecords, {
      documentCode: typeof args.documentCode === "string" ? args.documentCode : undefined,
      person: typeof args.person === "string" ? args.person : undefined,
      areas: key.areaCodes,
    })
    if (r.status === "not_found") return refuse(r.what, "document not found")
    if (r.status === "out_of_area")
      return refuse(`${r.what} This key is limited to ${areaLimitText(key)}.`, "refused: document outside key areas")
    const filters = [
      r.documentNote ? `Trainings built on ${r.documentNote}` : null,
      typeof args.person === "string" ? `person matching "${args.person}"` : null,
    ].filter(Boolean)
    const lines = [
      `${r.records.length} Training record${r.records.length === 1 ? "" : "s"}${filters.length ? ` for ${filters.join(", ")}` : ""}, newest first:`,
      ...r.records.map(
        (x) =>
          `- ${x.person} (${x.role}): ${x.trainingCode} ${x.trainingTitle} v${x.trainingVersion}, passed ${isoDate(x.passedAt)}, score ${x.score}%`,
      ),
    ]
    return {
      text: lines.join("\n"),
      structured: { records: r.records.map((x) => ({ ...x, passedAt: isoDate(x.passedAt) })) },
      summary: `${r.records.length} training records`,
    }
  },

  async oppr_import_draft(ctx, key, args) {
    const r = await ctx.runMutation(internal.mcp.data.importDraft, {
      keyId: key._id,
      title: String(args.title),
      type: String(args.type).trim(),
      area: String(args.area),
      discipline: String(args.discipline),
      assetCodes: Array.isArray(args.assetCodes) ? (args.assetCodes as string[]) : [],
      sourceNote: String(args.sourceNote),
      blocks: args.blocks as ImportBlock[],
    })
    if (!r.ok)
      return refuse(
        `The draft was not created. Fix these and call oppr_import_draft again:\n${r.errors.map((e) => `- ${e}`).join("\n")}`,
        `import refused: ${quote(r.errors[0] ?? "", 120)}`,
      )
    const link = docLink(r.documentId)
    return {
      text: [
        `Draft ${r.namingCode} · ${r.title} created.`,
        `Link: ${link}`,
        `${r.chunks} passages${r.assets.length ? `, linked to ${r.assets.join(", ")}` : ""}.`,
        "This is a draft. An Engineer reviews and publishes it in Oppr.",
      ].join("\n"),
      structured: {
        namingCode: r.namingCode,
        title: r.title,
        status: "draft",
        link,
        assets: r.assets,
      },
      summary: `draft ${r.namingCode} created`,
      documentId: r.documentId,
    }
  },

  async oppr_report_signal(ctx, key, args) {
    const r = await ctx.runMutation(internal.mcp.data.reportSignal, {
      keyId: key._id,
      documentCode: String(args.documentCode),
      kind: args.kind as "unclear" | "incident" | "suggestion",
      note: String(args.note),
      section: typeof args.section === "string" ? args.section : undefined,
    })
    if (!r.ok) return refuse(r.error, `signal refused: ${quote(r.error, 120)}`)
    const sectionText = r.section
      ? ` on section "${r.section}"`
      : r.sectionAsked
        ? ` (section "${r.sectionAsked}" was not found, so it is attached to the whole document)`
        : ""
    return {
      text: `Signal recorded on ${r.namingCode} · ${r.title}, Published v${r.version}${sectionText}. It shows up in Document insights and Knowledge health, where an Engineer decides what to change. The document itself is unchanged.\nLink: ${docLink(r.documentId)}`,
      structured: {
        namingCode: r.namingCode,
        version: r.version,
        kind: args.kind,
        section: r.section,
        link: docLink(r.documentId),
      },
      summary: `${String(args.kind)} signal on ${r.namingCode}`,
      documentId: r.documentId,
    }
  },
}

// ---- JSON-RPC -----------------------------------------------------------------------

type RpcId = string | number | null

interface RpcMessage {
  jsonrpc?: unknown
  id?: unknown
  method?: unknown
  params?: unknown
}

const rpcResult = (id: RpcId, result: unknown) => ({ jsonrpc: "2.0", id, result })
const rpcError = (id: RpcId, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } })

function allowedTools(key: Key) {
  return TOOLS.filter((t) => key.scopes.includes(t.scope))
}

async function callTool(ctx: ActionCtx, key: Key, id: RpcId, params: Record<string, unknown>) {
  const name = params.name
  if (typeof name !== "string") return rpcError(id, -32602, "tools/call needs params.name (the tool name).")
  const started = Date.now()
  const tool = toolByName(name)
  if (!tool) {
    await ctx.runMutation(internal.mcp.keys.logCall, {
      keyId: key._id,
      tool: name.slice(0, 80),
      ok: false,
      summary: "unknown tool",
      documentId: null,
      durationMs: Date.now() - started,
    })
    return rpcError(id, -32602, `Unknown tool: ${name}. Call tools/list for the tools this key can use.`)
  }

  const args = params.arguments === undefined ? {} : params.arguments
  let result: ToolResult
  if (!key.scopes.includes(tool.scope)) {
    result = refuse(
      `This key does not have the ${tool.scope} access level, so it cannot use ${tool.name}. An Engineer can make a key with ${tool.scope} on the MCP page in Oppr.`,
      `refused: missing scope ${tool.scope}`,
    )
  } else if (!args || typeof args !== "object" || Array.isArray(args)) {
    result = refuse("arguments must be a JSON object.", "invalid arguments")
  } else {
    const errors = validate(tool.inputSchema, args)
    if (errors.length > 0) {
      result = refuse(
        `Invalid arguments for ${tool.name}:\n${errors.map((e) => `- ${e}`).join("\n")}`,
        `invalid arguments: ${quote(errors[0], 120)}`,
      )
    } else {
      try {
        result = await HANDLERS[tool.name](ctx, key, args as Args)
      } catch (err) {
        console.error(`MCP ${tool.name} failed`, err)
        result = refuse(
          `Oppr could not complete ${tool.name}: ${err instanceof Error ? err.message : String(err)}. Try again; if it keeps failing, tell the person.`,
          `error: ${quote(err instanceof Error ? err.message : String(err), 120)}`,
        )
      }
    }
  }

  await ctx.runMutation(internal.mcp.keys.logCall, {
    keyId: key._id,
    tool: tool.name,
    ok: !result.isError,
    summary: result.summary,
    documentId: result.documentId ?? null,
    durationMs: Date.now() - started,
  })

  return rpcResult(id, {
    content: [{ type: "text", text: result.text }],
    ...(result.structured ? { structuredContent: result.structured } : {}),
    ...(result.isError ? { isError: true } : {}),
  })
}

/** One JSON-RPC message → its response, or null for a notification. */
async function handleMessage(ctx: ActionCtx, key: Key, raw: unknown) {
  const msg = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as RpcMessage
  const hasId = "id" in msg
  const id: RpcId = typeof msg.id === "string" || typeof msg.id === "number" ? msg.id : null
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    // A client's response to us (we never send requests) is ignored.
    if (hasId && !("result" in msg) && !("error" in msg))
      return rpcError(id, -32600, "Invalid request: expected a JSON-RPC 2.0 message with a method.")
    return null
  }
  const params = (msg.params && typeof msg.params === "object" ? msg.params : {}) as Record<string, unknown>
  if (!hasId) return null // notification, e.g. notifications/initialized

  switch (msg.method) {
    case "initialize": {
      const asked = params.protocolVersion
      const protocolVersion = (PROTOCOL_VERSIONS as readonly unknown[]).includes(asked)
        ? (asked as string)
        : DEFAULT_PROTOCOL_VERSION
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, title: "Oppr Knowledge", version: SERVER_VERSION },
        instructions: `${SERVER_INSTRUCTIONS} This connection ("${key.name}") has access: ${key.scopes.join(", ")}; ${areaLimitText(key)}.`,
      })
    }
    case "ping":
      return rpcResult(id, {})
    case "tools/list":
      return rpcResult(id, {
        tools: allowedTools(key).map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: {
            title: t.title,
            readOnlyHint: t.readOnly,
            destructiveHint: false,
            idempotentHint: t.readOnly,
            openWorldHint: false,
          },
        })),
      })
    case "tools/call":
      return await callTool(ctx, key, id, params)
    default:
      return rpcError(id, -32601, `Method not found: ${msg.method}. This server supports initialize, ping, tools/list and tools/call.`)
  }
}

// ---- HTTP ---------------------------------------------------------------------------

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin")
  return {
    "Access-Control-Allow-Origin": origin && origin !== "null" ? origin : "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
    "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
    Vary: "Origin",
  }
}

function json(req: Request, status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(req), ...extra },
  })
}

function unauthorized(req: Request, message: string, tokenGiven: boolean) {
  return json(req, 401, rpcError(null, -32001, message), {
    "WWW-Authenticate": tokenGiven
      ? `Bearer realm="${SERVER_NAME}", error="invalid_token", error_description="${message}"`
      : `Bearer realm="${SERVER_NAME}"`,
  })
}

export const mcpPost = httpAction(async (ctx, req) => {
  const header = req.headers.get("Authorization") ?? ""
  const token = /^Bearer\s+(\S+)\s*$/i.exec(header.trim())?.[1] ?? null
  if (!token)
    return unauthorized(
      req,
      "Missing MCP key. Send it as 'Authorization: Bearer opk_...'. An Engineer makes keys on the MCP page in Oppr.",
      false,
    )
  const key: Key | null = token.startsWith("opk_")
    ? await ctx.runQuery(internal.mcp.keys.keyByHash, { hash: await sha256Hex(token) })
    : null
  if (!key) return unauthorized(req, "This MCP key is not valid or has been revoked.", true)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json(req, 400, rpcError(null, -32700, "Parse error: the body is not valid JSON."))
  }

  if (Array.isArray(body)) {
    if (body.length === 0) return json(req, 400, rpcError(null, -32600, "Invalid request: empty batch."))
    const out = []
    for (const m of body) {
      const r = await handleMessage(ctx, key, m)
      if (r) out.push(r)
    }
    return out.length ? json(req, 200, out) : new Response(null, { status: 202, headers: cors(req) })
  }
  const r = await handleMessage(ctx, key, body)
  return r ? json(req, 200, r) : new Response(null, { status: 202, headers: cors(req) })
})

export const mcpOptions = httpAction(async (_ctx, req) => {
  return new Response(null, { status: 204, headers: cors(req) })
})

export const mcpGet = httpAction(async (_ctx, req) => {
  return json(req, 405, rpcError(null, -32000, "This MCP server is stateless and has no event stream. Use POST."), {
    Allow: "POST, OPTIONS",
  })
})

/** "night" -> "Night shift"; no shift -> "No shift". */
function shiftName(shift: string | null | undefined): string {
  return shift ? `${shift.charAt(0).toUpperCase()}${shift.slice(1)} shift` : "No shift"
}
