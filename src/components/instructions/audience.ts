// Who sees which tour and which step (Instructions).
// Operators see what is for Operators; Engineers also see what is for
// Engineers; Admins see everything. Developer tours follow the Developer
// group in the nav: Engineers and Admins only. Anonymous counts as an
// Operator, since that is the default on the floor.
import { useCheckIn } from "@/lib/checkIn"
import type { Audience, Tour, TourStep } from "./types"
import { TOURS } from "./tours"

export function canSee(audience: Audience[] | undefined, kind: Audience): boolean {
  if (!audience || audience.length === 0) return true
  if (kind === "admin") return true
  if (kind === "engineer") return audience.includes("operator") || audience.includes("engineer")
  return audience.includes("operator")
}

export function canSeeTour(tour: Tour, kind: Audience): boolean {
  if (tour.area === "developer" && kind === "operator") return false
  return canSee(tour.audience, kind)
}

export function visibleSteps(tour: Tour, kind: Audience): TourStep[] {
  return tour.steps.filter((s) => canSee(s.audience, kind))
}

export function visibleTours(kind: Audience): Tour[] {
  return TOURS.filter((t) => canSeeTour(t, kind))
}

/**
 * The checked-in person's kind (archived people count as Operators), their
 * id for progress, and whether the people list has loaded.
 */
export function useTourViewer(): {
  kind: Audience
  personId: string | null
  checkedIn: boolean
  ready: boolean
} {
  const { person, people } = useCheckIn()
  const kind: Audience = person && !person.archived ? person.kind : "operator"
  return { kind, personId: person?._id ?? null, checkedIn: !!person, ready: people !== undefined }
}

export const AUDIENCE_LABEL: Record<Audience, string> = {
  operator: "Operators",
  engineer: "Engineers",
  admin: "Admins",
}

export function audienceText(audience: Audience[]): string {
  const names = (["operator", "engineer", "admin"] as const)
    .filter((a) => audience.includes(a))
    .map((a) => AUDIENCE_LABEL[a])
  if (names.length <= 1) return names[0] ?? "Everyone"
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}
