// Embedding lab: run EmbeddingGemma in the browser (transformers.js from a CDN,
// WebGPU or wasm, inside a Web Worker) on a sample of Published passages and
// compare its top 10 with the production gemini-embedding-2 search. Experiment
// only: vectors live in this tab's memory and are never written back to Convex.

import { useEffect, useMemo, useRef, useState } from "react"
import { useAction } from "convex/react"
import { AlertTriangle, Cpu, Download, FlaskConical, Loader2, Search } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import type { WorkerRequest, WorkerResponse } from "./embeddingGemma.worker"

type ModelKey = "v2" | "v1"

// Download size per route: GPU runs q4 (4-bit), CPU runs q8 (8-bit) because
// the wasm backend lacks the q4 operator. v2 has no CPU route.
const MODELS: Record<ModelKey, { id: string; label: string; note: string; mb: Record<Device, number | null> }> = {
  v2: {
    id: "onnx-community/embeddinggemma-2-ONNX",
    label: "EmbeddingGemma 2 (text only)",
    note: "Released 2026-10-06, Apache 2.0, 8K context. Vision and audio encoders are not loaded.",
    mb: { webgpu: 175, wasm: null },
  },
  v1: {
    id: "onnx-community/embeddinggemma-300m-ONNX",
    label: "EmbeddingGemma 300M (v1)",
    note: "The original text-only model, 2K context, Gemma licence. Fallback if v2 will not load.",
    mb: { webgpu: 197, wasm: 309 },
  },
}

const DIMS = [768, 512, 256, 128] as const
type Dim = (typeof DIMS)[number]

const PRESET_QUERIES = [
  "Wat moet ik doen als de extruder te heet wordt?",
  "Welke PBM heb ik nodig bij het wisselen van de matrijs?",
  "How do I calibrate the vacuum tank?",
  "lockout tagout before cleaning the puller",
  "pijp ovaliteit buiten tolerantie",
]

interface Passage {
  chunkId: Id<"chunks">
  namingCode: string
  title: string
  section: string | null
  text: string
}

interface Hit {
  chunkId: Id<"chunks">
  namingCode: string
  title: string
  section: string | null
  text: string
  score: number
}

interface Loaded {
  key: ModelKey
  device: Device
  dtype: string
  loadMs: number
}

// Thin promise wrapper around the embedding worker. One worker per load: a
// failed ONNX Runtime session cannot be reused, and terminating the worker
// throws it away without reloading the page.
class EmbedWorker {
  private worker = new Worker(new URL("./embeddingGemma.worker.ts", import.meta.url), { type: "module" })
  private nextId = 1
  private pending = new Map<number, { resolve: (v: Float32Array[]) => void; reject: (e: Error) => void }>()

  load(
    req: Omit<Extract<WorkerRequest, { type: "load" }>, "type">,
    onProgress: (p: Extract<WorkerResponse, { type: "progress" }>) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const m = e.data
        if (m.type === "progress") onProgress(m)
        else if (m.type === "loaded") resolve()
        else if (m.type === "loadError") reject(new Error(m.message))
        else this.settle(m)
      }
      this.worker.onerror = (e) => reject(new Error(e.message || "The embedding worker failed to start"))
      this.worker.postMessage({ type: "load", ...req } satisfies WorkerRequest)
    })
  }

  private settle(m: WorkerResponse) {
    if (m.type !== "embedded" && m.type !== "embedError") return
    const p = this.pending.get(m.reqId)
    if (!p) return
    this.pending.delete(m.reqId)
    if (m.type === "embedded") p.resolve(m.vectors)
    else p.reject(new Error(m.message))
  }

  embed(texts: string[]): Promise<Float32Array[]> {
    const reqId = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(reqId, {
        resolve: (vs) => resolve(vs.map((v) => normalize(v, 768))),
        reject,
      })
      this.worker.postMessage({ type: "embed", reqId, texts } satisfies WorkerRequest)
    })
  }

  terminate() {
    this.worker.terminate()
    for (const p of this.pending.values()) p.reject(new Error("Embedding stopped"))
    this.pending.clear()
  }
}

type Device = "webgpu" | "wasm"
const DEVICE_KEY = "embeddingLab.device"

function readDevice(): Device | null {
  try {
    const v = window.localStorage.getItem(DEVICE_KEY)
    return v === "webgpu" || v === "wasm" ? v : null
  } catch {
    return null
  }
}

function writeDevice(d: Device) {
  try {
    window.localStorage.setItem(DEVICE_KEY, d)
  } catch {
    // Private mode or blocked storage: the choice just is not remembered.
  }
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading"; loaded: number; total: number; files: number; step: string }
  | { kind: "ready" }
  | { kind: "error"; message: string; gated: boolean }

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`

function normalize(v: Float32Array, dim: number): Float32Array {
  const out = v.slice(0, dim)
  let n = 0
  for (let i = 0; i < out.length; i++) n += out[i] * out[i]
  n = Math.sqrt(n) || 1
  for (let i = 0; i < out.length; i++) out[i] /= n
  return out
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  // ONNX Runtime sometimes throws a bare wasm pointer (a number).
  if (typeof err === "number") return `ONNX Runtime error code ${err} (no message; usually a GPU backend failure)`
  return String(err)
}

export function EmbeddingGemmaLab() {
  const sampleAction = useAction(api.lab.embeddings.sample)
  const geminiAction = useAction(api.lab.embeddings.geminiSearch)

  const [modelKey, setModelKey] = useState<ModelKey>("v2")
  const [load, setLoad] = useState<LoadState>({ kind: "idle" })
  const model = useRef<Loaded | null>(null)

  const [passages, setPassages] = useState<Passage[] | null>(null)
  const [publishedDocs, setPublishedDocs] = useState(0)
  const [vectors, setVectors] = useState<Float32Array[] | null>(null)
  const [embedProgress, setEmbedProgress] = useState<{ done: number; ms: number } | null>(null)
  const [sampleBusy, setSampleBusy] = useState(false)
  const [sampleError, setSampleError] = useState<string | null>(null)

  const [dim, setDim] = useState<Dim>(768)
  const [query, setQuery] = useState(PRESET_QUERIES[0])
  const [sampleOnly, setSampleOnly] = useState(true)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    query: string
    queryVec: Float32Array
    gemmaQueryMs: number
    gemini: Hit[]
    geminiEmbedMs: number
    geminiSearchMs: number
    geminiModel: string
  } | null>(null)

  const webgpu = typeof navigator !== "undefined" && "gpu" in navigator
  const [device, setDevice] = useState<Device>(() => {
    const saved = readDevice()
    return saved === "webgpu" && !webgpu ? "wasm" : saved ?? (webgpu ? "webgpu" : "wasm")
  })
  const effectiveKey: ModelKey = device === "wasm" ? "v1" : modelKey
  const worker = useRef<EmbedWorker | null>(null)
  useEffect(() => () => worker.current?.terminate(), [])

  function chooseDevice(next: Device) {
    if (next === device) return
    writeDevice(next)
    setDevice(next)
    // An error from the other route no longer applies.
    if (load.kind === "error") setLoad({ kind: "idle" })
  }

  async function loadModel() {
    const key = effectiveKey
    const spec = MODELS[key]
    // The quantized EmbeddingGemma 2 files use GatherBlockQuantized, which the
    // wasm backend lacks (verified 2026-10-25), so on CPU we run v1 at q8.
    const dtype = device === "wasm" ? "q8" : "q4"
    const files = new Map<string, { loaded: number; total: number }>()
    worker.current?.terminate()
    const w = new EmbedWorker()
    worker.current = w
    model.current = null
    setVectors(null)
    setEmbedProgress(null)
    setResult(null)
    setLoad({ kind: "loading", loaded: 0, total: 0, files: 0, step: "Starting the embedding worker" })
    const t0 = performance.now()
    try {
      await w.load({ modelId: spec.id, device, dtype, textOnly: key === "v2" }, (p) => {
        if (p.file && typeof p.total === "number") files.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
        let loaded = 0
        let total = 0
        for (const f of files.values()) {
          loaded += f.loaded
          total += f.total
        }
        setLoad({ kind: "loading", loaded, total, files: files.size, step: p.step })
      })
      model.current = { key, device, dtype, loadMs: performance.now() - t0 }
      setLoad({ kind: "ready" })
    } catch (err) {
      w.terminate()
      if (worker.current === w) worker.current = null
      const message = errorText(err)
      setLoad({
        kind: "error",
        message,
        gated: /(401|403)|gated|unauthori[sz]ed|forbidden/i.test(message),
      })
    }
  }

  async function loadAndEmbedSample() {
    const w = worker.current
    if (!model.current || !w) return
    setSampleBusy(true)
    setSampleError(null)
    setResult(null)
    try {
      let list = passages
      if (!list) {
        const res = await sampleAction({ limit: 300 })
        list = res.passages
        setPassages(list)
        setPublishedDocs(res.publishedDocs)
      }
      const out: Float32Array[] = []
      const t0 = performance.now()
      setEmbedProgress({ done: 0, ms: 0 })
      // Small batches: WebGPU kernels fail above about 2,700 tokens per batch.
      const BATCH = 4
      for (let i = 0; i < list.length; i += BATCH) {
        const batch = list.slice(i, i + BATCH)
        const texts = batch.map((p) => `title: ${p.title || "none"} | text: ${p.text}`)
        out.push(...(await w.embed(texts)))
        setEmbedProgress({ done: out.length, ms: performance.now() - t0 })
      }
      setVectors(out)
    } catch (err) {
      setSampleError(errorText(err))
    } finally {
      setSampleBusy(false)
    }
  }

  async function runSearch() {
    const w = worker.current
    const q = query.trim()
    if (!model.current || !w || !q) return
    setSearching(true)
    setSearchError(null)
    try {
      const t0 = performance.now()
      const [queryVec] = await w.embed([`task: search result | query: ${q}`])
      const gemmaQueryMs = performance.now() - t0
      const g = await geminiAction({ query: q })
      setResult({
        query: q,
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

  // Rank on every dimension change without re-embedding: truncate, renormalise.
  const ranked = useMemo(() => {
    if (!result || !vectors || !passages) return null
    const t0 = performance.now()
    const q = normalize(result.queryVec, dim)
    const gemma: Hit[] = passages
      .map((p, i) => ({ ...p, score: dot(q, normalize(vectors[i], dim)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
    const rankMs = performance.now() - t0
    const inSample = new Set(passages.map((p) => String(p.chunkId)))
    const gemini = (sampleOnly
      ? result.gemini.filter((h) => inSample.has(String(h.chunkId)))
      : result.gemini
    ).slice(0, 10)
    const gemIds = new Set(gemma.map((h) => String(h.chunkId)))
    const both = new Set(gemini.filter((h) => gemIds.has(String(h.chunkId))).map((h) => String(h.chunkId)))
    return { gemma, gemini, both, rankMs }
  }, [result, vectors, passages, dim, sampleOnly])

  const ready = load.kind === "ready" && model.current != null

  return (
    <Card className="border-violet-500/30">
      <CardContent className="space-y-5 p-5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <FlaskConical className="h-4 w-4 text-violet-600" />
          <span className="font-semibold">Embedding lab</span>
          <Badge variant="secondary" className="text-[10px]">experiment, read-only</Badge>
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Cpu className="h-3 w-3" /> {webgpu ? "This browser offers WebGPU" : "No WebGPU in this browser"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Runs on this computer, not on Google Cloud. The model is downloaded once from Hugging Face
          and cached by the browser. Passages are fetched once on request and embedded in this tab;
          nothing is written back. Use a desktop with Chrome or Edge; not meant for phones.
        </p>

        {/* Step 1: model */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">1. Load the model</div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Run on:</span>
            {(["webgpu", "wasm"] as Device[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => chooseDevice(d)}
                disabled={load.kind === "loading" || (d === "webgpu" && !webgpu)}
                className={cn(
                  "rounded border px-2 py-0.5 disabled:opacity-50",
                  device === d ? "border-violet-500 bg-violet-500/10" : "hover:bg-muted",
                )}
              >
                {d === "webgpu" ? "GPU (WebGPU)" : "CPU (wasm, slower)"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(MODELS) as ModelKey[]).map((k) => {
              const blocked = k === "v2" && device === "wasm"
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setModelKey(k)}
                  disabled={load.kind === "loading" || blocked}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left text-xs transition-colors disabled:opacity-50",
                    effectiveKey === k ? "border-violet-500 bg-violet-500/10" : "hover:bg-muted",
                  )}
                >
                  <div className="font-medium">{MODELS[k].label}</div>
                  <div className="text-muted-foreground">
                    {blocked
                      ? "needs GPU (WebGPU)"
                      : `this route: about ${MODELS[k].mb[device]} MB, ${device === "wasm" ? "q8" : "q4"} · ${MODELS[k].id}`}
                  </div>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {MODELS[effectiveKey].note}
            {device === "wasm" &&
              " On CPU only the v1 model runs: the quantized EmbeddingGemma 2 files use an operation the wasm backend does not have."}
          </p>
          <p className="text-xs text-muted-foreground">
            Sizes differ by route: the GPU route downloads 4-bit (q4) files, the CPU route 8-bit (q8)
            files, so v1 is about 197 MB on GPU and about 309 MB on CPU. The first download took about
            3 to 5 minutes in testing; after that the browser cache serves it.
            {device === "webgpu" &&
              " The GPU route has not been verified yet (the test browser could not create a WebGPU device). If it fails, switch to CPU."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={loadModel} disabled={load.kind === "loading"}>
              {load.kind === "loading" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
              {ready && model.current?.key === effectiveKey ? "Reload model" : "Load model"}
            </Button>
            {load.kind === "loading" && (
              <div className="min-w-[260px] flex-1 space-y-1">
                <div className="h-2 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-violet-500 transition-all"
                    style={{ width: `${load.total ? Math.min(100, (load.loaded / load.total) * 100) : 4}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {load.step}
                  {load.total > 0 && ` · ${mb(load.loaded)} of ${mb(load.total)} (${load.files} files)`}
                </div>
              </div>
            )}
            {ready && model.current && (
              <span className="text-xs text-emerald-700 dark:text-emerald-400">
                Ready: {MODELS[model.current.key].label}, {model.current.dtype} on{" "}
                {model.current.device === "webgpu" ? "GPU" : "CPU"}, loaded in{" "}
                {(model.current.loadMs / 1000).toFixed(1)} s (a second load comes from the browser cache).
              </span>
            )}
          </div>
          {load.kind === "error" && (
            <LoadFailure
              message={load.message}
              gated={load.gated}
              onCpu={device === "webgpu" ? () => chooseDevice("wasm") : null}
            />
          )}
        </div>

        {/* Step 2: sample */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            2. Embed a sample of Published passages
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="secondary" onClick={loadAndEmbedSample} disabled={!ready || sampleBusy}>
              {sampleBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {vectors ? "Embed again" : "Fetch and embed up to 300 passages"}
            </Button>
            {passages && (
              <span className="text-xs text-muted-foreground">
                {passages.length} passages from {publishedDocs} Published documents
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Embedding runs in a background worker, so the page stays usable. On CPU, 300 passages take
            about 4 minutes (about 0.8 s each); on a GPU it should be much faster. Keep this tab open
            until it finishes.
          </p>
          {embedProgress && passages && (
            <div className="space-y-1">
              <div className="h-2 overflow-hidden rounded bg-muted">
                <div
                  className="h-full bg-sky-500 transition-all"
                  style={{ width: `${(embedProgress.done / Math.max(1, passages.length)) * 100}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                {embedProgress.done} of {passages.length} embedded · {(embedProgress.ms / 1000).toFixed(1)} s ·{" "}
                {embedProgress.done ? (embedProgress.ms / embedProgress.done).toFixed(0) : "-"} ms per passage
              </div>
            </div>
          )}
          {sampleError && <ErrorLine text={sampleError} />}
        </div>

        {/* Step 3: query */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">3. Compare a query</div>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void runSearch()
            }}
          >
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a question an operator would ask"
              className="min-w-[280px] flex-1"
            />
            <Button size="sm" type="submit" disabled={!vectors || searching || !query.trim()}>
              {searching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1.5 h-3.5 w-3.5" />}
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
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">EmbeddingGemma size:</span>
              {DIMS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDim(d)}
                  className={cn(
                    "rounded border px-2 py-0.5 font-mono",
                    dim === d ? "border-violet-500 bg-violet-500/10" : "hover:bg-muted",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={sampleOnly} onChange={(e) => setSampleOnly(e.target.checked)} />
              <span>Gemini: only passages in the sample (fair comparison)</span>
            </label>
          </div>
          {!vectors && (
            <p className="text-xs text-muted-foreground">Load the model and embed the sample first.</p>
          )}
          {searchError && <ErrorLine text={searchError} />}
        </div>

        {result && ranked && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">
                Overlap in top 10: {ranked.both.size} of {Math.min(ranked.gemma.length, ranked.gemini.length)}
              </Badge>
              <Badge variant="outline">
                EmbeddingGemma: query {result.gemmaQueryMs.toFixed(0)} ms + rank {ranked.rankMs.toFixed(1)} ms ({dim} dims, in browser)
              </Badge>
              <Badge variant="outline">
                Gemini: embed {result.geminiEmbedMs} ms + vector search {result.geminiSearchMs} ms (768 dims, in Convex)
              </Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <HitList
                title={`EmbeddingGemma ${dim}`}
                subtitle={`${MODELS[model.current?.key ?? "v2"].label}, over the ${passages?.length ?? 0} sampled passages`}
                hits={ranked.gemma}
                both={ranked.both}
              />
              <HitList
                title="gemini-embedding-2 (production)"
                subtitle={`${result.geminiModel}, ${sampleOnly ? "limited to the same sample" : "whole library"}`}
                hits={ranked.gemini}
                both={ranked.both}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Highlighted rows appear in both lists. Scores are cosine similarities and are not comparable
              between the two models; compare the order, not the numbers. Overlap only shows how much
              the two models agree on one query; it does not say which one is better. Deciding that
              needs a set of Dutch and English questions with the passage that should come first (on the
              to-do list).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function HitList({ title, subtitle, hits, both }: { title: string; subtitle: string; hits: Hit[]; both: Set<string> }) {
  return (
    <div className="rounded-md border">
      <div className="border-b bg-muted/40 px-3 py-2">
        <div className="text-xs font-semibold">{title}</div>
        <div className="text-[11px] text-muted-foreground">{subtitle}</div>
      </div>
      {hits.length === 0 ? (
        <div className="p-3 text-xs text-muted-foreground">No passages found.</div>
      ) : (
        <ol className="divide-y">
          {hits.map((h, i) => (
            <li
              key={String(h.chunkId)}
              className={cn("px-3 py-2 text-xs", both.has(String(h.chunkId)) && "bg-emerald-500/10")}
            >
              <div className="flex items-baseline gap-2">
                <span className="w-4 shrink-0 text-muted-foreground">{i + 1}</span>
                <span className="font-mono text-[11px]">{h.namingCode}</span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">{h.score.toFixed(3)}</span>
              </div>
              <div className="ml-6 truncate text-muted-foreground">
                {h.title}
                {h.section ? ` · ${h.section}` : ""}
              </div>
              <div className="ml-6 line-clamp-2">{h.text}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function ErrorLine({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-rose-500/40 bg-rose-500/5 p-2 text-xs">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
      <span className="break-all">{text}</span>
    </div>
  )
}

function LoadFailure({
  message,
  gated,
  onCpu,
}: {
  message: string
  gated: boolean
  onCpu: (() => void) | null
}) {
  return (
    <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
        {gated
          ? "The model repository refused the download (it may be gated behind a licence click-through)."
          : "The model could not be loaded in this browser."}
      </div>
      {onCpu && (
        <div className="flex flex-wrap items-center gap-2">
          <span>The GPU route failed. The CPU route (EmbeddingGemma v1, q8) is slower but works more widely.</span>
          <Button size="sm" variant="outline" onClick={onCpu}>
            Switch to CPU
          </Button>
        </div>
      )}
      <div className="break-all font-mono text-[11px] text-muted-foreground">{message}</div>
      <div>
        Things to try: switch to the other model above; use Chrome or Edge with WebGPU; check that
        jsDelivr and huggingface.co are not blocked by a proxy. If the browser route is not workable,
        the server-side alternatives are a small CPU-only Cloud Run service, a Cloud Run service with an
        L4 GPU (Google has a codelab for this) or, once it is listed, a Model Garden endpoint. All need
        a Google Cloud project with billing, which we do not have yet. Ollama on a laptop also works for
        a local test.
      </div>
    </div>
  )
}
