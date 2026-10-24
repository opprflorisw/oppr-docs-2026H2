// "Compare with v1": what changed between two versions of a document, passage
// by passage. Built from the version bodies (superseded versions keep their
// body for the record, not their passages), so it works for any two versions.

import { useMemo } from "react"
import { useQuery } from "convex/react"
import { Minus, Plus } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { chunksFromTipTap } from "./chunking"

function passages(body: unknown): { text: string; section: string | null }[] {
  return chunksFromTipTap(body).map((c) => ({ text: c.text.replace(/\s+/g, " ").trim(), section: c.section }))
}

export function VersionCompareDialog({
  documentId,
  from,
  to,
  open,
  onOpenChange,
}: {
  documentId: string
  /** The older version. */
  from: number
  /** The newer version. */
  to: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const a = useQuery(
    api.documents.getVersionByNumber,
    open ? { documentId: documentId as Id<"documents">, version: from } : "skip",
  )
  const b = useQuery(
    api.documents.getVersionByNumber,
    open ? { documentId: documentId as Id<"documents">, version: to } : "skip",
  )

  const diff = useMemo(() => {
    if (!a || !b) return null
    if (a.bodyKind !== "tiptap" || b.bodyKind !== "tiptap") return { pdf: true as const }
    const before = passages(a.bodyJson)
    const after = passages(b.bodyJson)
    const beforeSet = new Set(before.map((p) => p.text))
    const afterSet = new Set(after.map((p) => p.text))
    return {
      pdf: false as const,
      removed: before.filter((p) => !afterSet.has(p.text)),
      added: after.filter((p) => !beforeSet.has(p.text)),
      unchanged: after.filter((p) => beforeSet.has(p.text)).length,
    }
  }, [a, b])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            v{to} compared with v{from}
          </DialogTitle>
          <DialogDescription>
            Passages taken out of v{from} and passages new in v{to}. Moved passages that kept their wording are not
            shown.
          </DialogDescription>
        </DialogHeader>
        {a === undefined || b === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !a || !b || !diff ? (
          <p className="text-sm text-muted-foreground">One of these versions is no longer available.</p>
        ) : diff.pdf ? (
          <p className="text-sm text-muted-foreground">
            These versions are PDF files. Open each version to compare the pages.
          </p>
        ) : diff.removed.length === 0 && diff.added.length === 0 ? (
          <p className="text-sm text-muted-foreground">The text is the same in both versions.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {diff.removed.length} taken out, {diff.added.length} new, {diff.unchanged} unchanged.
            </p>
            <ul className="space-y-2">
              {diff.removed.map((p, i) => (
                <li
                  key={`r${i}`}
                  className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm dark:border-red-500/30 dark:bg-red-500/10"
                >
                  <Minus className="mt-0.5 h-4 w-4 shrink-0 text-red-700 dark:text-red-300" aria-label="Taken out" />
                  <span>
                    {p.section && <span className="block text-xs text-muted-foreground">{p.section}</span>}
                    <span className="line-through decoration-red-400/70">{p.text}</span>
                  </span>
                </li>
              ))}
              {diff.added.map((p, i) => (
                <li
                  key={`a${i}`}
                  className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10"
                >
                  <Plus className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-label="New" />
                  <span>
                    {p.section && <span className="block text-xs text-muted-foreground">{p.section}</span>}
                    {p.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
