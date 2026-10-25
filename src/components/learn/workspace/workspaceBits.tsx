import type { ComponentType, ReactNode } from "react"
import type { LucideProps } from "lucide-react"
import { Link } from "wouter"
import type { Id } from "../../../../convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import type { Catalogue, Workspace } from "../skills/SkillEditors"

export type { Catalogue, CatalogueProfile, CatalogueSkill, Workspace } from "../skills/SkillEditors"

/** What every workspace tab gets: the catalogue, the live numbers and who may edit. */
export interface TabProps {
  catalogue: Catalogue
  workspace: Workspace
  /** The checked-in Engineer or Admin; null shows the tab read-only. */
  engineerId: Id<"people"> | null
}

export type WorkspaceTab = "overview" | "skills" | "profiles" | "people" | "trainings" | "levels" | "coverage"

export function tabHref(tab: WorkspaceTab) {
  return tab === "overview" ? "/learn/skills" : `/learn/skills/${tab}`
}

/** Mono chips that link to Documents or Trainings; dashed when not published. */
export function CodeList({
  items,
  empty,
  className,
}: {
  items: { key: string; code: string; title: string; href: string; muted: boolean }[]
  empty: string
  className?: string
}) {
  if (items.length === 0) return <span className="text-muted-foreground">{empty}</span>
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          title={i.title}
          className={cn(
            "rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-xs hover:border-primary/50",
            i.muted && "border-dashed text-muted-foreground",
          )}
        >
          {i.code}
        </Link>
      ))}
    </div>
  )
}

export function ReadOnlyNote({ what }: { what: string }) {
  return (
    <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
      You can look here. Check in as an Engineer or Admin (top right) to change {what}.
    </p>
  )
}

export function SectionTitle({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: ComponentType<LucideProps>
  title: string
  count?: number
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Icon className="h-4 w-4 text-primary" aria-hidden />
      <h2 className="text-sm font-semibold">{title}</h2>
      {count != null && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  )
}
