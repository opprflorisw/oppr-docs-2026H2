import { useEffect, useMemo, useState } from "react"
import { useLocation, useRoute } from "wouter"
import {
  AlertTriangle,
  FileText,
  Home,
  MapPin,
  Star,
} from "lucide-react"
import { useQuery } from "convex/react"
import { useRecordUsage } from "@/lib/usage"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  toLegacyAsset,
  toLegacyAssetLog,
  toLegacyDoc,
} from "@/lib/convex-adapters"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { MobileDocCard } from "@/components/mobile/MobileDocCard"
import { AskFloatingButton } from "@/components/mobile/AskFloatingButton"
import { LogReferenceModal } from "@/components/docs/LogReferenceModal"
import {
  looksLikeConvexId,
  usePinned,
  useRecentlyViewed,
} from "@/components/mobile/use-mobile-prefs"
import type { AssetLog } from "@/types"
import { cn } from "@/lib/utils"

export function MobileAssetPage() {
  const [, params] = useRoute<{ id: string }>("/m/assets/:id")
  const id = params?.id ?? ""
  const [, navigate] = useLocation()
  const { isPinned, togglePin, removePin } = usePinned()
  const { pushRecent, removeRecent } = useRecentlyViewed()
  const [activeLog, setActiveLog] = useState<AssetLog | null>(null)

  const idIsConvexShaped = looksLikeConvexId(id)
  useEffect(() => {
    if (!idIsConvexShaped && id) {
      removePin("asset", id)
      removeRecent("asset", id)
    }
  }, [idIsConvexShaped, id, removePin, removeRecent])

  // Opening an Asset on the floor is a Scan (CONTEXT.md: Scan).
  useRecordUsage({
    kind: "scan",
    assetId: id && idIsConvexShaped ? (id as Id<"assets">) : undefined,
  })
  const result = useQuery(
    api.assets.getWithDocs,
    id && idIsConvexShaped
      ? { id: id as Id<"assets">, publishedOnly: true }
      : "skip",
  )
  const ready = idIsConvexShaped ? result !== undefined : true
  const asset = useMemo(
    () => (result ? toLegacyAsset(result.asset) : null),
    [result],
  )
  const docs = useMemo(
    () => (result ? result.documents.map(toLegacyDoc) : []),
    [result],
  )
  const logs = useMemo(
    () => (result ? result.logs.map(toLegacyAssetLog) : []),
    [result],
  )

  // Push to recently-viewed once the asset resolves.
  useEffect(() => {
    if (!asset) return
    pushRecent({
      kind: "asset",
      id: asset.id,
      label: asset.name,
      sublabel: asset.code,
    })
  }, [asset, pushRecent])

  if (!idIsConvexShaped) {
    return (
      <div className="flex h-full flex-col">
        <MobileHeader backTo="/m" title="Asset not found" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="text-sm font-semibold">
            This asset is no longer available
          </div>
          <div className="text-xs text-muted-foreground">
            Removed from Pinned and Recently viewed.
          </div>
          <Button
            size="sm"
            className="mt-2 gap-1.5"
            onClick={() => navigate("/m")}
          >
            <Home className="h-3.5 w-3.5" />
            Back to home
          </Button>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex flex-col">
        <MobileHeader backTo="/m/assets" title="Loading…" />
        <div className="space-y-2 p-4">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="flex h-full flex-col">
        <MobileHeader backTo="/m" title="Asset not found" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="text-sm font-semibold">
            This asset is no longer available
          </div>
          <div className="text-xs text-muted-foreground">
            It may have been deleted since you last opened it.
          </div>
          <Button
            size="sm"
            className="mt-2 gap-1.5"
            onClick={() => {
              if (id) {
                removePin("asset", id)
                removeRecent("asset", id)
              }
              navigate("/m")
            }}
          >
            <Home className="h-3.5 w-3.5" />
            Back to home
          </Button>
        </div>
      </div>
    )
  }

  const subtitle =
    [asset.code, asset.location].filter(Boolean).join(" • ") || asset.code
  const pinned = isPinned("asset", asset.id)

  return (
    <div className="flex flex-col">
      <MobileHeader
        backTo="/m/assets"
        title={asset.name}
        subtitle={subtitle}
        right={
          <Button
            variant="ghost"
            size="icon"
            aria-label={pinned ? "Unpin asset" : "Pin asset"}
            className="h-10 w-10"
            onClick={() =>
              togglePin({
                kind: "asset",
                id: asset.id,
                label: asset.name,
                sublabel: asset.code,
              })
            }
          >
            <Star
              className={cn(
                "h-5 w-5",
                pinned ? "fill-amber-500 text-amber-500" : "",
              )}
            />
          </Button>
        }
      />

      <div className="flex flex-col gap-3 p-3 pb-24">
        {/* Hero — pin + description */}
        <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            {asset.pin_number != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                <MapPin className="h-3 w-3" />
                Pin {String(asset.pin_number).padStart(2, "0")}
              </span>
            )}
          </div>
          {asset.description && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {asset.description}
            </p>
          )}
        </div>

        {/* Logs (Oppr LOGS) */}
        {logs.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Connected Logs
            </h2>
            <div className="flex flex-col gap-2">
              {logs.map((log) => (
                <button
                  key={log.code}
                  type="button"
                  onClick={() => setActiveLog(log)}
                  className="flex w-full items-start gap-3 rounded-2xl border bg-card p-3 text-left shadow-sm transition active:scale-[0.99]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                      {log.code}
                    </div>
                    <div className="truncate text-sm font-semibold text-foreground">
                      {log.name}
                    </div>
                    {log.description && (
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {log.description}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Documents */}
        <div className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Documents
          </h2>
          {docs.length === 0 ? (
            <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
              No documents linked to this asset.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {docs.map((doc) => (
                <MobileDocCard
                  key={doc.id}
                  doc={doc}
                  onClick={() => navigate(`/m/docs/${doc.id}`)}
                  pinned={isPinned("doc", doc.id)}
                  onTogglePin={() =>
                    togglePin({
                      kind: "doc",
                      id: doc.id,
                      label: doc.title,
                      sublabel: doc.naming_code,
                    })
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <AskFloatingButton to={`/m/ask?scope=asset:${asset.id}`} />
      <LogReferenceModal
        log={activeLog}
        open={!!activeLog}
        onOpenChange={(o) => !o && setActiveLog(null)}
      />
    </div>
  )
}
