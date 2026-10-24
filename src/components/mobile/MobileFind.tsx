// Find: one place to look something up on the floor (Scan lives on Home;
// a code typed here also works). One search covers Assets, documents and Wikis, and ends with
// "Ask about ..." when the answer is not a title. With an empty search the
// page browses Assets, documents (by area, with type chips) or Wikis.

import { useMemo, useState } from "react"
import { useLocation, useSearch } from "wouter"
import { useQuery } from "convex/react"
import { BookOpen, ChevronRight, MessageCircleQuestion } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Doc as ConvexDoc } from "../../../convex/_generated/dataModel"
import { Skeleton } from "@/components/ui/skeleton"
import { useDocTypes } from "@/lib/typeMeta"
import { cn } from "@/lib/utils"
import { MobileHeader } from "./MobileHeader"
import { MobileSearchInput } from "./MobileSearchInput"
import { MobileAssetCard } from "./MobileAssetCard"
import { MobileDocCard } from "./MobileDocCard"
import { usePinned } from "./use-mobile-prefs"

type Segment = "assets" | "docs" | "wikis"

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "assets", label: "Assets" },
  { key: "docs", label: "Documents" },
  { key: "wikis", label: "Wikis" },
]

type WikiRow = { _id: string; title: string; purpose?: string; status?: string }

export function MobileFindPage() {
  const search = useSearch()
  const [, navigate] = useLocation()
  const params = new URLSearchParams(search)
  const seg = (params.get("in") as Segment | null) ?? "assets"
  const segment: Segment = SEGMENTS.some((s) => s.key === seg) ? seg : "assets"
  const [query, setQuery] = useState(params.get("q") ?? "")

  const assetsResult = useQuery(api.assets.listForAssetsPage, { publishedOnly: true })
  const rawDocs = useQuery(api.documents.list, { publishedOnly: true })
  const rawWikis = useQuery(api.wikis.list, {}) as WikiRow[] | undefined

  const wikis = useMemo(() => (rawWikis ?? []).filter((w) => !w.status || w.status === "ready"), [rawWikis])
  const q = query.trim().toLowerCase()

  const matchAssets = useMemo(() => {
    if (!q || !assetsResult) return []
    return assetsResult.assets.filter(
      (a) =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.location ?? "").toLowerCase().includes(q),
    )
  }, [assetsResult, q])
  const matchDocs = useMemo(() => {
    if (!q || !rawDocs) return []
    return rawDocs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.namingCode.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [rawDocs, q])
  const matchWikis = useMemo(
    () => (q ? wikis.filter((w) => w.title.toLowerCase().includes(q) || (w.purpose ?? "").toLowerCase().includes(q)) : []),
    [wikis, q],
  )

  function setSegment(next: Segment) {
    navigate(`/m/find?in=${next}`, { replace: true })
  }

  return (
    <div className="flex flex-col">
      <MobileHeader backTo={null} title="Find" large />
      <div className="flex flex-col gap-3 p-4">
        <MobileSearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search Assets, documents, codes"
          label="Search Assets, documents and Wikis"
        />

        {q ? (
          <Results
            query={query.trim()}
            loading={assetsResult === undefined || rawDocs === undefined}
            assets={matchAssets}
            docs={matchDocs}
            wikis={matchWikis}
            docsByAsset={assetsResult?.docsByAsset}
          />
        ) : (
          <>
            <div role="tablist" aria-label="Browse" className="grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
              {SEGMENTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={segment === s.key}
                  onClick={() => setSegment(s.key)}
                  className={cn(
                    "min-h-11 rounded-xl text-sm font-medium transition",
                    segment === s.key ? "bg-background font-semibold text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {segment === "assets" && <AssetBrowse result={assetsResult} />}
            {segment === "docs" && <DocBrowse docs={rawDocs} />}
            {segment === "wikis" && <WikiBrowse wikis={rawWikis === undefined ? undefined : wikis} />}
          </>
        )}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="px-1 pt-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
    </div>
  )
}

function Results({
  query,
  loading,
  assets,
  docs,
  wikis,
  docsByAsset,
}: {
  query: string
  loading: boolean
  assets: ConvexDoc<"assets">[]
  docs: ConvexDoc<"documents">[]
  wikis: WikiRow[]
  docsByAsset: Record<string, unknown[]> | undefined
}) {
  const [, navigate] = useLocation()
  const { isPinned, togglePin } = usePinned()
  if (loading) return <ListSkeleton />
  const none = assets.length === 0 && docs.length === 0 && wikis.length === 0
  return (
    <div className="flex flex-col gap-2">
      {none && <p className="px-1 py-2 text-base text-muted-foreground">No Asset, document or Wiki is called that.</p>}
      {assets.length > 0 && <SectionTitle>Assets · {assets.length}</SectionTitle>}
      {assets.slice(0, 8).map((a) => (
        <MobileAssetCard
          key={a._id}
          asset={{ id: a._id, code: a.code, name: a.name, location: a.location, pin_number: a.pinNumber }}
          docCount={docsByAsset?.[a._id]?.length}
          onClick={() => navigate(`/m/assets/${a._id}`)}
          saved={isPinned("asset", a._id)}
          onToggleSave={() => togglePin({ kind: "asset", id: a._id, label: a.name, sublabel: a.code })}
        />
      ))}
      {docs.length > 0 && <SectionTitle>Documents · {docs.length}</SectionTitle>}
      {docs.slice(0, 12).map((d) => (
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
          onClick={() => navigate(`/m/docs/${d._id}`)}
          saved={isPinned("doc", d._id)}
          onToggleSave={() => togglePin({ kind: "doc", id: d._id, label: d.title, sublabel: d.namingCode })}
        />
      ))}
      {wikis.length > 0 && <SectionTitle>Wikis · {wikis.length}</SectionTitle>}
      {wikis.slice(0, 6).map((w) => (
        <WikiRowButton key={w._id} wiki={w} />
      ))}
      <button
        type="button"
        onClick={() => navigate(`/m/ask?scope=library&q=${encodeURIComponent(query)}`)}
        className="mt-2 flex min-h-14 items-center gap-3 rounded-2xl border border-[#6E59A5]/30 bg-[#6E59A5]/5 px-4 text-left transition active:scale-[0.99]"
      >
        <MessageCircleQuestion className="h-6 w-6 shrink-0 text-[#6E59A5]" />
        <span className="min-w-0 flex-1 text-base font-medium">
          Ask about "<span className="break-words">{query}</span>"
        </span>
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </button>
    </div>
  )
}

function AssetBrowse({
  result,
}: {
  result: { assets: ConvexDoc<"assets">[]; docsByAsset: Record<string, unknown[]> } | undefined
}) {
  const [, navigate] = useLocation()
  const { isPinned, togglePin } = usePinned()
  if (!result) return <ListSkeleton />
  if (result.assets.length === 0) return <Empty>No Assets yet. An Engineer adds them on the desktop.</Empty>
  const byArea = new Map<string, ConvexDoc<"assets">[]>()
  for (const a of result.assets) {
    const k = a.location || "Other"
    byArea.set(k, [...(byArea.get(k) ?? []), a])
  }
  return (
    <div className="flex flex-col gap-2">
      {[...byArea.entries()].map(([area, list]) => (
        <div key={area} className="flex flex-col gap-2">
          {byArea.size > 1 && <SectionTitle>{area}</SectionTitle>}
          {list.map((a) => (
            <MobileAssetCard
              key={a._id}
              asset={{ id: a._id, code: a.code, name: a.name, location: null, pin_number: a.pinNumber }}
              docCount={result.docsByAsset[a._id]?.length ?? 0}
              onClick={() => navigate(`/m/assets/${a._id}`)}
              saved={isPinned("asset", a._id)}
              onToggleSave={() => togglePin({ kind: "asset", id: a._id, label: a.name, sublabel: a.code })}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function DocBrowse({ docs }: { docs: ConvexDoc<"documents">[] | undefined }) {
  const [, navigate] = useLocation()
  const { isPinned, togglePin } = usePinned()
  const { resolve } = useDocTypes()
  const [type, setType] = useState<string | null>(null)
  if (!docs) return <ListSkeleton />
  if (docs.length === 0) return <Empty>No Published documents yet.</Empty>
  const types = [...new Set(docs.map((d) => d.type))]
  const shown = type ? docs.filter((d) => d.type === type) : docs
  const byArea = new Map<string, ConvexDoc<"documents">[]>()
  for (const d of shown) {
    const k = d.location || "General"
    byArea.set(k, [...(byArea.get(k) ?? []), d])
  }
  const areas = [...byArea.keys()].sort((a, b) => a.localeCompare(b))
  return (
    <div className="flex flex-col gap-2">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Type">
        <Chip active={type === null} onClick={() => setType(null)}>
          All
        </Chip>
        {types.map((t) => (
          <Chip key={t} active={type === t} onClick={() => setType(type === t ? null : t)}>
            {resolve(t).token || resolve(t).label}
          </Chip>
        ))}
      </div>
      {areas.map((area) => (
        <div key={area} className="flex flex-col gap-2">
          <SectionTitle>{area}</SectionTitle>
          {byArea.get(area)!.map((d) => (
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
              onClick={() => navigate(`/m/docs/${d._id}`)}
              saved={isPinned("doc", d._id)}
              onToggleSave={() => togglePin({ kind: "doc", id: d._id, label: d.title, sublabel: d.namingCode })}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function WikiBrowse({ wikis }: { wikis: WikiRow[] | undefined }) {
  if (!wikis) return <ListSkeleton />
  if (wikis.length === 0) return <Empty>No Wikis yet. An Engineer makes them on the desktop.</Empty>
  return (
    <div className="flex flex-col gap-2">
      {wikis.map((w) => (
        <WikiRowButton key={w._id} wiki={w} />
      ))}
    </div>
  )
}

export function WikiRowButton({ wiki }: { wiki: WikiRow }) {
  const [, navigate] = useLocation()
  return (
    <button
      type="button"
      onClick={() => navigate(`/m/wiki/${wiki._id}`)}
      className="flex min-h-16 items-center gap-3 rounded-2xl border bg-card px-3 py-3 text-left shadow-sm transition active:scale-[0.99]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-300">
        <BookOpen className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-base font-semibold leading-snug">{wiki.title}</span>
        {wiki.purpose && <span className="line-clamp-1 block text-[13px] text-muted-foreground">{wiki.purpose}</span>}
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </button>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition",
        active ? "border-[#6E59A5] bg-[#6E59A5] text-white" : "bg-background text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border bg-card p-6 text-center text-base text-muted-foreground">{children}</div>
}
