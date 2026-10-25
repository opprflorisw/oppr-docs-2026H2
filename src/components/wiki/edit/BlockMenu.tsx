import { useMutation } from "convex/react"
import { ArrowDown, ArrowUp, Loader2, MoreHorizontal, PenLine, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { BlockOrigin, BlockStatus } from "../../../../convex/lib/wikiTypes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRun, type EditCtx } from "./editShared"

/** Regenerate, Find sources, Edit text, Confirm, Move, Remove (spec 6.5 BlockChrome). */
export function BlockMenu({
  ctx,
  blockId,
  sectionId,
  origin,
  status,
  removed,
}: {
  ctx: EditCtx
  blockId: string
  sectionId: string
  origin: BlockOrigin
  status: BlockStatus
  removed: boolean
}) {
  const moveBlock = useMutation(api.wikiBlocks.moveBlock)
  const { run, pending } = useRun()
  const move = (direction: "up" | "down") =>
    void run(() => moveBlock({ wikiId: ctx.wikiId, blockId, direction, personId: ctx.personId }))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Block actions" disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {status === "awaitingConfirm" && (
          <DropdownMenuItem onClick={() => ctx.open({ kind: "confirm", blockId })}>
            <ShieldCheck className="mr-2 h-3.5 w-3.5" /> Confirm or send back
          </DropdownMenuItem>
        )}
        {origin === "generated" ? (
          <DropdownMenuItem
            disabled={removed || status === "generating"}
            onClick={() => ctx.open({ kind: "generate", sectionId, afterBlockId: null, blockId })}
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Regenerate
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled={removed} onClick={() => ctx.setWriting(blockId)}>
            <PenLine className="mr-2 h-3.5 w-3.5" /> Edit text and check
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={removed} onClick={() => ctx.open({ kind: "find", sectionId, blockId })}>
          <Search className="mr-2 h-3.5 w-3.5" /> Find sources
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={removed} onClick={() => move("up")}>
          <ArrowUp className="mr-2 h-3.5 w-3.5" /> Move up
        </DropdownMenuItem>
        <DropdownMenuItem disabled={removed} onClick={() => move("down")}>
          <ArrowDown className="mr-2 h-3.5 w-3.5" /> Move down
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={removed}
          className="text-destructive"
          onClick={() => ctx.open({ kind: "removeBlock", blockId })}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
