// PPE configurator — the Safety Icons tab on the Templates page.
//
// Lists every PPE item with its real ISO 7010 pictogram, lets you toggle which
// appear in the editor's PPE picker, edit the English + Dutch caption and
// description (two tabs), and delete custom ones. Built-in items can be
// deactivated but not deleted. A language switch (top-right) selects whether the
// app and exports show English or Dutch copy. The "Add" button (top-right) opens
// a modal where you upload your own image or pick a bundled pictogram and fill
// in both languages. Self-seeds the factory catalog on first visit.

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { ImagePlus, Plus, Trash2, Upload } from "lucide-react"
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { PPE_PICTOGRAM_IDS, ppeDataUrl } from "@/lib/ppePictograms"
import { ppeImageSrc } from "@/lib/ppeCatalog"
import { errorText, useEditorMutation } from "@/components/settings/SettingsBits"

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

function Pictogram({
  meta,
  size = 28,
}: {
  meta: { imageUrl?: string | null; pictogramId: string }
  size?: number
}) {
  return (
    <img
      src={ppeImageSrc(meta)}
      alt=""
      width={size}
      height={size}
      className="shrink-0 object-contain"
      draggable={false}
    />
  )
}

export function PpeConfigurator() {
  const rows = useQuery(api.ppe.list) as PpeRow[] | undefined
  const seed = useMutation(api.ppe.seedIfEmpty)
  const language = (useQuery(api.ppe.getLanguage) ?? "en") as Lang
  const setLanguage = useEditorMutation(api.ppe.setLanguage)
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    if (rows !== undefined && rows.length === 0) {
      void seed({}).catch(() => {})
    }
  }, [rows, seed])

  const activeCount = useMemo(
    () => (rows ?? []).filter((r) => r.active).length,
    [rows],
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Safety icons</CardTitle>
            <CardDescription className="text-xs">
              The personal protective equipment authors can add to a document.
              Only active items appear in the editor&rsquo;s PPE picker. Built-in
              items can be switched off but not deleted.
              {rows !== undefined && (
                <span className="ml-1 font-medium text-foreground">
                  {activeCount} active.
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
            <div className="flex items-center overflow-hidden rounded-md border">
              {(["en", "nl"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => void setLanguage({ language: l })}
                  className={cn(
                    "px-2.5 py-1.5 text-xs font-semibold uppercase",
                    language === l
                      ? "bg-blue-600 text-white"
                      : "bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows === undefined ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Seeding defaults…</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((r) => (
              <PpeItemRow key={r._id} row={r} language={language} />
            ))}
          </div>
        )}
      </CardContent>
      <AddPpeDialog open={addOpen} onOpenChange={setAddOpen} />
    </Card>
  )
}

function PpeItemRow({ row, language }: { row: PpeRow; language: Lang }) {
  const setActive = useEditorMutation(api.ppe.setActive)
  const update = useEditorMutation(api.ppe.update)
  const remove = useEditorMutation(api.ppe.remove)
  const [editing, setEditing] = useState(false)

  async function guard(fn: () => Promise<unknown>) {
    try {
      await fn()
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  const shownLabel =
    (language === "nl" ? row.labelNl || row.label : row.labelEn || row.label) ||
    row.label
  const shownDescription =
    language === "nl" ? row.descriptionNl || row.description : row.description

  return (
    <div
      className={cn(
        "flex flex-col rounded-md border p-2.5",
        row.active ? "bg-card" : "bg-muted/40 opacity-70",
      )}
    >
      <div className="flex items-center gap-2.5">
        <Pictogram meta={row} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{shownLabel}</span>
            {row.builtIn && (
              <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">
                built-in
              </span>
            )}
          </div>
          {shownDescription && (
            <p className="truncate text-[11px] text-muted-foreground">
              {shownDescription}
            </p>
          )}
        </div>
        <Switch
          checked={row.active}
          onCheckedChange={(v) =>
            void guard(() => setActive({ id: row._id, active: v }))
          }
        />
      </div>
      <div className="mt-2 flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? "Close" : "Edit"}
        </Button>
        {!row.builtIn && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => void guard(() => remove({ id: row._id }))}
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
      {editing && (
        <div className="mt-2 border-t pt-2">
          <Tabs defaultValue={language} className="w-full">
            <TabsList className="grid h-8 w-full grid-cols-2">
              <TabsTrigger value="en" className="text-[11px]">
                English
              </TabsTrigger>
              <TabsTrigger value="nl" className="text-[11px]">
                Nederlands
              </TabsTrigger>
            </TabsList>
            <TabsContent value="en" className="mt-2 space-y-2">
              <Input
                defaultValue={row.labelEn ?? row.label}
                className="h-8 text-xs"
                placeholder="English label"
                onBlur={(e) =>
                  e.target.value.trim() !== (row.labelEn ?? row.label) &&
                  void guard(() => update({ id: row._id, label: e.target.value }))
                }
              />
              <Textarea
                defaultValue={row.description ?? ""}
                className="min-h-[3rem] text-xs"
                placeholder="English description"
                onBlur={(e) =>
                  (e.target.value.trim() || null) !== row.description &&
                  void guard(() =>
                    update({ id: row._id, description: e.target.value }),
                  )
                }
              />
            </TabsContent>
            <TabsContent value="nl" className="mt-2 space-y-2">
              <Input
                defaultValue={row.labelNl ?? ""}
                className="h-8 text-xs"
                placeholder="Nederlandse naam"
                onBlur={(e) =>
                  (e.target.value.trim() || null) !== (row.labelNl ?? null) &&
                  void guard(() => update({ id: row._id, labelNl: e.target.value }))
                }
              />
              <Textarea
                defaultValue={row.descriptionNl ?? ""}
                className="min-h-[3rem] text-xs"
                placeholder="Nederlandse omschrijving"
                onBlur={(e) =>
                  (e.target.value.trim() || null) !== (row.descriptionNl ?? null) &&
                  void guard(() =>
                    update({ id: row._id, descriptionNl: e.target.value }),
                  )
                }
              />
            </TabsContent>
          </Tabs>
          {!row.imageUrl && (
            <div className="mt-2 space-y-1">
              <Label className="text-[10px] text-muted-foreground">Pictogram</Label>
              <PictogramPicker
                value={row.pictogramId}
                onChange={(id) =>
                  void guard(() => update({ id: row._id, pictogramId: id }))
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
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
            "rounded border p-0.5 transition-colors",
            value === id
              ? "border-primary ring-1 ring-primary"
              : "border-input hover:bg-muted",
          )}
          title={id}
        >
          <img src={ppeDataUrl(id)} alt="" width={24} height={24} draggable={false} />
        </button>
      ))}
    </div>
  )
}
