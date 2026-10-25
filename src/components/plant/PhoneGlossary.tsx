import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { Skeleton } from "@/components/ui/skeleton"

type Term = { _id: string; name: string; synonyms: string[]; description: string; areaCode: string | null }

function matches(t: Term, q: string) {
  return (
    t.name.toLowerCase().includes(q) ||
    t.synonyms.some((s) => s.toLowerCase().includes(q)) ||
    t.description.toLowerCase().includes(q)
  )
}

function TermRow({ t }: { t: Term }) {
  return (
    <li className="rounded-2xl border bg-card px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[15px] font-semibold">{t.name}</span>
        {t.areaCode && <span className="font-mono text-[11px] text-muted-foreground">{t.areaCode}</span>}
      </div>
      {t.synonyms.length > 0 && <p className="text-[13px] text-muted-foreground">{t.synonyms.join(" · ")}</p>}
      {t.description && <p className="mt-1 text-sm">{t.description}</p>}
    </li>
  )
}

/**
 * The Plant glossary on the phone, read-only (docs/adr/0006). With `query`
 * it shows only the matching terms, and nothing when none match.
 */
export function PhoneGlossary({ query }: { query?: string }) {
  const terms = useQuery(api.plant.plant.glossary, {}) as Term[] | undefined
  const q = (query ?? "").trim().toLowerCase()
  if (!terms) return q ? null : <Skeleton className="h-24 w-full rounded-2xl" />
  const rows = q ? terms.filter((t) => matches(t, q)) : terms
  if (q && rows.length === 0) return null
  if (rows.length === 0)
    return <p className="px-1 py-6 text-center text-sm text-muted-foreground">No words yet. An Engineer adds them under Plant on the desktop.</p>
  return (
    <section className="space-y-2">
      {q && (
        <h2 className="px-1 pt-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
          Words · {rows.length}
        </h2>
      )}
      <ul className="space-y-2">
        {rows.slice(0, q ? 5 : 200).map((t) => (
          <TermRow key={t._id} t={t} />
        ))}
      </ul>
    </section>
  )
}
