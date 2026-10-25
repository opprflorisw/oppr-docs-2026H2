// PPE configurator: the Safety icons section of Settings > Documents.
//
// A gallery of every PPE item with its real ISO 7010 pictogram shown large,
// the full caption and description below it. A toolbar searches, filters
// (all / active / off), groups by body area, switches the caption language
// (EN/NL, used by the app and exports) and adds a new icon. Clicking a card
// opens its details: edit the English + Dutch caption and description, pick
// a bundled pictogram, switch it on or off, or delete a custom one. Built-in
// items can be switched off but not deleted. Only active items appear in the
// editor's PPE picker. Self-seeds the factory catalog on first visit.
//
// Viewing, searching and filtering work for everyone; changing anything needs
// a checked-in Engineer or Admin (the server enforces it too).

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { ImagePlus, Layers, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { PPE_PICTOGRAM_IDS, ppeDataUrl } from "@/lib/ppePictograms"
import { ppeImageSrc } from "@/lib/ppeCatalog"
import { EditNotice, errorText, useEditorMutation, useSettingsEditor } from "@/components/settings/SettingsBits"

interface PpeRow {
  _id: Id<"ppeItems">
  slug: string
  label: string
  labelEn?: string | null
  labelNl?: string | null
  description: string | null
  descriptionNl?: string | null
  pictogramId: string
  imageUrl?: string | null
  active: boolean
  builtIn: boolean
  sortOrder: number
}

type Lang = "en" | "nl"
type Filter = "all" | "active" | "off"

// The catalog has no category field; the factory slugs map to body areas so
// the gallery can group them. Custom icons get their own group.
const AREAS = [
  { key: "head", label: "Head, eyes and ears" },
  { key: "breathing", label: "Breathing" },
  { key: "body", label: "Body, hands and feet" },
  { key: "actions", label: "Actions and hygiene" },
  { key: "custom", label: "Your own icons" },
] as const
type AreaKey = (typeof AREAS)[number]["key"]
const AREA_OF: Record<string, AreaKey> = {
  hardhat: "head",
  glasses: "head",
  "ear-pro": "head",
  "face-shield": "head",
  "eye-ear": "head",
  "hair-net": "head",
  mask: "breathing",
  "dust-mask": "breathing",
  "gas-detector": "breathing",
  gloves: "body",
  clothing: "body",
  "hi-vis": "body",
  harness: "body",
  "life-jacket": "body",
  "lab-coat": "body",
  boots: "body",
  "wash-hands": "actions",
  "read-first": "actions",
  handrail: "actions",
  general: "actions",
}
function areaOf(row: PpeRow): AreaKey {
  return row.builtIn ? (AREA_OF[row.slug] ?? "actions") : "custom"
}

function shownLabel(row: PpeRow, language: Lang): string {
  return (language === "nl" ? row.labelNl || row.label : row.labelEn || row.label) || row.label
}
function shownDescription(row: PpeRow, language: Lang): string | null {
  return (language === "nl" ? row.descriptionNl || row.description : row.description) || null
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-8 shrink-0 items-center rounded-md border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-full whitespace-nowrap rounded-[5px] px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            value === o.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function PpeConfigurator() {
  const rows = useQuery(api.ppe.list) as PpeRow[] | undefined
  const seed = useMutation(api.ppe.seedIfEmpty)
  const language = (useQuery(api.ppe.getLanguage) ?? "en") as Lang
  const setLanguage = useEditorMutation(api.ppe.setLanguage)
  const { editorId } = useSettingsEditor()
  const canEdit = Boolean(editorId)
  const [addOpen, setAddOpen] = useState(false)
  const [openId, setOpenId] = useState<Id<"ppeItems"> | null>(null)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [grouped, setGrouped] = useState(true)

  useEffect(() => {
    if (rows !== undefined && rows.length === 0) {
      void seed({}).catch(() => {})
    }
  }, [rows, seed])

  const all = useMemo(() => rows ?? [], [rows])
  const activeCount = all.filter((r) => r.active).length

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((r) => {
      if (filter === "active" && !r.active) return false
      if (filter === "off" && r.active) return false
      if (!q) return true
      return [r.label, r.labelEn, r.labelNl, r.description, r.descriptionNl, r.slug]
        .filter(Boolean)
        .some((s) => (s as string).toLowerCase().includes(q))
    })
  }, [all, query, filter])

  const sections = useMemo(() => {
    if (!grouped) return [{ key: "all", label: null as string | null, items: visible }]
    return AREAS.map((a) => ({ key: a.key, label: a.label as string | null, items: visible.filter((r) => areaOf(r) === a.key) })).filter(
      (s) => s.items.length > 0,
    )
  }, [visible, grouped])

  const openRow = openId ? all.find((r) => r._id === openId) ?? null : null

  async function changeLanguage(l: Lang) {
    try {
      await setLanguage({ language: l })
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  return (
    <div className="space-y-4" data-testid="ppe-configurator">
      <EditNotice what="change the safety icons" />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search safety icons"
              aria-label="Search safety icons"
              className="h-8 pl-8 pr-8 text-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Segmented<Lang>
              label="Caption language in the app and exports"
              value={language}
              onChange={(l) => void changeLanguage(l)}
              disabled={!canEdit}
              options={[
                { value: "en", label: "EN" },
                { value: "nl", label: "NL" },
              ]}
            />
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setAddOpen(true)} disabled={!canEdit}>
              <Plus className="h-3.5 w-3.5" />
              Add icon
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Filter>
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `All ${all.length}` },
              { value: "active", label: `Active ${activeCount}` },
              { value: "off", label: `Off ${all.length - activeCount}` },
            ]}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={grouped}
            onClick={() => setGrouped((g) => !g)}
            className={cn("h-8 gap-1.5", grouped && "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary")}
            title="Group the icons by body area"
          >
            <Layers className="h-3.5 w-3.5" />
            Group by area
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Only active icons appear in the editor&rsquo;s PPE picker. Built-in icons can be switched off but not deleted.
        Click an icon to see or edit its details.
      </p>

      {rows === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Setting up the default safety icons…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">No safety icons match these filters.</p>
          <Button
            variant="link"
            size="sm"
            className="mt-1"
            onClick={() => {
              setQuery("")
              setFilter("all")
            }}
          >
            Show all icons
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((s) => (
            <section key={s.key} aria-label={s.label ?? "Safety icons"}>
              {s.label && (
                <h3 className="mb-2.5 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {s.label}
                  <span className="font-normal normal-case tracking-normal">{s.items.length}</span>
                </h3>
              )}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
                {s.items.map((r) => (
                  <PpeCard key={r._id} row={r} language={language} canEdit={canEdit} onOpen={() => setOpenId(r._id)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {openRow && (
        <PpeDetailDialog
          key={openRow._id}
          row={openRow}
          language={language}
          canEdit={canEdit}
          onClose={() => setOpenId(null)}
        />
      )}
      <AddPpeDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}

function PpeCard({
  row,
  language,
  canEdit,
  onOpen,
}: {
  row: PpeRow
  language: Lang
  canEdit: boolean
  onOpen: () => void
}) {
  const setActive = useEditorMutation(api.ppe.setActive)
  const label = shownLabel(row, language)
  const description = shownDescription(row, language)

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onOpen()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKey}
      aria-label={`${label}${row.active ? "" : " (off)"}: ${canEdit ? "edit" : "view details"}`}
      data-testid="ppe-card"
      className={cn(
        "group flex cursor-pointer flex-col rounded-xl border p-2.5 text-left outline-none transition",
        "hover:border-primary/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring",
        row.active ? "bg-card" : "bg-muted/30",
      )}
    >
      <div className="relative flex aspect-[5/4] items-center justify-center rounded-lg bg-muted/50">
        <img
          src={ppeImageSrc(row)}
          alt=""
          width={88}
          height={88}
          draggable={false}
          className={cn("h-[88px] w-[88px] object-contain transition", !row.active && "opacity-40 grayscale")}
        />
        <div className="absolute right-1 top-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <Switch
            checked={row.active}
            disabled={!canEdit}
            aria-label={`${label} active`}
            title={row.active ? "Active: shown in the PPE picker" : "Off: hidden from the PPE picker"}
            className="origin-top-right scale-[0.8]"
            onCheckedChange={(v) =>
              void setActive({ id: row._id, active: v }).catch((err) => toast.error(errorText(err)))
            }
          />
        </div>
      </div>
      <div className="flex flex-1 flex-col px-0.5 pt-2.5">
        <h4 className={cn("text-sm font-semibold leading-snug [overflow-wrap:anywhere]", !row.active && "text-muted-foreground")}>
          {label}
        </h4>
        {description && (
          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground" title={description}>
            {description}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
          <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground">
            <span
              aria-hidden
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", row.active ? "bg-emerald-500" : "bg-muted-foreground/40")}
            />
            {row.active ? "Active" : "Off"}
            <span aria-hidden>·</span>
            {row.builtIn ? "Built-in" : "Custom"}
          </span>
          <Pencil
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        </div>
      </div>
    </div>
  )
}

function PpeDetailDialog({
  row,
  language,
  canEdit,
  onClose,
}: {
  row: PpeRow
  language: Lang
  canEdit: boolean
  onClose: () => void
}) {
  const setActive = useEditorMutation(api.ppe.setActive)
  const update = useEditorMutation(api.ppe.update)
  const remove = useEditorMutation(api.ppe.remove)
  const [labelEn, setLabelEn] = useState(row.labelEn ?? row.label)
  const [labelNl, setLabelNl] = useState(row.labelNl ?? "")
  const [descEn, setDescEn] = useState(row.description ?? "")
  const [descNl, setDescNl] = useState(row.descriptionNl ?? "")
  const [pictogramId, setPictogramId] = useState(row.pictogramId)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const changes: { label?: string; labelNl?: string; description?: string; descriptionNl?: string; pictogramId?: string } = {}
  if (labelEn.trim() && labelEn.trim() !== (row.labelEn ?? row.label)) changes.label = labelEn
  if ((labelNl.trim() || null) !== (row.labelNl ?? null)) changes.labelNl = labelNl
  if ((descEn.trim() || null) !== (row.description ?? null)) changes.description = descEn
  if ((descNl.trim() || null) !== (row.descriptionNl ?? null)) changes.descriptionNl = descNl
  if (pictogramId !== row.pictogramId) changes.pictogramId = pictogramId
  const dirty = Object.keys(changes).length > 0

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true)
    try {
      await fn()
      if (done) toast.success(done)
      return true
    } catch (err) {
      toast.error(errorText(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  const previewSrc = row.imageUrl ? ppeImageSrc(row) : ppeDataUrl(pictogramId)
  const title = shownLabel(row, language)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {row.builtIn ? "Built-in safety icon." : "Custom safety icon."}{" "}
            {canEdit
              ? "Edit the caption in both languages."
              : "Check in as an Engineer or Admin to change the safety icons."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-1 sm:grid-cols-[13rem_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="flex aspect-square items-center justify-center rounded-xl bg-muted/50">
              <img
                src={previewSrc}
                alt=""
                width={128}
                height={128}
                draggable={false}
                className={cn("h-32 w-32 object-contain", !row.active && "opacity-40 grayscale")}
              />
            </div>
            <label className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <span>
                <span className="block font-medium">{row.active ? "Active" : "Off"}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {row.active ? "Shown in the PPE picker" : "Hidden from the PPE picker"}
                </span>
              </span>
              <Switch
                checked={row.active}
                disabled={!canEdit || busy}
                aria-label={`${title} active`}
                onCheckedChange={(v) => void run(() => setActive({ id: row._id, active: v }))}
              />
            </label>
          </div>

          <fieldset disabled={!canEdit || busy} className="m-0 min-w-0 space-y-4 border-0 p-0">
            <Tabs defaultValue={language} className="w-full">
              <TabsList className="grid h-8 w-full grid-cols-2">
                <TabsTrigger value="en" className="text-xs">
                  English
                </TabsTrigger>
                <TabsTrigger value="nl" className="text-xs">
                  Nederlands
                </TabsTrigger>
              </TabsList>
              <TabsContent value="en" className="mt-3 space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="ppe-label-en" className="text-xs">
                    Label
                  </Label>
                  <Input id="ppe-label-en" value={labelEn} onChange={(e) => setLabelEn(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ppe-desc-en" className="text-xs">
                    Description
                  </Label>
                  <Textarea
                    id="ppe-desc-en"
                    value={descEn}
                    onChange={(e) => setDescEn(e.target.value)}
                    className="min-h-[5rem] text-sm"
                    placeholder="Optional"
                  />
                </div>
              </TabsContent>
              <TabsContent value="nl" className="mt-3 space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="ppe-label-nl" className="text-xs">
                    Naam
                  </Label>
                  <Input
                    id="ppe-label-nl"
                    value={labelNl}
                    onChange={(e) => setLabelNl(e.target.value)}
                    className="h-9"
                    placeholder="Nederlandse naam"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ppe-desc-nl" className="text-xs">
                    Omschrijving
                  </Label>
                  <Textarea
                    id="ppe-desc-nl"
                    value={descNl}
                    onChange={(e) => setDescNl(e.target.value)}
                    className="min-h-[5rem] text-sm"
                    placeholder="Optioneel"
                  />
                </div>
              </TabsContent>
            </Tabs>
            {!row.imageUrl && (
              <div className="space-y-1.5">
                <Label className="text-xs">Pictogram</Label>
                <PictogramPicker value={pictogramId} onChange={setPictogramId} />
              </div>
            )}
          </fieldset>
        </div>

        <DialogFooter className="gap-2 sm:items-center sm:justify-between">
          <div>
            {!row.builtIn && canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true)
                    return
                  }
                  void run(() => remove({ id: row._id }), "Safety icon deleted").then((ok) => ok && onClose())
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {confirmDelete ? "Click again to delete" : "Delete"}
              </Button>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              {canEdit ? "Cancel" : "Close"}
            </Button>
            {canEdit && (
              <Button
                type="button"
                disabled={busy || !dirty || !labelEn.trim()}
                onClick={() =>
                  void run(() => update({ id: row._id, ...changes }), "Safety icon saved").then((ok) => ok && onClose())
                }
              >
                Save
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddPpeDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const add = useEditorMutation(api.ppe.add)
  const generateUploadUrl = useEditorMutation(api.ppe.generateUploadUrl)
  const [labelEn, setLabelEn] = useState("")
  const [labelNl, setLabelNl] = useState("")
  const [descEn, setDescEn] = useState("")
  const [descNl, setDescNl] = useState("")
  const [imageMode, setImageMode] = useState<"pictogram" | "upload">("pictogram")
  const [pictogramId, setPictogramId] = useState(PPE_PICTOGRAM_IDS[0])
  const [file, setFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function reset() {
    setLabelEn("")
    setLabelNl("")
    setDescEn("")
    setDescNl("")
    setImageMode("pictogram")
    setPictogramId(PPE_PICTOGRAM_IDS[0])
    setFile(null)
    setFilePreview(null)
  }

  function pickFile(f: File | null) {
    setFile(f)
    setFilePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return f ? URL.createObjectURL(f) : null
    })
  }

  async function onAdd() {
    if (!labelEn.trim()) {
      toast.error("An English label is required")
      return
    }
    setBusy(true)
    try {
      let storageId: Id<"_storage"> | undefined
      if (imageMode === "upload" && file) {
        const url = await generateUploadUrl({})
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        })
        if (!res.ok) throw new Error("Image upload failed")
        const json = (await res.json()) as { storageId: Id<"_storage"> }
        storageId = json.storageId
      }
      await add({
        label: labelEn.trim(),
        labelNl: labelNl.trim(),
        description: descEn.trim(),
        descriptionNl: descNl.trim(),
        pictogramId,
        ...(storageId ? { storageId } : {}),
      })
      reset()
      onOpenChange(false)
      toast.success("Safety icon added")
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a safety icon</DialogTitle>
          <DialogDescription>
            Upload your own image or pick a bundled pictogram, and give it a
            caption in both languages.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Image */}
          <div className="space-y-2">
            <div className="flex items-center overflow-hidden rounded-md border text-xs">
              {(["pictogram", "upload"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setImageMode(m)}
                  className={cn(
                    "flex-1 px-3 py-1.5 font-medium",
                    imageMode === m
                      ? "bg-blue-600 text-white"
                      : "bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  {m === "pictogram" ? "Use a pictogram" : "Upload an image"}
                </button>
              ))}
            </div>
            {imageMode === "pictogram" ? (
              <PictogramPicker value={pictogramId} onChange={setPictogramId} />
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
                  {filePreview ? (
                    <img
                      src={filePreview}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <ImagePlus className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-1">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {file ? "Replace image" : "Choose image"}
                  </Button>
                  <p className="text-[10px] text-muted-foreground">
                    PNG, JPG, SVG or WebP. Square works best.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Bilingual captions */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Label (English)</Label>
              <Input
                value={labelEn}
                onChange={(e) => setLabelEn(e.target.value)}
                placeholder="Cut-resistant gloves"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Label (Nederlands)</Label>
              <Input
                value={labelNl}
                onChange={(e) => setLabelNl(e.target.value)}
                placeholder="Snijbestendige handschoenen"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Description (English)</Label>
              <Textarea
                value={descEn}
                onChange={(e) => setDescEn(e.target.value)}
                placeholder="Optional"
                className="min-h-[3rem] text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Description (Nederlands)</Label>
              <Textarea
                value={descNl}
                onChange={(e) => setDescNl(e.target.value)}
                placeholder="Optioneel"
                className="min-h-[3rem] text-xs"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false)
              reset()
            }}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={() => void onAdd()} disabled={busy || !labelEn.trim()}>
            {busy ? "Adding…" : "Add safety icon"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PictogramPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {PPE_PICTOGRAM_IDS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "rounded-md border p-1 transition-colors",
            value === id
              ? "border-primary ring-1 ring-primary"
              : "border-input hover:bg-muted",
          )}
          title={id}
        >
          <img src={ppeDataUrl(id)} alt="" width={28} height={28} draggable={false} />
        </button>
      ))}
    </div>
  )
}
