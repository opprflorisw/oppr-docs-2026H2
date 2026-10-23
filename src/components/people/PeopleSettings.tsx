import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { initials } from "@/lib/checkIn"

// The People tab of Settings. Showcase people are seeded; they are not login
// accounts, they are who someone can check in as.
export function PeopleSettings() {
  const people = useQuery(api.people.list)
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        The Operators and Engineers people can check in as. They are not login
        accounts. In this showcase they come from the seed.
      </p>
      <Card>
        <CardContent className="divide-y p-0">
          {people === undefined ? (
            <p className="p-4 text-xs text-muted-foreground">Loading…</p>
          ) : people.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">No people yet.</p>
          ) : (
            people.map((p) => (
              <div key={p._id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {initials(p.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.role}</div>
                </div>
                <Badge
                  variant={p.kind === "engineer" ? "default" : "secondary"}
                  className="capitalize"
                >
                  {p.kind}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
