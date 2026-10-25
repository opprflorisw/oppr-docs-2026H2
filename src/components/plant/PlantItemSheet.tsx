import { useMemo, useState } from "react"
import { Link } from "wouter"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { Boxes, FileText, GraduationCap, Pencil, Plus, Sparkles, Trash2, Award, X } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCheckIn } from "@/lib/checkIn"
import { errorText } from "@/components/captures/captureUi"
import {
  KIND,
  RELATION,
  RELATION_TYPES,
  isEditor,
  relationsOf,
  type PlantData,
  type PlantItem,
  type PlantKind,
  type RelationType,
} from "./plantModel"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function LinkRow({ href, icon: Icon, code, label }: { href: string; icon: typeof FileText; code?: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm hover:bg-muted/50"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      {code && <span className="shrink-0 font-mono text-xs text-muted-foreground">{code}</span>}
      <span className="truncate">{label}</span>
    </Link>
  )
}

/** One Plant item: what it is, its words, its Knowledge and its relations. */
export function PlantItemSheet({
  data,
  itemId,
  onOpenItem,
  onClose,
  onEdit,
}: {
  data: PlantData
  itemId: Id<"plantItems"> | null
  onOpenItem: (id: Id<"plantItems">) => void
  onClose: () => void
  onEdit: (item: PlantItem) => void
}) {
  const { person } = useCheckIn()
  const editor = isEditor(person)
  const item = itemId ? (data.items.find((i) => i._id === itemId) ?? null) : null
  const relations = useMemo(() => (item ? relationsOf(data, item._id) : []), [data, item])
  const grouped = useMemo(() => {
    const m = new Map<string, typeof relations>()
    for (const r of relations) m.set(r.label, [...(m.get(r.label) ?? []), r])
    return Array.from(m.entries())
  }, [relations])

  const removeItem = useMutation(api.plant.plant.removeItem)
  const addRelation = useMutation(api.plant.plant.addRelation)
  const removeRelation = useMutation(api.plant.plant.removeRelation)
  const [relType, setRelType] = useState<RelationType>("related_to")
  const [relTarget, setRelTarget] = useState("")

  const area = item?.areaCode ? data.areas.find((a) => a.code === item.areaCode) : null
  const assetById = new Map(data.assets.map((a) => [a._id, a]))
  const candidates = useMemo(() => {
    if (!item) return [] as [PlantKind, PlantItem[]][]
    const out = new Map<PlantKind, PlantItem[]>()
    for (const i of data.items) if (i._id !== item._id) out.set(i.kind, [...(out.get(i.kind) ?? []), i])
    return Array.from(out.entries())
  }, [data.items, item])

  async function onRemove() {
    if (!person || !item) return
    if (!window.confirm(`Remove "${item.name}" from the Plant? Its relations go with it.`)) return
    try {
      await removeItem({ personId: person._id, id: item._id })
      toast.success("Removed")
      onClose()
    } catch (e) {
      toast.error(errorText(e, "Could not remove it."))
    }
  }

  async function onAddRelation() {
    if (!person || !item || !relTarget) return
    try {
      await addRelation({ personId: person._id, fromId: item._id, toId: relTarget as Id<"plantItems">, type: relType })
      setRelTarget("")
    } catch (e) {
      toast.error(errorText(e, "Could not add the relation."))
    }
  }

  const links = item?.links
  const nothingLinked =
    !links ||
    links.documentIds.length + links.assetIds.length + links.trainingIds.length + links.skillIds.length === 0

  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {item && (
          <div className="space-y-6">
            <SheetHeader className="space-y-1 text-left">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {(() => {
                  const Icon = KIND[item.kind].icon
                  return <Icon className="h-3.5 w-3.5" aria-hidden />
                })()}
                {KIND[item.kind].label}
                {area && (
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {area.code}
                  </Badge>
                )}
                {item.source === "ai" && (
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3" aria-hidden /> Proposed from documents
                  </span>
                )}
              </div>
              <SheetTitle className="pr-6 text-xl">
                {item.name}
                {item.code && <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">{item.code}</span>}
              </SheetTitle>
              <SheetDescription className="whitespace-pre-line text-sm text-foreground/80">
                {item.description || "No description yet."}
              </SheetDescription>
            </SheetHeader>

            {editor && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onEdit(item)}>
                  <Pencil className="h-4 w-4" aria-hidden /> Edit
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={onRemove}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Remove
                </Button>
              </div>
            )}

            {item.synonyms.length > 0 && (
              <Section title="Also called">
                <div className="flex flex-wrap gap-1.5">
                  {item.synonyms.map((s) => (
                    <Badge key={s} variant="secondary" className="font-normal">
                      {s}
                    </Badge>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Knowledge">
              {nothingLinked ? (
                <p className="text-sm text-muted-foreground">Nothing linked yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {links!.documentIds.map((id) => {
                    const d = data.documents[id]
                    return d ? <LinkRow key={id} href={`/docs/${id}`} icon={FileText} code={d.code} label={d.title} /> : null
                  })}
                  {links!.assetIds.map((id) => {
                    const a = assetById.get(id)
                    return a ? <LinkRow key={id} href={`/assets/${id}`} icon={Boxes} code={a.code} label={a.name} /> : null
                  })}
                  {links!.trainingIds.map((id) => {
                    const t = data.trainings[id]
                    return t ? (
                      <LinkRow key={id} href={`/learn/trainings/${id}`} icon={GraduationCap} code={t.code} label={t.title} />
                    ) : null
                  })}
                  {links!.skillIds.map((id) => {
                    const s = data.skills[id]
                    return s ? <LinkRow key={id} href="/learn?tab=matrix" icon={Award} label={`Skill: ${s.name}`} /> : null
                  })}
                </div>
              )}
            </Section>

            <Section title="Related">
              {grouped.length === 0 && <p className="text-sm text-muted-foreground">Not linked to other items yet, such as what it uses or what it feeds into.</p>}
              <div className="space-y-3">
                {grouped.map(([label, rows]) => (
                  <div key={label} className="space-y-1">
                    <p className="text-sm font-medium">{label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {rows.map((r) => (
                        <span key={r.id} className="inline-flex items-center rounded-full border bg-card text-sm">
                          <button
                            type="button"
                            className="rounded-full px-2.5 py-0.5 hover:bg-muted"
                            onClick={() => onOpenItem(r.other._id)}
                          >
                            {r.other.name}
                          </button>
                          {editor && (
                            <button
                              type="button"
                              aria-label={`Remove relation to ${r.other.name}`}
                              className="mr-1 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              onClick={() =>
                                person &&
                                removeRelation({ personId: person._id, id: r.id }).catch((e) =>
                                  toast.error(errorText(e, "Could not remove it.")),
                                )
                              }
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {editor && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2">
                  <Select value={relType} onValueChange={(v) => setRelType(v as RelationType)}>
                    <SelectTrigger className="h-8 w-36" aria-label="Relation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RELATION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {RELATION[t].out}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={relTarget} onValueChange={setRelTarget}>
                    <SelectTrigger className="h-8 min-w-0 flex-1" aria-label="Related item">
                      <SelectValue placeholder="Pick an item" />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map(([kind, rows]) => (
                        <SelectGroup key={kind}>
                          <SelectLabel>{KIND[kind].plural}</SelectLabel>
                          {rows.map((r) => (
                            <SelectItem key={r._id} value={r._id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="h-8" disabled={!relTarget} onClick={onAddRelation}>
                    <Plus className="h-4 w-4" aria-hidden /> Add
                  </Button>
                </div>
              )}
            </Section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
