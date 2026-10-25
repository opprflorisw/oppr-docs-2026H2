// Client-side resolution for the document-type vocabulary (namingTypes).
//
// The server stores an icon id and a color tone per type; these registries turn
// those strings into a lucide component and Tailwind classes. Both have a safe
// fallback so an unknown id never crashes a badge. Tailwind classes are written
// out in full (no interpolation) so the JIT compiler keeps them.

import {
  BadgeCheck,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  Factory,
  FileText,
  FlaskConical,
  GraduationCap,
  HardHat,
  Landmark,
  ListChecks,
  Megaphone,
  Microscope,
  Presentation,
  Ruler,
  ScrollText,
  ShieldAlert,
  Siren,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { useMemo } from "react"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { DocumentType } from "@/types"

export const TYPE_ICONS: { id: string; icon: LucideIcon }[] = [
  { id: "FileText", icon: FileText },
  { id: "BookOpen", icon: BookOpen },
  { id: "ListChecks", icon: ListChecks },
  { id: "ShieldAlert", icon: ShieldAlert },
  { id: "Presentation", icon: Presentation },
  { id: "Landmark", icon: Landmark },
  { id: "Wrench", icon: Wrench },
  { id: "GraduationCap", icon: GraduationCap },
  { id: "ClipboardCheck", icon: ClipboardCheck },
  { id: "Megaphone", icon: Megaphone },
  { id: "ScrollText", icon: ScrollText },
  { id: "Workflow", icon: Workflow },
  { id: "HardHat", icon: HardHat },
  { id: "Siren", icon: Siren },
  { id: "BadgeCheck", icon: BadgeCheck },
  { id: "Ruler", icon: Ruler },
  { id: "Microscope", icon: Microscope },
  { id: "FlaskConical", icon: FlaskConical },
  { id: "Factory", icon: Factory },
  { id: "CalendarCheck", icon: CalendarCheck },
]

const ICON_BY_ID = new Map(TYPE_ICONS.map((t) => [t.id, t.icon]))

export function typeIcon(id: string | undefined): LucideIcon {
  return (id && ICON_BY_ID.get(id)) || FileText
}

// Tone id → badge classes. Full strings so Tailwind keeps them.
export const TYPE_COLORS: { id: string; badge: string; swatch: string }[] = [
  { id: "sky", badge: "border-sky-300 bg-sky-50 text-sky-700", swatch: "bg-sky-500" },
  { id: "violet", badge: "border-violet-300 bg-violet-50 text-violet-700", swatch: "bg-violet-500" },
  { id: "emerald", badge: "border-emerald-300 bg-emerald-50 text-emerald-700", swatch: "bg-emerald-500" },
  { id: "rose", badge: "border-rose-300 bg-rose-50 text-rose-700", swatch: "bg-rose-500" },
  { id: "amber", badge: "border-amber-300 bg-amber-50 text-amber-700", swatch: "bg-amber-500" },
  { id: "indigo", badge: "border-indigo-300 bg-indigo-50 text-indigo-700", swatch: "bg-indigo-500" },
  { id: "teal", badge: "border-teal-300 bg-teal-50 text-teal-700", swatch: "bg-teal-500" },
  { id: "orange", badge: "border-orange-300 bg-orange-50 text-orange-700", swatch: "bg-orange-500" },
  { id: "slate", badge: "border-slate-300 bg-slate-100 text-slate-700", swatch: "bg-slate-500" },
  { id: "fuchsia", badge: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700", swatch: "bg-fuchsia-500" },
]

const COLOR_BY_ID = new Map(TYPE_COLORS.map((c) => [c.id, c]))

export function typeBadgeClass(id: string | undefined): string {
  return (id && COLOR_BY_ID.get(id)?.badge) || "border-slate-300 bg-slate-100 text-slate-700"
}

export function typeSwatchClass(id: string | undefined): string {
  return (id && COLOR_BY_ID.get(id)?.swatch) || "bg-slate-500"
}

export interface ResolvedType {
  slug: string
  token: string
  label: string
  icon: string
  color: string
  active: boolean
  builtIn: boolean
}

// Legacy fallback so badges render correctly before the table is seeded.
const FALLBACK: Record<string, ResolvedType> = {
  sop: { slug: "sop", token: "SOP", label: "SOP", icon: "FileText", color: "sky", active: true, builtIn: true },
  manual: { slug: "manual", token: "MAN", label: "Manual", icon: "BookOpen", color: "violet", active: true, builtIn: true },
  work_instruction: { slug: "work_instruction", token: "WI", label: "Work instruction", icon: "ListChecks", color: "emerald", active: true, builtIn: true },
  lmra: { slug: "lmra", token: "LMRA", label: "LMRA", icon: "ShieldAlert", color: "rose", active: true, builtIn: true },
}

// Subscribe to the type vocabulary and return a resolver. All consumers share a
// single Convex subscription. Unknown slugs resolve to a neutral placeholder so
// a document whose type was deleted still renders something sensible.
export function useDocTypes(): {
  types: ResolvedType[]
  resolve: (slug: DocumentType) => ResolvedType
} {
  const rows = useQuery(api.namingTypes.list)
  return useMemo(() => {
    const list: ResolvedType[] =
      rows && rows.length > 0
        ? rows.map((r) => ({
            slug: r.slug,
            token: r.token,
            label: r.label,
            icon: r.icon,
            color: r.color,
            active: r.active,
            builtIn: r.builtIn,
          }))
        : Object.values(FALLBACK)
    const bySlug = new Map(list.map((t) => [t.slug, t]))
    return {
      types: list,
      resolve: (slug: DocumentType) =>
        bySlug.get(slug) ??
        FALLBACK[slug] ?? {
          slug,
          token: slug.slice(0, 4).toUpperCase(),
          label: slug,
          icon: "FileText",
          color: "slate",
          active: false,
          builtIn: false,
        },
    }
  }, [rows])
}
