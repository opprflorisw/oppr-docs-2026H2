import { useMemo, useState } from "react"
import { Link, useLocation, useParams } from "wouter"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  FileText,
  GraduationCap,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { Skeleton } from "@/components/ui/skeleton"
import { useCheckIn } from "@/lib/checkIn"
import { formatDate, formatDateTime } from "@/lib/time"
import { cn } from "@/lib/utils"
import { MakeDraftDialog } from "@/components/captures/MakeDraftDialog"
import { ConfirmDelete, DeskNotice } from "@/components/captures/DeskBits"
import { Avatar, MOMENT_META, StatusPill, errorText } from "@/components/captures/captureUi"
import { SetStatus } from "./CapturesPage"

type SetData = NonNullable<FunctionReturnType<typeof api.captures.sets.get>>
type Step = NonNullable<SetData["combined"]>["steps"][number]

const OMIT = "omit"

const VARIATION_LABEL = {
  different: { label: "Does it differently", tone: "border-amber-200 bg-amber-50 text-amber-900" },
  skipped: { label: "Skips it", tone: "border-slate-200 bg-slate-100 text-slate-700" },
  extra: { label: "Adds a step", tone: "border-sky-200 bg-sky-50 text-sky-800" },
} as const

/**
 * /library/capture-sets/:id: several Captures of one job combined into one
 * step list. For each step: which Captures support it, the Variations side by
 * side with a choice for the standard, and conflicts with Published Knowledge.
 */
export function CaptureSetPage() {
  const { id } = useParams<{ id: string }>()
  const [, navigate] = useLocation()
  const { person, people } = useCheckIn()
  const engineer = person?.kind === "engineer"
  const data = useQuery(api.captures.sets.get, person && engineer ? { setId: id as Id<"captureSets">, personId: person._id } : "skip")
  const combine = useMutation(api.captures.sets.combine)
  const remove = useMutation(api.captures.sets.remove)

  const [draftMode, setDraftMode] = useState<null | "draft" | "training">(null)
  // null: the default, "To decide" while anything is left to decide.
  const [onlyOpenChoice, setOnlyOpen] = useState<boolean | null>(null)
  const [busy, setBusy] = useState<null | "combine" | "delete">(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const crumbs = [
    { label: "Documents", href: "/library" },
    { label: "Capture sets", href: "/library/captures?tab=sets" },
    { label: data?.set.title ?? "Capture set" },
  ]

  if (people === undefined || (person && engineer && data === undefined)) {
    return (
      <div className="flex flex-col">
        <TopBar breadcrumb={crumbs} />
        <PageHeader icon={Layers} title="Capture set" />
        <div className="space-y-3 p-6">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  if (!person || !engineer || !data) {
    return (
      <div className="flex flex-col">
        <TopBar breadcrumb={crumbs} />
        <PageHeader icon={Layers} title="Capture set" />
        {!person || !engineer ? (
          <DeskNotice title="Check in as an Engineer" checkIn>
            Capture sets are Engineer work: deciding which way becomes the standard.
          </DeskNotice>
        ) : (
          <DeskNotice title="This Capture set no longer exists">
            <Link href="/library/captures?tab=sets" className="text-[#6E59A5] underline">
              Back to Capture sets
            </Link>
          </DeskNotice>
        )}
      </div>
    )
  }

  const s = data.set
  const combined = data.combined
  const steps = combined?.steps ?? []
  const decidable = steps.filter((st) => st.variations.length > 0 || st.conflict)
  const open = decidable.filter((st) => st.needsDecision)
  const authors = new Set(data.captures.map((c) => c.author?._id).filter(Boolean)).size
  const combining = s.status === "combining"
  const canCombine = data.captures.length >= 2 && data.notReady.length === 0 && !combining
  const combineBlocked = combining
    ? "Combining now."
    : data.captures.length < 2
      ? "A Capture set needs at least 2 Captures."
      : data.notReady.length > 0
        ? `${data.notReady.length} ${data.notReady.length === 1 ? "Capture is" : "Captures are"} not organized yet.`
        : null
  const draftBlocked = !combined ? "Combine the Captures first." : combining ? "Wait until combining has finished." : null

  async function doCombine() {
    setBusy("combine")
    try {
      await combine({ setId: s._id, personId: person!._id })
      toast.success("Combining. This takes about a minute.")
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  async function doDelete() {
    setBusy("delete")
    try {
      await remove({ setId: s._id, personId: person!._id })
      toast.success(`Deleted "${s.title}"`)
      navigate("/library/captures?tab=sets")
    } catch (err) {
      toast.error(errorText(err))
      setBusy(null)
    }
  }

  const onlyOpen = onlyOpenChoice ?? open.length > 0
  const shownSteps = onlyOpen ? steps.filter((st) => st.needsDecision) : steps
  const draft = data.drafts.find((d) => d.status !== "published") ?? data.drafts[0] ?? null
  const published = data.drafts.find((d) => d.status === "published") ?? null

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={crumbs} />
      <PageHeader
        icon={Layers}
        title={s.title}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <SetStatus status={s.status} />
            <span>
              {data.captures.length} Captures by {authors} {authors === 1 ? "person" : "people"}
            </span>
            {combined && <span>· combined {formatDateTime(combined.combinedAt)}</span>}
          </span>
        }
        primary={
          !combined
            ? {
                label: "Combine",
                icon: busy === "combine" || combining ? Loader2 : Sparkles,
                onClick: () => void doCombine(),
                disabled: !canCombine || busy === "combine",
                disabledReason: combineBlocked ?? undefined,
              }
            : draft
              ? { label: "Open the Draft", icon: FileText, href: `/docs/${draft._id}` }
              : {
                  label: "Make a Draft",
                  icon: FileText,
                  onClick: () => setDraftMode("draft"),
                  disabled: !!draftBlocked,
                  disabledReason: draftBlocked ?? undefined,
                }
        }
        secondary={
          combined
            ? [
                published
                  ? { label: "Make a Training", icon: GraduationCap, href: `/docs/${published._id}` }
                  : draft
                    ? {
                        label: "Make a Training",
                        icon: GraduationCap,
                        disabled: true,
                        disabledReason: "Publish the Draft first",
                      }
                    : {
                        label: "Make a Training",
                        icon: GraduationCap,
                        onClick: () => setDraftMode("training"),
                        disabled: !!draftBlocked,
                        disabledReason: draftBlocked ?? undefined,
                      },
              ]
            : []
        }
        menu={[
          ...(combined
            ? [
                {
                  label: "Combine again",
                  icon: RefreshCw,
                  onClick: () => void doCombine(),
                  disabled: !canCombine || busy === "combine",
                  disabledReason: combineBlocked ?? undefined,
                },
              ]
            : []),
          ...(combined && draft
            ? [{ label: "Make another Draft", icon: FileText, onClick: () => setDraftMode("draft"), disabled: !!draftBlocked }]
            : []),
          { label: "Delete Capture set", icon: Trash2, onClick: () => setDeleteOpen(true), destructive: true },
        ]}
      />

      <div className="mx-auto w-full max-w-6xl space-y-5 p-6">
        {combining && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <Loader2 className="h-4 w-4 animate-spin" />
            The AI is lining up the Captures and checking them against Published Knowledge.
          </div>
        )}
        {s.status === "failed" && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Combining did not work{s.error ? `: ${s.error}` : "."} Try Combine again.
            </p>
          </div>
        )}
        {data.notReady.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium">Waiting for {data.notReady.length === 1 ? "1 Capture" : `${data.notReady.length} Captures`} to be organized</p>
            <ul className="mt-1 space-y-0.5">
              {data.notReady.map((c) => (
                <li key={c._id}>
                  <Link href={`/library/captures/${c._id}`} className="underline">
                    {c.title}
                  </Link>{" "}
                  <StatusPill status={c.status} className="ml-1" />
                </li>
              ))}
            </ul>
          </div>
        )}
        {!combined && !combining && combineBlocked === null && (
          <p className="text-sm text-muted-foreground">Not combined yet. Choose Combine to see one step list and the Variations.</p>
        )}
        {draftBlocked && combined === null && combineBlocked && !combining && (
          <p className="text-sm text-muted-foreground">Combine: {combineBlocked}</p>
        )}

        {/* Captures in the set */}
        <section aria-label="Captures in this set" className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Captures in this set</h2>
            <span className="text-xs text-muted-foreground">Made {formatDate(s.createdAt)} by {data.createdByName}</span>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {data.captures.map((c) => (
              <li key={c._id}>
                <Link
                  href={`/library/captures/${c._id}`}
                  className="flex items-center gap-2.5 rounded-lg border px-2.5 py-2 hover:bg-muted/40"
                >
                  {c.author && <Avatar id={c.author._id} name={c.author.name} size="md" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.author?.name ?? "Unknown"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.title} · {c.handedInAt ? formatDate(c.handedInAt) : "not handed in"}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    {c.momentCount} {c.momentCount === 1 ? "Moment" : "Moments"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {combined && (
          <>
            <section className="rounded-xl border bg-card p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Summary by the AI
              </p>
              <p className="mt-1 text-sm">{combined.summary}</p>
            </section>

            {data.drafts.length > 0 && (
              <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm">
                <p className="font-medium">Drafts made from this set</p>
                <ul className="mt-1 space-y-1">
                  {data.drafts.map((d) => (
                    <li key={d._id} className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <Link href={`/docs/${d._id}`} className="font-mono font-medium text-[#6E59A5] hover:underline">
                        {d.namingCode}
                      </Link>
                      <span className="truncate">{d.title}</span>
                      <span className="text-xs text-muted-foreground">{d.status === "draft" ? "Draft" : d.status.replace("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Decisions bar */}
            <div className="sticky top-[118px] z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-background/95 px-4 py-2.5 backdrop-blur">
              <span className="text-sm font-semibold">{steps.length} {steps.length === 1 ? "step" : "steps"}</span>
              {decidable.length > 0 ? (
                <>
                  <div className="h-2 w-40 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${((decidable.length - open.length) / decidable.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold">
                    {open.length === 0
                      ? "All Variations decided"
                      : `${open.length} ${open.length === 1 ? "Variation" : "Variations"} left`}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {decidable.length - open.length} of {decidable.length} decided
                  </span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Everyone does it the same way.</span>
              )}
              <div className="ml-auto flex items-center gap-1 rounded-md border p-0.5 text-sm">
                <button
                  type="button"
                  onClick={() => setOnlyOpen(false)}
                  className={cn("rounded px-2.5 py-1", !onlyOpen ? "bg-muted font-medium" : "text-muted-foreground")}
                >
                  All steps
                </button>
                <button
                  type="button"
                  onClick={() => setOnlyOpen(true)}
                  className={cn("rounded px-2.5 py-1", onlyOpen ? "bg-muted font-medium" : "text-muted-foreground")}
                >
                  To decide ({open.length})
                </button>
              </div>
            </div>
            {open.length > 0 && (
              <p className="-mt-2 text-xs text-muted-foreground">
                Steps without a decision go into the Draft as open points for the reviewer.
              </p>
            )}

            <ol className="space-y-3">
              {shownSteps.map((st) => (
                <StepCard key={st.index} step={st} setId={s._id} personId={person._id} captures={data.captures} />
              ))}
              {shownSteps.length === 0 && (
                <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-emerald-600" />
                  Every Variation is decided. Make a Draft when you are ready.
                </li>
              )}
            </ol>
          </>
        )}
      </div>

      {draftMode && (
        <MakeDraftDialog
          open
          onOpenChange={(o) => !o && setDraftMode(null)}
          personId={person._id}
          setId={s._id}
          defaultTitle={s.job ?? s.title}
          forTraining={draftMode === "training"}
          blockedReason={draftBlocked}
        />
      )}
      <ConfirmDelete
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete the Capture set "${s.title}"?`}
        description="The combined step list and your decisions are deleted. The Captures themselves and any Drafts stay."
        action="Delete Capture set"
        busy={busy === "delete"}
        onConfirm={() => void doDelete()}
      />
    </div>
  )
}

// ---- One step ---------------------------------------------------------------------------

interface Option {
  key: string
  value: string
  label: React.ReactNode
  text: string
  hint?: string
}

function StepCard({
  step: st,
  setId,
  personId,
  captures,
}: {
  step: Step
  setId: Id<"captureSets">
  personId: Id<"people">
  captures: SetData["captures"]
}) {
  const decide = useMutation(api.captures.sets.decide)
  const [pending, setPending] = useState<string | null>(null)
  const meta = MOMENT_META[st.kind]
  const supportIds = new Set(st.supportedBy.map((c) => c._id as string))
  const authorOf = useMemo(() => new Map(captures.map((c) => [c._id as string, c.author])), [captures])
  const hasChoice = st.variations.length > 0 || !!st.conflict
  const decision = pending ?? st.decision ?? null

  const options: Option[] = []
  if (hasChoice) {
    const base = st.detail || st.title
    options.push({
      key: "base",
      value: base,
      text: base,
      label: (
        <span className="flex items-center gap-2">
          <span className="flex -space-x-1.5">
            {st.supportedBy.slice(0, 5).map((c) => {
              const a = authorOf.get(c._id)
              return <Avatar key={c._id} id={a?._id ?? c._id} name={a?.name ?? c.authorName} />
            })}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            The common way, {st.supportedBy.length} of {captures.length}
          </span>
        </span>
      ),
    })
    for (const [i, vr] of st.variations.entries()) {
      const a = authorOf.get(vr.captureId)
      const vl = VARIATION_LABEL[vr.kind]
      options.push({
        key: `v${i}`,
        value: vr.kind === "skipped" ? OMIT : vr.text,
        text: vr.text,
        label: (
          <span className="flex items-center gap-2">
            <Avatar id={a?._id ?? vr.captureId} name={a?.name ?? vr.capture?.authorName} />
            <span className="text-xs font-medium">{a?.name ?? vr.capture?.authorName ?? "A Capture"}</span>
            <span className={cn("rounded-full border px-1.5 py-0.5 text-xs", vl.tone)}>{vl.label}</span>
          </span>
        ),
      })
    }
    if (st.suggestion && !options.some((o) => o.value === st.suggestion)) {
      options.push({
        key: "ai",
        value: st.suggestion,
        text: st.suggestion,
        label: (
          <span className="flex items-center gap-1.5 text-xs font-medium text-[#6E59A5]">
            <Sparkles className="h-3.5 w-3.5" />
            Suggested by the AI
          </span>
        ),
      })
    }
    if (st.conflict && !options.some((o) => o.value === st.conflict!.quote)) {
      options.push({
        key: "published",
        value: st.conflict.quote,
        text: st.conflict.quote,
        label: (
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <BookOpenCheck className="h-3.5 w-3.5 text-emerald-700" />
            Keep the Published way ({st.conflict.namingCode})
          </span>
        ),
      })
    }
    // A decision typed elsewhere (or made before the set was combined again).
    if (st.decision && st.decision !== OMIT && !options.some((o) => o.value === st.decision)) {
      options.push({
        key: "custom",
        value: st.decision,
        text: st.decision,
        label: <span className="text-xs font-medium text-muted-foreground">Your decision</span>,
      })
    }
    if (!options.some((o) => o.value === OMIT)) {
      options.push({
        key: "omit",
        value: OMIT,
        text: "Leave this step out of the Draft.",
        label: <span className="text-xs font-medium text-muted-foreground">Leave it out</span>,
      })
    }
  }

  async function choose(value: string) {
    const next = decision === value ? "" : value
    setPending(next)
    try {
      await decide({ setId, personId, stepIndex: st.index, decision: next })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setPending(null)
    }
  }

  const missing = captures.filter((c) => !supportIds.has(c._id))
  const decided = !!st.decision
  const skippedBy = new Set(st.variations.filter((v) => v.kind === "skipped").map((v) => v.captureId as string))

  return (
    <li
      className={cn(
        "rounded-xl border bg-card",
        st.needsDecision && "border-amber-300",
        st.omitted && "opacity-60",
      )}
    >
      <div className="flex gap-3 p-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
          {st.index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {st.title}
                {st.kind !== "step" && (
                  <span className={cn("rounded-full border px-1.5 py-0.5 text-xs font-medium", meta.tone)}>{meta.label}</span>
                )}
                {st.omitted && <span className="rounded-full border px-1.5 py-0.5 text-xs font-normal">Left out</span>}
                {decided && !st.omitted && hasChoice && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
                    <CheckCircle2 className="h-3 w-3" />
                    Decided
                  </span>
                )}
                {st.needsDecision && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-900">To decide</span>
                )}
              </p>
              {st.detail && <p className="mt-0.5 text-sm text-muted-foreground">{st.detail}</p>}
            </div>
            {/* Support */}
            <div className="flex shrink-0 items-center gap-2" title={`Shown in: ${st.supportedBy.map((c) => c.authorName).join(", ")}`}>
              <div className="flex -space-x-1.5">
                {captures.map((c) => {
                  const on = supportIds.has(c._id)
                  return (
                    <span key={c._id} className={cn(!on && "opacity-25 grayscale")}>
                      <Avatar
                        id={c.author?._id ?? c._id}
                        name={c.author?.name}
                        title={`${c.author?.name ?? "Unknown"}: ${on ? "shows this step" : skippedBy.has(c._id) ? "skips it" : "not seen"}`}
                      />
                    </span>
                  )
                })}
              </div>
              <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {st.supportedBy.length}/{captures.length}
              </span>
            </div>
          </div>

          {st.conflict && (
            <div className="mt-3 flex gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
              <div className="min-w-0">
                <p className="font-medium">
                  Conflicts with Published{" "}
                  <Link
                    href={`/docs/${st.conflict.documentId}?hl=${encodeURIComponent(st.conflict.quote.slice(0, 120))}`}
                    className="font-mono underline"
                  >
                    {st.conflict.namingCode}
                  </Link>
                  {st.conflict.documentTitle && <span className="font-normal"> {st.conflict.documentTitle}</span>}
                </p>
                <blockquote className="mt-1 border-l-2 border-red-300 pl-2 italic">"{st.conflict.quote}"</blockquote>
                {st.conflict.note && <p className="mt-1">{st.conflict.note}</p>}
              </div>
            </div>
          )}

          {hasChoice && (
            <div className="mt-3" role="radiogroup" aria-label={`Standard for step ${st.index + 1}`}>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Which way becomes the standard?</p>
              <div className="grid gap-2 md:grid-cols-2">
                {options.map((o) => {
                  const on = decision === o.value
                  return (
                    <button
                      key={o.key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={pending !== null}
                      onClick={() => void choose(o.value)}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                        on ? "border-[#6E59A5] bg-[#9b87f5]/10 ring-1 ring-[#6E59A5]" : "hover:bg-muted/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                          on ? "border-[#6E59A5]" : "border-slate-400",
                        )}
                        aria-hidden
                      >
                        {on && <span className="h-2 w-2 rounded-full bg-[#6E59A5]" />}
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        {o.label}
                        <span className="block text-sm">{o.text}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              {missing.length > 0 && st.variations.length === 0 && (
                <p className="mt-1.5 text-xs text-muted-foreground">Not seen in: {missing.map((c) => c.author?.name).join(", ")}</p>
              )}
            </div>
          )}

          {st.evidence.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {st.evidence.map((e) =>
                e.url && e.kind === "photo" ? (
                  <Link key={e._id} href={`/library/captures/${e.captureId}`} title={e.text ?? "Evidence photo"}>
                    <img src={e.url} alt={e.text ?? "Evidence photo"} loading="lazy" className="h-16 w-24 rounded-md border object-cover" />
                  </Link>
                ) : e.text ? (
                  <Link
                    key={e._id}
                    href={`/library/captures/${e.captureId}`}
                    className="line-clamp-2 max-w-xs rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    "{e.text}"
                  </Link>
                ) : null,
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
