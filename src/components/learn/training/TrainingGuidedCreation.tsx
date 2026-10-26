import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { Link, useLocation } from "wouter"
import { toast } from "sonner"
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpenCheck,
  Check,
  ChevronsUpDown,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  Eye,
  FileText,
  Loader2,
  Lock,
  MapPin,
  MessageSquare,
  PanelRightClose,
  Plus,
  Quote,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingDown,
  Users,
  Wand2,
  X,
} from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { DiscardDraftDialog, GuidedConversation, useGuidedSession } from "@/components/guided/GuidedCreation"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import { errorText, KindIcon, SourceChip } from "./lib"
import { JobBreakdownEditor, JustChanged } from "./JobBreakdownEditor"
import { QuestionBankEditor } from "./QuestionBankEditor"
import { TrainingPreview } from "./TrainingPreview"
import { StillOnPointPanel } from "./TrainingInsightsPanel"
import { AudiencePicker, useCatalogue } from "./AssignDialog"
import {
  builderChecks,
  checklistFromBreakdown,
  F,
  newTrainingDraft,
  hasSafety,
  mergeGuide,
  passRuleText,
  questionCount,
  toGuideDraft,
  toServerDraft,
  trainingDraftChanges,
  type Check as BuilderCheck,
  type CheckTab,
  type TrainingDraft,
} from "./builderModel"
import { isEngineerOrAdmin } from "@/lib/roles"
import { KnowledgeSearchPanel } from "@/components/find/KnowledgeSearchPanel"

export type { TrainingDraft } from "./builderModel"
export { EMPTY_TRAINING_DRAFT, trainingDraftChanges } from "./builderModel"

export type BuilderTab = CheckTab | "preview" | "signals"

const TABS: { value: BuilderTab; label: string; icon: typeof FileText }[] = [
  { value: "source", label: "Source and goal", icon: FileText },
  { value: "breakdown", label: "Job breakdown", icon: ClipboardCheck },
  { value: "questions", label: "Questions", icon: MessageSquare },
  { value: "tryout", label: "Try-out and refresher", icon: BookOpenCheck },
  { value: "people", label: "People", icon: Users },
  { value: "preview", label: "Preview", icon: Eye },
  { value: "signals", label: "Answers and signals", icon: TrendingDown },
]

const LAST_REVIEWER_KEY = "oppr.training.lastReviewer"

const EXAMPLES = [
  "Line 2 cold start for operators",
  "A safety Round along line 2: lockout, the hot die and the saw",
  "Wall thickness measurement for quality lab technicians",
]

/**
 * The Training builder (CONTEXT.md: Training; ADR 0002). A large workspace
 * with tabs: Source and goal, Job breakdown, Questions, Try-out and
 * refresher, People, Preview as trainee and "Still on point?". The AI
 * drafts (the assistant panel, and Draft buttons per tab); the Engineer
 * edits everything and sends it for review. Trainings come only from
 * Published documents. With `trainingId` it edits the working version.
 *
 * The export keeps its name for the existing entry points.
 */
export function TrainingGuidedCreation({
  open,
  onOpenChange,
  trainingId,
  code,
  version = 1,
  initial,
  initialDocumentIds,
  initialSkillIds,
  initialPurpose,
  initialKind,
  initialTab = "source",
  hasLive = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trainingId?: Id<"trainings">
  code?: string
  version?: number
  initial?: TrainingDraft
  initialDocumentIds?: Id<"documents">[]
  initialSkillIds?: Id<"skills">[]
  initialPurpose?: string
  initialKind?: TrainingDraft["kind"]
  initialTab?: BuilderTab
  /** The Training has a published version (enables "Still on point?"). */
  hasLive?: boolean
}) {
  const guide = useAction(api.ai.training.guide)
  const create = useMutation(api.trainings.create)
  const update = useMutation(api.trainings.update)
  const submit = useMutation(api.trainings.submitForReview)
  const options = useQuery(api.trainings.draftOptions, open ? {} : "skip")
  // Company defaults for a new Training (Settings, Training).
  const trainingDefaults = useQuery(api.orgSettings.get)?.training
  const catalogue = useCatalogue()
  const { person } = useCheckIn()
  const [, navigate] = useLocation()
  const editing = trainingId !== undefined
  const [tab, setTab] = useState<BuilderTab>(initialTab)
  const [assistantOpen, setAssistantOpen] = useState(false)
  // "Find images and passages": a found passage becomes a Learning objective.
  const [findOpen, setFindOpen] = useState(false)
  // A new Training starts with one choice: which Published document.
  const [skipStart, setSkipStart] = useState(false)
  const [kindLocked, setKindLocked] = useState(Boolean(initialKind) || editing)
  const [confirmClose, setConfirmClose] = useState(false)
  // The reviewer this person picked last time, like the SOP flow prefills its own.
  const [reviewer, setReviewer] = useState<Id<"people"> | null>(() => {
    try {
      return (window.localStorage.getItem(LAST_REVIEWER_KEY) as Id<"people"> | null) ?? null
    } catch {
      return null
    }
  })

  const startDraft = useMemo<TrainingDraft>(
    () =>
      initial ?? {
        ...newTrainingDraft(trainingDefaults),
        kind: initialKind ?? "course",
        purpose: initialPurpose ?? "",
        documentIds: initialDocumentIds ?? [],
        skillIds: initialSkillIds ?? [],
      },
    // Read on open only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  )

  const session = useGuidedSession<TrainingDraft>({
    open,
    greeting: editing
      ? "What should change? I can rewrite objectives or add passages. Edit any tab yourself too."
      : "Who is this Training for, and what must they be able to do? I pick the Published documents and propose Learning objectives, each traced to a passage. Then draft the breakdown and the questions in their tabs.",
    initialDraft: startDraft,
    ask: async (messages, d) => {
      const res = await guide({ messages, draft: toGuideDraft(d) })
      return { reply: res.reply, ready: res.ready, draft: mergeGuide(d, res.draft, kindLocked) }
    },
    changedFields: trainingDraftChanges,
  })

  useEffect(() => {
    if (!open) return
    setTab(initialTab)
    setAssistantOpen(false)
    setSkipStart(false)
    setKindLocked(Boolean(initialKind) || editing)
    setConfirmClose(false)
    setReviewer(null)
    // Reset when the builder opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const draft = session.draft
  const setDraft = session.setDraft
  const changed = session.changed
  const docInfo = useMemo(
    () => new Map((options?.documents ?? []).map((d) => [String(d._id), { namingCode: d.namingCode, version: d.version }])),
    [options],
  )
  // Open contradiction Findings on the cited passages: of the saved version
  // (with "I checked this, keep it" acks), or of the unsaved Draft.
  const savedFindings = useQuery(api.trainings.openFindingsForObjectives, open && trainingId ? { trainingId } : "skip")
  const draftFindings = useQuery(
    api.trainingBuilder.findingsForDraft,
    open && !trainingId && draft.objectives.some((o) => o.chunkId)
      ? { objectives: draft.objectives.map((o) => ({ id: o.id, documentId: o.documentId, chunkId: o.chunkId, quote: o.quote })) }
      : "skip",
  )
  const findings: ObjectiveFindings = useMemo(() => {
    const m: ObjectiveFindings = new Map()
    for (const f of savedFindings ?? []) m.set(f.objectiveId, f.findings.map((x) => ({ ...x, acked: x.acked ? { reason: x.acked.reason } : null })))
    for (const f of draftFindings ?? []) m.set(f.objectiveId, f.findings.map((x) => ({ ...x, acked: null })))
    return m
  }, [savedFindings, draftFindings])
  const unsettled = draft.objectives.findIndex((o) => (findings.get(o.id) ?? []).some((f) => !f.acked))
  const checks: BuilderCheck[] = [
    ...builderChecks(draft, { version, tryOutForSafety: trainingDefaults?.tryOutForSafety }),
    ...(unsettled >= 0
      ? [
          {
            tab: "source" as const,
            text: trainingId
              ? `Objective ${unsettled + 1} cites a passage with an open contradiction. Settle the Finding, or tick "I checked this, keep it".`
              : `Objective ${unsettled + 1} cites a passage with an open contradiction. Settle the Finding, or create the draft and tick "I checked this, keep it".`,
            blocksSave: false,
          },
        ]
      : []),
  ]
  const saveBlock = checks.find((c) => c.blocksSave) ?? null
  const reviewBlock = checks[0] ?? null
  const unchanged = trainingDraftChanges(session.initial, draft).length === 0
  const busy = session.busy
  const author = person?._id ?? null
  // Never prefill the author as their own reviewer (four-eyes).
  const reviewerFor = reviewer && reviewer !== author ? reviewer : null

  // A new Training gets its id on the first save; later saves update it.
  const [createdId, setCreatedId] = useState<Id<"trainings"> | null>(null)
  useEffect(() => {
    if (open) setCreatedId(null)
  }, [open])

  async function save(): Promise<Id<"trainings"> | null> {
    let id: Id<"trainings"> | null = trainingId ?? createdId
    const ok = await session.save(
      async (d) => {
        if (id) {
          const res = await update({ id, draft: toServerDraft(d), personId: person?._id })
          if (res.backToDraft) toast.message("Saved. The Training is back in draft and needs review again.")
        } else {
          id = await create({ draft: toServerDraft(d), personId: person?._id })
          setCreatedId(id)
        }
      },
      { keepOpen: true },
    )
    return ok ? id : null
  }

  async function saveDraft() {
    if (saveBlock || busy) return
    const id = await save()
    if (!id) return
    toast.success(editing ? "Draft saved" : "Draft created. Send it for review when it is ready.")
    if (!editing) {
      onOpenChange(false)
      navigate(`/learn/trainings/${id}`)
    }
  }

  async function sendForReview() {
    if (reviewBlock || busy || !reviewerFor) return
    const id = unchanged && trainingId ? trainingId : await save()
    if (!id) return
    try {
      await submit({ id, reviewerPersonId: reviewerFor, personId: person?._id })
      try {
        window.localStorage.setItem(LAST_REVIEWER_KEY, reviewerFor)
      } catch {
        // Not remembered: the picker simply starts empty next time.
      }
      const name = catalogue?.people.find((p) => p._id === reviewerFor)?.name ?? "the reviewer"
      toast.success(`Sent to ${name} for review.`)
      onOpenChange(false)
      if (!editing) navigate(`/learn/trainings/${id}`)
    } catch (err) {
      // A new Training was created but could not be sent: open it, so nothing is made twice.
      toast.error(errorText(err))
      if (!editing) {
        onOpenChange(false)
        navigate(`/learn/trainings/${id}`)
      }
    }
  }

  function requestClose() {
    if (session.phase === "creating") return
    if (session.dirty && !unchanged) setConfirmClose(true)
    else onOpenChange(false)
  }

  const tabChecks = (t: BuilderTab) => checks.filter((c) => c.tab === t)
  // Until a source is chosen the other tabs have nothing to work on.
  const noSource = !editing && draft.documentIds.length === 0 && draft.objectives.length === 0
  const starting = !editing && draft.objectives.length === 0 && !skipStart
  const startWithAssistant = (purpose: string) => {
    const docs = draft.documentIds
      .map((id) => options?.documents.find((d) => d._id === id))
      .filter((d): d is NonNullable<typeof d> => !!d)
      .map((d) => `${d.namingCode} ${d.title}`)
      .join(", ")
    setAssistantOpen(true)
    setSkipStart(true)
    session.send(
      `Draft this ${draft.kind === "round" ? "Round" : "Training"} from ${docs}.${purpose.trim() ? ` Goal: ${purpose.trim()}` : ""} Propose the title, the area and the Learning objectives.`,
    )
  }
  const steps = draft.breakdown.length
  const keyPoints = draft.breakdown.reduce((n, r) => n + r.keyPoints.length, 0)
  const critical = draft.objectives.filter((o) => o.critical).length
  const total = questionCount(draft)

  const summary = (
    <span className="text-xs">
      <KindIcon kind={draft.kind} className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-muted-foreground" />
      <span className="font-medium">
        {draft.objectives.length} {draft.objectives.length === 1 ? "objective" : "objectives"}
      </span>
      <span className="text-muted-foreground">
        {" "}· {steps} {steps === 1 ? "step" : "steps"}, {keyPoints} key points, {critical} must be right · {total}{" "}
        {total === 1 ? "question" : "questions"} per Attempt
        {draft.questionBank.length > 0 ? ` from a bank of ${draft.questionBank.length}` : ", written fresh"} · pass:{" "}
        {passRuleText(total, draft.passMark, critical).replace(/\.$/, "").toLowerCase()}
        {draft.tryOut?.required ? " · try-out at the line" : ""}
        {draft.refreshMonths ? ` · refresher after ${draft.refreshMonths} months` : ""}
      </span>
    </span>
  )

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}>
        <DialogContent
          className="flex h-[92vh] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b px-5 py-3 pr-14">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base font-semibold">
                {editing ? `${code ?? "Training"} v${version}: ${draft.title || "Untitled"}` : draft.title ? `New Training: ${draft.title}` : "New Training"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                The AI drafts, you decide. Every objective, step and question cites a Published passage.
              </DialogDescription>
            </div>
            <Button
              size="sm"
              variant={assistantOpen ? "secondary" : "outline"}
              className="gap-1.5"
              onClick={() => {
                setAssistantOpen(!assistantOpen)
                setFindOpen(false)
              }}
              aria-pressed={assistantOpen}
              title="Say what the Training is for; the assistant drafts objectives from Published passages"
            >
              {assistantOpen ? <PanelRightClose className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {assistantOpen ? "Hide assistant" : "Draft with assistant"}
            </Button>
            <Button
              size="sm"
              variant={findOpen ? "secondary" : "outline"}
              className="gap-1.5"
              onClick={() => {
                setFindOpen(!findOpen)
                setAssistantOpen(false)
              }}
              aria-pressed={findOpen}
              title="Search the image library and Published passages by words or a photo"
            >
              {findOpen ? <PanelRightClose className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              Find images and passages
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto border-b bg-muted/30 px-3" role="tablist" aria-label="Training builder">
            {TABS.map((t, i) => {
              const locked = noSource && t.value !== "source" && t.value !== "signals"
              const disabled = locked || (t.value === "signals" && !(trainingId && hasLive))
              const warn = tabChecks(t.value)
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.value}
                  disabled={disabled}
                  title={
                    locked
                      ? "Pick a Published document first"
                      : disabled
                        ? "Available once the Training is published and people have done it"
                        : warn.length > 0
                          ? warn.map((c) => c.text).join("\n")
                          : undefined
                  }
                  onClick={() => setTab(t.value)}
                  className={cn(
                    "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors disabled:opacity-40",
                    tab === t.value
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  {locked ? <Lock className="h-3.5 w-3.5" /> : <t.icon className="h-4 w-4" />}
                  {t.label}
                  {!locked && !starting && warn.length > 0 && (
                    <span className="ml-0.5 inline-flex h-5 items-center rounded-full bg-amber-100 px-1.5 text-xs font-medium text-amber-900 dark:bg-amber-500/20 dark:text-amber-100">
                      Needs: {warn[0].short ?? "a fix"}
                      {warn.length > 1 && ` +${warn.length - 1}`}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Body */}
          <div className={cn("grid min-h-0 flex-1", (assistantOpen || findOpen) && "lg:grid-cols-[minmax(0,1fr)_400px]")}>
            <div
              className={cn("min-h-0 overflow-y-auto p-5 transition-opacity", session.phase === "asking" && "pointer-events-none opacity-60")}
              aria-busy={session.phase === "asking"}
              role="tabpanel"
            >
              <div className="mx-auto max-w-6xl">
                {tab === "source" && starting && (
                  <StartScreen
                    draft={draft}
                    onChange={setDraft}
                    options={options}
                    kindLocked={kindLocked}
                    onLockKind={() => setKindLocked(true)}
                    onDraft={startWithAssistant}
                    onManual={() => setSkipStart(true)}
                  />
                )}
                {tab === "source" && !starting && (
                  <SourceTab
                    draft={draft}
                    onChange={setDraft}
                    changed={changed}
                    options={options}
                    trainingId={trainingId}
                    findings={findings}
                    version={version}
                    kindLocked={kindLocked}
                    onLockKind={() => setKindLocked(true)}
                    onAskAssistant={() => setAssistantOpen(true)}
                  />
                )}
                {tab === "breakdown" && (
                  <JobBreakdownEditor draft={draft} onChange={setDraft} aiChanged={changed.has(F.breakdown)} />
                )}
                {tab === "questions" && (
                  <QuestionBankEditor draft={draft} onChange={setDraft} aiChanged={changed.has(F.bank)} docInfo={docInfo} />
                )}
                {tab === "tryout" && <TryOutTab draft={draft} onChange={setDraft} />}
                {tab === "people" && (
                  <PeopleTab draft={draft} onChange={setDraft} catalogue={catalogue} authorId={author} />
                )}
                {tab === "preview" && (
                  <TrainingPreview draft={draft} docInfo={docInfo} onGoToQuestions={() => setTab("questions")} />
                )}
                {tab === "signals" && trainingId && (
                  <StillOnPointPanel
                    trainingId={trainingId}
                    objectives={draft.objectives.map((o) => ({
                      id: o.id,
                      text: o.text,
                      documentId: o.documentId,
                      namingCode: docInfo.get(String(o.documentId))?.namingCode ?? "the source",
                    }))}
                    onOpenQuestions={() => setTab("questions")}
                  />
                )}
              </div>
            </div>
            {findOpen && (
              <aside className="hidden min-h-0 flex-col border-l lg:flex" aria-label="Find images and passages">
                <KnowledgeSearchPanel
                  className="min-h-0 flex-1"
                  onClose={() => setFindOpen(false)}
                  areaCodes={draft.area ? [draft.area] : undefined}
                  passageActionLabel="Add as objective"
                  imageHint="Images of the source Documents can be put on questions in the Questions tab."
                  onInsertPassage={(p) => {
                    if (draft.objectives.some((o) => o.chunkId === p.chunkId)) {
                      toast.info("That passage is already a Learning objective.")
                      return
                    }
                    let n = draft.objectives.length + 1
                    while (draft.objectives.some((o) => o.id === `o${n}`)) n += 1
                    setDraft({
                      ...draft,
                      objectives: [
                        ...draft.objectives,
                        { id: `o${n}`, text: "", documentId: p.documentId, chunkId: p.chunkId, quote: p.text },
                      ],
                      documentIds: draft.documentIds.includes(p.documentId)
                        ? draft.documentIds
                        : [...draft.documentIds, p.documentId],
                    })
                    setSkipStart(true)
                    setTab("source")
                    toast.success(`Added from ${p.namingCode}. Write what the person must know or do.`)
                  }}
                />
              </aside>
            )}
            {assistantOpen && (
              <aside className="hidden min-h-0 flex-col border-l bg-muted/20 lg:flex" aria-label="Assistant">
                <div className="flex items-center gap-1.5 border-b px-4 py-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Assistant</span>
                  <span className="text-xs text-muted-foreground">· drafts objectives from Published passages</span>
                </div>
                <GuidedConversation session={session} examples={editing ? [] : EXAMPLES} className="min-h-0 flex-1" />
              </aside>
            )}
          </div>

          {/* Status strip: what the Training is, in one line. */}
          {!starting && (
            <div className="truncate border-t bg-muted/30 px-5 py-1.5" aria-live="polite">
              {summary}
            </div>
          )}

          {/* Footer: what is left to fix, Save draft, and the one primary. */}
          <div className="flex items-center gap-3 border-t bg-background px-5 py-3">
            <div className="min-w-0 flex-1">
              {session.createError ? (
                <p className="text-sm text-destructive" role="alert">
                  {session.createError}
                </p>
              ) : starting ? (
                <p className="text-sm text-muted-foreground">
                  {draft.documentIds.length === 0
                    ? "Pick a Published document to begin. The other tabs open once it is chosen."
                    : "Say who it is for, then let the assistant draft it, or fill it in yourself."}
                </p>
              ) : checks.length > 0 ? (
                <ToFixList checks={checks} onGo={(t) => setTab(t)} />
              ) : (
                <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                  <CircleCheck className="h-4 w-4" />
                  Ready for review. Nothing is published until another Engineer approves it.
                </p>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => void saveDraft()}
              disabled={Boolean(saveBlock) || busy || (editing && unchanged)}
              title={saveBlock ? `First: ${saveBlock.text}` : editing && unchanged ? "Nothing changed since the last save" : undefined}
            >
              {session.phase === "creating" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save draft
            </Button>
            <SendForReview
              people={catalogue?.people ?? []}
              excludeId={author}
              value={reviewerFor}
              onChange={setReviewer}
              blocked={reviewBlock}
              busy={busy}
              onSend={() => void sendForReview()}
            />
          </div>
        </DialogContent>
      </Dialog>

      <DiscardDraftDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        onDiscard={() => {
          setConfirmClose(false)
          session.cancelPending()
          onOpenChange(false)
        }}
        description={
          editing
            ? "Your changes since the last save will be lost. The saved draft stays as it is."
            : "The conversation and the draft will be lost. Nothing has been created or saved."
        }
      />
    </>
  )
}

const TAB_LABEL = Object.fromEntries(TABS.map((t) => [t.value, t.label])) as Record<BuilderTab, string>

/** "2 to fix before Send for review": opens the list, each item jumps to its tab. */
function ToFixList({ checks, onGo }: { checks: BuilderCheck[]; onGo: (t: BuilderTab) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-to-fix
          className="flex max-w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-sm text-amber-800 dark:text-amber-300 [@media(hover:hover)]:hover:bg-amber-50 dark:[@media(hover:hover)]:hover:bg-amber-500/10"
        >
          <CircleAlert className="h-4 w-4 shrink-0" />
          <span className="font-semibold">{checks.length} to fix</span>
          <span className="truncate text-muted-foreground">before Send for review. First: {checks[0].text}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[420px] p-2">
        <p className="px-2 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">Before Send for review</p>
        <ul className="space-y-0.5">
          {checks.map((c, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  onGo(c.tab)
                  setOpen(false)
                }}
                className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm [@media(hover:hover)]:hover:bg-muted"
              >
                <CircleAlert className={cn("mt-0.5 h-4 w-4 shrink-0", c.blocksSave ? "text-red-600" : "text-amber-600")} />
                <span className="min-w-0 flex-1">{c.text}</span>
                <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary-strong">
                  {TAB_LABEL[c.tab]} <ArrowRight className="h-3 w-3" />
                </span>
              </button>
            </li>
          ))}
        </ul>
        {checks.some((c) => c.blocksSave) && (
          <p className="px-2 pt-1.5 text-xs text-muted-foreground">Red items also block Save draft.</p>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The one primary: Send for review. It asks who reviews it (an Engineer,
 * never the author) in a small popover, then sends.
 */
function SendForReview({
  people,
  excludeId,
  value,
  onChange,
  blocked,
  busy,
  onSend,
}: {
  people: { _id: Id<"people">; name: string; role: string; kind: "operator" | "engineer" | "admin" }[]
  excludeId: Id<"people"> | null
  value: Id<"people"> | null
  onChange: (id: Id<"people"> | null) => void
  blocked: BuilderCheck | null
  busy: boolean
  onSend: () => void
}) {
  const [open, setOpen] = useState(false)
  const engineers = people.filter((p) => isEngineerOrAdmin(p) && p._id !== excludeId)
  const chosen = engineers.find((p) => p._id === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          className="gap-1.5"
          disabled={Boolean(blocked) || busy}
          title={blocked ? `First: ${blocked.text}` : undefined}
          data-send-review
        >
          <Send className="h-4 w-4" /> Send for review
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" side="top">
        <Command>
          <CommandInput placeholder="Who reviews it? Search Engineers" />
          <CommandList>
            <CommandEmpty>No other Engineer found.</CommandEmpty>
            <CommandGroup heading="Reviewer (not the author)">
              {engineers.map((p) => (
                <CommandItem key={p._id} value={`${p.name} ${p.role}`} onSelect={() => onChange(p._id)}>
                  <Check className={cn("mr-2 h-4 w-4", value === p._id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{p.name}</span>
                  <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">{p.role}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="border-t p-2">
          <Button
            className="w-full gap-1.5"
            disabled={!chosen || busy}
            onClick={() => {
              setOpen(false)
              onSend()
            }}
          >
            <Send className="h-4 w-4" />
            {chosen ? `Send to ${chosen.name}` : "Pick a reviewer above"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The first screen of a new Training: one choice, which Published document,
 * then one line of purpose. The assistant drafts title, area and objectives
 * from that; or the Engineer fills the form in.
 */
function StartScreen({
  draft,
  onChange,
  options,
  kindLocked,
  onLockKind,
  onDraft,
  onManual,
}: {
  draft: TrainingDraft
  onChange: (d: TrainingDraft) => void
  options: Options | undefined
  kindLocked: boolean
  onLockKind: () => void
  onDraft: (purpose: string) => void
  onManual: () => void
}) {
  const docs = options?.documents ?? []
  const chosen = draft.documentIds.map((id) => docs.find((d) => d._id === id)).filter((d): d is NonNullable<typeof d> => !!d)
  const [purpose, setPurpose] = useState(draft.purpose)
  const pick = (id: Id<"documents">) => {
    const d = docs.find((x) => x._id === id)
    onChange({
      ...draft,
      documentIds: [id],
      title: draft.title || (d ? d.title : ""),
      area: draft.area ?? d?.area ?? null,
    })
  }
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4" data-start-screen>
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs text-primary-strong">1</span>
          Which Published document is this about?
        </h3>
        {chosen.length > 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
            <FileText className="h-5 w-5 shrink-0 text-primary-strong" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{chosen[0].title}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {chosen[0].namingCode} v{chosen[0].version}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => onChange({ ...draft, documentIds: [] })}>
              Change
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Command>
              <CommandInput placeholder="Search Published documents by code or title" autoFocus />
              <CommandList className="max-h-[320px]">
                <CommandEmpty>No Published document found. Trainings come only from Published documents.</CommandEmpty>
                <CommandGroup>
                  {docs.map((d) => (
                    <CommandItem key={d._id} value={`${d.namingCode} ${d.title}`} onSelect={() => pick(d._id)} className="gap-2 py-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="w-40 shrink-0 font-mono text-xs text-muted-foreground">{d.namingCode}</span>
                      <span className="truncate">{d.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        )}
      </section>

      <section className={cn("space-y-3", chosen.length === 0 && "pointer-events-none opacity-40")} aria-disabled={chosen.length === 0}>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs text-primary-strong">2</span>
          Who is it for, and what must they be able to do?
        </h3>
        <Input
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && chosen.length > 0) {
              onChange({ ...draft, purpose })
              onDraft(purpose)
            }
          }}
          placeholder="e.g. New line 2 operators start the line after a stop, safely and without scrap"
          aria-label="Goal in one line"
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5" role="group" aria-label="Kind">
            {(["course", "round"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={draft.kind === k}
                onClick={() => {
                  onChange({ ...draft, kind: k, stops: k === "round" ? draft.stops : [] })
                  onLockKind()
                }}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
                  draft.kind === k ? "border-primary bg-primary/10 font-medium text-primary-strong" : "bg-background",
                )}
              >
                <KindIcon kind={k} className="h-4 w-4" />
                {k === "course" ? "Training" : "Round in the plant"}
              </button>
            ))}
            {kindLocked && <Lock className="mt-2.5 h-3.5 w-3.5 text-muted-foreground" aria-label="The assistant keeps this choice" />}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            className="gap-1.5"
            disabled={chosen.length === 0}
            onClick={() => {
              onChange({ ...draft, purpose })
              onDraft(purpose)
            }}
            data-draft-with-assistant
          >
            <Sparkles className="h-4 w-4" /> Draft title and objectives
          </Button>
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-2 [@media(hover:hover)]:hover:underline"
            onClick={() => {
              onChange({ ...draft, purpose })
              onManual()
            }}
          >
            Fill it in myself
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          The assistant reads the passages of the document and proposes the objectives, each traced to a passage. You check and
          edit everything before it goes for review.
        </p>
      </section>
    </div>
  )
}

// ---- Tab 1: Source and goal -------------------------------------------------------

type Options = NonNullable<FunctionReturnType<typeof api.trainings.draftOptions>>

function SourceTab({
  draft,
  onChange,
  changed,
  options,
  trainingId,
  findings: findingsByObjective,
  version,
  kindLocked,
  onLockKind,
  onAskAssistant,
}: {
  draft: TrainingDraft
  onChange: (d: TrainingDraft) => void
  changed: ReadonlySet<string>
  options: Options | undefined
  trainingId?: Id<"trainings">
  findings: ObjectiveFindings
  version: number
  kindLocked: boolean
  onLockKind: () => void
  onAskAssistant: () => void
}) {
  const docById = useMemo(() => new Map((options?.documents ?? []).map((d) => [d._id, d])), [options])
  const set = (patch: Partial<TrainingDraft>) => onChange({ ...draft, ...patch })
  const nextId = () => {
    let n = draft.objectives.length + 1
    while (draft.objectives.some((o) => o.id === `o${n}`)) n += 1
    return `o${n}`
  }
  const move = (i: number, d: -1 | 1) => {
    const next = [...draft.objectives]
    const [o] = next.splice(i, 1)
    next.splice(i + d, 0, o)
    set({ objectives: next })
  }
  const all = useQuery(api.trainings.list, {})
  const codes = draft.documentIds.map((id) => docById.get(id)?.namingCode).filter((c): c is string => !!c)
  const duplicates = (all ?? []).filter(
    (t) => t._id !== trainingId && t.status !== "archived" && t.documentCodes.some((c) => codes.includes(c)),
  )

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="trn-title" className="flex items-center gap-1.5">
            Title {changed.has(F.title) && <JustChanged />}
          </Label>
          <Input
            id="trn-title"
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="e.g. Line 2 changeover"
            className={cn(changed.has(F.title) && "border-primary/60")}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              Kind {changed.has(F.kind) && <JustChanged />}
              {kindLocked && (
                <span className="inline-flex items-center gap-0.5 text-xs font-normal text-muted-foreground" title="The assistant keeps this choice">
                  <Lock className="h-3 w-3" /> kept
                </span>
              )}
            </p>
            <div className="flex gap-1.5" role="group" aria-label="Kind">
              {(["course", "round"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={draft.kind === k}
                  onClick={() => {
                    set({ kind: k, stops: k === "round" ? draft.stops : [] })
                    onLockKind()
                  }}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
                    draft.kind === k ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/50",
                  )}
                >
                  <KindIcon kind={k} className="h-4 w-4" />
                  {k === "course" ? "Training" : "Round"}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {draft.kind === "course" ? "Done at a desk or on a phone." : "Walked in the plant: scan each Asset in order."}
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              Area {changed.has(F.area) && <JustChanged />}
            </p>
            <Select value={draft.area ?? ""} onValueChange={(v) => set({ area: v || null })}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Choose an area" />
              </SelectTrigger>
              <SelectContent>
                {(options?.areas ?? []).map((a) => (
                  <SelectItem key={a.code} value={a.code}>
                    <span className="font-mono">{a.code}</span> {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!trainingId && (
              <p className="text-xs text-muted-foreground">Sets the code prefix: {draft.area ?? "AREA"}-TRN</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="trn-purpose" className="flex items-center gap-1.5">
            Goal: who is it for, and what must they be able to do? {changed.has(F.purpose) && <JustChanged />}
          </Label>
          <Textarea
            id="trn-purpose"
            value={draft.purpose}
            onChange={(e) => set({ purpose: e.target.value })}
            placeholder="e.g. New line 2 operators can start the line after a stop, safely and without scrap."
            rows={3}
            className={cn("resize-none", changed.has(F.purpose) && "border-primary/60")}
          />
        </div>

        <DocumentChips
          options={options?.documents ?? []}
          selected={draft.documentIds}
          aiChanged={changed.has(F.documents)}
          onChange={(documentIds) => set({ documentIds })}
        />

        {duplicates.length > 0 && (
          <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            <p className="flex items-start gap-1.5 font-medium">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Already trained from the same documents
            </p>
            <ul className="space-y-0.5 pl-6">
              {duplicates.slice(0, 4).map((t) => (
                <li key={t._id}>
                  <Link href={`/learn/trainings/${t._id}`} className="font-mono text-xs font-medium underline-offset-2 hover:underline">
                    {t.code}
                  </Link>{" "}
                  {t.title}
                </li>
              ))}
            </ul>
            <p className="pl-6 text-xs">Open it and start a new version, or carry on if this Training has another goal.</p>
          </div>
        )}

        {version > 1 && (
          <div className="space-y-1.5">
            <Label htmlFor="trn-change">What changed in v{version}, and why</Label>
            <Textarea
              id="trn-change"
              value={draft.changeNote}
              onChange={(e) => set({ changeNote: e.target.value })}
              rows={2}
              placeholder="e.g. Purge time follows EXT-OPS-SOP-0001 v3: 5 minutes instead of 3."
              className="resize-none"
            />
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-2 rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                Learning objectives {changed.has(F.objectives) && <JustChanged />}
              </p>
              <p className="text-xs text-muted-foreground">
                Each is tested in every Attempt and traces to a Published passage. Name the action, not the value.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={onAskAssistant}>
                <Wand2 className="h-4 w-4" /> Ask the assistant
              </Button>
              <PassagePicker
                documents={options?.documents ?? []}
                preferred={draft.documentIds[0] ?? draft.objectives.at(-1)?.documentId ?? null}
                onPick={(p) =>
                  set({
                    objectives: [...draft.objectives, { id: nextId(), text: "", ...p }],
                    documentIds: draft.documentIds.includes(p.documentId) ? draft.documentIds : [...draft.documentIds, p.documentId],
                  })
                }
              >
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Plus className="h-4 w-4" /> Add objective
                </Button>
              </PassagePicker>
            </div>
          </div>
          {draft.objectives.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No objectives yet. Describe the Training to the assistant, or add one from a Published passage.
            </p>
          ) : (
            <ol className="space-y-2">
              {draft.objectives.map((o, i) => {
                const doc = docById.get(o.documentId)
                const open = findingsByObjective.get(o.id) ?? []
                return (
                  <li
                    key={o.id}
                    className={cn(
                      "space-y-2 rounded-md border p-2.5",
                      open.some((f) => !f.acked) ? "border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/5" : "bg-muted/20",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-2 w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                      <Textarea
                        value={o.text}
                        onChange={(e) =>
                          set({ objectives: draft.objectives.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })
                        }
                        placeholder="What must the person do? e.g. Tighten the die bolts to the right torque"
                        rows={2}
                        aria-label={`Learning objective ${i + 1}`}
                        className="min-h-[56px] resize-none text-sm"
                      />
                      <div className="flex shrink-0">
                        <IconBtn label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                          <ArrowUp className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn label="Move down" disabled={i === draft.objectives.length - 1} onClick={() => move(i, 1)}>
                          <ArrowDown className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          label={`Remove objective ${i + 1}`}
                          danger
                          onClick={() =>
                            set({
                              objectives: draft.objectives.filter((x) => x.id !== o.id),
                              stops: draft.stops.map((s) => ({ ...s, objectiveIds: s.objectiveIds.filter((x) => x !== o.id) })),
                              breakdown: draft.breakdown.map((r) => ({ ...r, objectiveIds: r.objectiveIds.filter((x) => x !== o.id) })),
                              questionBank: draft.questionBank.filter((q) => q.objectiveId !== o.id),
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </div>
                    <div className="ml-7 flex flex-wrap items-start gap-2 text-xs text-muted-foreground">
                      <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {doc ? (
                        <SourceChip documentId={o.documentId} namingCode={doc.namingCode} version={doc.version} quote={o.quote} />
                      ) : (
                        <span className="font-mono">Not published</span>
                      )}
                      <span className="line-clamp-2 min-w-0 flex-1 italic">"{o.quote}"</span>
                      <PassagePicker
                        documents={options?.documents ?? []}
                        preferred={o.documentId}
                        onPick={(p) =>
                          set({
                            objectives: draft.objectives.map((x) => (x.id === o.id ? { ...x, ...p } : x)),
                            documentIds: draft.documentIds.includes(p.documentId) ? draft.documentIds : [...draft.documentIds, p.documentId],
                          })
                        }
                      >
                        <button type="button" className="shrink-0 font-medium text-primary hover:underline">
                          Pick a passage
                        </button>
                      </PassagePicker>
                    </div>
                    <label className="ml-7 flex w-fit cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={Boolean(o.critical)}
                        onChange={() =>
                          set({ objectives: draft.objectives.map((x) => (x.id === o.id ? { ...x, critical: !x.critical } : x)) })
                        }
                        className="h-4 w-4 accent-red-600"
                      />
                      <ShieldAlert className={cn("h-3.5 w-3.5", o.critical ? "text-red-600" : "text-muted-foreground")} />
                      Must be right (a wrong answer fails the Attempt)
                    </label>
                    {open.map((f) => (
                      <FindingMarker key={f.findingId} trainingId={trainingId} objectiveId={o.id} finding={f} />
                    ))}
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        {draft.kind === "round" && (
          <StopsEditor draft={draft} assets={options?.assets ?? []} aiChanged={changed.has(F.stops)} onChange={(stops) => set({ stops })} />
        )}
      </div>
    </div>
  )
}

/** An open contradiction Finding on the cited passage: settle it, or keep it with a reason. */
type ObjectiveFindings = Map<
  string,
  { findingId: Id<"findings">; summary: string; otherCode: string; acked: { reason: string } | null }[]
>

function FindingMarker({
  trainingId,
  objectiveId,
  finding: f,
}: {
  trainingId: Id<"trainings"> | undefined
  objectiveId: string
  finding: {
    findingId: Id<"findings">
    summary: string
    otherCode: string
    acked: { reason: string } | null
  }
}) {
  const ack = useMutation(api.trainings.ackFinding)
  const { person } = useCheckIn()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  if (f.acked) {
    return (
      <p className="ml-7 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
        Checked and kept despite the open contradiction with {f.otherCode}: "{f.acked.reason}"
      </p>
    )
  }
  return (
    <div className="ml-7 space-y-1.5 text-xs text-amber-950 dark:text-amber-100">
      <p className="flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span>
          Open contradiction with <span className="font-mono">{f.otherCode}</span>: {f.summary}{" "}
          <Link href={`/library/findings?id=${f.findingId}`} className="font-medium underline-offset-2 hover:underline">
            Settle the Finding
          </Link>
        </span>
      </p>
      {!trainingId ? (
        <p className="text-muted-foreground">Create the draft first, then you can tick "I checked this, keep it" with a reason.</p>
      ) : open ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why the passage can stay as it is"
            className="h-8 min-w-[260px] flex-1 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy || reason.trim().length < 10 || !isEngineerOrAdmin(person)}
            onClick={async () => {
              if (!person || !trainingId) return
              setBusy(true)
              try {
                await ack({ id: trainingId, personId: person._id, objectiveId, findingId: f.findingId, reason })
                setOpen(false)
              } catch (err) {
                toast.error(errorText(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            Keep it
          </Button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="font-medium text-primary hover:underline">
          I checked this, keep it
        </button>
      )}
    </div>
  )
}

// ---- Tab 4: Try-out and refresher ----------------------------------------------------

function TryOutTab({ draft, onChange }: { draft: TrainingDraft; onChange: (d: TrainingDraft) => void }) {
  const safety = hasSafety(draft)
  const tryOut = draft.tryOut ?? { required: false, checklist: [] }
  const required = tryOut.required || safety
  const setTryOut = (p: Partial<{ required: boolean; checklist: string[] }>) =>
    onChange({ ...draft, tryOut: { ...tryOut, required, ...p } })
  const total = questionCount(draft)
  const critical = draft.objectives.filter((o) => o.critical).length

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="space-y-4 rounded-lg border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Try-out at the line</h3>
            <p className="text-sm text-muted-foreground">
              After passing the questions, the Operator does the job while a trainer watches and ticks the checklist on
              the phone. Only then does the Skill rise to level 2, Can do it.
            </p>
          </div>
          <Switch
            checked={required}
            disabled={safety}
            onCheckedChange={(c) => setTryOut({ required: c, checklist: tryOut.checklist.length ? tryOut.checklist : checklistFromBreakdown(draft.breakdown) })}
            aria-label="Try-out required"
          />
        </div>
        {safety && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Stays on: the breakdown has a safety key point.
          </p>
        )}
        {required && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Checklist for the trainer</p>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={draft.breakdown.length === 0}
                title={draft.breakdown.length === 0 ? "Make the Job breakdown first" : undefined}
                onClick={() => setTryOut({ checklist: checklistFromBreakdown(draft.breakdown) })}
              >
                <ClipboardCheck className="h-4 w-4" /> Build from the breakdown
              </Button>
            </div>
            {tryOut.checklist.length === 0 && (
              <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                No checklist yet. Build it from the breakdown, or add items.
              </p>
            )}
            <ol className="space-y-1.5">
              {tryOut.checklist.map((item, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <Input
                    value={item}
                    onChange={(e) => setTryOut({ checklist: tryOut.checklist.map((x, j) => (j === i ? e.target.value : x)) })}
                    className="h-9 text-sm"
                    aria-label={`Checklist item ${i + 1}`}
                  />
                  <IconBtn label={`Remove item ${i + 1}`} danger onClick={() => setTryOut({ checklist: tryOut.checklist.filter((_, j) => j !== i) })}>
                    <X className="h-4 w-4" />
                  </IconBtn>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setTryOut({ checklist: [...tryOut.checklist, ""] })}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Item
            </button>
          </div>
        )}
      </section>

      <section className="space-y-5 rounded-lg border p-4">
        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold">Pass mark</h3>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={50}
              max={100}
              step={5}
              value={draft.passMark}
              onChange={(e) => onChange({ ...draft, passMark: Math.max(50, Math.min(100, Number(e.target.value) || 80)) })}
              className="h-9 w-24"
              aria-label="Pass mark in percent"
            />
            <span className="text-sm text-muted-foreground">% of the questions right</span>
          </div>
          <p className="text-sm">
            The Operator reads: <span className="font-medium">{passRuleText(total, draft.passMark, critical)}</span>
          </p>
          {critical > 0 && (
            <p className="text-xs text-muted-foreground">
              {critical} must-be-right {critical === 1 ? "objective" : "objectives"}: a wrong answer there fails the Attempt whatever the score.
            </p>
          )}
        </div>

        {draft.questionBank.length === 0 && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold">Questions per objective</h3>
            <Select value={String(draft.questionsPerObjective)} onValueChange={(v) => onChange({ ...draft, questionsPerObjective: Number(v) })}>
              <SelectTrigger className="h-9 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Used while there is no question bank: each Attempt writes fresh questions.</p>
          </div>
        )}

        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold">Refresher</h3>
          <Select
            value={draft.refreshMonths == null ? "none" : String(draft.refreshMonths)}
            onValueChange={(v) => onChange({ ...draft, refreshMonths: v === "none" ? null : Number(v) })}
          >
            <SelectTrigger className="h-9 w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No refresher</SelectItem>
              {[6, 12, 18, 24, 36].map((m) => (
                <SelectItem key={m} value={String(m)}>
                  After {m} months
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Before the level expires, people get a short refresher of 3 to 5 questions from the must-be-right objectives.
            Passing it keeps their level, with no new sign-off.
          </p>
        </div>
      </section>
    </div>
  )
}

// ---- Tab 5: People ----------------------------------------------------------------

function PeopleTab({
  draft,
  onChange,
  catalogue,
  authorId,
}: {
  draft: TrainingDraft
  onChange: (d: TrainingDraft) => void
  catalogue: ReturnType<typeof useCatalogue>
  authorId: Id<"people"> | null
}) {
  const skills = catalogue?.skills ?? []
  const suggested = skills.filter((s) => !draft.skillIds.includes(s._id) && s.documentIds.some((d) => draft.documentIds.includes(d)))
  const others = skills.filter((s) => !draft.skillIds.includes(s._id) && !suggested.includes(s))
  const [pick, setPick] = useState(false)
  const defaultDueDays = useQuery(api.orgSettings.get)?.training.dueDays ?? 14
  const audience = draft.audience ?? { profileIds: [], personIds: [], dueDays: defaultDueDays }
  const setAudience = (p: Partial<typeof audience>) => onChange({ ...draft, audience: { ...audience, ...p } })
  const setSkills = (skillIds: Id<"skills">[]) => {
    // A Skill with a validity sets the refresher by default.
    const withValidity = skills.find((s) => skillIds.includes(s._id) && s.validityMonths)
    onChange({
      ...draft,
      skillIds,
      refreshMonths: draft.refreshMonths ?? (withValidity ? 12 : null),
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="space-y-3 rounded-lg border p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Skills it proves</h3>
          <p className="text-sm text-muted-foreground">
            Passing raises these Skills to level 1, Knows it. A try-out takes them to level 2, Can do it. Only the Skills
            listed here count.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {draft.skillIds.map((id) => {
            const s = skills.find((x) => x._id === id)
            return (
              <span key={id} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 text-sm">
                Counts towards: {s?.name ?? "Unknown Skill"}
                <button
                  type="button"
                  aria-label={`Remove ${s?.name ?? "Skill"}`}
                  onClick={() => setSkills(draft.skillIds.filter((x) => x !== id))}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            )
          })}
          {draft.skillIds.length === 0 && <p className="text-sm text-muted-foreground">No Skill yet.</p>}
        </div>
        {suggested.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Suggested: these Skills use the same documents</p>
            <div className="flex flex-wrap gap-1.5">
              {suggested.map((s) => (
                <button
                  key={s._id}
                  type="button"
                  onClick={() => setSkills([...draft.skillIds, s._id])}
                  className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed px-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <Popover open={pick} onOpenChange={setPick}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5">
              Another Skill <ChevronsUpDown className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search Skills" />
              <CommandList>
                <CommandEmpty>No Skill found.</CommandEmpty>
                <CommandGroup>
                  {others.map((s) => (
                    <CommandItem
                      key={s._id}
                      value={s.name}
                      onSelect={() => {
                        setSkills([...draft.skillIds, s._id])
                        setPick(false)
                      }}
                    >
                      {s.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </section>

      <section className="space-y-4 rounded-lg border p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Who must do it</h3>
          <p className="text-sm text-muted-foreground">
            When the Training is published, these people get it on Home and on the phone, with a due date.
          </p>
        </div>
        <AudiencePicker
          catalogue={catalogue}
          profileIds={audience.profileIds}
          personIds={audience.personIds}
          excludePersonIds={authorId ? [authorId] : []}
          onChange={(n) => setAudience(n)}
        />
        <div className="flex items-center gap-2">
          <Label htmlFor="trn-due" className="text-sm">
            Due
          </Label>
          <Input
            id="trn-due"
            type="number"
            min={1}
            max={365}
            value={audience.dueDays}
            onChange={(e) => setAudience({ dueDays: Math.max(1, Math.min(365, Number(e.target.value) || defaultDueDays)) })}
            className="h-9 w-20"
          />
          <span className="text-sm text-muted-foreground">days after publishing</span>
        </div>
        {draft.audience && (
          <Button size="sm" variant="ghost" onClick={() => onChange({ ...draft, audience: null })}>
            Nobody yet, I assign later
          </Button>
        )}
      </section>
    </div>
  )
}

// ---- Shared editors ----------------------------------------------------------------

function StopsEditor({
  draft,
  assets,
  aiChanged,
  onChange,
}: {
  draft: TrainingDraft
  assets: Options["assets"]
  aiChanged: boolean
  onChange: (stops: TrainingDraft["stops"]) => void
}) {
  const stops = draft.stops
  const used = new Set(stops.map((s) => s.assetId))
  const free = assets.filter((a) => !used.has(a._id))
  const patch = (i: number, p: Partial<TrainingDraft["stops"][number]>) =>
    onChange(stops.map((s, j) => (j === i ? { ...s, ...p } : s)))
  const move = (i: number, d: -1 | 1) => {
    const next = [...stops]
    const [s] = next.splice(i, 1)
    next.splice(i + d, 0, s)
    onChange(next)
  }
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-primary" /> Stops {aiChanged && <JustChanged />}
          </p>
          <p className="text-xs text-muted-foreground">The Assets to visit, in walking order, and what is tested at each.</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          disabled={free.length === 0}
          onClick={() => onChange([...stops, { assetId: free[0]._id, objectiveIds: [], hint: "", evidence: "none" }])}
        >
          <Plus className="h-4 w-4" /> Add stop
        </Button>
      </div>
      {stops.length === 0 && (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          No stops yet. A Round needs at least one Asset to walk to.
        </p>
      )}
      <ol className="space-y-2">
        {stops.map((s, i) => (
          <li key={`${s.assetId}-${i}`} className="space-y-2 rounded-md border bg-muted/20 p-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <Select value={s.assetId} onValueChange={(v) => patch(i, { assetId: v as Id<"assets"> })}>
                <SelectTrigger className="h-9 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assets
                    .filter((a) => a._id === s.assetId || !used.has(a._id))
                    .map((a) => (
                      <SelectItem key={a._id} value={a._id}>
                        <span className="font-mono">{a.code}</span> {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select value={s.evidence} onValueChange={(v) => patch(i, { evidence: v as "none" | "photo" | "note" })}>
                <SelectTrigger className="h-9 w-[140px]" aria-label="Evidence at this stop">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No evidence</SelectItem>
                  <SelectItem value="photo">Ask a photo</SelectItem>
                  <SelectItem value="note">Ask a note</SelectItem>
                </SelectContent>
              </Select>
              <IconBtn label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="h-4 w-4" />
              </IconBtn>
              <IconBtn label="Move down" disabled={i === stops.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown className="h-4 w-4" />
              </IconBtn>
              <IconBtn label={`Remove stop ${i + 1}`} danger onClick={() => onChange(stops.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </IconBtn>
            </div>
            <Input
              value={s.hint}
              onChange={(e) => patch(i, { hint: e.target.value })}
              placeholder="How to find it, e.g. at the end of line 2"
              className="h-9 text-sm"
              aria-label={`Hint for stop ${i + 1}`}
            />
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs text-muted-foreground">Tests objectives:</span>
              {draft.objectives.length === 0 && <span className="text-xs text-muted-foreground">none yet</span>}
              {draft.objectives.map((o, k) => {
                const on = s.objectiveIds.includes(o.id)
                return (
                  <button
                    key={o.id}
                    type="button"
                    title={o.text}
                    aria-pressed={on}
                    onClick={() => patch(i, { objectiveIds: on ? s.objectiveIds.filter((x) => x !== o.id) : [...s.objectiveIds, o.id] })}
                    className={cn(
                      "h-7 min-w-7 rounded-full border px-2 text-xs tabular-nums transition-colors",
                      on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/50",
                    )}
                  >
                    {k + 1}
                  </button>
                )
              })}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Choose a Published document, then one of its passages. */
function PassagePicker({
  documents,
  preferred,
  onPick,
  children,
}: {
  documents: Options["documents"]
  preferred: Id<"documents"> | null
  onPick: (p: { documentId: Id<"documents">; chunkId: Id<"chunks">; quote: string }) => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [docId, setDocId] = useState<Id<"documents"> | null>(null)
  const current = docId ?? preferred ?? documents[0]?._id ?? null
  const data = useQuery(api.trainings.passages, open && current ? { documentId: current } : "skip")
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setDocId(null)
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-[480px] p-0" align="end">
        <div className="border-b p-2">
          <Select value={current ?? ""} onValueChange={(v) => setDocId(v as Id<"documents">)}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Choose a Published document" />
            </SelectTrigger>
            <SelectContent>
              {documents.map((d) => (
                <SelectItem key={d._id} value={d._id}>
                  <span className="font-mono">{d.namingCode}</span> {d.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Command>
          <CommandInput placeholder="Search passages" />
          <CommandList className="max-h-80">
            <CommandEmpty>{data === undefined ? "Loading passages…" : "No passage matches."}</CommandEmpty>
            {data && (
              <CommandGroup heading={`${data.namingCode} v${data.version}, Published`}>
                {data.passages.map((p) => (
                  <CommandItem
                    key={p.chunkId}
                    value={`${p.section ?? ""} ${p.text}`}
                    onSelect={() => {
                      onPick({ documentId: data.documentId, chunkId: p.chunkId, quote: p.text })
                      setOpen(false)
                    }}
                    className="flex-col items-start gap-0.5 text-sm"
                  >
                    {p.section && <span className="text-xs text-muted-foreground">{p.section}</span>}
                    <span className="line-clamp-3">{p.text}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function DocumentChips({
  options,
  selected,
  aiChanged,
  onChange,
}: {
  options: Options["documents"]
  selected: Id<"documents">[]
  aiChanged: boolean
  onChange: (ids: Id<"documents">[]) => void
}) {
  const [open, setOpen] = useState(false)
  const byId = new Map(options.map((d) => [d._id, d]))
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        Source documents {aiChanged && <JustChanged />}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {selected.map((id) => {
          const d = byId.get(id)
          return (
            <span key={id} title={d?.title} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 text-sm">
              <FileText className="h-3.5 w-3.5 text-primary" />
              <span className="font-mono text-xs">{d?.namingCode ?? "Not published"}</span>
              <span className="max-w-[180px] truncate text-xs text-muted-foreground">{d?.title}</span>
              <button type="button" aria-label={`Remove ${d?.namingCode ?? "document"}`} onClick={() => onChange(selected.filter((x) => x !== id))}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )
        })}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed px-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
            >
              Add document <ChevronsUpDown className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-96 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search Published documents" />
              <CommandList>
                <CommandEmpty>No Published document found.</CommandEmpty>
                <CommandGroup>
                  {options.map((d) => (
                    <CommandItem
                      key={d._id}
                      value={`${d.namingCode} ${d.title}`}
                      onSelect={() => onChange(selected.includes(d._id) ? selected.filter((x) => x !== d._id) : [...selected, d._id])}
                    >
                      <Check className={cn("mr-1.5 h-4 w-4", selected.includes(d._id) ? "opacity-100" : "opacity-0")} />
                      <span className="font-mono text-xs text-muted-foreground">{d.namingCode}</span>
                      <span className="ml-1.5 truncate">{d.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <p className="text-xs text-muted-foreground">Only Published documents can be used. The assistant reads their passages.</p>
    </div>
  )
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30", danger && "hover:text-destructive")}
    >
      {children}
    </button>
  )
}

// ---- Loading an existing Training into the builder --------------------------------

/**
 * The working version of a Training as a builder Draft, or undefined while
 * loading. Combines trainings.get (objectives, stops) with
 * trainingBuilder.setup (breakdown, question bank, try-out, people).
 */
export function useTrainingDraft(trainingId: Id<"trainings"> | undefined): TrainingDraft | undefined | null {
  const data = useQuery(api.trainings.get, trainingId ? { id: trainingId } : "skip")
  const setup = useQuery(api.trainingBuilder.setup, trainingId ? { trainingId } : "skip")
  return useMemo(() => {
    if (data === undefined || setup === undefined) return undefined
    if (data === null || !data.current || setup === null) return null
    const c = data.current
    const s = setup.current
    const critical = new Set(s.critical)
    return {
      title: data.training.title,
      kind: data.training.kind,
      area: data.training.area,
      purpose: c.purpose,
      documentIds: Array.from(new Set(c.objectives.map((o) => o.documentId))),
      objectives: c.objectives.map((o) => ({
        id: o.id,
        text: o.text,
        documentId: o.documentId,
        chunkId: o.chunkId,
        quote: o.quote,
        ...(critical.has(o.id) ? { critical: true } : {}),
      })),
      stops: c.stops.map((x) => ({ assetId: x.assetId, objectiveIds: x.objectiveIds, hint: x.hint, evidence: x.evidence })),
      passMark: c.passMark,
      questionsPerObjective: c.questionsPerObjective,
      breakdown: (s.breakdown ?? []).map((r) => ({
        id: r.id,
        step: r.step,
        keyPoints: r.keyPoints,
        keyPointKinds: r.keyPoints.map((_, i) => r.keyPointKinds?.[i] ?? "quality"),
        reasons: r.reasons,
        objectiveIds: r.objectiveIds,
        ...(r.citation ? { citation: r.citation } : {}),
      })),
      questionBank: (s.questionBank ?? []).map((q) => ({
        id: q.id,
        objectiveId: q.objectiveId,
        kind: q.kind,
        prompt: q.prompt,
        options: q.options,
        correctIndex: q.correctIndex,
        keyPoints: q.keyPoints,
        modelAnswer: q.modelAnswer,
        explanation: q.explanation,
        whyWrong: q.whyWrong,
        source: q.source,
        stopIndex: q.stopIndex ?? null,
        imageId: q.imageId,
        answerByPhoto: q.answerByPhoto,
      })),
      tryOut: s.tryOut,
      refreshMonths: s.refreshMonths,
      audience: s.audience,
      skillIds: s.skillIds ?? [],
      changeNote: s.changeNote ?? "",
    } satisfies TrainingDraft
  }, [data, setup])
}


