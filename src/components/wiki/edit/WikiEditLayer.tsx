import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useQuery } from "convex/react"
import { Pencil, ShieldCheck } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import type { ComposedBlock, OutlineSection } from "../../../../convex/lib/wikiTypes"
import { Button } from "@/components/ui/button"
import type { WikiView } from "../wikiShared"
import { BlockChrome } from "./BlockChrome"
import { BlockCard } from "./BlockCard"
import { ConfirmPanel } from "./ConfirmPanel"
import { EditBar } from "./EditBar"
import { FindSourcesPanel } from "./FindSourcesPanel"
import { GeneratePanel } from "./GeneratePanel"
import { InsertMenu } from "./InsertMenu"
import { ApplyDialog, DiscardDialog } from "./ApplyDialog"
import { OutlinePanel } from "./OutlinePanel"
import { RemoveDialog, SectionDialog } from "./SectionControls"
import { RestoreDialog } from "./RestoreDialog"
import { SettingsDialog } from "./SettingsDialog"
import { offPageRows, plural, rowsFor, type EditCtx, type Panel } from "./editShared"

// The Wiki edit layer (docs/specs/wiki-upgrade.md 3.1 to 3.5, 6.5, Lane E).
// Mounted by the Wiki page for a checked-in Engineer or Admin. It draws the
// edit bar and Outline at the top of the article, and hands the reader two
// renderers: block chrome above each composed block and an insert point in
// each section. Everything goes to unapplied changes until Apply.

/** What the edit layer draws inside the reader. Both return null outside edit mode. */
export interface WikiEditRenderers {
  /** Origin and status mark plus the block menu, drawn above a block. */
  renderBlockChrome: (block: ComposedBlock, sectionId: string) => ReactNode
  /** The "+ Block" / "+ Section" insert point after a block (null: at the top of the section). */
  renderInsert: (sectionId: string, afterBlockId: string | null) => ReactNode
}

export const NO_EDIT_RENDERERS: WikiEditRenderers = {
  renderBlockChrome: () => null,
  renderInsert: () => null,
}

export interface WikiEditLayerProps {
  wiki: WikiView
  /** The checked-in Engineer or Admin. */
  personId: Id<"people">
  /** Edit mode on or off, so the page can adjust (e.g. hide reader-only controls). */
  onEditingChange: (editing: boolean) => void
  /** Receives the renderers the page passes into WikiReader. */
  renderers: (r: WikiEditRenderers) => void
}

function sectionsOfContent(wiki: WikiView): OutlineSection[] {
  return (wiki.contentV2?.sections ?? []).map((s) => ({
    id: s.id,
    heading: s.heading,
    ...(s.role ? { role: s.role } : {}),
    ...(s.safety ? { safety: true } : {}),
    fold: s.fold,
  }))
}

export function WikiEditLayer({ wiki, personId, onEditingChange, renderers }: WikiEditLayerProps): ReactNode {
  const [editing, setEditing] = useState(false)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [writingBlockId, setWriting] = useState<string | null>(null)
  const state = useQuery(api.wikiBlocks.editorState, { wikiId: wiki._id, personId })

  const ctx = useMemo<EditCtx | null>(() => {
    if (!state) return null
    const derived = sectionsOfContent(wiki)
    const liveSections = state.outline?.sections ?? derived
    const composed = wiki.contentV2?.sections ?? []
    return {
      wiki,
      wikiId: wiki._id,
      personId,
      state,
      rows: rowsFor(state),
      sections: state.outlineStaged?.sections ?? liveSections,
      liveSections,
      composedSectionIds: new Set(composed.map((s) => s.id)),
      composedBlockIds: new Set(composed.flatMap((s) => s.blocks.map((b) => b.id))),
      jobRunning: wiki.status === "generating" || state.blocks.some((b) => b.status === "generating"),
      open: setPanel,
      writingBlockId,
      setWriting,
    }
  }, [state, wiki, personId, writingBlockId])

  useEffect(() => {
    onEditingChange(editing)
  }, [editing, onEditingChange])

  useEffect(() => {
    if (!editing || !ctx) {
      renderers(NO_EDIT_RENDERERS)
      return
    }
    renderers({
      renderBlockChrome: (block, sectionId) => <BlockChrome ctx={ctx} block={block} sectionId={sectionId} />,
      renderInsert: (sectionId, afterBlockId) => <SectionInsert ctx={ctx} sectionId={sectionId} afterBlockId={afterBlockId} />,
    })
  }, [editing, ctx, renderers])

  useEffect(
    () => () => {
      renderers(NO_EDIT_RENDERERS)
      onEditingChange(false)
    },
    [renderers, onEditingChange],
  )

  if (!state || !ctx) return null

  const waiting = state.blocks.filter(
    (b) =>
      b.status === "awaitingConfirm" &&
      b.state !== "removedStaged" &&
      b.authorPersonId !== personId &&
      b.check?.personId !== personId,
  )

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground" data-print="hide">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(true)} data-tour="wiki-edit-button">
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          Edit this Wiki
        </Button>
        {state.stagedCount > 0 && <span>{plural(state.stagedCount, "unapplied change")}</span>}
        {waiting.length > 0 && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded font-medium text-sky-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-sky-300"
            onClick={() => {
              setEditing(true)
              setPanel({ kind: "confirm", blockId: waiting[0].blockId })
            }}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            {waiting.length === 1 ? "1 block waits for a second Engineer" : `${waiting.length} blocks wait for a second Engineer`}
          </button>
        )}
      </div>
    )
  }

  const close = () => setPanel(null)
  return (
    // display: contents, so the sticky edit bar is held by the article, not by this wrapper.
    <div className="contents" data-print="hide">
      <EditBar ctx={ctx} onDone={() => setEditing(false)} />
      <OutlinePanel ctx={ctx} />

      {panel?.kind === "generate" && <GeneratePanel ctx={ctx} panel={panel} onClose={close} />}
      {panel?.kind === "find" && <FindSourcesPanel ctx={ctx} panel={panel} onClose={close} />}
      {panel?.kind === "confirm" && <ConfirmPanel ctx={ctx} blockId={panel.blockId} onClose={close} />}
      {(panel?.kind === "addSection" || panel?.kind === "editSection") && (
        <SectionDialog ctx={ctx} panel={panel} onClose={close} />
      )}
      {(panel?.kind === "removeSection" || panel?.kind === "removeBlock") && (
        <RemoveDialog ctx={ctx} panel={panel} onClose={close} />
      )}
      {panel?.kind === "apply" && <ApplyDialog ctx={ctx} onClose={close} />}
      {panel?.kind === "discard" && <DiscardDialog ctx={ctx} onClose={close} />}
      {panel?.kind === "restore" && <RestoreDialog ctx={ctx} onClose={close} />}
      {panel?.kind === "settings" && <SettingsDialog ctx={ctx} onClose={close} />}
    </div>
  )
}

/**
 * The insert point the reader draws in a section. After the section's last
 * composed block it also shows the blocks readers do not see yet (new,
 * unapplied, or hidden by status), so they appear where they will land.
 */
function SectionInsert({ ctx, sectionId, afterBlockId }: { ctx: EditCtx; sectionId: string; afterBlockId: string | null }) {
  const composed = ctx.wiki.contentV2?.sections.find((s) => s.id === sectionId)?.blocks ?? []
  const last = composed.length ? composed[composed.length - 1].id : null
  const atEnd = afterBlockId === last
  const extra = atEnd ? offPageRows(ctx, sectionId) : []
  const removedSection = !ctx.sections.some((s) => s.id === sectionId)
  return (
    <div className="space-y-2" data-print="hide">
      {extra.map(({ row, removed }) => (
        <BlockCard key={row._id} ctx={ctx} row={row} removed={removed} />
      ))}
      {!removedSection && (
        <InsertMenu
          ctx={ctx}
          sectionId={sectionId}
          afterBlockId={atEnd ? (extra.length ? extra[extra.length - 1].row.blockId : last) : afterBlockId}
          withSection={atEnd}
        />
      )}
    </div>
  )
}
