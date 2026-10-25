import { Fragment, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Link, useLocation } from "wouter"
import { toast } from "sonner"
import { AlertTriangle, ArrowRight, FileEdit, Loader2, Sparkles, Trash2 } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { formatAgo } from "@/lib/time"
import { PrepareRevisionButton, errorText, type RevisionSource } from "./PrepareRevisionDialog"

const SHOWN = 3

// Proposed revision (CONTEXT.md; ADR 0003) on a Document: what the AI
// prepared, from which signal, each change as before and after with its
// reason, and the way into the draft. It never publishes anything.
export function ProposedRevisionBanner({ documentId }: { documentId: Id<"documents"> }) {
  const data = useQuery(api.revisions.forDocument, { documentId })
  const discard = useMutation(api.revisions.discard)
  const retryPrepare = useMutation(api.revisions.retry)
  const [, navigate] = useLocation()
  const [showAll, setShowAll] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const p = data?.active
  if (!p) return null

  const source = p.source
  const signal =
    source.kind === "finding" ? (
      source.finding ? (
        <>
          the {source.finding.kind} Finding with{" "}
          <Link href={`/docs/${source.finding.otherDocumentId}`} className="font-mono underline-offset-2 hover:underline">
            {source.finding.otherCode}
          </Link>{" "}
          (
          <Link href={`/library/findings?f=${source.finding._id}`} className="underline underline-offset-2">
            open the Finding
          </Link>
          )
        </>
      ) : (
        "a Finding that no longer exists"
      )
    ) : source.kind === "health" ? (
      <Link href="/library/health" className="underline underline-offset-2">
        Knowledge health
      </Link>
    ) : source.kind === "wiki_check" ? (
      source.wikiCheck ? (
        source.wikiCheck.wikiId ? (
          <Link href={`/wiki/${source.wikiCheck.wikiId}`} className="underline underline-offset-2">
            {source.wikiCheck.label}
          </Link>
        ) : (
          source.wikiCheck.label
        )
      ) : (
        "a Wiki check"
      )
    ) : (
      "this document's insights: the questions people Ask and the unclear marks"
    )

  async function onDiscard() {
    if (!p) return
    setBusy(true)
    try {
      const res = await discard({ proposedRevisionId: p._id })
      toast.success(
        res.draftRemoved
          ? `Proposed revision discarded. Draft v${p.draftVersion} was removed; v${p.baseVersion} stays in use.`
          : res.draftKept
            ? `Proposed revision discarded. Draft v${p.draftVersion} was already edited, so it stays as a normal draft.`
            : "Proposed revision discarded.",
      )
      setConfirming(false)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  if (p.status === "generating") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 print:hidden">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
        <div className="space-y-0.5 text-sm">
          <p className="font-medium">Preparing a Proposed revision</p>
          <p className="text-xs text-muted-foreground">
            From {signal}. The AI reads the Published v{p.baseVersion}; code then checks every change against the
            documents. This takes about a minute. v{p.baseVersion} stays in use.
          </p>
        </div>
      </div>
    )
  }

  if (p.status === "failed") {
    const retry: RevisionSource | null =
      source.kind === "finding"
        ? source.finding && source.finding.status === "open"
          ? { kind: "finding", findingId: source.finding._id }
          : null
        : source.kind === "wiki_check"
          ? null
          : { kind: source.kind }
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50/70 p-3 dark:border-red-500/40 dark:bg-red-500/10 print:hidden">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <p className="font-medium text-red-900 dark:text-red-100">The Proposed revision could not be prepared</p>
          <p className="text-xs text-red-800/90 dark:text-red-200/90">{p.error ?? "Unknown error."}</p>
          <p className="text-[11px] text-muted-foreground">
            Requested {formatAgo(p.createdAt)} from {signal}. Nothing was changed.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {retry && (
              <PrepareRevisionButton documentId={documentId} namingCode={p.namingCode} source={retry}>
                Try again
              </PrepareRevisionButton>
            )}
            {source.kind === "wiki_check" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  retryPrepare({ proposedRevisionId: p._id })
                    .catch((err) => toast.error(errorText(err)))
                    .finally(() => setBusy(false))
                }}
              >
                Try again
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onDiscard} disabled={busy}>
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ready or in review
  const inReview = p.status === "in_review"
  const changes = showAll ? p.changes : p.changes.slice(0, SHOWN)
  return (
    <div className="space-y-3 rounded-lg border border-violet-300 bg-violet-50/50 p-4 dark:border-violet-500/40 dark:bg-violet-500/10 print:hidden">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-300">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Proposed revision</p>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              draft v{p.draftVersion} · {inReview ? "in review" : "not reviewed yet"}
            </Badge>
            <span className="text-[11px] text-muted-foreground">prepared by AI {formatAgo(p.createdAt)}</span>
          </div>
          <p className="text-sm">{p.summary}</p>
          <p className="text-xs text-muted-foreground">From {signal}.</p>
        </div>
      </div>

      <ol className="space-y-2">
        {changes.map((c, i) => (
          <li key={i} className="space-y-1.5 rounded-md border bg-background p-3">
            <div className="grid gap-1.5 text-sm md:grid-cols-2">
              <p className="rounded bg-red-50 px-2 py-1 text-red-900 line-through decoration-red-400/70 dark:bg-red-500/10 dark:text-red-200">
                {c.before}
              </p>
              <p className="rounded bg-emerald-50 px-2 py-1 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100">
                {c.after ? <WithPlaceholders text={c.after} /> : <span className="italic">Removed</span>}
              </p>
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" />
              {c.reason}
            </p>
          </li>
        ))}
      </ol>
      {p.changes.length > SHOWN && (
        <button className="text-xs font-medium text-primary hover:underline" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show fewer" : `Show all ${p.changes.length} changes`}
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => navigate(`/docs/${documentId}/edit`)}>
          <FileEdit className="h-3.5 w-3.5" />
          Open the draft
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => navigate(`/docs/${documentId}?v=${p.draftVersion}`)}
        >
          Read v{p.draftVersion}
        </Button>
        {!inReview && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Discard
          </Button>
        )}
        <p className="ml-auto text-[11px] text-muted-foreground">
          {inReview
            ? "In review. It is Published only after an Engineer approves and publishes it."
            : "Edit it if needed, then submit it for review. The AI never publishes."}
        </p>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this Proposed revision?</AlertDialogTitle>
            <AlertDialogDescription>
              If nobody has edited draft v{p.draftVersion} yet, it is removed and the document is back to the Published
              v{p.baseVersion} only. If someone already worked on the draft, the draft stays as a normal draft and only
              the proposal is closed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void onDiscard()
              }}
              disabled={busy}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Shows "[Engineer to confirm: ...]" placeholders so they stand out. */
function WithPlaceholders({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\])/g)
  return (
    <>
      {parts.map((part, i) =>
        /^\[[^\]]+\]$/.test(part) ? (
          <span
            key={i}
            className={cn("rounded bg-amber-200/70 px-1 font-medium text-amber-900 dark:bg-amber-500/30 dark:text-amber-100")}
            title="The AI did not know this. The Engineer fills it in."
          >
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}
