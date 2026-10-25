// CONTRACT (shared by the plant lane and the AI features).
// A short plain-text briefing about the plant (organization background,
// structure, processes, glossary) for AI prompts: Ask, Wikis and the guided
// writer. Keep it under ~4000 characters. The plant lane owns this file.
import { v } from "convex/values"
import { internalQuery } from "../_generated/server"
import type { Doc } from "../_generated/dataModel"

const MAX_CHARS = 4000

function short(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim()
  if (t.length <= n) return t
  const cut = t.slice(0, n)
  const dot = cut.lastIndexOf(". ")
  return dot > n * 0.5 ? cut.slice(0, dot + 1) : `${cut.trimEnd()}...`
}

function withSynonyms(i: Doc<"plantItems">): string {
  const code = i.code ? ` ${i.code}` : ""
  return i.synonyms.length ? `${i.name}${code} (also: ${i.synonyms.join(", ")})` : `${i.name}${code}`
}

export const forAi = internalQuery({
  args: {
    /** Narrow to these area codes (namingLocations.code) when given. */
    areaCodes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<string> => {
    const [profile, cover, areas, areaInfo, allItems] = await Promise.all([
      ctx.db.query("plantProfile").first(),
      ctx.db.query("coverSettings").first(),
      ctx.db.query("namingLocations").take(200),
      ctx.db.query("plantAreas").take(200),
      ctx.db.query("plantItems").take(2000),
    ])
    if (!profile && allItems.length === 0) return ""

    const only = args.areaCodes && args.areaCodes.length > 0 ? new Set(args.areaCodes) : null
    const inScope = (i: Doc<"plantItems">) => !only || i.areaCode == null || only.has(i.areaCode)
    const items = allItems.filter(inScope).sort((a, b) => a.sortOrder - b.sortOrder)
    const of = (k: Doc<"plantItems">["kind"]) => items.filter((i) => i.kind === k)

    // Three levels of detail; the first that fits is used, so the glossary
    // and hazards are never cut off by long descriptions.
    const LEVELS = [
      { about: 450, area: 160, process: 110, hazard: 90, other: 70, term: 60 },
      { about: 300, area: 110, process: 60, hazard: 60, other: 0, term: 0 },
      { about: 300, area: 110, process: 0, hazard: 0, other: 0, term: 0 },
      { about: 200, area: 0, process: 0, hazard: 0, other: 0, term: 0 },
    ]
    const header =
      "PLANT BRIEFING (background about the organization and its words; not a source for procedures or values):"
    const company = cover?.companyName?.trim()
    const sites = of("site")
    const areaRows = areas
      .filter((a) => !only || only.has(a.code))
      .sort((a, b) => a.code.localeCompare(b.code))

    const build = (L: (typeof LEVELS)[number]) => {
      const lines: string[] = [header]
      if (profile) {
        lines.push(`ORGANIZATION${company ? `: ${company}` : ""}. ${short(profile.about, L.about)}`)
        if (profile.productsAndCustomers && L.other > 0)
          lines.push(`Products and customers: ${short(profile.productsAndCustomers, 300)}`)
        if (profile.certifications.length) lines.push(`Certifications: ${profile.certifications.join(", ")}.`)
      } else if (company) {
        lines.push(`ORGANIZATION: ${company}.`)
      }
      if (sites.length)
        lines.push(`Sites: ${sites.map((s) => `${s.name}${s.code ? ` (${s.code})` : ""}`).join("; ")}.`)
      if (areaRows.length) {
        lines.push("AREAS:")
        for (const a of areaRows) {
          const info = areaInfo.find((x) => x.areaCode === a.code)
          const areaLines = of("line").filter((l) => l.areaCode === a.code)
          const desc = info?.description && L.area > 0 ? ` ${short(info.description, L.area)}` : ""
          const ls = areaLines.length ? ` Lines: ${areaLines.map((l) => l.name).join(", ")}.` : ""
          lines.push(`- ${a.code} ${a.label}.${desc}${ls}`)
        }
      }
      const list = (title: string, rows: Doc<"plantItems">[], descLen: number) => {
        if (!rows.length) return
        lines.push(`${title}:`)
        for (const r of rows) {
          const area = r.areaCode ? ` [${r.areaCode}]` : ""
          const desc = r.description && descLen > 0 ? `: ${short(r.description, descLen)}` : ""
          lines.push(`- ${withSynonyms(r)}${area}${desc}`)
        }
      }
      list("GLOSSARY (words people use, with synonyms incl. Dutch)", of("term"), L.term)
      list("PROCESSES", of("process"), L.process)
      list("HAZARDS", of("hazard"), L.hazard)
      list("MATERIALS", of("material"), L.other)
      list("PRODUCTS", of("product"), L.other)
      list("ROLES", of("role"), 0)
      return lines
    }

    let lines = build(LEVELS[0])
    for (const L of LEVELS.slice(1)) {
      if (lines.join("\n").length <= MAX_CHARS) break
      lines = build(L)
    }
    // Still too long (a very large Plant): drop whole lines from the end.
    let text = lines.join("\n")
    while (text.length > MAX_CHARS && lines.length > 2) {
      lines.pop()
      text = lines.join("\n")
    }
    return text.slice(0, MAX_CHARS)
  },
})
