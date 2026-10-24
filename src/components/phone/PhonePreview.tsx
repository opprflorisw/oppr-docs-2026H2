import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Router, useLocation } from "wouter"
import { navigate as navigateDesktop } from "wouter/use-browser-location"
import {
  ArrowLeft,
  ExternalLink,
  Home,
  PanelRightClose,
  PanelRightOpen,
  Smartphone,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { PhoneFrame } from "@/components/floor/PhoneFrame"
import { MobileShell } from "@/components/mobile/MobileShell"
import { MobileRoutes } from "@/components/mobile/MobileRoutes"
import { CheckInDevice, PHONE_CHECK_IN_KEY } from "@/lib/checkIn"
import { cn, isMobilePath } from "@/lib/utils"
import {
  phoneLocation,
  phonePath,
  rememberPhonePath,
  setPhoneMode,
  usePhoneMode,
  type PhoneMode,
} from "./phoneStore"

const DOCK_W = 440

/** The phone button in the desktop top bar. */
export function PhoneButton() {
  const mode = usePhoneMode()
  const open = mode !== "closed"
  return (
    <button
      type="button"
      onClick={() => setPhoneMode(open ? "closed" : "popup")}
      aria-pressed={open}
      title="Open the phone app (Alt+P). The phone keeps its own check-in, like a second device."
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
        open
          ? "border-primary/40 bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Smartphone className="h-3.5 w-3.5" />
      Phone
    </button>
  )
}

/**
 * The installed phone app, on the desktop: the real mobile app in a phone
 * frame, as a popup or docked to the right so you can use both side by side.
 * Mounted once by the desktop shell.
 */
export function PhonePreviewHost() {
  const mode = usePhoneMode()

  // Alt+P toggles; Escape closes the popup (not the docked phone).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault()
        setPhoneMode(mode === "closed" ? "popup" : "closed")
      } else if (e.key === "Escape" && mode === "popup" && !document.querySelector("[role=dialog][data-state=open]")) {
        setPhoneMode("closed")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mode])

  // Docked: make room on the right so the desktop page stays usable.
  useEffect(() => {
    if (mode !== "docked") return
    const prev = document.body.style.paddingRight
    document.body.style.paddingRight = `${DOCK_W}px`
    return () => {
      document.body.style.paddingRight = prev
    }
  }, [mode])

  if (mode === "closed") return null
  return createPortal(<PhonePanel mode={mode} />, document.body)
}

function PhonePanel({ mode }: { mode: Exclude<PhoneMode, "closed"> }) {
  // The phone's own history, for the Back button.
  const stackRef = useRef<string[]>([phonePath()])
  const [stack, setStack] = useState<string[]>(stackRef.current)
  const goingBack = useRef(false)
  const current = stack[stack.length - 1] ?? "/m"

  const update = useCallback((next: string[]) => {
    stackRef.current = next
    setStack(next)
  }, [])

  const onLocation = useCallback(
    (path: string) => {
      const s = stackRef.current
      if (!isMobilePath(path)) {
        // A link to a desktop page: open it on the desktop, keep the phone where it was.
        phoneLocation.navigate(s[s.length - 1] ?? "/m", { replace: true })
        navigateDesktop(path)
        if (mode === "popup") setPhoneMode("docked")
        toast("Opened on the desktop", { description: path })
        return
      }
      rememberPhonePath(path)
      if (goingBack.current) {
        goingBack.current = false
        return
      }
      if (s[s.length - 1] !== path) update([...s, path].slice(-50))
    },
    [mode, update],
  )

  function back() {
    const s = stackRef.current
    if (s.length < 2) return
    goingBack.current = true
    update(s.slice(0, -1))
    phoneLocation.navigate(s[s.length - 2], { replace: true })
  }

  function home() {
    phoneLocation.navigate("/m")
  }

  const docked = mode === "docked"

  return (
    <div className={cn("fixed z-[45]", docked ? "inset-y-0 right-0" : "inset-0")} style={docked ? { width: DOCK_W } : undefined}>
      {!docked && (
        <div
          className="absolute inset-0 bg-neutral-950/50 backdrop-blur-[2px] animate-in fade-in-0"
          onClick={() => setPhoneMode("closed")}
          aria-hidden
        />
      )}
      <div
        role="dialog"
        aria-label="Phone app"
        className={cn(
          "relative flex h-full flex-col items-center gap-3 py-3",
          docked ? "w-full border-l bg-muted/70 backdrop-blur" : "mx-auto w-[460px] max-w-full animate-in fade-in-0 zoom-in-95",
        )}
      >
        <div className="flex w-[404px] max-w-[calc(100%-24px)] items-center gap-1 rounded-full border bg-background/95 px-1.5 py-1 shadow-sm">
          <ToolButton label="Phone back" onClick={back} disabled={stack.length < 2}>
            <ArrowLeft className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Phone home" onClick={home}>
            <Home className="h-4 w-4" />
          </ToolButton>
          <span className="min-w-0 flex-1 truncate px-1.5 text-center font-mono text-[11px] text-muted-foreground" title={current}>
            {current}
          </span>
          <ToolButton label="Open in a new tab" onClick={() => window.open(current, "_blank", "noopener")}>
            <ExternalLink className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            label={docked ? "Float as popup" : "Dock to the side"}
            onClick={() => setPhoneMode(docked ? "popup" : "docked")}
          >
            {docked ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </ToolButton>
          <ToolButton label="Close phone" onClick={() => setPhoneMode("closed")}>
            <X className="h-4 w-4" />
          </ToolButton>
        </div>
        <div className="min-h-0 w-full flex-1 px-3">
          <PhoneFrame overlay={null}>
            <CheckInDevice value={PHONE_CHECK_IN_KEY}>
              <Router hook={phoneLocation.hook} searchHook={phoneLocation.searchHook}>
                <LocationSpy onLocation={onLocation} />
                <MobileShell embedded>
                  <MobileRoutes />
                </MobileShell>
              </Router>
            </CheckInDevice>
          </PhoneFrame>
        </div>
      </div>
    </div>
  )
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function LocationSpy({ onLocation }: { onLocation: (path: string) => void }) {
  const [path] = useLocation()
  useEffect(() => onLocation(path), [path, onLocation])
  return null
}
