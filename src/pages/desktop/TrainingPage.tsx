import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Link, useLocation, useRoute } from "wouter"
import { toast } from "sonner"
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  GitBranch,
  Info,
  ListChecks,
  Loader2,
  MapPin,
  Pencil,
  Play,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  Undo2,
  UserRound,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import { StatusBadge } from "@/components/docs/StatusBadge"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import {
  daysAgo,
  errorText,
  fmtDate,
  KindBadge,
  KindIcon,
  ScoreBadge,
  SourceChip,
} from "@/components/learn/training/lib"
import {
  TrainingGuidedCreation,
  type TrainingDraft,
} from "@/components/learn/training/TrainingGuidedCreation"

type SignOff = "approve" | "publish" | "archive" | "confirm"

// /learn/trainings/:id: one Training, its objectives, stops, versions, sign-offs and records; start an Attempt.
export function TrainingPage() {
  const [, params] = useRoute<{ id: string }>("/learn/trainings/:id")
  const id = params?.id as Id<"trainings"> | undefined
  const data = useQuery(api.trainings.get, id ? { id } : "skip")
  const records = useQuery(api.attempts.listRecords, id ? { trainingId: id, includeFailed: true } : "skip")
  const { person } = useCheckIn()
  const mine = useQuery(api.attempts.listMine, person ? { personId: person._id } : "skip")
  const engineer = person?.kind === "engineer" ? person : null
  const [, navigate] = useLocation()

  const submit = useMutation(api.trainings.submitForReview)
  const revert = useMutation(api.trainings.revertToDraft)
  const approve = useMutation(api.trainings.approve)
  const publish = useMutation(api.trainings.publish)
  const newVersion = useMutation(api.trainings.newVersion)
  const archive = useMutation(api.trainings.archive)
  const confirmStillValid = useMutation(api.trainings.confirmStillValid)
  const removeDraft = useMutation(api.trainings.removeDraft)
  const startAttempt = useMutation(api.attempts.start)

  const [editing, setEditing] = useState(false)
  const [signOff, setSignOff] = useState<SignOff | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [showLive, setShowLive] = useState(false)

  if (data === undefined) {
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
          <p className="text-xs text-muted-foreground">It may have been deleted while it was still a draft.</p>
          <Button size="sm" variant="outline" onClick={() => navigate("/learn?tab=trainings")}>
            All Trainings
          </Button>
        </div>
      </div>
    )
  }

  const { training: t, current, live, versions, stats } = data
  const view = showLive && live ? live : current
  const isLive = t.liveVersion != null && t.status !== "archived"
  const myOpen = mine?.find(
    (a) => a.trainingId === t._id && (a.status === "in_progress" || a.status === "generating" || a.status === "error"),
  )
  const myLast = mine?.find((a) => a.trainingId === t._id && (a.status === "passed" || a.status === "failed"))
  const problems = current.objectives.filter((o) => o.check === "missing" || o.check === "unpublished").length

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key)
    try {
      await fn()
      if (ok) toast.success(ok)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  function askSignOff(kind: SignOff) {
    if (!engineer) {
      toast.error("Check in as an Engineer (top right) to sign this off.")
      return
    }
    setSignOff(kind)
  }

  async function doSignOff() {
    if (!engineer || !signOff) return
    const kind = signOff
    setSignOff(null)
    const first = engineer.name.split(" ")[0]
    if (kind === "approve") await run("approve", () => approve({ id: t._id, personId: engineer._id }), `Approved by ${engineer.name}`)
    if (kind === "publish")
      await run("publish", () => publish({ id: t._id, personId: engineer._id }), `Published by ${engineer.name}. Attempts now use v${t.currentVersion}.`)
    if (kind === "archive") await run("archive", () => archive({ id: t._id, personId: engineer._id }), `Archived by ${first}`)
    if (kind === "confirm")
      await run("confirm", () => confirmStillValid({ id: t._id, personId: engineer._id }), `Confirmed still valid by ${engineer.name}`)
  }

  async function start() {
    if (!person) {
      toast.error("Check in first (top right). An Attempt is proof, so it needs to know who you are.")
      return
    }
    setBusy("start")
    try {
      const attemptId = await startAttempt({ trainingId: t._id, personId: person._id })
      navigate(`/learn/attempts/${attemptId}`)
    } catch (err) {
      toast.error(errorText(err))
      setBusy(null)
    }
  }

  const initialDraft: TrainingDraft = {
    title: t.title,
    kind: t.kind,
    area: t.area,
    purpose: current.purpose,
    documentIds: Array.from(new Set(current.objectives.map((o) => o.documentId))),
    objectives: current.objectives.map((o) => ({
      id: o.id,
      text: o.text,
      documentId: o.documentId,
      chunkId: o.chunkId,
      quote: o.quote,
    })),
    stops: current.stops.map((s) => ({ assetId: s.assetId, objectiveIds: s.objectiveIds, hint: s.hint, evidence: s.evidence })),
    passMark: current.passMark,
    questionsPerObjective: current.questionsPerObjective,
  }

  // The lifecycle action that moves this Training on, in the header.
  const lifecycle = (
    <>
      {t.status === "draft" && (
        <>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={busy !== null}
            onClick={() => run("submit", () => submit({ id: t._id }), "Sent for review. An Engineer can now approve it.")}
          >
            {busy === "submit" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send for review
          </Button>
        </>
      )}
      {(t.status === "in_review" || t.status === "approved") && (
        <>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5"
            disabled={busy !== null}
            onClick={() => run("revert", () => revert({ id: t._id }), "Back to draft")}
          >
            <Undo2 className="h-3.5 w-3.5" /> Back to draft
          </Button>
          <Button size="sm" className="gap-1.5" disabled={busy !== null} onClick={() => askSignOff(t.status === "in_review" ? "approve" : "publish")}>
            {busy === "approve" || busy === "publish" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            {t.status === "in_review" ? "Approve" : "Publish"}
          </Button>
        </>
      )}
      {t.status === "published" && !engineer && (
        <span className="text-[11px] text-muted-foreground">Check in as an Engineer to change or archive this Training.</span>
      )}
      {t.status === "published" && engineer && (
        <>
          <Button size="sm" variant="ghost" className="gap-1.5" disabled={busy !== null} onClick={() => askSignOff("archive")}>
            <Archive className="h-3.5 w-3.5" /> Archive
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={busy !== null}
            onClick={() =>
              run("new", () => newVersion({ id: t._id, personId: engineer._id }), `v${t.currentVersion + 1} started as a draft. v${t.liveVersion} stays in use.`)
            }
          >
            <GitBranch className="h-3.5 w-3.5" /> New version
          </Button>
        </>
      )}
    </>
  )

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
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono">{t.code}</span>
            <span>· v{t.currentVersion}</span>
            <KindBadge kind={t.kind} />
            <StatusBadge status={t.status} className="h-5 px-1.5 text-[10px]" />
            {t.liveVersion != null && t.liveVersion !== t.currentVersion && (
              <span className="text-[11px]">v{t.liveVersion} in use</span>
            )}
          </span>
        }
        actions={<div className="flex flex-wrap items-center gap-2">{lifecycle}</div>}
      />

      <div className="mx-auto grid w-full max-w-6xl gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0 space-y-4">
          {t.needsReview && (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              <p className="flex items-start gap-2 text-sm font-medium">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Review after change: {t.needsReviewReason ?? "a source document changed"}.
              </p>
              <p className="pl-6 text-xs">
                v{t.liveVersion} stays in use until an Engineer decides. Check the objectives below against the new
                version: confirm the Training is still valid, or start a new version to change it.
              </p>
              <div className="flex flex-wrap gap-2 pl-6">
                <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={busy !== null} onClick={() => askSignOff("confirm")}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Still valid, confirm
                </Button>
                {t.status === "published" ? (
                  engineer && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 bg-background text-xs"
                    disabled={busy !== null}
                    onClick={() => run("new", () => newVersion({ id: t._id, personId: engineer._id }), `v${t.currentVersion + 1} started as a draft`)}
                  >
                    <GitBranch className="h-3.5 w-3.5" /> Start a new version
                  </Button>
                  )
                ) : (
                  <span className="self-center text-[11px]">
                    v{t.currentVersion} is in progress: publishing it completes this review.
                  </span>
                )}
                {!engineer && <span className="self-center text-[11px]">Check in as an Engineer to sign off.</span>}
              </div>
            </div>
          )}

          {live && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">
                {showLive
                  ? `You are looking at v${live.version}, the published version Attempts use now.`
                  : `v${current.version} is ${t.status === "draft" ? "a draft" : t.status.replace("_", " ")}. v${live.version} stays in use for Attempts until v${current.version} is published.`}
              </span>
              <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => setShowLive(!showLive)}>
                {showLive ? `Show v${current.version}` : `Show v${live.version}`}
              </button>
            </div>
          )}

          {problems > 0 && !showLive && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {problems} {problems === 1 ? "objective cites a passage" : "objectives cite passages"} that {problems === 1 ? "is" : "are"} no
              longer published. {t.status === "published" ? "Start a new version to pick new passages." : "Edit the draft to pick new passages."}
            </div>
          )}

          <Card>
            <CardContent className="space-y-1 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Purpose</p>
              <p className="text-sm">{view.purpose || <span className="text-muted-foreground">No purpose written yet.</span>}</p>
              <p className="pt-1 text-xs text-muted-foreground">
                Every Attempt asks {view.objectives.length * view.questionsPerObjective} fresh{" "}
                {view.objectives.length * view.questionsPerObjective === 1 ? "question" : "questions"}
                {view.questionsPerObjective > 1 ? ` (${view.questionsPerObjective} per objective)` : ", one per objective"}. Pass mark{" "}
                {view.passMark}%.
              </p>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Learning objectives</h2>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {view.objectives.length}
              </Badge>
            </div>
            {view.objectives.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
                  <p className="text-sm font-medium">No Learning objectives yet</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    Each objective is one thing a person must know or do, taken from a published passage.
                  </p>
                  {t.status === "draft" && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                      Add objectives
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="divide-y p-0">
                  {view.objectives.map((o, i) => (
                    <div key={o.id} className="flex gap-3 px-4 py-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm">{o.text}</p>
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <SourceChip
                            documentId={o.documentId}
                            namingCode={o.namingCode}
                            version={o.documentVersion}
                            section={o.section}
                            quote={o.quote}
                            className="mt-px shrink-0"
                          />
                          <span className="line-clamp-2 italic">"{o.quote}"</span>
                        </div>
                        <ObjectiveCheck check={o.check} code={o.namingCode} liveVersion={o.liveVersion} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {t.kind === "round" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Stops</h2>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {view.stops.length}
                </Badge>
                <span className="text-[11px] text-muted-foreground">walked in this order</span>
              </div>
              <Card>
                <CardContent className="divide-y p-0">
                  {view.stops.length === 0 && (
                    <p className="px-4 py-6 text-center text-xs text-muted-foreground">No stops yet. A Round needs at least one Asset.</p>
                  )}
                  {view.stops.map((s, i) => (
                    <div key={s.assetId} className="flex gap-3 px-4 py-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-xs font-semibold text-violet-700 dark:text-violet-300">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-sm">
                          <Link href={`/assets/${s.assetId}`} className="font-mono text-xs font-medium hover:text-primary hover:underline">
                            {s.code}
                          </Link>{" "}
                          {s.name}
                        </p>
                        {s.hint && <p className="text-xs text-muted-foreground">{s.hint}</p>}
                        <p className="text-[11px] text-muted-foreground">
                          {s.objectiveIds.length > 0
                            ? `Tests objective ${s.objectiveIds
                                .map((oid) => view.objectives.findIndex((o) => o.id === oid) + 1)
                                .filter((n) => n > 0)
                                .join(", ")}`
                            : "No questions here"}
                          {s.evidence === "photo" && " · asks a photo"}
                          {s.evidence === "note" && " · asks a note"}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Attempts and records</h2>
              {records && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {records.length}
                </Badge>
              )}
              {records && records.length > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {records.filter((r) => r.passed).length} passed, each one a Training record
                </span>
              )}
              {records && records.length > 0 && (
                <Link href="/learn?tab=records" className="ml-auto text-[11px] text-primary hover:underline">
                  All records
                </Link>
              )}
            </div>
            <Card>
              <CardContent className="divide-y p-0">
                {records === undefined ? (
                  <p className="px-4 py-4 text-xs text-muted-foreground">Loading…</p>
                ) : records.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm font-medium">No Attempts finished yet</p>
                    <p className="text-xs text-muted-foreground">
                      {isLive
                        ? "Every passed Attempt appears here as a Training record: who, which version, which questions and answers, when."
                        : "Once this Training is published, every passed Attempt appears here as a Training record."}
                    </p>
                  </div>
                ) : (
                  records.slice(0, 12).map((r) => (
                    <Link
                      key={r._id}
                      href={`/learn/attempts/${r.attemptId}`}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/50"
                    >
                      <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {r.personName}
                        <span className="ml-2 text-xs text-muted-foreground">
                          v{r.trainingVersion} · {fmtDate(r.at)} ({daysAgo(r.at)})
                        </span>
                      </span>
                      {!r.passed && <span className="text-[11px] text-red-600">Not passed</span>}
                      <ScoreBadge score={r.score} passed={r.passed} />
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        <aside className="space-y-3">
          <StartCard
            kind={t.kind}
            isLive={isLive}
            liveVersion={t.liveVersion}
            trainingId={t._id}
            personName={person?.name ?? null}
            open={myOpen ? { id: myOpen._id, answered: myOpen.answered, total: myOpen.total } : null}
            last={myLast ? { id: myLast._id, status: myLast.status, score: myLast.score, at: myLast.finishedAt } : null}
            starting={busy === "start"}
            onStart={() => void start()}
          />

          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-semibold">Version v{view.version} sign-offs</p>
            <Signoffs signoffs={view.signoffs} publishedAt={view.publishedAt} />
            {!engineer && (t.status === "in_review" || t.status === "approved") && (
              <p className="text-[11px] text-muted-foreground">Approving and publishing are sign-offs. Check in as an Engineer (top right) to do them.</p>
            )}
          </div>

          <div className="space-y-1.5 rounded-lg border p-3">
            <p className="text-xs font-semibold">Versions</p>
            {versions.map((ver) => (
              <div key={ver.version} className="flex items-center gap-2 text-xs">
                <span className="font-mono">v{ver.version}</span>
                {ver.isLive && (
                  <Badge variant="success" className="h-4 px-1 text-[9px]">
                    In use
                  </Badge>
                )}
                {ver.isCurrent && !ver.isLive && (
                  <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                    {t.status === "archived" ? "Archived" : "Working"}
                  </Badge>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {ver.publishedAt ? `Published ${fmtDate(ver.publishedAt)}` : "Not published"}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border">
            <MiniStat label="Records" value={stats.records} />
            <MiniStat label="Pass rate" value={stats.passRate == null ? "–" : `${stats.passRate}%`} />
            <MiniStat label="Attempts" value={stats.attempts} />
            <MiniStat label="In progress" value={stats.inProgress} />
          </div>

          {t.status === "draft" && t.liveVersion == null && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" /> Delete this draft
            </button>
          )}
        </aside>
      </div>

      <TrainingGuidedCreation open={editing} onOpenChange={setEditing} trainingId={t._id} initial={initialDraft} />

      <AlertDialog open={signOff !== null} onOpenChange={(o) => !o && setSignOff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {signOff === "approve" && `Approve ${t.code} v${t.currentVersion}?`}
              {signOff === "publish" && `Publish ${t.code} v${t.currentVersion}?`}
              {signOff === "archive" && `Archive ${t.code}?`}
              {signOff === "confirm" && `Confirm ${t.code} v${t.liveVersion} is still valid?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {signOff === "approve" && "This records your review of the objectives, their sources and the pass mark. It is not published yet."}
              {signOff === "publish" &&
                (t.liveVersion != null
                  ? `New Attempts will use v${t.currentVersion}. v${t.liveVersion} stops being used; its records stay valid.`
                  : "From now on, checked-in people can do Attempts, and a pass becomes a Training record.")}
              {signOff === "archive" && "Nobody can start new Attempts. Existing Training records stay as proof."}
              {signOff === "confirm" &&
                `You checked the objectives against the newly published source and they still hold. The review mark is cleared and v${t.liveVersion} keeps being used.`}{" "}
              The sign-off is recorded in the name of {engineer?.name ?? "the checked-in Engineer"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doSignOff()}>
              {signOff === "approve" ? "Approve" : signOff === "publish" ? "Publish" : signOff === "archive" ? "Archive" : "Confirm"} as{" "}
              {engineer?.name.split(" ")[0] ?? "Engineer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
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

function ObjectiveCheck({
  check,
  code,
  liveVersion,
}: {
  check: "current" | "moved" | "missing" | "unpublished"
  code: string
  liveVersion: number | null
}) {
  if (check === "current") return null
  if (check === "moved")
    return (
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Info className="h-3 w-3" />
        {code} is now v{liveVersion}. The quoted passage is still in it.
      </p>
    )
  return (
    <p className="flex items-center gap-1 text-[11px] font-medium text-destructive">
      <CircleAlert className="h-3 w-3" />
      {check === "missing"
        ? `The quoted passage is no longer in ${code} v${liveVersion}.`
        : `${code} is no longer published.`}
    </p>
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
        <li key={i} className="flex items-start gap-2 text-xs">
          <ShieldCheck
            className={cn(
              "mt-0.5 h-3.5 w-3.5 shrink-0",
              s.role === "author" ? "text-muted-foreground" : "text-emerald-600",
            )}
          />
          <span className="min-w-0">
            <span className="text-muted-foreground">{label(s)} </span>
            <span className="font-medium">{s.name ?? "a team member"}</span>
            <span className="block text-[11px] text-muted-foreground">{fmtDate(s.at, true)}</span>
          </span>
        </li>
      ))}
      {signoffs.length === 0 && <li className="text-[11px] text-muted-foreground">No sign-offs yet.</li>}
    </ul>
  )
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-card p-2.5">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}

function StartCard({
  kind,
  isLive,
  liveVersion,
  trainingId,
  personName,
  open,
  last,
  starting,
  onStart,
}: {
  kind: "course" | "round"
  isLive: boolean
  liveVersion: number | null
  trainingId: Id<"trainings">
  personName: string | null
  open: { id: Id<"trainingAttempts">; answered: number; total: number } | null
  last: { id: Id<"trainingAttempts">; status: string; score: number | null; at: number | null } | null
  starting: boolean
  onStart: () => void
}) {
  if (!isLive) {
    return (
      <div className="space-y-1 rounded-lg border border-dashed p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <KindIcon kind={kind} className="h-3.5 w-3.5 text-muted-foreground" />
          Not in use yet
        </p>
        <p className="text-[11px] text-muted-foreground">
          Attempts start once an Engineer has approved and published this Training.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <KindIcon kind={kind} className="h-3.5 w-3.5 text-primary" />
        {kind === "round" ? "Do this Round" : "Do this Training"}
      </p>
      {personName ? (
        <p className="text-[11px] text-muted-foreground">
          As {personName}. Questions are written fresh for you from v{liveVersion}, and every one cites its source.
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Check in first (top right). An Attempt is proof, so it needs to know who you are.
        </p>
      )}
      {open ? (
        <Button asChild size="sm" className="w-full gap-1.5">
          <Link href={`/learn/attempts/${open.id}`}>
            <Play className="h-3.5 w-3.5" />
            Continue your Attempt{open.total > 0 ? ` (${open.answered}/${open.total})` : ""}
          </Link>
        </Button>
      ) : kind === "round" ? (
        <>
          <Button asChild size="sm" className="w-full gap-1.5">
            <Link href={`/floor?round=${trainingId}`}>
              <Smartphone className="h-3.5 w-3.5" /> Do this Round in the Floor simulator
            </Link>
          </Button>
          <Button size="sm" variant="outline" className="w-full gap-1.5 bg-background" disabled={!personName || starting} onClick={onStart}>
            {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Or do it here, stop by stop
          </Button>
        </>
      ) : (
        <Button size="sm" className="w-full gap-1.5" disabled={!personName || starting} onClick={onStart}>
          {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Start an Attempt
        </Button>
      )}
      {last && (
        <Link href={`/learn/attempts/${last.id}`} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary">
          Your last Attempt: {last.status === "passed" ? "passed" : "not passed"} with {last.score ?? 0}%
          {last.at ? `, ${daysAgo(last.at)}` : ""}
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}
