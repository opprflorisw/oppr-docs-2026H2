import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { api } from "../../../convex/_generated/api"
import type { Doc } from "../../../convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { initials, useCheckIn } from "@/lib/checkIn"
import { errorText, SHIFT_META, SHIFT_ORDER, shiftKey } from "@/components/learn/skills/skillUi"

const NONE = "none"

// The People tab of Settings. Showcase people are seeded; they are not login
// accounts, they are who someone can check in as. An Engineer sets each
// person's shift and team, which shift cover and the Skill matrix group by.
export function PeopleSettings() {
  const people = useQuery(api.people.list)
  const { person: me } = useCheckIn()
  const engineer = me?.kind === "engineer" ? me : null
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        The Operators and Engineers people can check in as. They are not login accounts. In this showcase they come
        from the seed. The shift decides who counts for shift cover.
      </p>
      {!engineer && (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Check in as an Engineer to change someone's shift or team.
        </p>
      )}
      <Card>
        <CardContent className="divide-y p-0">
          {people === undefined ? (
            <p className="p-4 text-xs text-muted-foreground">Loading…</p>
          ) : people.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">
              No people yet. In this showcase they come from the seed: run{" "}
              <code className="font-mono">npx convex run seedKnowledge:run</code>.
            </p>
          ) : (
            people.map((p) => <PersonRow key={p._id} person={p} engineerId={engineer?._id ?? null} />)
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function PersonRow({ person, engineerId }: { person: Doc<"people">; engineerId: Doc<"people">["_id"] | null }) {
  const save = useMutation(api.coverageQuestions.setPersonShift)
  const stored = person.shift ?? null
  // Without a stored shift, the role text says it ("Line operator, late shift").
  const fromRole = shiftKey(person.role)
  const [team, setTeam] = useState(person.team ?? "")

  async function update(shift: "early" | "late" | "night" | "day" | null, nextTeam: string) {
    if (!engineerId) return
    try {
      await save({ personId: person._id, shift, team: nextTeam.trim() || null, engineerPersonId: engineerId })
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
        {initials(person.name)}
      </span>
      <div className="min-w-[180px] flex-1">
        <div className="text-sm font-medium">{person.name}</div>
        <div className="text-xs text-muted-foreground">{person.role}</div>
      </div>
      <Select
        value={stored ?? NONE}
        disabled={!engineerId}
        onValueChange={(v) => void update(v === NONE ? null : (v as "early" | "late" | "night"), team)}
      >
        <SelectTrigger className="h-8 w-[170px] text-xs" aria-label={`Shift of ${person.name}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE} className="text-xs">
            {fromRole ? `From role: ${SHIFT_META[fromRole].short}` : "No shift"}
          </SelectItem>
          {SHIFT_ORDER.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">
              {SHIFT_META[s].label} ({SHIFT_META[s].hours})
            </SelectItem>
          ))}
          {stored === "day" && (
            <SelectItem value="day" className="text-xs">
              Day
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      <Input
        value={team}
        disabled={!engineerId}
        onChange={(e) => setTeam(e.target.value)}
        onBlur={() => team.trim() !== (person.team ?? "") && void update(stored, team)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder="Team"
        aria-label={`Team of ${person.name}`}
        className="h-8 w-[140px] text-xs"
        maxLength={60}
      />
      <Badge variant={person.kind === "engineer" ? "default" : "secondary"} className="capitalize">
        {person.kind}
      </Badge>
    </div>
  )
}
