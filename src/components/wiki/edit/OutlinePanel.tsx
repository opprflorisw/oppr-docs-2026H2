import { useState } from "react"
import { ChevronDown, Plus, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { OutlineSection } from "../../../../convex/lib/wikiTypes"
import { BlockCard } from "./BlockCard"
import { InsertMenu } from "./InsertMenu"
import { SectionControls } from "./SectionControls"
import { Pill, STATUS, sectionRows, type EditCtx } from "./editShared"

/**
 * The Outline in edit mode (spec 2.1, 3.2): every section in the order it
 * will have after Apply, what changed against the live Wiki, and the blocks
 * of sections readers cannot see yet (new or empty ones).
 */
export function OutlinePanel({ ctx }: { ctx: EditCtx }) {
  const [open, setOpen] = useState(true)
  const liveById = new Map(ctx.liveSections.map((s, i) => [s.id, { s, i }]))
  const removed = ctx.liveSections.filter((s) => !ctx.sections.some((x) => x.id === s.id))
  return (
    <section aria-labelledby="wiki-outline-heading" className="!mt-3 rounded-lg border bg-muted/20" data-print="hide">
      <h2 id="wiki-outline-heading" className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="wiki-outline-body"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} aria-hidden />
          Outline
          <span className="font-normal text-muted-foreground">
            {ctx.sections.length} {ctx.sections.length === 1 ? "section" : "sections"}
          </span>
        </button>
      </h2>
      {open && (
        <div id="wiki-outline-body" className="space-y-1 px-3 pb-3">
          <AddSectionButton ctx={ctx} afterSectionId={null} />
          <ol className="space-y-1">
            {ctx.sections.map((s, i) => (
              <li key={s.id}>
                <SectionRow ctx={ctx} section={s} index={i} live={liveById.get(s.id) ?? null} />
                {s.role !== "intro" && <AddSectionButton ctx={ctx} afterSectionId={s.id} />}
              </li>
            ))}
          </ol>
          {removed.length > 0 && (
            <p className="pt-1 text-xs text-muted-foreground">
              Removed on Apply: {removed.map((s) => s.heading).join(", ")}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function AddSectionButton({ ctx, afterSectionId }: { ctx: EditCtx; afterSectionId: string | null }) {
  return (
    <div className="flex justify-start">
      <Button
        size="sm"
        variant="ghost"
        className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
        onClick={() => ctx.open({ kind: "addSection", afterSectionId })}
      >
        <Plus className="h-3 w-3" aria-hidden />
        Section
        <span className="sr-only">{afterSectionId ? "here" : "at the top"}</span>
      </Button>
    </div>
  )
}

function SectionRow({
  ctx,
  section,
  index,
  live,
}: {
  ctx: EditCtx
  section: OutlineSection
  index: number
  live: { s: OutlineSection; i: number } | null
}) {
  const rows = sectionRows(ctx, section.id)
  const onPage = ctx.composedSectionIds.has(section.id)
  const marks: string[] = []
  if (!live) marks.push("New")
  else {
    if (live.s.heading !== section.heading) marks.push("Renamed")
    if ((live.s.instruction ?? "") !== (section.instruction ?? "")) marks.push("Instruction changed")
    if (!!live.s.safety !== !!section.safety) marks.push(section.safety ? "Now a safety section" : "No longer a safety section")
    if (live.s.fold !== section.fold) marks.push(section.fold === "closed" ? "Closed by default" : "Open by default")
  }
  const attention = rows.filter(({ row, removed }) => !removed && STATUS[row.status].tone !== "green")
  return (
    <div className={cn("rounded-md border bg-background", !live && "border-primary/40")}>
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        {section.safety && <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" aria-label="Safety section" />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {section.role === "intro" ? "Introduction" : section.heading}
        </span>
        {marks.map((m) => (
          <Pill key={m} tone="blue">
            {m}
          </Pill>
        ))}
        {attention.length > 0 && (
          <Pill tone="grey" title={attention.map(({ row }) => STATUS[row.status].label).join(", ")}>
            {attention.length === 1 ? STATUS[attention[0].row.status].label : `${attention.length} blocks need attention`}
          </Pill>
        )}
        {!onPage && rows.length === 0 && <span className="text-xs text-muted-foreground">No blocks yet</span>}
        <SectionControls ctx={ctx} section={section} index={index} />
      </div>
      {!onPage && (
        <div className="space-y-2 border-t px-2.5 py-2">
          {rows.map(({ row, removed }) => (
            <BlockCard key={row._id} ctx={ctx} row={row} removed={removed} />
          ))}
          <InsertMenu
            ctx={ctx}
            sectionId={section.id}
            afterBlockId={rows.length ? rows[rows.length - 1].row.blockId : null}
            withSection={false}
          />
        </div>
      )}
    </div>
  )
}
