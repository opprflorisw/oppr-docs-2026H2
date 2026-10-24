import { useQuery } from "convex/react"
import { ScanLine, X } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { AssetQrSvg } from "@/components/docs/AssetQrSvg"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Stand-in for the camera: every Asset's QR code. Tapping one is a Scan.
 * Stays inside the app column, so it fits the Floor simulator's phone.
 */
export function ScanPickerSheet({
  open,
  onClose,
  onScan,
  hideNames = false,
}: {
  open: boolean
  onClose: () => void
  onScan: (assetId: Id<"assets">) => void
  /** During a Round: show only the Hall, so the codes are not a list of answers. */
  hideNames?: boolean
}) {
  const assets = useQuery(api.assets.list, open ? {} : "skip")
  if (!open) return null
  return (
    <div className="absolute inset-0 z-[65] flex flex-col justify-end" role="dialog" aria-label="Scan a QR code">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 animate-in fade-in-0" />
      <div className="relative flex max-h-[80%] flex-col rounded-t-2xl bg-background shadow-xl animate-in slide-in-from-bottom-8 duration-200">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <div className="flex items-start gap-2 border-b px-4 pb-3 pt-2">
          <ScanLine className="mt-0.5 h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold">Scan the QR code</p>
            <p className="text-sm text-muted-foreground">Tap the code on the machine you are standing at.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground [@media(hover:hover)]:hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto p-3">
          {assets === undefined
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
            : assets.map((a) => (
                <button
                  key={a._id}
                  type="button"
                  onClick={() => {
                    onClose()
                    onScan(a._id)
                  }}
                  className="flex flex-col items-center gap-1 rounded-xl border bg-card p-2 text-center transition active:scale-[0.98]"
                >
                  <span className="rounded-lg bg-white p-1 ring-1 ring-border">
                    <AssetQrSvg value={a.qrToken} size={72} />
                  </span>
                  {hideNames ? (
                    <span className="line-clamp-1 text-[13px] text-muted-foreground">{a.location ?? "On the floor"}</span>
                  ) : (
                    <>
                      <span className="font-mono text-[13px] font-semibold">{a.code}</span>
                      <span className="line-clamp-1 text-[13px] text-muted-foreground">{a.name}</span>
                    </>
                  )}
                </button>
              ))}
        </div>
      </div>
    </div>
  )
}
