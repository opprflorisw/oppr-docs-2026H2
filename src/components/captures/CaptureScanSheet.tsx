import { useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { AssetQrSvg } from "@/components/docs/AssetQrSvg"
import { Skeleton } from "@/components/ui/skeleton"
import { useMobileShell } from "@/components/mobile/MobileShell"
import { CameraScanner, TypeTheCode, barcodeDetector } from "@/pages/mobile/MobileScanPage"
import { PhoneSheet } from "./PhoneSheet"

/**
 * Scan during a Capture. On a real phone: the camera first, then "Type the
 * code". In the phone preview, the Floor simulator or a wide screen there is
 * no camera to point, so a demo scanner shows the machines' QR codes to tap,
 * and says so.
 */
export function CaptureScanSheet({
  open,
  onClose,
  onScan,
}: {
  open: boolean
  onClose: () => void
  onScan: (assetId: Id<"assets">) => void
}) {
  const { embedded } = useMobileShell()
  const assets = useQuery(api.assets.list, open ? {} : "skip")
  const [wide] = useState(() => typeof window !== "undefined" && window.innerWidth > 600)
  const simulated = embedded || wide
  const canCamera =
    !simulated && !!barcodeDetector() && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia

  function hit(h: { kind: "asset" | "doc"; id: string }) {
    if (h.kind !== "asset") return
    onClose()
    onScan(h.id as Id<"assets">)
  }

  return (
    <PhoneSheet
      open={open}
      onClose={onClose}
      title={simulated ? "Pick the machine (demo scanner)" : canCamera ? "Scan the machine" : "Pick the machine"}
      description={
        simulated
          ? "There is no camera here, so tap the QR code of the machine you are at. On a phone this opens the camera."
          : canCamera
            ? "Point the camera at the QR code on the machine. The next Entries are tagged with it."
            : "This browser cannot read QR codes. Type the code from the label, or tap the machine below."
      }
    >
      <div className="space-y-4 pb-2">
        {canCamera && assets && <CameraScanner assets={assets} docs={undefined} onHit={hit} />}
        {!simulated && <TypeTheCode assets={assets} docs={undefined} onHit={hit} autoFocus={false} />}
        {(simulated || !canCamera) && (
          <div className="grid grid-cols-2 gap-2">
            {assets === undefined
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
              : assets.map((a) => (
                  <button
                    key={a._id}
                    type="button"
                    onClick={() => hit({ kind: "asset", id: a._id })}
                    aria-label={`Scan ${a.code}, ${a.name}`}
                    className="flex flex-col items-center gap-1 rounded-xl border bg-card p-2 text-center transition active:scale-[0.98]"
                  >
                    <span className="rounded-lg bg-white p-1 ring-1 ring-border">
                      <AssetQrSvg value={a.qrToken} size={64} />
                    </span>
                    <span className="font-mono text-[13px] font-semibold">{a.code}</span>
                    <span className="line-clamp-1 text-[13px] text-muted-foreground">{a.name}</span>
                  </button>
                ))}
          </div>
        )}
      </div>
    </PhoneSheet>
  )
}
