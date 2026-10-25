// AI models and jobs (/dev/ai/:tab?): formerly Settings "AI and connections".
// Settings ?tab=ai (and its old aliases) redirects here. The AI usage, Prices
// and Limits and Plan tabs are the AI usage and cost tracker (spec 6.7).
import { DevPage } from "@/components/dev/DevFrame"
import { DEV_TOOL, useDevTab } from "@/components/dev/devTools"
import { ModelsCard, SchedulesCard, SearchIndexCard } from "@/components/dev/ai/AiPanels"
import { AiUsagePanel } from "@/components/dev/ai/AiUsagePanel"
import { AiPricesPanel } from "@/components/dev/ai/AiPricesPanel"
import { AiLimitsPanel } from "@/components/dev/ai/AiLimitsPanel"

const TABS = [
  { value: "models", label: "Models" },
  { value: "index", label: "Search index" },
  { value: "schedules", label: "Schedules" },
  { value: "usage", label: "AI usage" },
  { value: "prices", label: "Prices" },
  { value: "limits", label: "Limits and Plan" },
]

export function DevAiPage() {
  const [tab, go] = useDevTab("/dev/ai", TABS)
  return (
    <DevPage
      tool={DEV_TOOL.ai}
      statusLine="Which model does what, the search index, what runs by itself, and what every AI call costs."
      tabs={TABS}
      tab={tab}
      onTab={go}
    >
      {tab === "models" && <ModelsCard />}
      {tab === "index" && <SearchIndexCard />}
      {tab === "schedules" && <SchedulesCard />}
      {tab === "usage" && <AiUsagePanel />}
      {tab === "prices" && <AiPricesPanel />}
      {tab === "limits" && <AiLimitsPanel />}
    </DevPage>
  )
}
