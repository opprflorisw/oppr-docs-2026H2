import { Link, Redirect, useLocation, useSearch } from "wouter"
import { BadgeCheck, ChevronRight, FileCheck2, GraduationCap, Grid3x3, ListChecks, UserRound } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { Skeleton } from "@/components/ui/skeleton"
import { TrainingsTab, TrainingsTabPrimary } from "@/components/learn/TrainingsTab"
import { RecordsTab } from "@/components/learn/RecordsTab"
import { SkillMatrixTab } from "@/components/learn/SkillMatrixTab"
import { MyLearningTab } from "@/components/learn/MyLearningTab"
import { useCheckIn } from "@/lib/checkIn"
import { isEngineerOrAdmin } from "@/lib/roles"
import { useAskPageScope } from "@/components/ai/AskDock"

// Learn (CONTEXT.md) is the pillar that builds and keeps up what people can
// do: Trainings (and Rounds), Skills and the proof. One page with a flat row
// of tabs, the tab in ?tab= so other pages can link straight to it. Setting
// up Skills (Skills, profiles, who is measured, coverage questions, levels)
// is the Skills workspace, its own page at /learn/skills.
const TABS = [
  { value: "mine", label: "My learning", icon: UserRound, engineerOnly: false },
  { value: "trainings", label: "Trainings", icon: ListChecks, engineerOnly: false },
  { value: "matrix", label: "Skill matrix", icon: Grid3x3, engineerOnly: false },
  { value: "records", label: "Training records", icon: FileCheck2, engineerOnly: false },
] as const
type TabValue = (typeof TABS)[number]["value"]

const SUBTITLE: Record<TabValue, string> = {
  mine: "What you need to learn next, your Skills and your records.",
  trainings: "Trainings and Rounds built from published knowledge.",
  matrix: "Who can do what, against the levels each role needs.",
  records: "The proof per person: which Training, which version, and when.",
}

const SKILLS_SCOPE = { kind: "skills" } as const

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
  // On the Skill matrix, Ask answers from the matrix too.
  useAskPageScope(tab === "matrix" ? SKILLS_SCOPE : null)

  function pick(v: string) {
    if (person) writeTab(person._id, v)
    navigate(`${location}?tab=${v}`, { replace: true })
  }

  // The old Skills setup tab is the Skills workspace now.
  if (fromUrl === "setup") return <Redirect to="/learn/skills" replace />

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Learn" }]} />
      <PageHeader
        icon={GraduationCap}
        title="Learn"
        subtitle={SUBTITLE[tab]}
        actions={tab === "trainings" ? <TrainingsTabPrimary /> : undefined}
      />
      {!hydrated && !fromUrl ? (
        <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
          <Skeleton className="h-9 w-[520px] max-w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={pick} className="mx-auto w-full max-w-6xl space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <TabsList>
              {tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="gap-1.5" data-tour={`learn-tab-${t.value}`}>
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <Link
              href="/learn/skills"
              data-tour="learn-skills-workspace-link"
              title="Set up Skills, Skill profiles, who is measured and which Training proves what"
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-muted"
            >
              <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
              {engineer ? "Set up Skills" : "How Skills are set up"}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            </Link>
          </div>
          {tab === "matrix" && (
            <p className="text-xs text-muted-foreground">
              The Skill matrix shows who holds what. To add Skills, change the levels a profile needs, put people on a
              profile or link the Trainings that prove a Skill, go to the{" "}
              <Link href="/learn/skills" className="font-medium text-primary underline-offset-2 hover:underline">
                Skills workspace
              </Link>
              .
            </p>
          )}
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
        </Tabs>
      )}
    </div>
  )
}
