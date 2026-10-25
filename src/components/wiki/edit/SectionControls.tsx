import { useState } from "react"
import { useAction, useMutation } from "convex/react"
import { ArrowDown, ArrowUp, Loader2, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../../../convex/_generated/api"
import type { OutlineSection } from "../../../../convex/lib/wikiTypes"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { errorText, headingOf, sectionRows, useRun, type EditCtx, type Panel } from "./editShared"

const MAX_HEADING = 120
const MAX_INSTRUCTION = 200

/** Rename, move and remove for one section (spec 3.2). Move buttons, no drag and drop. */
export function SectionControls({ ctx, section, index }: { ctx: EditCtx; section: OutlineSection; index: number }) {
  const move = useMutation(api.wikiBlocks.moveSection)
  const { run, pending } = useRun()
  const isIntro = section.role === "intro"
  const first = index === 0 || ctx.sections[index - 1]?.role === "intro"
  const last = index === ctx.sections.length - 1
  const doMove = (direction: "up" | "down") =>
    void run(() => move({ wikiId: ctx.wikiId, sectionId: section.id, direction, personId: ctx.personId }))
  return (
    <div className="flex items-center gap-0.5">
      {pending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Saving" />}
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        aria-label={`Edit section ${section.heading}`}
        onClick={() => ctx.open({ kind: "editSection", sectionId: section.id })}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      {!isIntro && (
        <>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={`Move ${section.heading} up`}
            disabled={first || pending}
            onClick={() => doMove("up")}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={`Move ${section.heading} down`}
            disabled={last || pending}
            onClick={() => doMove("down")}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive"
            aria-label={`Remove section ${section.heading}`}
            onClick={() => ctx.open({ kind: "removeSection", sectionId: section.id })}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  )
}

/** Add a section, or change its heading, instruction, safety and fold default (spec 3.2). */
export function SectionDialog({
  ctx,
  panel,
  onClose,
}: {
  ctx: EditCtx
  panel: Extract<Panel, { kind: "addSection" | "editSection" }>
  onClose: () => void
}) {
  const existing = panel.kind === "editSection" ? ctx.sections.find((s) => s.id === panel.sectionId) ?? null : null
  const [heading, setHeading] = useState(existing?.heading ?? "")
  const [instruction, setInstruction] = useState(existing?.instruction ?? "")
  const [safety, setSafety] = useState(existing?.safety ?? false)
  const [fold, setFold] = useState<"open" | "closed">(existing?.fold ?? "open")
  const addSection = useMutation(api.wikiBlocks.addSection)
  const updateSection = useMutation(api.wikiBlocks.updateSection)
  const generateBlock = useAction(api.ai.wikiBlock.generateBlock)
  const { run, pending, error } = useRun({ inline: true })
  const isIntro = existing?.role === "intro"

  const trimmed = heading.trim()
  const effectiveFold = safety ? "open" : fold

  async function regenerateSection(sectionId: string) {
    const generated = sectionRows(ctx, sectionId).filter(({ row, removed }) => !removed && row.origin === "generated")
    for (const { row } of generated) {
      try {
        const res = await generateBlock({ wikiId: ctx.wikiId, blockId: row.blockId, personId: ctx.personId })
        if (!res.ok) {
          toast.error(res.message ?? "The block was not regenerated.")
          return
        }
      } catch (err) {
        toast.error(errorText(err))
        return
      }
    }
    if (generated.length) toast.success("Section regenerated. The new text is an unapplied change.")
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!trimmed) return
    if (panel.kind === "addSection") {
      const sectionId = await run(async () => {
        const id = await addSection({
          wikiId: ctx.wikiId,
          afterSectionId: panel.afterSectionId,
          heading: trimmed,
          instruction: instruction.trim() || undefined,
          safety: safety || undefined,
          personId: ctx.personId,
        })
        if (effectiveFold === "closed")
          await updateSection({ wikiId: ctx.wikiId, sectionId: id, fold: "closed", personId: ctx.personId })
        return id
      })
      // Starts 3.3: the Generate panel for the new section. Nothing runs before Generate is pressed.
      if (sectionId) ctx.open({ kind: "generate", sectionId, afterBlockId: null })
      return
    }
    if (!existing) return
    const instructionChanged = (existing.instruction ?? "") !== instruction.trim()
    const ok = await run(() =>
      updateSection({
        wikiId: ctx.wikiId,
        sectionId: existing.id,
        ...(trimmed !== existing.heading ? { heading: trimmed } : {}),
        ...(instructionChanged ? { instruction: instruction.trim() } : {}),
        ...(safety !== !!existing.safety ? { safety } : {}),
        ...(effectiveFold !== existing.fold ? { fold: effectiveFold } : {}),
        personId: ctx.personId,
      }),
    )
    if (ok === undefined) return
    onClose()
    const hasGenerated = sectionRows(ctx, existing.id).some(({ row, removed }) => !removed && row.origin === "generated")
    if (instructionChanged && hasGenerated)
      toast("Instruction saved", {
        description: "The blocks still follow the old instruction until you regenerate.",
        action: { label: "Regenerate this section", onClick: () => void regenerateSection(existing.id) },
        duration: 12000,
      })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{panel.kind === "addSection" ? "Add a section" : `Edit section`}</DialogTitle>
            <DialogDescription>
              {panel.kind === "addSection"
                ? panel.afterSectionId
                  ? `After "${headingOf(ctx, panel.afterSectionId)}". Next you choose how its first block is generated.`
                  : "At the top of the Wiki. Next you choose how its first block is generated."
                : "Changes are unapplied until you apply them."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="section-heading">Heading</Label>
            <Input
              id="section-heading"
              value={heading}
              maxLength={MAX_HEADING}
              onChange={(e) => setHeading(e.target.value)}
              placeholder="Who decides what in week 1"
              autoFocus
              required
            />
          </div>
          {!isIntro && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="section-instruction">Instruction for the AI (optional)</Label>
                <Textarea
                  id="section-instruction"
                  value={instruction}
                  maxLength={MAX_INSTRUCTION}
                  rows={2}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="For a plant manager: who decides what in week 1"
                />
                <p className="text-right text-[11px] text-muted-foreground">
                  {instruction.length} / {MAX_INSTRUCTION}
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
                <Label htmlFor="section-safety" className="space-y-0.5">
                  <span className="block text-sm">Safety section</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    Shown with a shield and an amber border. Cannot be closed by default.
                  </span>
                </Label>
                <Switch id="section-safety" checked={safety} onCheckedChange={setSafety} />
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">For readers</legend>
                <RadioGroup
                  value={effectiveFold}
                  onValueChange={(v) => setFold(v as "open" | "closed")}
                  className="flex gap-4"
                >
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="open" /> Open by default
                  </label>
                  <label className={`flex items-center gap-2 text-sm ${safety ? "opacity-50" : ""}`}>
                    <RadioGroupItem value="closed" disabled={safety} /> Closed by default
                  </label>
                </RadioGroup>
              </fieldset>
            </>
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
            <Button type="submit" disabled={!trimmed || pending}>
              {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {panel.kind === "addSection" ? "Add section" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Remove a section or a block. A safety section needs a reason, which is logged (spec 3.2, 5.2). */
export function RemoveDialog({
  ctx,
  panel,
  onClose,
}: {
  ctx: EditCtx
  panel: Extract<Panel, { kind: "removeSection" | "removeBlock" }>
  onClose: () => void
}) {
  const removeSection = useMutation(api.wikiBlocks.removeSection)
  const removeBlock = useMutation(api.wikiBlocks.removeBlock)
  const { run, pending, error } = useRun({ inline: true })
  const [reason, setReason] = useState("")
  const section = panel.kind === "removeSection" ? ctx.sections.find((s) => s.id === panel.sectionId) : null
  const reasonRequired = !!section?.safety
  const title =
    panel.kind === "removeSection" ? `Remove the section "${section?.heading ?? "this section"}"?` : "Remove this block?"

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (reasonRequired && !reason.trim()) return
    const r = reason.trim() || undefined
    const ok = await run(() =>
      panel.kind === "removeSection"
        ? removeSection({ wikiId: ctx.wikiId, sectionId: panel.sectionId, reason: r, personId: ctx.personId })
        : removeBlock({ wikiId: ctx.wikiId, blockId: panel.blockId, reason: r, personId: ctx.personId }),
    )
    if (ok !== undefined) onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Readers keep seeing it until you apply. The removal is logged with your name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="remove-reason">
              {reasonRequired ? "Why remove this safety section? (required)" : "Reason (optional)"}
            </Label>
            <Textarea
              id="remove-reason"
              rows={2}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required={reasonRequired}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Keep it
            </Button>
            <Button type="submit" variant="destructive" disabled={pending || (reasonRequired && !reason.trim())}>
              {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
