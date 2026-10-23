// Project Assets — table view modeled on the LOGS module's asset list.
//
// Each row shows a static row number, the asset, a Pin No. badge (its
// floorplan pin), a docs count + hover popover, a logs count + hover popover
// (logs live in the Oppr LOGS module — clicking one opens a reference modal),
// the floorplan name, the created date, and three row actions: open the
// QR/preview modal, open the edit modal, or (visual-only) delete.
//
// A third icon button next to the grid/list view toggle opens a Floorplan
// modal that renders the floorplan image with pin overlays and a connected
// assets table beneath.

import { useMemo, useState } from "react"
import { useLocation } from "wouter"
import {
  Factory,
  LayoutGrid,
  List,
  Map as MapIcon,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { toLegacyAsset, toLegacyAssetLog } from "@/lib/convex-adapters"
import type { Asset, AssetLog, Doc } from "@/types"
import type { DocumentRowAction } from "@/components/docs/DocumentLibraryTable"
import { cn } from "@/lib/utils"
import { AssetPreviewModal } from "@/components/docs/AssetPreviewModal"
import { AssetDetailModal } from "@/components/docs/AssetDetailModal"
import { AddAssetModal } from "@/components/docs/AddAssetModal"
import { LogReferenceModal } from "@/components/docs/LogReferenceModal"
import { DeleteDocumentDialog } from "@/components/docs/DeleteDocumentDialog"
import {
  DocsHoverPill,
  FloorplanModal,
  FLOORPLAN_IMAGE_SRC,
  LogsHoverPill,
  type DocPreview,
} from "@/components/docs/FloorplanModal"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { toast } from "sonner"

const FLOORPLAN_NAME = "Pigment Calcination Floorplan"

function formatCreated(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

export function AssetsPage() {
  const [, navigate] = useLocation()

  const [view, setView] = useState<"grid" | "list">("list")
  const [tab, setTab] = useState<"list" | "hierarchy">("list")
  const [floorplanOpen, setFloorplanOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const [detailAssetId, setDetailAssetId] = useState<Id<"assets"> | null>(null)
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null)
  const [activeLog, setActiveLog] = useState<AssetLog | null>(null)

  const result = useQuery(api.assets.listForAssetsPage, {})
  const updateAssetMut = useMutation(api.assets.update)
  const archive = useMutation(api.documents.archive)
  const remove = useMutation(api.documents.remove)
  const [docToDelete, setDocToDelete] = useState<Doc | null>(null)
  const [deleting, setDeleting] = useState(false)
  const ready = result !== undefined

  const assets = useMemo(
    () => (result ? result.assets.map(toLegacyAsset) : []),
    [result],
  )

  const docsByAsset = useMemo(() => {
    const map = new Map<string, DocPreview[]>()
    if (!result) return map
    for (const [k, v] of Object.entries(result.docsByAsset)) {
      map.set(k, v)
    }
    return map
  }, [result])

  const logsByAsset = useMemo(() => {
    const map = new Map<string, AssetLog[]>()
    if (!result) return map
    for (const [k, v] of Object.entries(result.logsByAsset)) {
      map.set(k, v.map(toLegacyAssetLog))
    }
    return map
  }, [result])

  async function handleSaveAsset(
    assetId: string,
    patch: { name: string; code: string; description: string; level: number },
  ) {
    try {
      await updateAssetMut({
        id: assetId as Id<"assets">,
        name: patch.name,
        code: patch.code,
        description: patch.description,
        level: patch.level,
      })
      toast.success("Asset updated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update asset")
    }
  }

  function handleDocAction(action: DocumentRowAction, doc: Doc) {
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

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Site Assets" }]} />
      <PageHeader
        icon={Factory}
        title="Site Assets"
        subtitle="Manage and view all assets on this site"
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add asset
          </Button>
        }
      />

      <div className="space-y-4 p-6">
        {/* Tabs + view toggle + floorplan picker (in-page filter) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="list">Asset List</TabsTrigger>
              <TabsTrigger value="hierarchy">Asset Hierarchy</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border bg-background p-0.5">
              <Button
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setView("grid")}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={view === "list" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setView("list")}
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setFloorplanOpen(true)}
                aria-label="Open floorplan"
                title="Open floorplan"
              >
                <MapIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {!ready ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-12 text-center">
            <Factory className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No assets yet</p>
            <p className="text-xs text-muted-foreground">
              Reset the demo from Settings to seed sample data.
            </p>
          </div>
        ) : tab === "hierarchy" ? (
          <AssetHierarchyView assets={assets} />
        ) : (
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-12 text-xs uppercase tracking-wide">#</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Asset</TableHead>
                  <TableHead className="w-24 text-xs uppercase tracking-wide">Pin No.</TableHead>
                  <TableHead className="w-24 text-xs uppercase tracking-wide">Docs</TableHead>
                  <TableHead className="w-24 text-xs uppercase tracking-wide">Logs</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Floorplan</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Created</TableHead>
                  <TableHead className="w-32 text-right text-xs uppercase tracking-wide">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((asset, idx) => (
                  <TableRow
                    key={asset.id}
                    className="cursor-pointer"
                    onClick={() => setDetailAssetId(asset.id as Id<"assets">)}
                  >
                    {/* # */}
                    <TableCell className="align-middle text-sm font-medium tabular-nums">
                      {String(idx + 1).padStart(2, "0")}
                    </TableCell>

                    {/* Asset name + id */}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <QrCode className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {asset.name}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {asset.code}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Pin No. */}
                    <TableCell>
                      {asset.pin_number != null ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
                          <MapPin className="h-3 w-3" />
                          {String(asset.pin_number).padStart(2, "0")}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Linked documents — count + hover list */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DocsHoverPill
                        docs={docsByAsset.get(asset.id) ?? []}
                        onDocClick={(docId) => navigate(`/docs/${docId}`)}
                      />
                    </TableCell>

                    {/* Logs (Oppr LOGS) — count + hover list */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <LogsHoverPill
                        logs={logsByAsset.get(asset.id) ?? []}
                        onLogClick={(log) => setActiveLog(log)}
                      />
                    </TableCell>

                    {/* Floorplan */}
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Factory className="h-3.5 w-3.5" />
                        <span>{asset.floorplan ?? "—"}</span>
                      </div>
                    </TableCell>

                    {/* Created */}
                    <TableCell className="text-sm text-muted-foreground">
                      {formatCreated(asset.created_at)}
                    </TableCell>

                    {/* Actions */}
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Show QR code"
                          onClick={() => setPreviewAsset(asset)}
                        >
                          <QrCode className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Edit asset"
                          onClick={() => setDetailAssetId(asset.id as Id<"assets">)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Delete asset"
                          onClick={() =>
                            toast.info(
                              "Asset deletion is disabled in the showcase build.",
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <AssetDetailModal
        assetId={detailAssetId}
        onClose={() => setDetailAssetId(null)}
        onShowQr={(a) => setPreviewAsset(a)}
        onSave={handleSaveAsset}
        onOpenDoc={(docId) => {
          setDetailAssetId(null)
          navigate(`/docs/${docId}`)
        }}
        onOpenAsset={(aid) => setDetailAssetId(aid as Id<"assets">)}
        onOpenLog={(log) => setActiveLog(log)}
        onDocAction={handleDocAction}
      />
      <AssetPreviewModal
        asset={previewAsset}
        open={!!previewAsset}
        onOpenChange={(o) => !o && setPreviewAsset(null)}
      />
      <LogReferenceModal
        log={activeLog}
        open={!!activeLog}
        onOpenChange={(o) => !o && setActiveLog(null)}
      />
      <AddAssetModal open={addOpen} onOpenChange={setAddOpen} />
      <FloorplanModal
        open={floorplanOpen}
        onOpenChange={setFloorplanOpen}
        floorplanName={FLOORPLAN_NAME}
        imageSrc={FLOORPLAN_IMAGE_SRC}
        assets={assets}
        docsByAsset={docsByAsset}
        logsByAsset={logsByAsset}
        onPreviewAsset={(a) => setPreviewAsset(a)}
        onOpenDoc={(docId) => {
          setFloorplanOpen(false)
          navigate(`/docs/${docId}`)
        }}
        onOpenLog={(log) => setActiveLog(log)}
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

function AssetHierarchyView({ assets }: { assets: Asset[] }) {
  const roots = assets.filter((a) => a.level === 0)
  const stations = assets.filter((a) => a.level !== 0)
  return (
    <div className="rounded-md border bg-card p-6">
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Factory className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold">{stations[0]?.floorplan ?? "Floorplan"}</span>
        <span className="text-muted-foreground">— {assets.length} asset{assets.length === 1 ? "" : "s"}</span>
      </div>
      {roots.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Root assets (Level 0)
          </div>
          <ul className="space-y-1">
            {roots.map((r) => (
              <li key={r.id} className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                <span className="font-medium">{r.name}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">{r.code}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Loggable stations (Level 1)
        </div>
        <ul className="space-y-1">
          {stations.map((s) => (
            <li
              key={s.id}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                s.is_linked
                  ? "border-primary/20 bg-primary/5"
                  : "bg-muted/20",
              )}
            >
              <QrCode className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{s.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
              {s.linked_log_code && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {s.linked_log_code}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
