import { useState } from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { Layers, Pencil } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { errorText, useLevelNames } from "../skills/skillUi"
import { ProfileDialog } from "../skills/SkillEditors"
import type { CatalogueProfile, CatalogueSkill, TabProps } from "./workspaceBits"

const NONE = "none"

/**
 * The Skill profile grid: profiles as columns, Skills as rows, the level each
 * profile needs per cell. Click a cell to step 1, 2, 3, not needed; or focus
 * it and type 0 to 3.
 */
export function ProfilesTab({
  catalogue,
  engineerId,
  adding,
  onAddingChange,
}: TabProps & { adding: boolean; onAddingChange: (open: boolean) => void }) {
  const names = useLevelNames()
  const [editing, setEditing] = useState<CatalogueProfile | null>(null)
  const setTarget = useMutation(api.skills.setProfileTarget).withOptimisticUpdate((store, args) => {
    const cat = store.getQuery(api.skills.catalogue, {})
    if (!cat) return
    store.setQuery(api.skills.catalogue, {}, {
      ...cat,
      profiles: cat.profiles.map((p) => {
        if (p._id !== args.profileId) return p
        const rest = p.targets.filter((t) => t.skillId !== args.skillId)
        const has = p.targets.some((t) => t.skillId === args.skillId)
        const targets =
          args.level === 0
            ? rest
            : has
              ? p.targets.map((t) => (t.skillId === args.skillId ? { ...t, level: args.level } : t))
              : [...p.targets, { skillId: args.skillId, level: args.level }]
        return { ...p, targets }
      }),
    })
  })

  async function set(profileId: Id<"skillProfiles">, skillId: Id<"skills">, level: number) {
    if (!engineerId) return
    try {
      await setTarget({ profileId, skillId, level, engineerPersonId: engineerId })
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  const areaLabel = new Map(catalogue.areas.map((a) => [a.code, a.label]))
  const groups = new Map<string, CatalogueSkill[]>()
  for (const s of catalogue.skills) groups.set(s.area ?? NONE, [...(groups.get(s.area ?? NONE) ?? []), s])

  const dialog = engineerId && (adding || editing) && (
    <ProfileDialog
      open
      onOpenChange={(o) => {
        if (o) return
        setEditing(null)
        onAddingChange(false)
      }}
      profile={adding ? null : editing}
      engineerPersonId={engineerId}
    />
  )

  if (catalogue.profiles.length === 0 || catalogue.skills.length === 0) {
    return (
      <>
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Layers className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">{catalogue.skills.length === 0 ? "Add Skills first" : "No Skill profiles yet"}</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              A profile such as "Line 2 operator" lists the Skills and levels a role needs. Each profile becomes a column
              here, each Skill a row.
            </p>
          </CardContent>
        </Card>
        {dialog}
      </>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {engineerId
          ? `Click a cell to step through the levels a profile needs: 1 ${names[1]}, 2 ${names[2]}, 3 ${names[3]}, then not needed (a dot). Or focus a cell and type 0 to 3.`
          : `The level each profile needs: 1 ${names[1]}, 2 ${names[2]}, 3 ${names[3]}.`}
      </p>
      <Card className="overflow-hidden">
        <div className="max-h-[calc(100vh-260px)] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th className="sticky left-0 z-10 min-w-[220px] border-b bg-muted px-4 py-2 text-left font-medium text-muted-foreground">
                  Skill
                </th>
                {catalogue.profiles.map((p) => (
                  <th key={p._id} className="min-w-[120px] border-b border-l px-2 py-2 text-center align-bottom font-medium">
                    <div className="flex items-center justify-center gap-1">
                      <span className="line-clamp-2 text-foreground" title={p.description || p.name}>
                        {p.name}
                      </span>
                      {engineerId && (
                        <button
                          type="button"
                          aria-label={`Edit ${p.name}`}
                          onClick={() => setEditing(p)}
                          className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <div className={cn("font-normal", p.people.length === 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                      {p.targets.length} {p.targets.length === 1 ? "Skill" : "Skills"} ·{" "}
                      {p.people.length === 0 ? "nobody on it" : `${p.people.length} ${p.people.length === 1 ? "person" : "people"}`}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            {[...groups].map(([code, skills]) => (
              <tbody key={code}>
                <tr>
                  <th
                    colSpan={catalogue.profiles.length + 1}
                    scope="colgroup"
                    className="border-b bg-muted/30 px-4 py-1 text-left font-medium text-muted-foreground"
                  >
                    {code === NONE ? "No area" : `${code} · ${areaLabel.get(code) ?? code}`}
                  </th>
                </tr>
                {skills.map((s) => (
                  <tr key={s._id} className="group">
                    <th scope="row" className="sticky left-0 border-b bg-card px-4 py-1.5 text-left font-normal group-hover:bg-muted/40">
                      <span className="text-sm">{s.name}</span>
                    </th>
                    {catalogue.profiles.map((p) => {
                      const level = p.targets.find((t) => t.skillId === s._id)?.level ?? 0
                      return (
                        <td key={p._id} className="border-b border-l p-1 text-center group-hover:bg-muted/20">
                          <button
                            type="button"
                            disabled={!engineerId}
                            aria-label={`${p.name}, ${s.name}: ${level === 0 ? "not needed" : `level ${level} ${names[level]}`}`}
                            title={level === 0 ? "Not needed" : `Level ${level}: ${names[level]}`}
                            onClick={() => void set(p._id, s._id, (level + 1) % 4)}
                            onKeyDown={(e) => {
                              if (/^[0-3]$/.test(e.key)) {
                                e.preventDefault()
                                void set(p._id, s._id, Number(e.key))
                              }
                            }}
                            className={cn(
                              "h-8 w-full min-w-[48px] rounded-md text-sm font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              level === 0
                                ? "text-muted-foreground/50"
                                : level === 1
                                  ? "bg-primary/10 text-primary"
                                  : level === 2
                                    ? "bg-primary/25 text-primary"
                                    : "bg-primary text-primary-foreground",
                              engineerId
                                ? ["hover:bg-muted", "hover:bg-primary/20", "hover:bg-primary/35", "hover:bg-primary/90"][level]
                                : "cursor-default disabled:opacity-100",
                            )}
                          >
                            {level === 0 ? <span aria-hidden>·</span> : level}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Card>
      {dialog}
    </div>
  )
}
