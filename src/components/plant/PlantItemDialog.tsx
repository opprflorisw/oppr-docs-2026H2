import { useEffect, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCheckIn } from "@/lib/checkIn"
import { errorText } from "@/components/captures/captureUi"
import { LinkPicker } from "./LinkPicker"
import { KIND, type PlantArea, type PlantItem, type PlantKind } from "./plantModel"

const NO_AREA = "__none__"

const NAME_HINT: Partial<Record<PlantKind, string>> = {
  term: "For example: Screen pack",
  process: "For example: Colour and product changeover",
  hazard: "For example: Hot surfaces and molten plastic",
  line: "For example: Extrusion line 2",
}

/** Add or edit one Plant item: words, area and links to Knowledge. */
export function PlantItemDialog({
  open,
  onOpenChange,
  kind,
  item,
  areas,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: PlantKind
  item: PlantItem | null
  areas: PlantArea[]
  onSaved?: (id: Id<"plantItems">) => void
}) {
  const { person } = useCheckIn()
  const options = useQuery(api.plant.plant.linkOptions, open ? {} : "skip")
  const save = useMutation(api.plant.plant.saveItem)

  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [area, setArea] = useState(NO_AREA)
  const [description, setDescription] = useState("")
  const [synonyms, setSynonyms] = useState("")
  const [docs, setDocs] = useState<string[]>([])
  const [assets, setAssets] = useState<string[]>([])
  const [trainings, setTrainings] = useState<string[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(item?.name ?? "")
    setCode(item?.code ?? "")
    setArea(item?.areaCode ?? NO_AREA)
    setDescription(item?.description ?? "")
    setSynonyms((item?.synonyms ?? []).join(", "))
    setDocs(item?.links.documentIds ?? [])
    setAssets(item?.links.assetIds ?? [])
    setTrainings(item?.links.trainingIds ?? [])
    setSkills(item?.links.skillIds ?? [])
  }, [open, item])

  const k = item?.kind ?? kind
  const label = KIND[k].label
  const showCode = k === "site" || k === "line"
  const isTerm = k === "term"

  async function submit() {
    if (!person) {
      toast.error("Check in as an Engineer first.")
      return
    }
    setBusy(true)
    try {
      const id = await save({
        personId: person._id,
        id: item?._id,
        kind: k,
        name,
        code: showCode ? code || null : (item?.code ?? null),
        description,
        areaCode: area === NO_AREA ? null : area,
        synonyms: synonyms.split(/[,;\n]/),
        links: {
          documentIds: docs as Id<"documents">[],
          assetIds: assets as Id<"assets">[],
          trainingIds: trainings as Id<"trainings">[],
          skillIds: skills as Id<"skills">[],
        },
      })
      toast.success(item ? `${label} saved` : `${label} added`)
      onOpenChange(false)
      onSaved?.(id)
    } catch (e) {
      toast.error(errorText(e, "Could not save."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}</DialogTitle>
          <DialogDescription>
            {isTerm
              ? "A word people use, what it means, and the other words for it."
              : "Describe it once, then link the Knowledge that covers it."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <div className="space-y-1.5">
              <Label htmlFor="plant-name">{isTerm ? "Term" : "Name"}</Label>
              <Input
                id="plant-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={NAME_HINT[k] ?? ""}
                autoFocus
              />
            </div>
            {showCode && (
              <div className="space-y-1.5">
                <Label htmlFor="plant-code">Code</Label>
                <Input id="plant-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="L2" />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plant-syn">{isTerm ? "Also called" : "Other words for it"}</Label>
            <Input
              id="plant-syn"
              value={synonyms}
              onChange={(e) => setSynonyms(e.target.value)}
              placeholder="Abbreviations and Dutch words, separated by commas"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plant-desc">{isTerm ? "Meaning" : "Description"}</Label>
            <Textarea id="plant-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {k !== "site" && (
            <div className="space-y-1.5">
              <Label>Area</Label>
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_AREA}>Whole plant</SelectItem>
                  {areas.map((a) => (
                    <SelectItem key={a.code} value={a.code}>
                      {a.code} · {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <p className="text-sm font-medium">Links</p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Documents</Label>
              <LinkPicker options={options?.documents ?? []} value={docs} onChange={setDocs} placeholder="Link documents" noun="document" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Assets</Label>
              <LinkPicker options={options?.assets ?? []} value={assets} onChange={setAssets} placeholder="Link Assets" noun="Asset" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Trainings</Label>
                <LinkPicker options={options?.trainings ?? []} value={trainings} onChange={setTrainings} placeholder="Link Trainings" noun="Training" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Skills</Label>
                <LinkPicker options={options?.skills ?? []} value={skills} onChange={setSkills} placeholder="Link Skills" noun="Skill" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {item ? "Save" : `Add ${label.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

