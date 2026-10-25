// NamingSettings: the Naming tab of Settings
//
// Manages the three vocabularies that feed the naming code
// {LOCATION}-{DISCIPLINE}-{TYPE}-{NNNN}: Locations, Disciplines, and Document
// types. Types carry an icon + color used by the type badge; built-in types
// can be deactivated but not deleted (the code is immutable identity).

import { useEffect, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { ChevronDown, Plus, Trash2 } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  TYPE_COLORS,
  TYPE_ICONS,
  typeBadgeClass,
  typeIcon,
} from "@/lib/typeMeta"
import { errorText, useEditorMutation } from "@/components/settings/SettingsBits"

type Kind = "location" | "discipline"

export function NamingSettings() {
  const vocab = useQuery(api.naming.listVocabulary)
  const types = useQuery(api.namingTypes.list)
  const seedTypes = useMutation(api.namingTypes.seedIfEmpty)

  // Self-heal: populate the type vocabulary on first visit for deployments that
  // predate it. Idempotent — returns early if any row exists.
  useEffect(() => {
    if (types !== undefined && types.length === 0) {
      void seedTypes({}).catch(() => {})
    }
  }, [types, seedTypes])

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        The area, discipline and type options that build every document code.
        The sequence number is automatic.
      </p>
      <div className="grid gap-4 md:grid-cols-2" data-tour="settings-naming-vocab">
        <VocabCard
          kind="location"
          title="Areas"
          description="Plant area. First token of the code, e.g. EXT."
          rows={vocab?.locations}
        />
        <VocabCard
          kind="discipline"
          title="Disciplines"
          description="Owning function. Second token, e.g. OPS."
          rows={vocab?.disciplines}
        />
        <div className="md:col-span-2" data-tour="settings-naming-types">
          <TypesCard rows={types} />
        </div>
      </div>
    </div>
  )
}

function VocabCard({
  kind,
  title,
  description,
  rows,
}: {
  kind: Kind
  title: string
  description: string
  rows: { _id: string; code: string; label: string }[] | undefined
}) {
  const add = useEditorMutation(api.naming.addVocabulary)
  const remove = useEditorMutation(api.naming.removeVocabulary)
  const [code, setCode] = useState("")
  const [label, setLabel] = useState("")
  const [busy, setBusy] = useState(false)

  async function onAdd() {
    if (!code.trim()) return
    setBusy(true)
    try {
      await add({ kind, code: code.trim(), label: label.trim() || code.trim() })
      setCode("")
      setLabel("")
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function onRemove(id: string) {
    try {
      await remove({ kind, id })
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="divide-y rounded-md border">
          {rows === undefined ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">
              None yet. Add one below.
            </div>
          ) : (
            rows.map((r) => (
              <div
                key={r._id}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <span className="w-16 font-mono font-medium">{r.code}</span>
                <span className="flex-1 truncate text-muted-foreground">
                  {r.label}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => void onRemove(r._id)}
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
        <div className="flex items-end gap-2">
          <div className="w-24 space-y-1">
            <Label className="text-xs">Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={kind === "location" ? "EXT" : "OPS"}
              className="font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter") void onAdd()
              }}
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={kind === "location" ? "Extrusion" : "Operations"}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onAdd()
              }}
            />
          </div>
          <Button size="sm" onClick={() => void onAdd()} disabled={busy} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

interface TypeRow {
  _id: Id<"namingTypes">
  slug: string
  token: string
  label: string
  icon: string
  color: string
  active: boolean
  builtIn: boolean
  sortOrder: number
}

function TypesCard({ rows }: { rows: TypeRow[] | undefined }) {
  const add = useEditorMutation(api.namingTypes.add)
  const update = useEditorMutation(api.namingTypes.update)
  const setActive = useEditorMutation(api.namingTypes.setActive)
  const remove = useEditorMutation(api.namingTypes.remove)

  const [token, setToken] = useState("")
  const [label, setLabel] = useState("")
  const [icon, setIcon] = useState(TYPE_ICONS[0].id)
  const [color, setColor] = useState(TYPE_COLORS[0].id)
  const [busy, setBusy] = useState(false)

  async function onAdd() {
    if (!token.trim() || !label.trim()) return
    setBusy(true)
    try {
      await add({ token: token.trim(), label: label.trim(), icon, color })
      setToken("")
      setLabel("")
      setIcon(TYPE_ICONS[0].id)
      setColor(TYPE_COLORS[0].id)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function guard(fn: () => Promise<unknown>) {
    try {
      await fn()
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Document types</CardTitle>
        <CardDescription className="text-xs">
          Third token of the code, e.g. SOP. Each type has an icon and color used
          on its badge. Built-in types can be switched off but not deleted; your
          own types can be deleted while unused.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="divide-y rounded-md border">
          {rows === undefined ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">
              Seeding defaults…
            </div>
          ) : (
            rows.map((r) => {
              const Icon = typeIcon(r.icon)
              return (
                <div
                  key={r._id}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
                      typeBadgeClass(r.color),
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {r.label}
                  </span>
                  <span className="w-16 font-mono text-xs text-muted-foreground">
                    {r.token}
                  </span>
                  {r.builtIn && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      built-in
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={r.active}
                        onCheckedChange={(v) =>
                          void guard(() => setActive({ id: r._id, active: v }))
                        }
                      />
                      <span className="text-xs text-muted-foreground">
                        {r.active ? "Active" : "Off"}
                      </span>
                    </div>
                    <IconColorEditor
                      icon={r.icon}
                      color={r.color}
                      onChange={(next) =>
                        void guard(() => update({ id: r._id, ...next }))
                      }
                    />
                    {!r.builtIn && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => void guard(() => remove({ id: r._id }))}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          <div className="text-xs font-medium text-muted-foreground">
            Add a type
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-24 space-y-1">
              <Label className="text-xs">Token</Label>
              <Input
                value={token}
                onChange={(e) => setToken(e.target.value.toUpperCase())}
                placeholder="TBOX"
                className="font-mono"
              />
            </div>
            <div className="min-w-[10rem] flex-1 space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Toolbox talk"
              />
            </div>
            <Button size="sm" onClick={() => void onAdd()} disabled={busy} className="gap-1">
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-4">
            <IconPicker value={icon} onChange={setIcon} />
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function IconPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const Current = typeIcon(value)
  return (
    <div className="space-y-1">
      <Label className="text-xs">Icon</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Choose an icon"
            title="Choose an icon"
            className="flex h-7 items-center gap-1 rounded border border-input px-1.5 text-muted-foreground transition-colors hover:bg-muted"
          >
            <Current className="h-4 w-4 text-foreground" />
            <ChevronDown className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <div className="grid grid-cols-5 gap-1">
            {TYPE_ICONS.map((i) => {
              const Icon = i.icon
              return (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => {
                    onChange(i.id)
                    setOpen(false)
                  }}
                  aria-pressed={value === i.id}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded border transition-colors",
                    value === i.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  title={i.id.replace(/([a-z])([A-Z])/g, "$1 $2")}
                >
                  <Icon className="h-4 w-4" />
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">Color</Label>
      <div className="flex flex-wrap gap-1">
        {TYPE_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={cn(
              "h-7 w-7 rounded border-2 transition-transform",
              c.swatch,
              value === c.id
                ? "border-foreground scale-110"
                : "border-transparent hover:scale-105",
            )}
            title={c.id}
          />
        ))}
      </div>
    </div>
  )
}

// Inline editor for an existing type's icon + color, shown as a small preview
// button that expands the two pickers.
function IconColorEditor({
  icon,
  color,
  onChange,
}: {
  icon: string
  color: string
  onChange: (next: { icon: string; color: string }) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => setOpen((o) => !o)}
      >
        Style
      </Button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-56 space-y-2 rounded-md border bg-popover p-2 shadow-md">
          <IconPicker value={icon} onChange={(id) => onChange({ icon: id, color })} />
          <ColorPicker value={color} onChange={(id) => onChange({ icon, color: id })} />
        </div>
      )}
    </div>
  )
}
