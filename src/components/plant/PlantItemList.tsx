import { Boxes, FileText, GraduationCap, Award } from "lucide-react"
import type { Id } from "../../../convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { KIND, itemMatches, relationsOf, type PlantData, type PlantItem, type PlantKind } from "./plantModel"

function Counts({ item }: { item: PlantItem }) {
  const l = item.links
  const rows = [
    { n: l.documentIds.length, icon: FileText, label: "documents" },
    { n: l.assetIds.length, icon: Boxes, label: "Assets" },
    { n: l.trainingIds.length, icon: GraduationCap, label: "Trainings" },
    { n: l.skillIds.length, icon: Award, label: "Skills" },
  ].filter((r) => r.n > 0)
  if (rows.length === 0) return null
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      {rows.map((r) => (
        <span key={r.label} className="inline-flex items-center gap-1" title={`${r.n} ${r.label}`}>
          <r.icon className="h-3.5 w-3.5" aria-hidden />
          {r.n}
        </span>
      ))}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{text}</p>
}

/** Cards for one or two kinds, e.g. processes and products. */
export function PlantItemList({
  data,
  kinds,
  search,
  editor,
  onOpenItem,
}: {
  data: PlantData
  kinds: PlantKind[]
  search: string
  editor: boolean
  onOpenItem: (id: Id<"plantItems">) => void
}) {
  return (
    <div className="space-y-8" data-tour="plant-items">
      {kinds.map((kind) => {
        const all = data.items.filter((i) => i.kind === kind)
        const rows = all.filter((i) => itemMatches(i, search))
        const Icon = KIND[kind].icon
        return (
          <section key={kind} className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
              {KIND[kind].plural}
              <span className="font-normal text-muted-foreground">{rows.length}</span>
            </h2>
            {rows.length === 0 ? (
              <Empty
                text={
                  search
                    ? "Nothing matches."
                    : editor
                      ? `No ${KIND[kind].plural.toLowerCase()} yet. Add one, or propose them from documents.`
                      : `No ${KIND[kind].plural.toLowerCase()} yet.`
                }
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rows.map((i) => {
                  const rel = relationsOf(data, i._id)
                  return (
                    <button
                      key={i._id}
                      type="button"
                      onClick={() => onOpenItem(i._id)}
                      className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
                    >
                      <div className="flex items-start gap-2">
                        <span className="flex-1 font-medium leading-snug">{i.name}</span>
                        {i.areaCode && (
                          <Badge variant="outline" className="shrink-0 font-mono text-[11px]">
                            {i.areaCode}
                          </Badge>
                        )}
                      </div>
                      {i.description && <p className="line-clamp-2 text-sm text-muted-foreground">{i.description}</p>}
                      {i.synonyms.length > 0 && (
                        <p className="truncate text-xs text-muted-foreground">Also: {i.synonyms.join(", ")}</p>
                      )}
                      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                        <Counts item={i} />
                        {rel.length > 0 && (
                          <span
                            className="text-xs text-muted-foreground"
                            title={rel.map((r) => `${r.label} ${r.other.name}`).join("\n")}
                          >
                            Linked to {rel.length} other item{rel.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

/** The glossary: one row per term, searchable on every word for it. */
export function PlantGlossary({
  data,
  search,
  editor,
  onOpenItem,
}: {
  data: PlantData
  search: string
  editor: boolean
  onOpenItem: (id: Id<"plantItems">) => void
}) {
  const terms = data.items
    .filter((i) => i.kind === "term" && itemMatches(i, search))
    .sort((a, b) => a.name.localeCompare(b.name))
  if (terms.length === 0)
    return (
      <Empty
        text={search ? "No term matches. Try the Dutch word." : editor ? "No terms yet. Add the first word people use." : "No terms yet."}
      />
    )
  return (
    <div className="rounded-md border bg-card" data-tour="plant-glossary">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-48">Term</TableHead>
            <TableHead className="w-64">Also called</TableHead>
            <TableHead>Meaning</TableHead>
            <TableHead className="w-16">Area</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {terms.map((t) => (
            <TableRow key={t._id} className="cursor-pointer" onClick={() => onOpenItem(t._id)}>
              <TableCell className="font-medium">{t.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{t.synonyms.join(", ")}</TableCell>
              <TableCell className="text-sm">{t.description}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{t.areaCode ?? ""}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
