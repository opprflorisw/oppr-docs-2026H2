import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import type { BuildSummary } from "../../../../convex/lib/wikiTypes"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { formatDateTime } from "@/lib/time"
import { plural, useRun, type EditCtx } from "./editShared"

const REASON: Record<BuildSummary["reason"], string> = {
  build: "Build",
  apply: "Applied changes",
  confirm: "Confirmed block",
  restore: "Restored",
  preMigration: "Before the move to the new layout",
}

/**
 * Restore previous build (spec 3.1): the last 10 builds with time, who and
 * why. Restoring writes the chosen build back as a new build; nothing is
 * deleted. Waits while an AI job runs for this Wiki.
 */
export function RestoreDialog({ ctx, onClose }: { ctx: EditCtx; onClose: () => void }) {
  const builds = useQuery(api.wikiBlocks.builds, { wikiId: ctx.wikiId })
  const restore = useMutation(api.wikiBlocks.restoreBuild)
  const { run, pending, error } = useRun({ inline: true })
  const [picked, setPicked] = useState<Id<"wikiBuilds"> | null>(null)
  const [reason, setReason] = useState("")
  const choices = builds ?? []

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!picked || !reason.trim()) return
    const ok = await run(() => restore({ wikiId: ctx.wikiId, buildId: picked, reason: reason.trim(), personId: ctx.personId }))
    if (ok === undefined) return
    toast.success("Restored. It is stored as a new build, so nothing is lost.")
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Restore previous build</DialogTitle>
            <DialogDescription>
              The chosen build becomes the live Wiki again, as a new build. The current one stays in the list.
            </DialogDescription>
          </DialogHeader>

          {builds === undefined ? (
            <div className="space-y-2" aria-hidden>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : choices.length < 2 ? (
            <p className="text-sm text-muted-foreground">There is no earlier build to restore yet.</p>
          ) : (
            <fieldset>
              <legend className="sr-only">Builds</legend>
              <RadioGroup value={picked ?? ""} onValueChange={(v) => setPicked(v as Id<"wikiBuilds">)} className="space-y-1.5">
                {choices.map((b, i) => (
                  <label
                    key={b._id}
                    className={`flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm ${b.restorable && i > 0 ? "" : "opacity-50"}`}
                  >
                    <RadioGroupItem value={b._id} disabled={!b.restorable || i === 0} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {formatDateTime(b.builtAt)} · {REASON[b.reason]}
                        {b.personName ? ` by ${b.personName}` : ""}
                        {i === 0 ? " · live now" : ""}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {b.trigger ? `${b.trigger} · ` : ""}
                        {plural(b.points, "fact")} · {plural(b.sources.length, "document")}
                        {b.restorable ? "" : " · stored before the upgrade, cannot be restored"}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
          )}

          {choices.length >= 2 && (
          <div className="space-y-1.5">
            <Label htmlFor="restore-reason">Why restore? (required, logged)</Label>
            <Textarea id="restore-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          )}

          {ctx.jobRunning && (
            <p role="status" className="text-sm text-muted-foreground">
              An AI job is running for this Wiki. Restore is possible when it is done.
            </p>
          )}
          {ctx.state.stagedCount > 0 && (
            <p className="text-xs text-muted-foreground">Unapplied changes are not touched by a restore.</p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !picked || !reason.trim() || ctx.jobRunning}>
              {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Restore
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
