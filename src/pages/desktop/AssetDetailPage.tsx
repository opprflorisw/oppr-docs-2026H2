import { useMemo, useState } from "react"
import { Link, useLocation, useRoute } from "wouter"
import { ArrowLeft } from "lucide-react"
import { TopBar } from "@/components/layout/TopBar"
import { Skeleton } from "@/components/ui/skeleton"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  toLegacyAsset,
  toLegacyAssetLog,
  toLegacyDoc,
} from "@/lib/convex-adapters"
import { type AssetPreview, type DocumentRowAction } from "@/components/docs/DocumentLibraryTable"
import { DeleteDocumentDialog } from "@/components/docs/DeleteDocumentDialog"
import { AssetDetailBody } from "@/components/docs/AssetDetailBody"
import { AssetTrainingsCard } from "@/components/learn/AssetTrainingsCard"
import type { AssetLog, Doc } from "@/types"
import { AssetPreviewModal } from "@/components/docs/AssetPreviewModal"
import { LogReferenceModal } from "@/components/docs/LogReferenceModal"
import { toast } from "sonner"

export function AssetDetailPage() {
  const [, params] = useRoute<{ id: string }>("/assets/:id")
  const id = params?.id
  const [, navigate] = useLocation()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeLog, setActiveLog] = useState<AssetLog | null>(null)

  const result = useQuery(
    api.assets.getWithDocs,
    id ? { id: id as Id<"assets"> } : "skip",
  )
  const previewBundle = useQuery(api.documents.listWithAssetPreviews, {})
  const updateAssetMut = useMutation(api.assets.update)
  const archive = useMutation(api.documents.archive)
  const remove = useMutation(api.documents.remove)
  const [docToDelete, setDocToDelete] = useState<Doc | null>(null)
  const [deleting, setDeleting] = useState(false)
  const ready = result !== undefined

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

  function handleAction(action: DocumentRowAction, doc: Doc) {
    if (action === "open") {
      navigate(`/docs/${doc.id}`)
      return
    }
    if (action === "copy-id") {
      navigator.clipboard
        .writeText(doc.naming_code)
        .then(() => toast.success(`Copied ${doc.naming_code}`))
        .catch(() => toast.error("Failed to copy"))
      return
    }
    if (action === "duplicate") {
      toast.info("Duplicate isn't wired up yet.")
      return
    }
    if (action === "archive") {
      archive({ id: doc.id as Id<"documents"> })
        .then(() => toast.success(`Archived ${doc.naming_code}`))
        .catch((err) =>
          toast.error(err instanceof Error ? err.message : "Failed to archive"),
        )
      return
    }
    if (action === "delete") {
      setDocToDelete(doc)
    }
  }

  async function handleArchiveFromDialog() {
    if (!docToDelete) return
    try {
      await archive({ id: docToDelete.id as Id<"documents"> })
      toast.success(`Archived ${docToDelete.naming_code}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive")
    } finally {
      setDocToDelete(null)
    }
  }

  async function handleDeleteConfirm() {
    if (!docToDelete) return
    setDeleting(true)
    try {
      await remove({ id: docToDelete.id as Id<"documents"> })
      toast.success(`Deleted ${docToDelete.naming_code}`)
      setDocToDelete(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete")
    } finally {
      setDeleting(false)
    }
  }

  if (!ready) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="space-y-3 p-6">
        <Link
          href="/assets"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to assets
        </Link>
        <h1 className="text-xl font-semibold">Asset not found</h1>
        <p className="text-sm text-muted-foreground">
          We couldn't find an asset with id <code>{id}</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <TopBar
        breadcrumb={[
          { label: "Assets", href: "/assets" },
          { label: `${asset.code} · ${asset.name}` },
        ]}
      />

      <div className="p-6">
        <AssetDetailBody
          asset={asset}
          docs={docs}
          logs={logs}
          assetsByDoc={assetsByDoc}
          onShowQr={() => setPreviewOpen(true)}
          onSave={async (patch) => {
            try {
              await updateAssetMut({ id: asset.id as Id<"assets">, ...patch })
              toast.success("Asset updated")
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Failed to update asset",
              )
            }
          }}
          onOpenDoc={(docId) => navigate(`/docs/${docId}`)}
          onOpenAsset={(aid) => navigate(`/assets/${aid}`)}
          onOpenLog={(log) => setActiveLog(log)}
          onDocAction={handleAction}
        />
        <div className="mt-6">
          <AssetTrainingsCard assetId={asset.id as Id<"assets">} />
        </div>
      </div>

      <AssetPreviewModal
        asset={asset}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
      <LogReferenceModal
        log={activeLog}
        open={!!activeLog}
        onOpenChange={(o) => !o && setActiveLog(null)}
      />
      <DeleteDocumentDialog
        doc={docToDelete}
        open={!!docToDelete}
        onOpenChange={(o) => !o && !deleting && setDocToDelete(null)}
        onArchive={() => void handleArchiveFromDialog()}
        onConfirmDelete={() => void handleDeleteConfirm()}
        busy={deleting}
      />
    </div>
  )
}
