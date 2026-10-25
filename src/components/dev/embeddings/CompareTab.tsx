// Compare (text): EmbeddingGemma in this browser against the production
// gemini-embedding-2 search, on a sample of Published passages. Matryoshka
// sizes, overlap of the two top 10s and timing.
import { useEffect, useMemo, useState } from "react"
import { useAction } from "convex/react"
import { Loader2, Search } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  corpus,
  dot,
  embedCorpus,
  errorText,
  normalize,
  probeWebGpu,
  readDevice,
  textEngine,
  TEXT_QUERY,
  useStore,
  writeDevice,
  type Device,
  type LoadSpec,
  type ModelKey,
} from "./engine"
import { Bar, Choice, ErrorLine, HitList, LoadFailure, LoadRow, Step } from "./LabBits"

const DIMS = [768, 512, 256, 128] as const

const PRESET_QUERIES = [
  "Wat moet ik doen als de extruder te heet wordt?",
  "Welke PBM heb ik nodig bij het wisselen van de matrijs?",
  "How do I calibrate the vacuum tank?",
  "lockout tagout before cleaning the puller",
  "pijp ovaliteit buiten tolerantie",
]

/**
 * The text model for a route. GPU runs 4-bit files; the quantized
 * EmbeddingGemma 2 files use GatherBlockQuantized, which the CPU (wasm)
 * backend does not have, so CPU runs v1 at q8.
 */
function textSpec(key: ModelKey, device: Device): LoadSpec {
  if (device === "wasm") return { key: "v1", device, dtype: "q8", mode: "v1", label: "EmbeddingGemma 300M (v1)", mb: 309 }
  return key === "v2"
    ? { key, device, dtype: "q4", mode: "text", label: "EmbeddingGemma 2, text encoder", mb: 175 }
    : { key, device, dtype: "q4", mode: "v1", label: "EmbeddingGemma 300M (v1)", mb: 197 }
}

/** GPU when this browser really has a WebGPU adapter, else CPU; remembered. */
function useDevice(): [Device, (d: Device) => void, boolean] {
  const hasApi = typeof navigator !== "undefined" && "gpu" in navigator
  const [gpu, setGpu] = useState(hasApi)
  const [device, setDevice] = useState<Device>(() => {
    const saved = readDevice()
    return saved === "webgpu" && !hasApi ? "wasm" : saved ?? (hasApi ? "webgpu" : "wasm")
  })
  useEffect(() => {
    let live = true
    void probeWebGpu().then((p) => {
      if (!live) return
      setGpu(p.adapter)
      if (!p.adapter) setDevice("wasm")
    })
    return () => {
      live = false
    }
  }, [])
  const choose = (d: Device) => {
    writeDevice(d)
    setDevice(d)
  }
  return [device, choose, gpu]
}

/** Load the model and embed the passages: shared by Compare and Test set. */
export function TextModelSteps({ compact = false }: { compact?: boolean }) {
  const sample = useAction(api.lab.embeddings.sample)
  const state = useStore(textEngine.state)
  const c = useStore(corpus)
  const [device, setDevice, gpu] = useDevice()
  const [key, setKey] = useState<ModelKey>("v2")
  const spec = textSpec(key, device)
  const ready = state.kind === "ready"
  const sameModel = ready && state.spec.key === spec.key && state.spec.device === spec.device

  return (
    <>
      <Step n={1} title="Load a text model">
        <Choice
          label="Run on"
          value={device}
          onChange={setDevice}
          disabled={state.kind === "loading"}
          options={[
            { value: "webgpu", label: gpu ? "GPU (WebGPU)" : "GPU (no WebGPU here)", disabled: !gpu },
            { value: "wasm", label: "CPU (wasm, slower)" },
          ]}
        />
        <Choice
          label="Model"
          value={spec.key}
          onChange={setKey}
          disabled={state.kind === "loading"}
          options={[
            { value: "v2", label: "EmbeddingGemma 2 (text encoder)", disabled: device === "wasm" },
            { value: "v1", label: "EmbeddingGemma 300M (v1)" },
          ]}
        />
        {!compact && (
          <p className="text-xs text-muted-foreground">
            EmbeddingGemma 2 is multimodal: text, images, audio, video and code in one space. This tab loads only its
            text encoder (about 175 MB at q4); the Images tab adds the vision encoder. On CPU only v1 runs (q8, about
            309 MB): the quantized v2 files use an operation the wasm backend does not have.
          </p>
        )}
        <LoadRow
          state={state}
          onLoad={() => void textEngine.load(spec)}
          label={sameModel ? "Reload model" : `Load ${spec.label} (about ${spec.mb} MB)`}
        />
        {state.kind === "error" && (
          <LoadFailure
            message={state.message}
            gated={state.gated}
            action={
              state.spec.device === "webgpu" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span>The GPU route failed. The CPU route (EmbeddingGemma v1, q8) is slower but works more widely.</span>
                  <Button size="sm" variant="outline" onClick={() => setDevice("wasm")}>
                    Switch to CPU
                  </Button>
                </div>
              ) : undefined
            }
          />
        )}
      </Step>

      <Step n={2} title="Embed a sample of Published passages">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            disabled={!ready || c.busy}
            onClick={() => void embedCorpus(() => sample({ limit: 300 }))}
          >
            {c.busy && <Loader2 className="animate-spin" aria-hidden />}
            {c.vectors ? "Embed again" : "Fetch and embed up to 300 passages"}
          </Button>
          {c.passages && (
            <span className="text-xs text-muted-foreground">
              {c.passages.length} passages from {c.publishedDocs} Published documents
              {c.vectors && c.embeddedWith ? `, embedded with ${c.embeddedWith}` : ""}
            </span>
          )}
        </div>
        {!compact && (
          <p className="text-xs text-muted-foreground">
            Runs in a background worker, so the page stays usable. On CPU, 300 passages take about 4 minutes; on a GPU
            it should be much faster. The vectors stay in this browser tab and are shared with the Test set tab.
          </p>
        )}
        {c.progress && c.passages && c.busy && (
          <div className="space-y-1">
            <Bar value={c.progress.done / Math.max(1, c.passages.length)} tone="sky" />
            <div className="text-xs text-muted-foreground">
              {c.progress.done} of {c.passages.length} embedded · {(c.progress.ms / 1000).toFixed(1)} s ·{" "}
              {c.progress.done ? (c.progress.ms / c.progress.done).toFixed(0) : "-"} ms per passage
            </div>
          </div>
        )}
        {c.error && <ErrorLine text={c.error} />}
      </Step>
    </>
  )
}

interface GeminiHit {
  chunkId: Id<"chunks">
  namingCode: string
  title: string
  section: string | null
  text: string
  score: number
}

export function CompareTab() {
  const gemini = useAction(api.lab.embeddings.geminiSearch)
  const c = useStore(corpus)
  const [dim, setDim] = useState<(typeof DIMS)[number]>(768)
  const [query, setQuery] = useState(PRESET_QUERIES[0])
  const [sampleOnly, setSampleOnly] = useState(true)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    queryVec: Float32Array
    gemmaQueryMs: number
    gemini: GeminiHit[]
    geminiEmbedMs: number
    geminiSearchMs: number
    geminiModel: string
  } | null>(null)

  async function runSearch() {
    const q = query.trim()
    if (!q || !c.vectors) return
    setSearching(true)
    setSearchError(null)
    try {
      const t0 = performance.now()
      const [queryVec] = await textEngine.embedTexts([TEXT_QUERY(q)])
      const gemmaQueryMs = performance.now() - t0
      const g = await gemini({ query: q })
      setResult({
        queryVec,
        gemmaQueryMs,
        gemini: g.hits,
        geminiEmbedMs: g.embedMs,
        geminiSearchMs: g.searchMs,
        geminiModel: g.model,
      })
    } catch (err) {
      setSearchError(errorText(err))
    } finally {
      setSearching(false)
    }
  }

  // Rank on every size change without re-embedding: cut, re-normalise.
  const ranked = useMemo(() => {
    if (!result || !c.vectors || !c.passages) return null
    const t0 = performance.now()
    const q = normalize(result.queryVec, dim)
    const vectors = c.vectors
    const gemma = c.passages
      .map((p, i) => ({ ...p, score: dot(q, normalize(vectors[i], dim)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
    const rankMs = performance.now() - t0
    const inSample = new Set(c.passages.map((p) => String(p.chunkId)))
    const gem = (sampleOnly ? result.gemini.filter((h) => inSample.has(String(h.chunkId))) : result.gemini).slice(0, 10)
    const gemIds = new Set(gemma.map((h) => String(h.chunkId)))
    const both = new Set(gem.filter((h) => gemIds.has(String(h.chunkId))).map((h) => String(h.chunkId)))
    return { gemma, gemini: gem, both, rankMs }
  }, [result, c.vectors, c.passages, dim, sampleOnly])

  const toHit = (h: GeminiHit) => ({
    key: String(h.chunkId),
    code: h.namingCode,
    title: h.title,
    detail: h.section,
    text: h.text,
    score: h.score,
  })

  return (
    <div className="space-y-5 rounded-lg border bg-card p-5 text-sm" data-tour="developer-embeddings-compare">
      <TextModelSteps />

      <Step n={3} title="Compare a query">
        <form
          data-tour="developer-embeddings-compare-query"
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void runSearch()
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a question an Operator would ask"
            aria-label="Query"
            className="min-w-[280px] flex-1"
          />
          <Button size="sm" type="submit" disabled={!c.vectors || searching || !query.trim()}>
            {searching ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
            Compare
          </Button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_QUERIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuery(q)}
              className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <Choice
            label="EmbeddingGemma size"
            value={dim}
            onChange={setDim}
            options={DIMS.map((d) => ({ value: d, label: String(d) }))}
          />
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={sampleOnly} onChange={(e) => setSampleOnly(e.target.checked)} />
            <span>Gemini: only passages in the sample (fair comparison)</span>
          </label>
        </div>
        {!c.vectors && <p className="text-xs text-muted-foreground">Load the model and embed the sample first.</p>}
        {searchError && <ErrorLine text={searchError} />}
      </Step>

      {result && ranked && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">
              Overlap in top 10: {ranked.both.size} of {Math.min(ranked.gemma.length, ranked.gemini.length)}
            </Badge>
            <Badge variant="outline">
              EmbeddingGemma: query {result.gemmaQueryMs.toFixed(0)} ms + rank {ranked.rankMs.toFixed(1)} ms ({dim} dims,
              in browser)
            </Badge>
            <Badge variant="outline">
              Gemini: embed {result.geminiEmbedMs} ms + vector search {result.geminiSearchMs} ms (768 dims, in Convex)
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <HitList
              title={`EmbeddingGemma ${dim}`}
              subtitle={`${c.embeddedWith ?? "EmbeddingGemma"}, over the ${c.passages?.length ?? 0} sampled passages`}
              hits={ranked.gemma.map(toHit)}
              both={ranked.both}
              empty="No passages found."
            />
            <HitList
              title="gemini-embedding-2 (production)"
              subtitle={`${result.geminiModel}, ${sampleOnly ? "limited to the same sample" : "whole library"}`}
              hits={ranked.gemini.map(toHit)}
              both={ranked.both}
              empty="No passages found."
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Highlighted rows appear in both lists. Scores are cosine similarities and are not comparable between the
            two models; compare the order, not the numbers. Overlap shows how much the models agree on one query, not
            which is better: the Test set tab scores that.
          </p>
        </div>
      )}
    </div>
  )
}
