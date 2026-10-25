import { Link } from "wouter"
import { cn } from "@/lib/utils"
import type { WikiFigure } from "../wikiShared"
import { useBlockCtx } from "./context"

/** A figure from a cited Document version, after the text it shows. Loads lazily. */
export function ImagesBlock({ figure }: { figure: WikiFigure }) {
  const { wiki, surface } = useBlockCtx()
  const phone = surface === "phone"
  return (
    <figure className={cn("wiki-figure overflow-hidden border bg-muted/30", phone ? "rounded-2xl" : "rounded-lg")}>
      <img src={figure.url} alt={figure.alt} loading="lazy" decoding="async" className={cn("w-full object-cover", phone ? "max-h-60" : "max-h-80")} />
      <figcaption className={cn("flex items-start gap-2 px-3 py-2 text-muted-foreground", phone ? "text-sm leading-5" : "text-xs leading-5")}>
        <span className="min-w-0 flex-1">{figure.alt}</span>
        <Link
          href={phone ? `/m/docs/${figure.documentId}` : `/docs/${figure.documentId}?wiki=${wiki._id}`}
          className="shrink-0 font-mono [@media(hover:hover)]:hover:text-primary-strong"
        >
          {figure.namingCode}
        </Link>
      </figcaption>
    </figure>
  )
}
