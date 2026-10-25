// Embeddings lab (/dev/embeddings/:tab?): EmbeddingGemma 2 in this browser,
// next to the production gemini-embedding-2 search. Experiment only: every
// vector stays in this tab and nothing is written back to Convex.
import { DevPage } from "@/components/dev/DevFrame"
import { DEV_TOOL, useDevTab } from "@/components/dev/devTools"
import { CompareTab } from "@/components/dev/embeddings/CompareTab"
import { ImagesTab } from "@/components/dev/embeddings/ImagesTab"
import { TestSetTab } from "@/components/dev/embeddings/TestSetTab"
import { ModelsTab } from "@/components/dev/embeddings/ModelsTab"

const TABS = [
  { value: "compare", label: "Compare" },
  { value: "images", label: "Images" },
  { value: "test-set", label: "Test set" },
  { value: "models", label: "Models" },
]

export function EmbeddingsLabPage() {
  const [tab, go] = useDevTab("/dev/embeddings", TABS)
  return (
    <DevPage
      tool={DEV_TOOL.embeddings}
      statusLine="Runs on this computer, in the browser. Nothing is written back; production search is untouched."
      tabs={TABS}
      tab={tab}
      onTab={go}
    >
      {tab === "compare" && <CompareTab />}
      {tab === "images" && <ImagesTab />}
      {tab === "test-set" && <TestSetTab />}
      {tab === "models" && <ModelsTab />}
    </DevPage>
  )
}
