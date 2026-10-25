// Web Worker for the Embedding lab (EmbeddingGemmaLab.tsx). Loads
// transformers.js from jsDelivr and runs EmbeddingGemma off the main thread,
// so the page stays responsive during the few minutes a CPU run takes.
// A fresh worker per load also gives ONNX Runtime a clean slate after a failed
// GPU attempt (in the main thread it stayed broken until a page reload).

const TRANSFORMERS_URL =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js"

export type WorkerRequest =
  | { type: "load"; modelId: string; device: "webgpu" | "wasm"; dtype: string; textOnly: boolean }
  | { type: "embed"; reqId: number; texts: string[] }

export type WorkerResponse =
  | { type: "progress"; step: string; file?: string; loaded?: number; total?: number }
  | { type: "loaded" }
  | { type: "loadError"; message: string }
  | { type: "embedded"; reqId: number; vectors: Float32Array[] }
  | { type: "embedError"; reqId: number; message: string }

interface TensorLike {
  tolist(): number[][]
}
interface TransformersModule {
  AutoConfig: { from_pretrained(id: string): Promise<Record<string, unknown>> }
  AutoModel: {
    from_pretrained(
      id: string,
      opts: Record<string, unknown>,
    ): Promise<(inputs: unknown) => Promise<{ sentence_embedding: TensorLike }>>
  }
  AutoTokenizer: {
    from_pretrained(
      id: string,
      opts?: Record<string, unknown>,
    ): Promise<(texts: string[], opts?: Record<string, unknown>) => Promise<unknown>>
  }
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

let embed: ((texts: string[]) => Promise<Float32Array[]>) | null = null

async function load(req: Extract<WorkerRequest, { type: "load" }>) {
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
    if (req.textOnly) {
      // Drop the vision and audio encoders (model card, "Selective Encoder
      // Loading"), so v2 downloads about 175 MB instead of 473 MB.
      const config = await tf.AutoConfig.from_pretrained(req.modelId)
      config.vision_config = null
      config.audio_config = null
      opts.config = config
    }
    const net = await tf.AutoModel.from_pretrained(req.modelId, opts)
    scope.postMessage({ type: "progress", step: "Loading tokenizer" })
    const tokenizer = await tf.AutoTokenizer.from_pretrained(req.modelId, { progress_callback })
    embed = async (texts: string[]) => {
      const inputs = await tokenizer(texts, { padding: true, truncation: true, max_length: 640 })
      const { sentence_embedding } = await net(inputs)
      return sentence_embedding.tolist().map((row) => Float32Array.from(row))
    }
    scope.postMessage({ type: "progress", step: "Warming up" })
    await embed(["task: search result | query: warm up"])
    scope.postMessage({ type: "loaded" })
  } catch (err) {
    embed = null
    scope.postMessage({ type: "loadError", message: errorText(err) })
  }
}

scope.onmessage = (e) => {
  const req = e.data
  if (req.type === "load") {
    void load(req)
    return
  }
  const run = embed
  if (!run) {
    scope.postMessage({ type: "embedError", reqId: req.reqId, message: "Model is not loaded" })
    return
  }
  run(req.texts).then(
    (vectors) =>
      scope.postMessage(
        { type: "embedded", reqId: req.reqId, vectors },
        vectors.map((v) => v.buffer),
      ),
    (err) => scope.postMessage({ type: "embedError", reqId: req.reqId, message: errorText(err) }),
  )
}
