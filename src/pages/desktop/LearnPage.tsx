import { useLocation, useSearch } from "wouter"
import { FileCheck2, GraduationCap, Grid3x3, ListChecks, Settings2, UserRound } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { Skeleton } from "@/components/ui/skeleton"
import { TrainingsTab, TrainingsTabPrimary } from "@/components/learn/TrainingsTab"
import { RecordsTab } from "@/components/learn/RecordsTab"
import { SkillMatrixTab } from "@/components/learn/SkillMatrixTab"
import { MyLearningTab } from "@/components/learn/MyLearningTab"
import { SkillsSettings } from "@/components/learn/SkillsSettings"
import { useCheckIn } from "@/lib/checkIn"
import { isEngineerOrAdmin } from "@/lib/roles"

// Learn (CONTEXT.md) is the pillar that builds and keeps up what people can
// do: Trainings (and Rounds), Skills and the proof. One page with a flat row
// of tabs, the tab in ?tab= so other pages can link straight to it. Skill
// setup (Skills, profiles, who is measured, coverage questions) is an
// Engineer-only tab here, not in Settings.
const TABS = [
  { value: "mine", label: "My learning", icon: UserRound, engineerOnly: false },
  { value: "trainings", label: "Trainings", icon: ListChecks, engineerOnly: false },
  { value: "matrix", label: "Skill matrix", icon: Grid3x3, engineerOnly: false },
  { value: "records", label: "Training records", icon: FileCheck2, engineerOnly: false },
  { value: "setup", label: "Skills setup", icon: Settings2, engineerOnly: true },
] as const
type TabValue = (typeof TABS)[number]["value"]

const SUBTITLE: Record<TabValue, string> = {
  mine: "What you need to learn next, your Skills and your records.",
  trainings: "Trainings and Rounds built from published knowledge.",
  matrix: "Who can do what, against the levels each role needs.",
  records: "The proof per person: which Training, which version, and when.",
  setup: "Skills, Skill profiles, who is measured against them, and coverage questions.",
}

function tabKey(personId: string) {
  return `oppr.learn.tab.${personId}`
}
function readTab(personId: string): string | null {
  try {
    return window.localStorage.getItem(tabKey(personId))
  } catch {
    return null
  }
}
function writeTab(personId: string, tab: string) {
  try {
    window.localStorage.setItem(tabKey(personId), tab)
  } catch {
    // Storage blocked: the tab is simply not remembered.
  }
}

export function LearnPage() {
  const search = useSearch()
  const [location, navigate] = useLocation()
  const { person, people } = useCheckIn()
  const engineer = isEngineerOrAdmin(person)
  const hydrated = people !== undefined
  const tabs = TABS.filter((t) => !t.engineerOnly || engineer)
  const allowed = (v: string | null): v is TabValue => tabs.some((t) => t.value === v)

  const fromUrl = new URLSearchParams(search).get("tab")
  // Without ?tab=: the tab this person used last, else My learning for an
  // Operator (or anyone with a Skill profile), else Trainings.
  const remembered = person ? readTab(person._id) : null
  const fallback: TabValue =
    engineer && (person?.profileIds ?? []).length === 0 ? "trainings" : "mine"
  const tab: TabValue = allowed(fromUrl) ? fromUrl : allowed(remembered) ? remembered : fallback

  function pick(v: string) {
    if (person) writeTab(person._id, v)
    navigate(`${location}?tab=${v}`, { replace: true })
  }

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Learn" }]} />
      <PageHeader
        icon={GraduationCap}
        title="Learn"
        subtitle={SUBTITLE[tab]}
        actions={tab === "trainings" ? <TrainingsTabPrimary /> : undefined}
      />
      {!hydrated && (!fromUrl || fromUrl === "setup") ? (
        <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
          <Skeleton className="h-9 w-[520px] max-w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={pick} className="mx-auto w-full max-w-6xl space-y-4 p-6">
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="mine">
            <MyLearningTab />
          </TabsContent>
          <TabsContent value="trainings">
            <TrainingsTab />
          </TabsContent>
          <TabsContent value="matrix">
            <SkillMatrixTab />
          </TabsContent>
          <TabsContent value="records">
            <RecordsTab />
          </TabsContent>
          {engineer && (
            <TabsContent value="setup">
              <SkillsSettings />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  )
}
