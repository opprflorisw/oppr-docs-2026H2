// Shared pieces for the Settings sections: who may change things, a labelled
// field, the one Save action per card, and a form over one orgSettings group.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useMutation, useQuery } from "convex/react"
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import { Link } from "wouter"
import { ArrowUpRight, Loader2, type LucideIcon } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import type { OrgSettings } from "../../../convex/orgSettings"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useCheckIn } from "@/lib/checkIn"
import { isEngineerOrAdmin } from "@/lib/roles"
import { cn } from "@/lib/utils"

/** The checked-in Engineer or Admin who may change Settings, or null. */
export function useSettingsEditor() {
  const { person } = useCheckIn()
  const editor = isEngineerOrAdmin(person) ? person : null
  return { editor, editorId: editor?._id ?? null }
}

type EditorMutation = FunctionReference<"mutation", "public", { personId?: Id<"people"> }>

/**
 * A Settings mutation that the server allows only for a checked-in Engineer
 * or Admin: the checked-in person is passed along as personId.
 */
export function useEditorMutation<M extends EditorMutation>(fn: M) {
  const run = useMutation(fn) as unknown as (args: FunctionArgs<M>) => Promise<FunctionReturnType<M>>
  const { editorId } = useSettingsEditor()
  return useCallback(
    (args: Omit<FunctionArgs<M>, "personId">) => run({ ...args, personId: editorId ?? undefined } as FunctionArgs<M>),
    [run, editorId],
  )
}

export function errorText(err: unknown): string {
  const data = (err as { data?: unknown })?.data
  if (typeof data === "string") return data
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/^\[CONVEX[^\]]*\]\s*/, "").replace(/^.*Uncaught ConvexError:\s*/s, "").split("\n")[0]
}

/** Shown above a section when nobody who may change it is checked in. */
export function EditNotice({ what = "change these settings" }: { what?: string }) {
  const { editorId } = useSettingsEditor()
  if (editorId) return null
  return (
    <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground" data-testid="settings-edit-notice">
      Check in as an Engineer or Admin to {what}.
    </p>
  )
}

/**
 * Shows the EditNotice and makes everything inside read-only (inputs, buttons,
 * switches) while nobody who may change Settings is checked in. The server
 * refuses the change anyway; this keeps the screen honest about it.
 */
export function EditorOnly({ children, what }: { children: ReactNode; what?: string }) {
  const { editorId } = useSettingsEditor()
  return (
    <>
      <EditNotice what={what} />
      <fieldset disabled={!editorId} className="m-0 min-w-0 border-0 p-0">
        {children}
      </fieldset>
    </>
  )
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-center sm:gap-6", className)}>
      <div className="space-y-0.5">
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** The single primary action of a settings card. */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onReset,
  error,
}: {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onReset: () => void
  error?: string | null
}) {
  const { editorId } = useSettingsEditor()
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
      {error && (
        <p role="alert" className="mr-auto text-sm text-destructive">
          {error}
        </p>
      )}
      {dirty && !saving && (
        <Button type="button" variant="ghost" size="sm" onClick={onReset}>
          Undo changes
        </Button>
      )}
      <Button type="button" size="sm" onClick={onSave} disabled={!dirty || saving || !editorId}>
        {saving && <Loader2 className="animate-spin" aria-hidden />}
        Save
      </Button>
    </div>
  )
}

type Group = keyof OrgSettings

/**
 * A form over one orgSettings group: local edits on top of the stored
 * values, `dirty` when they differ, and `save` sends only what changed.
 */
export function useOrgGroup<G extends Group>(group: G, savedText: string) {
  const org = useQuery(api.orgSettings.get)
  const update = useMutation(api.orgSettings.update)
  const { editorId } = useSettingsEditor()
  const server = org?.[group]
  const [edits, setEdits] = useState<Partial<OrgSettings[G]>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const value = useMemo(() => (server ? ({ ...server, ...edits } as OrgSettings[G]) : undefined), [server, edits])
  const changed = useMemo(() => {
    if (!server) return {}
    const out: Partial<OrgSettings[G]> = {}
    for (const k of Object.keys(edits) as (keyof OrgSettings[G])[]) {
      if (JSON.stringify(edits[k]) !== JSON.stringify(server[k])) out[k] = edits[k]
    }
    return out
  }, [server, edits])
  const dirty = Object.keys(changed).length > 0

  // A saved value that now equals the server value is no longer an edit.
  useEffect(() => {
    if (!dirty && Object.keys(edits).length > 0) setEdits({})
  }, [dirty, edits])

  function set<K extends keyof OrgSettings[G]>(key: K, v: OrgSettings[G][K]) {
    setError(null)
    setEdits((e) => ({ ...e, [key]: v }))
  }

  async function save(extra?: () => Promise<unknown>) {
    if (!editorId) return
    setSaving(true)
    setError(null)
    try {
      if (dirty) await update({ personId: editorId, [group]: changed } as Parameters<typeof update>[0])
      if (extra) await extra()
      setEdits({})
      toast.success(savedText)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return {
    value,
    loading: org === undefined,
    set,
    dirty,
    saving,
    error,
    save,
    reset: () => {
      setEdits({})
      setError(null)
    },
  }
}

/** A whole-number input that keeps typing free and reports numbers only. */
export function NumberInput({
  id,
  value,
  onChange,
  min,
  max,
  suffix,
  disabled,
}: {
  id: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  suffix?: string
  disabled?: boolean
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const n = Number(text)
  const invalid = text.trim() === "" || !Number.isInteger(n) || n < min || n > max
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={text}
        disabled={disabled}
        aria-invalid={invalid}
        onChange={(e) => {
          setText(e.target.value)
          const v = Number(e.target.value)
          if (e.target.value.trim() !== "" && Number.isInteger(v) && v >= min && v <= max) onChange(v)
        }}
        onBlur={() => {
          if (invalid) setText(String(value))
        }}
        className={cn(
          "flex h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm tabular-nums shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          invalid && "border-destructive",
        )}
      />
      {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      {invalid && (
        <span className="text-xs text-destructive">
          {min} to {max}
        </span>
      )}
    </div>
  )
}

/** A card that opens another page (a place that lives elsewhere). */
export function LinkCard({ href, icon: Icon, title, text }: { href: string; icon: LucideIcon; title: string; text: string }) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" aria-hidden />
    </Link>
  )
}
