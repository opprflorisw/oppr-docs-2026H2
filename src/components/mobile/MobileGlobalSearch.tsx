// Global search overlay reachable from list-page headers. Searches both
// assets (code, name, location) and documents (title, naming code, tag) and
// renders results in two grouped lists. Tapping an item dismisses the
// overlay and navigates to the right detail page.

import { useEffect, useMemo, useState } from "react"
import { useLocation } from "wouter"
import { ChevronRight, Factory, Files, Search, X } from "lucide-react"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { toLegacyAsset, toLegacyDoc } from "@/lib/convex-adapters"
import { MobileSearchInput } from "./MobileSearchInput"
import { Button } from "@/components/ui/button"

interface MobileGlobalSearchProps {
  open: boolean
  onClose: () => void
}

export function MobileGlobalSearch({ open, onClose }: MobileGlobalSearchProps) {
  const [, navigate] = useLocation()
  const [query, setQuery] = useState("")
  const rawAssets = useQuery(api.assets.list, open ? undefined : "skip")
  const rawDocs = useQuery(api.documents.list, open ? { publishedOnly: true } : "skip")
  const ready = rawAssets !== undefined && rawDocs !== undefined

  // Reset query each time the overlay opens.
  useEffect(() => {
    if (open) setQuery("")
  }, [open])

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const assets = useMemo(
    () => (rawAssets ? rawAssets.map(toLegacyAsset) : []),
    [rawAssets],
  )
  const docs = useMemo(
    () => (rawDocs ? rawDocs.map(toLegacyDoc) : []),
    [rawDocs],
  )

  const q = query.trim().toLowerCase()
  const matchedAssets = useMemo(() => {
    if (!q) return []
    return assets
      .filter(
        (a) =>
          a.code.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          (a.location ?? "").toLowerCase().includes(q),
      )
      .slice(0, 10)
  }, [assets, q])
  const matchedDocs = useMemo(() => {
    if (!q) return []
    return docs
      .filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.naming_code.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .slice(0, 10)
  }, [docs, q])

  if (!open) return null

  function go(path: string) {
    onClose()
    navigate(path)
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-stretch justify-center bg-background/95 backdrop-blur">
      <div className="flex w-full max-w-[430px] flex-col">
        <header className="flex items-center gap-2 border-b px-3 py-3">
          <MobileSearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search assets and documents…"
            autoFocus
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close search"
            onClick={onClose}
            className="h-10 w-10"
          >
            <X className="h-5 w-5" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-3">
          {!q ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <Search className="h-6 w-6 opacity-50" />
              Type to search across assets and documents.
            </div>
          ) : matchedAssets.length === 0 && matchedDocs.length === 0 ? (
            <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
              No matches.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {matchedAssets.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Assets · {matchedAssets.length}
                  </div>
                  {matchedAssets.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => go(`/m/assets/${a.id}`)}
                      className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm transition active:scale-[0.99]"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Factory className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {a.name}
                        </div>
                        <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                          {a.code}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
              {matchedDocs.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Documents · {matchedDocs.length}
                  </div>
                  {matchedDocs.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => go(`/m/docs/${d.id}`)}
                      className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm transition active:scale-[0.99]"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Files className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {d.title}
                        </div>
                        <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                          {d.naming_code}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
