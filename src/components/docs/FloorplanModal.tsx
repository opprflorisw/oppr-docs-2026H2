// Floorplan modal — lets the user see every asset on its plant floorplan,
// with pin overlays placed near the actual machines and a connected-assets
// table below mirroring the LOGS module's floorplan view.

import type { Asset, AssetLog, Doc } from "@/types"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Button } from "@/components/ui/button"
import { Files, FileText, MapPin, Trash2 } from "lucide-react"
import { toast } from "sonner"

type DocPreview = Pick<Doc, "id" | "naming_code" | "title" | "current_version">

export function FloorplanModal({
  open,
  onOpenChange,
  floorplanName,
  imageSrc,
  assets,
  docsByAsset,
  logsByAsset,
  onPreviewAsset,
  onOpenDoc,
  onOpenLog,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  floorplanName: string
  imageSrc: string
  assets: Asset[]
  docsByAsset: Map<string, DocPreview[]>
  logsByAsset: Map<string, AssetLog[]>
  onPreviewAsset: (asset: Asset) => void
  onOpenDoc: (docId: string) => void
  onOpenLog: (log: AssetLog) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto overflow-x-hidden p-0">
        <div className="px-6 pb-6 pt-5">
          <DialogTitle className="text-base font-semibold">
            {floorplanName}
          </DialogTitle>

          {/* Floorplan with pin overlays */}
          <div className="mt-4 overflow-hidden rounded-md border bg-muted/20">
            <div className="relative">
              <img
                src={imageSrc}
                alt={floorplanName}
                className="block h-auto w-full select-none"
                draggable={false}
              />
              {assets
                .filter(
                  (a) =>
                    a.pin_x != null &&
                    a.pin_y != null &&
                    a.pin_number != null,
                )
                .map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onPreviewAsset(a)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-110 focus:outline-none"
                    style={{ left: `${a.pin_x}%`, top: `${a.pin_y}%` }}
                    aria-label={`${a.code} ${a.name}`}
                    title={`${a.code} · ${a.name}`}
                  >
                    <FloorplanPin n={a.pin_number ?? 0} />
                  </button>
                ))}
            </div>
          </div>

          {/* Connected assets table */}
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold">Connected Assets</h3>
            <div className="rounded-md border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-12 text-xs uppercase tracking-wide">
                      #
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">
                      Asset ID
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">
                      Name
                    </TableHead>
                    <TableHead className="w-24 text-xs uppercase tracking-wide">
                      Pin No.
                    </TableHead>
                    <TableHead className="w-24 text-xs uppercase tracking-wide">
                      Logs
                    </TableHead>
                    <TableHead className="w-24 text-xs uppercase tracking-wide">
                      Docs
                    </TableHead>
                    <TableHead className="w-16 text-right text-xs uppercase tracking-wide">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((a, idx) => (
                    <TableRow key={a.id}>
                      <TableCell className="tabular-nums text-sm font-medium">
                        {String(idx + 1).padStart(2, "0")}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {a.code}
                      </TableCell>
                      <TableCell className="text-sm">{a.name}</TableCell>
                      <TableCell>
                        {a.pin_number != null ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
                            <MapPin className="h-3 w-3" />
                            {String(a.pin_number).padStart(2, "0")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <LogsHoverPill
                          logs={logsByAsset.get(a.id) ?? []}
                          onLogClick={onOpenLog}
                        />
                      </TableCell>
                      <TableCell>
                        <DocsHoverPill
                          docs={docsByAsset.get(a.id) ?? []}
                          onDocClick={onOpenDoc}
                        />
                      </TableCell>
                      <TableCell className="text-right">
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FloorplanPin({ n }: { n: number }) {
  return (
    <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center gap-0.5 rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground shadow ring-2 ring-white">
      <MapPin className="h-3 w-3" />
      {String(n).padStart(2, "0")}
    </span>
  )
}

// --- Cells (count + hover popover) ----------------------------------------

export function LogsHoverPill({
  logs,
  onLogClick,
}: {
  logs: AssetLog[]
  onLogClick: (log: AssetLog) => void
}) {
  const count = logs.length
  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-muted-foreground/20 px-2.5 py-1 text-xs font-medium text-muted-foreground">
        <FileText className="h-3 w-3 opacity-60" />0
      </span>
    )
  }
  return (
    <HoverCard openDelay={120} closeDelay={300}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
          aria-label={`${count} connected log${count === 1 ? "" : "s"}`}
        >
          <FileText className="h-3 w-3" />
          {count}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="end"
        sideOffset={8}
        collisionPadding={16}
        className="w-72 p-2"
      >
        <div className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Connected logs
        </div>
        <ul className="flex flex-col">
          {logs.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                onClick={() => onLogClick(l)}
                className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
              >
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs font-bold text-foreground">
                    {l.code}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {l.name}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  )
}

export function DocsHoverPill({
  docs,
  onDocClick,
}: {
  docs: DocPreview[]
  onDocClick: (docId: string) => void
}) {
  const count = docs.length
  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-muted-foreground/20 px-2.5 py-1 text-xs font-medium text-muted-foreground">
        <Files className="h-3 w-3 opacity-60" />0
      </span>
    )
  }
  return (
    <HoverCard openDelay={120} closeDelay={300}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
          aria-label={`${count} linked document${count === 1 ? "" : "s"}`}
        >
          <Files className="h-3 w-3" />
          {count}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="end"
        sideOffset={8}
        collisionPadding={16}
        className="w-72 p-2"
      >
        <div className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Linked documents
        </div>
        <ul className="flex flex-col">
          {docs.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onDocClick(d.id)}
                className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
              >
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs font-bold text-foreground">
                    {d.naming_code}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {d.title}
                  </div>
                </div>
                <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                  v{d.current_version}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  )
}

// Path of the floorplan image served from /public.
export const FLOORPLAN_IMAGE_SRC = "/floorplan-pigment-calcination.png"

export type { DocPreview }
