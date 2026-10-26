// AddAssetModal — create a Site Asset. Asset ID + name are required;
// description and a photo are optional. The photo uploads to Convex storage
// and the resulting storageId is stored on the asset.

import { errorText } from "@/lib/errorText"
import { useRef, useState } from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { ImagePlus, Loader2, X } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useCheckIn } from "@/lib/checkIn"

interface AddAssetModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (id: string) => void
}

export function AddAssetModal({ open, onOpenChange, onCreated }: AddAssetModalProps) {
  const createAsset = useMutation(api.assets.create)
  const { person } = useCheckIn()
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)

  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setCode("")
    setName("")
    setDescription("")
    setImageFile(null)
    setImagePreview(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  function pickImage(file: File) {
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  async function save() {
    if (!code.trim() || !name.trim()) {
      toast.error("Asset ID and name are required")
      return
    }
    setSaving(true)
    try {
      let imageStorageId: Id<"_storage"> | null = null
      if (imageFile) {
        const uploadUrl = await generateUploadUrl()
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": imageFile.type || "application/octet-stream" },
          body: imageFile,
        })
        if (!res.ok) throw new Error(`Image upload failed: ${res.status}`)
        const json = (await res.json()) as { storageId: Id<"_storage"> }
        imageStorageId = json.storageId
      }
      const id = await createAsset({
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || null,
        imageStorageId,
        personId: person?._id,
      })
      toast.success(`Asset ${code.trim()} created`)
      reset()
      onOpenChange(false)
      onCreated?.(id)
    } catch (err) {
      toast.error(errorText(err, "The Asset could not be added. Try again."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add asset</DialogTitle>
          <DialogDescription>
            Asset ID and name are required. Description and photo are optional.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Asset ID <span className="text-destructive">*</span>
              </Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="RMR-101"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Asset name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Raw-meal reactor"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional: what this asset is and where it sits."
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Photo</Label>
            {imagePreview ? (
              <div className="relative w-fit">
                <img
                  src={imagePreview}
                  alt="Asset preview"
                  className="max-h-40 rounded-md border"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute -right-2 -top-2 h-6 w-6 rounded-full"
                  onClick={() => {
                    setImageFile(null)
                    setImagePreview(null)
                    if (fileRef.current) fileRef.current.value = ""
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <label
                htmlFor="asset-image"
                className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-muted-foreground/30 bg-muted/20 text-xs text-muted-foreground transition-colors hover:bg-muted/40"
              >
                <ImagePlus className="h-5 w-5" />
                Click to add a photo (optional)
              </label>
            )}
            <input
              id="asset-image"
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) pickImage(f)
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Creating…
              </>
            ) : (
              "Create asset"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
