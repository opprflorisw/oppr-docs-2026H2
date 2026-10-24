import { useQuery } from "convex/react"
import { isMobilePath } from "@/lib/utils"
import { Link, useLocation } from "wouter"
import { AlertTriangle } from "lucide-react"
import { api } from "../../../convex/_generated/api"

// Under an Ask answer: open contradictions between Published documents that
// the answer drew from (CONTEXT.md: Ask keeps answering, but warns and names
// both sources). Reactive, so it disappears once the Finding is closed.
export function AskConflictWarning({
  citations,
}: {
  citations: { documentId: string; chunkId: string }[]
}) {
  const documentIds = Array.from(new Set(citations.map((c) => c.documentId)))
  const found = useQuery(
    api.findings.openConflictsFor,
    documentIds.length > 0 ? { documentIds } : "skip",
  )
  const [location] = useLocation()
  // Only conflicts this answer is about: it cites one of the two disagreeing
  // passages, or it draws on both documents.
  const cited = new Set(citations.map((c) => c.chunkId))
  const docs = new Set(documentIds)
  const conflicts = (found ?? []).filter(
    (c) =>
      (c.a.chunkId != null && cited.has(c.a.chunkId)) ||
      (c.b.chunkId != null && cited.has(c.b.chunkId)) ||
      (docs.has(c.a.documentId) && docs.has(c.b.documentId)),
  )
  if (conflicts.length === 0) return null
  // On the floor (mobile) the Operator gets the documents; Engineers on the
  // desktop also get the Finding.
  const floor = isMobilePath(location)
  const docHref = (id: string) => (floor ? `/m/docs/${id}` : `/docs/${id}`)

  return (
    <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
      {conflicts.map((c) => (
        <div key={c._id} className="flex items-start gap-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium">Known conflict: {c.summary}</p>
            <p className="text-[11px] opacity-90">
              <Link href={docHref(c.a.documentId)} className="font-mono underline-offset-2 hover:underline">
                {c.a.namingCode}
              </Link>{" "}
              and{" "}
              <Link href={docHref(c.b.documentId)} className="font-mono underline-offset-2 hover:underline">
                {c.b.namingCode}
              </Link>{" "}
              disagree. Check with the document owner before you act.
              {!floor && (
                <>
                  {" "}
                  <Link href={`/library/findings?f=${c._id}`} className="font-medium text-primary hover:underline">
                    Open Finding
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
