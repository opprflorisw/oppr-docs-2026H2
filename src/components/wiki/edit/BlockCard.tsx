import { useMutation } from "convex/react"
import { Loader2, RefreshCw, Search, ShieldCheck } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { BlockStatus, EditorBlock } from "../../../../convex/lib/wikiTypes"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { BlockMenu } from "./BlockMenu"
import { WriteAndCheck } from "./WriteAndCheck"
import {
  KIND_LABEL,
  Pill,
  STATUS_OUTLINE,
  StatusPill,
  originText,
  plural,
  pointLines,
  useRun,
  type EditCtx,
} from "./editShared"

const NEEDS_TEXT_BOX: BlockStatus[] = ["unchecked", "contradicts", "notCovered", "needsRecheck"]
const MAX_PREVIEW = 8

/**
 * A block readers do not see right now: an unapplied new block or new
 * version, or a live block hidden by its status. Shows its points, its
 * state, and the one next step for it.
 */
export function BlockCard({ ctx, row, removed }: { ctx: EditCtx; row: EditorBlock; removed: boolean }) {
  const removeBlock = useMutation(api.wikiBlocks.removeBlock)
  const { run, pending } = useRun()
  const rows = ctx.rows.get(row.blockId)
  const isNew = row.state === "staged" && !rows?.live
  const written = row.origin !== "generated"
  const mine = row.authorPersonId === ctx.personId
  const showTextBox = written && !removed && (ctx.writingBlockId === row.blockId || NEEDS_TEXT_BOX.includes(row.status))
  const lines = pointLines(row)

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border bg-background p-3 text-sm",
        STATUS_OUTLINE[row.status],
        removed && "opacity-60",
      )}
      data-print="hide"
      data-block-id={row.blockId}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-medium">{KIND_LABEL[row.kind]}</span>
        <span className="text-muted-foreground">
          {originText({
            origin: row.origin,
            points: row.points,
            authorName: row.authorName,
            checkedAt: row.status === "checked" || row.status === "awaitingConfirm" ? row.checkedAt : null,
            confirmedByName: row.confirmedByName,
          })}
        </span>
        <StatusPill status={row.status} />
        {removed ? (
          <Pill tone="red">Removed on Apply</Pill>
        ) : row.state === "staged" ? (
          <Pill tone="blue">{isNew ? "New, unapplied" : "New version, unapplied"}</Pill>
        ) : (
          <Pill tone="grey">Hidden from readers</Pill>
        )}
        <span className="ml-auto" />
        <BlockMenu
          ctx={ctx}
          blockId={row.blockId}
          sectionId={row.sectionId}
          origin={row.origin}
          status={row.status}
          removed={removed}
        />
      </div>

      {row.instruction && <p className="text-xs text-muted-foreground">Covers: {row.instruction}</p>}

      {row.status === "generating" && (
        <p className="flex items-center gap-2 text-muted-foreground" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Generating from Published passages.
        </p>
      )}

      {row.status === "failed" && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-destructive">
            The AI job failed{row.error ? `: ${row.error}` : ""}. The previous content stays.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={() => ctx.open({ kind: "generate", sectionId: row.sectionId, afterBlockId: null, blockId: row.blockId })}
          >
            <RefreshCw className="h-3 w-3" aria-hidden /> Regenerate
          </Button>
        </div>
      )}

      {row.status === "gap" && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground">No Published document covers this yet.</p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={() => ctx.open({ kind: "find", sectionId: row.sectionId, blockId: row.blockId })}
          >
            <Search className="h-3 w-3" aria-hidden /> Find sources
          </Button>
        </div>
      )}

      {row.status === "needsRecheck" && <p className="text-amber-800 dark:text-amber-200">A source changed; check again.</p>}

      {row.status === "awaitingConfirm" && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sky-800 dark:text-sky-200">
            {mine
              ? "Verified. Another Engineer must confirm it before readers see it."
              : "Verified. It needs your confirm, as a second Engineer, before readers see it."}
          </p>
          {!mine && (
            <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => ctx.open({ kind: "confirm", blockId: row.blockId })}>
              <ShieldCheck className="h-3 w-3" aria-hidden /> Review and confirm
            </Button>
          )}
        </div>
      )}

      {row.sentBackNote && row.status === "unchecked" && (
        <p className="rounded-md bg-muted px-2 py-1 text-xs">Sent back: {row.sentBackNote}</p>
      )}

      {lines.length > 0 && !showTextBox && (
        <ul className="list-disc space-y-1 pl-5">
          {lines.slice(0, MAX_PREVIEW).map((t, i) => (
            <li key={i}>
              {t}
              <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                {[...new Set(row.points[i].citations.map((c) => `${c.namingCode} v${c.version}`))].join(", ")}
              </span>
            </li>
          ))}
          {lines.length > MAX_PREVIEW && (
            <li className="list-none text-xs text-muted-foreground">and {lines.length - MAX_PREVIEW} more</li>
          )}
        </ul>
      )}

      {row.droppedPoints > 0 && row.origin === "generated" && (
        <p className="text-xs text-muted-foreground">Left out ({row.droppedPoints}): not supported by its passage.</p>
      )}

      {showTextBox && <WriteAndCheck ctx={ctx} row={row} />}

      {isNew && !removed && row.status !== "generating" && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={pending}
            onClick={() =>
              void run(async () => {
                await removeBlock({ wikiId: ctx.wikiId, blockId: row.blockId, personId: ctx.personId })
                if (ctx.writingBlockId === row.blockId) ctx.setWriting(null)
              })
            }
          >
            Discard this block
          </Button>
        </div>
      )}
      {removed && <p className="text-xs text-muted-foreground">{plural(row.points.length, "fact")} leave the Wiki when you apply.</p>}
    </div>
  )
}
