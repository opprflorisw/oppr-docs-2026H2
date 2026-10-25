import { cn } from "@/lib/utils"
import { pointDomId, unionCitations, type WikiBlockView } from "../wikiShared"
import { PhoneSources, PointBody, textClass, useBlockCtx } from "./context"

/** Sentences as one paragraph, with grouped source markers (spec 2.2 prose, 4.5). */
export function Paragraph({ block, className }: { block: WikiBlockView; className?: string }) {
  const { surface } = useBlockCtx()
  return (
    <div>
      <p className={cn(textClass(surface), className)}>
        {block.points.map((p, i) => (
          <span key={i} id={pointDomId(block.id, i)} data-point={p.pointKey}>
            {i > 0 && " "}
            <PointBody point={p} blockId={block.id} index={i} />
          </span>
        ))}
      </p>
      <PhoneSources citations={unionCitations(block.points)} />
    </div>
  )
}

export function ProseBlock({ block }: { block: WikiBlockView }) {
  return <Paragraph block={block} />
}
