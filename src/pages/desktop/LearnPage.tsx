import { useLocation, useSearch } from "wouter"
import { FileCheck2, GraduationCap, Grid3x3, ListChecks, UserRound } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { TrainingsTab } from "@/components/learn/TrainingsTab"
import { RecordsTab } from "@/components/learn/RecordsTab"
import { SkillMatrixTab } from "@/components/learn/SkillMatrixTab"
import { MyLearningTab } from "@/components/learn/MyLearningTab"

// Learn (CONTEXT.md) is the pillar that builds and keeps up what people can
// do: Trainings (and Rounds), Skills and the proof. One page with a flat row
// of tabs, the tab in ?tab= so other pages can link straight to it.
const TABS = [
  { value: "mine", label: "My learning", icon: UserRound },
  { value: "trainings", label: "Trainings", icon: ListChecks },
  { value: "matrix", label: "Skill matrix", icon: Grid3x3 },
  { value: "records", label: "Training records", icon: FileCheck2 },
] as const
type TabValue = (typeof TABS)[number]["value"]

export function LearnPage() {
  const search = useSearch()
  const [location, navigate] = useLocation()
  const fromUrl = new URLSearchParams(search).get("tab")
  const tab: TabValue = TABS.some((t) => t.value === fromUrl) ? (fromUrl as TabValue) : "mine"

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Learn" }]} />
      <PageHeader
        icon={GraduationCap}
        title="Learn"
        subtitle="Trainings built from published knowledge, the skills they prove, and the records behind them."
      />
      <Tabs
        value={tab}
        onValueChange={(v) => navigate(`${location}?tab=${v}`, { replace: true })}
        className="mx-auto w-full max-w-6xl space-y-4 p-6"
      >
        <TabsList>
          {TABS.map((t) => (
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
      </Tabs>
    </div>
  )
}
