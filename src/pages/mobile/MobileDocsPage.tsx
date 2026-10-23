// Mobile Documents list — searchable, mirrors LibraryPage on desktop.

import { useMemo, useState } from "react"
import { useLocation } from "wouter"
import { Search } from "lucide-react"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { toLegacyDoc } from "@/lib/convex-adapters"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { MobileSearchInput } from "@/components/mobile/MobileSearchInput"
import { MobileDocCard } from "@/components/mobile/MobileDocCard"
import { MobileGlobalSearch } from "@/components/mobile/MobileGlobalSearch"
import { usePinned } from "@/components/mobile/use-mobile-prefs"

export function MobileDocsPage() {
  const [, navigate] = useLocation()
  const { isPinned, togglePin } = usePinned()
  const [query, setQuery] = useState("")
  const [globalOpen, setGlobalOpen] = useState(false)

  const raw = useQuery(api.documents.list, { publishedOnly: true })
  const ready = raw !== undefined
  const docs = useMemo(() => (raw ? raw.map(toLegacyDoc) : []), [raw])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return docs
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.naming_code.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [docs, query])

  return (
    <div className="flex flex-col">
      <MobileHeader
        backTo={null}
        title="Documents"
        subtitle={`${docs.length} published`}
        right={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search everything"
            className="h-10 w-10"
            onClick={() => setGlobalOpen(true)}
          >
            <Search className="h-5 w-5" />
          </Button>
        }
      />

      <div className="flex flex-col gap-3 p-3">
        <MobileSearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search title, code, or tag…"
        />

        {!ready ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            {query ? "No documents match." : "No documents yet."}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((doc) => (
              <MobileDocCard
                key={doc.id}
                doc={doc}
                onClick={() => navigate(`/m/docs/${doc.id}`)}
                pinned={isPinned("doc", doc.id)}
                onTogglePin={() =>
                  togglePin({
                    kind: "doc",
                    id: doc.id,
                    label: doc.title,
                    sublabel: doc.naming_code,
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      <MobileGlobalSearch
        open={globalOpen}
        onClose={() => setGlobalOpen(false)}
      />
    </div>
  )
}
