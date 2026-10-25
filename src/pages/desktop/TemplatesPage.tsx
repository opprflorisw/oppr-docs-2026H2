// TemplatesList: DB-backed document templates (create / edit / duplicate /
// delete). Rendered as the Templates tab of Settings; the PDF title page and
// safety icons have their own Settings tabs.

import { useState } from "react"
import { useLocation } from "wouter"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import { Copy, LayoutTemplate, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/time"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { TypeBadge } from "@/components/docs/TypeBadge"
import { errorText, useEditorMutation } from "@/components/settings/SettingsBits"

export function TemplatesList() {
  const [, navigate] = useLocation()
  const templates = useQuery(api.templates.list, {})
  const duplicate = useEditorMutation(api.templates.duplicate)
  const remove = useEditorMutation(api.templates.remove)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  async function onDuplicate(id: string) {
    try {
      await duplicate({ id: id as Id<"templates"> })
      toast.success("Template duplicated")
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  async function onConfirmDelete() {
    if (!deleteTarget) return
    try {
      await remove({ id: deleteTarget.id as Id<"templates"> })
      toast.success("Template deleted")
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-3">
        <Button size="sm" className="gap-1.5" onClick={() => navigate("/templates/new")} data-tour="settings-templates-new">
          <Plus className="h-3.5 w-3.5" />
          New template
        </Button>
      </div>
      <div className="space-y-3" data-tour="settings-templates-list">

            {templates === undefined ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : templates.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <LayoutTemplate className="h-8 w-8 text-muted-foreground/50" />
                  <div>
                    <p className="text-sm font-medium">No templates yet</p>
                    <p className="text-xs text-muted-foreground">
                      Create one to give authors a head start.
                    </p>
                  </div>
                  <Button size="sm" onClick={() => navigate("/templates/new")}>
                    New template
                  </Button>
                </CardContent>
              </Card>
            ) : (
              templates.map((t) => (
                <Card key={t._id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <TypeBadge type={t.type} />
                          {t.name}
                        </CardTitle>
                        {t.description && (
                          <CardDescription className="mt-1 text-xs">
                            {t.description}
                          </CardDescription>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => navigate(`/templates/${t._id}/edit`)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-9 px-0"
                              aria-label={`More actions for ${t.name}`}
                            >
                              <MoreHorizontal aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => void onDuplicate(t._id)}>
                              <Copy className="mr-2 h-4 w-4" aria-hidden />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                              onSelect={() => setDeleteTarget({ id: t._id, name: t.name })}
                            >
                              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground">
                      Updated {formatDate(t.updatedAt)}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes &ldquo;{deleteTarget?.name}&rdquo;.
              Existing documents are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void onConfirmDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
