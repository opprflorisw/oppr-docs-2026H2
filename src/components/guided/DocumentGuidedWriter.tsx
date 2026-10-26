// The guided writer for Documents (CONTEXT.md: Guided creation). The
// Engineer says what the Document should cover, the assistant asks one
// guided question at a time with quick answers and fills the Draft: purpose,
// steps, PPE, hazards and Plant terms. Each turn proposes library images for
// the new steps, PPE from the Safety icons catalogue, hazards and Plant terms;
// one click adds a proposal. "Create an image" asks a few questions and draws
// one. Insert puts the Draft into the editor; the Document is still saved and
// reviewed as usual, and the AI never publishes (docs/adr/0003).
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useAction, useQuery } from "convex/react"
import {
  ArrowDown,
  ArrowUp,
  Check,
  FileText,
  ImagePlus,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
  Wand2,
  X,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import type { ImageHit } from "../../../convex/imageSearch"
import type { ProposalSource, WriterImageRequest, WriterTurnResult } from "../../../convex/ai/guidedChat"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { ImagePickerDialog, type PickedImage } from "@/components/images/ImagePickerDialog"
import { useCheckIn } from "@/lib/checkIn"
import { matchReason } from "@/components/images/useImageSearch"
import { GuidedCreation, type GuidedEntry, type GuidedEntryInfo, type GuidedMessage } from "./GuidedCreation"
import { CreateImageDialog, type ImageAnswers } from "./CreateImageDialog"
import {
  calloutNode,
  heading,
  imageNode,
  paragraph,
  ppeNode,
  text,
  type TNode,
} from "@/components/find/editorInsert"

type HazardLevel = "danger" | "warning" | "caution"

export interface WriterStep {
  id: string
  text: string
  image: PickedImage | null
}

export interface WriterDraft {
  title: string
  purpose: string
  ppe: string[]
  hazards: { level: HazardLevel; text: string }[]
  steps: WriterStep[]
  terms: { term: string; meaning: string }[]
}

const EMPTY_WRITER_DRAFT: WriterDraft = { title: "", purpose: "", ppe: [], hazards: [], steps: [], terms: [] }

// "[value to confirm]" and "[value to confirm: 150 °C or 200 °C]": a value the
// person must decide before the Draft goes into the Document.
const OPEN_VALUE = /\[[^\]]*\bconfirm\b[^\]]*\]/i
const hasOpenValue = (s: string) => OPEN_VALUE.test(s)

/** Where in the Draft a value is still open, in words; null when none is. */
function openValueReason(d: WriterDraft): string | null {
  if (hasOpenValue(d.purpose)) return "The purpose has a value to confirm. Fill it in, then insert."
  const step = d.steps.findIndex((s) => hasOpenValue(s.text))
  if (step >= 0) return `Step ${step + 1} has a value to confirm. Fill it in, then insert.`
  const hazard = d.hazards.findIndex((h) => hasOpenValue(h.text))
  if (hazard >= 0) return `Hazard ${hazard + 1} has a value to confirm. Fill it in, then insert.`
  return null
}

// Asset codes such as EXL-201 or SAW-202 named in the conversation's Draft.
const ASSET_CODE = /\b[A-Z]{2,4}-\d{3}\b/g

export interface WriterContext {
  documentType: string
  title: string
  areaCode: string | null
  assetIds: Id<"assets">[]
  /** Quick answers for "Where" when creating an image (used when the chat names no Asset). */
  whereSuggestions: string[]
}

type AssetLite = { _id: Id<"assets">; code: string; name: string }

/** What one turn proposes, kept on its chat entry. */
interface TurnExtra {
  proposals: WriterTurnResult["proposals"]
  imageRequest: WriterImageRequest | null
  sources: WriterTurnResult["sources"]
  /** Steps this turn added or rewrote that have no image yet. */
  stepsForImages: { id: string; text: string }[]
  stub: boolean
}

const F = { title: "Title", purpose: "Purpose", steps: "Steps", ppe: "PPE", hazards: "Hazards", terms: "Terms" }

function changedFields(a: WriterDraft, b: WriterDraft): string[] {
  const out: string[] = []
  if (a.title !== b.title) out.push(F.title)
  if (a.purpose !== b.purpose) out.push(F.purpose)
  if (JSON.stringify(a.steps) !== JSON.stringify(b.steps)) out.push(F.steps)
  if (JSON.stringify(a.ppe) !== JSON.stringify(b.ppe)) out.push(F.ppe)
  if (JSON.stringify(a.hazards) !== JSON.stringify(b.hazards)) out.push(F.hazards)
  if (JSON.stringify(a.terms) !== JSON.stringify(b.terms)) out.push(F.terms)
  return out
}

let idSeq = 0
const newId = () => `s${Date.now().toString(36)}${(idSeq++).toString(36)}`

const LEVEL_LABEL: Record<HazardLevel, string> = { danger: "Danger", warning: "Warning", caution: "Caution" }
const LEVEL_TONE: Record<HazardLevel, string> = {
  danger: "border-red-300 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100",
  warning: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
  caution: "border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-500/40 dark:bg-yellow-500/10 dark:text-yellow-100",
}

/** The Draft as TipTap nodes, in the order a reader needs them. */
function writerDraftToNodes(d: WriterDraft): TNode[] {
  const out: TNode[] = []
  if (d.purpose.trim()) out.push(paragraph(text("Purpose: ", true), d.purpose.trim()))
  if (d.ppe.length || d.hazards.length) {
    out.push(heading(2, "Safety"))
    if (d.ppe.length) out.push(ppeNode(d.ppe))
    for (const h of d.hazards) if (h.text.trim()) out.push(calloutNode(h.level, h.text.trim()))
  }
  const steps = d.steps.filter((s) => s.text.trim())
  if (steps.length) {
    out.push(heading(2, "Steps"))
    out.push({
      type: "stepList",
      content: steps.map((s) => ({
        type: "stepItem",
        content: [paragraph(s.text.trim()), ...(s.image ? [imageNode(s.image)] : [])],
      })),
    })
  }
  const terms = d.terms.filter((t) => t.term.trim())
  if (terms.length) {
    out.push(heading(2, "Terms"))
    out.push({
      type: "bulletList",
      content: terms.map((t) => ({
        type: "listItem",
        content: [paragraph(text(t.term.trim(), true), t.meaning.trim() ? `: ${t.meaning.trim()}` : "")],
      })),
    })
  }
  return out
}

const EXAMPLES = [
  "An SOP for the start-up of the extruder after a weekend stop, for night-shift operators",
  "A work instruction for changing the screen pack, with the safety points",
  "A last-minute risk analysis (LMRA) for cleaning the mixer hopper",
]

const PROGRESS = [
  { after: 0, text: "Reading your message…" },
  { after: 2, text: "Looking up Published documents and the Plant…" },
  { after: 6, text: "Writing the draft steps…" },
  { after: 14, text: "Checking safety points and terms…" },
  { after: 25, text: "Almost there. A first draft can take up to half a minute." },
]

/** Assets the Draft talks about, so image places follow the chat, not the open document. */
function topicAssets(d: WriterDraft, assets: AssetLite[] | undefined, extra = ""): AssetLite[] {
  if (!assets?.length) return []
  const hay = [d.title, d.purpose, ...d.steps.map((s) => s.text), ...d.hazards.map((h) => h.text), extra].join(" ")
  const codes = new Set(hay.match(ASSET_CODE) ?? [])
  return assets.filter((a) => codes.has(a.code))
}

export function DocumentGuidedWriter({
  open,
  onOpenChange,
  context,
  onInsert,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  context: WriterContext
  onInsert: (nodes: TNode[], draft: WriterDraft) => void
}) {
  const turn = useAction(api.ai.guidedChat.writerTurn)
  const ppeItems = useQuery(api.ppe.list, open ? {} : "skip")
  const assets = useQuery(api.assets.list, open ? {} : "skip") as AssetLite[] | undefined
  const ppeCatalogue = useMemo(
    () => (ppeItems ?? []).filter((p) => p.active).map((p) => ({ slug: p.slug, label: p.labelEn ?? p.label, url: p.imageUrl })),
    [ppeItems],
  )
  const [picker, setPicker] = useState<{ stepId: string; query: string } | null>(null)
  const [creator, setCreator] = useState<{ stepId: string | null; initial: Partial<ImageAnswers> } | null>(null)
  // Set by the Draft and proposal buttons, which only see the Draft.
  const [pendingSet, setPendingSet] = useState<((d: WriterDraft) => void) | null>(null)

  async function ask(messages: GuidedMessage[], draft: WriterDraft) {
    const r = await turn({
      messages,
      draft: {
        title: draft.title,
        purpose: draft.purpose,
        ppe: draft.ppe,
        hazards: draft.hazards,
        steps: draft.steps.map((s) => ({ id: s.id, text: s.text, hasImage: Boolean(s.image) })),
        terms: draft.terms,
      },
      context: {
        documentType: context.documentType,
        title: context.title,
        areaCode: context.areaCode,
        assetIds: context.assetIds,
      },
    })
    const byId = new Map(draft.steps.map((s) => [s.id, s]))
    const steps: WriterStep[] = r.draft.steps.map((s) => {
      const old = s.id ? byId.get(s.id) : undefined
      return { id: old?.id ?? newId(), text: s.text, image: old?.image ?? null }
    })
    const stepsForImages = steps
      .filter((s) => !s.image && byId.get(s.id)?.text !== s.text)
      .slice(0, 3)
      .map(({ id, text }) => ({ id, text }))
    const extra: TurnExtra = {
      proposals: r.proposals,
      imageRequest: r.imageRequest,
      sources: r.sources,
      stepsForImages,
      stub: r.stub,
    }
    return {
      reply: r.reply,
      question: r.question,
      ready: r.ready,
      draft: {
        title: r.draft.title,
        purpose: r.draft.purpose,
        ppe: r.draft.ppe,
        hazards: r.draft.hazards,
        terms: r.draft.terms,
        steps,
      },
      extra,
    }
  }

  // The image dialogs edit the Draft through the session's setter, captured
  // when they open (the dialogs live outside the Draft panel).
  const [draftRef, setDraftRef] = useState<WriterDraft>(EMPTY_WRITER_DRAFT)

  // Image places and links follow the Assets the chat is about; the open
  // document's own Assets only when the chat names none.
  const [chatWhere, setChatWhere] = useState("")
  const chatAssets = useMemo(() => topicAssets(draftRef, assets, chatWhere), [draftRef, assets, chatWhere])
  const imageAssetIds = chatAssets.length ? chatAssets.map((a) => a._id) : context.assetIds
  const imageAreaCodes = chatAssets.length ? undefined : context.areaCode ? [context.areaCode] : undefined
  const whereSuggestions = useMemo(() => {
    const out = [chatWhere.trim(), ...chatAssets.map((a) => `At ${a.code} ${a.name}`)].filter(Boolean)
    return out.length ? Array.from(new Set(out)) : context.whereSuggestions
  }, [chatWhere, chatAssets, context.whereSuggestions])

  function renderEntryExtra(entry: GuidedEntry, info: GuidedEntryInfo<WriterDraft>) {
    const extra = entry.extra as TurnExtra | undefined
    if (!extra) return null
    return (
      <TurnProposals
        extra={extra}
        info={info}
        ppeCatalogue={ppeCatalogue}
        onPickImage={(stepId, query) => {
          setPendingSet(() => info.setDraft)
          setPicker({ stepId, query })
        }}
        onCreateImage={(req) => {
          setPendingSet(() => info.setDraft)
          setChatWhere(req.where)
          setCreator({
            stepId: bestStepFor(info.draft, req.what),
            initial: {
              what: req.what,
              where: req.where,
              viewpoint: req.viewpoint,
              style: req.style,
              safety: req.safety ? [req.safety] : [],
            },
          })
        }}
      />
    )
  }

  function attachImage(stepId: string | null, image: PickedImage) {
    if (!pendingSet) return
    const d = draftRef
    const target = stepId ?? d.steps.find((s) => !s.image)?.id ?? d.steps.at(-1)?.id
    if (!target) {
      pendingSet({ ...d, steps: [...d.steps, { id: newId(), text: image.altText, image }] })
      return
    }
    pendingSet({ ...d, steps: d.steps.map((s) => (s.id === target ? { ...s, image } : s)) })
  }

  return (
    <GuidedCreation<WriterDraft>
      open={open}
      onOpenChange={onOpenChange}
      title="Write with the assistant"
      description="Say what the document should cover. The assistant asks a few questions, fills the draft and proposes images and safety points. Nothing goes into the document until you press Insert."
      greeting="What should this document cover? Say the task, who does it and where. I will ask a few questions and draft the steps."
      examples={EXAMPLES}
      initialDraft={EMPTY_WRITER_DRAFT}
      ask={ask}
      changedFields={changedFields}
      renderEntryExtra={renderEntryExtra}
      progressSteps={PROGRESS}
      overlays={
        <>
          <ImagePickerDialog
            open={picker !== null}
            onOpenChange={(o) => !o && setPicker(null)}
            initialQuery={picker?.query}
            areaCodes={imageAreaCodes}
            assetIds={imageAssetIds.length ? imageAssetIds : undefined}
            whereSuggestions={whereSuggestions}
            title="Add an image to this step"
            onPick={(img) => {
              if (picker) attachImage(picker.stepId, img)
              setPicker(null)
            }}
          />
          <CreateImageDialog
            open={creator !== null}
            onOpenChange={(o) => !o && setCreator(null)}
            initial={creator?.initial}
            whereSuggestions={whereSuggestions}
            areaCodes={imageAreaCodes}
            assetIds={imageAssetIds}
            insertLabel="Add to the draft"
            onInsert={(img) => attachImage(creator?.stepId ?? null, img)}
          />
        </>
      }
      blockedReason={(d) =>
        d.steps.filter((s) => s.text.trim()).length === 0 ? "Add at least one step." : openValueReason(d)
      }
      createLabel="Insert into document"
      renderSummary={(d) => {
        const n = d.steps.filter((s) => s.text.trim()).length
        const imgs = d.steps.filter((s) => s.image).length
        return (
          <span className="text-muted-foreground">
            {n} {n === 1 ? "step" : "steps"}, {imgs} {imgs === 1 ? "image" : "images"}, {d.ppe.length} PPE,{" "}
            {d.hazards.length} {d.hazards.length === 1 ? "hazard" : "hazards"}. Inserted at the cursor.
          </span>
        )
      }}
      onCreate={async (d) => {
        onInsert(writerDraftToNodes(d), d)
        onOpenChange(false)
      }}
      renderDraft={(draft, setDraft, changed) => (
        <DraftEditor
          draft={draft}
          setDraft={setDraft}
          changed={changed}
          ppeCatalogue={ppeCatalogue}
          onMount={(d) => setDraftRef(d)}
          onAddImage={(stepId, query) => {
            setPendingSet(() => setDraft)
            setPicker({ stepId, query })
          }}
        />
      )}
    />
  )
}

/** The step that shares the most words with `what`, for an image asked for in chat. */
function bestStepFor(d: WriterDraft, what: string): string | null {
  const words = new Set(what.toLowerCase().split(/\W+/).filter((w) => w.length > 3))
  let best: { id: string; n: number } | null = null
  for (const s of d.steps) {
    if (s.image) continue
    const n = s.text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => words.has(w)).length
    if (n > 0 && (!best || n > best.n)) best = { id: s.id, n }
  }
  return best?.id ?? null
}

// ---- Proposals under a chat message ------------------------------------------------

function TurnProposals({
  extra,
  info,
  ppeCatalogue,
  onPickImage,
  onCreateImage,
}: {
  extra: TurnExtra
  info: GuidedEntryInfo<WriterDraft>
  ppeCatalogue: { slug: string; label: string; url: string | null }[]
  onPickImage: (stepId: string, query: string) => void
  onCreateImage: (req: WriterImageRequest) => void
}) {
  const { draft, setDraft, busy } = info
  const { proposals, imageRequest, sources } = extra
  // Proposals are offered on the latest answer only; older ones would repeat it.
  const hasSafety = info.isLast && proposals.ppe.length + proposals.hazards.length + proposals.terms.length > 0
  const liveSteps = info.isLast
    ? extra.stepsForImages.filter((s) => draft.steps.some((d) => d.id === s.id && !d.image))
    : []
  if (!hasSafety && !(imageRequest && info.isLast) && sources.length === 0 && liveSteps.length === 0) return null

  const addPpe = (slug: string) => !draft.ppe.includes(slug) && setDraft({ ...draft, ppe: [...draft.ppe, slug] })
  const hasHazard = (t: string) => draft.hazards.some((h) => h.text === t)
  const hasTerm = (t: string) => draft.terms.some((x) => x.term === t)

  return (
    <div className="space-y-2 rounded-lg border bg-background p-2.5 text-xs">
      {sources.length > 0 && (
        <p className="flex flex-wrap items-center gap-1 text-muted-foreground">
          <FileText className="h-3 w-3" /> Based on
          {sources.map((s) => (
            <a
              key={s.documentId}
              href={`/docs/${s.documentId}`}
              target="_blank"
              rel="noreferrer"
              className="rounded border px-1 font-mono hover:bg-muted"
              title={s.title}
            >
              {s.namingCode}
            </a>
          ))}
        </p>
      )}

      {hasSafety && (
        <div className="space-y-2.5">
          <p className="flex items-center gap-1 font-medium">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-600" /> Proposed for the draft. Check each one, then add it.
          </p>

          {proposals.ppe.length > 0 && (
            <ProposalGroup title="PPE" hint="From the Safety icons catalogue">
              <div className="flex flex-wrap gap-1.5">
                {proposals.ppe.map((p) => {
                  const added = draft.ppe.includes(p.slug)
                  const icon = ppeCatalogue.find((c) => c.slug === p.slug)?.url
                  return (
                    <ProposalChip key={p.slug} added={added} disabled={busy} onAdd={() => addPpe(p.slug)}>
                      {icon && <img src={icon} alt="" className="h-4 w-4" />}
                      {p.label}
                    </ProposalChip>
                  )
                })}
              </div>
            </ProposalGroup>
          )}

          {proposals.hazards.length > 0 && (
            <ProposalGroup title="Hazards">
              {proposals.hazards.map((h) => (
                <ProposalRow
                  key={h.text}
                  added={hasHazard(h.text)}
                  disabled={busy}
                  source={h.source}
                  onAdd={() =>
                    !hasHazard(h.text) && setDraft({ ...draft, hazards: [...draft.hazards, { level: h.level, text: h.text }] })
                  }
                >
                  <span className={cn("mr-1 rounded border px-1 py-px text-[10px] font-semibold uppercase", LEVEL_TONE[h.level])}>
                    {LEVEL_LABEL[h.level]}
                  </span>
                  <OpenValueText text={h.text} />
                </ProposalRow>
              ))}
            </ProposalGroup>
          )}

          {proposals.terms.length > 0 && (
            <ProposalGroup title="Plant terms">
              {proposals.terms.map((t) => (
                <ProposalRow
                  key={t.term}
                  added={hasTerm(t.term)}
                  disabled={busy}
                  source={t.source}
                  onAdd={() =>
                    !hasTerm(t.term) && setDraft({ ...draft, terms: [...draft.terms, { term: t.term, meaning: t.meaning }] })
                  }
                >
                  <span className="font-semibold">{t.term}</span>
                  {t.meaning && <span className="text-muted-foreground">: {t.meaning}</span>}
                </ProposalRow>
              ))}
            </ProposalGroup>
          )}
        </div>
      )}

      {liveSteps.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-medium">From your image library</p>
          {liveSteps.map((s) => (
            <StepImageSuggestions
              key={s.id}
              step={s}
              index={draft.steps.findIndex((d) => d.id === s.id)}
              disabled={busy}
              onAdd={(img) => setDraft({ ...draft, steps: draft.steps.map((d) => (d.id === s.id ? { ...d, image: img } : d)) })}
              onMore={() => onPickImage(s.id, s.text)}
            />
          ))}
        </div>
      )}

      {imageRequest && info.isLast && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-primary/5 p-2">
          <span className="min-w-0 truncate">
            Image: {imageRequest.what || "as described"}
          </span>
          <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-xs" onClick={() => onCreateImage(imageRequest)}>
            <Wand2 className="h-3 w-3" /> Create this image
          </Button>
        </div>
      )}
      {extra.stub && <p className="text-muted-foreground">Offline stand-in: no AI was used for this answer.</p>}
    </div>
  )
}

function ProposalGroup({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        {hint && <span className="ml-1.5 font-normal normal-case tracking-normal">{hint}</span>}
      </h4>
      <div className="space-y-1">{children}</div>
    </section>
  )
}

function SourceLine({ source }: { source: ProposalSource | null }) {
  if (!source) {
    return <p className="text-[11px] text-amber-700 dark:text-amber-300">No source found. Check it against a Published document.</p>
  }
  if (source.kind === "plant") {
    return (
      <p className="text-[11px] text-muted-foreground">
        From the{" "}
        <a href="/plant" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
          Plant
        </a>{" "}
        (background, not a Published source)
      </p>
    )
  }
  return (
    <p className="text-[11px] text-muted-foreground">
      From{" "}
      <a
        href={`/docs/${source.documentId}`}
        target="_blank"
        rel="noreferrer"
        className="font-mono underline-offset-2 hover:underline"
        title={source.title}
      >
        {source.namingCode}
      </a>{" "}
      {source.title}
    </p>
  )
}

function ProposalRow({
  added,
  disabled,
  source,
  onAdd,
  children,
}: {
  added: boolean
  disabled?: boolean
  source: ProposalSource | null
  onAdd: () => void
  children: ReactNode
}) {
  return (
    <div className={cn("flex items-start gap-2 rounded-md border p-1.5", added && "border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/40 dark:bg-emerald-500/10")}>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="leading-snug">{children}</p>
        <SourceLine source={source} />
      </div>
      <Button
        type="button"
        size="sm"
        variant={added ? "ghost" : "outline"}
        className="h-6 shrink-0 gap-1 px-2 text-[11px]"
        disabled={added || disabled}
        onClick={onAdd}
      >
        {added ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        {added ? "Added" : "Add"}
      </Button>
    </div>
  )
}

/** Text with "[value to confirm]" marked, so an open value is never missed. */
function OpenValueText({ text: t }: { text: string }) {
  const parts = t.split(/(\[[^\]]*\bconfirm\b[^\]]*\])/i)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-amber-200 px-0.5 text-amber-950 dark:bg-amber-500/30 dark:text-amber-50">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

function ProposalChip({
  added,
  disabled,
  onAdd,
  children,
}: {
  added: boolean
  disabled?: boolean
  onAdd: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={added || disabled}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-left transition-colors",
        added ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100" : "hover:border-primary/60 hover:bg-primary/5",
      )}
      title={added ? "In the draft" : "Add to the draft"}
    >
      {added ? <Check className="h-3 w-3 shrink-0" /> : <Plus className="h-3 w-3 shrink-0 text-primary" />}
      <span className="min-w-0 truncate">{children}</span>
    </button>
  )
}

const suggestionCache = new Map<string, ImageHit[]>()

function StepImageSuggestions({
  step,
  index,
  disabled,
  onAdd,
  onMore,
}: {
  step: { id: string; text: string }
  index: number
  disabled: boolean
  onAdd: (img: PickedImage) => void
  onMore: () => void
}) {
  const search = useAction(api.imageSearch.search)
  const personId = useCheckIn().person?._id
  const [hits, setHits] = useState<ImageHit[] | null>(suggestionCache.get(step.text) ?? null)
  useEffect(() => {
    if (suggestionCache.has(step.text)) return
    let live = true
    search({ query: step.text, limit: 3, ...(personId ? { personId } : {}) })
      .then((r) => {
        // Weak matches would only distract.
        const good = r.filter((h) => h.url && matchReason(h, { query: step.text }) !== null)
        suggestionCache.set(step.text, good)
        if (live) setHits(good)
      })
      .catch(() => live && setHits([]))
    return () => {
      live = false
    }
  }, [search, step.text, personId])

  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-muted-foreground">Step {index + 1}</span>
      {hits === null ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : hits.length === 0 ? (
        <span className="text-muted-foreground">No close match.</span>
      ) : (
        hits.map((h) => (
          <button
            key={h.imageId}
            type="button"
            disabled={disabled}
            onClick={() => onAdd({ imageId: h.imageId, url: h.url, altText: h.altText })}
            className="group relative h-11 w-14 shrink-0 overflow-hidden rounded border hover:ring-2 hover:ring-primary"
            title={`Add to step ${index + 1}: ${h.altText}`}
          >
            <img src={h.url ?? ""} alt={h.altText} className="h-full w-full object-cover" />
            <span className="absolute inset-0 hidden items-center justify-center bg-black/40 text-white group-hover:flex">
              <Plus className="h-4 w-4" />
            </span>
          </button>
        ))
      )}
      <button type="button" onClick={onMore} className="ml-auto shrink-0 font-medium text-primary hover:underline">
        More
      </button>
    </div>
  )
}

// ---- The Draft --------------------------------------------------------------------

function DraftEditor({
  draft,
  setDraft,
  changed,
  ppeCatalogue,
  onMount,
  onAddImage,
}: {
  draft: WriterDraft
  setDraft: (d: WriterDraft) => void
  changed: ReadonlySet<string>
  ppeCatalogue: { slug: string; label: string; url: string | null }[]
  onMount: (d: WriterDraft) => void
  /** Opens the one image picker (library, upload, create) for a step. */
  onAddImage: (stepId: string, query: string) => void
}) {
  // Keeps the dialogs outside this panel working on the latest Draft.
  useEffect(() => onMount(draft), [draft, onMount])
  const setStep = (id: string, patch: Partial<WriterStep>) =>
    setDraft({ ...draft, steps: draft.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  const move = (i: number, d: -1 | 1) => {
    const steps = [...draft.steps]
    const [s] = steps.splice(i, 1)
    steps.splice(i + d, 0, s)
    setDraft({ ...draft, steps })
  }
  const unusedPpe = ppeCatalogue.filter((p) => !draft.ppe.includes(p.slug))

  return (
    <div className="space-y-5">
      <Field label="Title" changed={changed.has(F.title)}>
        <Input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="For example: Changing the screen pack on EXL-201"
          className="h-8 text-sm"
          aria-label="Title"
        />
      </Field>

      <Field label="Purpose" changed={changed.has(F.purpose)}>
        <Textarea
          value={draft.purpose}
          onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
          rows={2}
          placeholder="For example: night-shift operators change the screen pack when the melt pressure rises"
          className={cn("text-sm", hasOpenValue(draft.purpose) && "border-amber-400 ring-1 ring-amber-300")}
          aria-label="Purpose"
        />
      </Field>

      <Field label="Safety" changed={changed.has(F.ppe) || changed.has(F.hazards)}>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {draft.ppe.map((slug) => {
              const p = ppeCatalogue.find((c) => c.slug === slug)
              return (
                <span key={slug} className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs">
                  {p?.url && <img src={p.url} alt="" className="h-4 w-4" />}
                  {p?.label ?? slug}
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, ppe: draft.ppe.filter((s) => s !== slug) })}
                    aria-label={`Remove ${p?.label ?? slug}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )
            })}
            {unusedPpe.length > 0 && (
              <Select value="" onValueChange={(slug) => setDraft({ ...draft, ppe: [...draft.ppe, slug] })}>
                <SelectTrigger className="h-7 w-auto gap-1 rounded-full px-2.5 text-xs" aria-label="Add PPE">
                  <SelectValue placeholder="Add PPE" />
                </SelectTrigger>
                <SelectContent>
                  {unusedPpe.map((p) => (
                    <SelectItem key={p.slug} value={p.slug} className="text-xs">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {draft.hazards.map((h, i) => (
            <div key={i} className={cn("flex items-start gap-2 rounded-md border p-1.5", LEVEL_TONE[h.level])}>
              <Select
                value={h.level}
                onValueChange={(level) =>
                  setDraft({ ...draft, hazards: draft.hazards.map((x, j) => (j === i ? { ...x, level: level as HazardLevel } : x)) })
                }
              >
                <SelectTrigger className="h-8 w-[104px] shrink-0 bg-background text-xs" aria-label="Level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["danger", "warning", "caution"] as const).map((l) => (
                    <SelectItem key={l} value={l} className="text-xs">
                      {LEVEL_LABEL[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={h.text}
                onChange={(e) =>
                  setDraft({ ...draft, hazards: draft.hazards.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })
                }
                className={cn("h-8 bg-background text-sm", hasOpenValue(h.text) && "border-amber-400 ring-1 ring-amber-300")}
                aria-label="Hazard"
              />
              <IconButton label="Remove hazard" onClick={() => setDraft({ ...draft, hazards: draft.hazards.filter((_, j) => j !== i) })}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setDraft({ ...draft, hazards: [...draft.hazards, { level: "warning", text: "" }] })}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Add hazard
          </button>
        </div>
      </Field>

      <Field label="Steps" changed={changed.has(F.steps)}>
        {draft.steps.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            The steps appear here as you talk. You can also add them yourself.
          </p>
        ) : (
          <ol className="space-y-2">
            {draft.steps.map((s, i) => (
              <li key={s.id} className="space-y-1.5 rounded-md border bg-background p-2">
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <Textarea
                      value={s.text}
                      onChange={(e) => setStep(s.id, { text: e.target.value })}
                      rows={2}
                      className={cn("min-h-[52px] text-sm", hasOpenValue(s.text) && "border-amber-400 ring-1 ring-amber-300")}
                      aria-label={`Step ${i + 1}`}
                      aria-invalid={hasOpenValue(s.text) || undefined}
                    />
                    {hasOpenValue(s.text) && (
                      <p className="text-[11px] text-amber-800 dark:text-amber-200">
                        Replace the part in square brackets with the real value before inserting.
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col">
                    <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label="Move down" disabled={i === draft.steps.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label="Remove step" onClick={() => setDraft({ ...draft, steps: draft.steps.filter((x) => x.id !== s.id) })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-7">
                  {s.image ? (
                    <>
                      {s.image.url && <img src={s.image.url} alt={s.image.altText} className="h-12 w-16 rounded border object-cover" />}
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{s.image.altText}</span>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setStep(s.id, { image: null })}>
                        Remove image
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs"
                      onClick={() => onAddImage(s.id, s.text)}
                      title="Pick from the library, upload or create one"
                    >
                      <ImagePlus className="h-3.5 w-3.5" /> Add image
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        <button
          type="button"
          onClick={() => setDraft({ ...draft, steps: [...draft.steps, { id: newId(), text: "", image: null }] })}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Plus className="h-3 w-3" /> Add step
        </button>
      </Field>

      <Field label="Plant terms" changed={changed.has(F.terms)}>
        <div className="space-y-1.5">
          {draft.terms.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={t.term}
                onChange={(e) => setDraft({ ...draft, terms: draft.terms.map((x, j) => (j === i ? { ...x, term: e.target.value } : x)) })}
                className="h-8 w-36 text-sm font-medium"
                aria-label="Term"
              />
              <Input
                value={t.meaning}
                onChange={(e) =>
                  setDraft({ ...draft, terms: draft.terms.map((x, j) => (j === i ? { ...x, meaning: e.target.value } : x)) })
                }
                className="h-8 text-sm"
                aria-label="Meaning"
              />
              <IconButton label="Remove term" onClick={() => setDraft({ ...draft, terms: draft.terms.filter((_, j) => j !== i) })}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setDraft({ ...draft, terms: [...draft.terms, { term: "", meaning: "" }] })}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Add term
          </button>
        </div>
      </Field>
    </div>
  )
}

function Field({ label, changed, children }: { label: string; changed: boolean; children: ReactNode }) {
  return (
    <section className={cn("space-y-1.5 rounded-md transition-colors", changed && "bg-primary/5 ring-1 ring-primary/30 ring-offset-4 ring-offset-transparent")}>
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {changed && <span className="rounded bg-primary/10 px-1 text-[10px] normal-case tracking-normal text-primary">updated</span>}
      </h3>
      {children}
    </section>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  )
}
