import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { Factory, ImageOff } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ImagePickerDialog } from "@/components/images/ImagePickerDialog"
import { EditNotice, errorText, Field, LinkCard, SaveBar, useSettingsEditor } from "./SettingsBits"

type Lang = "en" | "nl"
const LANG_LABEL: Record<Lang, string> = { en: "English", nl: "Dutch" }

type Edits = {
  name?: string
  logo?: { id: Id<"images"> | null; url: string | null }
  languages?: Lang[]
  ppeLanguage?: Lang
}

// Settings, Company: the company name and logo (one source, coverSettings,
// used on the title page, the Floor simulator, Training records and MCP),
// and which languages are used.
export function CompanySettings() {
  const cover = useQuery(api.coverSettings.get)
  const org = useQuery(api.orgSettings.get)
  const ppeLanguage = useQuery(api.ppe.getLanguage) as Lang | undefined
  const setCompany = useMutation(api.coverSettings.setCompany)
  const updateOrg = useMutation(api.orgSettings.update)
  const setPpeLanguage = useMutation(api.ppe.setLanguage)
  const { editorId } = useSettingsEditor()
  const off = !editorId

  const [edits, setEdits] = useState<Edits>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loading = cover === undefined || org === undefined || ppeLanguage === undefined
  const savedName = cover?.companyName ?? ""
  const savedLogo = { id: cover?.logoImageId ?? null, url: cover?.logoUrl ?? null }
  const savedLangs = org?.company.documentLanguages ?? ["en", "nl"]
  const name = edits.name ?? savedName
  const logo = edits.logo ?? savedLogo
  const languages = edits.languages ?? savedLangs
  const ppe = edits.ppeLanguage ?? ppeLanguage ?? "en"

  const nameChanged = name.trim() !== savedName.trim()
  const logoChanged = logo.id !== savedLogo.id
  const langsChanged = [...languages].sort().join() !== [...savedLangs].sort().join()
  const ppeChanged = ppeLanguage !== undefined && ppe !== ppeLanguage
  const dirty = nameChanged || logoChanged || langsChanged || ppeChanged

  function edit(e: Partial<Edits>) {
    setError(null)
    setEdits((cur) => ({ ...cur, ...e }))
  }

  async function save() {
    if (!editorId) return
    if (languages.length === 0) {
      setError("Keep at least one document language.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (nameChanged || logoChanged)
        await setCompany({ companyName: name.trim() || null, logoImageId: logo.id, personId: editorId })
      if (langsChanged) await updateOrg({ personId: editorId, company: { documentLanguages: languages } })
      if (ppeChanged) await setPpeLanguage({ language: ppe, personId: editorId })
      setEdits({})
      toast.success("Company settings saved.")
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <EditNotice />
      <Card data-tour="settings-company-name">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Name and logo</CardTitle>
          <CardDescription className="text-sm">
            Used everywhere the company is named: the title page of every PDF, the Floor simulator, Training records
            and MCP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading ? (
            <Skeleton className="h-28 w-full" />
          ) : (
            <>
              <Field label="Company name" htmlFor="company-name">
                <Input
                  id="company-name"
                  value={name}
                  maxLength={120}
                  onChange={(e) => edit({ name: e.target.value })}
                  placeholder="e.g. your plant's name"
                  disabled={off}
                />
              </Field>
              <Field label="Logo" hint="Shown on the title page. Picked from the image library.">
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
                    {logo.url ? (
                      <img src={logo.url} alt="Company logo" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <ImageOff className="h-4 w-4 text-muted-foreground/50" aria-label="No logo" />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} disabled={off}>
                      {logo.id ? "Change" : "Choose logo"}
                    </Button>
                    {logo.id && (
                      <Button size="sm" variant="ghost" onClick={() => edit({ logo: { id: null, url: null } })} disabled={off}>
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </Field>
            </>
          )}
        </CardContent>
      </Card>

      <Card data-tour="settings-company-languages">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Languages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading ? (
            <Skeleton className="h-28 w-full" />
          ) : (
            <>
              <Field label="App language" hint="Oppr Knowledge is in English for now.">
                <p className="text-sm">English</p>
              </Field>
              <Field label="Document languages" hint="The languages your documents are written in.">
                <div className="flex flex-wrap gap-4">
                  {(["en", "nl"] as const).map((l) => (
                    <label key={l} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={languages.includes(l)}
                        onCheckedChange={(c) =>
                          edit({ languages: c ? [...new Set([...languages, l])] : languages.filter((x) => x !== l) })
                        }
                        disabled={off}
                        aria-label={LANG_LABEL[l]}
                      />
                      {LANG_LABEL[l]}
                    </label>
                  ))}
                </div>
              </Field>
              <Field
                label="Safety icon captions"
                htmlFor="company-ppe-lang"
                hint="The language of the captions under PPE and safety pictograms in documents."
              >
                <Select value={ppe} onValueChange={(s) => edit({ ppeLanguage: s as Lang })} disabled={off}>
                  <SelectTrigger id="company-ppe-lang" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="nl">Dutch</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </>
          )}
        </CardContent>
      </Card>

      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onReset={() => setEdits({})} error={error} />

      <LinkCard
        href="/plant"
        icon={Factory}
        title="Sites, areas and lines"
        text="The plant's structure and background live under Plant."
      />

      <ImagePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Choose the logo"
        initialQuery="company logo"
        onPick={({ imageId, url }) => edit({ logo: { id: imageId, url } })}
      />
    </div>
  )
}
