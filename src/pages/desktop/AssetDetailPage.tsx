import { useMemo, useState } from "react"
import { Link, useLocation, useRoute } from "wouter"
import { ArrowLeft, Factory, MapPin, Pencil, QrCode } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import type { Asset, AssetLog, Doc } from "@/types"
import { AssetPreviewModal } from "@/components/docs/AssetPreviewModal"
import { LogReferenceModal } from "@/components/docs/LogReferenceModal"
import { toast } from "sonner"

export function AssetDetailPage() {
  const [, params] = useRoute<{ id: string }>("/assets/:id")
  const id = params?.id
  const [, navigate] = useLocation()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeLog, setActiveLog] = useState<AssetLog | null>(null)
  const [editing, setEditing] = useState(false)

  const result = useQuery(
    api.assets.getWithDocs,
    id ? { id: id as Id<"assets"> } : "skip",
  )
  const previewBundle = useQuery(api.documents.listWithAssetPreviews, {})
  const photoUrl = useQuery(api.assets.imageUrlFor, id ? { id: id as Id<"assets"> } : "skip")
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

      <div className="space-y-6 p-6">
        <AssetHeader
          asset={asset}
          photoUrl={photoUrl ?? null}
          docCount={docs.length}
          onShowQr={() => setPreviewOpen(true)}
          onEdit={() => setEditing((e) => !e)}
          editing={editing}
        />
        {editing && (
          <AssetDetailBody
            part="form"
            asset={asset}
            docs={docs}
            logs={logs}
            assetsByDoc={assetsByDoc}
            onShowQr={() => setPreviewOpen(true)}
            onSave={async (patch) => {
              try {
                await updateAssetMut({ id: asset.id as Id<"assets">, ...patch })
                toast.success("Asset updated")
                setEditing(false)
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Failed to update asset",
                )
              }
            }}
            onCancel={() => setEditing(false)}
            onOpenDoc={(docId) => navigate(`/docs/${docId}`)}
            onOpenAsset={(aid) => navigate(`/assets/${aid}`)}
            onOpenLog={(log) => setActiveLog(log)}
            onDocAction={handleAction}
          />
        )}
        <AssetDetailBody
          part="documents"
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
        <AssetTrainingsCard assetId={asset.id as Id<"assets">} />
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

// Read-only header: what the Asset is and where it stands. Editing sits
// behind the Edit button.
function AssetHeader({
  asset,
  photoUrl,
  docCount,
  onShowQr,
  onEdit,
  editing,
}: {
  asset: Asset
  photoUrl: string | null
  docCount: number
  onShowQr: () => void
  onEdit: () => void
  editing: boolean
}) {
  return (
    <div className="flex flex-col gap-5 rounded-md border bg-card p-5 sm:flex-row">
      <div className="flex h-40 w-full shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted sm:w-56">
        {photoUrl ? (
          <img src={photoUrl} alt={asset.name} className="h-full w-full object-cover" />
        ) : (
          <Factory className="h-10 w-10 text-muted-foreground/40" aria-label="No photo" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              {asset.code}
            </div>
            <h1 className="text-xl font-semibold leading-tight">{asset.name}</h1>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onShowQr}>
              <QrCode className="h-4 w-4" />
              QR code
            </Button>
            <Button
              variant={editing ? "secondary" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={onEdit}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {[asset.site, asset.location].filter(Boolean).join(" · ") || "Location not set"}
          </span>
          {asset.pin_number != null && (
            <span>Pin {String(asset.pin_number).padStart(2, "0")} on the floor plan</span>
          )}
          <span>
            {docCount} linked document{docCount === 1 ? "" : "s"}
          </span>
        </div>
        {asset.description && (
          <p className="max-w-2xl text-sm leading-relaxed">{asset.description}</p>
        )}
      </div>
    </div>
  )
}
