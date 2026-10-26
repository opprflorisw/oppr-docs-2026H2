import { useEffect, useRef, useState } from "react"
import { useAction, useMutation } from "convex/react"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import type { BlockKind, CalloutTone, Length, ReadingLevel, SourceSet } from "../../../../convex/lib/wikiTypes"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { allowanceText, countWord, dangerCount, effectiveRow, errorText, headingOf, type EditCtx, type Panel } from "./editShared"

const MAX_INSTRUCTION = 200

type GenKind = Extract<BlockKind, "prose" | "bullets" | "steps" | "table" | "callout" | "keyPoints" | "intro">
const KIND_OPTIONS: { value: GenKind; label: string }[] = [
  { value: "bullets", label: "List" },
  { value: "prose", label: "Paragraph" },
  { value: "steps", label: "Steps" },
  { value: "table", label: "Table" },
  { value: "callout", label: "Callout" },
  { value: "keyPoints", label: "Key points" },
]

/** Floor when the purpose line speaks of operators or shifts, else Office (spec 3.3). */
function defaultLevel(purpose: string): ReadingLevel {
  return /operator|shift|ploeg|operat/i.test(purpose) ? "floor" : "office"
}

/**
 * Generate a block from sources (spec 3.3): what it should cover, kind,
 * reading level, length and sources. Nothing runs before Generate is pressed.
 * Regenerate uses the same panel for an existing block.
 */
export function GeneratePanel({
  ctx,
  panel,
  onClose,
}: {
  ctx: EditCtx
  panel: Extract<Panel, { kind: "generate" }>
  onClose: () => void
}) {
  const existing = panel.blockId ? effectiveRow(ctx.rows.get(panel.blockId)) : null
  const section = ctx.sections.find((s) => s.id === panel.sectionId) ?? null
  const [instruction, setInstruction] = useState(
    existing?.instruction ?? (panel.blockId ? "" : (section?.instruction ?? section?.heading ?? "")),
  )
  const [kind, setKind] = useState<GenKind>(
    ((existing?.kind ?? panel.preset?.kind ?? "bullets") as GenKind) || "bullets",
  )
  const [tone, setTone] = useState<CalloutTone>(existing?.tone ?? panel.preset?.tone ?? "warning")
  const [level, setLevel] = useState<ReadingLevel>(
    existing?.readingLevel ?? ctx.state.settings.readingLevel ?? defaultLevel(ctx.wiki.purpose ?? ""),
  )
  const [length, setLength] = useState<Length>(existing?.length ?? ctx.state.settings.length ?? "normal")
  const initialDocs = existing && existing.sourceSet !== "scope" ? existing.sourceSet.documentIds : []
  const [useScope, setUseScope] = useState(!existing || existing.sourceSet === "scope")
  const [docs, setDocs] = useState<Id<"documents">[]>(initialDocs)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const openRef = useRef(true)
  useEffect(() => {
    openRef.current = true
    return () => {
      openRef.current = false
    }
  }, [])

  const addBlock = useMutation(api.wikiBlocks.addBlock)
  const updateBlock = useMutation(api.wikiBlocks.updateBlock)
  const removeBlock = useMutation(api.wikiBlocks.removeBlock)
  const generateBlock = useAction(api.ai.wikiBlock.generateBlock)

  const allowance = ctx.state.allowance
  const outOfAllowance = allowance.off || allowance.wiki <= 0 || (allowance.person?.wikiBlock ?? 1) <= 0
  const max = ctx.state.settings.maxDanger
  const dangers = dangerCount(ctx, panel.blockId)
  const overDanger = kind === "callout" && tone === "danger" && dangers >= max
  const sourceSet: SourceSet = useScope || docs.length === 0 ? "scope" : { documentIds: docs }
  const trimmed = instruction.trim()
  const fixedKind = existing?.kind === "intro" || existing?.kind === "keyPoints"
  const canGenerate = !!trimmed && !running && !overDanger && !outOfAllowance && (useScope || docs.length > 0)

  function close() {
    openRef.current = false
    onClose()
  }

  async function generate() {
    setError(null)
    setRunning(true)
    let blockId = panel.blockId ?? null
    let created = false
    try {
      if (blockId) {
        await updateBlock({
          wikiId: ctx.wikiId,
          blockId,
          instruction: trimmed,
          sourceSet,
          readingLevel: level,
          length,
          ...(kind === "callout" ? { tone } : {}),
          personId: ctx.personId,
        })
      } else {
        blockId = await addBlock({
          wikiId: ctx.wikiId,
          sectionId: panel.sectionId,
          afterBlockId: panel.afterBlockId,
          kind,
          origin: "generated",
          instruction: trimmed,
          ...(kind === "callout" ? { tone } : {}),
          sourceSet,
          readingLevel: level,
          length,
          personId: ctx.personId,
        })
        created = true
      }
      const res = await generateBlock({ wikiId: ctx.wikiId, blockId, personId: ctx.personId })
      if (!res.ok) throw new Error(res.message ?? "The block was not generated.")
      if (res.message && blockId) {
        // Nothing in the chosen sources covers it: go straight on to Find
        // sources for this block instead of leaving an empty block behind.
        toast.warning("Nothing in these sources covers it yet. Pick a document in Find sources, then regenerate.")
        if (openRef.current) {
          openRef.current = false
          ctx.open({ kind: "find", sectionId: panel.sectionId, blockId, query: trimmed })
        }
        return
      }
      if (openRef.current) close()
      toast.success(
        panel.blockId
          ? "Regenerated. The new text is an unapplied change until you apply."
          : "Block generated. It is an unapplied change until you apply.",
      )
    } catch (err) {
      const msg = errorText(err)
      // A new block that never got content would only block Apply: take it out again.
      if (created && blockId) {
        try {
          await removeBlock({ wikiId: ctx.wikiId, blockId, personId: ctx.personId })
        } catch {
          // The server message above is the one that matters.
        }
      }
      if (openRef.current) setError(msg)
      else toast.error(msg)
    } finally {
      setRunning(false)
    }
  }

  const scopeDocs = ctx.wiki.sources
  return (
    <Sheet open onOpenChange={(o) => !o && close()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="space-y-1">
          <SheetTitle>{panel.blockId ? "Regenerate this block" : "Generate a block"}</SheetTitle>
          <SheetDescription>
            In "{headingOf(ctx, panel.sectionId)}". The AI writes only what Published passages say; every fact is
            checked by code against its passage.
          </SheetDescription>
        </SheetHeader>

        <form
          className="mt-5 flex-1 space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (canGenerate) void generate()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="gen-instruction">What should this block cover?</Label>
            <Input
              id="gen-instruction"
              value={instruction}
              maxLength={MAX_INSTRUCTION}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Who decides what in week 1"
              required
              autoFocus
            />
            <p className="text-right text-[11px] text-muted-foreground">
              {instruction.length} / {MAX_INSTRUCTION}
            </p>
          </div>

          {!fixedKind && (
            <div className="space-y-1.5">
              <Label htmlFor="gen-kind">Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as GenKind)} disabled={!!panel.blockId}>
                <SelectTrigger id="gen-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === "callout" && (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Tone</legend>
              <RadioGroup value={tone} onValueChange={(v) => setTone(v as CalloutTone)} className="flex gap-4">
                {(["danger", "warning", "tip"] as const).map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={t} /> {t === "danger" ? "Danger" : t === "warning" ? "Warning" : "Tip"}
                  </label>
                ))}
              </RadioGroup>
              {overDanger && (
                <div role="alert" className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
                  <p>
                    {countWord(dangers)} danger callouts already; make this a warning callout, or raise the limit (reason
                    required)?
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setTone("warning")}>
                      Make it a warning
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => ctx.open({ kind: "settings" })}
                    >
                      Raise the limit
                    </Button>
                  </div>
                </div>
              )}
            </fieldset>
          )}

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Reading level</legend>
            <RadioGroup value={level} onValueChange={(v) => setLevel(v as ReadingLevel)} className="space-y-1.5">
              <label className="flex items-start gap-2 text-sm">
                <RadioGroupItem value="floor" className="mt-0.5" />
                <span>
                  Floor
                  <span className="block text-xs text-muted-foreground">Short sentences, everyday words, one fact per sentence</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <RadioGroupItem value="office" className="mt-0.5" />
                <span>
                  Office
                  <span className="block text-xs text-muted-foreground">Full terms, can explain why</span>
                </span>
              </label>
            </RadioGroup>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Length</legend>
            <RadioGroup value={length} onValueChange={(v) => setLength(v as Length)} className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="oneScreen" /> One screen
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="normal" /> Normal
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="full" /> Full
              </label>
            </RadioGroup>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Sources</legend>
            <RadioGroup
              value={useScope ? "scope" : "docs"}
              onValueChange={(v) => setUseScope(v === "scope")}
              className="space-y-1.5"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="scope" /> This Wiki's sources
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="docs" disabled={scopeDocs.length === 0} /> These documents
              </label>
            </RadioGroup>
            {!useScope && (
              <div className="flex flex-wrap gap-1.5 pt-1" role="group" aria-label="Documents for this block">
                {scopeDocs.map((d) => {
                  const on = docs.includes(d.documentId)
                  return (
                    <button
                      key={d.documentId}
                      type="button"
                      aria-pressed={on}
                      title={d.title}
                      onClick={() => setDocs(on ? docs.filter((x) => x !== d.documentId) : [...docs, d.documentId])}
                      className={cn(
                        "rounded-full border px-2.5 py-1 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        on ? "border-primary bg-primary/10" : "text-muted-foreground hover:border-primary/50",
                      )}
                    >
                      {d.namingCode}
                    </button>
                  )
                })}
                {docs.length === 0 && <p className="w-full text-xs text-muted-foreground">Pick at least one document.</p>}
              </div>
            )}
            {existing && existing.pinnedChunkIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Plus {existing.pinnedChunkIds.length} pinned {existing.pinnedChunkIds.length === 1 ? "passage" : "passages"},
                always read.
              </p>
            )}
          </fieldset>

          {error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {outOfAllowance && !error && (
            <p role="status" className="text-sm text-muted-foreground">
              {allowanceText(allowance)}
            </p>
          )}

          <SheetFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button type="submit" disabled={!canGenerate} className="w-full">
              {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
              {panel.blockId ? "Regenerate" : "Generate"}
            </Button>
            {running ? (
              <p className="text-center text-xs text-muted-foreground" role="status">
                Generating. You can close this panel; the block keeps generating.
              </p>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                Uses 1 of your {allowance.person?.wikiBlock ?? 0} generations left this hour.
              </p>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
