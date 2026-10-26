// Assets: the equipment in the plant, one row per Asset.
//
// Each row shows the Asset, its pin on the floor plan, its documents (count +
// hover list) and its location. A row opens the Asset page. Engineers get a
// '...' menu with Edit, QR code and Delete. The plant plan lives on /floor.

import { errorText } from "@/lib/errorText"
import { useMemo, useState } from "react"
import { useLocation } from "wouter"
import { Factory, Map as MapIcon, MapPin, MoreHorizontal, Pencil, Plus, QrCode, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { toLegacyAsset } from "@/lib/convex-adapters"
import type { Asset, AssetLog } from "@/types"
import { cn } from "@/lib/utils"
import { useCheckIn } from "@/lib/checkIn"
import { AssetPreviewModal } from "@/components/docs/AssetPreviewModal"
import { AssetDetailModal } from "@/components/docs/AssetDetailModal"
import { AddAssetModal } from "@/components/docs/AddAssetModal"
import { LogReferenceModal } from "@/components/docs/LogReferenceModal"
import { useDocumentRowActions } from "@/components/docs/DocumentActions"
import { DocsHoverPill, type DocPreview } from "@/components/docs/FloorplanModal"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { toast } from "sonner"
import { isEngineerOrAdmin } from "@/lib/roles"

/** `embedded`: shown as the Assets tab of Plant, without its own header. */
export function AssetsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [, navigate] = useLocation()
  const { person } = useCheckIn()
  const engineer = isEngineerOrAdmin(person)

  const [tab, setTab] = useState<"list" | "hierarchy">("list")
  const [addOpen, setAddOpen] = useState(false)
  const [search, setSearch] = useState("")

  const [detailAssetId, setDetailAssetId] = useState<Id<"assets"> | null>(null)
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null)
  const [activeLog, setActiveLog] = useState<AssetLog | null>(null)

  const result = useQuery(api.assets.listForAssetsPage, {})
  const updateAssetMut = useMutation(api.assets.update)
  const { handleAction: handleDocAction, dialogs } = useDocumentRowActions()
  const ready = result !== undefined

  const allAssets = useMemo(() => (result ? result.assets.map(toLegacyAsset) : []), [result])
  const assets = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return allAssets
    return allAssets.filter(
      (a) =>
        a.name.toLowerCase().includes(needle) ||
        a.code.toLowerCase().includes(needle) ||
        (a.location ?? "").toLowerCase().includes(needle),
    )
  }, [allAssets, search])

  const docsByAsset = useMemo(() => {
    const map = new Map<string, DocPreview[]>()
    if (!result) return map
    for (const [k, v] of Object.entries(result.docsByAsset)) map.set(k, v)
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
        personId: person?._id,
      })
      toast.success("Asset updated")
    } catch (err) {
      toast.error(errorText(err, "The Asset could not be updated."))
    }
  }

  return (
    <div className="flex flex-col">
      {!embedded && (
        <>
          <TopBar breadcrumb={[{ label: "Assets" }]} />
          <PageHeader
            icon={Factory}
            title="Assets"
            statusLine="The equipment in the plant. Each Asset's QR code leads to its documents."
            secondary={[{ label: "Floor simulator", icon: MapIcon, href: "/floor" }]}
            primary={
              engineer
                ? { label: "Add asset", icon: Plus, onClick: () => setAddOpen(true) }
                : undefined
            }
          />
        </>
      )}

      <div className={embedded ? "space-y-4" : "space-y-4 p-6"}>
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList data-tour="assets-views">
              <TabsTrigger value="list" aria-controls={undefined}>Asset list</TabsTrigger>
              <TabsTrigger value="hierarchy" aria-controls={undefined}>Asset hierarchy</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code or location"
            aria-label="Search assets"
            data-tour="assets-search"
            className="h-9 max-w-xs"
          />
          <span className="ml-auto text-sm text-muted-foreground">
            {assets.length} asset{assets.length === 1 ? "" : "s"}
          </span>
          {embedded && (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate("/floor")} data-tour="assets-floor-button">
                <MapIcon className="h-4 w-4" aria-hidden /> Floor simulator
              </Button>
              {engineer && (
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4" aria-hidden /> Add asset
                </Button>
              )}
            </>
          )}
        </div>

        {!ready ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-12 text-center">
            <Factory className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">{search ? "No assets match" : "No assets yet"}</p>
            <p className="text-sm text-muted-foreground">
              {search
                ? "Try another name or code."
                : engineer
                  ? "Choose Add asset to put the first machine on the list."
                  : "An Engineer adds the plant's machines here."}
            </p>
          </div>
        ) : tab === "hierarchy" ? (
          <AssetHierarchyView assets={assets} />
        ) : (
          <div className="rounded-md border bg-card" data-tour="assets-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead className="w-36">Floor plan pin</TableHead>
                  <TableHead className="w-28">Documents</TableHead>
                  <TableHead>Location</TableHead>
                  {engineer && <TableHead className="w-14" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((asset) => (
                  <TableRow
                    key={asset.id}
                    className="h-12 cursor-pointer"
                    onClick={() => navigate(`/assets/${asset.id}`)}
                  >
                    <TableCell className="py-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <QrCode className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{asset.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{asset.code}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {asset.pin_number != null ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                          <MapPin className="h-3 w-3" />
                          {String(asset.pin_number).padStart(2, "0")}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not placed</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DocsHoverPill
                        docs={docsByAsset.get(asset.id) ?? []}
                        onDocClick={(docId) => navigate(`/docs/${docId}`)}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{asset.location ?? "Not set"}</TableCell>
                    {engineer && (
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${asset.code}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onSelect={() => setDetailAssetId(asset.id as Id<"assets">)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setPreviewAsset(asset)}>
                              <QrCode className="mr-2 h-4 w-4" />
                              QR code
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => toast.info("Deleting Assets is switched off in this demo.")}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
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
      <LogReferenceModal log={activeLog} open={!!activeLog} onOpenChange={(o) => !o && setActiveLog(null)} />
      <AddAssetModal open={addOpen} onOpenChange={setAddOpen} />
      {dialogs}
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
        <span className="font-semibold">{assets[0]?.site || "Plant"}</span>
        <span className="text-muted-foreground">· {assets.length} asset{assets.length === 1 ? "" : "s"}</span>
      </div>
      {roots.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-xs font-semibold text-muted-foreground">
            Root assets (level 0)
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
        <div className="mb-2 text-xs font-semibold text-muted-foreground">
          Loggable stations (level 1)
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
