// MetadataPanel
//
// Right-rail form for document metadata. The naming code is no longer typed by
// hand — it is built from Location + Discipline + Type and an auto sequence
// allocated server-side. Tags and manual asset-linking are gone: linked assets
// are derived from the asset pills in the body and shown read-only here.
//
// Lifecycle roles are people (CONTEXT.md: people act through check-in): Owner,
// Reviewer and Approver are Engineers; the author is the checked-in person.
// Gating happens at the transition, not at save, so these can be left empty
// while drafting. Four-eyes is enforced on the server.

import { useMemo, type ReactNode } from "react"
import { z } from "zod"
import type { DocumentType } from "@/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { useCheckIn } from "@/lib/checkIn"
import { BookMarked, Factory, Hash, Play } from "lucide-react"
import { isEngineerOrAdmin } from "@/lib/roles"

export interface MetadataValue {
  title: string
  type: DocumentType
  location: string
  discipline: string
  /** People (kind "engineer") as ids, "" when unassigned. */
  ownerPersonId: string
  reviewerPersonId: string
  approverPersonId: string
}

export const metadataSchema = z
  .object({
    title: z.string().trim().min(1, "Give the document a title").max(200),
    type: z.string().trim().min(1, "Choose a type"),
    location: z.string().trim().min(1, "Choose a location"),
    discipline: z.string().trim().min(1, "Choose a discipline"),
    ownerPersonId: z.string().default(""),
    reviewerPersonId: z.string().default(""),
    approverPersonId: z.string().default(""),
  })
  .refine((v) => !v.reviewerPersonId || v.reviewerPersonId !== v.approverPersonId, {
    message: "The reviewer and the approver must be two different Engineers",
    path: ["approverPersonId"],
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
  const { person, people } = useCheckIn()
  const vocab = useQuery(api.naming.listVocabulary)
  const engineers = useMemo(() => (people ?? []).filter((p) => isEngineerOrAdmin(p)), [people])

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

  // "Set to me" is the checked-in Engineer; hidden when Anonymous.
  const meId = isEngineerOrAdmin(person) ? person._id : null

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
            placeholder="Choose"
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
            placeholder="Choose"
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
            <p className="text-xs text-muted-foreground">
              Fixed once the document is created.{" "}
              {onRequestRefile && (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={onRequestRefile}
                >
                  Need a different filing? Create a new document
                </button>
              )}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Given on create: the next number for this location, discipline and type.
            </p>
          )}
        </div>
      </div>

      <Separator />

      {/* Owner: the Engineer responsible for keeping it right (PDF cover). */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">Owner</Label>
          {meId && value.ownerPersonId !== meId && <SetToMe onClick={() => patch({ ownerPersonId: meId })} />}
        </div>
        <RoleSelect
          label="Owner"
          value={value.ownerPersonId}
          onChange={(id) => patch({ ownerPersonId: id })}
          people={engineers}
        />
        <p className="text-xs text-muted-foreground">
          The Engineer who keeps it right. Shown on the PDF cover.
        </p>
      </div>

      <Separator />

      {/* Review flow — author → reviewer → approver as a numbered sequence. */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Review flow</Label>
        <div>
          <FlowNode num={1} label="Author" connector>
            <div className="flex h-9 items-center justify-between rounded-md border bg-muted/40 px-3 text-sm">
              <span className={person ? "" : "text-muted-foreground"}>
                {person ? person.name : "Check in to be named the author"}
              </span>
              {person && <span className="text-xs text-muted-foreground">checked in</span>}
            </div>
          </FlowNode>
          <FlowNode
            num={2}
            label="Reviewer"
            connector
            action={
              meId && value.reviewerPersonId !== meId ? (
                <SetToMe onClick={() => patch({ reviewerPersonId: meId })} />
              ) : null
            }
          >
            <RoleSelect
              label="Reviewer"
              value={value.reviewerPersonId}
              onChange={(id) => patch({ reviewerPersonId: id })}
              people={engineers}
            />
            {person && value.reviewerPersonId === person._id && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                You are writing it, so another Engineer must review it.
              </p>
            )}
          </FlowNode>
          <FlowNode
            num={3}
            label="Approver"
            action={
              meId && value.approverPersonId !== meId ? (
                <SetToMe onClick={() => patch({ approverPersonId: meId })} />
              ) : null
            }
          >
            <RoleSelect
              label="Approver"
              value={value.approverPersonId}
              onChange={(id) => patch({ approverPersonId: id })}
              people={engineers}
            />
            {errors["approverPersonId"] && (
              <p className="mt-1 text-xs text-destructive">{errors["approverPersonId"]}</p>
            )}
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
          emptyHint="None. Insert one in the body with the Assets button in the toolbar."
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
          emptyHint="None. Cite one in the body with the Reference document button."
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
          emptyHint="None. Insert one in the body with the Launch log button."
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
  placeholder = "Choose",
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
        <SelectTrigger className="h-9 px-2" aria-label={label}>
          <span className="truncate font-mono text-sm">
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
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
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
      className="text-xs text-primary hover:underline"
      onClick={onClick}
    >
      Set to me
    </button>
  )
}

function RoleSelect({
  label,
  value,
  onChange,
  people,
}: {
  label: string
  value: string
  onChange: (id: string) => void
  people: { _id: string; name: string; role: string }[]
}) {
  const current = people.find((p) => p._id === value)
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger className="h-9" aria-label={`${label}: ${value ? (current?.name ?? "Engineer") : "not chosen yet"}`}>
        <SelectValue>{value ? (current?.name ?? "Engineer") : "Not chosen yet"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Not chosen yet</SelectItem>
        {people.map((p) => (
          <SelectItem key={p._id} value={p._id}>
            {p.name} <span className="text-muted-foreground">· {p.role}</span>
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
    label: "text-emerald-800 dark:text-emerald-300",
  },
  indigo: {
    card: "border-indigo-200 bg-indigo-50/50 dark:border-indigo-900/40 dark:bg-indigo-950/20",
    head: "text-indigo-700 dark:text-indigo-300",
    icon: "text-indigo-600",
    item: "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-100",
    label: "text-indigo-800 dark:text-indigo-300",
  },
  sky: {
    card: "border-sky-200 bg-sky-50/50 dark:border-sky-900/40 dark:bg-sky-950/20",
    head: "text-sky-700 dark:text-sky-300",
    icon: "text-sky-600",
    item: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100",
    label: "text-sky-800 dark:text-sky-300",
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
          className={`text-xs font-semibold ${headTone}`}
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
              <span className="font-mono text-xs font-medium">{it.code}</span>
              <span className={`truncate text-xs ${labelTone}`}>
                {it.label}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      )}
    </div>
  )
}
