import { useEffect, useState } from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { BadgeCheck, Building2, Plus, Trash2 } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { useCheckIn } from "@/lib/checkIn"
import { errorText } from "@/components/captures/captureUi"
import { KIND, type PlantData, type PlantKind, type PlantTab } from "./plantModel"

function Prose({ text, empty }: { text: string | undefined; empty: string }) {
  if (!text?.trim()) return <p className="text-sm text-muted-foreground">{empty}</p>
  return <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{text}</p>
}

const COUNTED: { kind: PlantKind; tab: PlantTab }[] = [
  { kind: "line", tab: "structure" },
  { kind: "process", tab: "processes" },
  { kind: "product", tab: "processes" },
  { kind: "material", tab: "materials" },
  { kind: "hazard", tab: "materials" },
  { kind: "role", tab: "roles" },
  { kind: "term", tab: "glossary" },
]

/** Overview: the background of the organization, in its own words. */
export function PlantOverview({
  data,
  editor,
  onEdit,
  onGo,
}: {
  data: PlantData
  editor: boolean
  onEdit: () => void
  onGo: (tab: PlantTab) => void
}) {
  const p = data.profile
  const name = data.companyName ?? "Your organization"
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-primary" aria-hidden />
              {name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Prose
              text={p?.about}
              empty={
                editor
                  ? "Nothing written yet. Choose Edit background to say who you are and what you make."
                  : "An Engineer has not written the background yet."
              }
            />
          </CardContent>
        </Card>
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Products and customers</CardTitle>
            </CardHeader>
            <CardContent>
              <Prose text={p?.productsAndCustomers} empty="Not written yet." />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">History</CardTitle>
            </CardHeader>
            <CardContent>
              <Prose text={p?.history} empty="Not written yet." />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quality policy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Prose text={p?.qualityPolicy} empty="Not written yet." />
            {(p?.certifications.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {p!.certifications.map((c) => (
                  <Badge key={c} variant="secondary" className="gap-1 font-normal">
                    <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
                    {c}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Key facts</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {p?.headcount != null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">People</dt>
                  <dd className="text-right font-medium">{p.headcount}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Areas</dt>
                <dd className="text-right font-medium">{data.areas.length}</dd>
              </div>
              {(p?.keyFacts ?? []).map((f) => (
                <div key={f.label} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="text-right font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
            {editor && !p && (
              <Button variant="link" className="mt-2 h-auto p-0" onClick={onEdit}>
                Add key facts
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recorded so far</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {COUNTED.map(({ kind, tab }) => {
              const n = data.items.filter((i) => i.kind === kind).length
              const Icon = KIND[kind].icon
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => onGo(tab)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span className="flex-1">{kind === "term" ? "Glossary terms" : KIND[kind].plural}</span>
                  <span className="font-medium tabular-nums">{n}</span>
                </button>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/** Edit the background. The company name and logo stay in Settings. */
export function PlantProfileDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  data: PlantData
}) {
  const { person } = useCheckIn()
  const save = useMutation(api.plant.plant.saveProfile)
  const [about, setAbout] = useState("")
  const [history, setHistory] = useState("")
  const [products, setProducts] = useState("")
  const [policy, setPolicy] = useState("")
  const [certs, setCerts] = useState("")
  const [headcount, setHeadcount] = useState("")
  const [facts, setFacts] = useState<{ label: string; value: string }[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const p = data.profile
    setAbout(p?.about ?? "")
    setHistory(p?.history ?? "")
    setProducts(p?.productsAndCustomers ?? "")
    setPolicy(p?.qualityPolicy ?? "")
    setCerts((p?.certifications ?? []).join("\n"))
    setHeadcount(p?.headcount != null ? String(p.headcount) : "")
    setFacts(p?.keyFacts.length ? p.keyFacts : [{ label: "", value: "" }])
  }, [open, data.profile])

  async function submit() {
    if (!person) return
    setBusy(true)
    try {
      const n = Number.parseInt(headcount, 10)
      await save({
        personId: person._id,
        about,
        history,
        productsAndCustomers: products,
        qualityPolicy: policy,
        certifications: certs.split("\n"),
        headcount: Number.isFinite(n) ? n : null,
        keyFacts: facts,
      })
      toast.success("Background saved")
      onOpenChange(false)
    } catch (e) {
      toast.error(errorText(e, "Could not save."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit background</DialogTitle>
          <DialogDescription>
            Who you are, in plain words. Ask, Wikis and the writing assistant read this as background. The company
            name and logo are set in Settings.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="pp-about">Who we are</Label>
            <Textarea id="pp-about" rows={4} value={about} onChange={(e) => setAbout(e.target.value)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pp-products">Products and customers</Label>
              <Textarea id="pp-products" rows={4} value={products} onChange={(e) => setProducts(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-history">History</Label>
              <Textarea id="pp-history" rows={4} value={history} onChange={(e) => setHistory(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp-policy">Quality policy</Label>
            <Textarea id="pp-policy" rows={3} value={policy} onChange={(e) => setPolicy(e.target.value)} />
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_9rem]">
            <div className="space-y-1.5">
              <Label htmlFor="pp-certs">Certifications, one per line</Label>
              <Textarea id="pp-certs" rows={3} value={certs} onChange={(e) => setCerts(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-head">People</Label>
              <Input id="pp-head" inputMode="numeric" value={headcount} onChange={(e) => setHeadcount(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Key facts</Label>
            {facts.map((f, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  aria-label="Fact"
                  placeholder="Founded"
                  className="w-40"
                  value={f.label}
                  onChange={(e) => setFacts(facts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                />
                <Input
                  aria-label="Value"
                  placeholder="1987"
                  value={f.value}
                  onChange={(e) => setFacts(facts.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove fact"
                  onClick={() => setFacts(facts.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setFacts([...facts, { label: "", value: "" }])}>
              <Plus className="h-4 w-4" aria-hidden /> Add fact
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
