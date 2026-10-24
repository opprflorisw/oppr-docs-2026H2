import { TopBar } from "@/components/layout/TopBar"

// SCAFFOLD placeholder page, owned by the Trainings track. Keep the export name:
// it is already routed in App.tsx.
// /learn/attempts/:id: doing (or reviewing) one Attempt; every question cites its source.
export function AttemptPage() {
  return (
    <div className="flex h-full flex-col">
      <TopBar breadcrumb={[{ label: "Attempt" }]} />
      <div className="p-6 text-sm text-muted-foreground">Coming in this build.</div>
    </div>
  )
}
