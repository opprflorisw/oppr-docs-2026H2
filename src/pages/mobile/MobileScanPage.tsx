import { useMemo } from "react"
import { useLocation } from "wouter"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { toLegacyAsset } from "@/lib/convex-adapters"
import { Skeleton } from "@/components/ui/skeleton"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { QrScanCard } from "@/components/mobile/QrScanCard"
import { useFloorBridge } from "@/components/mobile/floorBridge"
import type { Id } from "../../../convex/_generated/dataModel"

export function MobileScanPage() {
  const [, navigate] = useLocation()
  // In the Floor simulator a Scan means walking to the machine first.
  const bridge = useFloorBridge()
  const raw = useQuery(api.assets.list)
  const ready = raw !== undefined
  const assets = useMemo(() => (raw ? raw.map(toLegacyAsset) : []), [raw])

  return (
    <div className="flex flex-col">
      <MobileHeader
        backTo={null}
        title="Scan QR"
        subtitle="Tap a QR code to simulate a Scan"
      />
      <div className="flex flex-col gap-3 p-3">
        {!ready ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
          </div>
        ) : assets.length === 0 ? (
          <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            No assets available.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {assets.map((asset) => (
              <QrScanCard
                key={asset.id}
                asset={asset}
                onClick={() =>
                  bridge
                    ? bridge.walkTo(asset.id as Id<"assets">)
                    : navigate(`/m/assets/${asset.id}`)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
