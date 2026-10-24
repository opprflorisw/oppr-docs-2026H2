import { useState, type ComponentProps } from "react"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { Link } from "wouter"
import { toast } from "sonner"
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  HelpCircle,
  Home as HomeIcon,
  Layers,
  Link2,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { initials, useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import { ProfileDialog, SkillDialog, type CatalogueProfile, type CatalogueSkill } from "./skills/SkillDialogs"
import { errorText, SHIFT_META, SHIFT_ORDER, shiftKey, type ShiftKey } from "./skills/skillUi"
import { TrainingGuidedCreation } from "./training/TrainingGuidedCreation"

type Catalogue = FunctionReturnType<typeof api.skills.catalogue>

// Learn, Skills setup (Engineers): who is measured against which Skill
// profile, the profiles and their target levels, the Skills catalogue with
// the Trainings that prove each Skill, and the coverage questions shown on
// the Skill matrix and Home.
export function SkillsSettings() {
  const catalogue = useQuery(api.skills.catalogue)
  const { person } = useCheckIn()
  const engineer = person?.kind === "engineer" ? person : null
  const assignProfiles = useMutation(api.people.assignProfiles)
  const [skillDialog, setSkillDialog] = useState<{ skill: CatalogueSkill | null } | null>(null)
  const [profileDialog, setProfileDialog] = useState<{ profile: CatalogueProfile | null } | null>(null)
  const [makeFor, setMakeFor] = useState<CatalogueSkill | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  if (catalogue === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  const skillName = new Map(catalogue.skills.map((s) => [s._id, s.name]))

  async function toggleProfile(personId: Id<"people">, current: Id<"skillProfiles">[], profileId: Id<"skillProfiles">) {
    if (!engineer) return
    const next = current.includes(profileId) ? current.filter((x) => x !== profileId) : [...current, profileId]
    setSaving(`${personId}-${profileId}`)
    try {
      await assignProfiles({ personId, profileIds: next, engineerPersonId: engineer._id })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setSaving(null)
    }
  }

  const guidedProps = {
    open: makeFor !== null,
    onOpenChange: (o: boolean) => !o && setMakeFor(null),
    initialSkillIds: makeFor ? [makeFor._id] : [],
    initialDocumentIds: makeFor ? makeFor.documentIds : [],
    initialPurpose: makeFor ? `Prove the Skill "${makeFor.name}"` : undefined,
  } satisfies ComponentProps<typeof TrainingGuidedCreation>

  return (
    <div className="space-y-8">
      <p className="text-xs text-muted-foreground">
        Skills say what people can do: level 1 Knows it, 2 Can do it, 3 Can teach it. Skill profiles set the levels a
        role needs. The{" "}
        <Link href="/learn?tab=matrix" className="text-foreground underline-offset-2 hover:underline">
          Skill matrix
        </Link>{" "}
        compares the two.
      </p>
      {!engineer && (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Check in as an Engineer (top right) to change Skills, profiles, coverage questions or who is measured.
        </p>
      )}

      {/* ---- People and profiles ---- */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">People and profiles</h2>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-8 gap-1 text-xs"
            disabled={!engineer || catalogue.skills.length === 0}
            onClick={() => setProfileDialog({ profile: null })}
          >
            <Plus className="h-3.5 w-3.5" />
            Add profile
          </Button>
        </div>
        {catalogue.profiles.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            No Skill profiles yet. A profile such as "Line 2 operator" lists the Skills and levels a role needs.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {catalogue.profiles.map((p) => (
              <Card key={p._id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start gap-2">
                    <Layers className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{p.name}</div>
                      {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label={`Edit ${p.name}`}
                      disabled={!engineer}
                      onClick={() => setProfileDialog({ profile: p })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {p.targets.length === 0 ? (
                    <p className="text-xs text-amber-700">No target levels yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {p.targets.map((t) => (
                        <span key={t.skillId} className="rounded border bg-muted/40 px-1.5 py-0.5 text-xs">
                          {skillName.get(t.skillId)} <span className="text-muted-foreground">· level</span>{" "}
                          <span className="font-semibold">{t.level}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {p.people.length === 0 ? "No one measured yet" : `${p.people.length} measured`}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {catalogue.profiles.length > 0 && (
          <Card>
            <CardContent className="divide-y p-0">
              {catalogue.people.map((person) => (
                <div key={person._id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {initials(person.name)}
                  </span>
                  <Link href={`/learn/people/${person._id}`} className="min-w-[160px] flex-1 hover:underline">
                    <div className="text-sm font-medium">{person.name}</div>
                    <div className="text-xs text-muted-foreground">{person.role}</div>
                  </Link>
                  <div className="flex flex-wrap gap-1.5">
                    {catalogue.profiles.map((p) => {
                      const on = person.profileIds.includes(p._id)
                      const busy = saving === `${person._id}-${p._id}`
                      return (
                        <button
                          key={p._id}
                          type="button"
                          disabled={busy || !engineer}
                          aria-pressed={on}
                          onClick={() => void toggleProfile(person._id, person.profileIds, p._id)}
                          className={cn(
                            "min-h-8 rounded-full border px-2.5 py-1 text-xs transition-colors",
                            on
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-dashed text-muted-foreground hover:border-primary/40 hover:text-foreground",
                            busy && "opacity-50",
                            !engineer && "cursor-default",
                          )}
                        >
                          {on ? "✓ " : "+ "}
                          {p.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* ---- Coverage questions ---- */}
      <CoverageQuestions catalogue={catalogue} engineerId={engineer?._id ?? null} />

      {/* ---- Skills ---- */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Skills</h2>
          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
            {catalogue.skills.length}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-8 gap-1 text-xs"
            disabled={!engineer}
            onClick={() => setSkillDialog({ skill: null })}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Skill
          </Button>
        </div>
        {catalogue.skills.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <BadgeCheck className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">No Skills yet</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Add the abilities your plant runs on, such as operating a line or lockout/tagout, and link the documents
                and Trainings behind them.
              </p>
              <Button size="sm" variant="outline" className="mt-1" disabled={!engineer} onClick={() => setSkillDialog({ skill: null })}>
                Add the first Skill
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Skill</th>
                    <th className="px-3 py-2 text-left font-medium">Based on</th>
                    <th className="px-3 py-2 text-left font-medium">Proved by</th>
                    <th className="px-3 py-2 text-left font-medium">Validity</th>
                    <th className="px-3 py-2 text-right font-medium">Holders</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {catalogue.skills.map((s) => (
                    <tr key={s._id} className="align-top hover:bg-muted/30">
                      <td className="max-w-[260px] px-4 py-2.5">
                        <div className="text-sm font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-mono">{s.area ?? "No area"}</span>
                          {s.description ? ` · ${s.description}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <CodeList
                          items={s.documents.map((d) => ({
                            key: d._id,
                            code: d.namingCode,
                            title: d.title,
                            href: `/docs/${d._id}`,
                            muted: !d.published,
                          }))}
                          empty="None linked"
                        />
                      </td>
                      <td className="min-w-[220px] px-3 py-2.5">
                        <ProvedBy skill={s} engineerId={engineer?._id ?? null} onMake={() => setMakeFor(s)} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                        {s.validityMonths ? `${s.validityMonths} months` : "No expiry"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s.holders}</td>
                      <td className="px-2 py-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label={`Edit ${s.name}`}
                          disabled={!engineer}
                          onClick={() => setSkillDialog({ skill: s })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {skillDialog && engineer && (
        <SkillDialog
          open
          onOpenChange={(o) => !o && setSkillDialog(null)}
          skill={skillDialog.skill}
          catalogue={catalogue}
          engineerPersonId={engineer._id}
        />
      )}
      {profileDialog && engineer && (
        <ProfileDialog
          open
          onOpenChange={(o) => !o && setProfileDialog(null)}
          profile={profileDialog.profile}
          catalogue={catalogue}
          engineerPersonId={engineer._id}
        />
      )}
      {makeFor && <TrainingGuidedCreation {...guidedProps} />}
    </div>
  )
}

/** The Trainings that prove a Skill (explicit links), and suggestions from shared documents. */
function ProvedBy({
  skill,
  engineerId,
  onMake,
}: {
  skill: CatalogueSkill
  engineerId: Id<"people"> | null
  onMake: () => void
}) {
  const suggestions = useQuery(api.skills.suggestedLinks, { skillId: skill._id })
  const update = useMutation(api.skills.updateSkill)
  const [busy, setBusy] = useState<string | null>(null)

  async function link(trainingId: Id<"trainings">) {
    if (!engineerId) return
    setBusy(trainingId)
    try {
      await update({
        id: skill._id,
        name: skill.name,
        description: skill.description,
        area: skill.area,
        documentIds: skill.documentIds,
        trainingIds: [...skill.trainingIds, trainingId],
        validityMonths: skill.validityMonths,
        engineerPersonId: engineerId,
      })
      toast.success(`Linked to ${skill.name}`)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  const firstDoc = skill.documents.find((d) => d.published) ?? skill.documents[0]
  return (
    <div className="space-y-1.5">
      {skill.trainings.length > 0 ? (
        <CodeList
          items={skill.trainings.map((t) => ({
            key: t._id,
            code: t.code,
            title: `${t.title}${t.published ? "" : " (not published)"}`,
            href: `/learn/trainings/${t._id}`,
            muted: !t.published,
          }))}
          empty=""
        />
      ) : (
        <div className="text-xs text-amber-800 dark:text-amber-400">
          No Training yet.{" "}
          {firstDoc && engineerId ? (
            <button type="button" onClick={onMake} className="font-medium underline underline-offset-2 hover:text-foreground">
              Create one from {firstDoc.namingCode}
            </button>
          ) : firstDoc ? (
            `Create one from ${firstDoc.namingCode}.`
          ) : (
            "Link a document first."
          )}
        </div>
      )}
      {(suggestions ?? []).map((t) => (
        <div key={t._id} className="flex items-center gap-1.5 text-xs text-muted-foreground" title={`Shares ${t.sharedDocuments.join(", ")}`}>
          <span className="rounded border border-dashed px-1.5 py-0.5 font-mono">{t.code}</span>
          <span className="truncate">also uses {t.sharedDocuments.join(", ")}</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!engineerId || busy !== null}
            onClick={() => void link(t._id)}
          >
            <Link2 className="h-3 w-3" />
            Link
          </Button>
        </div>
      ))}
    </div>
  )
}

const ANY_SHIFT = "any"

function CoverageQuestions({ catalogue, engineerId }: { catalogue: Catalogue; engineerId: Id<"people"> | null }) {
  const questions = useQuery(api.coverageQuestions.list)
  const create = useMutation(api.coverageQuestions.create)
  const update = useMutation(api.coverageQuestions.update)
  const reorder = useMutation(api.coverageQuestions.reorder)
  const remove = useMutation(api.coverageQuestions.remove)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [removing, setRemoving] = useState<{ _id: Id<"coverageQuestions">; label: string } | null>(null)

  async function run(fn: () => Promise<unknown>, done?: string) {
    try {
      await fn()
      if (done) toast.success(done)
      return true
    } catch (err) {
      toast.error(errorText(err))
      return false
    }
  }

  function move(index: number, dir: -1 | 1) {
    if (!questions || !engineerId) return
    const ids = questions.map((q) => q._id)
    const j = index + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    void run(() => reorder({ ids, engineerPersonId: engineerId }))
  }

  return (
    <section className="space-y-2" aria-labelledby="coverage-title">
      <div className="flex items-center gap-2">
        <HelpCircle className="h-4 w-4 text-primary" />
        <h2 id="coverage-title" className="text-sm font-semibold">
          Coverage questions
        </h2>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-8 gap-1 text-xs"
          disabled={!engineerId || catalogue.profiles.length === 0 || adding}
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add question
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The questions a shift lead asks every day. Each is a Skill profile and a shift. They show as buttons on the Skill
        matrix; the ones on Home show as shift cover.
      </p>
      <Card>
        <CardContent className="divide-y p-0">
          {questions === undefined ? (
            <div className="p-3">
              <Skeleton className="h-8 w-full" />
            </div>
          ) : questions.length === 0 && !adding ? (
            <p className="p-4 text-xs text-muted-foreground">
              No coverage questions yet. Add one, for example "Who can run line 2 tonight?".
            </p>
          ) : (
            questions.map((q, i) =>
              editing === q._id ? (
                <QuestionForm
                  key={q._id}
                  catalogue={catalogue}
                  initial={{ label: q.label, profileId: q.profileId, shift: q.shift, showOnHome: q.showOnHome }}
                  submitLabel="Save"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (v) => {
                    if (!engineerId) return
                    const ok = await run(() =>
                      update({ id: q._id, label: v.label, profileId: v.profileId, shift: v.shift, showOnHome: v.showOnHome, engineerPersonId: engineerId }),
                    )
                    if (ok) setEditing(null)
                  }}
                />
              ) : (
                <div key={q._id} className="flex flex-wrap items-center gap-3 px-4 py-2.5" data-question={q.label}>
                  <div className="flex flex-col">
                    <Button size="icon" variant="ghost" className="h-6 w-8" aria-label={`Move ${q.label} up`} disabled={!engineerId || i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-8"
                      aria-label={`Move ${q.label} down`}
                      disabled={!engineerId || i === questions.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="min-w-[200px] flex-1">
                    <div className="text-sm font-medium">{q.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {q.profileName ?? "Profile removed"} · {q.shift ? SHIFT_META[q.shift].label : "Any shift (the next one)"}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={q.showOnHome}
                      disabled={!engineerId}
                      aria-label={`Show ${q.label} on Home`}
                      onCheckedChange={(on) =>
                        engineerId && void run(() => update({ id: q._id, showOnHome: on, engineerPersonId: engineerId }))
                      }
                    />
                    <HomeIcon className="h-3.5 w-3.5" />
                    On Home
                  </label>
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${q.label}`} disabled={!engineerId} onClick={() => setEditing(q._id)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-red-600"
                    aria-label={`Delete ${q.label}`}
                    disabled={!engineerId}
                    onClick={() => setRemoving({ _id: q._id, label: q.label })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ),
            )
          )}
          {adding && (
            <QuestionForm
              catalogue={catalogue}
              initial={{ label: "", profileId: catalogue.profiles[0]?._id ?? null, shift: null, showOnHome: false }}
              submitLabel="Add question"
              onCancel={() => setAdding(false)}
              onSubmit={async (v) => {
                if (!engineerId || !v.profileId) return
                const ok = await run(
                  () => create({ label: v.label, profileId: v.profileId!, shift: v.shift, showOnHome: v.showOnHome, engineerPersonId: engineerId }),
                  "Question added",
                )
                if (ok) setAdding(false)
              }}
            />
          )}
        </CardContent>
      </Card>

      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{removing?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The button goes from the Skill matrix and from Home. Skills, profiles and levels stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() =>
                removing && engineerId && void run(() => remove({ id: removing._id, engineerPersonId: engineerId }), "Question deleted")
              }
            >
              Delete question
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

type QuestionValues = { label: string; profileId: Id<"skillProfiles"> | null; shift: ShiftKey | null; showOnHome: boolean }

function QuestionForm({
  catalogue,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  catalogue: Catalogue
  initial: QuestionValues
  submitLabel: string
  onSubmit: (v: QuestionValues) => Promise<void>
  onCancel: () => void
}) {
  const [v, setV] = useState<QuestionValues>(initial)
  const [busy, setBusy] = useState(false)
  const profileName = catalogue.profiles.find((p) => p._id === v.profileId)?.name
  const suggestion = profileName
    ? `Who can run ${profileName.replace(/ operator$/i, "").toLowerCase()}${v.shift === "night" ? " tonight" : v.shift ? ` on the ${SHIFT_META[v.shift].label.toLowerCase()}` : ""}?`
    : ""
  const blocked = !v.profileId ? "Pick a Skill profile." : !v.label.trim() ? "Write the question." : null
  return (
    <form
      className="space-y-2 bg-muted/20 px-4 py-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (blocked) return
        setBusy(true)
        await onSubmit(v)
        setBusy(false)
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          autoFocus
          value={v.label}
          onChange={(e) => setV({ ...v, label: e.target.value })}
          placeholder={suggestion || "Who can run line 2 tonight?"}
          aria-label="Question"
          className="h-9 min-w-[240px] flex-1 text-sm"
          maxLength={120}
        />
        <Select value={v.profileId ?? ""} onValueChange={(id) => setV({ ...v, profileId: id as Id<"skillProfiles"> })}>
          <SelectTrigger className="h-9 w-[200px] text-xs" aria-label="Skill profile">
            <SelectValue placeholder="Skill profile" />
          </SelectTrigger>
          <SelectContent>
            {catalogue.profiles.map((p) => (
              <SelectItem key={p._id} value={p._id} className="text-xs">
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={v.shift ?? ANY_SHIFT} onValueChange={(s) => setV({ ...v, shift: shiftKey(s) })}>
          <SelectTrigger className="h-9 w-[160px] text-xs" aria-label="Shift">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_SHIFT} className="text-xs">
              Any shift (the next one)
            </SelectItem>
            {SHIFT_ORDER.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {SHIFT_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={v.showOnHome} onCheckedChange={(on) => setV({ ...v, showOnHome: on })} aria-label="Show on Home" />
          Show on Home as shift cover
        </label>
        {!v.label.trim() && suggestion && (
          <button type="button" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setV({ ...v, label: suggestion })}>
            Use "{suggestion}"
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {blocked && <span className="text-xs text-muted-foreground">{blocked}</span>}
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" className="h-8 text-xs" disabled={!!blocked || busy}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}

function CodeList({
  items,
  empty,
}: {
  items: { key: string; code: string; title: string; href: string; muted: boolean }[]
  empty: string
}) {
  if (items.length === 0) return <span className="text-muted-foreground">{empty}</span>
  return (
    <div className="flex max-w-[240px] flex-wrap gap-1">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          title={i.title}
          className={cn(
            "rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-xs hover:border-primary/50",
            i.muted && "border-dashed text-muted-foreground",
          )}
        >
          {i.code}
        </Link>
      ))}
    </div>
  )
}
