// AI for Captures (docs/adr/0005). Two jobs, the same split as the rest of
// Oppr: Gemini (cheap) does the raw media work, Claude does the thinking.
//
//   process(captureId)  after hand-in
//     1. Gemini transcribes voice notes and describes photos and short videos
//        (sent inline; larger files are kept but marked "not analyzed").
//     2. Claude organizes all Entries into Moments (step, safety, quality,
//        tip, problem, question), each pointing at its evidence Entries and
//        Asset, plus a summary and tags.
//   combine(setId)      for a Capture set
//     1. Claude aligns the Moments of all Captures into one step list with
//        supportedBy, Variations (different, skipped, extra) and a suggested
//        standard per step that has Variations.
//     2. Each step is matched against Published passages (vector search over
//        the chunks, live versions only), and Claude marks real conflicts
//        with a verbatim quote.
//
// Captures are raw input: nothing here writes Knowledge, and Ask, Wiki and MCP
// never read Captures. Without ANTHROPIC_API_KEY, Gemini does the Claude part.
// With OPPR_AI_STUB=1 a deterministic stand-in runs (tests, offline demos).
import { v } from "convex/values"
import { z } from "zod"
import { internalAction, internalQuery } from "../_generated/server"
import { internal } from "../_generated/api"
import { Id } from "../_generated/dataModel"
import { claudeConfigured, claudeJson, describeClaudeError } from "./llm"
import { aiStubEnabled } from "./wiki"
import { embedText, geminiText, toBase64 } from "./gemini"
import type { MeterSpec } from "../lib/aiMeter"
import { searchChunks } from "./vectorSearch"

/** Largest file sent inline to Gemini (the request limit is 20 MB after base64). */
export const INLINE_MAX_BYTES = 14 * 1024 * 1024

const MOMENT_KINDS = ["step", "safety", "quality", "tip", "problem", "question"] as const
type MomentKind = (typeof MOMENT_KINDS)[number]

// ---- Gemini -------------------------------------------------------------------------

function baseMime(mime: string | undefined, fallback: string): string {
  const m = (mime ?? "").split(";")[0].trim().toLowerCase()
  return m || fallback
}

const MEDIA_PROMPT = {
  voice:
    "Transcribe this voice note from a factory operator, word for word, in the language spoken. Keep numbers, units, machine codes (like EXL-201) and times exactly as said. Return only the transcript. If nothing can be heard, return: (nothing audible)",
  photo:
    "This photo was taken by an operator in a plastic pipe factory while recording how they do a job. Describe in 1 to 3 plain sentences what it shows that matters for the work: the machine part, readings on displays or gauges (copy the values exactly), settings, positions, hazards and PPE. Do not guess names of people. Return only the description.",
  video:
    "This short video was recorded by an operator in a plastic pipe factory while recording how they do a job. Summarize in 2 to 5 plain sentences what is done, in order, with readings, settings and hazards that are visible or said. Include anything the operator says that matters. Return only the summary.",
} as const

async function analyzeMedia(m: MeterSpec, kind: "voice" | "photo" | "video", bytes: Uint8Array, mime: string): Promise<string> {
  const data = toBase64(bytes)
  try {
    return await geminiText(m, [{ inlineData: { mimeType: mime, data } }, { text: MEDIA_PROMPT[kind] }], { maxOutputTokens: 2048 })
  } catch (e) {
    // Browsers record audio as audio/webm; Gemini reads the same bytes as video/webm.
    if (kind === "voice" && mime === "audio/webm") {
      return await geminiText(m, [{ inlineData: { mimeType: "video/webm", data } }, { text: MEDIA_PROMPT.voice }], {
        maxOutputTokens: 2048,
      })
    }
    throw e
  }
}

// ---- structured output (Claude, else Gemini) ------------------------------------------

async function structured<S extends z.ZodType>(m: MeterSpec, system: string, prompt: string, schema: S, maxTokens = 16000): Promise<z.infer<S>> {
  if (claudeConfigured()) {
    try {
      return await claudeJson({ system, messages: [{ role: "user", content: prompt }], schema, effort: "medium", maxTokens, meter: m })
    } catch (e) {
      throw new Error(describeClaudeError(e))
    }
  }
  const shape = JSON.stringify(z.toJSONSchema(schema))
  const text = await geminiText(m, [{ text: `${prompt}\n\nAnswer with JSON matching this JSON schema:\n${shape}` }], {
    json: true,
    system,
    maxOutputTokens: 8192,
  })
  const parsed = schema.safeParse(JSON.parse(text))
  if (!parsed.success) throw new Error("The AI answer did not match the expected format.")
  return parsed.data
}

// ---- process one Capture --------------------------------------------------------------

export const plantAssets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("assets").take(500)
    return rows.map((a) => ({ _id: a._id, code: a.code, name: a.name }))
  },
})

const MomentsOut = z.object({
  summary: z.string().describe("2 to 3 plain sentences: what job was done, where, and anything notable."),
  tags: z.array(z.string()).describe("3 to 6 short lowercase tags, e.g. start-up, line 2, purge."),
  moments: z.array(
    z.object({
      kind: z.enum(MOMENT_KINDS),
      title: z.string().describe("Short imperative title, max 10 words, e.g. 'Check the vacuum at -0.3 bar'."),
      detail: z.string().describe("1 to 3 sentences in the operator's own facts: values, order, reasons."),
      entries: z.array(z.string()).describe("Keys of the evidence Entries, e.g. ['E3','E4']."),
      asset: z.string().nullable().describe("Asset code where it happened, e.g. EXL-201, or null."),
    }),
  ),
})

const PROCESS_SYSTEM = [
  "You organize a Capture: an operator in a plastic pipe factory recorded how they do a job on the phone, as a stream of Entries (typed notes, voice note transcripts, photo and video descriptions, and Scans of machines).",
  "Turn the Entries into Moments, in the order the work was done:",
  "- step: one action of the job, as an imperative ('Start the screw at 20 rpm').",
  "- safety: a hazard, a precaution or PPE the operator mentions or that is visible.",
  "- quality: a check of the product or a reading with an acceptance value.",
  "- tip: a knack or trick that makes the job easier or better.",
  "- problem: something that went wrong or often goes wrong, with what they did.",
  "- question: something the operator was unsure about or asks.",
  "Rules: use only what the Entries say; never add steps from general knowledge. Keep numbers, units, times and machine codes exactly. Every Moment lists the keys of the Entries it comes from. A Scan Entry tells where the following Entries happened: set asset to that code. Merge Entries that describe the same action into one Moment. Skip chatter. Write plain English, no em dashes.",
].join("\n")

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export const processCapture = internalAction({
  args: { captureId: v.id("captures"), force: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const started = await ctx.runMutation(internal.captures.captures.markProcessing, args)
    if (!started) return
    try {
      const data = await ctx.runQuery(internal.captures.captures.loadForProcessing, { captureId: args.captureId })
      if (!data) return
      const stub = aiStubEnabled()
      const m: MeterSpec = { ctx, feature: "capture", personId: data.capture.authorId, target: { kind: "capture", id: args.captureId } }

      // 1. Media → text (Gemini).
      const texts = new Map<string, string>()
      for (const e of data.entries) {
        if (e.kind === "note" && e.text) texts.set(e._id, e.text)
        if (e.kind === "voice" && e.transcript) texts.set(e._id, e.transcript)
        if ((e.kind === "photo" || e.kind === "video") && e.description) texts.set(e._id, e.description)
        if (e.analysis !== "pending" || !e.storageId) continue
        const kind = e.kind as "voice" | "photo" | "video"
        if (stub) {
          const note = "Offline stand-in, no AI."
          await ctx.runMutation(internal.captures.captures.saveEntryAnalysis, { entryId: e._id, analysis: "skipped", analysisNote: note })
          continue
        }
        try {
          const blob = await ctx.storage.get(e.storageId)
          if (!blob) {
            await ctx.runMutation(internal.captures.captures.saveEntryAnalysis, {
              entryId: e._id,
              analysis: "failed",
              analysisNote: "The file is missing.",
            })
            continue
          }
          if (blob.size > INLINE_MAX_BYTES) {
            await ctx.runMutation(internal.captures.captures.saveEntryAnalysis, {
              entryId: e._id,
              analysis: "skipped",
              analysisNote: `Not analyzed: ${(blob.size / 1048576).toFixed(0)} MB is above the ${INLINE_MAX_BYTES / 1048576} MB the AI reads. The file is kept.`,
            })
            continue
          }
          const fallback = kind === "voice" ? "audio/webm" : kind === "photo" ? "image/jpeg" : "video/mp4"
          const mime = baseMime(e.mimeType ?? blob.type, fallback)
          const out = (await analyzeMedia(m, kind, new Uint8Array(await blob.arrayBuffer()), mime)).slice(0, 4000)
          texts.set(e._id, out)
          await ctx.runMutation(internal.captures.captures.saveEntryAnalysis, {
            entryId: e._id,
            analysis: "done",
            ...(kind === "voice" ? { transcript: out } : { description: out }),
          })
        } catch (err) {
          await ctx.runMutation(internal.captures.captures.saveEntryAnalysis, {
            entryId: e._id,
            analysis: "failed",
            analysisNote: `Could not analyze: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300),
          })
        }
      }

      // 2. Entries → Moments (Claude).
      const keyOf = new Map<string, Id<"captureEntries">>()
      const lines: string[] = []
      data.entries.forEach((e, i) => {
        const key = `E${i + 1}`
        keyOf.set(key, e._id)
        const at = clock(e.at - data.capture.startedAt)
        const where = e.asset ? ` @${e.asset.code}` : ""
        let body: string
        if (e.kind === "scan") body = e.asset ? `Scanned ${e.asset.code} (${e.asset.name})` : "Scanned an Asset"
        else body = texts.get(e._id) ?? (e.text || `(${e.kind}, no text: ${e.analysisNote ?? "not analyzed"})`)
        lines.push(`[${key}] ${at} ${e.kind}${where}: ${body.replace(/\s+/g, " ").trim()}`)
      })

      const assets = await ctx.runQuery(internal.ai.captures.plantAssets, {})
      const assetByCode = new Map(assets.map((a) => [a.code.toUpperCase(), a._id]))
      let out: z.infer<typeof MomentsOut>
      if (stub) {
        out = stubMoments(data.entries.map((e, i) => ({ key: `E${i + 1}`, kind: e.kind, text: texts.get(e._id) ?? e.text ?? "", asset: e.asset?.code ?? null })))
      } else {
        const prompt = [
          `CAPTURE: ${data.capture.title}`,
          `JOB: ${data.capture.job ?? "(not given)"}`,
          `RECORDED BY: ${data.authorName}${data.authorRole ? `, ${data.authorRole}` : ""}`,
          `PLANT ASSETS: ${assets.map((a) => `${a.code} (${a.name})`).join(", ")}`,
          "",
          "ENTRIES (key, minutes into the Capture, kind, Asset, content):",
          ...lines,
        ].join("\n")
        out = await structured(m, PROCESS_SYSTEM, prompt, MomentsOut)
      }

      const entryAsset = new Map(data.entries.map((e) => [e._id as string, e.assetId]))
      const moments = []
      for (const m of out.moments) {
        const entryIds = [...new Set(m.entries.map((k) => keyOf.get(k.trim().toUpperCase())).filter((x): x is Id<"captureEntries"> => !!x))]
        if (entryIds.length === 0) continue
        const title = m.title.replace(/\s+/g, " ").trim().slice(0, 200)
        if (!title) continue
        const assetId: Id<"assets"> | undefined =
          (m.asset ? assetByCode.get(m.asset.trim().toUpperCase()) : undefined) ?? entryAsset.get(entryIds[0]) ?? undefined
        moments.push({
          kind: (MOMENT_KINDS as readonly string[]).includes(m.kind) ? (m.kind as MomentKind) : "step",
          title,
          detail: m.detail.replace(/\s+/g, " ").trim().slice(0, 2000),
          assetId,
          entryIds,
        })
      }
      if (moments.length === 0) throw new Error("The AI found no Moments in this Capture. Add more Entries or process it again.")
      await ctx.runMutation(internal.captures.captures.saveMoments, {
        captureId: args.captureId,
        summary: out.summary.replace(/\s+/g, " ").trim().slice(0, 1000),
        tags: [...new Set(out.tags.map((t) => t.toLowerCase().trim()).filter(Boolean))].slice(0, 8),
        moments,
      })
    } catch (err) {
      await ctx.runMutation(internal.captures.captures.markFailed, {
        captureId: args.captureId,
        error: `Processing failed: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  },
})

function stubMoments(entries: { key: string; kind: string; text: string; asset: string | null }[]): z.infer<typeof MomentsOut> {
  const moments = entries
    .filter((e) => e.kind !== "scan" && e.text.trim())
    .map((e) => {
      const text = e.text.replace(/\s+/g, " ").trim()
      const kind: MomentKind = /\b(careful|danger|hot|glove|face shield|never)\b/i.test(text)
        ? "safety"
        : /\?$/.test(text)
          ? "question"
          : /\b(check|measure|reading)\b/i.test(text)
            ? "quality"
            : "step"
      return { kind, title: text.split(/[.!?]/)[0].slice(0, 80), detail: text, entries: [e.key], asset: e.asset }
    })
  return { summary: "Offline stand-in, no AI: one Moment per Entry.", tags: ["offline"], moments }
}

// ---- combine a Capture set --------------------------------------------------------------

const CombineOut = z.object({
  summary: z.string().describe("2 to 4 sentences: the job, how many Captures agree, the main differences."),
  steps: z.array(
    z.object({
      title: z.string().describe("Short imperative title of the step."),
      detail: z.string().describe("The step as most Captures do it, with values."),
      kind: z.enum(MOMENT_KINDS),
      supportedBy: z.array(z.string()).describe("Capture keys that show this step, e.g. ['C1','C3']."),
      moments: z.array(z.string()).describe("Moment keys this step is built from, e.g. ['C1.M2','C3.M4']."),
      variations: z
        .array(
          z.object({
            capture: z.string().describe("Capture key."),
            kind: z.enum(["different", "skipped", "extra"]),
            text: z.string().describe("What this Capture does differently, skips, or adds, with its values."),
          }),
        )
        .describe("Empty when all Captures agree."),
      suggestion: z
        .string()
        .nullable()
        .describe("When there are variations: which way to make the standard and why, in one or two sentences. Else null."),
    }),
  ),
})

const COMBINE_SYSTEM = [
  "You combine several Captures of the same job in a plastic pipe factory. Each Capture is one operator's recorded way of doing the job, already organized into Moments.",
  "Make one step list in the order the job is done. For each step say which Captures show it (supportedBy) and which Moments it comes from.",
  "Mark Variations per step: 'different' when a Capture does the step in another way or with other values, 'skipped' when a Capture that covers that part of the job leaves the step out, 'extra' when only one or a few Captures add something (a knack, an extra check). An extra step that only one Capture has is still its own step, with that Capture in supportedBy and a variation of kind 'extra'.",
  "Safety, quality and tip Moments become steps of that kind at the place where they belong.",
  "When there are Variations, give a suggestion for the standard: prefer the safer way, then the way that matches the majority, and say why. A person decides; you only suggest.",
  "Use only what the Captures say. Keep numbers, units, times and machine codes exactly. Write plain English, no em dashes.",
  "In summary, detail, variation and suggestion texts, name a Capture by its operator's first name, never by its key (write 'Ahmed', not 'C2'). Keys are only for the supportedBy, moments and capture fields.",
].join("\n")

const ConflictsOut = z.object({
  conflicts: z.array(
    z.object({
      step: z.number().describe("Step number as given."),
      passage: z.string().describe("Passage key, e.g. P2."),
      quote: z.string().describe("The exact words of the passage that the step contradicts, copied verbatim."),
      note: z.string().describe("One or two sentences: what the Captures do and what the Published document says."),
    }),
  ),
})

const CONFLICT_SYSTEM = [
  "You check how operators really do a job against Published documents of the factory.",
  "For each step you get what the Captures show (and their Variations) and some Published passages that may be related.",
  "Report a conflict only when a step or one of its Variations clearly contradicts a passage about the same action: a different value (time, temperature, pressure, speed, torque), a different order, a different material, or a skipped safety measure the passage requires. Related but compatible passages are not conflicts. When nothing conflicts, return an empty list.",
  "Quote the passage verbatim. Name the Capture's value and the document's value in the note. No em dashes.",
].join("\n")

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase()

export const combine = internalAction({
  args: { setId: v.id("captureSets") },
  handler: async (ctx, args) => {
    try {
      const data = await ctx.runQuery(internal.captures.sets.loadForCombine, { setId: args.setId })
      if (!data) return
      if (data.captures.length < 2) throw new Error("A Capture set needs at least 2 Captures.")
      const m: MeterSpec = { ctx, feature: "capture", personId: null, target: { kind: "captureSet", id: args.setId } }

      const capKey = new Map<string, Id<"captures">>()
      const momentEntries = new Map<string, Id<"captureEntries">[]>()
      const blocks: string[] = []
      data.captures.forEach((c, ci) => {
        const ck = `C${ci + 1}`
        capKey.set(ck, c._id)
        blocks.push(`${ck}: "${c.title}" by ${c.authorName}${c.authorRole ? ` (${c.authorRole})` : ""}, ${new Date(c.handedInAt).toISOString().slice(0, 10)}`)
        if (c.summary) blocks.push(`  Summary: ${c.summary}`)
        c.moments.forEach((m, mi) => {
          const mk = `${ck}.M${mi + 1}`
          momentEntries.set(mk, m.entryIds)
          blocks.push(`  [${mk}] ${m.kind}${m.assetCode ? ` @${m.assetCode}` : ""}: ${m.title}. ${m.detail}`)
        })
        blocks.push("")
      })

      // Keys that slip into texts become the operator's first name.
      const firstName = new Map(data.captures.map((c, i) => [`C${i + 1}`, c.authorName.split(" ")[0]]))
      const unkey = (text: string) =>
        text
          .replace(/\b(C\d+)(?:\.M\d+)?\b/g, (m, k: string) => firstName.get(k) ?? m)
          .replace(/\s+/g, " ")
          .trim()

      // 1. Align (Claude).
      let combined: z.infer<typeof CombineOut>
      if (aiStubEnabled()) {
        combined = stubCombine(data.captures.map((c, i) => ({ key: `C${i + 1}`, moments: c.moments })))
      } else {
        const prompt = [`CAPTURE SET: ${data.set.title}`, `JOB: ${data.set.job ?? "(not given)"}`, "", "CAPTURES:", ...blocks].join("\n")
        combined = await structured(m, COMBINE_SYSTEM, prompt, CombineOut)
      }

      const steps = combined.steps
        .map((st) => {
          const supportedBy = [...new Set(st.supportedBy.map((k) => capKey.get(k.trim().toUpperCase())).filter((x): x is Id<"captures"> => !!x))]
          const variations = st.variations
            .map((vr) => ({ captureId: capKey.get(vr.capture.trim().toUpperCase()), kind: vr.kind, text: unkey(vr.text).slice(0, 1000) }))
            .filter((vr): vr is { captureId: Id<"captures">; kind: "different" | "skipped" | "extra"; text: string } => !!vr.captureId && !!vr.text)
          const evidenceEntryIds = [...new Set(st.moments.flatMap((k) => momentEntries.get(k.trim().toUpperCase()) ?? []))].slice(0, 20)
          return {
            title: unkey(st.title).slice(0, 200),
            detail: unkey(st.detail).slice(0, 2000),
            kind: (MOMENT_KINDS as readonly string[]).includes(st.kind) ? (st.kind as MomentKind) : ("step" as MomentKind),
            supportedBy,
            variations,
            suggestion: st.suggestion && variations.length > 0 ? unkey(st.suggestion).slice(0, 1000) : undefined,
            evidenceEntryIds,
            conflict: undefined as
              | { documentId: Id<"documents">; namingCode: string; quote: string; note: string }
              | undefined,
          }
        })
        .filter((st) => st.title && (st.supportedBy.length > 0 || st.variations.length > 0))
      if (steps.length === 0) throw new Error("The AI returned no steps.")

      // 2. Conflicts with Published Knowledge (vector search + Claude).
      if (!aiStubEnabled() && process.env.GEMINI_API_KEY) {
        const candidates: { step: number; passages: { key: string; documentId: Id<"documents">; namingCode: string; title: string; text: string }[] }[] = []
        let pk = 0
        for (const [i, st] of steps.entries()) {
          if (st.kind === "question") continue
          const query = [st.title, st.detail, ...st.variations.map((vr) => vr.text)].join(". ")
          let hits
          try {
            const vector = await embedText(m, query)
            hits = await searchChunks(ctx, { vector, limit: 8 })
          } catch (e) {
            console.warn(`Capture set ${args.setId}: search failed for step ${i + 1}:`, e)
            continue
          }
          const passages = await ctx.runQuery(internal.captures.sets.publishedPassages, {
            hits: hits.map((h) => ({ id: h._id, score: h._score })),
          })
          const top = passages.filter((p) => p.score >= 0.55).slice(0, 3)
          if (top.length === 0) continue
          candidates.push({
            step: i + 1,
            passages: top.map((p) => ({ key: `P${++pk}`, documentId: p.documentId, namingCode: p.namingCode, title: p.title, text: p.text })),
          })
        }
        if (candidates.length > 0) {
          const passageByKey = new Map(candidates.flatMap((c) => c.passages.map((p) => [p.key, p] as const)))
          const prompt = candidates
            .map((c) => {
              const st = steps[c.step - 1]
              return [
                `STEP ${c.step}: ${st.title}. ${st.detail}`,
                ...st.variations.map((vr) => `  Variation (${vr.kind}): ${vr.text}`),
                "  PASSAGES:",
                ...c.passages.map((p) => `  [${p.key}] ${p.namingCode} ${p.title}: ${p.text.replace(/\s+/g, " ")}`),
              ].join("\n")
            })
            .join("\n\n")
          try {
            const found = await structured(m, CONFLICT_SYSTEM, prompt, ConflictsOut, 8000)
            for (const c of found.conflicts) {
              const st = steps[c.step - 1]
              const p = passageByKey.get(c.passage.trim().toUpperCase())
              if (!st || !p || st.conflict) continue
              // The quote must really be in the passage; else quote the passage itself.
              const quote = norm(p.text).includes(norm(c.quote)) && c.quote.trim().length > 10 ? c.quote.trim() : p.text.trim().slice(0, 400)
              st.conflict = { documentId: p.documentId, namingCode: p.namingCode, quote, note: unkey(c.note).slice(0, 600) }
            }
          } catch (e) {
            console.warn(`Capture set ${args.setId}: conflict check failed:`, e)
          }
        }
      }

      await ctx.runMutation(internal.captures.sets.saveCombined, {
        setId: args.setId,
        summary: unkey(combined.summary).slice(0, 1500),
        steps: steps.map((st) => ({
          title: st.title,
          detail: st.detail,
          kind: st.kind,
          supportedBy: st.supportedBy,
          variations: st.variations,
          evidenceEntryIds: st.evidenceEntryIds,
          ...(st.suggestion ? { suggestion: st.suggestion } : {}),
          ...(st.conflict ? { conflict: st.conflict } : {}),
        })),
      })
    } catch (err) {
      await ctx.runMutation(internal.captures.sets.markCombineFailed, {
        setId: args.setId,
        error: `Combining failed: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  },
})

function stubCombine(caps: { key: string; moments: { kind: string; title: string; detail: string }[] }[]): z.infer<typeof CombineOut> {
  const byTitle = new Map<string, { kind: string; title: string; detail: string; caps: string[]; moments: string[] }>()
  caps.forEach((c) =>
    c.moments.forEach((m, mi) => {
      const k = norm(m.title)
      const row = byTitle.get(k) ?? { kind: m.kind, title: m.title, detail: m.detail, caps: [], moments: [] }
      row.caps.push(c.key)
      row.moments.push(`${c.key}.M${mi + 1}`)
      byTitle.set(k, row)
    }),
  )
  return {
    summary: "Offline stand-in, no AI: steps matched by identical titles.",
    steps: [...byTitle.values()].map((r) => ({
      title: r.title,
      detail: r.detail,
      kind: (MOMENT_KINDS as readonly string[]).includes(r.kind) ? (r.kind as MomentKind) : "step",
      supportedBy: r.caps,
      moments: r.moments,
      variations: r.caps.length < caps.length ? r.caps.map((c) => ({ capture: c, kind: "extra" as const, text: r.title })) : [],
      suggestion: null,
    })),
  }
}
