import { useMemo, useState } from "react"
import { Link } from "wouter"
import { useQuery } from "convex/react"
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  ExternalLink,
  FileText,
  GitBranch,
  MoreHorizontal,
  QrCode,
  Trash2,
} from "lucide-react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/time"
import { useCheckIn } from "@/lib/checkIn"
import type { Doc } from "@/types"
import { api } from "../../../convex/_generated/api"
import { STATUS_LABELS, StatusBadge } from "./StatusBadge"
import { TypeBadge } from "./TypeBadge"
import { isEngineerOrAdmin } from "@/lib/roles"

export interface AssetPreview {
  id: string
  code: string
  name: string
}

/** Master-list details per document (documents.listWithAssetPreviews). */
export interface DocMeta {
  owner: string | null
  approvedBy: string | null
  effectiveAt: number | null
  archiveReason?: string | null
  archivedAt?: number | null
}

export type OptionalColumn = "owner" | "approvedBy" | "effective"

export type DocumentRowAction = "open" | "archive" | "copy-id" | "delete"

interface DocumentLibraryTableProps {
  docs: Doc[]
  /** Optional map of `documentId` -> linked asset rows, used to render the hover popover. */
  assetsByDoc?: Record<string, AssetPreview[]>
  /** Master-list details for the optional columns. */
  metaByDoc?: Record<string, DocMeta>
  /** Optional columns to show (Owner, Approved by, Effective). */
  columns?: OptionalColumn[]
  /** Inside an Asset page the linked assets column says nothing new. */
  hideAssets?: boolean
  onRowClick?: (doc: Doc) => void
  onAssetClick?: (assetId: string) => void
  onAction?: (action: DocumentRowAction, doc: Doc) => void
  /** Optional override for the empty-state copy. */
  emptyMessage?: string
  className?: string
}

// A live (published) document with a newer edition being drafted: the live
// version stays online while current_version runs the cycle ahead of it.
function hasWorkingDraft(doc: Doc): boolean {
  return doc.live_version != null && doc.current_version > doc.live_version
}

/** A draft that was never Published: the only kind that may be deleted. */
export function neverPublished(doc: Doc): boolean {
  return doc.live_version == null && doc.status !== "published" && doc.status !== "archived"
}

function dateOf(iso: string): string {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? iso : formatDate(t)
}

const DAY = 24 * 60 * 60 * 1000

/** Next periodic review: overdue in red, due within 30 days in amber. */
function NextReviewCell({ at, now }: { at: number | null | undefined; now: number }) {
  if (at == null) return <span className="text-muted-foreground">None</span>
  const overdue = at < now
  const soon = !overdue && at - now < 30 * DAY
  return (
    <span
      className={cn(
        "whitespace-nowrap",
        overdue && "font-medium text-red-700 dark:text-red-400",
        soon && "text-amber-700 dark:text-amber-300",
        !overdue && !soon && "text-muted-foreground",
      )}
      title={overdue ? "Periodic review overdue" : soon ? "Periodic review due soon" : undefined}
    >
      {overdue ? "Overdue, " : ""}
      {formatDate(at)}
    </span>
  )
}

export function DocumentLibraryTable({
  docs: unsortedDocs,
  assetsByDoc,
  metaByDoc,
  columns = [],
  hideAssets = false,
  onRowClick,
  onAssetClick,
  onAction,
  emptyMessage = "No documents match the current filters.",
  className,
}: DocumentLibraryTableProps) {
  const nextReviews = useQuery(api.documents.nextReviews, {})
  const [reviewSort, setReviewSort] = useState<"asc" | "desc" | null>(null)
  const [now] = useState(() => Date.now())
  const docs = useMemo(() => {
    if (!reviewSort || !nextReviews) return unsortedDocs
    const dir = reviewSort === "asc" ? 1 : -1
    // Documents without a review date sort last either way.
    return [...unsortedDocs].sort((a, b) => {
      const x = nextReviews[a.id] ?? null
      const y = nextReviews[b.id] ?? null
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      return (x - y) * dir
    })
  }, [unsortedDocs, nextReviews, reviewSort])
  const SortIcon = reviewSort === "asc" ? ArrowUp : reviewSort === "desc" ? ArrowDown : ArrowUpDown
  const show = (c: OptionalColumn) => columns.includes(c)

  if (docs.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/20 p-12 text-center",
          className,
        )}
      >
        <FileText className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">No documents</p>
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className={cn("rounded-md border bg-background", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[280px]">Document</TableHead>
            <TableHead className="w-[150px]">Type</TableHead>
            <TableHead className="w-[150px]">Status</TableHead>
            <TableHead className="w-[80px]">Version</TableHead>
            {show("owner") && <TableHead className="w-[150px]">Owner</TableHead>}
            {show("approvedBy") && <TableHead className="w-[150px] whitespace-nowrap">Approved by</TableHead>}
            {show("effective") && <TableHead className="w-[120px]">Effective</TableHead>}
            {!hideAssets && <TableHead className="w-[120px] whitespace-nowrap">Linked assets</TableHead>}
            <TableHead className="w-[140px]">
              <button
                type="button"
                onClick={() =>
                  setReviewSort((s) => (s === null ? "asc" : s === "asc" ? "desc" : null))
                }
                className="inline-flex items-center gap-1 hover:text-foreground"
                aria-label="Sort by next review"
              >
                Next review
                <SortIcon className="h-3 w-3" />
              </button>
            </TableHead>
            <TableHead className="w-[120px]">Updated</TableHead>
            <TableHead className="w-[52px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((doc) => {
            const assets = assetsByDoc?.[doc.id] ?? []
            const meta = metaByDoc?.[doc.id]
            return (
              <TableRow
                key={doc.id}
                onClick={onRowClick ? () => onRowClick(doc) : undefined}
                className={cn("h-12", onRowClick && "cursor-pointer")}
              >
                <TableCell className="py-2">
                  <div className="whitespace-nowrap font-mono text-xs font-semibold">
                    {doc.naming_code || <span className="text-muted-foreground">Pre-draft</span>}
                  </div>
                  <div className="text-sm text-muted-foreground">{doc.title}</div>
                  {doc.status === "archived" && meta?.archiveReason && (
                    <div className="text-xs text-muted-foreground" title={meta.archiveReason}>
                      Withdrawn: <span className="italic">{meta.archiveReason}</span>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <TypeBadge type={doc.type} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={hasWorkingDraft(doc) ? "published" : doc.status} />
                    {hasWorkingDraft(doc) && (
                      <Link
                        href={`/docs/${doc.id}?v=${doc.current_version}`}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        title={`v${doc.current_version} is ${STATUS_LABELS[doc.status].toLowerCase()}: view it`}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
                      >
                        <GitBranch className="h-3 w-3" />v{doc.current_version} {STATUS_LABELS[doc.status]}
                      </Link>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-muted-foreground tabular-nums">
                    v{doc.live_version ?? doc.current_version}
                  </span>
                </TableCell>
                {show("owner") && (
                  <TableCell className="text-sm">{meta?.owner ?? <span className="text-muted-foreground">Not set</span>}</TableCell>
                )}
                {show("approvedBy") && (
                  <TableCell className="text-sm">
                    {meta?.approvedBy ?? <span className="text-muted-foreground">Not yet</span>}
                  </TableCell>
                )}
                {show("effective") && (
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {meta?.effectiveAt != null ? formatDate(meta.effectiveAt) : "Not published"}
                  </TableCell>
                )}
                {!hideAssets && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <LinkedAssetsCell assets={assets} onAssetClick={onAssetClick} />
                  </TableCell>
                )}
                <TableCell className="text-sm">
                  <NextReviewCell at={nextReviews?.[doc.id]} now={now} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{dateOf(doc.updated_at)}</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <RowActionsMenu doc={doc} onAction={onAction} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function LinkedAssetsCell({
  assets,
  onAssetClick,
}: {
  assets: AssetPreview[]
  onAssetClick?: (assetId: string) => void
}) {
  const count = assets.length

  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-muted-foreground/20 px-2.5 py-1 text-xs font-medium text-muted-foreground">
        <QrCode className="h-3 w-3 opacity-60" />0
      </span>
    )
  }

  return (
    <HoverCard openDelay={120} closeDelay={300}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
          aria-label={`${count} linked asset${count === 1 ? "" : "s"}`}
        >
          <QrCode className="h-3 w-3" />
          {count}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" sideOffset={8} className="w-80 p-2">
        <div className="px-2 pb-2 pt-1 text-xs font-semibold text-muted-foreground">Linked assets</div>
        <ul className="flex flex-col">
          {assets.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onAssetClick?.(a.id)}
                disabled={!onAssetClick}
                className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
              >
                <QrCode className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs font-bold text-foreground">{a.code}</div>
                  <div className="truncate text-xs text-muted-foreground">{a.name}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  )
}

function RowActionsMenu({
  doc,
  onAction,
}: {
  doc: Doc
  onAction?: (action: DocumentRowAction, doc: Doc) => void
}) {
  // Withdrawing and deleting are Engineer sign-offs; the server checks again.
  const { person } = useCheckIn()
  const engineer = isEngineerOrAdmin(person)
  const canWithdraw = engineer && doc.status !== "archived"
  const canDelete = engineer && neverPublished(doc)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Actions for ${doc.naming_code || doc.title}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => onAction?.("open", doc)}>
          <ExternalLink className="mr-2 h-4 w-4" />
          Open document
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAction?.("copy-id", doc)} disabled={!doc.naming_code}>
          <Copy className="mr-2 h-4 w-4" />
          Copy document ID
        </DropdownMenuItem>
        {(canWithdraw || canDelete) && <DropdownMenuSeparator />}
        {canWithdraw && (
          <DropdownMenuItem onSelect={() => onAction?.("archive", doc)}>
            <Archive className="mr-2 h-4 w-4" />
            Withdraw
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem
            onSelect={() => onAction?.("delete", doc)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete permanently
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
