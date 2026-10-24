// Asset detail modal — opened from the assets list so a row click previews the
// asset in place instead of routing to /assets/:id. Mirrors ImageDetailModal:
// a Dialog shell with a skeleton while the query resolves, then the shared
// AssetDetailBody. The /assets/:id route still exists for deep links.

import { useMemo } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  toLegacyAsset,
  toLegacyAssetLog,
  toLegacyDoc,
} from "@/lib/convex-adapters"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import type { Asset, AssetLog, Doc } from "@/types"
import type { AssetPreview, DocumentRowAction } from "@/components/docs/DocumentLibraryTable"
import { AssetDetailBody, type AssetEditPatch } from "@/components/docs/AssetDetailBody"

interface AssetDetailModalProps {
  assetId: Id<"assets"> | null
  onClose: () => void
  onShowQr: (asset: Asset) => void
  onSave: (assetId: string, patch: AssetEditPatch) => void | Promise<void>
  onOpenDoc: (docId: string) => void
  onOpenAsset: (assetId: string) => void
  onOpenLog: (log: AssetLog) => void
  onDocAction: (action: DocumentRowAction, doc: Doc) => void
}

export function AssetDetailModal({
  assetId,
  onClose,
  ...rest
}: AssetDetailModalProps) {
  return (
    <Dialog open={assetId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>Asset detail</DialogTitle>
        </DialogHeader>
        {assetId && <Body assetId={assetId} {...rest} />}
      </DialogContent>
    </Dialog>
  )
}

function Body({
  assetId,
  onShowQr,
  onSave,
  onOpenDoc,
  onOpenAsset,
  onOpenLog,
  onDocAction,
}: Omit<AssetDetailModalProps, "onClose">) {
  const result = useQuery(api.assets.getWithDocs, { id: assetId })
  const previewBundle = useQuery(api.documents.listWithAssetPreviews, {})

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
  const assetsByDoc = useMemo<Record<string, AssetPreview[]>>(
    () => previewBundle?.assetsByDoc ?? {},
    [previewBundle],
  )

  if (!asset) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  return (
    <AssetDetailBody
      asset={asset}
      docs={docs}
      logs={logs}
      assetsByDoc={assetsByDoc}
      onShowQr={() => onShowQr(asset)}
      onSave={(patch) => onSave(asset.id, patch)}
      onOpenDoc={onOpenDoc}
      onOpenAsset={onOpenAsset}
      onOpenLog={onOpenLog}
      onDocAction={onDocAction}
    />
  )
}
