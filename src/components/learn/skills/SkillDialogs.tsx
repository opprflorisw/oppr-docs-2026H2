import { useEffect, useState } from "react"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import { Loader2, Trash2 } from "lucide-react"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { MultiPicker } from "./MultiPicker"
import { errorText, LEVEL_NAMES } from "./skillUi"

export type Catalogue = FunctionReturnType<typeof api.skills.catalogue>
export type CatalogueSkill = Catalogue["skills"][number]
export type CatalogueProfile = Catalogue["profiles"][number]

const NO_AREA = "none"

// ---- Skill -------------------------------------------------------------------

export function SkillDialog({
  open,
  onOpenChange,
  skill,
  catalogue,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Null to add a new Skill. */
  skill: CatalogueSkill | null
  catalogue: Catalogue
}) {
  const createSkill = useMutation(api.skills.createSkill)
  const updateSkill = useMutation(api.skills.updateSkill)
  const removeSkill = useMutation(api.skills.removeSkill)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [area, setArea] = useState(NO_AREA)
  const [validity, setValidity] = useState("")
  const [documentIds, setDocumentIds] = useState<string[]>([])
  const [trainingIds, setTrainingIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(skill?.name ?? "")
    setDescription(skill?.description ?? "")
    setArea(skill?.area ?? NO_AREA)
    setValidity(skill?.validityMonths ? String(skill.validityMonths) : "")
    setDocumentIds(skill?.documentIds ?? [])
    setTrainingIds(skill?.trainingIds ?? [])
  }, [open, skill])

  const validityNum = validity.trim() === "" ? null : Number(validity)
  const validityBad = validityNum !== null && (!Number.isInteger(validityNum) || validityNum < 1 || validityNum > 120)

  async function save() {
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
        await updateSkill({ id: skill._id, ...fields })
        toast.success("Skill saved")
      } else {
        await createSkill(fields)
        toast.success(`Skill "${name.trim()}" added`)
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!skill) return
    setBusy(true)
    try {
      await removeSkill({ id: skill._id })
      toast.success(`Skill "${skill.name}" removed`)
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{skill ? "Edit Skill" : "Add a Skill"}</DialogTitle>
          <DialogDescription>
            A named ability someone holds at a level. Link the published documents it rests on: a
            significant change to one of them flags everyone who holds it for re-training.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="skill-name" className="text-xs">Name</Label>
            <Input
              id="skill-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="For example: Operate extrusion line 2"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="skill-desc" className="text-xs">What it means</Label>
            <Textarea
              id="skill-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One sentence: what someone with this Skill can do."
              className="min-h-[56px] text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Area</Label>
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_AREA} className="text-xs">No area</SelectItem>
                  {catalogue.areas.map((a) => (
                    <SelectItem key={a.code} value={a.code} className="text-xs">
                      {a.code} · {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="skill-validity" className="text-xs">Valid for (months)</Label>
              <Input
                id="skill-validity"
                inputMode="numeric"
                value={validity}
                onChange={(e) => setValidity(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Empty: does not expire"
                className={cn("h-8 text-sm", validityBad && "border-red-400")}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Based on documents</Label>
            <MultiPicker
              options={catalogue.documents.map((d) => ({
                id: d._id,
                code: d.namingCode,
                label: d.title,
                hint: d.published ? undefined : "not published",
              }))}
              value={documentIds}
              onChange={setDocumentIds}
              placeholder="Pick documents"
              empty="No documents found."
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Trainings that prove it (level 1)</Label>
            <MultiPicker
              options={catalogue.trainings.map((t) => ({
                id: t._id,
                code: t.code,
                label: t.title,
                hint: t.published ? undefined : t.status.replace("_", " "),
              }))}
              value={trainingIds}
              onChange={setTrainingIds}
              placeholder="Pick Trainings"
              empty="No Trainings yet."
            />
            <p className="text-[11px] text-muted-foreground">
              Only published Trainings count. A Training built from a linked document counts too.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {skill ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
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
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void save()}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {skill ? "Save" : "Add Skill"}
            </Button>
          </div>
        </DialogFooter>

        <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {skill?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                {skill && skill.holders > 0
                  ? `${skill.holders} ${skill.holders === 1 ? "person holds" : "people hold"} this Skill. Their levels are removed and it leaves every Skill profile. Their history stays.`
                  : "It leaves every Skill profile."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => void remove()}>
                Remove Skill
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}

// ---- Skill profile -------------------------------------------------------------

export function ProfileDialog({
  open,
  onOpenChange,
  profile,
  catalogue,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: CatalogueProfile | null
  catalogue: Catalogue
}) {
  const createProfile = useMutation(api.skills.createProfile)
  const updateProfile = useMutation(api.skills.updateProfile)
  const removeProfile = useMutation(api.skills.removeProfile)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [targets, setTargets] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(profile?.name ?? "")
    setDescription(profile?.description ?? "")
    setTargets(Object.fromEntries((profile?.targets ?? []).map((t) => [t.skillId, t.level])))
  }, [open, profile])

  const count = Object.values(targets).filter((l) => l > 0).length

  async function save() {
    if (!name.trim()) {
      toast.error("Give the Skill profile a name.")
      return
    }
    setBusy(true)
    // Keep the catalogue's order, which is also the matrix's column order.
    const list = catalogue.skills
      .filter((s) => (targets[s._id] ?? 0) > 0)
      .map((s) => ({ skillId: s._id, level: targets[s._id] }))
    try {
      if (profile) {
        await updateProfile({ id: profile._id, name, description, targets: list })
        toast.success("Skill profile saved")
      } else {
        await createProfile({ name, description, targets: list })
        toast.success(`Skill profile "${name.trim()}" added`)
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
      await removeProfile({ id: profile._id })
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{profile ? "Edit Skill profile" : "Add a Skill profile"}</DialogTitle>
          <DialogDescription>
            The Skills a role needs, with the level for each. Gaps against it decide which Trainings
            people are offered.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="profile-name" className="text-xs">Name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="For example: Line 2 operator"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="profile-desc" className="text-xs">Who it is for</Label>
            <Input
              id="profile-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One line"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Target levels</Label>
              <span className="text-[11px] text-muted-foreground">{count} Skills</span>
            </div>
            {catalogue.skills.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                Add Skills first, then set the level this profile needs for each.
              </p>
            ) : (
              <div className="max-h-[320px] divide-y overflow-y-auto rounded-lg border">
                {catalogue.skills.map((s) => {
                  const level = targets[s._id] ?? 0
                  return (
                    <div key={s._id} className="flex items-center gap-3 px-3 py-1.5">
                      <span className={cn("min-w-0 flex-1 truncate text-xs", level === 0 && "text-muted-foreground")}>
                        {s.name}
                      </span>
                      <div className="flex shrink-0 overflow-hidden rounded-md border">
                        {[0, 1, 2, 3].map((l) => (
                          <button
                            key={l}
                            type="button"
                            title={l === 0 ? "Not needed" : `Level ${l}: ${LEVEL_NAMES[l]}`}
                            onClick={() => setTargets((t) => ({ ...t, [s._id]: l }))}
                            className={cn(
                              "h-6 w-8 border-l text-[11px] first:border-l-0",
                              level === l
                                ? l === 0
                                  ? "bg-muted font-medium"
                                  : "bg-primary font-medium text-primary-foreground"
                                : "hover:bg-muted/60",
                            )}
                          >
                            {l === 0 ? "–" : l}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              1 trained, 2 qualified (practice signed off), 3 can train others.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {profile ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
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
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void save()}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {profile ? "Save" : "Add profile"}
            </Button>
          </div>
        </DialogFooter>

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
