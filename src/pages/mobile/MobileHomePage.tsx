// Mobile Home — operator landing.
//
// Quick actions: Scan QR / Browse / Floorplan / Ask. Below that we surface
// the operator's pinned items (favorites) and recently viewed assets/docs so
// returning to a familiar SOP is one tap, not a hunt through search.
//
// Home is also where stale Pinned/Recent rows from a previous database get
// reconciled — every id is resolved against Convex, and missing rows render
// with a Remove affordance instead of crashing the reader.

import { useMemo, useState } from "react"
import { Link } from "wouter"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import {
  AlertTriangle,
  ChevronRight,
  Factory,
  Files,
  FolderKanban,
  MessageSquare,
  ScanLine,
  Search,
  Star,
  Trash2,
} from "lucide-react"
import {
  usePinned,
  useRecentlyViewed,
  type EntityKind,
} from "@/components/mobile/use-mobile-prefs"
import { MobileGlobalSearch } from "@/components/mobile/MobileGlobalSearch"
import { MobileCheckInButton } from "@/components/mobile/MobileCheckIn"
import { MobileRoundsCard } from "@/components/mobile/MobileRoundsCard"
import { cn } from "@/lib/utils"

export function MobileHomePage() {
  const { recent, removeRecent } = useRecentlyViewed()
  const { pinned, removePin } = usePinned()
  const [searchOpen, setSearchOpen] = useState(false)

  const docIds = useMemo(() => {
    const set = new Set<string>()
    for (const p of pinned) if (p.kind === "doc") set.add(p.id)
    for (const r of recent) if (r.kind === "doc") set.add(r.id)
    return Array.from(set)
  }, [pinned, recent])
  const assetIds = useMemo(() => {
    const set = new Set<string>()
    for (const p of pinned) if (p.kind === "asset") set.add(p.id)
    for (const r of recent) if (r.kind === "asset") set.add(r.id)
    return Array.from(set)
  }, [pinned, recent])

  const docResolves = useQuery(
    api.documents.resolveMany,
    docIds.length > 0 ? { ids: docIds } : "skip",
  )
  const assetResolves = useQuery(
    api.assets.resolveMany,
    assetIds.length > 0 ? { ids: assetIds } : "skip",
  )

  const allDocs = useQuery(api.documents.list, { publishedOnly: true })
  const allAssets = useQuery(api.assets.list)
  const docCount = allDocs?.length
  const assetCount = allAssets?.length

  const existsMap = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const r of docResolves ?? []) m.set(`doc:${r.id}`, r.exists)
    for (const r of assetResolves ?? []) m.set(`asset:${r.id}`, r.exists)
    return m
  }, [docResolves, assetResolves])

  function exists(kind: EntityKind, id: string): boolean {
    // While the resolve query is in flight we render rows as if they exist
    // (default true). The recovery UI only shows up after Convex confirms
    // the id is gone — avoids a flash of "no longer available" on every load.
    const key = `${kind}:${id}`
    if (!existsMap.has(key)) return true
    return existsMap.get(key) === true
  }

  const staleCount =
    pinned.filter((p) => existsMap.has(`${p.kind}:${p.id}`) && !exists(p.kind, p.id))
      .length +
    recent.filter((r) => existsMap.has(`${r.kind}:${r.id}`) && !exists(r.kind, r.id))
      .length

  function clearStale() {
    for (const p of pinned) {
      if (existsMap.has(`${p.kind}:${p.id}`) && !exists(p.kind, p.id)) {
        removePin(p.kind, p.id)
      }
    }
    for (const r of recent) {
      if (existsMap.has(`${r.kind}:${r.id}`) && !exists(r.kind, r.id)) {
        removeRecent(r.kind, r.id)
      }
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3 pt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FolderKanban className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="text-[13px] font-semibold leading-none">
              Oppr Knowledge
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              Operator app
            </div>
          </div>
        </div>
        <MobileCheckInButton variant="pill" />
      </div>

      {/* Inline search trigger — opens MobileGlobalSearch overlay */}
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-2 text-left text-[12px] text-muted-foreground active:scale-[0.99]"
      >
        <Search className="h-3.5 w-3.5" />
        Search Assets, documents, codes…
      </button>

      {/* Hero CTA — Scan, the operator's primary entry point */}
      <Link
        href="/m/scan"
        className="flex items-center gap-2.5 rounded-lg bg-primary p-3 text-primary-foreground active:scale-[0.99]"
      >
        <ScanLine className="h-5 w-5" />
        <div className="flex-1">
          <div className="text-[13px] font-semibold leading-none">Scan QR</div>
          <div className="mt-0.5 text-[10px] opacity-85">
            Open the doc for an asset
          </div>
        </div>
        <ChevronRight className="h-4 w-4 opacity-80" />
      </Link>

      {/* Secondary action chips with live counts */}
      <div className="grid grid-cols-3 gap-1.5">
        <ChipAction
          to="/m/ask?scope=library"
          icon={MessageSquare}
          label="Ask"
          sub="Anywhere"
        />
        <ChipAction
          to="/m/assets"
          icon={Factory}
          label="Assets"
          sub={assetCount != null ? `${assetCount}` : "Browse"}
        />
        <ChipAction
          to="/m/docs"
          icon={Files}
          label="Documents"
          sub={docCount != null ? `${docCount}` : "Browse"}
        />
      </div>

      <MobileRoundsCard />

      {staleCount > 0 && (
        <div className="flex items-center justify-between rounded-md border border-amber-300/50 bg-amber-100/40 px-2.5 py-2 text-[11px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {staleCount} entr{staleCount === 1 ? "y" : "ies"} no longer
            available
          </span>
          <button
            type="button"
            onClick={clearStale}
            className="rounded bg-amber-200/60 px-2 py-0.5 text-[10px] font-medium dark:bg-amber-500/20"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Pinned */}
      {pinned.length > 0 && (
        <SectionHead
          title="Pinned"
          subtitle={`${pinned.length} saved`}
          icon={Star}
        >
          {pinned.map((p) => (
            <EntityRow
              key={`${p.kind}-${p.id}`}
              kind={p.kind}
              id={p.id}
              label={p.label}
              sublabel={p.sublabel}
              missing={!exists(p.kind, p.id)}
              onRemove={() => removePin(p.kind, p.id)}
            />
          ))}
        </SectionHead>
      )}

      {/* Recently viewed */}
      {recent.length > 0 && (
        <SectionHead title="Recent">
          {disambiguate(recent).map((r) => (
            <EntityRow
              key={`${r.kind}-${r.id}-${r.visited_at}`}
              kind={r.kind}
              id={r.id}
              label={r.displayLabel}
              sublabel={r.sublabel}
              missing={!exists(r.kind, r.id)}
              onRemove={() => removeRecent(r.kind, r.id)}
            />
          ))}
        </SectionHead>
      )}

      {pinned.length === 0 && recent.length === 0 && (
        <div className="rounded-md border bg-card p-4 text-center text-[11px] text-muted-foreground">
          Pinned and Recently viewed will show up here once you open a few
          docs.
        </div>
      )}

      <MobileGlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </div>
  )
}

// Append a short suffix to recently-viewed labels that collide with another
// row, so two docs called "EDDYCURRENT MACHINE" with different naming codes
// don't render visually identical. We just take the trailing segment of the
// naming code (e.g., 0001 / 0004) which is the part the operator is most
// likely to recognise.
function disambiguate<
  T extends { kind: EntityKind; id: string; label: string; sublabel?: string },
>(rows: T[]): Array<T & { displayLabel: string }> {
  const labelCount = new Map<string, number>()
  for (const r of rows) {
    labelCount.set(r.label, (labelCount.get(r.label) ?? 0) + 1)
  }
  return rows.map((r) => {
    if ((labelCount.get(r.label) ?? 0) <= 1) {
      return { ...r, displayLabel: r.label }
    }
    const tail = r.sublabel?.split(/[-_]/).pop()
    return {
      ...r,
      displayLabel: tail ? `${r.label} (${tail})` : r.label,
    }
  })
}

function ChipAction({
  to,
  icon: Icon,
  label,
  sub,
}: {
  to: string
  icon: typeof ScanLine
  label: string
  sub: string
}) {
  return (
    <Link
      href={to}
      className="flex flex-col items-center gap-0.5 rounded-md border bg-card px-2 py-2 text-[10px] active:scale-[0.99]"
    >
      <Icon className="h-3.5 w-3.5 text-foreground/80" />
      <span className="text-[11px] font-medium leading-none">{label}</span>
      <span className="text-[9px] text-muted-foreground">{sub}</span>
    </Link>
  )
}

function SectionHead({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string
  subtitle?: string
  icon?: typeof Star
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between px-0.5">
        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {Icon && <Icon className="h-2.5 w-2.5" />}
          {title}
        </div>
        {subtitle && (
          <div className="text-[9px] text-muted-foreground">{subtitle}</div>
        )}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}

function EntityRow({
  kind,
  id,
  label,
  sublabel,
  missing,
  onRemove,
}: {
  kind: EntityKind
  id: string
  label: string
  sublabel?: string
  missing: boolean
  onRemove: () => void
}) {
  const to = kind === "doc" ? `/m/docs/${id}` : `/m/assets/${id}`
  const Icon = kind === "doc" ? Files : Factory
  if (missing) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border border-amber-300/50 bg-amber-100/40 px-2 py-1.5 text-[11px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium leading-tight">{label}</div>
          <div className="truncate text-[9px] opacity-80">
            No longer available
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="rounded bg-amber-200/60 px-1.5 py-0.5 text-[10px] font-medium dark:bg-amber-500/20"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    )
  }
  return (
    <Link
      href={to}
      className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 active:scale-[0.99]"
    >
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
        <Icon className="h-3 w-3" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium leading-tight">
          {label}
        </div>
        {sublabel && (
          <div className="truncate font-mono text-[9px] text-muted-foreground">
            {sublabel}
          </div>
        )}
      </div>
      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
    </Link>
  )
}
