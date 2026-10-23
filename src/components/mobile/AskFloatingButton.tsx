import { Link } from "wouter"
import { MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMobileShell } from "./MobileShell"

interface AskFloatingButtonProps {
  /** Target route, e.g. /m/ask?scope=asset:asset-1 */
  to: string
}

/**
 * Round floating action button anchored to the bottom-right of the mobile
 * shell. Lifts above the bottom-nav when it's visible, sits closer to the
 * bottom edge when the nav is hidden (e.g. doc reader, Ask chat) so it
 * doesn't float in dead space.
 */
export function AskFloatingButton({ to }: AskFloatingButtonProps) {
  const { navVisible } = useMobileShell()
  return (
    <Link
      href={to}
      aria-label="Ask"
      className={cn(
        "fixed right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition active:scale-95",
        navVisible ? "bottom-20" : "bottom-6",
      )}
    >
      <MessageSquare className="h-6 w-6" />
    </Link>
  )
}
