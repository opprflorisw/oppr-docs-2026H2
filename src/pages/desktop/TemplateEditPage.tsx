// TemplateEditPage (/templates/new and /templates/:id/edit)
//
// Authors a template body with the real DocumentEditor, plus name / type /
// description. Templates are plain TipTap JSON; their "placeholders" are just
// empty paragraphs and table cells the author fills in after starting a doc
// from the template.

import { useEffect, useState } from "react"
import { useLocation, useRoute } from "wouter"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { Eye, LayoutTemplate } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import {
  buildPrintDoc,
  DEFAULT_PDF_OPTIONS,
} from "@/lib/pdf-export/buildPrintDoc"
import { openPrintWindow } from "@/lib/pdf-export/openPrintWindow"
import { extractPpeItems } from "@/components/docs/DocumentHero"
import type { Doc as LegacyDoc, DocVersion } from "@/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DocumentEditor } from "@/components/docs/DocumentEditor"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { templateForType } from "@/components/docs/DocumentTemplates"
import { useDocTypes } from "@/lib/typeMeta"
import type { DocumentType } from "@/types"

export function TemplateEditPage() {
  const [, editParams] = useRoute<{ id: string }>("/templates/:id/edit")
  const [, navigate] = useLocation()
  const id = editParams?.id ?? null
  const isNew = !id

  const existing = useQuery(
    api.templates.get,
    id ? { id: id as Id<"templates"> } : "skip",
  )
  const create = useMutation(api.templates.create)
  const update = useMutation(api.templates.update)
  const { types: docTypes } = useDocTypes()

  const [name, setName] = useState("")
  const [type, setType] = useState<DocumentType>("sop")
  const [description, setDescription] = useState("")
  const [body, setBody] = useState<unknown>(() => templateForType("sop"))
  const [hydrated, setHydrated] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isNew || hydrated || !existing) return
    setName(existing.name)
    setType(existing.type)
    setDescription(existing.description ?? "")
    setBody(existing.bodyJson)
    setHydrated(true)
  }, [existing, hydrated, isNew])

  async function save() {
    if (!name.trim()) {
      toast.error("Give the template a name")
      return
    }
    setSaving(true)
    try {
      if (isNew) {
        await create({
          name: name.trim(),
          type,
          description: description.trim() || null,
          bodyJson: body,
        })
        toast.success("Template created")
      } else {
        await update({
          id: id as Id<"templates">,
          name: name.trim(),
          type,
          description: description.trim() || null,
          bodyJson: body,
        })
        toast.success("Template saved")
      }
      navigate("/settings?tab=templates")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  function previewPdf() {
    const nowIso = new Date().toISOString()
    const synthDoc: LegacyDoc = {
      id: "template",
      naming_code: "TEMPLATE-PREVIEW",
      title: name.trim() || "Template preview",
      type,
      status: "draft",
      current_version: 1,
      live_version: null,
      owner_id: "",
      tags: [],
      created_at: nowIso,
      updated_at: nowIso,
    }
    const synthVersion: DocVersion = {
      id: "v1",
      document_id: "template",
      version: 1,
      body_kind: "tiptap",
      body_json: body,
      pdf_blob_id: null,
      published_at: nowIso,
    }
    const html = buildPrintDoc({
      doc: synthDoc,
      version: synthVersion,
      assets: [],
      ownerName: null,
      options: DEFAULT_PDF_OPTIONS,
      ppeOnDoc: extractPpeItems(body),
    })
    const win = openPrintWindow(html)
    if (!win) toast.error("Couldn't open the preview. Check your popup blocker.")
  }

  if (!isNew && existing === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }
  if (!isNew && existing === null) {
    return (
      <div className="space-y-2 p-6">
        <h1 className="text-lg font-semibold">Template not found</h1>
        <Button variant="outline" size="sm" onClick={() => navigate("/settings?tab=templates")}>
          Back to templates
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <TopBar
        breadcrumb={[
          { label: "Settings", href: "/settings?tab=templates" },
          { label: isNew ? "New template" : name || "Edit template" },
        ]}
      />
      <PageHeader
        icon={LayoutTemplate}
        title={isNew ? "New template" : "Edit template"}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate("/settings?tab=templates")}>
              Cancel
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={previewPdf}>
              <Eye className="h-3.5 w-3.5" />
              Preview PDF
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save template"}
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Body</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentEditor
                content={body}
                onChange={setBody}
                placeholder="Author the template body… type / for blocks"
                toolbarTopOffset={104}
              />
            </CardContent>
          </Card>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="SOP, standard"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as DocumentType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {docTypes
                      .filter((t) => t.active || t.slug === type)
                      .map((t) => (
                        <SelectItem key={t.slug} value={t.slug}>
                          {t.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Description</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="When to use this template"
                />
              </div>
              {isNew && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setBody(templateForType(type))}
                >
                  Reset body to {type.toUpperCase()} skeleton
                </Button>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
