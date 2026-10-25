// The image library: every picture the plant can reuse in Documents and
// Trainings. Find by words or by a photo (multimodal search), filter by kind,
// tag, collection, area or Asset, see where each one is used, and tidy up in
// bulk. Uploads (drag and drop anywhere) get an AI description and tags so
// nobody has to think of them. Editing needs a checked-in Engineer or Admin.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link } from "wouter"
import { useAction, useMutation, useQuery } from "convex/react"
import {
  Camera,
  Clock,
  Copy,
  FolderPlus,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Loader2,
  MapPin,
  Search,
  Shapes,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import type { FunctionReturnType } from "convex/server"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { DocumentsTabs } from "@/components/docs/DocumentsTabs"
import { StatusBadge } from "@/components/docs/StatusBadge"
import { ImageTile } from "@/components/images/ImageTile"
import { KIND_LABEL } from "@/components/images/labels"
import { ImageDetailSheet } from "@/components/images/ImageDetailSheet"
import { matchReason, useImageSearch, type ImageHit } from "@/components/images/useImageSearch"
import { ACCEPTED_IMAGE_TYPES, uploadImageFile } from "@/components/images/uploadImage"
import { useCheckIn } from "@/lib/checkIn"
import { formatDate } from "@/lib/time"
import { cn } from "@/lib/utils"
import type { DocumentStatus } from "@/types"

type Row = FunctionReturnType<typeof api.images.list>[number]
type Facets = FunctionReturnType<typeof api.images.facets>
type Kind = "photo" | "illustration" | "diagram" | "safety" | "generated"
type Show = "all" | "favorites" | "recent" | "unused" | "duplicates" | "undescribed"
type Sort = "newest" | "recentlyUsed" | "mostUsed" | "name"
const KINDS: Kind[] = ["photo", "illustration", "diagram", "safety", "generated"]

const SHOW_LABEL: Record<Show, string> = {
  all: "All images",
  favorites: "Favorites",
  recent: "Recently used",
  unused: "Not used in a Document",
  duplicates: "Possible duplicates",
  undescribed: "Without a description",
}

// ---- Cascading filters ----------------------------------------------------------------
// The rail reads top to bottom: Show, Kind, Collections, Areas, Assets, Tags. Each
// level's counts are the images that match the search plus every selection in the
// levels above it, so picking a collection updates the Areas, Assets and Tags below.
// The grid applies all levels with the same predicate, so the numbers always add up.

type Level = "show" | "kind" | "collection" | "area" | "asset" | "tag"
const LEVELS: Level[] = ["show", "kind", "collection", "area", "asset", "tag"]
const LEVEL_LABEL: Record<Level, string> = {
  show: "Show",
  kind: "Kind",
  collection: "Collection",
  area: "Area",
  asset: "Asset",
  tag: "Tag",
}

type Selection = {
  show: Show
  kind: Kind | null
  collectionId: Id<"imageCollections"> | null
  areaCode: string | null
  assetId: Id<"assets"> | null
  tag: string | null
}

type Cascade = {
  /** Images matching the search text or photo (all images when no search). */
  base: number
  show: Partial<Record<Show, number>>
  kinds: Map<string, number>
  collections: Map<string, number>
  areas: Map<string, number>
  assets: Map<string, number>
  tags: Map<string, number>
  visible: Row[] | undefined
  /** The highest selected level that took the result to zero, if any. */
  culprit: Level | null
}

function showMatches(r: Row, s: Show, dupeIds: Set<string> | null): boolean {
  switch (s) {
    case "all":
      return true
    case "favorites":
      return Boolean(r.favorite)
    case "recent":
      return Boolean(r.lastUsedAt)
    case "unused":
      return r.usageCount === 0
    case "duplicates":
      return dupeIds?.has(r._id) ?? false
    case "undescribed":
      return !r.description
  }
}

function levelMatches(r: Row, level: Level, sel: Selection, dupeIds: Set<string> | null): boolean {
  switch (level) {
    case "show":
      return showMatches(r, sel.show, dupeIds)
    case "kind":
      return !sel.kind || r.kind === sel.kind
    case "collection":
      return !sel.collectionId || (r.collectionIds ?? []).includes(sel.collectionId)
    case "area":
      return !sel.areaCode || (r.areaCodes ?? []).includes(sel.areaCode)
    case "asset":
      return !sel.assetId || (r.assetIds ?? []).includes(sel.assetId)
    case "tag":
      return !sel.tag || (r.tags ?? []).includes(sel.tag)
  }
}

function isSelected(level: Level, sel: Selection): boolean {
  const on: Record<Level, boolean> = {
    show: sel.show !== "all",
    kind: sel.kind !== null,
    collection: sel.collectionId !== null,
    area: sel.areaCode !== null,
    asset: sel.assetId !== null,
    tag: sel.tag !== null,
  }
  return on[level]
}

function tally(rows: Row[], keysOf: (r: Row) => readonly string[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) for (const k of new Set(keysOf(r))) out.set(k, (out.get(k) ?? 0) + 1)
  return out
}

function computeCascade(
  rows: Row[],
  sel: Selection,
  search: { active: boolean; hits: ImageHit[] },
  dupes: { a: Id<"images">; b: Id<"images"> }[] | null,
): Cascade {
  const byId = new Map(rows.map((r) => [r._id, r]))
  // A word or photo search narrows to its hit set, best match first.
  const base = search.active ? search.hits.map((h) => byId.get(h.imageId)).filter((r): r is Row => Boolean(r)) : rows
  const dupeIds = dupes ? new Set<string>(dupes.flatMap((d) => [d.a, d.b])) : null
  // stages[i] = images matching the search and every level above level i.
  const stages: Row[][] = [base]
  for (const level of LEVELS) stages.push(stages[stages.length - 1].filter((r) => levelMatches(r, level, sel, dupeIds)))

  const show: Partial<Record<Show, number>> = {}
  for (const s of Object.keys(SHOW_LABEL) as Show[]) {
    if (s === "duplicates" && !dupeIds) continue
    show[s] = base.filter((r) => showMatches(r, s, dupeIds)).length
  }

  let visible: Row[] | undefined = stages[LEVELS.length]
  if (sel.show === "duplicates") {
    if (!dupes) visible = undefined
    else if (!search.active) {
      // Keep the pairs next to each other.
      const set = new Set(visible.map((r) => r._id))
      visible = Array.from(new Set(dupes.flatMap((d) => [d.a, d.b])))
        .filter((id) => set.has(id))
        .map((id) => byId.get(id)!)
    }
  }

  let culprit: Level | null = null
  LEVELS.forEach((level, i) => {
    if (!culprit && isSelected(level, sel) && stages[i].length > 0 && stages[i + 1].length === 0) culprit = level
  })

  return {
    base: base.length,
    show,
    kinds: tally(stages[1], (r) => (r.kind ? [r.kind] : [])),
    collections: tally(stages[2], (r) => r.collectionIds ?? []),
    areas: tally(stages[3], (r) => r.areaCodes ?? []),
    assets: tally(stages[4], (r) => r.assetIds ?? []),
    tags: tally(stages[5], (r) => r.tags ?? []),
    visible,
    culprit,
  }
}

export function ImageLibraryPage(_props: { params?: unknown }) {
  const { person } = useCheckIn()
  const editorId: Id<"people"> | null =
    person && !person.archived && (person.kind === "engineer" || person.kind === "admin") ? person._id : null

  const [show, setShow] = useState<Show>("all")
  const [kind, setKind] = useState<Kind | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const [collectionId, setCollectionId] = useState<Id<"imageCollections"> | null>(null)
  const [areaCode, setAreaCode] = useState<string | null>(null)
  const [assetId, setAssetId] = useState<Id<"assets"> | null>(null)
  const [sort, setSort] = useState<Sort>("newest")
  const [layout, setLayout] = useState<"grid" | "list">("grid")
  const [selected, setSelected] = useState<Set<Id<"images">>>(new Set())
  const [detail, setDetail] = useState<Id<"images"> | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)

  const facets = useQuery(api.images.facets, {})
  // The whole library (it is what "All images" shows anyway); filtering and the rail
  // counts happen below with one shared predicate, so they never disagree.
  const rows = useQuery(api.images.list, { sort: show === "recent" ? "recentlyUsed" : sort })
  const search = useImageSearch({ limit: 48 })

  const findDuplicates = useAction(api.images.possibleDuplicates)
  const [dupes, setDupes] = useState<{ a: Id<"images">; b: Id<"images">; score: number }[] | null>(null)
  useEffect(() => {
    if (show !== "duplicates") return
    let live = true
    setDupes(null)
    findDuplicates({})
      .then((r) => live && setDupes(r))
      .catch(() => live && setDupes([]))
    return () => {
      live = false
    }
  }, [show, findDuplicates])

  const hitById = useMemo(() => new Map(search.hits.map((h) => [h.imageId, h])), [search.hits])
  const cascade: Cascade | undefined = useMemo(
    () =>
      rows
        ? computeCascade(
            rows,
            { show, kind, collectionId, areaCode, assetId, tag },
            { active: search.active, hits: search.hits },
            dupes,
          )
        : undefined,
    [rows, show, kind, collectionId, areaCode, assetId, tag, search.active, search.hits, dupes],
  )
  const visible = cascade?.visible
  // "No pairs at all" keeps its own message in the grid; a filter that empties the view gets a way out.
  const culprit = cascade?.culprit === "show" && show === "duplicates" ? null : (cascade?.culprit ?? null)

  function dropLevel(level: Level) {
    if (level === "show") setShow("all")
    else if (level === "kind") setKind(null)
    else if (level === "collection") setCollectionId(null)
    else if (level === "area") setAreaCode(null)
    else if (level === "asset") setAssetId(null)
    else setTag(null)
  }
  function selectedName(level: Level): string {
    if (level === "show") return SHOW_LABEL[show]
    if (level === "kind") return kind ? KIND_LABEL[kind] : ""
    if (level === "collection") return facets?.collections.find((c) => c._id === collectionId)?.name ?? "this collection"
    if (level === "area") return areaCode ?? ""
    if (level === "asset") return facets?.assets.find((a) => a._id === assetId)?.code ?? "this Asset"
    return tag ?? ""
  }

  // Drop selections that are no longer visible.
  useEffect(() => {
    if (!visible) return
    const present = new Set(visible.map((r) => r._id))
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => present.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [visible])

  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const createFromUpload = useMutation(api.images.createFromUpload)
  const fileInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)

  async function uploadFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"))
    if (images.length === 0) return
    if (!editorId) {
      toast.error("Check in as an Engineer to add pictures to the library.")
      return
    }
    setUploading({ done: 0, total: images.length })
    let added = 0
    let reused = 0
    for (const [i, f] of images.entries()) {
      try {
        const r = await uploadImageFile(f, { generateUploadUrl, createFromUpload }, {
          ...(assetId ? { assetIds: [assetId] } : {}),
          ...(areaCode ? { areaCodes: [areaCode] } : {}),
        })
        if (r.deduped) reused++
        else added++
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Could not add ${f.name}`)
      }
      setUploading({ done: i + 1, total: images.length })
    }
    setUploading(null)
    if (added) toast.success(`Added ${added} picture${added === 1 ? "" : "s"}. The AI is writing descriptions and tags.`)
    if (reused) toast.info(`${reused} picture${reused === 1 ? " was" : "s were"} already in the library.`)
  }

  function toggleSelect(id: Id<"images">) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filtersOn = Boolean(kind || tag || collectionId || areaCode || assetId || show !== "all")
  function clearFilters() {
    setShow("all")
    setKind(null)
    setTag(null)
    setCollectionId(null)
    setAreaCode(null)
    setAssetId(null)
  }

  const content = (
    <div
      className="relative"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setDragging(false)
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files?.length) return
        e.preventDefault()
        setDragging(false)
        void uploadFiles(Array.from(e.dataTransfer.files))
      }}
    >
      <Tabs defaultValue="images" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="images" className="text-xs">
              <ImageIcon className="mr-1.5 h-3.5 w-3.5" /> Images
            </TabsTrigger>
            <TabsTrigger value="diagrams" className="text-xs">
              <Shapes className="mr-1.5 h-3.5 w-3.5" /> Diagrams
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="images" className="space-y-3">
          <div className="flex flex-col gap-4 lg:flex-row">
            <FilterRail
              facets={facets}
              cascade={cascade}
              show={show}
              setShow={setShow}
              kind={kind}
              setKind={setKind}
              tag={tag}
              setTag={setTag}
              collectionId={collectionId}
              setCollectionId={setCollectionId}
              areaCode={areaCode}
              setAreaCode={setAreaCode}
              assetId={assetId}
              setAssetId={setAssetId}
              editorId={editorId}
            />

            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search.text}
                    onChange={(e) => search.setText(e.target.value)}
                    placeholder="Search, e.g. hot die head with face shield"
                    className="h-9 pl-8 pr-8 text-sm"
                    aria-label="Search images"
                  />
                  {(search.text || search.photo) && (
                    <button
                      type="button"
                      onClick={search.clear}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Button variant="outline" size="sm" className="h-9" onClick={() => photoInput.current?.click()} title="Find pictures that look like a photo">
                  <Camera className="mr-1.5 h-3.5 w-3.5" /> By photo
                </Button>
                <Select value={sort} onValueChange={(v) => setSort(v as Sort)} disabled={search.active || show === "recent"}>
                  <SelectTrigger className="h-9 w-[150px] text-xs" aria-label="Sort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="recentlyUsed">Recently used</SelectItem>
                    <SelectItem value="mostUsed">Most used</SelectItem>
                    <SelectItem value="name">File name</SelectItem>
                  </SelectContent>
                </Select>
                <ToggleGroup type="single" variant="outline" value={layout} onValueChange={(v) => v && setLayout(v as "grid" | "list")}>
                  <ToggleGroupItem value="grid" className="h-9 px-2.5" aria-label="Grid">
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="list" className="h-9 px-2.5" aria-label="List">
                    <List className="h-3.5 w-3.5" />
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {search.photo && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
                  <img src={search.photo.previewUrl} alt="" className="h-8 w-8 rounded object-cover" />
                  <span className="flex-1">Pictures that look like this photo.</span>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={search.clearPhoto}>
                    Remove photo
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {visible === undefined || (search.active && search.loading && search.hits.length === 0)
                    ? "Loading..."
                    : search.active
                      ? `${visible.length} match${visible.length === 1 ? "" : "es"}, best first`
                      : show === "duplicates"
                        ? `${visible.length} image${visible.length === 1 ? "" : "s"} that look alike`
                        : `${visible.length} image${visible.length === 1 ? "" : "s"}`}
                </span>
                {filtersOn && (
                  <button type="button" onClick={clearFilters} className="underline-offset-2 hover:underline">
                    Clear filters
                  </button>
                )}
                {uploading && (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Adding {uploading.done + 1} of {uploading.total}
                  </span>
                )}
                {!editorId && <span className="ml-auto">Check in as an Engineer to edit the library.</span>}
              </div>

              {selected.size > 0 && (
                <BulkBar
                  ids={[...selected]}
                  rows={visible ?? []}
                  editorId={editorId}
                  facets={facets}
                  onClear={() => setSelected(new Set())}
                />
              )}

              {visible?.length === 0 && culprit ? (
                <div className="rounded-md border border-dashed p-10 text-center" data-testid="filter-culprit">
                  <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground" />
                  <div className="mt-2 text-sm font-medium">No images match all these filters</div>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                    The {LEVEL_LABEL[culprit].toLowerCase()} filter "{selectedName(culprit)}" left nothing
                    {culprit === "show" ? "" : " from the filters above it"}.
                  </p>
                  <div className="mt-3 flex justify-center gap-2">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => dropLevel(culprit)}>
                      <X className="mr-1 h-3.5 w-3.5" /> Remove {LEVEL_LABEL[culprit].toLowerCase()} "{selectedName(culprit)}"
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={clearFilters}>
                      Clear all filters
                    </Button>
                  </div>
                </div>
              ) : layout === "grid" ? (
                <Grid
                  rows={visible}
                  hits={search.active ? hitById : null}
                  query={search.text}
                  byPhoto={search.photo !== null}
                  selected={selected}
                  onToggle={toggleSelect}
                  onOpen={setDetail}
                  dupes={show === "duplicates" ? dupes : null}
                />
              ) : (
                <ListView rows={visible} selected={selected} onToggle={toggleSelect} onOpen={setDetail} setSelected={setSelected} />
              )}

              <SearchableFooter editorId={editorId} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="diagrams">
          <DiagramsTab />
        </TabsContent>
      </Tabs>

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5">
          <div className="rounded-md bg-background px-4 py-3 text-sm font-medium shadow">Drop to add the pictures to the library</div>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        multiple
        className="hidden"
        onChange={(e) => {
          void uploadFiles(Array.from(e.target.files ?? []))
          e.target.value = ""
        }}
      />
      <input
        ref={photoInput}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (f) search.searchByPhoto(f).catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not search by photo"))
        }}
      />

      <ImageDetailSheet
        imageId={detail}
        onClose={() => setDetail(null)}
        personId={editorId}
        areas={facets?.areas ?? []}
        collections={facets?.collections ?? []}
      />
    </div>
  )

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Documents", href: "/library" }, { label: "Images" }]} />
      <PageHeader
        icon={ImageIcon}
        title="Image library"
        statusLine="Pictures to reuse in Documents and Trainings. Drop files anywhere to add them."
        primary={{
          label: "Add pictures",
          icon: Upload,
          onClick: () => fileInput.current?.click(),
          disabled: !editorId,
          disabledReason: "Check in as an Engineer to add pictures",
        }}
      />
      <DocumentsTabs />
      <div className="p-4 sm:p-6">{content}</div>
    </div>
  )
}

// ---- Filter rail --------------------------------------------------------------------

function FilterRail(props: {
  facets: Facets | undefined
  cascade: Cascade | undefined
  show: Show
  setShow: (s: Show) => void
  kind: Kind | null
  setKind: (k: Kind | null) => void
  tag: string | null
  setTag: (t: string | null) => void
  collectionId: Id<"imageCollections"> | null
  setCollectionId: (c: Id<"imageCollections"> | null) => void
  areaCode: string | null
  setAreaCode: (a: string | null) => void
  assetId: Id<"assets"> | null
  setAssetId: (a: Id<"assets"> | null) => void
  editorId: Id<"people"> | null
}) {
  const f = props.facets
  const c = props.cascade
  const [allTags, setAllTags] = useState(false)
  const [allAssets, setAllAssets] = useState(false)
  const createCollection = useMutation(api.images.createCollection)
  const [newName, setNewName] = useState("")

  const showIcons: Record<Show, ReactNode> = {
    all: <ImageIcon className="h-3.5 w-3.5" />,
    favorites: <Star className="h-3.5 w-3.5" />,
    recent: <Clock className="h-3.5 w-3.5" />,
    unused: <X className="h-3.5 w-3.5" />,
    duplicates: <Copy className="h-3.5 w-3.5" />,
    undescribed: <Sparkles className="h-3.5 w-3.5" />,
  }
  // Counts follow the search and the selections above; undefined while loading.
  const n = (m: Map<string, number> | undefined, key: string) => (m ? (m.get(key) ?? 0) : undefined)

  // Assets and Tags can be long: list what still matches, fold the rest away.
  const assetRows = (f?.assets ?? []).map((a) => ({ ...a, count: n(c?.assets, a._id) }))
  const assetsShown = allAssets ? assetRows : assetRows.filter((a) => a.count !== 0 || props.assetId === a._id)
  const assetsHidden = assetRows.length - assetsShown.length
  const tagRows = Array.from(c?.tags ?? [], ([t, count]) => ({ tag: t, count }))
  if (props.tag && !c?.tags.has(props.tag)) tagRows.push({ tag: props.tag, count: 0 })
  tagRows.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))

  return (
    <aside className="space-y-4 lg:w-56 lg:shrink-0" aria-label="Filters">
      <RailGroup title="Show">
        {(Object.keys(SHOW_LABEL) as Show[])
          // A maintenance filter with nothing to do is left out, unless it is on.
          .filter((s) => props.show === s || !(s === "undescribed" && c?.show.undescribed === 0))
          .map((s) => (
            <RailItem
              key={s}
              active={props.show === s}
              onClick={() => props.setShow(s)}
              icon={showIcons[s]}
              count={s === "all" ? c?.base : c?.show[s]}
            >
              {SHOW_LABEL[s]}
            </RailItem>
          ))}
      </RailGroup>

      <RailGroup title="Kind">
        {KINDS.filter((k) => props.kind === k || !f || (f.kinds[k] ?? 0) > 0).map((k) => (
          <RailItem key={k} active={props.kind === k} onClick={() => props.setKind(props.kind === k ? null : k)} count={n(c?.kinds, k)}>
            {KIND_LABEL[k]}
          </RailItem>
        ))}
      </RailGroup>

      <RailGroup title="Collections">
        {(f?.collections ?? []).map((col) => (
          <RailItem
            key={col._id}
            active={props.collectionId === col._id}
            onClick={() => props.setCollectionId(props.collectionId === col._id ? null : col._id)}
            count={n(c?.collections, col._id)}
          >
            {col.name}
          </RailItem>
        ))}
        {props.editorId && (
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
                <FolderPlus className="h-3.5 w-3.5" /> New collection
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-2" align="start">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Die head close-ups" className="h-8 text-xs" />
              <Button
                size="sm"
                className="w-full"
                disabled={!newName.trim()}
                onClick={async () => {
                  try {
                    await createCollection({ name: newName, personId: props.editorId! })
                    setNewName("")
                    toast.success("Collection made")
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : String(e))
                  }
                }}
              >
                Make collection
              </Button>
            </PopoverContent>
          </Popover>
        )}
      </RailGroup>

      <RailGroup title="Areas">
        {(f?.areas ?? []).map((a) => (
          <RailItem
            key={a.code}
            active={props.areaCode === a.code}
            onClick={() => props.setAreaCode(props.areaCode === a.code ? null : a.code)}
            count={n(c?.areas, a.code)}
          >
            <span className="font-mono">{a.code}</span> {a.label}
          </RailItem>
        ))}
      </RailGroup>

      {assetRows.length > 0 && (
        <RailGroup title="Assets">
          {assetsShown.map((a) => (
            <RailItem key={a._id} active={props.assetId === a._id} onClick={() => props.setAssetId(props.assetId === a._id ? null : a._id)} count={a.count}>
              <span className="font-mono">{a.code}</span> <span className="truncate">{a.name}</span>
            </RailItem>
          ))}
          {(assetsHidden > 0 || allAssets) && (
            <button type="button" onClick={() => setAllAssets(!allAssets)} className="px-2 text-[11px] text-muted-foreground underline-offset-2 hover:underline">
              {allAssets ? "Hide Assets with no matches" : `${assetsHidden} more with no matches`}
            </button>
          )}
        </RailGroup>
      )}

      {tagRows.length > 0 && (
        <RailGroup title="Tags">
          <div className="flex flex-wrap gap-1 px-1">
            {(allTags ? tagRows : tagRows.slice(0, 18)).map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => props.setTag(props.tag === t.tag ? null : t.tag)}
                aria-pressed={props.tag === t.tag}
                title={t.count === 0 ? "No images with the filters above" : undefined}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px]",
                  props.tag === t.tag ? "border-primary bg-primary/10" : "text-muted-foreground hover:bg-muted",
                  t.count === 0 && "opacity-50",
                )}
              >
                {t.tag} <span className="tabular-nums opacity-70">{t.count}</span>
              </button>
            ))}
            {tagRows.length > 18 && (
              <button type="button" onClick={() => setAllTags(!allTags)} className="px-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline">
                {allTags ? "Fewer" : `All ${tagRows.length}`}
              </button>
            )}
          </div>
        </RailGroup>
      )}
    </aside>
  )
}

function RailGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  )
}

function RailItem({
  active,
  onClick,
  icon,
  count,
  children,
}: {
  active: boolean
  onClick: () => void
  icon?: ReactNode
  count?: number
  children: ReactNode
}) {
  // Zero under the search and the selections above: still clickable, but dimmed.
  const empty = count === 0
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={empty ? "No images with the filters above" : undefined}
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs",
        active ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        empty && "opacity-50",
      )}
    >
      {icon}
      <span className="flex min-w-0 flex-1 items-center gap-1 truncate">{children}</span>
      {count !== undefined && <span className="tabular-nums">{count}</span>}
    </button>
  )
}

// ---- Grid and list ------------------------------------------------------------------

function Grid({
  rows,
  hits,
  query,
  byPhoto,
  selected,
  onToggle,
  onOpen,
  dupes,
}: {
  rows: Row[] | undefined
  hits: Map<Id<"images">, ImageHit> | null
  query: string
  byPhoto: boolean
  selected: Set<Id<"images">>
  onToggle: (id: Id<"images">) => void
  onOpen: (id: Id<"images">) => void
  dupes: { a: Id<"images">; b: Id<"images">; score: number }[] | null
}) {
  const urls = useQuery(api.images.urlsFor, rows && rows.length ? { ids: rows.map((r) => r._id) } : "skip")
  if (!rows) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/3] w-full" />
        ))}
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-10 text-center">
        <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground" />
        <div className="mt-2 text-sm font-medium">{dupes ? "No pictures look alike" : "No pictures here"}</div>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          {dupes ? "Exact copies are never stored twice; near copies would show up here." : "Try other words or filters, or drop pictures here to add them."}
        </p>
      </div>
    )
  }
  const pairOf = new Map<string, number>()
  dupes?.forEach((d, i) => {
    pairOf.set(d.a, i)
    pairOf.set(d.b, i)
  })
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {rows.map((r, i) => {
        const hit = hits?.get(r._id)
        const reason = hit ? matchReason(hit, { query, byPhoto }) : null
        const isSel = selected.has(r._id)
        return (
          <div key={r._id} className="group relative">
            <ImageTile
              url={urls === undefined ? undefined : (urls[r._id] ?? null)}
              eager={i < 15}
              altText={r.altText}
              favorite={r.favorite}
              selected={isSel}
              onClick={(e) => (e.shiftKey || e.metaKey || e.ctrlKey || selected.size > 0 ? onToggle(r._id) : onOpen(r._id))}
              className="w-full"
              caption={
                <span className="flex flex-col gap-0.5">
                  <span className="line-clamp-1 text-foreground">{r.altText || r.filename}</span>
                  <span className="flex items-center gap-1">
                    {r.kind && <span>{KIND_LABEL[r.kind]}</span>}
                    {r.kind && <span aria-hidden>·</span>}
                    <span>{r.usageCount === 0 ? "Not used" : `In ${r.usageCount} Document${r.usageCount === 1 ? "" : "s"}`}</span>
                    {dupes && pairOf.has(r._id) && <span className="ml-auto">pair {pairOf.get(r._id)! + 1}</span>}
                  </span>
                </span>
              }
              bottomRight={
                reason ? (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]" title={reason.title}>
                    {reason.label}
                  </Badge>
                ) : undefined
              }
            />
            <div
              className={cn(
                "absolute left-1.5 top-1.5 rounded bg-background/90 p-1 shadow-sm transition-opacity",
                isSel || selected.size > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
              )}
            >
              <Checkbox checked={isSel} onCheckedChange={() => onToggle(r._id)} aria-label={`Select ${r.altText || r.filename}`} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ListView({
  rows,
  selected,
  onToggle,
  onOpen,
  setSelected,
}: {
  rows: Row[] | undefined
  selected: Set<Id<"images">>
  onToggle: (id: Id<"images">) => void
  onOpen: (id: Id<"images">) => void
  setSelected: (s: Set<Id<"images">>) => void
}) {
  const urls = useQuery(api.images.urlsFor, rows && rows.length ? { ids: rows.map((r) => r._id) } : "skip")
  const all = rows && rows.length > 0 && rows.every((r) => selected.has(r._id))
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={all ? true : selected.size > 0 ? "indeterminate" : false}
                onCheckedChange={() => setSelected(all ? new Set() : new Set(rows?.map((r) => r._id) ?? []))}
                aria-label="Select all"
              />
            </TableHead>
            <TableHead className="w-14">Picture</TableHead>
            <TableHead>What it shows</TableHead>
            <TableHead className="w-28">Kind</TableHead>
            <TableHead className="w-48">Used in</TableHead>
            <TableHead className="w-28">Last used</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!rows ? (
            <TableRow>
              <TableCell colSpan={6}>
                <Skeleton className="h-9 w-full" />
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-xs text-muted-foreground">
                No pictures here.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r._id} className={cn("cursor-pointer", selected.has(r._id) && "bg-primary/5")} onClick={() => onOpen(r._id)}>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.has(r._id)} onCheckedChange={() => onToggle(r._id)} aria-label="Select" />
                </TableCell>
                <TableCell>
                  <div className="h-9 w-12 overflow-hidden rounded border bg-muted/30">
                    {urls?.[r._id] && <img src={urls[r._id]!} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  <div className="flex items-center gap-1">
                    {r.favorite && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" />}
                    <span className="line-clamp-1">{r.altText || r.filename}</span>
                  </div>
                  {(r.tags?.length ?? 0) > 0 && <div className="line-clamp-1 text-muted-foreground">{r.tags!.join(", ")}</div>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.kind ? KIND_LABEL[r.kind] : "Not sorted"}</TableCell>
                <TableCell className="text-xs">
                  {r.documentRefs.length === 0 ? (
                    <span className="text-muted-foreground">Not used</span>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {r.documentRefs.slice(0, 3).map((d) => (
                        <span key={d.documentId} className="flex items-center gap-1">
                          <span className="font-mono">{d.namingCode}</span>
                          <StatusBadge status={d.status as DocumentStatus} className="px-1 py-0 text-[10px]" />
                        </span>
                      ))}
                      {r.documentRefs.length > 3 && <span className="text-muted-foreground">and {r.documentRefs.length - 3} more</span>}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.lastUsedAt ? formatDate(r.lastUsedAt) : "Never"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

// ---- Bulk actions -------------------------------------------------------------------

function BulkBar({
  ids,
  rows,
  editorId,
  facets,
  onClear,
}: {
  ids: Id<"images">[]
  rows: Row[]
  editorId: Id<"people"> | null
  facets: Facets | undefined
  onClear: () => void
}) {
  const bulk = useMutation(api.images.bulkUpdate)
  const removeMany = useMutation(api.images.removeMany)
  const createCollection = useMutation(api.images.createCollection)
  const describe = useMutation(api.ai.imageDescribe.requestDescribe)
  const allAssets = useQuery(api.assets.list, {})
  const [tagText, setTagText] = useState("")
  const [collectionName, setCollectionName] = useState("")
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const disabled = !editorId || busy

  const chosen = rows.filter((r) => ids.includes(r._id))
  const deletable = chosen.filter((r) => r.usageCount === 0).length
  const allFav = chosen.length > 0 && chosen.every((r) => r.favorite)

  async function run(p: () => Promise<unknown>, ok: string) {
    if (!editorId) return
    setBusy(true)
    try {
      await p()
      toast.success(ok)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const n = `${ids.length} picture${ids.length === 1 ? "" : "s"}`

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-xs">
      <Badge className="bg-primary text-primary-foreground">{ids.length} selected</Badge>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-xs"
        disabled={disabled}
        onClick={() => run(() => bulk({ ids, personId: editorId!, favorite: !allFav }), allFav ? "Removed from favorites" : "Added to favorites")}
      >
        <Star className="mr-1 h-3.5 w-3.5" /> {allFav ? "Unfavorite" : "Favorite"}
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={disabled}>
            <Tag className="mr-1 h-3.5 w-3.5" /> Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-2" align="start">
          <Input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="Tags, comma separated" className="h-8 text-xs" />
          <Button
            size="sm"
            className="w-full"
            disabled={!tagText.trim() || disabled}
            onClick={() =>
              run(async () => {
                await bulk({ ids, personId: editorId!, addTags: tagText.split(",").map((t) => t.trim()).filter(Boolean) })
                setTagText("")
              }, `Tagged ${n}`)
            }
          >
            Add tags
          </Button>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={disabled}>
            <Shapes className="mr-1 h-3.5 w-3.5" /> Kind
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {KINDS.map((k) => (
            <DropdownMenuItem key={k} onClick={() => run(() => bulk({ ids, personId: editorId!, kind: k }), `Marked as ${KIND_LABEL[k].toLowerCase()}`)}>
              {KIND_LABEL[k]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={disabled}>
            <MapPin className="mr-1 h-3.5 w-3.5" /> Link
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
          {(facets?.areas ?? []).map((a) => (
            <DropdownMenuItem key={a.code} onClick={() => run(() => bulk({ ids, personId: editorId!, addAreaCodes: [a.code] }), `Linked to area ${a.code}`)}>
              Area <span className="ml-1 font-mono">{a.code}</span> {a.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {(allAssets ?? []).map((a) => (
            <DropdownMenuItem key={a._id} onClick={() => run(() => bulk({ ids, personId: editorId!, addAssetIds: [a._id] }), `Linked to ${a.code}`)}>
              <span className="font-mono">{a.code}</span> <span className="ml-1 truncate">{a.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={disabled}>
            <FolderPlus className="mr-1 h-3.5 w-3.5" /> Collection
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-2" align="start">
          {(facets?.collections ?? []).map((c) => (
            <button
              key={c._id}
              type="button"
              className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted"
              onClick={() => run(() => bulk({ ids, personId: editorId!, addToCollection: c._id }), `Added to ${c.name}`)}
            >
              {c.name}
            </button>
          ))}
          <div className="flex gap-1.5 border-t pt-2">
            <Input value={collectionName} onChange={(e) => setCollectionName(e.target.value)} placeholder="New collection" className="h-8 text-xs" />
            <Button
              size="sm"
              className="h-8"
              disabled={!collectionName.trim() || disabled}
              onClick={() =>
                run(async () => {
                  await createCollection({ name: collectionName, personId: editorId!, imageIds: ids })
                  setCollectionName("")
                }, `Added to ${collectionName.trim()}`)
              }
            >
              Add
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-xs"
        disabled={disabled}
        onClick={() => run(() => describe({ ids, personId: editorId! }), `The AI is describing ${n}`)}
        title="Fills in missing descriptions, alt text and tags"
      >
        <Sparkles className="mr-1 h-3.5 w-3.5" /> Describe with AI
      </Button>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-xs text-destructive hover:text-destructive"
        disabled={disabled || deletable === 0}
        title={deletable === 0 ? "Pictures used in a Document cannot be deleted" : undefined}
        onClick={() => setConfirm(true)}
      >
        <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
      </Button>

      <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={onClear}>
        <X className="mr-1 h-3.5 w-3.5" /> Clear
      </Button>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deletable} picture{deletable === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They are removed from the library for good.
              {chosen.length > deletable &&
                ` ${chosen.length - deletable} of the selected ${chosen.length - deletable === 1 ? "is" : "are"} used in a Document and stay${chosen.length - deletable === 1 ? "s" : ""}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void run(async () => {
                  const r = await removeMany({ ids, personId: editorId! })
                  setConfirm(false)
                  onClear()
                  if (r.refused.length) toast.info(`${r.refused.length} still in use, kept.`)
                }, `Deleted ${deletable}`)
              }}
            >
              Delete {deletable}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---- Search status --------------------------------------------------------------------

function SearchableFooter({ editorId }: { editorId: Id<"people"> | null }) {
  const status = useQuery(api.ai.imageEmbed.embedStatus, {})
  const start = useMutation(api.ai.imageEmbed.startBackfill)
  if (!status || status.total === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
      <span>
        {status.embedded} of {status.total} pictures can be found by words and by photo
        {status.byCaption > 0 ? ` (${status.byCaption} by their description only)` : ""}.
      </span>
      {status.outstanding > 0 && editorId && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={async () => {
            try {
              await start({ personId: editorId })
              toast.success("Making the rest searchable. This runs in the background.")
            } catch (e) {
              toast.error(e instanceof Error ? e.message : String(e))
            }
          }}
        >
          Make {status.outstanding} searchable
        </Button>
      )}
    </div>
  )
}

// ---- Diagrams tab -------------------------------------------------------------------

type DiagramEntry = FunctionReturnType<typeof api.images.listDiagrams>[number]

// Diagram SVG is app-curated (renderDiagramSvg escapes every label), but strip
// scripts and inline handlers anyway before dangerouslySetInnerHTML.
function sanitizeSvg(svg: string): string {
  return svg.replace(/<script[\s\S]*?<\/script\s*>/gi, "").replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
}

function DiagramsTab() {
  const diagrams = useQuery(api.images.listDiagrams, {})
  const [search, setSearch] = useState("")
  const visible: DiagramEntry[] = useMemo(() => {
    if (!diagrams) return []
    const q = search.trim().toLowerCase()
    return q
      ? diagrams.filter((d) => [d.caption, d.namingCode, d.title].filter(Boolean).some((s) => s.toLowerCase().includes(q)))
      : diagrams
  }, [diagrams, search])

  if (diagrams === undefined) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full" />
        ))}
      </div>
    )
  }
  if (diagrams.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-10 text-center">
        <Shapes className="mx-auto h-8 w-8 text-muted-foreground" />
        <div className="mt-2 text-sm font-medium">No diagrams yet</div>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          Diagrams built in any Document are collected here. Insert one from the editor toolbar.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Caption, code or Document" className="h-8 pl-8 text-xs" />
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {visible.length} diagram{visible.length === 1 ? "" : "s"}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((d) => (
          <div key={d.key} className="flex flex-col overflow-hidden rounded-md border bg-card">
            <div
              className="flex min-h-32 items-center justify-center border-b bg-muted/20 p-3 text-foreground [&_svg]:h-auto [&_svg]:max-h-44 [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: sanitizeSvg(d.svg) }}
            />
            <div className="flex flex-1 flex-col gap-1.5 p-3">
              <div className="truncate text-xs font-medium">{d.caption || "Diagram"}</div>
              <div className="mt-auto flex items-center gap-1.5">
                <Link href={`/docs/${d.documentId}`} className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                  <span className="shrink-0 font-mono">{d.namingCode}</span>
                  <span className="truncate">{d.title}</span>
                </Link>
                <StatusBadge status={d.status as DocumentStatus} className="ml-auto shrink-0 px-1.5 py-0 text-xs" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
