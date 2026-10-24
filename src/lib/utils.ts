import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The floor type tokens (tailwind.config.js fontSize) are font sizes, not
// colours: without this, cn("text-floor-body text-muted-foreground") would
// drop the size.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["floor-title", "floor-body", "floor-secondary", "floor-meta"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


/** True for the mobile app's addresses (/m and /m/...), not for e.g. /mcp. */
export function isMobilePath(location: string): boolean {
  return location === "/m" || location.startsWith("/m/")
}
