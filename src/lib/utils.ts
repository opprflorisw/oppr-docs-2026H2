import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


/** True for the mobile app's addresses (/m and /m/...), not for e.g. /mcp. */
export function isMobilePath(location: string): boolean {
  return location === "/m" || location.startsWith("/m/")
}
