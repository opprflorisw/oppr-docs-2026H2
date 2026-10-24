import { useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { Link, useLocation, useRoute, useSearch } from "wouter"
import { toast } from "sonner"
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  CircleAlert,
  Eye,
  GitBranch,
  Info,
  ListChecks,
  MapPin,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  Undo2,
  UserPlus,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { StatusBadge } from "@/components/docs/StatusBadge"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import { errorText, fmtDate, KindBadge, SourceChip } from "@/components/learn/training/lib"
import {
  TrainingGuidedCreation,
  useTrainingDraft,
  type BuilderTab,
} from "@/components/learn/training/TrainingGuidedCreation"
import { BreakdownReadView } from "@/components/learn/training/JobBreakdownEditor"
import { TrainingPeoplePanel } from "@/components/learn/training/TrainingPeoplePanel"
import { StillOnPointSignal, TrainingInsightsPanel } from "@/components/learn/training/TrainingInsightsPanel"
import { TrainingLearnerView } from "@/components/learn/training/TrainingLearnerView"
import { AssignDialog, resolveAudience, useCatalogue } from "@/components/learn/training/AssignDialog"
import { passRuleText, questionCount } from "@/components/learn/training/builderModel"
import { TrainingPreview } from "@/components/learn/training/TrainingPreview"

type SignOff = "approve" | "publish" | "archive" | "confirm"
type PageTab = "overview" | "people" | "insights" | "versions"

const PAGE_TABS: { value: PageTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "people", label: "People" },
  { value: "insights", label: "How it is going" },
  { value: "versions", label: "Versions" },
]

const DAY = 24 * 60 * 60 * 1000

// /learn/trainings/:id. Engineers manage the Training here; an Operator (or
// nobody checked in) gets the learner view with one Start button.
export function TrainingPage() {
  const [, params] = useRoute<{ id: string }>("/learn/trainings/:id")
  const id = params?.id as Id<"trainings"> | undefined
  const data = useQuery(api.trainings.get, id ? { id } : "skip")
  const { person, people } = useCheckIn()
  // Wait for the check-in, so an Engineer never sees the learner view flash.
  const hydrated = people !== undefined
  const [, navigate] = useLocation()

  if (data === undefined || hydrated === false) {
    return (
      <div className="flex flex-col">
        <TopBar breadcrumb={[{ label: "Learn", href: "/learn?tab=trainings" }, { label: "Training" }]} />
        <div className="mx-auto w-full max-w-6xl space-y-3 p-6">
          <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
          <div className="h-48 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    )
  }
  if (data === null || !data.current) {
    return (
      <div className="flex flex-col">
        <TopBar breadcrumb={[{ label: "Learn", href: "/learn?tab=trainings" }, { label: "Training" }]} />
        <div className="flex flex-col items-center gap-2 p-12 text-center">
          <ListChecks className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">This Training does not exist</p>
          <p className="text-sm text-muted-foreground">It may have been deleted while it was still a draft.</p>
          <Button size="sm" variant="outline" onClick={() => navigate("/learn?tab=trainings")}>
            All Trainings
          </Button>
        </div>
      </div>
    )
  }

  const t = data.training
  if (person?.kind !== "engineer") {
    return (
      <div className="flex flex-col">
        <TopBar breadcrumb={[{ label: "Learn", href: "/learn" }, { label: t.title }]} />
        <TrainingLearnerView
          trainingId={t._id}
          code={t.code}
          title={t.title}
          kind={t.kind}
          blockedReason={data.blockedReason ?? null}
        />
      </div>
    )
  }
  return <EngineerTrainingPage data={data} />
}

type TrainingData = NonNullable<FunctionReturnType<typeof api.trainings.get>>
type ObjectiveView = NonNullable<TrainingData["current"]>["objectives"]

function EngineerTrainingPage({ data }: { data: TrainingData }) {
  const { training: t, current, live, versions } = data
  const { person } = useCheckIn()
  const engineer = person?.kind === "engineer" ? person : null
  const [, navigate] = useLocation()
  const search = useSearch()
  const setup = useQuery(api.trainingBuilder.setup, { trainingId: t._id })
  const draft = useTrainingDraft(t._id)
  const catalogue = useCatalogue()

  const submitRevert = useMutation(api.trainings.revertToDraft)
  const approve = useMutation(api.trainings.approve)
  const publish = useMutation(api.trainings.publish)
  const newVersion = useMutation(api.trainings.newVersion)
  const archive = useMutation(api.trainings.archive)
  const confirmStillValid = useMutation(api.trainings.confirmStillValid)
  const removeDraft = useMutation(api.trainings.removeDraft)

  const initialTab = (new URLSearchParams(search).get("tab") as PageTab | null) ?? "overview"
  const [tab, setTab] = useState<PageTab>(PAGE_TABS.some((x) => x.value === initialTab) ? initialTab : "overview")
  const [builder, setBuilder] = useState<BuilderTab | null>(null)
  const [signOff, setSignOff] = useState<SignOff | null>(null)
  const [sendToAudience, setSendToAudience] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [revertReason, setRevertReason] = useState("")
  const [assigning, setAssigning] = useState(false)
  const [startingVersion, setStartingVersion] = useState(false)
  const [changeNote, setChangeNote] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [showLive, setShowLive] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  const view = showLive && live ? live : current!
  const viewSetup = showLive && setup?.live ? setup.live : setup?.current
  const isLive = t.liveVersion != null && t.status !== "archived"
  const problems = current!.objectives.filter((o) => o.check === "missing" || o.check === "unpublished").length
  const authors = new Set(current!.signoffs.filter((s) => s.role === "author" && s.personId).map((s) => String(s.personId)))
  const isAuthor = engineer ? authors.has(String(engineer._id)) : false
  const changes = useMemo(() => (live ? diffVersions(live, current!) : null), [live, current])

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key)
    try {
      await fn()
      if (ok) toast.success(ok)
      return true
    } catch (err) {
      toast.error(errorText(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  // Who a publish sends it to.
  const audience = setup?.current.audience ?? null
  const audiencePeople = audience ? resolveAudience(catalogue, audience.profileIds, audience.personIds) : []
  const audienceProfiles = (catalogue?.profiles ?? []).filter((p) => audience?.profileIds.includes(p._id)).map((p) => p.name)
  const dueAt = audience ? Date.now() + audience.dueDays * DAY : null

  async function doSignOff() {
    if (!engineer || !signOff) return
    const kind = signOff
    setSignOff(null)
    if (kind === "approve") await run("approve", () => approve({ id: t._id, personId: engineer._id }), `Approved by ${engineer.name}`)
    if (kind === "publish") {
      const ok = await run(
        "publish",
        () => publish({ id: t._id, personId: engineer._id, sendToAudience: audience ? sendToAudience : false }),
        `Published by ${engineer.name}. Attempts now use v${t.currentVersion}.`,
      )
      if (ok && audience && sendToAudience) setTab("people")
    }
    if (kind === "archive") await run("archive", () => archive({ id: t._id, personId: engineer._id }), `Archived by ${engineer.name}`)
    if (kind === "confirm")
      await run("confirm", () => confirmStillValid({ id: t._id, personId: engineer._id }), `Confirmed still valid by ${engineer.name}`)
  }

  // The one primary action, by status.
  const primary =
    t.status === "draft"
      ? { label: "Open the builder", icon: Pencil, onClick: () => setBuilder("source") }
      : t.status === "in_review"
        ? {
            label: "Approve",
            icon: ShieldCheck,
            onClick: () => setSignOff("approve"),
            disabled: isAuthor || busy !== null,
            disabledReason: isAuthor ? "You wrote this version. Another Engineer must review it." : undefined,
          }
        : t.status === "approved"
          ? {
              label: "Publish",
              icon: ShieldCheck,
              onClick: () => setSignOff("publish"),
              disabled: isAuthor || busy !== null,
              disabledReason: isAuthor ? "You wrote this version. Another Engineer must publish it." : undefined,
            }
          : t.status === "published"
            ? { label: "Assign to people", icon: UserPlus, onClick: () => setAssigning(true) }
            : undefined
  const secondary = [
    ...(t.status === "published"
      ? [
          { label: "New version", icon: GitBranch, onClick: () => setStartingVersion(true) },
        ]
      : []),
    ...(t.status === "in_review" || t.status === "approved"
      ? [
          { label: "Edit in the builder", icon: Pencil, onClick: () => setBuilder("source") },
          { label: "Back to draft", icon: Undo2, onClick: () => setReverting(true) },
        ]
      : []),
  ]
  const menu = [
    ...(t.status === "published" ? [{ label: "Archive", icon: Archive, onClick: () => setSignOff("archive"), destructive: true }] : []),
    ...(t.status === "draft" && t.liveVersion == null
      ? [{ label: "Delete this draft", icon: Trash2, onClick: () => setConfirmDelete(true), destructive: true }]
      : []),
  ]

  const critical = new Set(viewSetup?.critical ?? [])
  const total = questionCount({
    objectives: view.objectives.map((o) => ({ ...o, critical: critical.has(o.id) })),
    questionsPerObjective: view.questionsPerObjective,
    questionBank: (viewSetup?.questionBank ?? []).map((q) => ({ ...q, source: q.source })),
  } as Parameters<typeof questionCount>[0])
  const skillNames = (viewSetup?.skillIds ?? []).map((sid) => catalogue?.skills.find((s) => s._id === sid)?.name).filter(Boolean)
  // A Skill with the Training's name that this Training does not prove yet.
  const unlinkedSkill =
    skillNames.length === 0
      ? (catalogue?.skills ?? []).find((s) => s.name.trim().toLowerCase() === t.title.trim().toLowerCase()) ?? null
      : null
  const bank = viewSetup?.questionBank ?? []
  const safetyPoints = (viewSetup?.breakdown ?? []).reduce(
    (n, r) => n + r.keyPoints.filter((_, i) => r.keyPointKinds?.[i] === "safety").length,
    0,
  )
  const safetyWithoutTryOut = (safetyPoints > 0 || critical.size > 0) && !viewSetup?.tryOut?.required
  const nextStepForEdits =
    t.status === "published" ? "Start a new version to change it." : t.status === "draft" ? "Open the builder to change it." : "Send it back to draft to change it."

  return (
    <div className="flex flex-col">
      <TopBar
        breadcrumb={[
          { label: "Learn", href: "/learn" },
          { label: "Trainings", href: "/learn?tab=trainings" },
          { label: t.code },
        ]}
      />
      <PageHeader
        icon={t.kind === "round" ? MapPin : ListChecks}
        title={t.title}
        statusLine={
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono">{t.code}</span>
            <span>· v{t.currentVersion}</span>
            <KindBadge kind={t.kind} />
            <StatusBadge status={t.status} />
            {t.liveVersion != null && t.liveVersion !== t.currentVersion && <span>v{t.liveVersion} in use</span>}
          </span>
        }
        primary={primary}
        secondary={secondary}
        menu={menu}
      />

      <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
        {!engineer && (
          <p className="text-sm text-muted-foreground">Check in as an Engineer to sign off, assign or change this Training.</p>
        )}
        {t.needsReview && (
          <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            <p className="flex items-start gap-2 text-sm font-medium">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Review after change: {t.needsReviewReason ?? "a source document changed"}.
            </p>
            <p className="pl-6 text-sm">
              Operators cannot start it until an Engineer decides. Check the objectives against the new version: confirm
              the Training is still valid, or start a new version to change it.
            </p>
            <div className="flex flex-wrap gap-2 pl-6">
              <Button size="sm" className="gap-1.5" disabled={busy !== null} onClick={() => setSignOff("confirm")}>
                <CheckCircle2 className="h-4 w-4" /> Still valid, confirm
              </Button>
            </div>
          </div>
        )}

        <StillOnPointSignal trainingId={t._id} onOpen={() => setTab("insights")} />

        {changes && (t.status === "in_review" || t.status === "approved" || t.status === "draft") && (
          <ChangesStrip changes={changes} liveVersion={live!.version} currentVersion={current!.version} changeNote={versions.find((v) => v.isCurrent)?.changeNote ?? null} />
        )}

        {problems > 0 && !showLive && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {problems} {problems === 1 ? "objective cites a passage" : "objectives cite passages"} that {problems === 1 ? "is" : "are"} no
            longer published. {t.status === "published" ? "Start a new version to pick new passages." : "Open the builder to pick new passages."}
          </div>
        )}

        <div className="flex gap-1 border-b" role="tablist">
          {PAGE_TABS.map((x) => (
            <button
              key={x.value}
              type="button"
              role="tab"
              aria-selected={tab === x.value}
              onClick={() => setTab(x.value)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
                tab === x.value ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {x.label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="space-y-5">
            {live && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <Info className="h-4 w-4 shrink-0 text-primary" />
                <span className="flex-1">
                  {showLive
                    ? `You are looking at v${live.version}, the version Attempts use now.`
                    : `v${current!.version} is ${t.status === "draft" ? "a draft" : t.status.replace("_", " ")}. v${live.version} stays in use until v${current!.version} is published.`}
                </span>
                <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => setShowLive(!showLive)}>
                  {showLive ? `Show v${current!.version}` : `Show v${live.version}`}
                </button>
              </div>
            )}

            {viewSetup && safetyWithoutTryOut && (
              <div
                className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
                data-safety-tryout-warning
              >
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {safetyPoints > 0
                    ? `${safetyPoints} safety key ${safetyPoints === 1 ? "point" : "points"}`
                    : `${critical.size} Must be right ${critical.size === 1 ? "objective" : "objectives"}`}
                  , but no try-out at the line. Passing the questions does not show someone can do the job safely.{" "}
                  {nextStepForEdits} Then turn on the try-out under Try-out and refresher.
                </span>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="space-y-2 rounded-lg border p-4">
                <p className="text-xs font-medium text-muted-foreground">Purpose</p>
                <p className="text-sm">{view.purpose || <span className="text-muted-foreground">No purpose written yet.</span>}</p>
                <p className="text-sm text-muted-foreground">
                  {total} {total === 1 ? "question" : "questions"} per Attempt
                  {(viewSetup?.questionBank?.length ?? 0) > 0 ? ` from a bank of ${viewSetup!.questionBank!.length}` : ", written fresh each time"}.
                  To pass: {passRuleText(total, view.passMark, critical.size).toLowerCase()}
                </p>
              </div>
              <div className="space-y-2 rounded-lg border p-4 text-sm">
                <p>
                  <span className="text-muted-foreground">Proves: </span>
                  {skillNames.length > 0 ? (
                    <span className="font-medium">{skillNames.map((n) => `${n} (level 1)`).join(", ")}</span>
                  ) : (
                    <span className="text-muted-foreground">no Skill linked yet</span>
                  )}
                </p>
                {unlinkedSkill && (
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    The Skill "{unlinkedSkill.name}" exists but this Training does not prove it. {nextStepForEdits} Then link it under
                    People.
                  </p>
                )}
                <p>
                  <span className="text-muted-foreground">Try-out at the line: </span>
                  {viewSetup?.tryOut?.required ? "yes, then level 2" : "no"}
                </p>
                <p>
                  <span className="text-muted-foreground">Refresher: </span>
                  {viewSetup?.refreshMonths ? `after ${viewSetup.refreshMonths} months` : "none"}
                </p>
                {t.kind === "round" && (
                  <Button asChild size="sm" variant="outline" className="h-auto w-full gap-1.5 whitespace-normal py-2">
                    <Link href={`/floor?round=${t._id}`}>
                      <Smartphone className="h-4 w-4 shrink-0" /> Walk it in the Floor simulator
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            {viewSetup && (viewSetup.breakdown?.length ?? 0) === 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">Job breakdown</h2>
                <p className="rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground">
                  No job breakdown yet: this Training is a quiz on the objectives only. A breakdown (important steps, key points and
                  their reasons) is shown to the trainee before the questions. {nextStepForEdits}
                </p>
              </section>
            )}
            {(viewSetup?.breakdown?.length ?? 0) > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">Job breakdown</h2>
                <BreakdownReadView
                  rows={viewSetup!.breakdown!.map((r) => ({
                    ...r,
                    keyPointKinds: r.keyPoints.map((_, i) => r.keyPointKinds?.[i] ?? "quality"),
                  }))}
                  objectives={view.objectives.map((o) => ({ id: o.id, text: o.text, critical: critical.has(o.id) }))}
                />
              </section>
            )}

            <QuestionsReadView
              bank={bank}
              total={total}
              objectives={view.objectives.map((o) => ({ id: o.id, text: o.text }))}
              onPreview={draft ? () => setPreviewing(true) : undefined}
            />

            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Learning objectives</h2>
                <Badge variant="secondary">{view.objectives.length}</Badge>
              </div>
              <ObjectiveList trainingId={t._id} objectives={view.objectives} critical={critical} onOpenBuilder={() => setBuilder("source")} editable={t.status === "draft"} />
            </section>

            {t.kind === "round" && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">Stops, walked in this order</h2>
                <ol className="divide-y rounded-lg border">
                  {view.stops.map((s, i) => (
                    <li key={s.assetId} className="flex gap-3 px-4 py-3 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                      <span className="min-w-0">
                        <Link href={`/assets/${s.assetId}`} className="font-mono text-xs font-medium hover:text-primary hover:underline">
                          {s.code}
                        </Link>{" "}
                        {s.name}
                        {s.hint && <span className="block text-xs text-muted-foreground">{s.hint}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        )}

        {tab === "people" && <TrainingPeoplePanel trainingId={t._id} isLive={isLive} />}

        {tab === "insights" && (
          <TrainingInsightsPanel
            trainingId={t._id}
            objectives={(live ?? current!).objectives.map((o) => ({ id: o.id, text: o.text, documentId: o.documentId, namingCode: o.namingCode }))}
            onOpenQuestions={t.status === "draft" ? () => setBuilder("questions") : undefined}
          />
        )}

        {tab === "versions" && (
          <div className="space-y-4">
            <ul className="divide-y rounded-lg border">
              {versions.map((ver) => (
                <li key={ver.version} className="space-y-1 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">v{ver.version}</span>
                    {ver.isLive && <Badge variant="success">In use</Badge>}
                    {ver.isCurrent && !ver.isLive && <Badge variant="secondary">{t.status === "archived" ? "Archived" : "Working"}</Badge>}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {ver.publishedAt ? `Published ${fmtDate(ver.publishedAt)}` : "Not published"}
                    </span>
                  </div>
                  {ver.changeNote && <p className="text-muted-foreground">{ver.changeNote}</p>}
                </li>
              ))}
            </ul>
            <div className="space-y-2 rounded-lg border p-4">
              <p className="text-sm font-semibold">Version v{view.version} sign-offs</p>
              <Signoffs signoffs={view.signoffs} publishedAt={view.publishedAt} />
            </div>
          </div>
        )}
      </div>

      {draft && (
        <TrainingGuidedCreation
          open={builder !== null}
          onOpenChange={(o) => !o && setBuilder(null)}
          trainingId={t._id}
          code={t.code}
          version={t.currentVersion}
          initial={draft}
          initialTab={builder ?? "source"}
          hasLive={t.liveVersion != null}
        />
      )}

      {draft && (
        <Dialog open={previewing} onOpenChange={setPreviewing}>
          <DialogContent className="flex h-[92vh] w-[95vw] max-w-5xl flex-col gap-0 overflow-hidden p-0">
            <div className="border-b px-5 py-3 pr-14">
              <DialogTitle className="text-base font-semibold">Preview as trainee: {t.title}</DialogTitle>
              <DialogDescription className="text-xs">
                v{t.currentVersion}, as an Operator sees it on the phone. Nothing is recorded.
              </DialogDescription>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <TrainingPreview
                draft={draft}
                docInfo={
                  new Map(current!.objectives.map((o) => [String(o.documentId), { namingCode: o.namingCode, version: o.version ?? 1 }]))
                }
                onGoToQuestions={() => setPreviewing(false)}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      <AssignDialog open={assigning} onOpenChange={setAssigning} trainingId={t._id} />

      <AlertDialog open={signOff !== null} onOpenChange={(o) => !o && setSignOff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {signOff === "approve" && `Approve ${t.code} v${t.currentVersion}?`}
              {signOff === "publish" && `Publish ${t.code} v${t.currentVersion}?`}
              {signOff === "archive" && `Archive ${t.code}?`}
              {signOff === "confirm" && `Confirm ${t.code} v${t.liveVersion} is still valid?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {signOff === "approve" && "This records your review of the objectives, the breakdown, the questions and their sources. It is not published yet."}
                  {signOff === "publish" &&
                    (t.liveVersion != null
                      ? `New Attempts will use v${t.currentVersion}. v${t.liveVersion} stops being used; its records stay valid.`
                      : "From now on, checked-in people can do it, and a pass becomes a Training record.")}
                  {signOff === "archive" && "Nobody can start new Attempts. Existing Training records stay as proof."}
                  {signOff === "confirm" &&
                    `You checked the objectives against the newly published source and they still hold. v${t.liveVersion} keeps being used.`}{" "}
                  Signed in the name of {engineer?.name ?? "the checked-in Engineer"}.
                </p>
                {(signOff === "approve" || signOff === "publish") && changes && <ChangeList changes={changes} />}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {signOff === "publish" && audience && (
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                checked={sendToAudience}
                onChange={(e) => setSendToAudience(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                Send to {audiencePeople.length} {audiencePeople.length === 1 ? "person" : "people"}
                {audienceProfiles.length > 0 ? ` (${audienceProfiles.join(", ")})` : ""}
                {dueAt ? `, due ${fmtDate(dueAt)}` : ""}
              </span>
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doSignOff()}>
              {signOff === "approve" ? "Approve" : signOff === "publish" ? "Publish" : signOff === "archive" ? "Archive" : "Confirm"} as{" "}
              {engineer?.name.split(" ")[0] ?? "Engineer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={startingVersion} onOpenChange={setStartingVersion}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start v{t.currentVersion + 1} of {t.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              v{t.liveVersion} stays in use until the new version is published. Say what will change and why: the
              reviewer reads it first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            rows={3}
            placeholder="e.g. Purge time follows EXT-OPS-SOP-0001 v3: 5 minutes instead of 3."
            aria-label="What will change and why"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!changeNote.trim() || !engineer}
              onClick={() =>
                void run(
                  "new",
                  () => newVersion({ id: t._id, personId: engineer!._id, changeNote: changeNote.trim() }),
                  `v${t.currentVersion + 1} started as a draft. v${t.liveVersion} stays in use.`,
                ).then((ok) => {
                  if (!ok) return
                  setChangeNote("")
                  setBuilder("source")
                })
              }
            >
              Start v{t.currentVersion + 1}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reverting} onOpenChange={setReverting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send {t.code} v{t.currentVersion} back to draft?</AlertDialogTitle>
            <AlertDialogDescription>Review sign-offs are dropped. Say why, so the author knows what to change.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={revertReason} onChange={(e) => setRevertReason(e.target.value)} rows={3} placeholder="e.g. Step 3 has no reason yet." aria-label="Reason" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!revertReason.trim() || !engineer}
              onClick={() =>
                void run("revert", () => submitRevert({ id: t._id, personId: engineer!._id, reason: revertReason }), "Back to draft").then(() =>
                  setRevertReason(""),
                )
              }
            >
              Back to draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the draft {t.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              {t.code} was never published and has no Attempts, so nothing depends on it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void run("delete", async () => {
                  await removeDraft({ id: t._id })
                  navigate("/learn?tab=trainings")
                }, "Draft deleted")
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---- Objectives with their checks and open Findings ---------------------------------

function ObjectiveList({
  trainingId,
  objectives,
  critical,
  editable,
  onOpenBuilder,
}: {
  trainingId: Id<"trainings">
  objectives: ObjectiveView
  critical: Set<string>
  editable: boolean
  onOpenBuilder: () => void
}) {
  const findings = useQuery(api.trainings.openFindingsForObjectives, { trainingId })
  const byObjective = new Map((findings ?? []).map((f) => [f.objectiveId, f.findings]))
  if (objectives.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-8 text-center">
        <p className="text-sm font-medium">No Learning objectives yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Each objective is one thing a person must know or do, taken from a Published passage.
        </p>
        {editable && (
          <Button size="sm" variant="outline" className="mt-2" onClick={onOpenBuilder}>
            Add objectives
          </Button>
        )}
      </div>
    )
  }
  return (
    <ol className="divide-y rounded-lg border">
      {objectives.map((o, i) => {
        const open = (byObjective.get(o.id) ?? []).filter((f) => !f.acked)
        return (
          <li key={o.id} className="flex gap-3 px-4 py-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm">
                {o.text}
                {critical.has(o.id) && (
                  <span className="ml-2 inline-flex items-center gap-0.5 rounded-full border border-red-300 bg-red-50 px-1.5 text-xs font-medium text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                    <ShieldAlert className="h-3 w-3" /> Must be right
                  </span>
                )}
              </p>
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <SourceChip documentId={o.documentId} namingCode={o.namingCode} version={o.documentVersion} section={o.section} quote={o.quote} className="mt-px shrink-0" />
                <span className="line-clamp-2 italic">"{o.quote}"</span>
              </div>
              <ObjectiveCheck check={o.check} code={o.namingCode} liveVersion={o.liveVersion} />
              {open.map((f) => (
                <p key={f.findingId} className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Open contradiction with <span className="font-mono">{f.otherCode}</span>: {f.summary}{" "}
                    <Link href={`/library/findings?id=${f.findingId}`} className="font-medium underline-offset-2 hover:underline">
                      Settle the Finding first
                    </Link>
                  </span>
                </p>
              ))}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function ObjectiveCheck({ check, code, liveVersion }: { check: "current" | "moved" | "missing" | "unpublished"; code: string; liveVersion: number | null }) {
  if (check === "current") return null
  if (check === "moved")
    return (
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        {code} is now v{liveVersion}. The quoted passage is still in it.
      </p>
    )
  return (
    <p className="flex items-center gap-1 text-xs font-medium text-destructive">
      <CircleAlert className="h-3.5 w-3.5" />
      {check === "missing" ? `The quoted passage is no longer in ${code} v${liveVersion}.` : `${code} is no longer published.`}
    </p>
  )
}

// ---- Changes since the version in use ------------------------------------------------

interface Changes {
  added: string[]
  removed: string[]
  changed: string[]
  sourceMoved: string[]
}

function diffVersions(
  before: { objectives: { id: string; text: string; quote: string; namingCode: string; documentVersion: number }[]; passMark: number },
  after: { objectives: { id: string; text: string; quote: string; namingCode: string; documentVersion: number }[]; passMark: number },
): Changes {
  const b = new Map(before.objectives.map((o) => [o.id, o]))
  const a = new Map(after.objectives.map((o) => [o.id, o]))
  const out: Changes = { added: [], removed: [], changed: [], sourceMoved: [] }
  for (const o of after.objectives) {
    const old = b.get(o.id)
    if (!old) out.added.push(o.text)
    else if (old.text !== o.text || old.quote !== o.quote) out.changed.push(o.text)
    if (old && old.documentVersion !== o.documentVersion)
      out.sourceMoved.push(`${o.namingCode} v${old.documentVersion} to v${o.documentVersion}`)
  }
  for (const o of before.objectives) if (!a.has(o.id)) out.removed.push(o.text)
  out.sourceMoved = Array.from(new Set(out.sourceMoved))
  return out
}

function ChangesStrip({
  changes,
  liveVersion,
  currentVersion,
  changeNote,
}: {
  changes: Changes
  liveVersion: number
  currentVersion: number
  changeNote: string | null
}) {
  return (
    <div className="space-y-2 rounded-lg border border-sky-300 bg-sky-50/60 p-3 dark:border-sky-500/40 dark:bg-sky-500/10">
      <p className="text-sm font-semibold">
        Changes since v{liveVersion} <span className="font-normal text-muted-foreground">(v{currentVersion} against the version in use)</span>
      </p>
      {changeNote && <p className="text-sm">"{changeNote}"</p>}
      <ChangeList changes={changes} />
    </div>
  )
}

function ChangeList({ changes }: { changes: Changes }) {
  const none = changes.added.length + changes.removed.length + changes.changed.length + changes.sourceMoved.length === 0
  if (none) return <p className="text-sm text-muted-foreground">No objective changed. The breakdown, questions or settings may have.</p>
  return (
    <ul className="space-y-1 text-sm">
      {changes.added.map((x, i) => (
        <li key={`a${i}`} className="flex gap-2">
          <Badge variant="success" className="shrink-0">Added</Badge>
          <span className="text-foreground">{x}</span>
        </li>
      ))}
      {changes.changed.map((x, i) => (
        <li key={`c${i}`} className="flex gap-2">
          <Badge variant="secondary" className="shrink-0">Changed</Badge>
          <span className="text-foreground">{x}</span>
        </li>
      ))}
      {changes.removed.map((x, i) => (
        <li key={`r${i}`} className="flex gap-2">
          <Badge variant="destructive" className="shrink-0">Removed</Badge>
          <span className="text-foreground line-through decoration-muted-foreground/60">{x}</span>
        </li>
      ))}
      {changes.sourceMoved.map((x, i) => (
        <li key={`s${i}`} className="flex gap-2 text-muted-foreground">
          <Badge variant="outline" className="shrink-0">Source moved</Badge>
          {x}
        </li>
      ))}
    </ul>
  )
}

function Signoffs({
  signoffs,
  publishedAt,
}: {
  signoffs: { role: "author" | "reviewer" | "approver"; name: string | null; at: number }[]
  publishedAt: number | null
}) {
  const label = (s: { role: string; at: number }) =>
    s.role === "author"
      ? "Written by"
      : s.role === "approver"
        ? "Approved and published by"
        : publishedAt != null && s.at > publishedAt
          ? "Confirmed after change by"
          : "Reviewed by"
  return (
    <ul className="space-y-1.5">
      {signoffs.map((s, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <ShieldCheck className={cn("mt-0.5 h-4 w-4 shrink-0", s.role === "author" ? "text-muted-foreground" : "text-emerald-600")} />
          <span className="min-w-0">
            <span className="text-muted-foreground">{label(s)} </span>
            <span className="font-medium">{s.name ?? "a team member"}</span>
            <span className="block text-xs text-muted-foreground">{fmtDate(s.at)}</span>
          </span>
        </li>
      ))}
      {signoffs.length === 0 && <li className="text-xs text-muted-foreground">No sign-offs yet.</li>}
    </ul>
  )
}

// ---- Question bank, read only -------------------------------------------------------

type BankItem = {
  id: string
  objectiveId: string
  kind: "choice" | "open"
  prompt: string
  options: string[]
  correctIndex: number
  keyPoints?: string[]
}

function QuestionsReadView({
  bank,
  total,
  objectives,
  onPreview,
}: {
  bank: BankItem[]
  total: number
  objectives: { id: string; text: string }[]
  onPreview?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <section className="space-y-2" data-questions-read>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Questions</h2>
        <Badge variant="secondary">{bank.length > 0 ? bank.length : total}</Badge>
        <span className="text-sm text-muted-foreground">
          {bank.length > 0
            ? `Each Attempt draws ${total} of these ${bank.length}.`
            : `No fixed bank: each Attempt writes ${total} fresh questions from the passages.`}
        </span>
        <span className="ml-auto flex gap-2">
          {bank.length > 0 && (
            <Button size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? "Hide questions" : "View questions"}
            </Button>
          )}
          {onPreview && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onPreview}>
              <Eye className="h-4 w-4" /> Preview as trainee
            </Button>
          )}
        </span>
      </div>
      {open && (
        <ol className="divide-y rounded-lg border">
          {bank.map((q, i) => (
            <li key={q.id} className="space-y-1.5 px-4 py-3 text-sm">
              <p className="flex gap-2">
                <span className="w-7 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">Q{i + 1}</span>
                <span className="min-w-0 flex-1 font-medium">{q.prompt}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{q.kind === "open" ? "Open answer" : "Multiple choice"}</span>
              </p>
              <p className="pl-9 text-xs text-muted-foreground">
                Tests: {objectives.find((o) => o.id === q.objectiveId)?.text ?? "a removed objective"}
              </p>
              {q.kind === "choice" ? (
                <ul className="space-y-0.5 pl-9">
                  {q.options.map((opt, j) => (
                    <li
                      key={j}
                      className={cn(
                        "flex gap-2",
                        j === q.correctIndex ? "font-medium text-emerald-800 dark:text-emerald-300" : "text-muted-foreground",
                      )}
                    >
                      {j === q.correctIndex ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
                      {opt}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pl-9 text-muted-foreground">Key points: {(q.keyPoints ?? []).join("; ") || "none"}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
