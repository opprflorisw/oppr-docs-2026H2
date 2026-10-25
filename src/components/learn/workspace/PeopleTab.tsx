import { useMemo, useState } from "react"
import { useMutation } from "convex/react"
import { Link } from "wouter"
import { toast } from "sonner"
import { Plus, Search, Users, X } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { initials } from "@/lib/checkIn"
import { KIND_LABEL } from "@/lib/roles"
import { cn } from "@/lib/utils"
import { errorText } from "../skills/skillUi"
import type { TabProps } from "./workspaceBits"

type Filter = "all" | "measured" | "below" | "unmeasured"

/** Who is on which Skill profile, how they measure up, and bulk assign. */
export function PeopleTab({ catalogue, workspace, engineerId }: TabProps) {
  const assignProfiles = useMutation(api.people.assignProfiles)
  const setMembers = useMutation(api.skills.setProfileMembers)
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [selected, setSelected] = useState<Set<Id<"people">>>(new Set())
  const [bulkProfile, setBulkProfile] = useState<string>("")
  const [busy, setBusy] = useState<string | null>(null)

  const stats = useMemo(() => new Map(workspace.people.map((p) => [p._id, p])), [workspace.people])
  const needle = q.trim().toLowerCase()
  const rows = catalogue.people.filter((p) => {
    const st = stats.get(p._id)
    if (needle && !p.name.toLowerCase().includes(needle) && !p.role.toLowerCase().includes(needle)) return false
    if (filter === "measured") return !!st?.measured
    if (filter === "unmeasured") return !st?.measured
    if (filter === "below") return !!st && st.measured && st.atTarget < st.targets
    return true
  })
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r._id))

  async function toggle(personId: Id<"people">, current: Id<"skillProfiles">[], profileId: Id<"skillProfiles">) {
    if (!engineerId) return
    const next = current.includes(profileId) ? current.filter((x) => x !== profileId) : [...current, profileId]
    setBusy(`${personId}-${profileId}`)
    try {
      await assignProfiles({ personId, profileIds: next, engineerPersonId: engineerId })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  async function bulk(on: boolean) {
    if (!engineerId || !bulkProfile) return
    const profile = catalogue.profiles.find((p) => p._id === bulkProfile)
    setBusy("bulk")
    try {
      const { changed } = await setMembers({
        profileId: bulkProfile as Id<"skillProfiles">,
        personIds: [...selected],
        on,
        engineerPersonId: engineerId,
      })
      toast.success(
        changed === 0
          ? "Nothing changed"
          : `${changed} ${changed === 1 ? "person" : "people"} ${on ? "put on" : "taken off"} ${profile?.name ?? "the profile"}`,
      )
      setSelected(new Set())
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" className="h-9 pl-8" />
        </div>
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && setFilter(v as Filter)}
          className="rounded-md border p-0.5"
          aria-label="Show"
        >
          {(
            [
              ["all", "Everyone"],
              ["measured", "Measured"],
              ["below", "Below target"],
              ["unmeasured", "Not measured"],
            ] as const
          ).map(([v, label]) => (
            <ToggleGroupItem key={v} value={v} className="h-7 px-2.5 text-xs">
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="ml-auto text-xs text-muted-foreground">
          {workspace.counts.measured} of {workspace.counts.people} measured
        </span>
      </div>

      {engineerId && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="region" aria-label="Bulk assign">
          <span className="font-medium">{selected.size} selected</span>
          <Select value={bulkProfile} onValueChange={setBulkProfile}>
            <SelectTrigger className="h-8 w-[220px] bg-background text-xs" aria-label="Skill profile">
              <SelectValue placeholder="Pick a Skill profile" />
            </SelectTrigger>
            <SelectContent>
              {catalogue.profiles.map((p) => (
                <SelectItem key={p._id} value={p._id} className="text-xs">
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-xs" disabled={!bulkProfile || busy !== null} onClick={() => void bulk(true)}>
            Put on profile
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!bulkProfile || busy !== null} onClick={() => void bulk(false)}>
            Take off profile
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto h-8 text-xs" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b bg-muted/30 text-muted-foreground">
              <tr>
                {engineerId && (
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      checked={allSelected}
                      aria-label="Select everyone shown"
                      onCheckedChange={(on) => setSelected(on ? new Set(rows.map((r) => r._id)) : new Set())}
                    />
                  </th>
                )}
                <th className="px-3 py-2 text-left font-medium">Person</th>
                <th className="px-3 py-2 text-left font-medium">Against their profile</th>
                <th className="px-3 py-2 text-left font-medium">Skill profiles</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((person) => {
                const st = stats.get(person._id)
                const pct = st && st.targets > 0 ? Math.round((st.atTarget / st.targets) * 100) : 0
                const done = !!st && st.targets > 0 && st.atTarget === st.targets
                return (
                  <tr key={person._id} className={cn("align-middle hover:bg-muted/20", selected.has(person._id) && "bg-primary/5")}>
                    {engineerId && (
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={selected.has(person._id)}
                          aria-label={`Select ${person.name}`}
                          onCheckedChange={(on) => {
                            const next = new Set(selected)
                            if (on) next.add(person._id)
                            else next.delete(person._id)
                            setSelected(next)
                          }}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <Link href={`/learn/people/${person._id}`} className="flex items-center gap-2.5 hover:underline">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {initials(person.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{person.name}</span>
                          <span className="block text-muted-foreground">
                            {person.role} · {KIND_LABEL[person.kind]}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="min-w-[160px] px-3 py-2">
                      {!st?.measured ? (
                        <span className="text-muted-foreground">Not measured</span>
                      ) : st.targets === 0 ? (
                        <span className="text-muted-foreground">Profile has no levels yet</span>
                      ) : (
                        <div className="space-y-1">
                          <span className={cn("tabular-nums", !done && "text-amber-700 dark:text-amber-400")}>
                            {st.atTarget} of {st.targets} {st.targets === 1 ? "Skill" : "Skills"} at the needed level
                          </span>
                          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                            <div className={cn("h-full rounded-full", done ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {catalogue.profiles
                          .filter((p) => person.profileIds.includes(p._id))
                          .map((p) => {
                            const isBusy = busy === `${person._id}-${p._id}`
                            return (
                              <span
                                key={p._id}
                                className={cn(
                                  "inline-flex min-h-7 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-0.5 pl-2.5 text-xs text-primary",
                                  engineerId ? "pr-1" : "pr-2.5",
                                  isBusy && "opacity-50",
                                )}
                              >
                                {p.name}
                                {engineerId && (
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    aria-label={`Take ${person.name} off ${p.name}`}
                                    onClick={() => void toggle(person._id, person.profileIds, p._id)}
                                    className="rounded-full p-0.5 hover:bg-background hover:text-red-600"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </span>
                            )
                          })}
                        {person.profileIds.length === 0 && !engineerId && <span className="text-muted-foreground">None</span>}
                        {engineerId && catalogue.profiles.some((p) => !person.profileIds.includes(p._id)) && (
                          <Select value="" onValueChange={(id) => void toggle(person._id, person.profileIds, id as Id<"skillProfiles">)}>
                            <SelectTrigger
                              className="h-7 w-auto gap-1 rounded-full border-dashed px-2.5 text-xs text-muted-foreground"
                              aria-label={`Put ${person.name} on a Skill profile`}
                            >
                              <Plus className="h-3 w-3" />
                              <SelectValue placeholder={person.profileIds.length === 0 ? "Put on a profile" : "Profile"} />
                            </SelectTrigger>
                            <SelectContent>
                              {catalogue.profiles
                                .filter((p) => !person.profileIds.includes(p._id))
                                .map((p) => (
                                  <SelectItem key={p._id} value={p._id} className="text-xs">
                                    {p.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        )}
                        {catalogue.profiles.length === 0 && <span className="text-muted-foreground">No Skill profiles yet</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="flex flex-col items-center gap-1 p-6 text-center text-xs text-muted-foreground">
              <Users className="h-6 w-6" />
              Nobody here.
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
