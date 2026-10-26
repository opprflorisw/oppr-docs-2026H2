import { useState, type ComponentProps } from "react"
import { useMutation, useQuery } from "convex/react"
import { Link } from "wouter"
import { toast } from "sonner"
import { Link2, ListChecks, Plus, Sparkles, X } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { errorText, useLevelNames } from "../skills/skillUi"
import { TrainingGuidedCreation } from "../training/TrainingGuidedCreation"
import { SectionTitle, type Catalogue, type CatalogueSkill, type TabProps } from "./workspaceBits"

type Linker = (skillId: Id<"skills">, trainingId: Id<"trainings">, linked: boolean) => Promise<void>

/**
 * Which Training proves which Skill. Passing a linked, published Training
 * sets level 1; levels 2 and 3 always need an Engineer's sign-off. Gaps both
 * ways: Skills no Training proves, and Trainings that prove no Skill.
 */
export function ProvedByTab({ catalogue, workspace, engineerId }: TabProps) {
  const names = useLevelNames()
  const setLink = useMutation(api.skills.setTrainingLink)
  const [makeFor, setMakeFor] = useState<CatalogueSkill | null>(null)

  const link: Linker = async (skillId, trainingId, linked) => {
    if (!engineerId) return
    try {
      await setLink({ skillId, trainingId, linked, engineerPersonId: engineerId })
      const skill = catalogue.skills.find((s) => s._id === skillId)
      const t = catalogue.trainings.find((x) => x._id === trainingId)
      toast.success(linked ? `${t?.code ?? "Training"} now proves ${skill?.name ?? "the Skill"}` : `${t?.code ?? "Training"} unlinked`)
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  const orphans = workspace.gaps.trainingsProvingNothing
  const guidedProps = {
    open: makeFor !== null,
    onOpenChange: (o: boolean) => !o && setMakeFor(null),
    initialSkillIds: makeFor ? [makeFor._id] : [],
    initialDocumentIds: makeFor ? makeFor.documentIds : [],
    initialPurpose: makeFor ? `Prove the Skill "${makeFor.name}"` : undefined,
  } satisfies ComponentProps<typeof TrainingGuidedCreation>

  return (
    <div className={cn("grid gap-6", orphans.length > 0 && "xl:grid-cols-[minmax(0,1fr)_320px]")}>
      <section className="min-w-0 space-y-3">
        <SectionTitle icon={ListChecks} title="Skills and the Trainings that prove them" count={catalogue.skills.length} />
        <p className="text-xs text-muted-foreground">
          Every link below works the same way: passing the linked, Published Training sets the Skill to level 1 (
          {names[1]}). Levels 2 ({names[2]}) and 3 ({names[3]}) always need an Engineer's sign-off on the floor, so no
          Training goes higher.
          {orphans.length === 0 && (
            <span className="text-emerald-700 dark:text-emerald-400"> Every Training proves at least one Skill.</span>
          )}
        </p>
        <Card>
          <CardContent className="divide-y p-0">
            {catalogue.skills.length === 0 && <p className="p-4 text-xs text-muted-foreground">No Skills yet.</p>}
            {catalogue.skills.map((s) => (
              <SkillRow key={s._id} skill={s} catalogue={catalogue} engineerId={engineerId} onLink={link} onMake={() => setMakeFor(s)} />
            ))}
          </CardContent>
        </Card>
      </section>

      {orphans.length > 0 && (
      <aside className="space-y-3" aria-labelledby="orphans-title">
        <div className="flex items-baseline gap-2">
          <h2 id="orphans-title" className="text-sm font-semibold">
            Trainings that prove no Skill
          </h2>
          <span className="text-xs tabular-nums text-muted-foreground">{orphans.length}</span>
        </div>
        <p className="text-xs text-muted-foreground">Passing these does not change anyone's level. Link each to the Skill it proves.</p>
          <Card>
            <CardContent className="divide-y p-0">
              {orphans.map((t) => (
                <div key={t._id} className="space-y-1.5 px-3 py-2.5">
                  <Link href={`/learn/trainings/${t._id}`} className="block text-xs hover:underline">
                    <span className="font-mono">{t.code}</span> {t.title}
                    {!t.published && <span className="text-muted-foreground"> (not published)</span>}
                  </Link>
                  {engineerId && catalogue.skills.length > 0 && (
                    <Select value="" onValueChange={(skillId) => void link(skillId as Id<"skills">, t._id, true)}>
                      <SelectTrigger className="h-8 text-xs" aria-label={`Skill that ${t.code} proves`}>
                        <SelectValue placeholder="Proves the Skill..." />
                      </SelectTrigger>
                      <SelectContent>
                        {catalogue.skills.map((s) => (
                          <SelectItem key={s._id} value={s._id} className="text-xs">
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
      </aside>
      )}

      {makeFor && <TrainingGuidedCreation {...guidedProps} />}
    </div>
  )
}

function SkillRow({
  skill,
  catalogue,
  engineerId,
  onLink,
  onMake,
}: {
  skill: CatalogueSkill
  catalogue: Catalogue
  engineerId: Id<"people"> | null
  onLink: Linker
  onMake: () => void
}) {
  const suggestions = useQuery(api.skills.suggestedLinks, { skillId: skill._id })
  const [busy, setBusy] = useState(false)
  const proving = skill.trainings.some((t) => t.published)
  const linkable = catalogue.trainings.filter((t) => !skill.trainingIds.includes(t._id) && !t.isPractice)
  const firstDoc = skill.documents.find((d) => d.published) ?? skill.documents[0]

  async function run(trainingId: Id<"trainings">, linked: boolean) {
    setBusy(true)
    await onLink(skill._id, trainingId, linked)
    setBusy(false)
  }

  return (
    <div className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="text-sm font-medium">{skill.name}</div>
        {!proving && <div className="text-xs text-amber-700 dark:text-amber-400">No Published Training proves it</div>}
      </div>
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {skill.trainings.map((t) => (
            <span
              key={t._id}
              className={cn(
                "inline-flex items-center gap-1 rounded border bg-muted/40 py-0.5 pl-1.5 pr-0.5 text-xs",
                !t.published && "border-dashed text-muted-foreground",
              )}
            >
              <Link href={`/learn/trainings/${t._id}`} className="hover:underline" title={t.title}>
                <span className="font-mono">{t.code}</span>
                <span className="ml-1 hidden max-w-[220px] truncate align-bottom lg:inline-block">{t.title}</span>
                {!t.published && " (not published)"}
              </Link>
              {engineerId && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(t._id, false)}
                  aria-label={`Unlink ${t.code} from ${skill.name}`}
                  className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {engineerId && linkable.length > 0 && (
            <Select value="" onValueChange={(id) => void run(id as Id<"trainings">, true)} disabled={busy}>
              <SelectTrigger className="h-7 w-auto gap-1 border-dashed px-2 text-xs" aria-label={`Link a Training to ${skill.name}`}>
                <Plus className="h-3 w-3" />
                <SelectValue placeholder="Link a Training" />
              </SelectTrigger>
              <SelectContent>
                {linkable.map((t) => (
                  <SelectItem key={t._id} value={t._id} className="text-xs">
                    {t.code} · {t.title}
                    {t.published ? "" : " (not published)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {engineerId && !proving && firstDoc && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={onMake}>
              <Sparkles className="h-3 w-3" />
              Create one from {firstDoc.namingCode}
            </Button>
          )}
          {skill.trainings.length === 0 && !engineerId && <span className="text-xs text-muted-foreground">None linked</span>}
        </div>
        {(suggestions ?? []).map((t) => (
          <div key={t._id} className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>Suggested:</span>
            <Link href={`/learn/trainings/${t._id}`} className="hover:underline" title={t.title}>
              <span className="font-mono">{t.code}</span> {t.title}
            </Link>
            <span>
              tests the same {t.sharedDocuments.length === 1 ? "document" : "documents"} ({t.sharedDocuments.join(", ")}) but
              does not prove this Skill yet.
            </span>
            {engineerId && (
              <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={busy} onClick={() => void run(t._id, true)}>
                <Link2 className="h-3 w-3" />
                Let it prove this Skill
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
