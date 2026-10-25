// Web Worker for the Embeddings lab. Loads transformers.js from jsDelivr and
// runs EmbeddingGemma off the main thread, so the page stays responsive.
// A fresh worker per load also gives ONNX Runtime a clean slate after a failed
// GPU attempt (in the main thread it stayed broken until a page reload).
//
// Three ways to load:
//   text      EmbeddingGemma 2, text encoder only (vision and audio dropped)
//   vision    EmbeddingGemma 2, text and vision encoders (audio dropped);
//             texts and images land in one 768-dim space
//   v1        the original EmbeddingGemma 300M, text only (the CPU route)

const TRANSFORMERS_URL =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js"

export type LoadMode = "text" | "vision" | "v1"

export type WorkerRequest =
  | { type: "load"; modelId: string; device: "webgpu" | "wasm"; dtype: string; mode: LoadMode }
  | { type: "embedTexts"; reqId: number; texts: string[] }
  | { type: "embedImages"; reqId: number; images: Blob[] }

export type WorkerResponse =
  | { type: "progress"; step: string; file?: string; loaded?: number; total?: number }
  | { type: "loaded" }
  | { type: "loadError"; message: string }
  | { type: "embedded"; reqId: number; vectors: Float32Array[] }
  | { type: "embedError"; reqId: number; message: string }

interface TensorLike {
  tolist(): number[][]
  dispose?: () => void
}
type Inputs = Record<string, unknown>
type Net = (inputs: unknown) => Promise<{ sentence_embedding: TensorLike }>
interface TransformersModule {
  AutoConfig: { from_pretrained(id: string): Promise<Record<string, unknown>> }
  AutoModel: { from_pretrained(id: string, opts: Record<string, unknown>): Promise<Net> }
  AutoTokenizer: {
    from_pretrained(
      id: string,
      opts?: Record<string, unknown>,
    ): Promise<(texts: string[], opts?: Record<string, unknown>) => Promise<Inputs>>
  }
  AutoProcessor: {
    from_pretrained(
      id: string,
      opts?: Record<string, unknown>,
    ): Promise<(text: string[] | null, images?: unknown[][]) => Promise<Inputs>>
  }
  RawImage: { fromBlob(blob: Blob): Promise<unknown> }
}

// The app compiles with the DOM lib, not WebWorker, so type the worker scope by hand.
const scope = self as unknown as {
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  // ONNX Runtime sometimes throws a bare wasm pointer (a number).
  if (typeof err === "number") return `ONNX Runtime error code ${err} (no message; usually a GPU backend failure)`
  return String(err)
}

/** GPU tensors hold device memory until disposed. */
function release(inputs: Inputs, out: TensorLike) {
  out.dispose?.()
  for (const v of Object.values(inputs)) (v as { dispose?: () => void } | null)?.dispose?.()
}

async function run(net: Net, inputs: Inputs): Promise<Float32Array[]> {
  const { sentence_embedding } = await net(inputs)
  const rows = sentence_embedding.tolist().map((r) => Float32Array.from(r))
  release(inputs, sentence_embedding)
  return rows
}

let embedTexts: ((texts: string[]) => Promise<Float32Array[]>) | null = null
let embedImages: ((images: Blob[]) => Promise<Float32Array[]>) | null = null

async function load(req: Extract<WorkerRequest, { type: "load" }>) {
  embedTexts = null
  embedImages = null
  try {
    scope.postMessage({ type: "progress", step: "Loading transformers.js from jsDelivr" })
    const tf = (await import(/* @vite-ignore */ TRANSFORMERS_URL)) as TransformersModule
    const progress_callback = (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === "progress" && p.file && typeof p.total === "number") {
        scope.postMessage({
          type: "progress",
          step: `Downloading ${p.file.split("/").pop()}`,
          file: p.file,
          loaded: p.loaded ?? 0,
          total: p.total,
        })
      }
    }
    scope.postMessage({ type: "progress", step: "Fetching model config" })
    const opts: Record<string, unknown> = { device: req.device, dtype: req.dtype, progress_callback }
    if (req.mode !== "v1") {
      // Selective encoder loading (model card): never the audio encoder, and
      // the vision encoder only when we embed images.
      const config = await tf.AutoConfig.from_pretrained(req.modelId)
      config.audio_config = null
      if (req.mode === "text") config.vision_config = null
      opts.config = config
    }
    const net = await tf.AutoModel.from_pretrained(req.modelId, opts)

    if (req.mode === "vision") {
      scope.postMessage({ type: "progress", step: "Loading the processor" })
      const processor = await tf.AutoProcessor.from_pretrained(req.modelId, { progress_callback })
      embedTexts = async (texts) => run(net, await processor(texts))
      embedImages = async (blobs) => {
        const images = await Promise.all(blobs.map((b) => tf.RawImage.fromBlob(b)))
        // One list per image gives one embedding per image; a flat list
        // would give one combined embedding.
        return run(net, await processor(null, images.map((i) => [i])))
      }
    } else {
      scope.postMessage({ type: "progress", step: "Loading tokenizer" })
      const tokenizer = await tf.AutoTokenizer.from_pretrained(req.modelId, { progress_callback })
      embedTexts = async (texts) =>
        run(net, await tokenizer(texts, { padding: true, truncation: true, max_length: 640 }))
    }
    scope.postMessage({ type: "progress", step: "Warming up" })
    await embedTexts(["task: search result | query: warm up"])
    scope.postMessage({ type: "loaded" })
  } catch (err) {
    embedTexts = null
    embedImages = null
    scope.postMessage({ type: "loadError", message: errorText(err) })
  }
}

function reply(reqId: number, work: Promise<Float32Array[]>) {
  work.then(
    (vectors) =>
      scope.postMessage(
        { type: "embedded", reqId, vectors },
        vectors.map((v) => v.buffer),
      ),
    (err) => scope.postMessage({ type: "embedError", reqId, message: errorText(err) }),
  )
}

scope.onmessage = (e) => {
  const req = e.data
  if (req.type === "load") {
    void load(req)
    return
  }
  if (req.type === "embedTexts") {
    if (!embedTexts) scope.postMessage({ type: "embedError", reqId: req.reqId, message: "Model is not loaded" })
    else reply(req.reqId, embedTexts(req.texts))
    return
  }
  if (!embedImages)
    scope.postMessage({
      type: "embedError",
      reqId: req.reqId,
      message: "This model was loaded without the vision encoder",
    })
  else reply(req.reqId, embedImages(req.images))
}
