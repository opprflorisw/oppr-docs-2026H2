import { TopBar } from "@/components/layout/TopBar"

// SCAFFOLD placeholder page, owned by the Trainings track. Keep the export name:
// it is already routed in App.tsx.
// /learn/trainings/:id: one Training, its objectives, stops, versions, sign-offs and records; start an Attempt.
export function TrainingPage() {
  return (
    <div className="flex h-full flex-col">
      <TopBar breadcrumb={[{ label: "Training" }]} />
      <div className="p-6 text-sm text-muted-foreground">Coming in this build.</div>
    </div>
  )
}
