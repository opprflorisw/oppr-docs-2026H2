// CONTRACT (owned by the images lane): the one dialog for picking an image
// from the library, used by the document editor, the cover settings, the
// Training builder and the guided writer. Props stay stable.
//
// Tabs: Suggested (for the step text, Assets and areas it was opened with),
// Recent, Favorites, Upload and Create (a few guided questions, then the
// image model draws it). The search bar on top takes words or a photo
// and searches the whole library (convex/imageSearch.ts). Picking an image
// records the use (lastUsedAt/useCount), which feeds Recent.
import { useEffect, useMemo, useRef, useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { Camera, Clock, Image as ImageIcon, Link as LinkIcon, Loader2, Search, Sparkles, Star, Upload, Wand2, X } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { ImageTile } from "./ImageTile"
import { matchReason, useImageSearch, type ImageHit } from "./useImageSearch"
import { CreateImageDialog } from "@/components/guided/CreateImageDialog"
import { ACCEPTED_IMAGE_TYPES, altFromFilename, checkImageFile, uploadImageFile } from "./uploadImage"

export type PickedImage = { imageId: Id<"images">; url: string | null; altText: string }

export type ImagePickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (image: PickedImage) => void
  /** Start with this search, e.g. the step text the image is for. */
  initialQuery?: string
  /** Narrow suggestions to these areas or Assets. */
  areaCodes?: string[]
  assetIds?: Id<"assets">[]
  title?: string
  /** Quick answers for "Where" on the Create tab. */
  whereSuggestions?: string[]
}

type Tab = "suggested" | "recent" | "favorites" | "upload" | "create"
type Candidate = {
  imageId: Id<"images">
  url: string | null
  altText: string
  description?: string | null
  tags?: string[]
  matchedBy?: ImageHit["matchedBy"]
  score?: number
  favorite?: boolean
}

export function ImagePickerDialog(props: ImagePickerDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-3 overflow-hidden p-4 sm:p-6">
        {props.open && <PickerBody {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function PickerBody({ onOpenChange, onPick, initialQuery, areaCodes, assetIds, title, whereSuggestions }: ImagePickerDialogProps) {
  const hasContext = Boolean(initialQuery?.trim() || areaCodes?.length || assetIds?.length)
  const [tab, setTab] = useState<Tab>("suggested")
  const [picked, setPicked] = useState<Candidate | null>(null)
  const markUsed = useMutation(api.images.markUsed)
  const search = useImageSearch({ limit: 24, areaCodes, assetIds })
  const photoInput = useRef<HTMLInputElement>(null)

  function insert(c: Candidate | null) {
    if (!c) return
    void markUsed({ id: c.imageId }).catch(() => undefined)
    onPick({ imageId: c.imageId, url: c.url, altText: c.altText })
    onOpenChange(false)
  }

  async function onPhoto(file: File | null | undefined) {
    if (!file) return
    try {
      await search.searchByPhoto(file)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not search by this photo")
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title ?? "Insert an image"}</DialogTitle>
        <DialogDescription>
          Reuse a picture from the library, upload a new one, or create one. Search by words or by a photo.
        </DialogDescription>
      </DialogHeader>

      <div
        className="flex items-center gap-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          void onPhoto(e.dataTransfer.files?.[0])
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={search.text}
            onChange={(e) => search.setText(e.target.value)}
            placeholder="Search the library, e.g. torque wrench on the die head"
            className="pl-8 pr-8"
            aria-label="Search images by words"
          />
          {(search.text || search.photo) && (
            <button
              type="button"
              onClick={search.clear}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => photoInput.current?.click()}
          title="Search with a photo: find pictures that look like it"
        >
          <Camera className="mr-1.5 h-4 w-4" />
          <span className="hidden sm:inline">By photo</span>
        </Button>
        <input
          ref={photoInput}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          className="hidden"
          onChange={(e) => {
            void onPhoto(e.target.files?.[0])
            e.target.value = ""
          }}
        />
      </div>

      {search.photo && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
          <img src={search.photo.previewUrl} alt="" className="h-8 w-8 rounded object-cover" />
          <span className="flex-1">Showing pictures that look like this photo{search.text.trim() ? " and match your words" : ""}.</span>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={search.clearPhoto}>
            Remove photo
          </Button>
        </div>
      )}

      {search.active ? (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <ResultGrid
            loading={search.loading && search.hits.length === 0}
            items={search.hits}
            query={search.text}
            byPhoto={search.photo !== null}
            picked={picked}
            onPick={setPicked}
            onInsert={insert}
            empty={search.error ?? "Nothing in the library matches. Try other words, or add the picture on the Upload tab."}
          />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
            <TabsTrigger value="suggested" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Suggested
            </TabsTrigger>
            <TabsTrigger value="recent" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Recent
            </TabsTrigger>
            <TabsTrigger value="favorites" className="gap-1.5">
              <Star className="h-3.5 w-3.5" /> Favorites
            </TabsTrigger>
            <TabsTrigger value="upload" className="gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Upload
            </TabsTrigger>
            <TabsTrigger value="create" className="gap-1.5">
              <Wand2 className="h-3.5 w-3.5" /> Create
            </TabsTrigger>
          </TabsList>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            {tab === "suggested" && (
              <SuggestedTab
                initialQuery={initialQuery}
                areaCodes={areaCodes}
                assetIds={assetIds}
                hasContext={hasContext}
                picked={picked}
                onPick={setPicked}
                onInsert={insert}
              />
            )}
            {tab === "recent" && <RecentTab picked={picked} onPick={setPicked} onInsert={insert} />}
            {tab === "favorites" && <FavoritesTab picked={picked} onPick={setPicked} onInsert={insert} />}
            {tab === "upload" && (
              <UploadTab assetIds={assetIds} areaCodes={areaCodes} onUploaded={(c) => insert(c)} />
            )}
            {tab === "create" && (
              <CreateTab
                initialWhat={initialQuery}
                whereSuggestions={whereSuggestions}
                areaCodes={areaCodes}
                assetIds={assetIds}
                onCreated={(c) => insert(c)}
              />
            )}
          </div>
        </Tabs>
      )}

      {(tab !== "upload" && tab !== "create") || search.active ? (
        <DialogFooter className="flex-row items-center gap-3 border-t pt-3 sm:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
            {picked ? (
              <>
                {picked.url && <img src={picked.url} alt="" className="h-9 w-12 shrink-0 rounded object-cover" />}
                <span className="line-clamp-2">{picked.altText || "No caption yet"}</span>
              </>
            ) : (
              <span>Pick a picture. Double-click inserts it straight away.</span>
            )}
          </div>
          <Button onClick={() => insert(picked)} disabled={!picked}>
            Insert image
          </Button>
        </DialogFooter>
      ) : null}
    </>
  )
}

function ResultGrid({
  loading,
  items,
  picked,
  onPick,
  onInsert,
  empty,
  showMatch = true,
  query,
  byPhoto,
}: {
  loading: boolean
  items: Candidate[] | undefined
  query?: string
  byPhoto?: boolean
  picked: Candidate | null
  onPick: (c: Candidate) => void
  onInsert: (c: Candidate) => void
  empty: string
  showMatch?: boolean
}) {
  if (loading || items === undefined) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/3] w-full" />
        ))}
      </div>
    )
  }
  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{empty}</p>
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {items.map((c, i) => {
        const reason = showMatch ? matchReason(c, { query, byPhoto }) : null
        return (
          <ImageTile
            key={c.imageId}
            url={c.url}
            eager={i < 8}
            altText={c.altText}
            favorite={c.favorite}
            selected={picked?.imageId === c.imageId}
            caption={c.altText || c.description || "No caption yet"}
            bottomRight={
              reason ? (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]" title={reason.title}>
                  {reason.label}
                </Badge>
              ) : undefined
            }
            onClick={() => onPick(c)}
            onDoubleClick={() => onInsert(c)}
          />
        )
      })}
    </div>
  )
}

function SuggestedTab({
  initialQuery,
  areaCodes,
  assetIds,
  hasContext,
  ...grid
}: {
  initialQuery?: string
  areaCodes?: string[]
  assetIds?: Id<"assets">[]
  hasContext: boolean
  picked: Candidate | null
  onPick: (c: Candidate) => void
  onInsert: (c: Candidate) => void
}) {
  const searchAction = useAction(api.imageSearch.search)
  const [items, setItems] = useState<Candidate[] | undefined>(undefined)
  const key = JSON.stringify([initialQuery?.trim() ?? "", areaCodes ?? [], assetIds ?? []])

  useEffect(() => {
    let live = true
    const [query, areas, assets] = JSON.parse(key) as [string, string[], Id<"assets">[]]
    setItems(undefined)
    searchAction({
      ...(query ? { query: query.slice(0, 300) } : {}),
      limit: 16,
      ...(areas.length ? { areaCodes: areas } : {}),
      ...(assets.length ? { assetIds: assets } : {}),
    })
      .then((r) => live && setItems(r))
      .catch(() => live && setItems([]))
    return () => {
      live = false
    }
  }, [key, searchAction])

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {hasContext
          ? initialQuery?.trim()
            ? `For "${truncate(initialQuery.trim(), 80)}"${assetIds?.length || areaCodes?.length ? " and the linked Assets" : ""}.`
            : "For the Assets and areas of this Document, then the ones used most recently."
          : "Used most recently in the library."}
      </p>
      <ResultGrid
        loading={false}
        items={items}
        query={initialQuery}
        empty="No suggestions yet. Search above, or add a picture on the Upload tab."
        {...grid}
      />
    </div>
  )
}

function RecentTab(grid: { picked: Candidate | null; onPick: (c: Candidate) => void; onInsert: (c: Candidate) => void }) {
  const rows = useQuery(api.images.recent, { limit: 24 })
  return (
    <ResultGrid
      loading={false}
      items={rows}
      showMatch={false}
      empty="Nothing inserted yet. Pictures you insert show up here."
      {...grid}
    />
  )
}

function FavoritesTab(grid: { picked: Candidate | null; onPick: (c: Candidate) => void; onInsert: (c: Candidate) => void }) {
  const rows = useQuery(api.images.favorites, {})
  return (
    <ResultGrid
      loading={false}
      items={rows}
      showMatch={false}
      empty="No favorites yet. Star pictures in the image library to keep them at hand."
      {...grid}
    />
  )
}

// Extensions whose MIME type is not simply image/<ext>.
const URL_CONTENT_TYPES: Record<string, string> = {
  svg: "image/svg+xml",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
}

function UploadTab({
  assetIds,
  areaCodes,
  onUploaded,
}: {
  assetIds?: Id<"assets">[]
  areaCodes?: string[]
  onUploaded: (c: Candidate) => void
}) {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const createFromUpload = useMutation(api.images.createFromUpload)
  const createFromUrl = useMutation(api.images.createFromUrl)
  const [file, setFile] = useState<File | null>(null)
  const [alt, setAlt] = useState("")
  const [busy, setBusy] = useState(false)
  const [showUrl, setShowUrl] = useState(false)
  const [url, setUrl] = useState("")
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  function choose(f: File | null | undefined) {
    if (!f) return
    const problem = checkImageFile(f)
    if (problem) {
      toast.error(problem)
      return
    }
    setFile(f)
    setAlt(altFromFilename(f.name))
  }

  async function addFile() {
    if (!file) return
    setBusy(true)
    try {
      const r = await uploadImageFile(file, { generateUploadUrl, createFromUpload }, { altText: alt, assetIds, areaCodes })
      toast.success(r.deduped ? "This picture was already in the library, so it is reused." : "Added to the library.")
      onUploaded({ imageId: r.id, url: r.url, altText: r.altText })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setBusy(false)
    }
  }

  async function addUrl() {
    const href = url.trim()
    if (!/^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)([?#]\S*)?$/i.test(href)) {
      toast.error("Use a web address that ends in .png, .jpg, .gif, .webp or .svg")
      return
    }
    setBusy(true)
    try {
      const filename = href.split(/[?#]/)[0].split("/").pop() || "image"
      const ext = filename.split(".").pop()?.toLowerCase() ?? ""
      const contentType = URL_CONTENT_TYPES[ext] ?? `image/${ext}`
      const altText = alt.trim() || altFromFilename(filename)
      const r = await createFromUrl({ externalUrl: href, filename, contentType, altText })
      onUploaded({ imageId: r.id, url: r.url, altText })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the link")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          choose(e.dataTransfer.files?.[0])
        }}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-md border-2 border-dashed p-6 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "bg-muted/20 hover:bg-muted/40",
        )}
      >
        {preview ? (
          <img src={preview} alt="" className="max-h-40 rounded object-contain" />
        ) : (
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">{file ? file.name : "Drop a picture here, or click to choose one"}</span>
        <span className="text-xs text-muted-foreground">PNG, JPEG, GIF or WebP, up to 10 MB</span>
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        onChange={(e) => {
          choose(e.target.files?.[0])
          e.target.value = ""
        }}
      />
      <div className="space-y-1.5">
        <label htmlFor="picker-alt" className="text-xs font-medium">
          What does it show?
        </label>
        <Input
          id="picker-alt"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          placeholder="e.g. Mixer lid open, seen from the platform"
          disabled={busy}
        />
        <p className="text-xs text-muted-foreground">
          The AI adds a description and tags after upload, so the picture is easy to find next time.
          {assetIds?.length ? " It is linked to this Document's Assets." : ""}
        </p>
      </div>

      {showUrl ? (
        <div className="space-y-1.5 rounded-md border p-3">
          <label htmlFor="picker-url" className="text-xs font-medium">
            Web address of the picture
          </label>
          <div className="flex gap-2">
            <Input id="picker-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." disabled={busy} />
            <Button variant="outline" onClick={addUrl} disabled={!url.trim() || busy}>
              Add link
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Links can break later. Uploading keeps the picture safe in the library.</p>
        </div>
      ) : (
        <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowUrl(true)}>
          <LinkIcon className="h-3 w-3" /> Use a web address instead
        </button>
      )}

      <div className="flex justify-end border-t pt-3">
        <Button onClick={addFile} disabled={!file || busy}>
          {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Add and insert
        </Button>
      </div>
    </div>
  )
}

function CreateTab({
  initialWhat,
  whereSuggestions,
  areaCodes,
  assetIds,
  onCreated,
}: {
  initialWhat?: string
  whereSuggestions?: string[]
  areaCodes?: string[]
  assetIds?: Id<"assets">[]
  onCreated: (c: Candidate) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border-2 border-dashed bg-muted/20 p-8 text-center">
      <Wand2 className="h-6 w-6 text-primary" />
      <div className="space-y-1">
        <p className="text-sm font-medium">No picture that fits? Create one.</p>
        <p className="mx-auto max-w-md text-xs text-muted-foreground">
          Answer five short questions: what, where, viewpoint, style and safety marks. The image model draws it, and the
          result is kept in the library so it can be reused.
        </p>
      </div>
      <Button onClick={() => setOpen(true)}>
        <Wand2 className="mr-1.5 h-4 w-4" /> Start
      </Button>
      <CreateImageDialog
        open={open}
        onOpenChange={setOpen}
        initial={initialWhat?.trim() ? { what: initialWhat.trim() } : undefined}
        whereSuggestions={whereSuggestions}
        areaCodes={areaCodes}
        assetIds={assetIds}
        onInsert={(img) => onCreated({ imageId: img.imageId, url: img.url, altText: img.altText })}
      />
    </div>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}...` : s
}
