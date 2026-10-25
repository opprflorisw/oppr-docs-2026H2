import { cn } from "@/lib/utils"
import { WikiText, pointDomId, type WikiBlockView } from "../wikiShared"
import { DisputedLine, Marker, PhoneSources, PointBadges, useBlockCtx } from "./context"

/**
 * A table with a sticky header (spec 2.2). On the phone it scrolls sideways
 * with the first column frozen, and each row has its own "Sources (n)".
 */
export function TableBlock({ block }: { block: WikiBlockView }) {
  const { surface } = useBlockCtx()
  const phone = surface === "phone"
  const columns = block.columns ?? []
  if (columns.length === 0) return null
  const last = columns.length - 1
  return (
    <div className={cn("overflow-auto rounded-lg border", !phone && "max-h-[70vh]")}>
      <table className={cn("w-full border-collapse", phone ? "text-[15px]" : "text-sm")}>
        <thead className="sticky top-0 z-[1] bg-muted text-left">
          <tr>
            {columns.map((c, j) => (
              <th
                key={c}
                scope="col"
                className={cn("px-3 py-2 font-semibold", phone && j === 0 && "sticky left-0 z-[2] bg-muted", phone && "whitespace-nowrap")}
              >
                {c}
              </th>
            ))}
            {phone && (
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Sources</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {block.points.map((p, i) => (
            <tr key={i} id={pointDomId(block.id, i)} data-point={p.pointKey} className="border-t align-top">
              {columns.map((_, j) => (
                <td
                  key={j}
                  className={cn(
                    "px-3 py-2 leading-6",
                    j === 0 && "font-medium",
                    phone && j === 0 && "sticky left-0 z-[1] min-w-[8rem] max-w-[11rem] bg-background",
                    phone && j > 0 && "min-w-[7rem]",
                  )}
                >
                  <WikiText text={p.cells?.[j] ?? ""} mobile={phone} />
                  {j === 0 && <PointBadges point={p} />}
                  {j === last && <Marker blockId={block.id} index={i} />}
                  {j === 0 && <DisputedLine point={p} />}
                </td>
              ))}
              {phone && (
                <td className="whitespace-nowrap px-3 py-1">
                  <PhoneSources citations={p.citations} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
