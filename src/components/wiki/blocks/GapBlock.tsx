import { CircleDashed } from "lucide-react"

/** Written by code, not a claim (spec 2.2): the section's instruction found nothing Published. */
export function GapBlock() {
  return (
    <p className="flex items-center gap-2 text-sm italic text-muted-foreground">
      <CircleDashed className="h-4 w-4 shrink-0" aria-hidden />
      No Published document covers this yet.
    </p>
  )
}
