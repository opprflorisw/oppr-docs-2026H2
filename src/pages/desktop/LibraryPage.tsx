import { useEffect, useMemo, useState } from "react"
import { useLocation, useSearch } from "wouter"
import { Columns3, Download, LayoutList, Layers, Library as LibraryIcon, PlusCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Doc, DocumentStatus, DocumentType } from "@/types"
import { toLegacyDoc } from "@/lib/convex-adapters"
import { useDocTypes } from "@/lib/typeMeta"
import { formatDate } from "@/lib/time"
import { cn } from "@/lib/utils"
import {
  DocumentLibraryTable,
  type AssetPreview,
  type DocMeta,
  type DocumentRowAction,
  type OptionalColumn,
} from "@/components/docs/DocumentLibraryTable"
import { useDocumentRowActions } from "@/components/docs/DocumentActions"
import { DocumentsTabs } from "@/components/docs/DocumentsTabs"
import { STATUS_LABELS } from "@/components/docs/StatusBadge"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { NewDocumentChooserDialog } from "./DocumentNewChooserPage"
import { toast } from "sonner"
import { useCheckIn } from "@/lib/checkIn"

type StatusFilter = DocumentStatus | "all"
type TypeFilter = DocumentType | "all"

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "pre_draft", label: "Pre-draft" },
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In review" },
  { value: "approved", label: "Approved" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Withdrawn and superseded" },
]

const OPTIONAL_COLUMNS: { value: OptionalColumn; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "approvedBy", label: "Approved by" },
  { value: "effective", label: "Effective" },
]
const COLUMNS_KEY = "oppr-docs:library-columns"
const DAY = 24 * 60 * 60 * 1000

function readColumns(): OptionalColumn[] {
  try {
    const raw = window.localStorage.getItem(COLUMNS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    if (Array.isArray(parsed)) return parsed.filter((c): c is OptionalColumn => OPTIONAL_COLUMNS.some((o) => o.value === c))
  } catch {
    // Storage blocked: fall back to no optional columns.
  }
  return []
}

function LoadingState() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

function csvCell(value: string): string {
  return /[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** The master list of controlled documents as a CSV file (ISO 9001 7.5.3). */
function downloadMasterList(
  docs: Doc[],
  meta: Record<string, DocMeta>,
  nextReviews: Record<string, number | null> | undefined,
  typeLabel: (slug: string) => string,
) {
  const header = [
    "Document ID",
    "Title",
    "Type",
    "Status",
    "Version in use",
    "Owner",
    "Approved by",
    "Effective",
    "Next review",
    "Withdrawal reason",
    "Updated",
  ]
  const rows = docs.map((d) => {
    const m = meta[d.id]
    const status = d.live_version != null && d.status !== "archived" ? "published" : d.status
    const next = nextReviews?.[d.id] ?? null
    return [
      d.naming_code,
      d.title,
      typeLabel(d.type),
      d.status === "archived" ? "Withdrawn" : STATUS_LABELS[status],
      d.live_version != null ? `v${d.live_version}` : "",
      m?.owner ?? "",
      m?.approvedBy ?? "",
      m?.effectiveAt != null ? formatDate(m.effectiveAt) : "",
      next != null ? formatDate(next) : "",
      m?.archiveReason ?? "",
      formatDate(Date.parse(d.updated_at)),
    ]
  })
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `master-list-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function LibraryPage() {
  const [, navigate] = useLocation()
  const [search, setSearch] = useState("")
  const urlSearch = useSearch()
  const { person } = useCheckIn()
  // A checked-in Operator reads and hands in Captures; Engineers and Admins
  // start Documents. An old /docs/new link says so instead of a silent stop.
  const operator = person?.kind === "operator"
  const askedNew = new URLSearchParams(urlSearch).get("new") === "1"
  const [newOpen, setNewOpen] = useState(() => askedNew && !operator)
  useEffect(() => {
    if (askedNew && operator)
      toast.message("New Documents are started by Engineers and Admins.", {
        id: "operator-new-document",
        description: "To hand in how you do a job, record a Capture on the phone.",
      })
  }, [askedNew, operator])
  // ?status= lets Home link straight to a filtered list.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    () => (new URLSearchParams(urlSearch).get("status") as StatusFilter | null) ?? "all",
  )
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [recent, setRecent] = useState(false)
  const [groupByType, setGroupByType] = useState(false)
  const [columns, setColumns] = useState<OptionalColumn[]>(readColumns)
  const { types: docTypes, resolve: resolveType } = useDocTypes()
  const { handleAction, dialogs } = useDocumentRowActions()
  const nextReviews = useQuery(api.documents.nextReviews, {})
  const [now] = useState(() => Date.now())

  function toggleColumn(c: OptionalColumn, on: boolean) {
    setColumns((prev) => {
      const next = on ? [...prev.filter((x) => x !== c), c] : prev.filter((x) => x !== c)
      const ordered = OPTIONAL_COLUMNS.map((o) => o.value).filter((v) => next.includes(v))
      try {
        window.localStorage.setItem(COLUMNS_KEY, JSON.stringify(ordered))
      } catch {
        // Storage blocked: the choice lasts for this visit only.
      }
      return ordered
    })
  }

  const typeOptions = useMemo<Array<{ value: TypeFilter; label: string }>>(
    () => [
      { value: "all", label: "All types" },
      ...docTypes.map((t) => ({ value: t.slug, label: t.label })),
    ],
    [docTypes],
  )

  const queryArgs = useMemo(
    () => ({
      ...(statusFilter !== "all" && { status: statusFilter }),
      ...(typeFilter !== "all" && { type: typeFilter }),
      ...(search.trim() && { search: search.trim() }),
    }),
    [search, statusFilter, typeFilter],
  )

  const result = useQuery(api.documents.listWithAssetPreviews, queryArgs)
  const ready = result !== undefined
  const metaByDoc = useMemo<Record<string, DocMeta>>(() => result?.metaByDoc ?? {}, [result])
  const docs = useMemo(() => {
    const all = result ? result.docs.map(toLegacyDoc) : []
    if (!recent) return all
    return all.filter((d) => {
      const at = metaByDoc[d.id]?.effectiveAt
      return d.status !== "archived" && at != null && now - at <= 7 * DAY
    })
  }, [result, recent, metaByDoc, now])
  const assetsByDoc = useMemo<Record<string, AssetPreview[]>>(
    () => result?.assetsByDoc ?? {},
    [result],
  )
  const filtered = statusFilter !== "all" || typeFilter !== "all" || recent || search.trim() !== ""

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Documents" }]} />
      <PageHeader
        icon={LibraryIcon}
        title="Documents"
        statusLine="Every controlled Document with its version and status. Only the Published version counts: Operators read it, Ask answers from it and Trainings test it."
        primary={
          operator
            ? undefined
            : { label: "New document", icon: PlusCircle, onClick: () => setNewOpen(true), tour: "documents-new-button" }
        }
        secondary={[
          {
            label: "Master list",
            icon: Download,
            tour: "documents-master-list",
            disabled: !ready || docs.length === 0,
            disabledReason: "No documents to export.",
            onClick: () => downloadMasterList(docs, metaByDoc, nextReviews, (s) => resolveType(s).label),
          },
        ]}
      />
      <DocumentsTabs />
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2" data-tour="documents-filters">
          <Input
            data-tour="documents-search"
            placeholder="Search by title or document ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 min-w-[260px] max-w-sm flex-1"
            aria-label="Search documents"
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-9 w-[210px]" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
            <SelectTrigger className="h-9 w-[190px]" aria-label="Type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            aria-pressed={recent}
            onClick={() => setRecent((r) => !r)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
              recent
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            Published in last 7 days
            {recent && <X className="h-3.5 w-3.5" aria-hidden />}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <Columns3 />
                  Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 space-y-2 p-3">
                <p className="text-xs font-medium text-muted-foreground">Extra columns</p>
                {OPTIONAL_COLUMNS.map((c) => (
                  <div key={c.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`col-${c.value}`}
                      checked={columns.includes(c.value)}
                      onCheckedChange={(v) => toggleColumn(c.value, v === true)}
                    />
                    <Label htmlFor={`col-${c.value}`} className="text-sm font-normal">
                      {c.label}
                    </Label>
                  </div>
                ))}
              </PopoverContent>
            </Popover>
            <div className="flex items-center gap-1 rounded-md border bg-background p-0.5">
              <Button
                type="button"
                variant={groupByType ? "ghost" : "secondary"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setGroupByType(false)}
                aria-label="Flat list"
                title="Flat list"
              >
                <LayoutList className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={groupByType ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setGroupByType(true)}
                aria-label="Group by type"
                title="Group by type"
              >
                <Layers className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              {docs.length} document{docs.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        {!ready ? (
          <LoadingState />
        ) : groupByType ? (
          <GroupedByType
            docs={docs}
            assetsByDoc={assetsByDoc}
            metaByDoc={metaByDoc}
            columns={columns}
            typeOrder={docTypes.map((t) => t.slug)}
            typeLabels={Object.fromEntries(docTypes.map((t) => [t.slug, t.label]))}
            onRowClick={(d) => navigate(`/docs/${d.id}`)}
            onAssetClick={(id) => navigate(`/assets/${id}`)}
            onAction={handleAction}
          />
        ) : (
          <DocumentLibraryTable
            tour="documents-list"
            docs={docs}
            assetsByDoc={assetsByDoc}
            metaByDoc={metaByDoc}
            columns={columns}
            onRowClick={(d) => navigate(`/docs/${d.id}`)}
            onAssetClick={(id) => navigate(`/assets/${id}`)}
            onAction={handleAction}
            emptyMessage={
              filtered
                ? "No documents match these filters. Clear a filter to see more."
                : "No documents yet. Choose New document to write the first one."
            }
          />
        )}
      </div>

      {dialogs}
      <NewDocumentChooserDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  )
}

interface GroupedByTypeProps {
  docs: Doc[]
  assetsByDoc: Record<string, AssetPreview[]>
  metaByDoc: Record<string, DocMeta>
  columns: OptionalColumn[]
  typeOrder: DocumentType[]
  typeLabels: Record<string, string>
  onRowClick: (d: Doc) => void
  onAssetClick: (id: string) => void
  onAction: (action: DocumentRowAction, doc: Doc) => void
}

function GroupedByType({
  docs,
  assetsByDoc,
  metaByDoc,
  columns,
  typeOrder,
  typeLabels,
  onRowClick,
  onAssetClick,
  onAction,
}: GroupedByTypeProps) {
  const groups = useMemo(() => {
    const map = new Map<DocumentType, Doc[]>()
    for (const t of typeOrder) map.set(t, [])
    // Any doc whose type isn't in the vocabulary lands in a trailing bucket so
    // nothing silently disappears from the grouped view.
    const orphans: Doc[] = []
    for (const d of docs) {
      const list = map.get(d.type)
      if (list) list.push(d)
      else orphans.push(d)
    }
    const result = typeOrder
      .filter((t) => (map.get(t) ?? []).length > 0)
      .map((t) => ({ type: t, label: typeLabels[t] ?? t, docs: map.get(t) ?? [] }))
    if (orphans.length > 0) result.push({ type: "__other__", label: "Other", docs: orphans })
    return result
  }, [docs, typeOrder, typeLabels])

  if (groups.length === 0)
    return (
      <DocumentLibraryTable docs={[]} emptyMessage="No documents match these filters. Clear a filter to see more." />
    )

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.type}>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">{g.label}</h2>
            <span className="text-sm text-muted-foreground">
              {g.docs.length} document{g.docs.length === 1 ? "" : "s"}
            </span>
          </div>
          <DocumentLibraryTable
            docs={g.docs}
            assetsByDoc={assetsByDoc}
            metaByDoc={metaByDoc}
            columns={columns}
            onRowClick={onRowClick}
            onAssetClick={onAssetClick}
            onAction={onAction}
          />
        </section>
      ))}
    </div>
  )
}
