import { useEffect, useState } from "react"
import { Link } from "wouter"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { Boxes, Building2, MapPinned, Pencil, Route } from "lucide-react"
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
import { areaOfAsset, type PlantArea, type PlantData, type PlantItem } from "./plantModel"

type AssetRow = PlantData["assets"][number]

function AssetChip({ a }: { a: AssetRow }) {
  return (
    <Link
      href={`/assets/${a._id}`}
      className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted"
    >
      <Boxes className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      <span className="font-mono font-medium">{a.code}</span>
      <span className="text-muted-foreground">{a.name}</span>
    </Link>
  )
}

/** Site > area > line > Asset. Areas are the naming locations (one source). */
export function PlantStructure({
  data,
  editor,
  onOpenItem,
  onEditArea,
}: {
  data: PlantData
  editor: boolean
  onOpenItem: (id: Id<"plantItems">) => void
  onEditArea: (area: PlantArea) => void
}) {
  const sites = data.items.filter((i) => i.kind === "site")
  const lines = data.items.filter((i) => i.kind === "line")
  const assetById = new Map(data.assets.map((a) => [a._id, a]))
  const onALine = new Set(lines.flatMap((l) => l.links.assetIds))

  const groups: { site: PlantItem | null; areas: PlantArea[] }[] = [
    ...sites.map((s) => ({ site: s, areas: data.areas.filter((a) => a.siteId === s._id) })),
    { site: null, areas: data.areas.filter((a) => !a.siteId || !sites.some((s) => s._id === a.siteId)) },
  ].filter((g) => g.site || g.areas.length > 0)

  const unplaced = data.assets.filter((a) => !onALine.has(a._id) && !areaOfAsset(a, data.areas))

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Areas are the locations of the naming codes. Add or rename them in{" "}
        <Link href="/settings/naming" className="underline underline-offset-2">
          Settings, Naming
        </Link>
        .
      </p>
      {groups.map((g) => (
        <section key={g.site?._id ?? "none"} className="rounded-lg border bg-card">
          <header className="flex items-center gap-2 border-b px-4 py-3">
            <Building2 className="h-4 w-4 text-primary" aria-hidden />
            {g.site ? (
              <button type="button" className="font-semibold hover:underline" onClick={() => onOpenItem(g.site!._id)}>
                {g.site.name}
              </button>
            ) : (
              <span className="font-semibold text-muted-foreground">Areas without a site</span>
            )}
            {g.site?.code && <span className="font-mono text-xs text-muted-foreground">{g.site.code}</span>}
            <span className="ml-auto text-xs text-muted-foreground">
              {g.areas.length} area{g.areas.length === 1 ? "" : "s"}
            </span>
          </header>
          <div className="divide-y">
            {g.areas.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted-foreground">No areas on this site yet.</p>
            )}
            {g.areas.map((area) => {
              const areaLines = lines.filter((l) => l.areaCode === area.code)
              const loose = data.assets.filter((a) => !onALine.has(a._id) && areaOfAsset(a, data.areas) === area.code)
              return (
                <div key={area.code} className="space-y-3 px-4 py-4">
                  <div className="flex items-start gap-3">
                    <MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-xs font-semibold">{area.code}</span>
                        <span className="font-medium">{area.label}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{area.description || "No description yet."}</p>
                    </div>
                    {editor && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Edit area ${area.code}`}
                        onClick={() => onEditArea(area)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="ml-7 space-y-2">
                    {areaLines.map((l) => (
                      <div key={l._id} className="rounded-md border bg-muted/20 p-3">
                        <button
                          type="button"
                          onClick={() => onOpenItem(l._id)}
                          className="flex items-center gap-2 text-left text-sm font-medium hover:underline"
                        >
                          <Route className="h-4 w-4 text-muted-foreground" aria-hidden />
                          {l.name}
                          {l.code && <span className="font-mono text-xs text-muted-foreground">{l.code}</span>}
                        </button>
                        {l.description && <p className="mt-1 text-xs text-muted-foreground">{l.description}</p>}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {l.links.assetIds.map((id) => {
                            const a = assetById.get(id)
                            return a ? <AssetChip key={id} a={a} /> : null
                          })}
                          {l.links.assetIds.length === 0 && (
                            <span className="text-xs text-muted-foreground">No Assets on this line in Oppr yet.</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {loose.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Not on a line:</span>
                        {loose.map((a) => (
                          <AssetChip key={a._id} a={a} />
                        ))}
                      </div>
                    )}
                    {areaLines.length === 0 && loose.length === 0 && (
                      <p className="text-xs text-muted-foreground">No lines or Assets in this area yet.</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
      {unplaced.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Assets without an area</h3>
          <div className="flex flex-wrap gap-1.5">
            {unplaced.map((a) => (
              <AssetChip key={a._id} a={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

const NO_SITE = "__none__"

export function PlantAreaDialog({
  area,
  data,
  onClose,
}: {
  area: PlantArea | null
  data: PlantData
  onClose: () => void
}) {
  const { person } = useCheckIn()
  const save = useMutation(api.plant.plant.saveArea)
  const [description, setDescription] = useState("")
  const [site, setSite] = useState(NO_SITE)
  const sites = data.items.filter((i) => i.kind === "site")

  useEffect(() => {
    if (!area) return
    setDescription(area.description)
    setSite(area.siteId ?? NO_SITE)
  }, [area])

  async function submit() {
    if (!person || !area) return
    try {
      await save({
        personId: person._id,
        areaCode: area.code,
        description,
        siteId: site === NO_SITE ? null : (site as Id<"plantItems">),
      })
      toast.success("Area saved")
      onClose()
    } catch (e) {
      toast.error(errorText(e, "Could not save."))
    }
  }

  return (
    <Dialog open={!!area} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {area?.code} · {area?.label}
          </DialogTitle>
          <DialogDescription>The code and name come from Settings, Naming. Here you add what the area is.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="area-desc">Description</Label>
            <Textarea id="area-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Site</Label>
            <Select value={site} onValueChange={setSite}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SITE}>No site</SelectItem>
                {sites.map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
