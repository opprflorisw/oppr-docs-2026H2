import type { BlockStatus, ComposedBlock } from "../../../../convex/lib/wikiTypes"
import { BlockCard } from "./BlockCard"
import { BlockMenu } from "./BlockMenu"
import { WriteAndCheck } from "./WriteAndCheck"
import { KIND_LABEL, Pill, StatusPill, originText, type EditCtx } from "./editShared"

/**
 * The edit chrome the reader draws above a composed block (spec 6.5): kind,
 * origin and status mark, and the block menu. An unapplied new version of
 * the block shows right under it.
 */
export function BlockChrome({ ctx, block, sectionId }: { ctx: EditCtx; block: ComposedBlock; sectionId: string }) {
  const rows = ctx.rows.get(block.id)
  const live = rows?.live ?? null
  const status: BlockStatus = live?.status ?? (block.kind === "gap" ? "gap" : block.origin === "generated" ? "grounded" : "checked")
  const writing = ctx.writingBlockId === block.id
  return (
    <div className="space-y-2" data-print="hide">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border-l-2 border-primary/40 bg-muted/40 py-1 pl-2 pr-1 text-xs">
        <span className="font-medium">{KIND_LABEL[block.kind]}</span>
        <span className="text-muted-foreground">{originText(block)}</span>
        <StatusPill status={status} />
        {rows?.staged && <Pill tone="blue">New version below, unapplied</Pill>}
        {rows?.removed && <Pill tone="red">Removed on Apply</Pill>}
        <span className="ml-auto" />
        <BlockMenu
          ctx={ctx}
          blockId={block.id}
          sectionId={sectionId}
          origin={block.origin}
          status={status}
          removed={!!rows?.removed}
        />
      </div>
      {rows?.staged && <BlockCard ctx={ctx} row={rows.staged} removed={false} />}
      {writing && !rows?.staged && live && <WriteAndCheck ctx={ctx} row={live} />}
    </div>
  )
}
