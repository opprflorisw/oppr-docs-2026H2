// The Skills workspace (CONTEXT.md: Learn, Skill, Skill profile): one page
// inside Learn to set up and look after Skills. The tab is in the path
// (/learn/skills/profiles) so other pages can link straight to it. Engineers
// and Admins change things; everyone else can look.
import { useState } from "react"
import { useLocation, useRoute } from "wouter"
import { useQuery } from "convex/react"
import { BadgeCheck, Plus } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader, type HeaderAction } from "@/components/layout/PageHeader"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { useCheckIn } from "@/lib/checkIn"
import { isEngineerOrAdmin } from "@/lib/roles"
import { ReadOnlyNote, tabHref, type WorkspaceTab } from "@/components/learn/workspace/workspaceBits"
import { OverviewTab } from "@/components/learn/workspace/OverviewTab"
import { SkillsTab } from "@/components/learn/workspace/SkillsTab"
import { ProfilesTab } from "@/components/learn/workspace/ProfilesTab"
import { PeopleTab } from "@/components/learn/workspace/PeopleTab"
import { ProvedByTab } from "@/components/learn/workspace/ProvedByTab"
import { LevelsTab } from "@/components/learn/workspace/LevelsTab"
import { CoverageTab } from "@/components/learn/workspace/CoverageTab"

const TABS: { value: WorkspaceTab; label: string; lead: string }[] = [
  { value: "overview", label: "Overview", lead: "Where Skills are set up. How it works, with live counts, and what needs attention." },
  { value: "skills", label: "Skills", lead: "Every Skill, who needs it, what proves it and who holds it." },
  { value: "profiles", label: "Skill profiles", lead: "The level each role needs per Skill." },
  { value: "people", label: "People", lead: "Who is measured against which Skill profile." },
  { value: "trainings", label: "Trainings", lead: "Which Training proves which Skill, and the gaps both ways." },
  { value: "levels", label: "Levels and rules", lead: "Level names and when a level goes stale." },
  { value: "coverage", label: "Coverage questions", lead: "The questions a shift lead asks every day, with today's answer." },
]

// Words people may type or old links may carry.
const ALIASES: Record<string, WorkspaceTab> = {
  profile: "profiles",
  "skill-profiles": "profiles",
  proved: "trainings",
  "proved-by": "trainings",
  rules: "levels",
  "skill-levels": "levels",
  questions: "coverage",
}

export function SkillsWorkspacePage() {
  const [, params] = useRoute<{ tab: string }>("/learn/skills/:tab")
  const [, navigate] = useLocation()
  const raw = params?.tab ?? "overview"
  const tab: WorkspaceTab = TABS.some((t) => t.value === raw) ? (raw as WorkspaceTab) : ALIASES[raw] ?? "overview"
  const meta = TABS.find((t) => t.value === tab)!

  const { person } = useCheckIn()
  const engineerId = isEngineerOrAdmin(person) ? person._id : null
  const catalogue = useQuery(api.skills.catalogue)
  const workspace = useQuery(api.skills.workspace)
  const [adding, setAdding] = useState<"skill" | "profile" | "question" | null>(null)

  let primary: HeaderAction | undefined
  if (engineerId && tab === "skills") primary = { label: "Add Skill", icon: Plus, onClick: () => setAdding("skill") }
  if (engineerId && tab === "profiles")
    primary = {
      label: "Add profile",
      icon: Plus,
      onClick: () => setAdding("profile"),
      disabled: catalogue?.skills.length === 0,
      disabledReason: "Add a Skill first",
    }
  if (engineerId && tab === "coverage")
    primary = {
      label: "Add question",
      icon: Plus,
      onClick: () => setAdding("question"),
      disabled: catalogue?.profiles.length === 0,
      disabledReason: "Add a Skill profile first",
    }

  const ready = catalogue !== undefined && workspace !== undefined
  const props = ready ? { catalogue, workspace, engineerId } : null

  return (
    <div className="flex flex-col">
      <TopBar
        breadcrumb={
          tab === "overview"
            ? [{ label: "Learn", href: "/learn" }, { label: "Skills workspace" }]
            : [{ label: "Learn", href: "/learn" }, { label: "Skills workspace", href: "/learn/skills" }, { label: meta.label }]
        }
      />
      <PageHeader
        icon={BadgeCheck}
        title={tab === "overview" ? "Skills workspace" : meta.label}
        statusLine={meta.lead}
        documentTitle={tab === "overview" ? "Skills workspace · Learn" : `${meta.label} · Skills workspace`}
        primary={primary}
      />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setAdding(null)
          navigate(tabHref(v as WorkspaceTab))
        }}
        className="mx-auto w-full max-w-[1400px] space-y-4 p-6"
      >
        <TabsList className="h-auto flex-wrap justify-start" data-tour="learn-workspace-tabs">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} data-tour={`learn-workspace-tab-${t.value}`}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {!engineerId && <ReadOnlyNote what="Skills, profiles and who is measured" />}

        {!props ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            <TabsContent value="overview" className="mt-0">
              <OverviewTab {...props} />
            </TabsContent>
            <TabsContent value="skills" className="mt-0">
              <SkillsTab {...props} adding={adding === "skill"} onAddingChange={(o) => setAdding(o ? "skill" : null)} />
            </TabsContent>
            <TabsContent value="profiles" className="mt-0">
              <ProfilesTab {...props} adding={adding === "profile"} onAddingChange={(o) => setAdding(o ? "profile" : null)} />
            </TabsContent>
            <TabsContent value="people" className="mt-0">
              <PeopleTab {...props} />
            </TabsContent>
            <TabsContent value="trainings" className="mt-0">
              <ProvedByTab {...props} />
            </TabsContent>
            <TabsContent value="levels" className="mt-0">
              <LevelsTab {...props} />
            </TabsContent>
            <TabsContent value="coverage" className="mt-0">
              <CoverageTab {...props} adding={adding === "question"} onAddingChange={(o) => setAdding(o ? "question" : null)} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}
