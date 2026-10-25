// "Find images and passages": one search box inside the document editor and
// the Training builder. Type words or drop a photo; the image library
// (imageSearch.search, multimodal) and Published passages (the chunk vector
// index) answer side by side, and each result goes in with one click.
import { useEffect, useRef, useState, type DragEvent } from "react"
import { useAction, useMutation } from "convex/react"
import { Camera, ExternalLink, ImagePlus, Loader2, Plus, Search, X } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import type { FoundPassage } from "../../../convex/ai/guidedChat"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { PickedImage } from "@/components/images/ImagePickerDialog"
import { matchReason, useImageSearch } from "@/components/images/useImageSearch"
import { guidedErrorText } from "@/components/guided/GuidedCreation"

export type { FoundPassage }

const PASSAGE_MATCH: Record<string, string> = {
  image: "matches the photo",
  text: "matches the meaning",
  words: "same words",
}

interface Passages {
  passages: FoundPassage[]
  note: string | null
}

export function KnowledgeSearchPanel({
  onInsertImage,
  onInsertPassage,
  passageActionLabel = "Insert",
  imageActionLabel = "Insert",
  imageHint,
  areaCodes,
  assetIds,
  onClose,
  className,
}: {
  /** Leave out where images cannot be placed; results then only open. */
  onInsertImage?: (image: PickedImage) => void
  onInsertPassage?: (passage: FoundPassage) => void
  passageActionLabel?: string
  imageActionLabel?: string
  /** Shown above the images when they cannot be inserted here. */
  imageHint?: string
  areaCodes?: string[]
  assetIds?: Id<"assets">[]
  onClose?: () => void
  className?: string
}) {
  // Images: the library's own search hook (words and/or a photo, debounced).
  const img = useImageSearch({ limit: 12, areaCodes, assetIds })
  const findPassages = useAction(api.ai.guidedChat.findPassages)
  const markUsed = useMutation(api.images.markUsed)
  const [photoName, setPhotoName] = useState("")
  const [uploading, setUploading] = useState(false)
  const [passBusy, setPassBusy] = useState(false)
  const [passError, setPassError] = useState<string | null>(null)
  const [found, setFound] = useState<Passages | null>(null)
  const [dragging, setDragging] = useState(false)
  const runRef = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const query = img.text
  const storageId = img.photo?.storageId ?? null

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Published passages for the same words or photo, after a short pause.
  useEffect(() => {
    const words = query.trim()
    if (!img.active) {
      setFound(null)
      setPassBusy(false)
      return
    }
    const turn = ++runRef.current
    setPassBusy(true)
    const t = setTimeout(() => {
      findPassages({ ...(words ? { query: words } : {}), ...(storageId ? { storageId } : {}), limit: 8 })
        .then((r) => {
          if (turn !== runRef.current) return
          setFound({ passages: r.passages, note: r.note })
          setPassError(null)
        })
        .catch((e: unknown) => {
          if (turn !== runRef.current) return
          setFound(null)
          setPassError(guidedErrorText(e, "Passages could not be searched right now."))
        })
        .finally(() => {
          if (turn === runRef.current) setPassBusy(false)
        })
    }, 450)
    return () => clearTimeout(t)
  }, [query, storageId, img.active, findPassages])

  async function addPhoto(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error("That is not a photo. Use a JPG or PNG.")
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error("The photo is too large. Use one under 12 MB.")
      return
    }
    setUploading(true)
    try {
      await img.searchByPhoto(file)
      setPhotoName(file.name)
    } catch {
      toast.error("The photo could not be added. Try again.")
    } finally {
      setUploading(false)
    }
  }

  function insertImage(image: PickedImage) {
    void markUsed({ id: image.imageId }).catch(() => undefined)
    onInsertImage?.(image)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void addPhoto(e.dataTransfer.files?.[0])
  }

  const busy = img.loading || passBusy
  // Only an error when both halves failed; one failing half shows as a note.
  const error = img.error && passError ? passError : null
  const results = img.active
    ? { images: img.hits, passages: found?.passages ?? [], note: found?.note ?? (img.error ? null : passError) }
    : null

  const empty = results && results.images.length === 0 && results.passages.length === 0

  return (
    <section
      className={cn("relative flex min-h-0 flex-col bg-background", className)}
      aria-label="Find images and passages"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <Search className="h-4 w-4 text-primary" />
        <h2 className="flex-1 text-sm font-semibold">Find images and passages</h2>
        {onClose && (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} aria-label="Close search">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="space-y-2 border-b p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => img.setText(e.target.value)}
              placeholder="Type words, or drop a photo"
              className="h-9 pl-8"
              aria-label="Search words"
            />
          </div>
          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9 shrink-0"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Search by photo"
            title="Search by photo"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void addPhoto(e.target.files?.[0])
              e.target.value = ""
            }}
          />
        </div>
        {img.photo && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-1.5">
            <img src={img.photo.previewUrl} alt="" className="h-10 w-10 rounded object-cover" />
            <span className="min-w-0 flex-1 truncate text-xs">Searching with {photoName || "your photo"}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={img.clearPhoto} aria-label="Remove photo">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3" aria-live="polite" aria-busy={busy}>
        {busy && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching images and Published passages…
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        {!results && !busy && !error && (
          <div className="space-y-2 rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            <Camera className="mx-auto h-5 w-5" />
            <p>Search the image library and Published Documents at once.</p>
            <p>Words and photos both work: a photo of a machine finds its pictures and the passages about it.</p>
          </div>
        )}
        {empty && !busy && (
          <p className="text-xs text-muted-foreground">Nothing found. Try other words, or a photo.</p>
        )}

        {results && results.images.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Images ({results.images.length})
            </h3>
            {imageHint && !onInsertImage && <p className="text-xs text-muted-foreground">{imageHint}</p>}
            <div className="grid grid-cols-2 gap-2">
              {results.images.map((h) => {
                const reason = matchReason(h, { query, byPhoto: storageId !== null })
                return (
                <figure key={h.imageId} className="group overflow-hidden rounded-md border bg-muted/20">
                  <div className="relative aspect-[4/3] bg-muted">
                    {h.url && (
                      <img src={h.url} alt={h.altText} loading="lazy" className="h-full w-full object-cover" />
                    )}
                    {onInsertImage && (
                      <button
                        type="button"
                        onClick={() => insertImage({ imageId: h.imageId, url: h.url, altText: h.altText })}
                        className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100 focus-visible:bg-black/45 focus-visible:opacity-100"
                        aria-label={`${imageActionLabel}: ${h.altText}`}
                      >
                        <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium">
                          <ImagePlus className="h-3.5 w-3.5" /> {imageActionLabel}
                        </span>
                      </button>
                    )}
                  </div>
                  <figcaption className="space-y-0.5 p-1.5">
                    <p className="line-clamp-2 text-xs">{h.altText || h.description || "Untitled image"}</p>
                    {reason && (
                      <p className="text-[11px] text-muted-foreground" title={reason.title}>
                        {reason.label}
                      </p>
                    )}
                  </figcaption>
                </figure>
                )
              })}
            </div>
          </div>
        )}

        {results && results.passages.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Published passages ({results.passages.length})
            </h3>
            {results.passages.map((p) => (
              <article key={p.chunkId} className="space-y-1.5 rounded-md border p-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 text-xs">
                    <span className="font-mono font-medium">{p.namingCode}</span>{" "}
                    <span className="text-muted-foreground">
                      {p.title}
                      {p.section ? ` · ${p.section}` : ""}
                    </span>
                  </div>
                  <a
                    href={`/docs/${p.documentId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Open ${p.namingCode} in a new tab`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                <p className="line-clamp-4 text-sm">{p.text}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">{PASSAGE_MATCH[p.matchedBy] ?? p.matchedBy}</span>
                  {onInsertPassage && (
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => onInsertPassage(p)}>
                      <Plus className="h-3 w-3" /> {passageActionLabel}
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        {results?.note && <p className="text-xs text-muted-foreground">{results.note}</p>}
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-primary bg-primary/10 text-sm font-medium text-primary">
          Drop the photo to search with it
        </div>
      )}
    </section>
  )
}

/** Right padding a page adds while the dock is open (wide screens). */
export const KNOWLEDGE_DOCK_PAD = "xl:pr-[400px]"

/** The panel as a fixed side panel on the right of a page. */
export function KnowledgeSearchDock({
  open,
  ...props
}: Parameters<typeof KnowledgeSearchPanel>[0] & { open: boolean }) {
  if (!open) return null
  return (
    // The page reserves this width (KNOWLEDGE_DOCK_PAD), so the panel sits
    // next to the header and the editor instead of over them.
    <div className="fixed bottom-0 right-0 top-12 z-30 flex w-full max-w-[400px] xl:top-0 flex-col border-l bg-background shadow-xl">
      <KnowledgeSearchPanel {...props} className={cn("min-h-0 flex-1", props.className)} />
    </div>
  )
}
