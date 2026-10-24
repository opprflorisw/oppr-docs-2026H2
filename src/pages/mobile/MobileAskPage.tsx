// Ask on the floor. Three scopes via ?scope=:
//   library      every Published document (the Ask tab)
//   doc:{id}     one document (from the reader)
//   asset:{id}   one Asset (from the Asset hub)
// The scope shows once, as a chip in the header; tapping it picks another
// (?pick=1). ?q= asks a question right away (from a search with no match).

import { useMemo, useState } from "react"
import { useLocation, useSearch } from "wouter"
import { ChevronDown, Factory, FileText, Globe } from "lucide-react"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { AskPanel, type AskPanelScope } from "@/components/ai/AskPanel"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { MobileSearchInput } from "@/components/mobile/MobileSearchInput"
import { MobileAssetCard } from "@/components/mobile/MobileAssetCard"
import { MobileDocCard } from "@/components/mobile/MobileDocCard"
import { looksLikeConvexId } from "@/components/mobile/use-mobile-prefs"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

function parseScope(search: string): AskPanelScope | null {
  const raw = new URLSearchParams(search).get("scope")
  if (!raw) return null
  if (raw === "library") return { kind: "library" }
  const [kind, id] = raw.split(":")
  if ((kind !== "doc" && kind !== "asset") || !id || !looksLikeConvexId(id)) return null
  return { kind, id }
}

function scopeToQuery(scope: AskPanelScope): string {
  return scope.kind === "library" ? "library" : `${scope.kind}:${scope.id}`
}

export function MobileAskPage() {
  const search = useSearch()
  const [, navigate] = useLocation()
  const params = useMemo(() => new URLSearchParams(search), [search])
  const picking = params.get("pick") === "1"
  const scope = useMemo<AskPanelScope>(() => parseScope(search) ?? { kind: "library" }, [search])
  const initialQuestion = params.get("q")

  const docForScope = useQuery(api.documents.get, scope.kind === "doc" ? { id: scope.id as Id<"documents"> } : "skip")
  const assetForScope = useQuery(api.assets.get, scope.kind === "asset" ? { id: scope.id as Id<"assets"> } : "skip")

  const chip =
    scope.kind === "library"
      ? { icon: Globe, text: "All documents" }
      : scope.kind === "doc"
        ? { icon: FileText, text: docForScope ? docForScope.namingCode : "Document" }
        : { icon: Factory, text: assetForScope ? assetForScope.code : "Asset" }
  const ChipIcon = chip.icon

  if (picking) {
    return (
      <div className="flex min-h-full flex-col">
        <MobileHeader title="Ask about" backTo="/m/ask" checkIn={false} />
        <ScopePicker onPick={(s) => navigate(`/m/ask?scope=${scopeToQuery(s)}`, { replace: true })} />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <MobileHeader
        backTo={scope.kind === "library" ? null : "/m/ask"}
        title="Ask"
        large={scope.kind === "library"}
        checkIn={false}
        right={
          <button
            type="button"
            onClick={() => navigate("/m/ask?pick=1")}
            aria-label={`Asking about ${chip.text}. Change`}
            className="flex min-h-11 max-w-[220px] items-center gap-1.5 rounded-full border bg-muted/50 px-3 text-sm font-medium"
          >
            <ChipIcon className="h-4 w-4 shrink-0 text-[#6E59A5]" />
            <span className={cn("truncate", scope.kind !== "library" && "font-mono")}>{chip.text}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <div className="min-h-0 flex-1">
        <AskPanel
          key={scopeToQuery(scope)}
          variant="floor"
          scope={scope}
          allowScopeSwitch={false}
          autoFocus={!initialQuestion && scope.kind !== "library"}
          initialQuestion={initialQuestion}
          onInitialQuestionSent={() => navigate(`/m/ask?scope=${scopeToQuery(scope)}`, { replace: true })}
          className="h-full"
        />
      </div>
    </div>
  )
}

function ScopePicker({ onPick }: { onPick: (scope: AskPanelScope) => void }) {
  const [tab, setTab] = useState<"asset" | "doc">("asset")
  const [query, setQuery] = useState("")
  const assets = useQuery(api.assets.list)
  const docs = useQuery(api.documents.list, { publishedOnly: true })

  const q = query.trim().toLowerCase()
  const filteredAssets = (assets ?? []).filter(
    (a) => !q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (a.location ?? "").toLowerCase().includes(q),
  )
  const filteredDocs = (docs ?? []).filter(
    (d) => !q || d.title.toLowerCase().includes(q) || d.namingCode.toLowerCase().includes(q),
  )

  return (
    <div className="flex flex-col gap-3 p-4">
      <button
        type="button"
        onClick={() => onPick({ kind: "library" })}
        className="flex min-h-16 items-center gap-3 rounded-2xl border border-[#6E59A5]/30 bg-[#6E59A5]/5 px-4 py-3 text-left transition active:scale-[0.99]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6E59A5] text-white">
          <Globe className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">All Published documents</span>
          <span className="block text-sm text-muted-foreground">For any question</span>
        </span>
      </button>

      <p className="px-1 pt-2 text-sm text-muted-foreground">Or ask about one Asset or document:</p>
      <div role="tablist" aria-label="Ask about" className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
        {(["asset", "doc"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "min-h-11 rounded-xl text-sm font-medium",
              tab === t ? "bg-background font-semibold shadow-sm" : "text-muted-foreground",
            )}
          >
            {t === "asset" ? "An Asset" : "A document"}
          </button>
        ))}
      </div>
      <MobileSearchInput value={query} onChange={setQuery} placeholder={tab === "asset" ? "Search Assets" : "Search documents"} />

      {(tab === "asset" ? assets : docs) === undefined ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : tab === "asset" ? (
        filteredAssets.length === 0 ? (
          <p className="rounded-2xl border bg-card p-6 text-center text-base text-muted-foreground">No Asset matches.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredAssets.map((a) => (
              <MobileAssetCard
                key={a._id}
                asset={{ id: a._id, code: a.code, name: a.name, location: a.location, pin_number: a.pinNumber }}
                onClick={() => onPick({ kind: "asset", id: a._id })}
              />
            ))}
          </div>
        )
      ) : filteredDocs.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-center text-base text-muted-foreground">No document matches.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredDocs.map((d) => (
            <MobileDocCard
              key={d._id}
              doc={{
                id: d._id,
                title: d.title,
                naming_code: d.namingCode,
                type: d.type,
                live_version: d.liveVersion ?? null,
                current_version: d.currentVersion,
              }}
              onClick={() => onPick({ kind: "doc", id: d._id })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
