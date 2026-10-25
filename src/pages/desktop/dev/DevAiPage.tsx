// AI models and jobs (/dev/ai/:tab?): formerly Settings "AI and connections".
// Settings ?tab=ai (and its old aliases) redirects here.
import { DevPage } from "@/components/dev/DevFrame"
import { DEV_TOOL, useDevTab } from "@/components/dev/devTools"
import { ModelsCard, SchedulesCard, SearchIndexCard, UsageHints } from "@/components/dev/ai/AiPanels"

const TABS = [
  { value: "models", label: "Models" },
  { value: "index", label: "Search index" },
  { value: "schedules", label: "Schedules" },
  { value: "usage", label: "Usage" },
]

export function DevAiPage() {
  const [tab, go] = useDevTab("/dev/ai", TABS)
  return (
    <DevPage
      tool={DEV_TOOL.ai}
      statusLine="Which model does what, the search index, what runs by itself and where usage shows."
      tabs={TABS}
      tab={tab}
      onTab={go}
    >
      {tab === "models" && <ModelsCard />}
      {tab === "index" && <SearchIndexCard />}
      {tab === "schedules" && <SchedulesCard />}
      {tab === "usage" && <UsageHints />}
    </DevPage>
  )
}
