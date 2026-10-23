// Mobile Ask IDA page.
//
// Three scope modes via ?scope= query:
//   • library            -> talk to every document
//   • doc:{id}           -> scope to one document
//   • asset:{id}         -> scope to one asset
//
// When no scope is set we render an opinionated picker that defaults to
// Library (the most useful starting point on mobile when the operator
// didn't come from a QR scan / asset card).

import { useMemo, useState } from "react"
import { useLocation, useSearch } from "wouter"
import { Globe } from "lucide-react"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { toLegacyAsset, toLegacyDoc } from "@/lib/convex-adapters"
import { AskPanel, type AskPanelScope } from "@/components/ai/AskPanel"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { MobileSearchInput } from "@/components/mobile/MobileSearchInput"
import { MobileAssetCard } from "@/components/mobile/MobileAssetCard"
import { MobileDocCard } from "@/components/mobile/MobileDocCard"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

function parseScope(search: string): AskPanelScope | null {
  const params = new URLSearchParams(search)
  const raw = params.get("scope")
  if (!raw) return null
  if (raw === "library") return { kind: "library" }
  const [kind, id] = raw.split(":")
  if ((kind !== "doc" && kind !== "asset") || !id) return null
  return { kind, id }
}

function scopeToQuery(scope: AskPanelScope): string {
  if (scope.kind === "library") return "library"
  return `${scope.kind}:${scope.id}`
}

export function MobileAskPage() {
  const search = useSearch()
  const [, navigate] = useLocation()
  const scope = useMemo(() => parseScope(search), [search])

  const docForScope = useQuery(
    api.documents.get,
    scope?.kind === "doc"
      ? { id: scope.id as Id<"documents"> }
      : "skip",
  )
  const assetForScope = useQuery(
    api.assets.get,
    scope?.kind === "asset" ? { id: scope.id as Id<"assets"> } : "skip",
  )
  const ready = true

  const scopeLabel = useMemo(() => {
    if (!scope) return null
    if (scope.kind === "library") {
      return { kind: "Library", text: "Across every document", id: "library" }
    }
    if (scope.kind === "doc") {
      return docForScope
        ? {
            kind: "Document",
            text: docForScope.title,
            id: docForScope._id,
          }
        : null
    }
    return assetForScope
      ? { kind: "Asset", text: assetForScope.name, id: assetForScope._id }
      : null
  }, [scope, docForScope, assetForScope])

  const backTo =
    scopeLabel && scopeLabel.kind !== "Library"
      ? scopeLabel.kind === "Document"
        ? `/m/docs/${scopeLabel.id}`
        : `/m/assets/${scopeLabel.id}`
      : "/m"

  return (
    <div className="flex h-full flex-col">
      <MobileHeader
        backTo={backTo}
        title="Ask"
        subtitle={
          scopeLabel
            ? `${scopeLabel.kind}: ${scopeLabel.text}`
            : scope
              ? "Scope not found"
              : "Pick a scope"
        }
        right={
          scope ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => navigate("/m/ask")}
            >
              Change
            </Button>
          ) : null
        }
      />

      {scope ? (
        <div className="min-h-0 flex-1 p-3">
          <AskPanel
            compact
            scope={scope}
            onScopeChange={(next) =>
              navigate(`/m/ask?scope=${scopeToQuery(next)}`, { replace: true })
            }
            className="h-full"
          />
        </div>
      ) : (
        <ScopePicker
          ready={ready}
          onPick={(s) =>
            navigate(`/m/ask?scope=${scopeToQuery(s)}`, { replace: true })
          }
        />
      )}
    </div>
  )
}

function ScopePicker({
  ready,
  onPick,
}: {
  ready: boolean
  onPick: (scope: AskPanelScope) => void
}) {
  const [tab, setTab] = useState<"asset" | "doc">("asset")
  const [query, setQuery] = useState("")

  const rawAssets = useQuery(api.assets.list)
  const rawDocs = useQuery(api.documents.list, { publishedOnly: true })
  const assets = useMemo(
    () => (rawAssets ? rawAssets.map(toLegacyAsset) : []),
    [rawAssets],
  )
  const docs = useMemo(
    () => (rawDocs ? rawDocs.map(toLegacyDoc) : []),
    [rawDocs],
  )

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return assets
    return assets.filter(
      (a) =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.location ?? "").toLowerCase().includes(q),
    )
  }, [assets, query])

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return docs
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.naming_code.toLowerCase().includes(q),
    )
  }, [docs, query])

  return (
    <div className="flex flex-col gap-3 p-3">
      <button
        type="button"
        onClick={() => onPick({ kind: "library" })}
        className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-left shadow-sm transition active:scale-[0.99]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Globe className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Ask across everything</div>
          <div className="text-xs text-muted-foreground">
            Best for catalog or "where do I find…" questions.
          </div>
        </div>
      </button>

      <div className="rounded-2xl border bg-muted/30 p-3 text-xs text-muted-foreground">
        Or scope to one specific source — pick the asset or document you want
        to ask about.
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="asset">Asset</TabsTrigger>
          <TabsTrigger value="doc">Document</TabsTrigger>
        </TabsList>
      </Tabs>

      <MobileSearchInput
        value={query}
        onChange={setQuery}
        placeholder={tab === "asset" ? "Search assets…" : "Search documents…"}
      />

      {!ready ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : tab === "asset" ? (
        filteredAssets.length === 0 ? (
          <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            {query ? "No assets match." : "No assets yet."}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredAssets.map((a) => (
              <MobileAssetCard
                key={a.id}
                asset={a}
                onClick={() => onPick({ kind: "asset", id: a.id })}
              />
            ))}
          </div>
        )
      ) : filteredDocs.length === 0 ? (
        <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
          {query ? "No documents match." : "No documents yet."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredDocs.map((d) => (
            <MobileDocCard
              key={d.id}
              doc={d}
              onClick={() => onPick({ kind: "doc", id: d.id })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
