import { useMutation } from "convex/react"
import { AlertTriangle, ListChecks, ListOrdered, Loader2, PenLine, Plus, Search, Sparkles, Table2 } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { headingOf, useRun, type EditCtx } from "./editShared"

/**
 * "+ Block" between blocks, and "+ Section" after the section (spec 3.3).
 * Choosing an item opens a panel or a text box; nothing runs on the AI until
 * Generate or Check is pressed.
 */
export function InsertMenu({
  ctx,
  sectionId,
  afterBlockId,
  withSection,
}: {
  ctx: EditCtx
  sectionId: string
  afterBlockId: string | null
  withSection: boolean
}) {
  const addBlock = useMutation(api.wikiBlocks.addBlock)
  const { run, pending } = useRun()
  const heading = headingOf(ctx, sectionId)
  const generate = (kind?: "keyPoints" | "steps" | "table" | "callout") =>
    ctx.open({
      kind: "generate",
      sectionId,
      afterBlockId,
      preset: kind ? { kind, ...(kind === "callout" ? { tone: "warning" as const } : {}) } : undefined,
    })

  async function writeByHand() {
    const blockId = await run(() =>
      addBlock({
        wikiId: ctx.wikiId,
        sectionId,
        afterBlockId,
        kind: "prose",
        origin: "written",
        personId: ctx.personId,
      }),
    )
    if (blockId) ctx.setWriting(blockId)
  }

  return (
    <div className="flex flex-wrap items-center gap-1" data-print="hide">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-dashed px-2 text-xs text-muted-foreground"
            aria-label={`Add a block in ${heading}`}
            data-tour="wiki-add-block"
            disabled={pending}
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" aria-hidden />}
            Block
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={() => generate()}>
            <Sparkles className="mr-2 h-3.5 w-3.5" /> Generate from sources
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => generate("keyPoints")}>
            <ListChecks className="mr-2 h-3.5 w-3.5" /> Key points
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => generate("steps")}>
            <ListOrdered className="mr-2 h-3.5 w-3.5" /> Steps
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => generate("table")}>
            <Table2 className="mr-2 h-3.5 w-3.5" /> Table
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => generate("callout")}>
            <AlertTriangle className="mr-2 h-3.5 w-3.5" /> Callout
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void writeByHand()}>
            <PenLine className="mr-2 h-3.5 w-3.5" /> Write by hand
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => ctx.open({ kind: "find", sectionId })}>
            <Search className="mr-2 h-3.5 w-3.5" /> Find sources
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {withSection && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          aria-label={`Add a section after ${heading}`}
          onClick={() => ctx.open({ kind: "addSection", afterSectionId: sectionId })}
        >
          <Plus className="h-3 w-3" aria-hidden />
          Section
        </Button>
      )}
    </div>
  )
}
