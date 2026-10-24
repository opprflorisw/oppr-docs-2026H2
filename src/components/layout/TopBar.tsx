import { Link } from "wouter"
import { ChevronRight, Home } from "lucide-react"
import { UserMenu } from "./UserMenu"
import { CheckInChip } from "@/components/people/CheckInChip"
import { PhoneButton } from "@/components/phone/PhonePreview"
import { cn } from "@/lib/utils"
import { AskTopBarButton } from "@/components/ai/FloatingAskIda"

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface TopBarProps {
  breadcrumb: BreadcrumbItem[]
}

export function TopBar({ breadcrumb }: TopBarProps) {
  return (
    <div className="sticky top-0 z-30 flex h-12 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <Breadcrumb items={breadcrumb} />
      <div className="flex items-center gap-2">
        <AskTopBarButton />
        <PhoneButton />
        <CheckInChip />
        <UserMenu />
      </div>
    </div>
  )
}

function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1 overflow-hidden text-xs"
    >
      <Link
        href="/"
        className="flex h-6 items-center gap-1 rounded px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Home"
      >
        <Home className="h-3 w-3" />
      </Link>
      {items.map((item, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1">
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
          {item.href ? (
            <Link
              href={item.href}
              title={item.label}
              className={cn(
                "rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                "max-w-[60ch] truncate",
              )}
            >
              {item.label}
            </Link>
          ) : (
            <span
              title={item.label}
              className="max-w-[40ch] truncate px-1.5 py-0.5 font-medium text-foreground"
            >
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}
