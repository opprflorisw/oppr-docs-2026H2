import type { FunctionReturnType } from "convex/server"
import {
  AlertTriangle,
  BookA,
  Building2,
  Cog,
  Package,
  Route,
  Users,
  UserRound,
  FlaskConical,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { api } from "../../../convex/_generated/api"
import type { Doc, Id } from "../../../convex/_generated/dataModel"
import type { Person } from "@/lib/checkIn"
import { isEngineerOrAdmin } from "@/lib/roles"

export type PlantData = FunctionReturnType<typeof api.plant.plant.get>
export type PlantItem = Doc<"plantItems">
export type PlantKind = PlantItem["kind"]
export type PlantRelation = Doc<"plantRelations">
export type RelationType = PlantRelation["type"]
export type PlantArea = PlantData["areas"][number]

export const KIND: Record<PlantKind, { label: string; plural: string; icon: LucideIcon }> = {
  site: { label: "Site", plural: "Sites", icon: Building2 },
  line: { label: "Line", plural: "Lines", icon: Route },
  process: { label: "Process", plural: "Processes", icon: Cog },
  product: { label: "Product", plural: "Products", icon: Package },
  material: { label: "Material", plural: "Materials", icon: FlaskConical },
  hazard: { label: "Hazard", plural: "Hazards", icon: AlertTriangle },
  role: { label: "Role", plural: "Roles", icon: UserRound },
  team: { label: "Team", plural: "Teams", icon: Users },
  term: { label: "Term", plural: "Glossary", icon: BookA },
}

/** How a relation reads from each side. */
export const RELATION: Record<RelationType, { out: string; in: string }> = {
  part_of: { out: "Part of", in: "Includes" },
  produces: { out: "Produces", in: "Made by" },
  uses: { out: "Uses", in: "Used in" },
  runs_on: { out: "Runs on", in: "Runs here" },
  has_hazard: { out: "Hazards", in: "Hazard in" },
  done_by: { out: "Done by", in: "Does" },
  feeds: { out: "Feeds into", in: "Fed by" },
  related_to: { out: "Related to", in: "Related to" },
}

export const RELATION_TYPES = Object.keys(RELATION) as RelationType[]

export type PlantTab =
  | "overview"
  | "structure"
  | "processes"
  | "materials"
  | "roles"
  | "glossary"
  | "assets"

export const TABS: { value: PlantTab; label: string; kinds: PlantKind[]; subtitle: string }[] = [
  {
    value: "overview",
    label: "Overview",
    kinds: [],
    subtitle: "Who we are, as background for Ask, Wikis and the writing assistant. Steps and limits always come from Published documents.",
  },
  {
    value: "structure",
    label: "Structure",
    kinds: ["site", "line"],
    subtitle: "Site, areas, lines and the Assets on them.",
  },
  {
    value: "processes",
    label: "Processes and products",
    kinds: ["process", "product"],
    subtitle: "What the plant does and what it makes.",
  },
  {
    value: "materials",
    label: "Materials and hazards",
    kinds: ["material", "hazard"],
    subtitle: "What goes into the product and what can hurt people.",
  },
  {
    value: "roles",
    label: "Roles and teams",
    kinds: ["role", "team"],
    subtitle: "Who does the work and how the shifts are organized.",
  },
  {
    value: "glossary",
    label: "Glossary",
    kinds: ["term"],
    subtitle: "The words people use on the floor, with abbreviations and Dutch synonyms.",
  },
  {
    value: "assets",
    label: "Assets",
    kinds: [],
    subtitle: "The equipment in the plant. Each Asset's QR code leads to its documents.",
  },
]

export function isEditor(person: Person | null | undefined): boolean {
  return isEngineerOrAdmin(person)
}

export function itemMatches(i: PlantItem, needle: string): boolean {
  if (!needle) return true
  const n = needle.toLowerCase()
  return (
    i.name.toLowerCase().includes(n) ||
    (i.code ?? "").toLowerCase().includes(n) ||
    i.description.toLowerCase().includes(n) ||
    i.synonyms.some((s) => s.toLowerCase().includes(n))
  )
}

export type RelationView = {
  id: Id<"plantRelations">
  label: string
  other: PlantItem
}

/** The relations of one item, labelled from its own side. */
export function relationsOf(data: PlantData, id: Id<"plantItems">): RelationView[] {
  const byId = new Map(data.items.map((i) => [i._id, i]))
  const out: RelationView[] = []
  for (const r of data.relations) {
    if (r.fromId === id) {
      const other = byId.get(r.toId)
      if (other) out.push({ id: r._id, label: RELATION[r.type].out, other })
    } else if (r.toId === id) {
      const other = byId.get(r.fromId)
      if (other) out.push({ id: r._id, label: RELATION[r.type].in, other })
    }
  }
  return out
}

/** Which area an Asset sits in: its location is the area's label (or code). */
export function areaOfAsset(
  asset: { location: string | null; code: string },
  areas: PlantArea[],
): string | null {
  const loc = (asset.location ?? "").toLowerCase()
  const hit =
    areas.find((a) => a.label.toLowerCase() === loc) ??
    areas.find((a) => loc && (loc.includes(a.label.toLowerCase()) || loc === a.code.toLowerCase()))
  return hit?.code ?? null
}
