import type { Doc } from "../../convex/_generated/dataModel"

// Mirrors convex/lib/roles.ts: an Admin passes every Engineer check, and an
// archived person passes none.
type Kinded = Pick<Doc<"people">, "kind"> & { archived?: boolean }

export function isEngineerOrAdmin<T extends Kinded>(person: T | null | undefined): person is T & { kind: "engineer" | "admin" } {
  if (!person || person.archived) return false
  return person.kind === "engineer" || person.kind === "admin"
}

export function isAdmin<T extends Kinded>(person: T | null | undefined): person is T & { kind: "admin" } {
  return !!person && !person.archived && person.kind === "admin"
}

export const KIND_LABEL: Record<Doc<"people">["kind"], string> = {
  operator: "Operator",
  engineer: "Engineer",
  admin: "Admin",
}
