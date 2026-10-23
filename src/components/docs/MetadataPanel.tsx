// MetadataPanel
//
// Right-rail form for document metadata. The naming code is no longer typed by
// hand — it is built from Location + Discipline + Type and an auto sequence
// allocated server-side. Tags and manual asset-linking are gone: linked assets
// are derived from the asset pills in the body and shown read-only here.
//
// Lifecycle roles (reviewer / approver) are set here. The author is always the
// creator (shown read-only). Gating happens at the transition, not at save, so
// these can be left empty while drafting.

import { useMemo, type ReactNode } from "react"
import { z } from "zod"
import type { DocumentType } from "@/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { useDocTypes } from "@/lib/typeMeta"
import { BookMarked, Factory, Hash, Play } from "lucide-react"

export interface MetadataValue {
  title: string
  type: DocumentType
  location: string
  discipline: string
  ownerId: string
  reviewerId: string
  approverId: string
}

export const metadataSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  type: z.string().trim().min(1, "Type is required"),
  location: z.string().trim().min(1, "Location is required"),
  discipline: z.string().trim().min(1, "Discipline is required"),
  ownerId: z.string().default(""),
  reviewerId: z.string().default(""),
  approverId: z.string().default(""),
})

export interface ValidationResult {
  ok: boolean
  errors: Record<string, string>
}

export function validateMetadata(value: MetadataValue): ValidationResult {
  const result = metadataSchema.safeParse(value)
  if (result.success) return { ok: true, errors: {} }
  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const path = issue.path.join(".")
    if (!errors[path]) errors[path] = issue.message
  }
  return { ok: false, errors }
}

const NONE = "__none__"

export interface DerivedAsset {
  id: string
  code: string
  name: string
}

export interface DerivedRef {
  id: string
  code: string
  title: string
}

export interface DerivedLog {
  id: string
  code: string
  name: string
}

interface MetadataPanelProps {
  value: MetadataValue
  onChange: (next: MetadataValue) => void
  errors?: Record<string, string>
  /** When set (edit mode), the naming code is fixed and shown read-only. */
  fixedNamingCode?: string
  /** Opens the "change filing → new document" flow. Only relevant with a fixed code. */
  onRequestRefile?: () => void
  /** Linked machines derived from the body chips (read-only). */
  derivedAssets?: DerivedAsset[]
  /** Reference documents derived from the body chips (read-only). */
  derivedRefs?: DerivedRef[]
  /** Launched logs derived from the body launch-log pills (read-only). */
  derivedLogs?: DerivedLog[]
}

export function MetadataPanel({
  value,
  onChange,
  errors = {},
  fixedNamingCode,
  onRequestRefile,
  derivedAssets = [],
  derivedRefs = [],
  derivedLogs = [],
}: MetadataPanelProps) {
  const filingLocked = Boolean(fixedNamingCode)
  const me = useQuery(api.users.me)
  const vocab = useQuery(api.naming.listVocabulary)
  const users = useQuery(api.users.list) ?? []

  const locations = vocab?.locations ?? []
  const disciplines = vocab?.disciplines ?? []
  const { types: docTypes, resolve: resolveType } = useDocTypes()
  // Active types for picking; if the current value is a deactivated type, keep
  // it in the list so the select can still show it.
  const typeChoices = useMemo(() => {
    const active = docTypes.filter((t) => t.active)
    if (value.type && !active.some((t) => t.slug === value.type)) {
      const current = docTypes.find((t) => t.slug === value.type)
      if (current) return [current, ...active]
    }
    return active
  }, [docTypes, value.type])

  // Live preview of the next code when creating (no fixed code passed).
  const preview = useQuery(
    api.naming.peekNextCode,
    !fixedNamingCode && value.location && value.discipline
      ? {
          location: value.location,
          discipline: value.discipline,
          type: value.type,
        }
      : "skip",
  )

  const namingCode = fixedNamingCode ?? preview?.code ?? ""

  function patch(p: Partial<MetadataValue>) {
    onChange({ ...value, ...p })
  }

  const userLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const u of users) map.set(u.id, u.name ?? u.email ?? "User")
    return map
  }, [users])

  const meId = me?._id ?? null

  return (
    <aside className="space-y-4 rounded-lg border bg-card p-4 text-card-foreground">
      <header className="space-y-0.5">
        <h2 className="text-sm font-semibold">Document details</h2>
        <p className="text-xs text-muted-foreground">
          How this document is filed, named, and reviewed.
        </p>
      </header>

      {/* Filing — title, the location/discipline/type triplet, naming code. */}
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="doc-title" className="text-xs font-medium">
            Title
          </Label>
          <Input
            id="doc-title"
            value={value.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Daily handover SOP"
          />
          {errors["title"] && (
            <p className="text-xs text-destructive">{errors["title"]}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <CompactSelect
            label="Location"
            required={!filingLocked}
            display={value.location}
            placeholder="—"
            value={value.location}
            onValueChange={(v) => patch({ location: v })}
            error={filingLocked ? undefined : errors["location"]}
            disabled={filingLocked}
          >
            {locations.map((l) => (
              <SelectItem key={l._id} value={l.code}>
                <span className="font-mono">{l.code}</span> · {l.label}
              </SelectItem>
            ))}
          </CompactSelect>
          <CompactSelect
            label="Discipline"
            required={!filingLocked}
            display={value.discipline}
            placeholder="—"
            value={value.discipline}
            onValueChange={(v) => patch({ discipline: v })}
            error={filingLocked ? undefined : errors["discipline"]}
            disabled={filingLocked}
          >
            {disciplines.map((d) => (
              <SelectItem key={d._id} value={d.code}>
                <span className="font-mono">{d.code}</span> · {d.label}
              </SelectItem>
            ))}
          </CompactSelect>
          <CompactSelect
            label="Type"
            display={resolveType(value.type).token}
            value={value.type}
            onValueChange={(v) => patch({ type: v as DocumentType })}
            disabled={filingLocked}
          >
            {typeChoices.map((t) => (
              <SelectItem key={t.slug} value={t.slug}>
                {t.label}
              </SelectItem>
            ))}
          </CompactSelect>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium">Naming code</Label>
          <div
            className={`flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-sm ${
              filingLocked ? "bg-muted/70 text-muted-foreground" : "bg-muted/40"
            }`}
          >
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            {namingCode ? (
              <span>{namingCode}</span>
            ) : (
              <span className="text-muted-foreground">
                Pick a location and discipline
              </span>
            )}
          </div>
          {filingLocked ? (
            <p className="text-[11px] text-muted-foreground">
              Fixed once the document is created.{" "}
              {onRequestRefile && (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={onRequestRefile}
                >
                  Need a different filing? Create a new document…
                </button>
              )}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Auto-generated on create — next in this location + discipline +
              type sequence.
            </p>
          )}
        </div>
      </div>

      <Separator />

      {/* Owner — shown on the PDF cover. Defaults to the author; can be cleared. */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Owner
          </Label>
          {meId && value.ownerId !== meId && (
            <button
              type="button"
              className="text-[11px] text-primary hover:underline"
              onClick={() => patch({ ownerId: meId })}
            >
              Set to author
            </button>
          )}
        </div>
        <RoleSelect
          value={value.ownerId}
          onChange={(id) => patch({ ownerId: id })}
          users={users}
          userLabel={userLabel}
        />
        <p className="text-[11px] text-muted-foreground">
          Shown on the PDF cover. Defaults to the author; leave unassigned for a
          blank owner.
        </p>
      </div>

      <Separator />

      {/* Review flow — author → reviewer → approver as a numbered sequence. */}
      <div className="space-y-2">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Review flow
        </Label>
        <div>
          <FlowNode num={1} label="Author" connector>
            <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
              <span>{me ? (me.name ?? me.email ?? "You") : "…"}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                you
              </span>
            </div>
          </FlowNode>
          <FlowNode
            num={2}
            label="Reviewer"
            connector
            action={
              meId && value.reviewerId !== meId ? (
                <SetToMe onClick={() => patch({ reviewerId: meId })} />
              ) : null
            }
          >
            <RoleSelect
              value={value.reviewerId}
              onChange={(id) => patch({ reviewerId: id })}
              users={users}
              userLabel={userLabel}
            />
          </FlowNode>
          <FlowNode
            num={3}
            label="Approver"
            action={
              meId && value.approverId !== meId ? (
                <SetToMe onClick={() => patch({ approverId: meId })} />
              ) : null
            }
          >
            <RoleSelect
              value={value.approverId}
              onChange={(id) => patch({ approverId: id })}
              users={users}
              userLabel={userLabel}
            />
          </FlowNode>
        </div>
      </div>

      <Separator />

      {/* Connections — derived from the body chips; icons match the toolbar. */}
      <div className="space-y-2">
        <LinkCard
          icon={Factory}
          title="Linked Assets"
          tone="emerald"
          emptyHint="None. Insert one in the body (toolbar → Assets)."
          items={derivedAssets.map((a) => ({
            id: a.id,
            code: a.code,
            label: a.name,
          }))}
        />
        <LinkCard
          icon={BookMarked}
          title="Reference documents"
          tone="indigo"
          emptyHint="None. Cite one in the body (toolbar → Reference document)."
          items={derivedRefs.map((r) => ({
            id: r.id,
            code: r.code,
            label: r.title,
          }))}
        />
        <LinkCard
          icon={Play}
          title="Linked logs"
          tone="sky"
          emptyHint="None. Insert one in the body (toolbar → Launch log)."
          items={derivedLogs.map((l) => ({
            id: l.id,
            code: l.code,
            label: l.name,
          }))}
        />
      </div>
    </aside>
  )
}

// A select whose trigger shows a compact display string (e.g. the code only),
// while the open dropdown shows the full `code · label` items.
function CompactSelect({
  label,
  display,
  placeholder = "—",
  value,
  onValueChange,
  error,
  disabled,
  required,
  children,
}: {
  label: string
  display: string
  placeholder?: string
  value: string
  onValueChange: (v: string) => void
  error?: string
  disabled?: boolean
  required?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <Select
        value={value || undefined}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <SelectTrigger className="h-9 px-2">
          <span className="truncate font-mono text-xs">
            {display || <span className="text-muted-foreground">{placeholder}</span>}
          </span>
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function FlowNode({
  num,
  label,
  connector,
  action,
  children,
}: {
  num: number
  label: string
  connector?: boolean
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex gap-2.5">
      <div className="flex flex-col items-center">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
          {num}
        </div>
        {connector && <div className="my-1 w-px flex-1 bg-border" />}
      </div>
      <div className="flex-1 pb-3">
        <div className="mb-1 flex items-center justify-between">
          <Label className="text-xs font-medium">{label}</Label>
          {action}
        </div>
        {children}
      </div>
    </div>
  )
}

function SetToMe({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="text-[11px] text-primary hover:underline"
      onClick={onClick}
    >
      Set to me
    </button>
  )
}

function RoleSelect({
  value,
  onChange,
  users,
  userLabel,
}: {
  value: string
  onChange: (id: string) => void
  users: { id: string; name: string | null; email: string | null }[]
  userLabel: Map<string, string>
}) {
  return (
    <Select
      value={value || NONE}
      onValueChange={(v) => onChange(v === NONE ? "" : v)}
    >
      <SelectTrigger className="h-9">
        <SelectValue>
          {value ? (userLabel.get(value) ?? "User") : "Unassigned"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Unassigned</SelectItem>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.name ?? u.email ?? "User"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const LINK_CARD_TONES = {
  emerald: {
    card: "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20",
    head: "text-emerald-700 dark:text-emerald-300",
    icon: "text-emerald-600",
    item: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100",
    label: "text-emerald-700/80",
  },
  indigo: {
    card: "border-indigo-200 bg-indigo-50/50 dark:border-indigo-900/40 dark:bg-indigo-950/20",
    head: "text-indigo-700 dark:text-indigo-300",
    icon: "text-indigo-600",
    item: "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-100",
    label: "text-indigo-700/80",
  },
  sky: {
    card: "border-sky-200 bg-sky-50/50 dark:border-sky-900/40 dark:bg-sky-950/20",
    head: "text-sky-700 dark:text-sky-300",
    icon: "text-sky-600",
    item: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100",
    label: "text-sky-700/80",
  },
} as const

function LinkCard({
  icon: Icon,
  title,
  tone,
  emptyHint,
  items,
}: {
  icon: typeof Factory
  title: string
  tone: keyof typeof LINK_CARD_TONES
  emptyHint: string
  items: { id: string; code: string; label: string }[]
}) {
  const tones = LINK_CARD_TONES[tone]
  const cardTone = tones.card
  const headTone = tones.head
  const iconTone = tones.icon
  const itemTone = tones.item
  const labelTone = tones.label
  return (
    <div className={`space-y-1.5 rounded-md border p-2.5 ${cardTone}`}>
      <div className="flex items-center gap-1.5">
        <Icon className={`h-4 w-4 shrink-0 ${iconTone}`} />
        <Label
          className={`text-[10px] font-semibold uppercase tracking-wider ${headTone}`}
        >
          {title}
        </Label>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-1">
          {items.map((it) => (
            <li
              key={it.id}
              className={`flex items-center gap-1.5 rounded border px-1.5 py-1 ${itemTone}`}
            >
              <Icon className={`h-3 w-3 shrink-0 ${iconTone}`} />
              <span className="font-mono text-[11px] font-medium">{it.code}</span>
              <span className={`truncate text-[11px] ${labelTone}`}>
                {it.label}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">{emptyHint}</p>
      )}
    </div>
  )
}
