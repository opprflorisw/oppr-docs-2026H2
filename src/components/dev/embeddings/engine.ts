// Shared state of the Embeddings lab. The loaded models and the embedded
// passages and images live here, outside React, so they survive switching
// tabs (and leaving the page and coming back) without a reload. Nothing is
// ever written back to Convex: Gemma vectors are a different space from the
// production gemini-embedding-2 indexes and must never be mixed into them.
import { useEffect, useState, useSyncExternalStore } from "react"
import type { Id } from "../../../../convex/_generated/dataModel"
import type { LoadMode, WorkerRequest, WorkerResponse } from "./embeddingGemma.worker"

export type Device = "webgpu" | "wasm"
export type ModelKey = "v2" | "v1"

export const MODEL_IDS: Record<ModelKey, string> = {
  v2: "onnx-community/embeddinggemma-2-ONNX",
  v1: "onnx-community/embeddinggemma-300m-ONNX",
}

export const TEXT_QUERY = (q: string) => `task: search result | query: ${q}`
export const TEXT_DOC = (title: string | null, text: string) => `title: ${title || "none"} | text: ${text}`

export interface LoadSpec {
  key: ModelKey
  device: Device
  dtype: string
  mode: LoadMode
  /** What the person sees, for example "EmbeddingGemma 2, text and vision". */
  label: string
  /** Rough download for this route, in MB. */
  mb: number
}

export type EngineState =
  | { kind: "idle" }
  | { kind: "loading"; spec: LoadSpec; loaded: number; total: number; files: number; step: string }
  | { kind: "ready"; spec: LoadSpec; loadMs: number; at: number }
  | { kind: "error"; spec: LoadSpec; message: string; gated: boolean }

export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  // ONNX Runtime sometimes throws a bare wasm pointer (a number).
  if (typeof err === "number") return `ONNX Runtime error code ${err} (no message; usually a GPU backend failure)`
  return String(err)
}

/** Cut to the first `dim` numbers and scale back to length 1 (Matryoshka). */
export function normalize(v: Float32Array, dim: number): Float32Array {
  const out = v.slice(0, dim)
  let n = 0
  for (let i = 0; i < out.length; i++) n += out[i] * out[i]
  n = Math.sqrt(n) || 1
  for (let i = 0; i < out.length; i++) out[i] /= n
  return out
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/** Tiny external store with a React hook. */
function store<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next: T | ((prev: T) => T)) {
      value = typeof next === "function" ? (next as (p: T) => T)(value) : next
      listeners.forEach((l) => l())
    },
    subscribe(l: () => void) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}
type Store<T> = ReturnType<typeof store<T>>

export function useStore<T>(s: Store<T>): T {
  return useSyncExternalStore(s.subscribe, s.get, s.get)
}

/**
 * One model in one worker. A new worker per load: a failed ONNX Runtime
 * session cannot be reused, and terminating the worker throws it away
 * without reloading the page.
 */
class Engine {
  readonly state = store<EngineState>({ kind: "idle" })
  private worker: Worker | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (v: Float32Array[]) => void; reject: (e: Error) => void }>()

  get ready(): boolean {
    return this.state.get().kind === "ready"
  }

  load(spec: LoadSpec): Promise<void> {
    this.unload()
    const worker = new Worker(new URL("./embeddingGemma.worker.ts", import.meta.url), { type: "module" })
    this.worker = worker
    const files = new Map<string, { loaded: number; total: number }>()
    const t0 = performance.now()
    this.state.set({ kind: "loading", spec, loaded: 0, total: 0, files: 0, step: "Starting the embedding worker" })
    return new Promise((resolve) => {
      const fail = (message: string) => {
        if (this.worker !== worker) return resolve()
        worker.terminate()
        this.worker = null
        this.state.set({
          kind: "error",
          spec,
          message,
          gated: /(401|403)|gated|unauthori[sz]ed|forbidden/i.test(message),
        })
        resolve()
      }
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const m = e.data
        if (this.worker !== worker) return
        if (m.type === "progress") {
          if (m.file && typeof m.total === "number") files.set(m.file, { loaded: m.loaded ?? 0, total: m.total })
          let loaded = 0
          let total = 0
          for (const f of files.values()) {
            loaded += f.loaded
            total += f.total
          }
          this.state.set({ kind: "loading", spec, loaded, total, files: files.size, step: m.step })
        } else if (m.type === "loaded") {
          this.state.set({ kind: "ready", spec, loadMs: performance.now() - t0, at: Date.now() })
          resolve()
        } else if (m.type === "loadError") {
          fail(m.message)
        } else {
          const p = this.pending.get(m.reqId)
          if (!p) return
          this.pending.delete(m.reqId)
          if (m.type === "embedded") p.resolve(m.vectors)
          else p.reject(new Error(m.message))
        }
      }
      worker.onerror = (e) => fail(e.message || "The embedding worker failed to start")
      worker.postMessage({ type: "load", modelId: MODEL_IDS[spec.key], device: spec.device, dtype: spec.dtype, mode: spec.mode } satisfies WorkerRequest)
    })
  }

  private send(req: Omit<Extract<WorkerRequest, { type: "embedTexts" }>, "reqId"> | Omit<Extract<WorkerRequest, { type: "embedImages" }>, "reqId">): Promise<Float32Array[]> {
    const w = this.worker
    if (!w || !this.ready) return Promise.reject(new Error("Load the model first"))
    const reqId = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject })
      w.postMessage({ ...req, reqId } as WorkerRequest)
    })
  }

  /** Raw 768-dim vectors; normalise (and cut) before comparing. */
  embedTexts(texts: string[]): Promise<Float32Array[]> {
    return this.send({ type: "embedTexts", texts })
  }

  embedImages(images: Blob[]): Promise<Float32Array[]> {
    return this.send({ type: "embedImages", images })
  }

  unload() {
    this.worker?.terminate()
    this.worker = null
    for (const p of this.pending.values()) p.reject(new Error("Embedding stopped"))
    this.pending.clear()
    this.state.set({ kind: "idle" })
  }
}

/** Text model of the Compare and Test set tabs. */
export const textEngine = new Engine()
/** EmbeddingGemma 2 with the vision encoder, for the Images tab. */
export const imageEngine = new Engine()

// --- Device ---------------------------------------------------------------------

const DEVICE_KEY = "embeddingLab.device"

export function readDevice(): Device | null {
  try {
    const v = window.localStorage.getItem(DEVICE_KEY)
    return v === "webgpu" || v === "wasm" ? v : null
  } catch {
    return null
  }
}

export function writeDevice(d: Device) {
  try {
    window.localStorage.setItem(DEVICE_KEY, d)
  } catch {
    // Private mode or blocked storage: the choice just is not remembered.
  }
}

export interface GpuProbe {
  /** navigator.gpu exists. */
  api: boolean
  /** requestAdapter() gave an adapter. */
  adapter: boolean
  /** Vendor and architecture, when the browser tells. */
  info: string | null
  /** A software (fallback) adapter: works, but slowly. */
  fallback: boolean
  /** Why WebGPU is not usable, when the browser says. */
  problem: string | null
}

let probe: Promise<GpuProbe> | null = null

interface Adapter {
  info?: { vendor?: string; architecture?: string; description?: string; isFallbackAdapter?: boolean }
  isFallbackAdapter?: boolean
  requestDevice(): Promise<{ destroy(): void }>
}

/**
 * Whether this browser can actually run WebGPU: an adapter and a device. Some
 * browsers hand out an adapter whose device then fails (for example a missing
 * D3D12 shader compiler), so a device is requested and thrown away.
 */
export function probeWebGpu(): Promise<GpuProbe> {
  probe ??= (async () => {
    const none = { api: true, adapter: false, info: null, fallback: false }
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<Adapter | null> } }).gpu
    if (!gpu) return { ...none, api: false, problem: null }
    try {
      const adapter = await gpu.requestAdapter()
      if (!adapter) return { ...none, problem: "The browser offers no GPU adapter." }
      const i = adapter.info
      const info = [i?.vendor, i?.architecture, i?.description].filter(Boolean).join(" · ") || null
      const fallback =
        Boolean(adapter.isFallbackAdapter ?? i?.isFallbackAdapter) || /swiftshader/i.test(info ?? "")
      try {
        ;(await adapter.requestDevice()).destroy()
      } catch (err) {
        return { ...none, info, problem: `The GPU adapter could not start a device: ${errorText(err)}` }
      }
      return { api: true, adapter: true, info, fallback, problem: null }
    } catch (err) {
      return { ...none, problem: errorText(err) }
    }
  })()
  return probe
}

/** The probe result, or null while it runs. */
export function useGpuProbe(): GpuProbe | null {
  const [p, setP] = useState<GpuProbe | null>(null)
  useEffect(() => {
    let live = true
    void probeWebGpu().then((r) => live && setP(r))
    return () => {
      live = false
    }
  }, [])
  return p
}

/** EmbeddingGemma 2 with the text and vision encoders (the Images tab). */
export const IMAGE_SPEC: LoadSpec = {
  key: "v2",
  device: "webgpu",
  dtype: "q4",
  mode: "vision",
  label: "EmbeddingGemma 2, text and vision",
  mb: 284,
}

// --- Published passages (Compare and Test set) -------------------------------

export interface Passage {
  chunkId: Id<"chunks">
  namingCode: string
  title: string
  section: string | null
  text: string
}

export interface Corpus {
  passages: Passage[] | null
  publishedDocs: number
  /** Raw vectors, same order as passages. */
  vectors: Float32Array[] | null
  /** Label of the model the vectors came from. */
  embeddedWith: string | null
  progress: { done: number; ms: number } | null
  busy: boolean
  error: string | null
}

export const corpus = store<Corpus>({
  passages: null,
  publishedDocs: 0,
  vectors: null,
  embeddedWith: null,
  progress: null,
  busy: false,
  error: null,
})

// Small batches: WebGPU kernels fail above about 2,700 tokens per batch.
const TEXT_BATCH = 4

/** Fetch the sample once, then embed it with the loaded text model. */
export async function embedCorpus(
  fetchSample: () => Promise<{ passages: Passage[]; publishedDocs: number }>,
) {
  const state = textEngine.state.get()
  if (state.kind !== "ready" || corpus.get().busy) return
  corpus.set((c) => ({ ...c, busy: true, error: null, vectors: null, progress: { done: 0, ms: 0 } }))
  try {
    let list = corpus.get().passages
    if (!list) {
      const res = await fetchSample()
      list = res.passages
      corpus.set((c) => ({ ...c, passages: res.passages, publishedDocs: res.publishedDocs }))
    }
    const out: Float32Array[] = []
    const t0 = performance.now()
    for (let i = 0; i < list.length; i += TEXT_BATCH) {
      const batch = list.slice(i, i + TEXT_BATCH)
      out.push(...(await textEngine.embedTexts(batch.map((p) => TEXT_DOC(p.title, p.text)))))
      corpus.set((c) => ({ ...c, progress: { done: out.length, ms: performance.now() - t0 } }))
    }
    corpus.set((c) => ({ ...c, vectors: out, embeddedWith: state.spec.label }))
  } catch (err) {
    corpus.set((c) => ({ ...c, error: errorText(err) }))
  } finally {
    corpus.set((c) => ({ ...c, busy: false }))
  }
}

// A new text model makes the old passage vectors meaningless.
textEngine.state.subscribe(() => {
  if (textEngine.state.get().kind === "loading" && corpus.get().vectors)
    corpus.set((c) => ({ ...c, vectors: null, embeddedWith: null, progress: null }))
})

// --- Image library (Images tab) ------------------------------------------------

export interface LabImage {
  imageId: Id<"images">
  url: string
  name: string
  alt: string
  /** Lets production search use this image as the photo, without an upload. */
  storageId: Id<"_storage"> | null
}

export interface Gallery {
  images: LabImage[] | null
  vectors: Float32Array[] | null
  progress: { done: number; total: number; ms: number } | null
  /** Images that could not be fetched or decoded, with the reason. */
  skipped: { name: string; reason: string }[]
  busy: boolean
  error: string | null
}

export const gallery = store<Gallery>({
  images: null,
  vectors: null,
  progress: null,
  skipped: [],
  busy: false,
  error: null,
})

// 280 soft tokens per image: four stay under the WebGPU batch budget.
const IMAGE_BATCH = 4

export async function embedGallery(fetchImages: () => Promise<LabImage[]>) {
  if (!imageEngine.ready || gallery.get().busy) return
  gallery.set((g) => ({ ...g, busy: true, error: null, vectors: null, skipped: [], progress: null }))
  try {
    const all = await fetchImages()
    gallery.set((g) => ({ ...g, progress: { done: 0, total: all.length, ms: 0 } }))
    const kept: LabImage[] = []
    const vectors: Float32Array[] = []
    const skipped: { name: string; reason: string }[] = []
    const t0 = performance.now()
    for (let i = 0; i < all.length; i += IMAGE_BATCH) {
      const batch: { img: LabImage; blob: Blob }[] = []
      for (const img of all.slice(i, i + IMAGE_BATCH)) {
        try {
          const res = await fetch(img.url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          batch.push({ img, blob: await res.blob() })
        } catch (err) {
          skipped.push({ name: img.name, reason: errorText(err) })
        }
      }
      if (batch.length) {
        try {
          vectors.push(...(await imageEngine.embedImages(batch.map((b) => b.blob))))
          kept.push(...batch.map((b) => b.img))
        } catch (err) {
          // One bad file should not stop the rest: retry this batch one by one.
          for (const b of batch) {
            try {
              vectors.push(...(await imageEngine.embedImages([b.blob])))
              kept.push(b.img)
            } catch (e) {
              skipped.push({ name: b.img.name, reason: errorText(e ?? err) })
            }
          }
        }
      }
      gallery.set((g) => ({
        ...g,
        images: kept.slice(),
        skipped: skipped.slice(),
        progress: { done: Math.min(i + IMAGE_BATCH, all.length), total: all.length, ms: performance.now() - t0 },
      }))
    }
    gallery.set((g) => ({ ...g, images: kept, vectors, skipped }))
  } catch (err) {
    gallery.set((g) => ({ ...g, error: errorText(err) }))
  } finally {
    gallery.set((g) => ({ ...g, busy: false }))
  }
}

imageEngine.state.subscribe(() => {
  if (imageEngine.state.get().kind === "loading" && gallery.get().vectors)
    gallery.set((g) => ({ ...g, vectors: null, progress: null }))
})

export const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`
