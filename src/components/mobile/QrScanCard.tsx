// A tap target that stands in for a QR code where there is no camera to
// point (the desktop phone preview, the Floor simulator, a wide screen).
// Same QR pattern as the desktop Asset preview.

import { ChevronRight, Map } from "lucide-react"
import { AssetQrSvg } from "@/components/docs/AssetQrSvg"
import { spotLabel } from "./MobileAssetCard"

interface QrScanCardProps {
  asset: { code: string; name: string; location?: string | null; qrToken: string; pinNumber?: number | null }
  onClick: () => void
}

export function QrScanCard({ asset, onClick }: QrScanCardProps) {
  const spot = spotLabel(asset.pinNumber)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Scan ${asset.code}, ${asset.name}`}
      className="flex w-full items-center gap-4 rounded-2xl border bg-card p-3 text-left shadow-sm transition active:scale-[0.99]"
    >
      <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-white p-1 ring-1 ring-border">
        <AssetQrSvg value={asset.qrToken} size={72} className="h-full w-full" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-mono text-[13px] font-medium text-muted-foreground">{asset.code}</span>
        <span className="line-clamp-2 text-base font-semibold leading-snug text-foreground">{asset.name}</span>
        <span className="flex flex-wrap items-center gap-x-3 text-[13px] text-muted-foreground">
          {spot && (
            <span className="inline-flex items-center gap-1">
              <Map className="h-3.5 w-3.5" />
              {spot}
            </span>
          )}
          {asset.location && <span className="truncate">{asset.location}</span>}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </button>
  )
}
