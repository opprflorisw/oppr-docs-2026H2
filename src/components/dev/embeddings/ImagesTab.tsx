// Images (multimodal): EmbeddingGemma 2 with its vision encoder, in this
// browser on WebGPU. Embeds the image library, then searches it by words and
// by a photo, side by side with the production image search
// (imageSearch.search, gemini-embedding-2). Vectors stay in this tab.
import { useMemo, useRef, useState } from "react"
import { useAction, useConvex, useMutation } from "convex/react"
import { Camera, Cpu, ImageIcon, Loader2, Search, X } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  dot,
  embedGallery,
  errorText,
  gallery,
  imageEngine,
  normalize,
  IMAGE_SPEC,
  TEXT_QUERY,
  useGpuProbe,
  useStore,
  type GpuProbe,
  type LabImage,
} from "./engine"
import { Bar, Choice, ErrorLine, HitList, LoadFailure, LoadRow, Step, type ListHit } from "./LabBits"

// 128 hurts image retrieval a lot (model card), so it is not offered here.
const DIMS = [768, 512, 256] as const

const PRESET_QUERIES = [
  "extruder die head",
  "safety glasses and gloves",
  "coiled plastic pipe",
  "granulaat in een droger",
  "meten van de wanddikte",
]

type Query = { kind: "text"; text: string } | { kind: "photo"; name: string; preview: string; self?: Id<"images"> }

interface ProdHit {
  imageId: Id<"images">
  url: string | null
  altText: string
  description: string | null
  score: number
  matchedBy: "image" | "caption" | "text"
}

const MATCHED_BY: Record<ProdHit["matchedBy"], string> = {
  image: "matched on the image",
  caption: "matched on its description (image not embedded)",
  text: "matched on words only",
}

/** What is wrong when there is no usable WebGPU adapter. */
function NeedsWebGpu({ probe }: { probe: GpuProbe }) {
  return (
    <div role="status" className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <Cpu className="h-4 w-4 text-amber-600" aria-hidden />
        Image search needs WebGPU, and it is not usable in this browser.
      </div>
      <p className="text-xs">
        {probe.api ? (probe.problem ?? "The WebGPU API is there, but no GPU could be used.") : "This browser has no WebGPU API."}
      </p>
      <p className="text-xs text-muted-foreground">
        The vision encoder runs only on the GPU route: its 4-bit and 8-bit files use an operation the CPU (wasm)
        backend does not have. The full-precision files would work on CPU but are about 1.76 GB, too heavy for a
        browser test, so they are not offered. Open this page in desktop Chrome or Edge on a computer with a graphics
        card (chrome://gpu should say WebGPU: Hardware accelerated). Text comparison still works on CPU in the Compare
        tab.
      </p>
    </div>
  )
}

export function ImagesTab() {
  const convex = useConvex()
  const prodSearch = useAction(api.imageSearch.search)
  const uploadUrl = useMutation(api.files.generateUploadUrl)
  const probe = useGpuProbe()
  const state = useStore(imageEngine.state)
  const g = useStore(gallery)
  const ready = state.kind === "ready"

  const [dim, setDim] = useState<(typeof DIMS)[number]>(768)
  // A slow GPU can start with a few images (newest first) instead of all.
  const [count, setCount] = useState<number>(0)
  const [text, setText] = useState(PRESET_QUERIES[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    query: Query
    vec: Float32Array
    gemmaMs: number
    prod: ProdHit[]
    prodMs: number
  } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function fetchImages(): Promise<LabImage[]> {
    const rows = await convex.query(api.images.list, { sort: "newest" })
    // SVG drawings cannot be decoded into pixels in a worker; photos and PNGs can.
    const all = rows.filter((r) => !/svg/i.test(r.contentType))
    const raster = count ? all.slice(0, count) : all
    const urls = await convex.query(api.images.urlsFor, { ids: raster.map((r) => r._id) })
    return raster
      .filter((r) => urls[r._id])
      .map((r) => ({
        imageId: r._id,
        url: urls[r._id] as string,
        name: r.filename,
        alt: r.altText,
        storageId: r.storageId,
      }))
  }

  async function search(query: Query, gemmaVec: () => Promise<Float32Array>, prodArgs: () => Promise<Parameters<typeof prodSearch>[0]>) {
    setBusy(true)
    setError(null)
    try {
      const t0 = performance.now()
      const vec = await gemmaVec()
      const gemmaMs = performance.now() - t0
      const t1 = performance.now()
      const prod = (await prodSearch(await prodArgs())) as ProdHit[]
      setResult({ query, vec, gemmaMs, prod, prodMs: performance.now() - t1 })
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  function searchText() {
    const q = text.trim()
    if (!q) return
    void search(
      { kind: "text", text: q },
      async () => (await imageEngine.embedTexts([TEXT_QUERY(q)]))[0],
      async () => ({ query: q, limit: 12 }),
    )
  }

  function searchLibraryImage(img: LabImage, i: number) {
    const vec = g.vectors?.[i]
    if (!vec || !img.storageId) return
    const storageId = img.storageId
    void search(
      { kind: "photo", name: img.name, preview: img.url, self: img.imageId },
      async () => vec,
      async () => ({ storageId, limit: 13 }),
    )
  }

  async function searchUpload(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith("image/") || /svg/i.test(file.type)) {
      setError("That is not a photo. Use a JPG or PNG.")
      return
    }
    const preview = URL.createObjectURL(file)
    await search(
      { kind: "photo", name: file.name, preview },
      async () => (await imageEngine.embedImages([file]))[0],
      async () => {
        // The same route as the image picker: upload, then search by storage id.
        const res = await fetch(await uploadUrl(), {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        })
        if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status})`)
        const { storageId } = (await res.json()) as { storageId: Id<"_storage"> }
        return { storageId, limit: 12 }
      },
    )
  }

  const ranked = useMemo(() => {
    if (!result || !g.vectors || !g.images) return null
    const q = normalize(result.vec, dim)
    const self = result.query.kind === "photo" ? result.query.self : undefined
    const vectors = g.vectors
    const gemma: ListHit[] = g.images
      .map((img, i) => ({ img, score: dot(q, normalize(vectors[i], dim)) }))
      .filter((x) => x.img.imageId !== self)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(({ img, score }) => ({
        key: String(img.imageId),
        title: img.alt || img.name,
        detail: img.name,
        score,
        thumb: img.url,
      }))
    const prod: ListHit[] = result.prod
      .filter((h) => h.imageId !== self)
      .slice(0, 12)
      .map((h) => ({
        key: String(h.imageId),
        title: h.altText || h.description || "Image",
        detail: h.description,
        score: h.score,
        thumb: h.url,
        note: MATCHED_BY[h.matchedBy],
      }))
    const gemmaKeys = new Set(gemma.map((h) => h.key))
    const both = new Set(prod.filter((h) => gemmaKeys.has(h.key)).map((h) => h.key))
    return { gemma, prod, both }
  }, [result, g.vectors, g.images, dim])

  if (!probe) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card p-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking whether this browser has WebGPU
      </div>
    )
  }

  return (
    <div className="space-y-5 rounded-lg border bg-card p-5 text-sm" data-tour="developer-embeddings-images">
      <p className="text-xs text-muted-foreground">
        EmbeddingGemma 2 puts text and images in one 768-dim space, so words can find photos and a photo can find
        similar photos. This loads the text and vision encoders (about {IMAGE_SPEC.mb} MB at q4, plus a 32 MB
        tokenizer; the audio encoder is skipped) and embeds the image library in this tab. Production image search
        uses gemini-embedding-2; the two spaces are never mixed.
      </p>
      {!probe.adapter ? (
        <NeedsWebGpu probe={probe} />
      ) : (
        <>
          <Step n={1} title="Load EmbeddingGemma 2 with the vision encoder">
            {probe.fallback && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                This browser offers only a software WebGPU adapter{probe.info ? ` (${probe.info})` : ""}. It works, but
                slowly.
              </p>
            )}
            <LoadRow
              state={state}
              onLoad={() => void imageEngine.load(IMAGE_SPEC)}
              label={ready ? "Reload model" : `Load text and vision encoders (about ${IMAGE_SPEC.mb} MB)`}
            />
            {state.kind === "error" && <LoadFailure message={state.message} gated={state.gated} />}
          </Step>

          <Step n={2} title="Embed the image library">
            <Choice
              label="Images"
              value={count}
              onChange={setCount}
              disabled={g.busy}
              options={[
                { value: 4, label: "Newest 4" },
                { value: 16, label: "Newest 16" },
                { value: 0, label: "All" },
              ]}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant="secondary"
                disabled={!ready || g.busy}
                onClick={() => void embedGallery(fetchImages)}
              >
                {g.busy && <Loader2 className="animate-spin" aria-hidden />}
                {g.vectors ? "Embed again" : "Fetch and embed the library"}
              </Button>
              {g.vectors && g.images && (
                <span className="text-xs text-muted-foreground">
                  {g.images.length} images embedded
                  {g.progress ? ` in ${(g.progress.ms / 1000).toFixed(1)} s` : ""}
                  {g.skipped.length ? `, ${g.skipped.length} skipped` : ""}. SVG drawings are left out.
                </span>
              )}
            </div>
            {g.busy && g.progress && (
              <div className="space-y-1">
                <Bar value={g.progress.done / Math.max(1, g.progress.total)} tone="sky" />
                <div className="text-xs text-muted-foreground">
                  {g.progress.done} of {g.progress.total} images · {(g.progress.ms / 1000).toFixed(1)} s · four per batch{g.progress.done === 0 ? ". On a slow or software GPU a batch can take many minutes." : ""}
                </div>
              </div>
            )}
            {g.error && <ErrorLine text={g.error} />}
            {g.skipped.length > 0 && !g.busy && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Skipped images</summary>
                <ul className="mt-1 list-disc pl-5">
                  {g.skipped.map((s) => (
                    <li key={s.name} className="break-all">
                      {s.name}: {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Step>

          <Step n={3} title="Search by words or by a photo">
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                searchText()
              }}
            >
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Describe the picture you need"
                aria-label="Describe the picture"
                className="min-w-[260px] flex-1"
              />
              <Button size="sm" type="submit" disabled={!g.vectors || busy || !text.trim()}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
                Search by words
              </Button>
              <Button
                size="sm"
                type="button"
                variant="outline"
                disabled={!g.vectors || busy}
                onClick={() => fileRef.current?.click()}
              >
                <Camera aria-hidden /> Search by a photo
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                data-testid="lab-photo-input"
                onChange={(e) => {
                  void searchUpload(e.target.files?.[0])
                  e.target.value = ""
                }}
              />
            </form>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_QUERIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setText(q)}
                  className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                >
                  {q}
                </button>
              ))}
            </div>
            {g.vectors && g.images && g.images.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Or use a library image as the photo:</p>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {g.images.map((img, i) => (
                    <button
                      key={img.imageId}
                      type="button"
                      title={img.alt || img.name}
                      aria-label={`Search with ${img.alt || img.name}`}
                      disabled={busy || !img.storageId}
                      onClick={() => searchLibraryImage(img, i)}
                      className={cn(
                        "h-12 w-16 shrink-0 overflow-hidden rounded border bg-muted hover:ring-2 hover:ring-violet-500 disabled:opacity-50",
                        result?.query.kind === "photo" && result.query.self === img.imageId && "ring-2 ring-violet-500",
                      )}
                    >
                      <img src={img.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Choice label="EmbeddingGemma size" value={dim} onChange={setDim} options={DIMS.map((d) => ({ value: d, label: String(d) }))} />
            {!g.vectors && <p className="text-xs text-muted-foreground">Load the model and embed the library first.</p>}
            {error && <ErrorLine text={error} />}
          </Step>

          {result && ranked && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {result.query.kind === "photo" ? (
                  <span className="flex items-center gap-2">
                    <img src={result.query.preview} alt="" className="h-10 w-14 rounded border object-cover" />
                    <span>
                      Photo: <span className="font-medium">{result.query.name}</span>
                      {result.query.self ? " (the image itself is left out of both lists)" : ""}
                    </span>
                  </span>
                ) : (
                  <span>
                    Words: <span className="font-medium">{result.query.text}</span>
                  </span>
                )}
                <Badge variant="secondary">In both top 12: {ranked.both.size}</Badge>
                <Badge variant="outline">EmbeddingGemma {result.gemmaMs.toFixed(0)} ms (in browser)</Badge>
                <Badge variant="outline">Production {result.prodMs.toFixed(0)} ms (Convex and Gemini)</Badge>
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" aria-hidden /> Clear
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <HitList
                  title={`EmbeddingGemma 2, ${dim} dims`}
                  subtitle={
                    result.query.kind === "text"
                      ? "Words to image. Matches score around 0.74, non-matches about 0.46 to 0.51."
                      : "Image to image. Its own scale: near duplicates come close to 1."
                  }
                  hits={ranked.gemma}
                  both={ranked.both}
                  empty="No images."
                />
                <HitList
                  title="gemini-embedding-2 (production)"
                  subtitle="imageSearch.search: vector score (0.3 floor) plus boosts for matching words."
                  hits={ranked.prod}
                  both={ranked.both}
                  empty="Production search found nothing above its floor."
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Highlighted rows appear in both lists. Words-to-image and image-to-image scores live on different
                scales, and both differ from text-to-text scores (about 0.68 to 0.85) on the Compare tab: never use one
                threshold for all of them. The two models&apos; numbers are not comparable; compare the order.
              </p>
            </div>
          )}
        </>
      )}
      {!probe.adapter && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" aria-hidden /> Production image search keeps working everywhere; it runs on
          the server.
        </p>
      )}
    </div>
  )
}
