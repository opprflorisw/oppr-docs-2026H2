// Document creation chooser. Start blank, from a template, or by importing a
// PDF. Templates come from the DB (/templates); the PDF import embeds the file
// as an attachment inside an otherwise normal, editable document.

import { useLocation } from "wouter"
import { useQuery } from "convex/react"
import { FileText, LayoutTemplate, PlusCircle, Sparkles, Upload } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TypeBadge } from "@/components/docs/TypeBadge"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { api } from "../../../convex/_generated/api"

export function DocumentNewChooserPage() {
  const [, navigate] = useLocation()
  const templates = useQuery(api.templates.list, {})

  return (
    <div className="flex flex-col">
      <TopBar
        breadcrumb={[
          { label: "Documents", href: "/library" },
          { label: "New document" },
        ]}
      />
      <PageHeader
        icon={PlusCircle}
        title="New document"
        subtitle="Start blank, from a template, or by importing a PDF. You set the title, location, discipline, and reviewers on the next screen."
      />

      <div className="mx-auto w-full max-w-3xl space-y-8 p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <ChooserCard
            icon={FileText}
            title="Blank document"
            description="Open the editor on an empty page and build the document from scratch."
            onClick={() => navigate("/docs/new/compose?blank=1")}
          />
          <ChooserCard
            icon={Upload}
            title="Attach a PDF"
            description="Embed a PDF as a scrollable attachment inside a normal document you author around."
            onClick={() => navigate("/docs/new/import")}
          />
          <ChooserCard
            icon={Sparkles}
            title="Import & convert"
            description="Extract a PDF's text and images into an editable pre-draft. Shape it, then fit it to a template."
            onClick={() => navigate("/import")}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Or start from a template</h2>
          </div>
          {templates === undefined ? (
            <p className="text-xs text-muted-foreground">Loading templates…</p>
          ) : templates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No templates yet. Create them under{" "}
              <button
                className="text-primary hover:underline"
                onClick={() => navigate("/settings?tab=templates")}
              >
                Templates
              </button>
              .
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {templates.map((t) => (
                <Card
                  key={t._id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/docs/new/compose?template=${t._id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      navigate(`/docs/new/compose?template=${t._id}`)
                    }
                  }}
                  className="cursor-pointer transition-colors hover:border-primary"
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <TypeBadge type={t.type} />
                      {t.name}
                    </CardTitle>
                  </CardHeader>
                  {t.description && (
                    <CardContent className="pt-0">
                      <CardDescription className="text-xs">
                        {t.description}
                      </CardDescription>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ChooserCard({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof FileText
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
      className="cursor-pointer transition-colors hover:border-primary"
    >
      <CardHeader className="pb-3">
        <Icon className="h-10 w-10 text-primary" />
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardContent>
    </Card>
  )
}
