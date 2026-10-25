import { useState, type ReactNode } from "react"
import { Image as ImageIcon, ImageOff, Star } from "lucide-react"
import { cn } from "@/lib/utils"

/** One picture in a grid: thumbnail, caption, and optional corner badges. */
export function ImageTile({
  url,
  altText,
  selected,
  favorite,
  caption,
  topLeft,
  bottomRight,
  onClick,
  onDoubleClick,
  className,
  eager,
}: {
  /** undefined while the address is still loading: shows a placeholder. */
  url: string | null | undefined
  altText: string
  /** Load straight away (the first screen of a grid). */
  eager?: boolean
  selected?: boolean
  favorite?: boolean
  caption?: ReactNode
  topLeft?: ReactNode
  bottomRight?: ReactNode
  onClick?: (e: React.MouseEvent) => void
  onDoubleClick?: () => void
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const [loaded, setLoaded] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={altText}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-md border bg-card text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary ring-2 ring-primary" : "hover:border-primary/50",
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full bg-muted/30">
        {(url === undefined || (url && !loaded && !broken)) && (
          <div className="absolute inset-0 flex animate-pulse items-center justify-center bg-muted-foreground/10" aria-hidden>
            <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
          </div>
        )}
        {url === undefined ? null : url && !broken ? (
          <img
            src={url}
            alt={altText}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setBroken(true)}
            className={cn("h-full w-full object-cover transition-opacity duration-200", loaded ? "opacity-100" : "opacity-0")}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageOff className="h-5 w-5 text-muted-foreground/50" />
          </div>
        )}
        {topLeft && <div className="absolute left-1.5 top-1.5">{topLeft}</div>}
        {favorite && (
          <Star className="absolute right-1.5 top-1.5 h-4 w-4 fill-amber-400 text-amber-500 drop-shadow" aria-label="Favorite" />
        )}
        {bottomRight && <div className="absolute bottom-1.5 right-1.5">{bottomRight}</div>}
      </div>
      {caption !== undefined && (
        <div className="min-h-[2.75rem] px-2 py-1.5 text-xs leading-snug text-muted-foreground">
          <div className="line-clamp-2">{caption}</div>
        </div>
      )}
    </button>
  )
}
