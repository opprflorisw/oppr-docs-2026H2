// PDF cover settings — configured once under Templates → PDF cover, consumed
// by every export. Single Convex row, upserted. Includes a live mini-preview
// approximating the export's title page.

import { useEffect, useState } from "react"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import { ImageOff, Loader2, Save } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Link } from "wouter"
import { cn } from "@/lib/utils"
import { errorText, useEditorMutation } from "@/components/settings/SettingsBits"

type TitleSize = "sm" | "md" | "lg"
type WatermarkChoice = "none" | "controlled" | "draft" | "review" | "unset"

interface FormState {
  companyName: string
  headerText: string
  footerText: string
  titleSize: TitleSize
  logoImageId: Id<"images"> | null
  logoUrl: string | null
  showPageNumbers: boolean
  confidentialityLabel: string
  defaultWatermark: WatermarkChoice
  accentColor: string
}

const DEFAULT_FORM: FormState = {
  companyName: "",
  headerText: "",
  footerText: "",
  titleSize: "md",
  logoImageId: null,
  logoUrl: null,
  showPageNumbers: true,
  confidentialityLabel: "",
  defaultWatermark: "unset",
  accentColor: "",
}

const DEFAULT_ACCENT = "#ea580c"
const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function CoverSettingsEditor() {
  const settings = useQuery(api.coverSettings.get)
  const upsert = useEditorMutation(api.coverSettings.upsert)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [seeded, setSeeded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (seeded || settings === undefined) return
    if (settings) {
      setForm({
        companyName: settings.companyName ?? "",
        headerText: settings.headerText ?? "",
        footerText: settings.footerText ?? "",
        titleSize: settings.titleSize,
        logoImageId: settings.logoImageId ?? null,
        logoUrl: settings.logoUrl,
        showPageNumbers: settings.showPageNumbers,
        confidentialityLabel: settings.confidentialityLabel ?? "",
        defaultWatermark: settings.defaultWatermark ?? "unset",
        accentColor: settings.accentColor ?? "",
      })
    }
    setSeeded(true)
  }, [settings, seeded])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSave() {
    const accent = form.accentColor.trim()
    if (accent && !HEX_PATTERN.test(accent)) {
      toast.error("Accent color must be a hex value like #ea580c.")
      return
    }
    setSaving(true)
    try {
      await upsert({
        // Name and logo are edited under Settings, Company (one source).
        companyName: settings?.companyName ?? null,
        headerText: form.headerText.trim() || null,
        footerText: form.footerText.trim() || null,
        titleSize: form.titleSize,
        logoImageId: settings?.logoImageId ?? null,
        showPageNumbers: form.showPageNumbers,
        confidentialityLabel: form.confidentialityLabel.trim() || null,
        defaultWatermark:
          form.defaultWatermark === "unset" ? null : form.defaultWatermark,
        accentColor: accent || null,
      })
      toast.success("PDF cover settings saved. Every export now uses them.")
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  if (settings === undefined) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">PDF cover</CardTitle>
          <CardDescription className="text-xs">
            Configured once, applied to every PDF export: cover page, recurring
            header and footer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label="Company name and logo" hint="One source for the whole app, edited under Settings, Company.">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-24 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
                {settings?.logoUrl ? (
                  <img src={settings.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                ) : (
                  <ImageOff className="h-4 w-4 text-muted-foreground/50" />
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm">{settings?.companyName || "No company name yet"}</p>
                <Link href="/settings?tab=company" className="text-xs font-medium text-primary underline-offset-2 hover:underline">
                  Change under Company
                </Link>
              </div>
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title size">
              <Select
                value={form.titleSize}
                onValueChange={(v) => set("titleSize", v as TitleSize)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sm">Small</SelectItem>
                  <SelectItem value="md">Medium</SelectItem>
                  <SelectItem value="lg">Large</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Accent color" hint="Hex, e.g. #ea580c. Empty = default orange.">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={HEX_PATTERN.test(form.accentColor) ? form.accentColor : DEFAULT_ACCENT}
                  onChange={(e) => set("accentColor", e.target.value)}
                  className="h-9 w-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
                  aria-label="Pick accent color"
                />
                <Input
                  value={form.accentColor}
                  onChange={(e) => set("accentColor", e.target.value)}
                  placeholder={DEFAULT_ACCENT}
                  className="font-mono"
                />
              </div>
            </Field>
          </div>

          <Field
            label="Page header text"
            hint="Right slot of the recurring page header. Empty = document title."
          >
            <Input
              value={form.headerText}
              onChange={(e) => set("headerText", e.target.value)}
              placeholder="e.g. Internal use only"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Footer text" hint="Recurring footer, e.g. a confidentiality line.">
              <Input
                value={form.footerText}
                onChange={(e) => set("footerText", e.target.value)}
                placeholder="e.g. Property of your company"
              />
            </Field>
            <Field
              label="Confidentiality label"
              hint="Stamped on the cover and in the footer."
            >
              <Input
                value={form.confidentialityLabel}
                onChange={(e) => set("confidentialityLabel", e.target.value)}
                placeholder="e.g. CONFIDENTIAL"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Default watermark"
              hint="Pre-selected in the export dialog for published versions."
            >
              <Select
                value={form.defaultWatermark}
                onValueChange={(v) => set("defaultWatermark", v as WatermarkChoice)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Not set (Controlled copy)</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="controlled">Controlled copy</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="review">Under review</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-center gap-3 pt-5">
              <Switch
                id="page-numbers"
                checked={form.showPageNumbers}
                onCheckedChange={(v) => set("showPageNumbers", v)}
              />
              <Label htmlFor="page-numbers" className="cursor-pointer text-sm">
                Show page numbers
              </Label>
            </div>
          </div>

          <div className="flex justify-end border-t pt-4">
            <Button size="sm" className="gap-1.5" onClick={() => void onSave()} disabled={saving}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save cover settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <CoverPreview
        form={{ ...form, companyName: settings?.companyName ?? "", logoUrl: settings?.logoUrl ?? null }}
      />

    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function CoverPreview({ form }: { form: FormState }) {
  const accent = HEX_PATTERN.test(form.accentColor.trim())
    ? form.accentColor.trim()
    : DEFAULT_ACCENT
  const company = form.companyName.trim() || "Oppr Knowledge"
  const titleClass =
    form.titleSize === "sm"
      ? "text-sm"
      : form.titleSize === "lg"
        ? "text-xl"
        : "text-base"
  const footerParts = [
    form.confidentialityLabel.trim(),
    form.footerText.trim(),
  ].filter(Boolean)

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Cover preview
      </div>
      <div className="flex aspect-[210/297] flex-col rounded-md border bg-white p-5 shadow-sm dark:border-slate-700">
        {form.logoUrl && (
          <img
            src={form.logoUrl}
            alt="Logo"
            className="mb-3 max-h-8 max-w-[40%] self-start object-contain"
          />
        )}
        <div
          className="text-[8px] font-bold uppercase tracking-[0.3em]"
          style={{ color: accent }}
        >
          {company} · Controlled document
        </div>
        <div className="mt-1 text-[7px] uppercase tracking-[0.18em] text-slate-500">
          Standard Operating Procedure
        </div>
        <div className={cn("mt-3 font-bold leading-tight text-slate-900", titleClass)}>
          Document title
        </div>
        <span className="mt-2 inline-block self-start rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[8px] font-bold text-slate-900">
          EXT-OPS-SOP-0001
        </span>
        <div className="mt-1.5 text-[7px] font-semibold uppercase tracking-wider text-slate-500">
          Version 1 · published
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-0.5 border-y border-slate-200 py-1.5 text-[7px] text-slate-600">
          <span>Owner: Not assigned</span>
          <span>Effective: Not set</span>
          <span>Review by: Not set</span>
          <span>Revision 1</span>
        </div>
        <div className="mt-auto border-t border-slate-200 pt-2 text-[7px] leading-snug text-slate-500">
          {form.confidentialityLabel.trim() && (
            <div className="font-bold uppercase tracking-[0.18em] text-red-700">
              {form.confidentialityLabel.trim()}
            </div>
          )}
          <div className="font-bold uppercase tracking-[0.18em] text-slate-900">
            Controlled copy
          </div>
          <div>Verify the latest revision in Oppr Knowledge before use.</div>
        </div>
        <div className="mt-2 flex items-center justify-between text-[6px] text-slate-400">
          <span>{footerParts.join(" · ") || "Effective date"}</span>
          {form.showPageNumbers && <span>Page 1 of 4</span>}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Approximation of the exported title page. Fields left empty fall back to
        the built-in defaults.
      </p>
    </div>
  )
}
