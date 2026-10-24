import { useSyncExternalStore, type ReactNode } from "react"
import { Link, useLocation, useSearch } from "wouter"
import { MonitorSmartphone, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"

// Desktop pages are built for a desk. On a phone-sized screen (under 600px)
// they would show a sidebar over half the screen, so we say so and offer the
// same place in the phone app instead.

const NARROW = "(max-width: 599px)"

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(NARROW)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

function useIsNarrow(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(NARROW).matches,
    () => false,
  )
}

/** The phone app address that shows the same thing as a desktop address. */
export function phonePathFor(path: string, search = ""): string {
  const q = search ? (search.startsWith("?") ? search : `?${search}`) : ""
  let m: RegExpMatchArray | null
  if ((m = path.match(/^\/docs\/([^/]+)$/)) && m[1] !== "new") return `/m/docs/${m[1]}${q}`
  if ((m = path.match(/^\/assets\/([^/]+)$/))) return `/m/assets/${m[1]}${q}`
  if ((m = path.match(/^\/wiki\/([^/]+)$/))) return `/m/wiki/${m[1]}`
  if ((m = path.match(/^\/learn\/attempts\/([^/]+)$/))) return `/m/attempt/${m[1]}`
  if ((m = path.match(/^\/library\/captures\/([^/]+)$/))) return `/m/capture/${m[1]}`
  if (path.startsWith("/library/captures")) return "/m/capture"
  if (path === "/library" || path.startsWith("/docs")) return "/m/docs"
  if (path === "/assets") return "/m/assets"
  if (path.startsWith("/learn")) return "/m/me"
  return "/m"
}

export function NarrowViewportGuard({ children }: { children: ReactNode }) {
  const narrow = useIsNarrow()
  if (!narrow) return <>{children}</>
  return <DeskOnly />
}

function DeskOnly() {
  const [location] = useLocation()
  const search = useSearch()
  useDocumentTitle("For desk use")
  return (
    <main
      id="content"
      className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-background px-6 text-center"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <MonitorSmartphone className="h-7 w-7" aria-hidden />
      </span>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">This page is for desk use.</h1>
        <p className="mx-auto max-w-[32ch] text-base text-muted-foreground">
          On a phone, the Oppr app shows the same knowledge in a layout made
          for the floor.
        </p>
      </div>
      <Button asChild size="lg" className="h-12 w-full max-w-xs text-base">
        <Link href={phonePathFor(location, search)}>
          <Smartphone aria-hidden />
          Open the phone app
        </Link>
      </Button>
    </main>
  )
}
