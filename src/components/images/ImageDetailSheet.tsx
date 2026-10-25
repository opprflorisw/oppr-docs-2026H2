// One library image: preview, what it shows, where it is used, and its links
// to Assets and areas. Editing needs a checked-in Engineer or Admin.
import { useEffect, useState } from "react"
import { Link } from "wouter"
import { useMutation, useQuery } from "convex/react"
import { ArrowUpRight, Loader2, Sparkles, Star, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { StatusBadge } from "@/components/docs/StatusBadge"
import { formatDate } from "@/lib/time"
import { cn } from "@/lib/utils"
import { KIND_LABEL } from "./labels"

type Kind = "photo" | "illustration" | "diagram" | "safety" | "generated"
const KINDS: Kind[] = ["photo", "illustration", "diagram", "safety", "generated"]

export function ImageDetailSheet({
  imageId,
  onClose,
  personId,
  areas,
  collections,
}: {
  imageId: Id<"images"> | null
  onClose: () => void
  personId: Id<"people"> | null
  areas: { code: string; label: string }[]
  collections: { _id: Id<"imageCollections">; name: string }[]
}) {
  return (
    <Sheet open={imageId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {imageId && (
          <Body
            key={imageId}
            imageId={imageId}
            onClose={onClose}
            personId={personId}
            areas={areas}
            collections={collections}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function Body({
  imageId,
  onClose,
  personId,
  areas,
  collections,
}: {
  imageId: Id<"images">
  onClose: () => void
  personId: Id<"people"> | null
  areas: { code: string; label: string }[]
  collections: { _id: Id<"imageCollections">; name: string }[]
}) {
  const detail = useQuery(api.images.get, { id: imageId })
  const allAssets = useQuery(api.assets.list, {})
  const update = useMutation(api.images.update)
  const remove = useMutation(api.images.remove)
  const describe = useMutation(api.ai.imageDescribe.requestDescribe)
  const canEdit = personId !== null
  const [form, setForm] = useState<{
    altText: string
    description: string
    tags: string
    kind: Kind | "none"
    assetIds: Id<"assets">[]
    areaCodes: string[]
    collectionIds: Id<"imageCollections">[]
  } | null>(null)
  const [busy, setBusy] = useState(false)

  const img = detail?.image
  useEffect(() => {
    if (!img || form) return
    setForm({
      altText: img.altText,
      description: img.description ?? "",
      tags: (img.tags ?? []).join(", "),
      kind: img.kind ?? "none",
      assetIds: img.assetIds ?? [],
      areaCodes: img.areaCodes ?? [],
      collectionIds: img.collectionIds ?? [],
    })
  }, [img, form])

  // After "Describe with AI", take the AI's words into the form once they land.
  const [aiSince, setAiSince] = useState<number | null>(null)
  useEffect(() => {
    if (!img || aiSince === null || !img.describedAt || img.describedAt < aiSince) return
    setAiSince(null)
    setForm((f) =>
      f ? { ...f, altText: img.altText, description: img.description ?? "", tags: (img.tags ?? []).join(", "), kind: img.kind ?? f.kind } : f,
    )
  }, [img, aiSince])

  if (detail === undefined || !form) {
    return (
      <div className="space-y-3 pt-6">
        <SheetTitle className="sr-only">Image</SheetTitle>
        <Skeleton className="aspect-[4/3] w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }
  if (detail === null || !img) {
    return (
      <div className="pt-6">
        <SheetTitle className="text-sm">Image not found</SheetTitle>
        <p className="text-sm text-muted-foreground">This image no longer exists.</p>
      </div>
    )
  }

  const dirty =
    form.altText !== img.altText ||
    form.description !== (img.description ?? "") ||
    form.tags !== (img.tags ?? []).join(", ") ||
    form.kind !== (img.kind ?? "none") ||
    JSON.stringify(form.assetIds) !== JSON.stringify(img.assetIds ?? []) ||
    JSON.stringify(form.areaCodes) !== JSON.stringify(img.areaCodes ?? []) ||
    JSON.stringify(form.collectionIds) !== JSON.stringify(img.collectionIds ?? [])

  async function run(p: Promise<unknown>, ok: string) {
    setBusy(true)
    try {
      await p
      toast.success(ok)
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!form || !personId) return
    await run(
      update({
        id: imageId,
        personId,
        altText: form.altText,
        description: form.description,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        kind: form.kind === "none" ? null : form.kind,
        assetIds: form.assetIds,
        areaCodes: form.areaCodes,
        collectionIds: form.collectionIds,
      }),
      "Saved",
    )
  }

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <div className="space-y-4 pb-6">
      <SheetHeader className="pr-6 text-left">
        <SheetTitle className="text-sm leading-snug">{img.altText || "Picture without a caption"}</SheetTitle>
        <SheetDescription className="text-xs">
          <span className="break-all">{img.filename}</span>
          {". "}
          {img.source === "url" ? "Linked from the web" : `${img.byteSize ? `${Math.round(img.byteSize / 1024)} KB, ` : ""}added ${formatDate(img.createdAt)}`}
          {detail.uploader?.name ? ` by ${detail.uploader.name}` : ""}
          {img.useCount ? `. Inserted ${img.useCount} time${img.useCount === 1 ? "" : "s"}` : ""}
          {img.lastUsedAt ? `, last on ${formatDate(img.lastUsedAt)}` : ""}.
        </SheetDescription>
      </SheetHeader>

      <div className="relative overflow-hidden rounded-md border bg-muted/20">
        {detail.url ? (
          <img src={detail.url} alt={img.altText} className="max-h-72 w-full object-contain" />
        ) : (
          <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">No preview</div>
        )}
        <button
          type="button"
          disabled={!canEdit || busy}
          onClick={() => personId && void run(update({ id: imageId, personId, favorite: !img.favorite }), img.favorite ? "Removed from favorites" : "Added to favorites")}
          className="absolute right-2 top-2 rounded-full bg-background/90 p-1.5 shadow disabled:opacity-60"
          aria-label={img.favorite ? "Remove from favorites" : "Add to favorites"}
          title={img.favorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star className={cn("h-4 w-4", img.favorite ? "fill-amber-400 text-amber-500" : "text-muted-foreground")} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Badge variant="outline" className="text-xs">
          {img.embedded ? (img.embedSource === "caption" ? "Found by its description" : "Found by words and by photo") : "Not findable by meaning yet"}
        </Badge>
        {img.describedAt && <Badge variant="outline" className="text-xs">Description by AI</Badge>}
        {img.generatedPrompt && <Badge variant="outline" className="text-xs">Generated</Badge>}
      </div>

      {!canEdit && (
        <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
          Check in as an Engineer to edit this image.
        </p>
      )}

      <fieldset disabled={!canEdit || busy} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="img-alt" className="text-xs">Caption: what it shows</Label>
          <Input id="img-alt" value={form.altText} onChange={(e) => setForm({ ...form, altText: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="img-desc" className="text-xs">Description</Label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() =>
                personId &&
                void run(
                  describe({ ids: [imageId], personId, overwrite: true }).then(() => setAiSince(Date.now() - 1000)),
                  "The AI is describing the picture",
                )
              }
            >
              {aiSince !== null ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
              Describe with AI
            </Button>
          </div>
          <Textarea
            id="img-desc"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What is in the picture and what a reader uses it for"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="img-tags" className="text-xs">Tags (comma separated)</Label>
            <Input id="img-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Kind</Label>
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as Kind | "none" })}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not sorted</SelectItem>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <ChipPicker
          label="Areas"
          options={areas.map((a) => ({ id: a.code, label: `${a.code} ${a.label}` }))}
          selected={form.areaCodes}
          onToggle={(id) => setForm({ ...form, areaCodes: toggle(form.areaCodes, id) })}
        />
        <ChipPicker
          label="Assets"
          options={(allAssets ?? []).map((a) => ({ id: a._id, label: `${a.code} ${a.name}` }))}
          selected={form.assetIds}
          onToggle={(id) => setForm({ ...form, assetIds: toggle(form.assetIds, id as Id<"assets">) })}
        />
        {collections.length > 0 && (
          <ChipPicker
            label="Collections"
            options={collections.map((c) => ({ id: c._id, label: c.name }))}
            selected={form.collectionIds}
            onToggle={(id) => setForm({ ...form, collectionIds: toggle(form.collectionIds, id as Id<"imageCollections">) })}
          />
        )}
      </fieldset>

      <div className="space-y-1.5">
        <div className="text-xs font-medium">Used in</div>
        {detail.usages.length === 0 ? (
          <p className="text-xs text-muted-foreground">Not used in any Document yet.</p>
        ) : (
          <ul className="space-y-1">
            {detail.usages.map((u) => (
              <li key={`${u.documentId}:${u.version}`} className="flex items-center gap-2 text-xs">
                <Link href={`/docs/${u.documentId}`} className="flex min-w-0 items-center gap-1.5 hover:underline">
                  <span className="shrink-0 font-mono">{u.namingCode}</span>
                  <span className="truncate text-muted-foreground">{u.title}</span>
                  <ArrowUpRight className="h-3 w-3 shrink-0" />
                </Link>
                <span className="ml-auto shrink-0 text-muted-foreground">v{u.version}</span>
                <StatusBadge status={u.status} className="shrink-0 px-1.5 py-0 text-xs" />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={!canEdit || busy || detail.usages.length > 0}
          title={detail.usages.length > 0 ? "Remove it from its Documents first" : undefined}
          onClick={async () => {
            if (!personId) return
            if (await run(remove({ id: imageId, personId }), "Image deleted")) onClose()
          }}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="mr-1 h-3.5 w-3.5" /> Close
          </Button>
          <Button size="sm" onClick={save} disabled={!canEdit || !dirty || busy}>
            {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}

function ChipPicker({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: { id: string; label: string }[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o.id)
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onToggle(o.id)}
              aria-pressed={on}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs transition-colors disabled:opacity-60",
                on ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {o.label}
            </button>
          )
        })}
        {options.length === 0 && <span className="text-xs text-muted-foreground">None yet</span>}
      </div>
    </div>
  )
}
