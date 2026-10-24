// What an operator needs before starting, above the document body: the PPE
// to wear and the Assets this document is for. A tap on a PPE item shows
// what it is, inline (no popover outside the phone).

import { useState } from "react"
import { useLocation } from "wouter"
import { Factory } from "lucide-react"
import { usePpeCatalog, ppeImageSrc } from "@/lib/ppeCatalog"
import type { Asset } from "@/types"
import { cn } from "@/lib/utils"

interface MobileDocSummaryProps {
  assets: Asset[]
  ppeItems: string[]
}

export function MobileDocSummary({ assets, ppeItems }: MobileDocSummaryProps) {
  const [, navigate] = useLocation()
  const [open, setOpen] = useState<string | null>(null)
  const { resolve } = usePpeCatalog()
  if (ppeItems.length === 0 && assets.length === 0) return null
  const openMeta = open ? resolve(open) : null

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border bg-card p-3">
      {ppeItems.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-muted-foreground">Wear</span>
          <div className="flex flex-wrap gap-2">
            {ppeItems.map((slug) => {
              const meta = resolve(slug)
              return (
                <button
                  key={slug}
                  type="button"
                  aria-expanded={open === slug}
                  onClick={() => setOpen(open === slug ? null : slug)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium transition active:scale-95",
                    open === slug
                      ? "border-blue-500 bg-blue-100 text-blue-950 dark:bg-blue-500/20 dark:text-blue-50"
                      : "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100",
                  )}
                >
                  <img src={ppeImageSrc(meta)} alt="" width={22} height={22} className="object-contain" draggable={false} />
                  {meta.label}
                </button>
              )
            })}
          </div>
          {openMeta && (
            <p className="rounded-xl bg-blue-50 px-3 py-2 text-sm leading-relaxed text-blue-950 dark:bg-blue-500/10 dark:text-blue-50">
              <span className="font-semibold">{openMeta.label}. </span>
              {openMeta.description || "Wear this before you start."}
            </p>
          )}
        </div>
      )}
      {assets.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-muted-foreground">For</span>
          <div className="flex flex-wrap gap-2">
            {assets.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(`/m/assets/${a.id}`)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border bg-muted px-3 text-sm font-medium active:scale-95"
              >
                <Factory className="h-4 w-4" />
                <span className="font-mono">{a.code}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
