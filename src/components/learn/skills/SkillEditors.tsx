import { useEffect, useState, type ReactNode } from "react"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { Link } from "wouter"
import { toast } from "sonner"
import { Archive, Loader2, Trash2 } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { MultiPicker } from "./MultiPicker"
import { errorText, levelWords } from "./skillUi"

export type Catalogue = FunctionReturnType<typeof api.skills.catalogue>
export type CatalogueSkill = Catalogue["skills"][number]
export type CatalogueProfile = Catalogue["profiles"][number]
export type Workspace = FunctionReturnType<typeof api.skills.workspace>

const NO_AREA = "none"

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  )
}

/**
 * One Skill in a side panel: who needs it and who holds it, then its fields.
 * `engineerPersonId` null shows it read-only.
 */
export function SkillSheet({
  open,
  onOpenChange,
  skill,
  catalogue,
  workspace,
  engineerPersonId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Null to add a new Skill. */
  skill: CatalogueSkill | null
  catalogue: Catalogue
  workspace?: Workspace
  engineerPersonId: Id<"people"> | null
}) {
  const createSkill = useMutation(api.skills.createSkill)
  const updateSkill = useMutation(api.skills.updateSkill)
  const archiveSkill = useMutation(api.skills.archiveSkill)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [area, setArea] = useState(NO_AREA)
  const [validity, setValidity] = useState("")
  const [documentIds, setDocumentIds] = useState<string[]>([])
  const [trainingIds, setTrainingIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const readOnly = !engineerPersonId

  useEffect(() => {
    if (!open) return
    setName(skill?.name ?? "")
    setDescription(skill?.description ?? "")
    setArea(skill?.area ?? NO_AREA)
    setValidity(skill?.validityMonths ? String(skill.validityMonths) : "")
    setDocumentIds(skill?.documentIds ?? [])
    setTrainingIds(skill?.trainingIds ?? [])
    // Only when the panel opens or switches Skill, not on every live update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, skill?._id])

  const validityNum = validity.trim() === "" ? null : Number(validity)
  const validityBad = validityNum !== null && (!Number.isInteger(validityNum) || validityNum < 1 || validityNum > 120)
  const stats = skill ? workspace?.skills.find((s) => s._id === skill._id) : undefined
  const neededBy = skill
    ? catalogue.profiles.flatMap((p) => {
        const t = p.targets.find((x) => x.skillId === skill._id)
        return t ? [{ _id: p._id, name: p.name, level: t.level }] : []
      })
    : []

  async function save() {
    if (!engineerPersonId) return
    if (!name.trim()) {
      toast.error("Give the Skill a name.")
      return
    }
    if (validityBad) {
      toast.error("Validity is a whole number of months between 1 and 120, or empty.")
      return
    }
    setBusy(true)
    const fields = {
      name,
      description,
      area: area === NO_AREA ? null : area,
      validityMonths: validityNum,
      documentIds: documentIds as Id<"documents">[],
      trainingIds: trainingIds as Id<"trainings">[],
    }
    try {
      if (skill) {
        await updateSkill({ id: skill._id, ...fields, engineerPersonId })
        toast.success("Skill saved")
      } else {
        await createSkill({ ...fields, engineerPersonId })
        toast.success(`Skill "${name.trim()}" added`)
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function archive() {
    if (!skill || !engineerPersonId) return
    setBusy(true)
    try {
      await archiveSkill({ id: skill._id, archived: true, engineerPersonId })
      toast.success(`Skill "${skill.name}" archived. Restore it from the archive below the table.`)
      onOpenChange(false)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
      setConfirmArchive(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="space-y-1 border-b px-5 py-4 text-left">
          <SheetTitle className="pr-6">{skill ? skill.name : "Add a Skill"}</SheetTitle>
          <SheetDescription className="text-xs">
            A named ability someone holds at a level. When one of its documents gets a new version that changes how the
            work is done (a Significant change), everyone who holds it is asked to re-train.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {skill && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3 text-xs">
              <div className="space-y-1">
                <div className="font-medium text-muted-foreground">Needed by</div>
                {neededBy.length === 0 ? (
                  <div className="text-muted-foreground">No Skill profile</div>
                ) : (
                  neededBy.map((p) => (
                    <div key={p._id}>
                      {p.name} <span className="text-muted-foreground">at</span> {levelWords(p.level)}
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-1">
                <div className="font-medium text-muted-foreground">People</div>
                {stats ? (
                  <>
                    {[1, 2, 3].map((l) => (
                      <div key={l} className="tabular-nums">
                        {stats.atLevel[l - 1]} at {levelWords(l)}
                      </div>
                    ))}
                    {stats.expired + stats.expiring + stats.retrain > 0 && (
                      <div className="text-amber-700 dark:text-amber-400">
                        {[
                          stats.retrain && `${stats.retrain} re-train`,
                          stats.expired && `${stats.expired} expired`,
                          stats.expiring && `${stats.expiring} expiring`,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="tabular-nums">{skill.holders} hold it</div>
                )}
              </div>
            </div>
          )}

          <fieldset disabled={readOnly} className="space-y-3">
            <Field label="Name" htmlFor="skill-name">
              <Input
                id="skill-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="For example: Operate extrusion line 2"
                className="h-8 text-sm"
              />
            </Field>
            <Field label="What it means" htmlFor="skill-desc">
              <Textarea
                id="skill-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="One sentence: what someone with this Skill can do."
                className="min-h-[56px] text-sm"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Area">
                <Select value={area} onValueChange={setArea} disabled={readOnly}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_AREA} className="text-xs">
                      No area
                    </SelectItem>
                    {catalogue.areas.map((a) => (
                      <SelectItem key={a.code} value={a.code} className="text-xs">
                        {a.code} · {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Level expires after (months)" htmlFor="skill-validity">
                <Input
                  id="skill-validity"
                  inputMode="numeric"
                  value={validity}
                  onChange={(e) => setValidity(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="Empty: never expires"
                  className={cn("h-8 text-sm", validityBad && "border-red-400")}
                />
              </Field>
            </div>
            <Field label="Based on documents">
              <MultiPicker
                options={catalogue.documents.map((d) => ({
                  id: d._id,
                  code: d.namingCode,
                  label: d.title,
                  hint: d.published ? undefined : "not published",
                }))}
                value={documentIds}
                onChange={readOnly ? () => {} : setDocumentIds}
                placeholder="Pick documents"
                empty="No documents found."
              />
            </Field>
            <Field label="Trainings that prove it (level 1)">
              <MultiPicker
                options={catalogue.trainings.map((t) => ({
                  id: t._id,
                  code: t.code,
                  label: t.title,
                  hint: t.published ? undefined : t.status.replace("_", " "),
                }))}
                value={trainingIds}
                onChange={readOnly ? () => {} : setTrainingIds}
                placeholder="Pick Trainings"
                empty="No Trainings yet."
              />
              <p className="text-xs text-muted-foreground">
                Only Published Trainings count. Levels 2 and 3 need an Engineer's sign-off.
              </p>
            </Field>
          </fieldset>
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
          {skill && !readOnly ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmArchive(true)}
            >
              <Archive className="mr-1.5 h-3.5 w-3.5" />
              Archive
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">{readOnly ? "Check in as an Engineer or Admin to change it." : ""}</span>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {readOnly ? "Close" : "Cancel"}
            </Button>
            {!readOnly && (
              <Button size="sm" disabled={busy} onClick={() => void save()}>
                {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {skill ? "Save" : "Add Skill"}
              </Button>
            )}
          </div>
        </div>

        <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive {skill?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                It leaves the Skill matrix, the Skill profiles and the gaps, and no Training raises it.
                {skill && skill.holders > 0
                  ? ` The levels of the ${skill.holders} ${skill.holders === 1 ? "person who holds" : "people who hold"} it are kept.`
                  : ""}{" "}
                Restore it any time and it comes back as it was.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void archive()}>
                Archive Skill
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  )
}

/**
 * A Skill profile's name and who it is for. Its target levels are set in the
 * profile grid (Skills workspace, Skill profiles).
 */
export function ProfileDialog({
  open,
  onOpenChange,
  profile,
  engineerPersonId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: CatalogueProfile | null
  /** The checked-in Engineer who makes the change. */
  engineerPersonId: Id<"people">
}) {
  const createProfile = useMutation(api.skills.createProfile)
  const updateProfile = useMutation(api.skills.updateProfile)
  const removeProfile = useMutation(api.skills.removeProfile)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(profile?.name ?? "")
    setDescription(profile?.description ?? "")
  }, [open, profile])

  async function save() {
    if (!name.trim()) {
      toast.error("Give the Skill profile a name.")
      return
    }
    setBusy(true)
    try {
      if (profile) {
        await updateProfile({ id: profile._id, name, description, targets: profile.targets, engineerPersonId })
        toast.success("Skill profile saved")
      } else {
        await createProfile({ name, description, targets: [], engineerPersonId })
        toast.success(`Skill profile "${name.trim()}" added. Set its levels in the grid.`)
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!profile) return
    setBusy(true)
    try {
      await removeProfile({ id: profile._id, engineerPersonId })
      toast.success(`Skill profile "${profile.name}" removed`)
      onOpenChange(false)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
      setConfirmRemove(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{profile ? "Edit Skill profile" : "Add a Skill profile"}</DialogTitle>
          <DialogDescription>
            The Skills a role needs, with the level for each. You set the levels in the grid.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <Field label="Name" htmlFor="profile-name">
            <Input
              id="profile-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="For example: Line 2 operator"
              className="h-8 text-sm"
            />
          </Field>
          <Field label="Who it is for" htmlFor="profile-desc">
            <Input
              id="profile-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One line"
              className="h-8 text-sm"
            />
          </Field>
          {profile && (
            <p className="text-xs text-muted-foreground">
              {profile.targets.length} {profile.targets.length === 1 ? "Skill" : "Skills"} ·{" "}
              {profile.people.length === 0 ? "nobody on it yet" : `${profile.people.length} ${profile.people.length === 1 ? "person" : "people"} on it`} ·{" "}
              <Link href="/learn/skills/people" className="underline underline-offset-2" onClick={() => onOpenChange(false)}>
                change who is on it
              </Link>
            </p>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {profile ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                disabled={busy}
                onClick={() => setConfirmRemove(true)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Remove
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {profile ? "Save" : "Add profile"}
              </Button>
            </div>
          </DialogFooter>
        </form>

        <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {profile?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                {profile && profile.people.length > 0
                  ? `It is assigned to ${profile.people.map((p) => p.name).join(", ")}. They keep their Skill levels but are no longer measured against these targets.`
                  : "No one is assigned to it."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => void remove()}>
                Remove profile
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
