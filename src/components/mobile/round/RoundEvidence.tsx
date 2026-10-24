import { useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { Camera, ImageIcon, Loader2, StickyNote } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { errorText } from "@/components/learn/training/lib"

/**
 * The proof a Round stop asks for: a photo of the machine or a short note.
 * On a real phone "Take a photo" opens the camera. In the Floor simulator
 * there is no camera, so the Asset's own photo can stand in.
 */
export function RoundEvidence({
  attemptId,
  personId,
  stopIndex,
  kind,
  assetId,
  assetCode,
}: {
  attemptId: Id<"trainingAttempts">
  personId: Id<"people">
  stopIndex: number
  kind: "photo" | "note"
  assetId: Id<"assets">
  assetCode: string
}) {
  const addEvidence = useMutation(api.attempts.addEvidence)
  const uploadUrl = useMutation(api.files.generateUploadUrl)
  const assetPhoto = useQuery(api.assets.imageUrlFor, kind === "photo" ? { id: assetId } : "skip")
  const [text, setText] = useState("")
  const [saving, setSaving] = useState<null | "note" | "file" | "stand-in">(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function sendNote() {
    setSaving("note")
    try {
      await addEvidence({ id: attemptId, personId, stopIndex, kind: "note", text })
      toast.success("Note added")
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setSaving(null)
    }
  }

  async function sendPhoto(blob: Blob, how: "file" | "stand-in") {
    setSaving(how)
    try {
      const url = await uploadUrl()
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": blob.type || "image/jpeg" },
        body: blob,
      })
      if (!res.ok) throw new Error("The photo could not be uploaded. Try again.")
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> }
      await addEvidence({
        id: attemptId,
        personId,
        stopIndex,
        kind: "photo",
        storageId,
        text: how === "stand-in" ? `Photo of ${assetCode} (Floor simulator)` : undefined,
      })
      toast.success("Photo added")
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setSaving(null)
    }
  }

  async function takeAssetPhoto() {
    if (!assetPhoto) return
    setSaving("stand-in")
    try {
      const res = await fetch(assetPhoto)
      if (!res.ok) throw new Error("The photo of this Asset could not be loaded. Choose an image instead.")
      await sendPhoto(await res.blob(), "stand-in")
    } catch (err) {
      toast.error(errorText(err))
      setSaving(null)
    }
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          {kind === "photo" ? <Camera className="h-4 w-4" /> : <StickyNote className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-base font-semibold">{kind === "photo" ? "Take a photo here" : "Add a short note"}</p>
          <p className="text-sm leading-snug text-muted-foreground">
            {kind === "photo"
              ? `Proof that you checked ${assetCode}. It is kept with your Training record.`
              : "What do you see? For example the reading on the gauge. It is kept with your Training record."}
          </p>
        </div>
      </div>

      {kind === "note" ? (
        <>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="For example: vacuum gauge reads -0.3 bar, water 17 °C."
            className="resize-none bg-background text-base"
          />
          <Button className="h-12 w-full rounded-xl text-base" disabled={saving !== null || !text.trim()} onClick={() => void sendNote()}>
            {saving === "note" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Add note
          </Button>
        </>
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void sendPhoto(f, "file")
              e.target.value = ""
            }}
          />
          {assetPhoto && (
            <button
              type="button"
              disabled={saving !== null}
              onClick={() => void takeAssetPhoto()}
              className="group relative block w-full overflow-hidden rounded-xl border bg-background text-left disabled:opacity-60"
            >
              <img src={assetPhoto} alt={`Photo of ${assetCode}`} className="h-28 w-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-black/60 px-2.5 py-1.5 text-[13px] font-medium text-white">
                {saving === "stand-in" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                Take this photo (stands in for the camera)
              </span>
            </button>
          )}
          <Button
            variant={assetPhoto ? "outline" : "default"}
            className="h-12 w-full gap-1.5 rounded-xl text-base"
            disabled={saving !== null}
            onClick={() => fileRef.current?.click()}
          >
            {saving === "file" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
            Choose an image
          </Button>
        </>
      )}
    </div>
  )
}
