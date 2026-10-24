// RefileDocumentDialog
//
// The naming code is immutable, so changing location/discipline/type means
// creating a NEW document with a fresh code (content and roles copied) and —
// by default — archiving the old one. This dialog owns that flow.

import { useEffect, useMemo, useState } from "react"
import { useLocation } from "wouter"
import { toast } from "sonner"
import { ArrowRight, Hash } from "lucide-react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { useDocTypes } from "@/lib/typeMeta"
import type { DocumentType } from "@/types"

interface RefileDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  docId: string
  currentCode: string
  currentLocation: string
  currentDiscipline: string
  currentType: DocumentType
}

export function RefileDocumentDialog({
  open,
  onOpenChange,
  docId,
  currentCode,
  currentLocation,
  currentDiscipline,
  currentType,
}: RefileDocumentDialogProps) {
  const [, setLocation] = useLocation()
  const vocab = useQuery(api.naming.listVocabulary)
  const refile = useMutation(api.documents.refile)

  const [loc, setLoc] = useState(currentLocation)
  const [disc, setDisc] = useState(currentDiscipline)
  const [type, setType] = useState<DocumentType>(currentType)
  const [archiveOld, setArchiveOld] = useState(true)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoc(currentLocation)
    setDisc(currentDiscipline)
    setType(currentType)
    setArchiveOld(true)
  }, [open, currentLocation, currentDiscipline, currentType])

  const unchanged =
    loc === currentLocation && disc === currentDiscipline && type === currentType
  const incomplete = !loc || !disc

  const preview = useQuery(
    api.naming.peekNextCode,
    open && !incomplete && !unchanged
      ? { location: loc, discipline: disc, type }
      : "skip",
  )

  const locations = vocab?.locations ?? []
  const disciplines = vocab?.disciplines ?? []
  const { types: docTypes, resolve: resolveType } = useDocTypes()

  const typeLabel = useMemo(() => resolveType(type).label, [resolveType, type])

  async function confirm() {
    setRunning(true)
    try {
      const result = await refile({
        id: docId as Id<"documents">,
        location: loc,
        discipline: disc,
        type,
        archiveOld,
      })
      toast.success(
        `Created ${result.namingCode}${archiveOld ? ", old document withdrawn" : ""}`,
      )
      onOpenChange(false)
      setLocation(`/docs/${result.id}/edit`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refile failed")
    } finally {
      setRunning(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change filing: new document</DialogTitle>
          <DialogDescription>
            Location, discipline, and type are part of the naming code, which is
            fixed. Changing them creates a new document with a new code; the
            content carries over.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Location</Label>
              <Select value={loc || undefined} onValueChange={setLoc}>
                <SelectTrigger className="h-9 px-2 font-mono text-xs">
                  {loc || "None"}
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l._id} value={l.code}>
                      <span className="font-mono">{l.code}</span> · {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Discipline</Label>
              <Select value={disc || undefined} onValueChange={setDisc}>
                <SelectTrigger className="h-9 px-2 font-mono text-xs">
                  {disc || "None"}
                </SelectTrigger>
                <SelectContent>
                  {disciplines.map((d) => (
                    <SelectItem key={d._id} value={d.code}>
                      <span className="font-mono">{d.code}</span> · {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as DocumentType)}
              >
                <SelectTrigger className="h-9 px-2 text-xs">
                  {typeLabel}
                </SelectTrigger>
                <SelectContent>
                  {docTypes
                    .filter((t) => t.active || t.slug === type)
                    .map((t) => (
                      <SelectItem key={t.slug} value={t.slug}>
                        {t.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm">
            <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">{currentCode}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {unchanged ? (
              <span className="text-muted-foreground">pick a new filing</span>
            ) : incomplete ? (
              <span className="text-muted-foreground">…</span>
            ) : (
              <span className="font-semibold">{preview?.code ?? "…"}</span>
            )}
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={archiveOld}
              onCheckedChange={(v) => setArchiveOld(v === true)}
              className="mt-0.5"
            />
            <span>
              Archive {currentCode} after creating the new document
              <span className="block text-xs text-muted-foreground">
                Recommended: avoids two live documents with the same content.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={running}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void confirm()}
            disabled={running || unchanged || incomplete}
          >
            {running ? "Creating…" : "Create new document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
