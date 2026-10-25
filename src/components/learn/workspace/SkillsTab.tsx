import { useMemo, useState } from "react"
import { useMutation } from "convex/react"
import { useLocation, useSearch } from "wouter"
import { toast } from "sonner"
import { Archive, BadgeCheck, ChevronDown, RotateCcw, Search } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { errorText, useLevelNames } from "../skills/skillUi"
import { SkillSheet } from "../skills/SkillEditors"
import { CodeList, type CatalogueSkill, type TabProps } from "./workspaceBits"

const ALL = "all"
const NONE = "none"

/** The Skills table. A row opens the Skill in a side panel; "Add Skill" is the page's primary action. */
export function SkillsTab({
  catalogue,
  workspace,
  engineerId,
  adding,
  onAddingChange,
}: TabProps & { adding: boolean; onAddingChange: (open: boolean) => void }) {
  const names = useLevelNames()
  const [q, setQ] = useState("")
  const [area, setArea] = useState(ALL)
  // The open Skill lives in ?skill= so the Overview and other tabs can link straight to it.
  const search = useSearch()
  const [location, navigate] = useLocation()
  const openId = new URLSearchParams(search).get("skill")
  const setOpenId = (id: string | null) => navigate(id ? `${location}?skill=${id}` : location, { replace: true })
  const [showArchive, setShowArchive] = useState(false)
  const archiveSkill = useMutation(api.skills.archiveSkill)

  async function restore(id: (typeof catalogue.archivedSkills)[number]["_id"], name: string) {
    if (!engineerId) return
    try {
      await archiveSkill({ id, archived: false, engineerPersonId: engineerId })
      toast.success(`Skill "${name}" restored`)
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  const stats = useMemo(() => new Map(workspace.skills.map((s) => [s._id, s])), [workspace.skills])
  const areaLabel = new Map(catalogue.areas.map((a) => [a.code, a.label]))
  const usedAreas = [...new Set(catalogue.skills.map((s) => s.area ?? NONE))].sort()

  const needle = q.trim().toLowerCase()
  const rows = catalogue.skills.filter(
    (s) =>
      (area === ALL || (s.area ?? NONE) === area) &&
      (!needle ||
        s.name.toLowerCase().includes(needle) ||
        s.description.toLowerCase().includes(needle) ||
        (s.area ?? "").toLowerCase().includes(needle) ||
        s.documents.some((d) => d.namingCode.toLowerCase().includes(needle)) ||
        s.trainings.some((t) => t.code.toLowerCase().includes(needle))),
  )
  const groups = new Map<string, CatalogueSkill[]>()
  for (const s of rows) groups.set(s.area ?? NONE, [...(groups.get(s.area ?? NONE) ?? []), s])
  const open = catalogue.skills.find((s) => s._id === openId) ?? null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Skills, codes"
            aria-label="Search Skills"
            className="h-9 pl-8"
          />
        </div>
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger className="h-9 w-[200px] text-xs" aria-label="Area">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-xs">
              All areas
            </SelectItem>
            {usedAreas.map((a) => (
              <SelectItem key={a} value={a} className="text-xs">
                {a === NONE ? "No area" : `${a} · ${areaLabel.get(a) ?? a}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {rows.length} of {catalogue.skills.length} Skills
        </span>
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
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Skill</th>
                  <th className="px-3 py-2 text-left font-medium">Needed by</th>
                  <th className="px-3 py-2 text-left font-medium">Proved by</th>
                  <th className="px-3 py-2 text-left font-medium" title="Each person counts once, at the level they hold now">
                    People by level held
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Level expires after</th>
                </tr>
              </thead>
              {[...groups].map(([code, skills]) => (
                <tbody key={code} className="divide-y border-b last:border-b-0">
                  <tr className="bg-muted/15">
                    <th colSpan={5} scope="colgroup" className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">
                      {code === NONE ? "No area" : <><span className="font-mono">{code}</span> · {areaLabel.get(code) ?? code}</>}
                    </th>
                  </tr>
                  {skills.map((s) => {
                    const st = stats.get(s._id)
                    const needed = catalogue.profiles.flatMap((p) => {
                      const t = p.targets.find((x) => x.skillId === s._id)
                      return t ? [{ _id: p._id, name: p.name, level: t.level }] : []
                    })
                    const stale = st ? st.expired + st.expiring + st.retrain : 0
                    return (
                      <tr
                        key={s._id}
                        tabIndex={0}
                        onClick={() => setOpenId(s._id)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpenId(s._id))}
                        className={cn(
                          "cursor-pointer align-top hover:bg-muted/30 focus-visible:bg-muted/40 focus-visible:outline-none",
                          openId === s._id && "bg-primary/5",
                        )}
                        aria-label={`Open ${s.name}`}
                      >
                        <td className="max-w-[300px] px-4 py-2.5">
                          <div className="text-sm font-medium">{s.name}</div>
                          {s.description && <div className="line-clamp-2 text-muted-foreground">{s.description}</div>}
                        </td>
                        <td className="px-3 py-2.5">
                          {needed.length === 0 ? (
                            <span className="text-muted-foreground">No profile</span>
                          ) : (
                            <div className="flex max-w-[260px] flex-wrap gap-1">
                              {needed.map((p) => (
                                <span
                                  key={p._id}
                                  className="rounded border bg-muted/40 px-1.5 py-0.5"
                                  title={`${p.name} needs level ${p.level}, ${names[p.level]}`}
                                >
                                  {p.name} <span className="text-muted-foreground">at</span>{" "}
                                  <span className="font-semibold tabular-nums">{p.level}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          {s.trainings.length === 0 ? (
                            <span className="text-amber-700 dark:text-amber-400">No Training</span>
                          ) : (
                            <CodeList
                              className="max-w-[220px]"
                              items={s.trainings.map((t) => ({
                                key: t._id,
                                code: t.code,
                                title: `${t.title}${t.published ? "" : " (not published)"}`,
                                href: `/learn/trainings/${t._id}`,
                                muted: !t.published,
                              }))}
                              empty=""
                            />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {st ? (
                            <div className="space-y-0.5">
                              {st.atLevel.map((n, i) => (
                                <div key={i} className={cn(n === 0 && "text-muted-foreground")}>
                                  <span className="inline-block w-5 font-semibold tabular-nums">{n}</span>
                                  {names[i + 1]}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="tabular-nums">{s.holders}</span>
                          )}
                          {stale > 0 && (
                            <span className="mt-0.5 block text-amber-700 dark:text-amber-400">
                              {[st?.retrain && `${st.retrain} re-train`, st?.expired && `${st.expired} expired`, st?.expiring && `${st.expiring} expiring`]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                          {s.validityMonths ? `${s.validityMonths} months` : "Never"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              ))}
            </table>
            {rows.length === 0 && (
              <p className="p-4 text-center text-xs text-muted-foreground">No Skill matches "{q.trim()}".</p>
            )}
          </div>
        </Card>
      )}

      {catalogue.archivedSkills.length > 0 && (
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
            aria-expanded={showArchive}
            onClick={() => setShowArchive((v) => !v)}
          >
            <Archive className="h-3.5 w-3.5" />
            Archive ({catalogue.archivedSkills.length})
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showArchive && "rotate-180")} />
          </Button>
          {showArchive && (
            <Card>
              <CardContent className="divide-y p-0">
                {catalogue.archivedSkills.map((s) => (
                  <div key={s._id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.name}</span>
                    {s.area && <span className="font-mono text-xs text-muted-foreground">{s.area}</span>}
                    {engineerId && (
                      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => void restore(s._id, s.name)}>
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <SkillSheet
        open={open !== null || adding}
        onOpenChange={(o) => {
          if (o) return
          setOpenId(null)
          onAddingChange(false)
        }}
        skill={adding ? null : open}
        catalogue={catalogue}
        workspace={workspace}
        engineerPersonId={engineerId}
      />
    </div>
  )
}
