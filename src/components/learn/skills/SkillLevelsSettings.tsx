import { useEffect, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { api } from "../../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useCheckIn } from "@/lib/checkIn"
import { isEngineerOrAdmin } from "@/lib/roles"
import { DEFAULT_LEVEL_NAMES } from "@/lib/skillLevelNames"
import { errorText, LevelDots } from "./skillUi"

// What each level stands for stays fixed (CONTEXT.md: Skill); only its name
// is the plant's own, for example an ILUO scale.
const MEANING = [
  "Has not passed a Training for this Skill.",
  "Passed a Training. Set automatically.",
  "A trainer or Engineer watched them do it and signed off.",
  "Can train others. Signed off by an Engineer.",
]

const ILUO = ["Not started (I)", "Learning (L)", "Under supervision (U)", "Can teach (O)"]

/** Settings, People and roles: rename the four Skill levels. */
export function SkillLevelsSettings() {
  const saved = useQuery(api.people.levels.list)
  const { person: me } = useCheckIn()
  const editorId = isEngineerOrAdmin(me) ? me._id : null
  const rename = useMutation(api.people.levels.rename)
  const [names, setNames] = useState<string[]>([...DEFAULT_LEVEL_NAMES])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (saved) setNames(saved)
  }, [saved])

  const dirty = !!saved && names.some((n, i) => n.trim() !== saved[i])
  const isDefault = names.every((n, i) => n.trim() === DEFAULT_LEVEL_NAMES[i])
  const blocked = names.some((n) => !n.trim())
    ? "Give every level a name."
    : new Set(names.map((n) => n.trim().toLowerCase())).size < 4
      ? "Give every level a different name."
      : null

  async function save() {
    if (!editorId || blocked) return
    setBusy(true)
    try {
      await rename({ names, personId: editorId })
      toast.success("Skill level names saved. They show everywhere now.")
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        What each level means stays the same. The names show in the Skill matrix, on people's Skills and on the phone.
      </p>
      {!editorId && (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Check in as an Engineer or Admin to rename the levels.
        </p>
      )}
      <Card>
        <CardContent className="divide-y p-0">
          {names.map((n, level) => (
            <div key={level} className="flex flex-wrap items-center gap-3 px-4 py-2.5" data-level={level}>
              <span className="w-6 text-sm font-semibold tabular-nums text-muted-foreground">{level}</span>
              <span className="w-12">
                <LevelDots level={level} target={null} status={level === 0 ? "none" : "ok"} />
              </span>
              <Input
                value={n}
                disabled={!editorId}
                onChange={(e) => setNames(names.map((x, i) => (i === level ? e.target.value : x)))}
                onKeyDown={(e) => e.key === "Enter" && void save()}
                aria-label={`Name of level ${level}`}
                className="h-8 w-[220px] text-sm"
                maxLength={30}
              />
              <span className="min-w-[200px] flex-1 text-xs text-muted-foreground">{MEANING[level]}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center gap-2">
        {dirty ? (
          <>
            <Button disabled={!editorId || busy || !!blocked} title={blocked ?? undefined} onClick={() => void save()}>
              Save level names
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => saved && setNames(saved)}>
              Undo changes
            </Button>
          </>
        ) : (
          editorId && <span className="text-xs text-muted-foreground">Change a name and save it here.</span>
        )}
        {editorId && (
          <span className="ml-auto flex flex-wrap gap-1 text-xs text-muted-foreground">
            Start from
            <button
              type="button"
              className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
              disabled={isDefault}
              onClick={() => setNames([...DEFAULT_LEVEL_NAMES])}
            >
              the standard names
            </button>
            or
            <button
              type="button"
              className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
              title="I, L, U, O: a common shop-floor scale from not started to can teach"
              onClick={() => setNames([...ILUO])}
            >
              the ILUO scale (I, L, U, O)
            </button>
          </span>
        )}
        {blocked && <p className="w-full text-xs text-destructive">{blocked}</p>}
      </div>
    </div>
  )
}
