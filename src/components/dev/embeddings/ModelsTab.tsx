// Models: what is loaded in this tab, the browser cache that holds the model
// files, and how EmbeddingGemma 2 would run on a server later.
import { useCallback, useEffect, useState } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { imageEngine, mb, MODEL_IDS, textEngine, useGpuProbe, useStore, type EngineState } from "./engine"

interface CacheInfo {
  /** Cache Storage buckets that hold transformers.js downloads. */
  caches: { name: string; files: number; bytes: number; models: string[] }[]
  usage: number | null
  quota: number | null
}

async function readCache(): Promise<CacheInfo> {
  const out: CacheInfo = { caches: [], usage: null, quota: null }
  try {
    const est = await navigator.storage?.estimate?.()
    out.usage = est?.usage ?? null
    out.quota = est?.quota ?? null
  } catch {
    // Not available in this browser.
  }
  if (typeof caches === "undefined") return out
  for (const name of await caches.keys()) {
    if (!/transformers/i.test(name)) continue
    const cache = await caches.open(name)
    const keys = await cache.keys()
    let bytes = 0
    const models = new Set<string>()
    for (const req of keys) {
      const m = /huggingface\.co\/([^/]+\/[^/]+)\//.exec(req.url)
      if (m) models.add(m[1])
      const res = await cache.match(req)
      bytes += Number(res?.headers.get("content-length") ?? 0)
    }
    out.caches.push({ name, files: keys.length, bytes, models: [...models] })
  }
  return out
}

function EngineRow({ name, state }: { name: string; state: EngineState }) {
  const spec = state.kind === "idle" ? null : state.spec
  return (
    <TableRow className="align-top text-xs">
      <TableCell className="font-medium">{name}</TableCell>
      <TableCell>
        {state.kind === "idle" && <span className="text-muted-foreground">Not loaded</span>}
        {state.kind === "loading" && <Badge variant="outline">Loading</Badge>}
        {state.kind === "ready" && (
          <Badge className="border-0 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">Loaded</Badge>
        )}
        {state.kind === "error" && <Badge variant="destructive">Failed</Badge>}
      </TableCell>
      <TableCell>
        {spec ? (
          <>
            <div>{spec.label}</div>
            <div className="font-mono text-[11px] text-muted-foreground">{MODEL_IDS[spec.key]}</div>
          </>
        ) : (
          "-"
        )}
      </TableCell>
      <TableCell>{spec ? `${spec.device === "webgpu" ? "GPU (WebGPU)" : "CPU (wasm)"}, ${spec.dtype}` : "-"}</TableCell>
      <TableCell className="tabular-nums">{spec ? `about ${spec.mb} MB` : "-"}</TableCell>
      <TableCell className="tabular-nums">{state.kind === "ready" ? `${(state.loadMs / 1000).toFixed(1)} s` : "-"}</TableCell>
    </TableRow>
  )
}

const SERVER_ROUTES = [
  {
    name: "Ollama",
    status: "Works today",
    text: "ollama pull embeddinggemma-2. The :latest, :740m and :440m tags list Text and Image. Quickest local test outside the browser, on a laptop or a small VM.",
  },
  {
    name: "sentence-transformers",
    status: "Works today",
    text: "Version 6.1 or newer, in bf16 or fp32 (never fp16: the vectors break). A small Python service in a container.",
  },
  {
    name: "llama.cpp",
    status: "Works today",
    text: "GGUF weights with the mmproj file for images.",
  },
  {
    name: "Cloud Run (Google Cloud)",
    status: "Needs a GCP project",
    text: "First choice on Google Cloud: one of the routes above in a container in europe-west4, CPU only and scale to zero; an L4 GPU only if bulk speed matters. Called from a Convex action with a service account.",
  },
  {
    name: "Gemini API",
    status: "Not available",
    text: "Our key lists gemini-embedding-2 and Gemma chat models, but no EmbeddingGemma.",
  },
  {
    name: "Vertex AI Model Garden",
    status: "Coming soon",
    text: "Google's launch post says coming soon; no listing found yet.",
  },
]

export function ModelsTab() {
  const text = useStore(textEngine.state)
  const image = useStore(imageEngine.state)
  const probe = useGpuProbe()
  const [cache, setCache] = useState<CacheInfo | null>(null)
  const [clearing, setClearing] = useState(false)
  const [cacheError, setCacheError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    readCache().then(setCache, (e: unknown) => setCacheError(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(refresh, [refresh, text.kind, image.kind])

  async function clear() {
    setClearing(true)
    try {
      textEngine.unload()
      imageEngine.unload()
      for (const c of cache?.caches ?? []) await caches.delete(c.name)
    } finally {
      setClearing(false)
      refresh()
    }
  }

  const cachedBytes = cache?.caches.reduce((s, c) => s + c.bytes, 0) ?? 0
  const cachedFiles = cache?.caches.reduce((s, c) => s + c.files, 0) ?? 0

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Loaded in this tab</CardTitle>
          <CardDescription className="text-sm">
            Models run in a background worker and stay loaded while you move between tabs. Reloading the page unloads
            them; the files stay in the browser cache.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Used by</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Download</TableHead>
                  <TableHead>Load time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <EngineRow name="Compare and Test set" state={text} />
                <EngineRow name="Images" state={image} />
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            WebGPU in this browser:{" "}
            {probe === null
              ? "checking"
              : probe.adapter
                ? `yes${probe.fallback ? ", software adapter (slow)" : ""}${probe.info ? `, ${probe.info}` : ""}`
                : `not usable (${probe.problem ?? "no WebGPU API"})`}
            . transformers.js 4.3.1 is loaded from jsDelivr; model files come from Hugging Face.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
          <div className="space-y-1.5">
            <CardTitle className="text-sm">Browser cache</CardTitle>
            <CardDescription className="text-sm">
              Downloaded model files are kept so a second load is quick. Clearing frees the space and unloads both
              models.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={clearing || cachedFiles === 0} onClick={() => void clear()}>
            {clearing ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
            Clear the model cache{cachedBytes ? ` (${mb(cachedBytes)})` : ""}
          </Button>
        </CardHeader>
        <CardContent className="space-y-1 text-xs">
          {cacheError && <p className="text-destructive">{cacheError}</p>}
          {!cache ? (
            <p className="text-muted-foreground">Reading the cache</p>
          ) : cache.caches.length === 0 ? (
            <p className="text-muted-foreground">
              Nothing in the transformers.js cache. If a model loaded quickly anyway, the browser served it from its own
              download cache, which this page cannot see or clear: clear it in the browser&apos;s site settings.
            </p>
          ) : (
            cache.caches.map((c) => (
              <p key={c.name}>
                <span className="font-mono">{c.name}</span>: {c.files} files, {mb(c.bytes)}
                {c.models.length ? ` (${c.models.join(", ")})` : ""}
              </p>
            ))
          )}
          {cache?.usage != null && (
            <p className="text-muted-foreground">
              This site uses {mb(cache.usage)} of browser storage in total
              {cache.quota ? ` (allowed: ${mb(cache.quota)})` : ""}.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">EmbeddingGemma 2 in short</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>
              Multimodal: text, images, audio, video and code in one 768-dim space. 740M parameters: text 270M, vision
              170M, audio 300M; each encoder loads on its own. 8K context. Apache 2.0, not gated.
            </li>
            <li>
              Matryoshka: cut to 512, 256 or 128 numbers and re-normalise. Avoid 128 for images.
            </li>
            <li>
              Prefixes: a query is &quot;task: search result | query: ...&quot;, a passage is &quot;title: ... | text:
              ...&quot;, an image gets none.
            </li>
            <li>
              Browser files (onnx-community/embeddinggemma-2-ONNX, q4): text model 175 MB, vision encoder 109 MB,
              tokenizer 32 MB. Batches stay under about 2,700 tokens on WebGPU (280 per image, so four images per call).
            </li>
            <li>
              Not compatible with our stored vectors: same size, different space. Gemma vectors never go into the
              production passage or image indexes.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">On a server, later</CardTitle>
          <CardDescription className="text-sm">How it would run outside the browser, and what is available now.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableBody>
              {SERVER_ROUTES.map((r) => (
                <TableRow key={r.name} className="align-top text-xs">
                  <TableCell className="w-[26%] font-medium">{r.name}</TableCell>
                  <TableCell className="w-[18%]">
                    <Badge variant={r.status === "Works today" ? "secondary" : "outline"}>{r.status}</Badge>
                  </TableCell>
                  <TableCell>{r.text}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
