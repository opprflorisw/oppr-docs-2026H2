// Mobile Assets list — searchable, with doc/log counts and pin badges.
//
// Reachable from the bottom-nav. Tapping a row navigates to the asset detail
// page; tapping the star toggles a localStorage-pinned flag (used on Home).

import { useMemo, useState } from "react"
import { useLocation } from "wouter"
import { Search } from "lucide-react"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { toLegacyAsset } from "@/lib/convex-adapters"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { MobileSearchInput } from "@/components/mobile/MobileSearchInput"
import { MobileAssetCard } from "@/components/mobile/MobileAssetCard"
import { MobileGlobalSearch } from "@/components/mobile/MobileGlobalSearch"
import { usePinned } from "@/components/mobile/use-mobile-prefs"

export function MobileAssetsPage() {
  const [, navigate] = useLocation()
  const { isPinned, togglePin } = usePinned()
  const [query, setQuery] = useState("")
  const [globalOpen, setGlobalOpen] = useState(false)

  const result = useQuery(api.assets.listForAssetsPage, { publishedOnly: true })
  const ready = result !== undefined

  const assets = useMemo(
    () => (result ? result.assets.map(toLegacyAsset) : []),
    [result],
  )

  const logCounts = useMemo(() => {
    const map = new Map<string, number>()
    if (!result) return map
    for (const [k, v] of Object.entries(result.logsByAsset)) {
      map.set(k, v.length)
    }
    return map
  }, [result])

  const docsByAsset = useMemo(() => {
    const map = new Map<string, number>()
    if (!result) return map
    for (const [k, v] of Object.entries(result.docsByAsset)) {
      map.set(k, v.length)
    }
    return map
  }, [result])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return assets
    return assets.filter(
      (a) =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.location ?? "").toLowerCase().includes(q),
    )
  }, [assets, query])

  return (
    <div className="flex flex-col">
      <MobileHeader
        backTo={null}
        title="Assets"
        subtitle={`${assets.length} on this site`}
        right={
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search everything"
              className="h-10 w-10"
              onClick={() => setGlobalOpen(true)}
            >
              <Search className="h-5 w-5" />
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 p-3">
        <MobileSearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search code, name, location…"
        />

        {!ready ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            {query ? "No assets match." : "No assets yet."}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((asset) => (
              <MobileAssetCard
                key={asset.id}
                asset={asset}
                docCount={docsByAsset.get(asset.id) ?? 0}
                logCount={logCounts.get(asset.id) ?? 0}
                onClick={() => navigate(`/m/assets/${asset.id}`)}
                pinned={isPinned("asset", asset.id)}
                onTogglePin={() =>
                  togglePin({
                    kind: "asset",
                    id: asset.id,
                    label: asset.name,
                    sublabel: asset.code,
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      <MobileGlobalSearch
        open={globalOpen}
        onClose={() => setGlobalOpen(false)}
      />
    </div>
  )
}
