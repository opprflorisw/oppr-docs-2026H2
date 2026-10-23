import { useMemo, useState } from "react"
import { useLocation, useSearch } from "wouter"
import { LayoutList, Layers, Library as LibraryIcon, PlusCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import type { Doc, DocumentStatus, DocumentType } from "@/types"
import { toLegacyDoc } from "@/lib/convex-adapters"
import { useDocTypes } from "@/lib/typeMeta"
import {
  DocumentLibraryTable,
  type AssetPreview,
  type DocumentRowAction,
} from "@/components/docs/DocumentLibraryTable"
import { DeleteDocumentDialog } from "@/components/docs/DeleteDocumentDialog"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { toast } from "sonner"
import { NewDocumentChooserDialog } from "./DocumentNewChooserPage"

type StatusFilter = DocumentStatus | "all"
type TypeFilter = DocumentType | "all"

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "pre_draft", label: "Pre-draft" },
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In review" },
  { value: "approved", label: "Approved" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
]

function LoadingState() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

export function LibraryPage() {
  const [, navigate] = useLocation()
  const [search, setSearch] = useState("")
  const urlSearch = useSearch()
  const [newOpen, setNewOpen] = useState(() => new URLSearchParams(urlSearch).get("new") === "1")
  // ?status= lets Home link straight to a filtered list.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    () => (new URLSearchParams(urlSearch).get("status") as StatusFilter | null) ?? "all",
  )
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [groupByType, setGroupByType] = useState(false)
  const { types: docTypes } = useDocTypes()

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
  const archive = useMutation(api.documents.archive)
  const remove = useMutation(api.documents.remove)
  const [docToDelete, setDocToDelete] = useState<Doc | null>(null)
  const [deleting, setDeleting] = useState(false)
  const ready = result !== undefined
  const docs = useMemo(
    () => (result ? result.docs.map(toLegacyDoc) : []),
    [result],
  )
  const assetsByDoc = useMemo<Record<string, AssetPreview[]>>(
    () => result?.assetsByDoc ?? {},
    [result],
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

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Documents" }]} />
      <PageHeader
        icon={LibraryIcon}
        title="Documents"
        subtitle="Every controlled document. Only the published version of each counts as knowledge."
        actions={
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
            New document
          </Button>
        }
      />
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search by title or naming code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[300px] max-w-sm flex-1 text-sm"
          />
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="w-[160px]">
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
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as TypeFilter)}
          >
            <SelectTrigger className="w-[180px]">
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
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border bg-background p-0.5">
              <Button
                type="button"
                variant={groupByType ? "ghost" : "secondary"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setGroupByType(false)}
                title="Flat list"
              >
                <LayoutList className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={groupByType ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setGroupByType(true)}
                title="Group by type"
              >
                <Layers className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
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
            typeOrder={docTypes.map((t) => t.slug)}
            typeLabels={Object.fromEntries(docTypes.map((t) => [t.slug, t.label]))}
            onRowClick={(d) => navigate(`/docs/${d.id}`)}
            onAssetClick={(id) => navigate(`/assets/${id}`)}
            onAction={handleAction}
          />
        ) : (
          <DocumentLibraryTable
            docs={docs}
            assetsByDoc={assetsByDoc}
            onRowClick={(d) => navigate(`/docs/${d.id}`)}
            onAssetClick={(id) => navigate(`/assets/${id}`)}
            onAction={handleAction}
          />
        )}
      </div>

      <DeleteDocumentDialog
        doc={docToDelete}
        open={!!docToDelete}
        onOpenChange={(o) => !o && !deleting && setDocToDelete(null)}
        onArchive={() => void handleArchiveFromDialog()}
        onConfirmDelete={() => void handleDeleteConfirm()}
        busy={deleting}
      />
      <NewDocumentChooserDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  )
}

interface GroupedByTypeProps {
  docs: Doc[]
  assetsByDoc: Record<string, AssetPreview[]>
  typeOrder: DocumentType[]
  typeLabels: Record<string, string>
  onRowClick: (d: Doc) => void
  onAssetClick: (id: string) => void
  onAction: (action: DocumentRowAction, doc: Doc) => void
}

function GroupedByType({
  docs,
  assetsByDoc,
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
    if (orphans.length > 0)
      result.push({ type: "__other__", label: "Other", docs: orphans })
    return result
  }, [docs, typeOrder, typeLabels])

  if (groups.length === 0) return null

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.type}>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">{g.label}</h2>
            <span className="text-xs text-muted-foreground">
              {g.docs.length} document{g.docs.length === 1 ? "" : "s"}
            </span>
          </div>
          <DocumentLibraryTable
            docs={g.docs}
            assetsByDoc={assetsByDoc}
            onRowClick={onRowClick}
            onAssetClick={onAssetClick}
            onAction={onAction}
          />
        </section>
      ))}
    </div>
  )
}
