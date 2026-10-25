import { useState } from "react"
import { useMutation } from "convex/react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../../../convex/_generated/api"
import { DEFAULT_MAX_DANGER, MAX_MAX_DANGER, type Length, type ReadingLevel } from "../../../../convex/lib/wikiTypes"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useRun, type EditCtx } from "./editShared"

/**
 * Wiki settings (spec 3.2, 3.3, D2, D5): second-Engineer confirm, the danger
 * callout limit (raising it needs a reason), and the reading level and
 * length the full rebuild uses.
 */
export function SettingsDialog({ ctx, onClose }: { ctx: EditCtx; onClose: () => void }) {
  const s = ctx.state.settings
  const [confirmByAnother, setConfirm] = useState(s.confirmByAnother)
  const [maxDanger, setMaxDanger] = useState(s.maxDanger)
  const [reason, setReason] = useState("")
  const [level, setLevel] = useState<ReadingLevel | null>(s.readingLevel)
  const [length, setLength] = useState<Length | null>(s.length)
  const update = useMutation(api.wikiBlocks.updateSettings)
  const { run, pending, error } = useRun({ inline: true })

  const raising = maxDanger > s.maxDanger && maxDanger > DEFAULT_MAX_DANGER
  const changed =
    confirmByAnother !== s.confirmByAnother || maxDanger !== s.maxDanger || level !== s.readingLevel || length !== s.length
  const canSave = changed && !pending && (!raising || !!reason.trim())

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) return
    const ok = await run(() =>
      update({
        wikiId: ctx.wikiId,
        ...(confirmByAnother !== s.confirmByAnother ? { confirmByAnother } : {}),
        ...(maxDanger !== s.maxDanger ? { maxDanger } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(level && level !== s.readingLevel ? { readingLevel: level } : {}),
        ...(length && length !== s.length ? { length } : {}),
        personId: ctx.personId,
      }),
    )
    if (ok === undefined) return
    toast.success("Settings saved. The change is logged.")
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(e) => void submit(e)} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Wiki settings</DialogTitle>
            <DialogDescription>These apply at once and are logged with your name.</DialogDescription>
          </DialogHeader>

          <div className="flex items-start justify-between gap-4 rounded-md border px-3 py-2.5">
            <Label htmlFor="set-confirm" className="space-y-0.5">
              <span className="block text-sm">A second Engineer confirms written text</span>
              <span className="block text-xs font-normal text-muted-foreground">
                Every written or edited block waits for another Engineer before readers see it. On by default for Start
                here Wikis.
              </span>
            </Label>
            <Switch id="set-confirm" checked={confirmByAnother} onCheckedChange={setConfirm} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="set-danger">Danger callouts on this Wiki, at most</Label>
            <Select value={String(maxDanger)} onValueChange={(v) => setMaxDanger(Number(v))}>
              <SelectTrigger id="set-danger" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: MAX_MAX_DANGER }, (_, i) => i + 1).map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Default {DEFAULT_MAX_DANGER}. More red boxes make each one easier to ignore.
            </p>
            {raising && (
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="set-reason">Why raise the limit? (required)</Label>
                <Textarea id="set-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="set-level">Reading level</Label>
              <Select value={level ?? undefined} onValueChange={(v) => setLevel(v as ReadingLevel)}>
                <SelectTrigger id="set-level">
                  <SelectValue placeholder="Follows the purpose line" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="floor">Floor</SelectItem>
                  <SelectItem value="office">Office</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-length">Length</Label>
              <Select value={length ?? undefined} onValueChange={(v) => setLength(v as Length)}>
                <SelectTrigger id="set-length">
                  <SelectValue placeholder="Normal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oneScreen">One screen</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">Used by the full rebuild. A block can choose its own.</p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
