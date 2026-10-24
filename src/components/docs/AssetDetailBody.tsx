// Shared asset detail body — rendered both by the full-page AssetDetailPage
// and by the AssetDetailModal launched from the assets list. Keep the visual
// content here so the two surfaces don't drift.
//
// The header fields (name / id / description / root toggle) are editable in
// place: there's no separate edit modal. "Save changes" stays disabled until a
// field actually differs from the stored asset, then lights up. After the save
// mutation resolves, the reactive query feeds a fresh `asset` in and the local
// state resets, so the button greys out again.

import { useEffect, useState } from "react"
import { Factory, FileText, Link as LinkIcon, MapPin, QrCode } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  DocumentLibraryTable,
  type AssetPreview,
  type DocumentRowAction,
} from "@/components/docs/DocumentLibraryTable"
import type { Asset, AssetLog, Doc } from "@/types"
import { cn } from "@/lib/utils"

const DESCRIPTION_LIMIT = 300

export interface AssetEditPatch {
  name: string
  code: string
  description: string
  level: number
}

export interface AssetDetailBodyProps {
  asset: Asset
  docs: Doc[]
  logs: AssetLog[]
  assetsByDoc: Record<string, AssetPreview[]>
  onShowQr: () => void
  onSave: (patch: AssetEditPatch) => void | Promise<void>
  onOpenDoc: (docId: string) => void
  onOpenAsset: (assetId: string) => void
  onOpenLog: (log: AssetLog) => void
  onDocAction: (action: DocumentRowAction, doc: Doc) => void
  /**
   * Which part to render: the edit form, the linked documents, or both (the
   * default, used by the dialog). The asset page shows a read-only header and
   * opens the form only behind its Edit button.
   */
  part?: "form" | "documents" | "all"
  /** Shown next to Save in the form, e.g. to close it again. */
  onCancel?: () => void
}

export function AssetDetailBody({
  asset,
  docs,
  logs,
  assetsByDoc,
  onShowQr,
  onSave,
  onOpenDoc,
  onOpenAsset,
  onOpenLog,
  onDocAction,
  part = "all",
  onCancel,
}: AssetDetailBodyProps) {
  const [name, setName] = useState(asset.name)
  const [code, setCode] = useState(asset.code)
  const [description, setDescription] = useState(asset.description ?? "")
  const [isRoot, setIsRoot] = useState(asset.level === 0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(asset.name)
    setCode(asset.code)
    setDescription(asset.description ?? "")
    setIsRoot(asset.level === 0)
  }, [asset.id, asset.name, asset.code, asset.description, asset.level])

  const charCount = description.length
  const overLimit = charCount > DESCRIPTION_LIMIT
  const dirty =
    name !== asset.name ||
    code !== asset.code ||
    description !== (asset.description ?? "") ||
    isRoot !== (asset.level === 0)
  const canSave = dirty && !!name.trim() && !!code.trim() && !overLimit && !saving

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        code: code.trim(),
        description: description.slice(0, DESCRIPTION_LIMIT),
        level: isRoot ? 0 : 1,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      {part !== "documents" && (
      <div className="space-y-5 rounded-md border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <Label htmlFor="asset-name">Asset name</Label>
            <Input
              id="asset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-lg font-semibold"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onShowQr}
            className="mt-7 shrink-0 gap-2"
          >
            <QrCode className="h-4 w-4" />
            QR code
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="asset-code">Asset ID</Label>
          <Input
            id="asset-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="font-mono"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="asset-description">Description</Label>
          <Textarea
            id="asset-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="resize-y"
          />
          <div
            className={cn(
              "text-right text-xs font-medium",
              overLimit ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {charCount}/{DESCRIPTION_LIMIT} characters
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">Root asset</div>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                Root assets represent entire machines or top-level systems
                (Level 0). Regular assets are automatically set to Level 1
                (loggable stations).
              </p>
            </div>
            <Switch
              checked={isRoot}
              onCheckedChange={setIsRoot}
              aria-label="Mark as root asset"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            <span>{asset.site}</span>
            {asset.location && (
              <>
                <span className="opacity-60">·</span>
                <span>{asset.location}</span>
              </>
            )}
          </div>
          {asset.floorplan && (
            <div className="flex items-center gap-1">
              <Factory className="h-3.5 w-3.5" />
              <span>{asset.floorplan}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <LinkIcon className="h-3.5 w-3.5" />
            <span>{asset.is_linked ? "Linked on floorplan" : "Unlinked"}</span>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wide opacity-60">Level&nbsp;</span>
            <span>{isRoot ? 0 : 1}</span>
          </div>
        </div>

        {logs.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Connected logs
            </div>
            <ul className="space-y-1.5">
              {logs.map((log) => (
                <li key={log.code}>
                  <button
                    type="button"
                    onClick={() => onOpenLog(log)}
                    className="flex w-full items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-semibold">
                        {log.code}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {log.name}
                        {log.description ? `: ${log.description}` : ""}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-4">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          )}
          <Button onClick={() => void handleSave()} disabled={!canSave}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
      )}

      {part !== "form" && (
      <div className="min-w-0 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Linked documents</h2>
          <span className="text-xs text-muted-foreground">
            {docs.length} document{docs.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <DocumentLibraryTable
            docs={docs}
            assetsByDoc={assetsByDoc}
            onRowClick={(d) => onOpenDoc(d.id)}
            onAssetClick={onOpenAsset}
            onAction={onDocAction}
            emptyMessage="No documents are linked to this asset yet."
          />
        </div>
      </div>
      )}
    </div>
  )
}
