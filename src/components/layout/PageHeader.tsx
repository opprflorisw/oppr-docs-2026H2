import { isValidElement, useSyncExternalStore } from "react"
import type { ComponentType, ReactNode } from "react"
import type { LucideProps } from "lucide-react"
import { MoreHorizontal } from "lucide-react"
import { Link } from "wouter"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"

/** One header action. Rendered as a button, or as a menu item when folded. */
export interface HeaderAction {
  label: string
  icon?: ComponentType<LucideProps>
  onClick?: () => void
  /** In-app path; rendered as a link. */
  href?: string
  disabled?: boolean
  /** Shown next to a disabled action so it is never a dead end. */
  disabledReason?: string
  /** Red, and only ever inside the '...' menu. */
  destructive?: boolean
  /** Instructions: a data-tour target on the button (src/components/instructions). */
  tour?: string
}

interface PageHeaderProps {
  icon?: ComponentType<LucideProps>
  title: string
  /** One line under the title: code, version, status. */
  statusLine?: ReactNode
  /** @deprecated use statusLine. */
  subtitle?: ReactNode
  /** The one filled primary action of the screen (top right). */
  primary?: HeaderAction | ReactNode
  /** Outline actions. Below 1280px they fold into the '...' menu. */
  secondary?: HeaderAction[]
  /** Rare and destructive actions; always in the '...' menu. */
  menu?: HeaderAction[]
  /**
   * Free-form actions (older pages). Prefer primary, secondary and menu,
   * which fold correctly on narrow screens.
   */
  actions?: ReactNode
  /** Browser tab title when it should differ from the visible title. */
  documentTitle?: string
  /** Optional id on the root, so callers can measure the sticky header height. */
  id?: string
}

const WIDE = "(min-width: 1280px)"

function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

/** True from 1280px up. Shared with DesktopShell for the icon rail. */
export function useIsWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => true,
  )
}

function isAction(x: unknown): x is HeaderAction {
  return (
    !!x && typeof x === "object" && !isValidElement(x) && "label" in (x as object)
  )
}

function ActionButton({
  action,
  variant,
}: {
  action: HeaderAction
  variant: "default" | "outline"
}) {
  const Icon = action.icon
  const inner = (
    <>
      {Icon && <Icon aria-hidden />}
      {action.label}
    </>
  )
  const button = action.href && !action.disabled ? (
    <Button size="sm" variant={variant} asChild data-tour={action.tour}>
      <Link href={action.href}>{inner}</Link>
    </Button>
  ) : (
    <Button
      size="sm"
      variant={variant}
      onClick={action.onClick}
      disabled={action.disabled}
      title={action.disabled ? action.disabledReason : undefined}
      data-tour={action.tour}
    >
      {inner}
    </Button>
  )
  if (action.disabled && action.disabledReason) {
    return (
      <span className="flex items-center gap-2">
        <span className="hidden max-w-[22ch] truncate text-xs text-muted-foreground wide:inline">
          {action.disabledReason}
        </span>
        {button}
      </span>
    )
  }
  return button
}

function MenuItem({ action }: { action: HeaderAction }) {
  const Icon = action.icon
  const content = (
    <>
      {Icon && <Icon className="mr-2 h-4 w-4" aria-hidden />}
      <span className="flex-1">{action.label}</span>
    </>
  )
  return (
    <DropdownMenuItem
      disabled={action.disabled}
      onSelect={() => action.onClick?.()}
      asChild={!!action.href && !action.disabled}
      title={action.disabled ? action.disabledReason : undefined}
      className={cn(
        action.destructive && "text-destructive focus:bg-destructive/10 focus:text-destructive",
      )}
    >
      {action.href && !action.disabled ? <Link href={action.href}>{content}</Link> : content}
    </DropdownMenuItem>
  )
}

export function PageHeader({
  icon: Icon,
  title,
  statusLine,
  subtitle,
  primary,
  secondary = [],
  menu = [],
  actions,
  documentTitle,
  id,
}: PageHeaderProps) {
  useDocumentTitle(documentTitle ?? title)
  const wide = useIsWide()
  const line = statusLine ?? subtitle

  const visibleSecondary = wide ? secondary : []
  const folded = wide ? [] : secondary
  const safeMenu = menu.filter((m) => !m.destructive)
  const destructive = menu.filter((m) => m.destructive)
  const hasMenu = folded.length + menu.length > 0
  // Instructions: a tour step that points at a folded action points at the
  // '...' button instead (one wrapper per data-tour id).
  const foldedTours = [...folded, ...menu].flatMap((a) => (a.tour ? [a.tour] : []))
  const withTours = (node: ReactNode) =>
    foldedTours.reduceRight<ReactNode>(
      (child, t) => (
        <span data-tour={t} className="inline-flex">
          {child}
        </span>
      ),
      node,
    )

  return (
    <div
      id={id}
      className="sticky top-12 z-20 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="flex min-w-[12rem] flex-1 items-center gap-3">
        {Icon && <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold leading-tight" title={title}>
            {title}
          </h1>
          {line && (
            // Two lines, not one: this line says what the page is for, and a
            // narrow window (Ask open, a laptop) must not cut that off.
            <div
              className="mt-0.5 line-clamp-2 text-xs text-muted-foreground"
              title={typeof line === "string" ? line : undefined}
            >
              {line}
            </div>
          )}
        </div>
      </div>
      {(actions || primary || hasMenu || visibleSecondary.length > 0) && (
        <div className="ml-auto flex flex-nowrap items-center gap-2">
          {actions && (
            <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
          )}
          {visibleSecondary.map((a) => (
            <ActionButton key={a.label} action={a} variant="outline" />
          ))}
          {hasMenu && (
            <DropdownMenu>
              {withTours(
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="w-9 px-0" aria-label="More actions">
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>,
              )}
              <DropdownMenuContent align="end" className="w-56">
                {folded.map((a) => (
                  <MenuItem key={a.label} action={a} />
                ))}
                {folded.length > 0 && safeMenu.length > 0 && <DropdownMenuSeparator />}
                {safeMenu.map((a) => (
                  <MenuItem key={a.label} action={a} />
                ))}
                {destructive.length > 0 && folded.length + safeMenu.length > 0 && (
                  <DropdownMenuSeparator />
                )}
                {destructive.map((a) => (
                  <MenuItem key={a.label} action={a} />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {primary &&
            (isAction(primary) ? (
              <ActionButton action={primary} variant="default" />
            ) : (
              primary
            ))}
        </div>
      )}
    </div>
  )
}
