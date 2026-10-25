import { useState } from "react"
import { useMutation } from "convex/react"
import { Loader2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { formatDate } from "@/lib/time"
import { Pill, effectiveRow, headingOf, useRun, type EditCtx } from "./editShared"

/**
 * Second-Engineer confirm (spec 3.1, 5.1): the claims beside their verbatim
 * Published passages. Any checked-in Engineer or Admin other than the author
 * may confirm, or send the block back with a note.
 */
export function ConfirmPanel({ ctx, blockId, onClose }: { ctx: EditCtx; blockId: string; onClose: () => void }) {
  const row = effectiveRow(ctx.rows.get(blockId))
  const confirm = useMutation(api.wikiBlocks.confirmBlock)
  const sendBack = useMutation(api.wikiBlocks.sendBack)
  const { run, pending, error } = useRun({ inline: true })
  const [backing, setBacking] = useState(false)
  const [note, setNote] = useState("")

  if (!row) return null
  const wrote = row.authorPersonId === ctx.personId
  const ranCheck = row.check?.personId === ctx.personId
  const mine = wrote || ranCheck
  // The stored check holds the verbatim passage of every claim, whoever ran it.
  const check = row.check
  const quoteOf = (chunkId: string): string | null => {
    for (const c of check?.claims ?? []) for (const p of c.passages) if (p.chunkId === chunkId) return p.quote
    return ctx.wiki.excerpts[chunkId] ?? null
  }
  const judgeOnly = (check?.claims ?? []).filter((c) => c.verdict === "supportedByJudge").length

  async function doConfirm() {
    const ok = await run(() => confirm({ wikiId: ctx.wikiId, blockId, personId: ctx.personId }))
    if (ok === undefined) return
    toast.success("Confirmed. Readers see this block now.")
    onClose()
  }

  async function doSendBack(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    const ok = await run(() => sendBack({ wikiId: ctx.wikiId, blockId, note: note.trim(), personId: ctx.personId }))
    if (ok === undefined) return
    toast.success(`Sent back to ${row?.authorName ?? "its author"}.`)
    onClose()
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="space-y-1">
          <SheetTitle>Confirm a written block</SheetTitle>
          <SheetDescription>
            In "{headingOf(ctx, row.sectionId)}". Written by {row.authorName ?? "an Engineer"}
            {row.checkedAt ? `, checked ${formatDate(row.checkedAt)}` : ""}. Read each claim beside its Published passage.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex-1 space-y-3">
          {judgeOnly > 0 && (
            <p className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100">
              {judgeOnly === 1 ? "One claim was" : `${judgeOnly} claims were`} found only by the AI judge. The judge's verdict
              is evidence for you, never the decision.
            </p>
          )}
          {row.status !== "awaitingConfirm" && (
            <p className="text-sm text-muted-foreground">This block does not wait for a confirm any more.</p>
          )}
          <ol className="space-y-2.5">
            {row.points.map((p, i) => (
              <li key={i} className="grid gap-2 rounded-md border bg-background p-2.5 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Written</p>
                  <p className="text-sm">{p.text}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground">Published</p>
                  {p.citations.length === 0 && <Pill tone="red">No passage cited</Pill>}
                  {p.citations.map((c) => {
                    const q = quoteOf(c.chunkId)
                    return (
                      <blockquote key={c.chunkId} className="border-l-2 pl-2 text-xs">
                        <span className="font-mono text-muted-foreground">
                          {c.namingCode} v{c.version}
                          {c.section ? ` · ${c.section}` : ""}
                        </span>
                        {q ? (
                          <span className="mt-0.5 block whitespace-pre-line">"{q}"</span>
                        ) : (
                          <span className="mt-0.5 block text-muted-foreground">Open the Document to read the passage.</span>
                        )}
                      </blockquote>
                    )
                  })}
                </div>
              </li>
            ))}
          </ol>
          {row.points.length === 0 && <p className="text-sm text-muted-foreground">This block has no claims yet.</p>}
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <SheetFooter className="mt-4 flex-col gap-2 sm:flex-col sm:space-x-0">
          {mine ? (
            <p className="text-sm text-muted-foreground">
              {wrote ? "You wrote this block." : "You ran the check on this block."} Another Engineer must confirm it.
            </p>
          ) : backing ? (
            <form onSubmit={(e) => void doSendBack(e)} className="space-y-2">
              <Label htmlFor="send-back-note">What should {row.authorName ?? "the author"} change?</Label>
              <Textarea
                id="send-back-note"
                rows={3}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                autoFocus
                required
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setBacking(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending || !note.trim()}>
                  {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Send back
                </Button>
              </div>
            </form>
          ) : (
            <>
              <Button onClick={() => void doConfirm()} disabled={pending || row.status !== "awaitingConfirm"} className="w-full">
                {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1.5 h-4 w-4" />}
                Confirm
              </Button>
              <Button variant="ghost" onClick={() => setBacking(true)} disabled={pending || row.status !== "awaitingConfirm"}>
                Send back
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
