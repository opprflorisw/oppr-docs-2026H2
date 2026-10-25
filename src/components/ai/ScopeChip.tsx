import { useMemo, useState } from "react"
import {
  BookOpenText,
  ChevronDown,
  Factory,
  FileText,
  Files,
  Globe,
  GraduationCap,
  Search,
  UsersRound,
} from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import type { AskPanelScope } from "./AskPanel"
import { cn } from "@/lib/utils"

/** Every Ask scope. */
export type AnyAskScope = AskPanelScope

/** A scope that only its own page sets: a Wiki, a Training, the Skills pages. */
type PageScope = Extract<AskPanelScope, { kind: "wiki" | "training" | "skills" }>

function pageScopeOf(scope: AnyAskScope): PageScope | null {
  return scope.kind === "wiki" || scope.kind === "training" || scope.kind === "skills" ? scope : null
}

const PAGE_SCOPE_UI: Record<PageScope["kind"], { tab: string; icon: typeof Globe; note: string }> = {
  wiki: {
    tab: "Wiki",
    icon: BookOpenText,
    note: "Answers come only from the documents this Wiki is built from, at the versions it cites.",
  },
  training: {
    tab: "Training",
    icon: GraduationCap,
    note: "Answers come only from the documents this Training's Learning objectives come from.",
  },
  skills: {
    tab: "Skills",
    icon: UsersRound,
    note: "Answers about people come from the Skill matrix as it is now. Steps and settings still come only from Published documents.",
  },
}

interface ScopeChipProps {
  scope: AnyAskScope
  // Method syntax: callers that only handle AskPanelScope still fit.
  onChange(next: AnyAskScope): void
  className?: string
}

export function ScopeChip({ scope, onChange, className }: ScopeChipProps) {
  const [open, setOpen] = useState(false)
  const label = useScopeLabel(scope)

  const page = pageScopeOf(scope)
  const Icon = page
    ? PAGE_SCOPE_UI[page.kind].icon
    : scope.kind === "library"
      ? Globe
      : scope.kind === "asset"
        ? Factory
        : FileText

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5",
            className,
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">
            <span className="font-semibold">{label.kindLabel}</span>
            {label.code && (
              <>
                <span className="text-muted-foreground"> · </span>
                <span className="font-mono">{label.code}</span>
              </>
            )}
            {label.title && (
              <>
                <span className="text-muted-foreground"> · </span>
                <span className="text-muted-foreground">{label.title}</span>
              </>
            )}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <ScopeSwitcher
          scope={scope}
          onPick={(next) => {
            onChange(next)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export function useScopeLabel(scope: AnyAskScope) {
  const doc = useQuery(
    api.documents.get,
    scope.kind === "doc" ? { id: scope.id as Id<"documents"> } : "skip",
  )
  const asset = useQuery(
    api.assets.get,
    scope.kind === "asset" ? { id: scope.id as Id<"assets"> } : "skip",
  )
  const wiki = useQuery(
    api.wikis.get,
    scope.kind === "wiki" ? { id: scope.id as Id<"wikis"> } : "skip",
  )
  const training = useQuery(
    api.trainings.get,
    scope.kind === "training" ? { id: scope.id as Id<"trainings"> } : "skip",
  )
  return useMemo(() => {
    if (scope.kind === "skills") {
      return { kindLabel: "Skills", code: null, title: "Skill matrix and documents" }
    }
    if (scope.kind === "training") {
      return {
        kindLabel: "Training",
        code: training?.training.code ?? null,
        title: training?.training.title ?? null,
      }
    }
    if (scope.kind === "library") {
      return { kindLabel: "Library", code: null, title: "All documents" }
    }
    if (scope.kind === "wiki") {
      return { kindLabel: "This Wiki", code: null, title: wiki?.title ?? null }
    }
    if (scope.kind === "doc") {
      return {
        kindLabel: "Document",
        code: doc?.namingCode ?? null,
        title: doc?.title ?? null,
      }
    }
    return {
      kindLabel: "Asset",
      code: asset?.code ?? null,
      title: asset?.name ?? null,
    }
  }, [scope, doc, asset, wiki, training])
}

interface DocPick {
  _id: string
  namingCode: string
  title: string
}
interface AssetPick {
  _id: string
  code: string
  name: string
}

function ScopeSwitcher({
  scope,
  onPick,
}: {
  scope: AnyAskScope
  onPick: (next: AnyAskScope) => void
}) {
  const pageScope = pageScopeOf(scope)
  const pageUi = pageScope ? PAGE_SCOPE_UI[pageScope.kind] : null
  const PageIcon = pageUi?.icon
  const [tab, setTab] = useState<"library" | "doc" | "asset" | "page">(pageScope ? "page" : (scope.kind as "library" | "doc" | "asset"))
  const [query, setQuery] = useState("")

  const docs = useQuery(api.documents.list, { publishedOnly: true }) ?? []
  const assets = useQuery(api.assets.list) ?? []

  const filteredDocs = useMemo<DocPick[]>(() => {
    const q = query.trim().toLowerCase()
    const all = docs.map((d) => ({
      _id: d._id,
      namingCode: d.namingCode,
      title: d.title,
    }))
    if (!q) return all
    return all.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.namingCode.toLowerCase().includes(q),
    )
  }, [docs, query])

  const filteredAssets = useMemo<AssetPick[]>(() => {
    const q = query.trim().toLowerCase()
    const all = assets.map((a) => ({
      _id: a._id,
      code: a.code,
      name: a.name,
    }))
    if (!q) return all
    return all.filter(
      (a) =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q),
    )
  }, [assets, query])

  return (
    <div className="flex flex-col">
      <div className="border-b p-2">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as typeof tab)
            // Library needs no further choice: apply it straight away.
            if (v === "library") onPick({ kind: "library" })
            if (v === "page" && pageScope) onPick(pageScope)
          }}
        >
          <TabsList className={cn("grid h-8 w-full", pageScope ? "grid-cols-4" : "grid-cols-3")}>
            {pageUi && PageIcon && (
              <TabsTrigger value="page" className="text-xs">
                <PageIcon className="mr-1 h-3 w-3" />
                {pageUi.tab}
              </TabsTrigger>
            )}
            <TabsTrigger value="library" className="text-xs">
              <Globe className="mr-1 h-3 w-3" />
              Library
            </TabsTrigger>
            <TabsTrigger value="doc" className="text-xs">
              <FileText className="mr-1 h-3 w-3" />
              Document
            </TabsTrigger>
            <TabsTrigger value="asset" className="text-xs">
              <Factory className="mr-1 h-3 w-3" />
              Asset
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === "page" && pageUi ? (
        <p className="p-3 text-xs text-muted-foreground">{pageUi.note}</p>
      ) : tab === "library" ? (
        <div className="space-y-2 p-3">
          <p className="text-xs text-muted-foreground">
            Ask across every document in the library. Best for catalog,
            comparison, or "where do I find …" questions.
          </p>
          <button
            type="button"
            onClick={() => onPick({ kind: "library" })}
            className="w-full rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Use library scope
          </button>
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tab === "doc" ? "Search documents…" : "Search assets…"}
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-auto p-1">
            {tab === "doc" ? (
              <DocList
                docs={filteredDocs}
                onPick={(id) => onPick({ kind: "doc", id })}
              />
            ) : (
              <AssetList
                assets={filteredAssets}
                onPick={(id) => onPick({ kind: "asset", id })}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DocList({
  docs,
  onPick,
}: {
  docs: DocPick[]
  onPick: (id: string) => void
}) {
  if (!docs.length) {
    return (
      <div className="px-2 py-6 text-center text-xs text-muted-foreground">
        No documents match.
      </div>
    )
  }
  return (
    <ul className="flex flex-col">
      {docs.map((d) => (
        <li key={d._id}>
          <button
            type="button"
            onClick={() => onPick(d._id)}
            className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
          >
            <Files className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[11px] font-bold">
                {d.namingCode}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {d.title}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

function AssetList({
  assets,
  onPick,
}: {
  assets: AssetPick[]
  onPick: (id: string) => void
}) {
  if (!assets.length) {
    return (
      <div className="px-2 py-6 text-center text-xs text-muted-foreground">
        No assets match.
      </div>
    )
  }
  return (
    <ul className="flex flex-col">
      {assets.map((a) => (
        <li key={a._id}>
          <button
            type="button"
            onClick={() => onPick(a._id)}
            className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
          >
            <Factory className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[11px] font-bold">{a.code}</div>
              <div className="truncate text-xs text-muted-foreground">
                {a.name}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}
