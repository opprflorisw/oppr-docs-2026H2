import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Link } from "wouter"
import { toast } from "sonner"
import { BadgeCheck, Layers, Pencil, Plus, Users } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { initials } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import {
  ProfileDialog,
  SkillDialog,
  type CatalogueProfile,
  type CatalogueSkill,
} from "./skills/SkillDialogs"
import { errorText } from "./skills/skillUi"

// Settings tab: the Skills catalogue, Skill profiles with their target
// levels, and who is measured against which profile.
export function SkillsSettings() {
  const catalogue = useQuery(api.skills.catalogue)
  const assignProfiles = useMutation(api.people.assignProfiles)
  const [skillDialog, setSkillDialog] = useState<{ skill: CatalogueSkill | null } | null>(null)
  const [profileDialog, setProfileDialog] = useState<{ profile: CatalogueProfile | null } | null>(null)
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
    const next = current.includes(profileId) ? current.filter((x) => x !== profileId) : [...current, profileId]
    setSaving(`${personId}-${profileId}`)
    try {
      await assignProfiles({ personId, profileIds: next })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Skills say what people can do, at level 1 (trained), 2 (qualified) or 3 (can train others). Skill
        profiles set the levels a role needs. The{" "}
        <Link href="/learn?tab=matrix" className="text-foreground underline-offset-2 hover:underline">
          Skill matrix
        </Link>{" "}
        compares the two.
      </p>

      {/* ---- Skills ---- */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Skills</h2>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {catalogue.skills.length}
          </Badge>
          <Button size="sm" variant="outline" className="ml-auto h-7 gap-1 text-xs" onClick={() => setSkillDialog({ skill: null })}>
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
                Add the abilities your plant runs on, such as operating a line or lockout/tagout, and link
                the documents and Trainings behind them.
              </p>
              <Button size="sm" variant="outline" className="mt-1" onClick={() => setSkillDialog({ skill: null })}>
                Add the first Skill
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/30 text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Skill</th>
                    <th className="px-3 py-2 text-left font-medium">Area</th>
                    <th className="px-3 py-2 text-left font-medium">Based on</th>
                    <th className="px-3 py-2 text-left font-medium">Trainings</th>
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
                        {s.description && <div className="line-clamp-2 text-[11px] text-muted-foreground">{s.description}</div>}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">{s.area ?? "–"}</td>
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
                      <td className="px-3 py-2.5">
                        <CodeList
                          items={s.trainings.map((t) => ({
                            key: t._id,
                            code: t.code,
                            title: `${t.title}${t.published ? "" : " (not published)"}`,
                            href: `/learn/trainings/${t._id}`,
                            muted: !t.published,
                          }))}
                          empty="None"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                        {s.validityMonths ? `${s.validityMonths} months` : "No expiry"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s.holders}</td>
                      <td className="px-2 py-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          aria-label={`Edit ${s.name}`}
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

      {/* ---- Profiles ---- */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Skill profiles</h2>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {catalogue.profiles.length}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 gap-1 text-xs"
            disabled={catalogue.skills.length === 0}
            onClick={() => setProfileDialog({ profile: null })}
          >
            <Plus className="h-3.5 w-3.5" />
            Add profile
          </Button>
        </div>
        {catalogue.profiles.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            No Skill profiles yet. A profile such as "Line 2 operator" lists the Skills and levels a role
            needs.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {catalogue.profiles.map((p) => (
              <Card key={p._id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{p.name}</div>
                      {p.description && <div className="text-[11px] text-muted-foreground">{p.description}</div>}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label={`Edit ${p.name}`}
                      onClick={() => setProfileDialog({ profile: p })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {p.targets.length === 0 ? (
                    <p className="text-[11px] text-amber-700">No target levels yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {p.targets.map((t) => (
                        <span key={t.skillId} className="rounded border bg-muted/40 px-1.5 py-0.5 text-[11px]">
                          {skillName.get(t.skillId)} <span className="font-semibold">{t.level}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {p.people.length === 0 ? "No one assigned" : p.people.map((x) => x.name).join(", ")}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ---- Assignment ---- */}
      {catalogue.profiles.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Who is measured against which profile</h2>
          </div>
          <Card>
            <CardContent className="divide-y p-0">
              {catalogue.people.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">No people yet. In this showcase they come from the seed.</p>
              ) : (
                catalogue.people.map((person) => (
                  <div key={person._id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                      {initials(person.name)}
                    </span>
                    <Link href={`/learn/people/${person._id}`} className="min-w-[160px] flex-1 hover:underline">
                      <div className="text-sm font-medium">{person.name}</div>
                      <div className="text-[11px] text-muted-foreground">{person.role}</div>
                    </Link>
                    <div className="flex flex-wrap gap-1.5">
                      {catalogue.profiles.map((p) => {
                        const on = person.profileIds.includes(p._id)
                        const busy = saving === `${person._id}-${p._id}`
                        return (
                          <button
                            key={p._id}
                            type="button"
                            disabled={busy}
                            aria-pressed={on}
                            onClick={() => void toggleProfile(person._id, person.profileIds, p._id)}
                            className={cn(
                              "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                              on
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-dashed text-muted-foreground hover:border-primary/40 hover:text-foreground",
                              busy && "opacity-50",
                            )}
                          >
                            {on ? "✓ " : "+ "}
                            {p.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {skillDialog && (
        <SkillDialog
          open
          onOpenChange={(o) => !o && setSkillDialog(null)}
          skill={skillDialog.skill}
          catalogue={catalogue}
        />
      )}
      {profileDialog && (
        <ProfileDialog
          open
          onOpenChange={(o) => !o && setProfileDialog(null)}
          profile={profileDialog.profile}
          catalogue={catalogue}
        />
      )}
    </div>
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
            "rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] hover:border-primary/50",
            i.muted && "border-dashed text-muted-foreground",
          )}
        >
          {i.code}
        </Link>
      ))}
    </div>
  )
}
