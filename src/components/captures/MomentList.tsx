import { Factory } from "lucide-react"
import type { Doc } from "../../../convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { MOMENT_META, MOMENT_ORDER, type MomentKind } from "./captureUi"

export type MomentView = Doc<"captureMoments"> & {
  assetCode?: string | null
  asset?: { code: string; name: string } | null
}

/**
 * The Moments the AI found in a Capture, grouped by kind (steps first, in
 * order). Each Moment links to its evidence: the Entries it came from.
 */
export function MomentList({
  moments,
  entryIndex,
  onEvidence,
  variant,
  activeMomentId,
}: {
  moments: MomentView[]
  /** Entry id to its 1-based position in the timeline. */
  entryIndex: Map<string, number>
  onEvidence?: (m: MomentView) => void
  variant: "phone" | "desk"
  activeMomentId?: string | null
}) {
  const groups = MOMENT_ORDER.map((kind) => ({
    kind,
    items: moments.filter((m) => m.kind === kind).sort((a, b) => a.order - b.order),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <MomentGroup
          key={g.kind}
          kind={g.kind}
          items={g.items}
          entryIndex={entryIndex}
          onEvidence={onEvidence}
          variant={variant}
          activeMomentId={activeMomentId}
        />
      ))}
    </div>
  )
}

function MomentGroup({
  kind,
  items,
  entryIndex,
  onEvidence,
  variant,
  activeMomentId,
}: {
  kind: MomentKind
  items: MomentView[]
  entryIndex: Map<string, number>
  onEvidence?: (m: MomentView) => void
  variant: "phone" | "desk"
  activeMomentId?: string | null
}) {
  const meta = MOMENT_META[kind]
  const Icon = meta.icon
  const desk = variant === "desk"
  return (
    <section>
      <h3 className={cn("mb-2 flex items-center gap-1.5 font-semibold", desk ? "text-sm" : "text-base")}>
        <Icon className="h-4 w-4 text-muted-foreground" />
        {meta.plural}
        <span className="font-normal text-muted-foreground">{items.length}</span>
      </h3>
      <ol className="space-y-2">
        {items.map((m, i) => {
          const asset = m.asset ?? (m.assetCode ? { code: m.assetCode, name: "" } : null)
          const evidence = m.entryIds.map((id) => entryIndex.get(id)).filter((n): n is number => n !== undefined)
          return (
            <li
              key={m._id}
              className={cn(
                "rounded-xl border bg-card p-3 transition-colors",
                activeMomentId === m._id && "border-[#9b87f5] ring-2 ring-[#9b87f5]/30",
              )}
            >
              <div className="flex items-start gap-2.5">
                {kind === "step" ? (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
                    {i + 1}
                  </span>
                ) : (
                  <span className={cn("mt-0.5 inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-xs font-medium", meta.tone)}>
                    {meta.label}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn("font-medium leading-snug", desk ? "text-sm" : "text-[15px]")}>{m.title}</p>
                  {m.detail && <p className={cn("mt-0.5 text-muted-foreground", desk ? "text-sm" : "text-[15px] leading-snug")}>{m.detail}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {asset && (
                      <span className="inline-flex items-center gap-1 rounded-full border bg-background px-1.5 py-0.5 font-mono text-xs text-muted-foreground" title={asset.name}>
                        <Factory className="h-3 w-3" />
                        {asset.code}
                      </span>
                    )}
                    {evidence.length > 0 &&
                      (onEvidence ? (
                        <button
                          type="button"
                          onClick={() => onEvidence(m)}
                          className="inline-flex min-h-7 items-center rounded-full border border-[#9b87f5]/50 bg-[#9b87f5]/10 px-2 text-xs font-medium text-[#6E59A5] hover:bg-[#9b87f5]/20"
                        >
                          Evidence: Entry {evidence.join(", ")}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Evidence: Entry {evidence.join(", ")}</span>
                      ))}
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
