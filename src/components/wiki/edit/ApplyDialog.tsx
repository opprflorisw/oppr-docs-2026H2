import { useEffect, useRef, useState } from "react"
import { useMutation } from "convex/react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../../../convex/_generated/api"
import { BLOCKS_APPLY, type BlockStatus } from "../../../../convex/lib/wikiTypes"
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
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { KIND_LABEL, STATUS, StatusPill, headingOf, plural, useRun, type EditCtx } from "./editShared"

/** What Apply will change in the Outline, in plain words. */
function outlineChanges(ctx: EditCtx): string[] {
  if (!ctx.state.outlineStaged) return []
  const out: string[] = []
  const live = new Map(ctx.liveSections.map((s) => [s.id, s]))
  const next = new Map(ctx.sections.map((s) => [s.id, s]))
  for (const s of ctx.sections) {
    const was = live.get(s.id)
    if (!was) {
      out.push(`Add the section "${s.heading}"`)
      continue
    }
    if (was.heading !== s.heading) out.push(`Rename "${was.heading}" to "${s.heading}"`)
    if ((was.instruction ?? "") !== (s.instruction ?? "")) out.push(`New instruction for "${s.heading}"`)
    if (!!was.safety !== !!s.safety) out.push(`"${s.heading}" ${s.safety ? "becomes" : "is no longer"} a safety section`)
    if (was.fold !== s.fold) out.push(`"${s.heading}" is ${s.fold === "closed" ? "closed" : "open"} by default`)
  }
  for (const s of ctx.liveSections) if (!next.has(s.id)) out.push(`Remove the section "${s.heading}"`)
  const liveOrder = ctx.liveSections.filter((s) => next.has(s.id)).map((s) => s.id)
  const nextOrder = ctx.sections.filter((s) => live.has(s.id)).map((s) => s.id)
  if (liveOrder.join() !== nextOrder.join()) out.push("Change the order of sections")
  return out
}

interface BlockChange {
  blockId: string
  label: string
  status: BlockStatus
  blocks: boolean
}

function blockChanges(ctx: EditCtx): BlockChange[] {
  const out: BlockChange[] = []
  for (const [blockId, r] of ctx.rows) {
    if (r.removed) {
      out.push({
        blockId,
        label: `Remove the ${KIND_LABEL[r.removed.kind].toLowerCase()} block from "${headingOf(ctx, r.removed.sectionId)}"`,
        status: r.removed.status,
        blocks: false,
      })
    } else if (r.staged) {
      const kind = KIND_LABEL[r.staged.kind].toLowerCase()
      const where = headingOf(ctx, r.staged.sectionId)
      out.push({
        blockId,
        label: r.live ? `New version of the ${kind} block in "${where}"` : `New ${kind} block in "${where}"`,
        status: r.staged.status,
        blocks: BLOCKS_APPLY.includes(r.staged.status),
      })
    }
  }
  return out
}

/**
 * Preview, then Apply (spec 3.1). Apply carries the stagedVersion this
 * preview showed, so a change by another Engineer since then is refused and
 * the preview refreshes.
 */
export function ApplyDialog({ ctx, onClose }: { ctx: EditCtx; onClose: () => void }) {
  const [shownVersion, setShownVersion] = useState(ctx.state.stagedVersion)
  const latestVersion = useRef(ctx.state.stagedVersion)
  useEffect(() => {
    latestVersion.current = ctx.state.stagedVersion
  }, [ctx.state.stagedVersion])
  const [blockedBy, setBlockedBy] = useState<{ blockId: string; status: BlockStatus }[]>([])
  const apply = useMutation(api.wikiBlocks.applyStaged)
  const { run, pending, error, setError } = useRun({ inline: true })
  const outline = outlineChanges(ctx)
  const blocks = blockChanges(ctx)
  const blockers = blocks.filter((b) => b.blocks)
  const waiting = blocks.filter((b) => b.status === "awaitingConfirm").length
  const changedSince = ctx.state.stagedVersion !== shownVersion
  const others = ctx.state.alsoEditing.map((p) => p.name).join(", ")

  async function doApply() {
    setBlockedBy([])
    const r = await run(() => apply({ wikiId: ctx.wikiId, stagedVersion: shownVersion, personId: ctx.personId }))
    if (r === undefined) {
      // Refused: show what is there now.
      setShownVersion(latestVersion.current)
      return
    }
    if (r.blockedBy.length) {
      setBlockedBy(r.blockedBy)
      return
    }
    // Blocks waiting for a second Engineer are applied, but readers see them only once confirmed.
    const now = r.applied - waiting
    toast.success(
      waiting === 0
        ? `Applied ${plural(r.applied, "change")}. Readers see the new version now.`
        : now <= 0
          ? "Applied. Readers see it once another Engineer confirms."
          : `Applied ${plural(r.applied, "change")}. Readers see them now, except ${plural(waiting, "block")} waiting for another Engineer to confirm.`,
    )
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Review and apply</DialogTitle>
          <DialogDescription>
            {plural(ctx.state.stagedCount, "unapplied change")}. Apply makes them live for every reader at once and stores
            the previous build, so you can restore it.
          </DialogDescription>
        </DialogHeader>

        {changedSince && (
          <div role="status" className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
            <span className="flex-1">{others ? `${others} changed this` : "Someone changed this"} since you opened this preview.</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                setShownVersion(ctx.state.stagedVersion)
                setError(null)
              }}
            >
              Refresh
            </Button>
          </div>
        )}

        {outline.length > 0 && (
          <section aria-label="Outline changes" className="space-y-1">
            <h3 className="text-sm font-semibold">Outline</h3>
            <ul className="list-disc space-y-0.5 pl-5 text-sm">
              {outline.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        )}

        {blocks.length > 0 && (
          <section aria-label="Block changes" className="space-y-1">
            <h3 className="text-sm font-semibold">Blocks</h3>
            <ul className="space-y-1.5">
              {blocks.map((b) => (
                <li key={b.blockId} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1">{b.label}</span>
                  <StatusPill status={b.status} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {waiting > 0 && (
          <p className="text-sm text-sky-800 dark:text-sky-200">
            {waiting === 1 ? "1 block waits" : `${waiting} blocks wait`} for a second Engineer. Apply adds them to the
            Outline; readers see them once they are confirmed.
          </p>
        )}

        {(blockers.length > 0 || blockedBy.length > 0) && (
          <div role="alert" className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
            <p className="font-medium text-destructive">Apply is blocked until these blocks pass:</p>
            <ul className="list-disc pl-5">
              {(blockedBy.length ? blockedBy : blockers).map((b) => {
                const label = blocks.find((x) => x.blockId === b.blockId)?.label ?? "A block"
                return (
                  <li key={b.blockId}>
                    {label}: {STATUS[b.status].label.toLowerCase()}
                  </li>
                )
              })}
            </ul>
            <p className="text-xs text-muted-foreground">
              Check written text against Published, wait for generation, or discard the block.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
            {changedSince ? "" : " The preview is refreshed."}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Keep editing
          </Button>
          <Button onClick={() => void doApply()} disabled={pending || blockers.length > 0 || ctx.state.stagedCount === 0}>
            {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Discard every unapplied change of this Wiki, also other people's. */
export function DiscardDialog({ ctx, onClose }: { ctx: EditCtx; onClose: () => void }) {
  const discard = useMutation(api.wikiBlocks.discardStaged)
  const { run, pending, error } = useRun({ inline: true })
  const others = ctx.state.alsoEditing.map((p) => p.name)
  async function doDiscard(e: React.MouseEvent) {
    e.preventDefault()
    const r = await run(() => discard({ wikiId: ctx.wikiId, personId: ctx.personId }))
    if (r === undefined) return
    ctx.setWriting(null)
    toast.success(`Discarded ${plural(r.discarded, "unapplied change")}.`)
    onClose()
  }
  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard {plural(ctx.state.stagedCount, "unapplied change")}?</AlertDialogTitle>
          <AlertDialogDescription>
            Unapplied changes belong to the Wiki, not to one person.
            {others.length > 0 ? ` This also discards changes by ${others.join(", ")}.` : ""} The live Wiki stays as it is.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep them</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => void doDiscard(e)}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
