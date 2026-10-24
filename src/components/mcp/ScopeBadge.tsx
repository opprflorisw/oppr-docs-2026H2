import { cn } from "@/lib/utils"
import { SCOPE_INFO, type Scope } from "./data"

/** A scope as a small badge: read scopes in blue, write scopes in amber. */
export function ScopeBadge({ scope, className }: { scope: Scope; className?: string }) {
  const write = SCOPE_INFO[scope]?.write ?? false
  return (
    <span
      title={SCOPE_INFO[scope]?.allows}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium",
        write
          ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
          : "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200",
        className,
      )}
    >
      {scope}
    </span>
  )
}
