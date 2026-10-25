import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { ORG_LIMITS } from "../../../convex/settings/limits"
import { BadgeCheck } from "lucide-react"
import { EditNotice, Field, LinkCard, NumberInput, SaveBar, useOrgGroup, useSettingsEditor } from "./SettingsBits"

// Settings, Documents: Periodic review defaults and the approval rules the
// server applies on submit, approve and publish (convex/documents.ts).
export function DocumentRulesSettings() {
  const f = useOrgGroup("documents", "Review and approval rules saved.")
  const { editorId } = useSettingsEditor()
  const v = f.value
  const off = !editorId

  return (
    <div className="space-y-4">
      <EditNotice />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Periodic review</CardTitle>
          <CardDescription className="text-sm">
            Every Published document is checked again after this interval. A document can set its own interval on its
            page; this is the default for all others.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!v ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <Field
                label="Review interval"
                htmlFor="doc-review-interval"
                hint="Counted from the publish date or the last confirmed review."
              >
                <NumberInput
                  id="doc-review-interval"
                  value={v.reviewIntervalMonths}
                  onChange={(n) => f.set("reviewIntervalMonths", n)}
                  min={ORG_LIMITS.reviewIntervalMonths[0]}
                  max={ORG_LIMITS.reviewIntervalMonths[1]}
                  suffix="months"
                  disabled={off}
                />
              </Field>
              <Field
                label="Due soon"
                htmlFor="doc-due-soon"
                hint="A review shows on Home and in Knowledge health this many days before it is due."
              >
                <NumberInput
                  id="doc-due-soon"
                  value={v.dueSoonDays}
                  onChange={(n) => f.set("dueSoonDays", n)}
                  min={ORG_LIMITS.dueSoonDays[0]}
                  max={ORG_LIMITS.dueSoonDays[1]}
                  suffix="days"
                  disabled={off}
                />
              </Field>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Approval rules</CardTitle>
          <CardDescription className="text-sm">
            Checked on the server when a document is submitted, approved and published.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!v ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <Field
                label="Four-eyes"
                htmlFor="doc-four-eyes"
                hint="The reviewer is not an author of the version, and the reviewer and the approver are two different Engineers. Recommended under ISO 9001."
              >
                <Switch
                  id="doc-four-eyes"
                  checked={v.fourEyes}
                  onCheckedChange={(c) => f.set("fourEyes", c)}
                  disabled={off}
                />
              </Field>
              <Field
                label="Change note required"
                htmlFor="doc-change-note"
                hint={'From version 2 on, the author writes "What changed and why" before submitting.'}
              >
                <Switch
                  id="doc-change-note"
                  checked={v.requireChangeNote}
                  onCheckedChange={(c) => f.set("requireChangeNote", c)}
                  disabled={off}
                />
              </Field>
            </>
          )}
        </CardContent>
      </Card>
      <SaveBar dirty={f.dirty} saving={f.saving} onSave={() => void f.save()} onReset={f.reset} error={f.error} />
      <LinkCard
        href="/iso-9001"
        icon={BadgeCheck}
        title="ISO 9001"
        text="What ISO 9001 asks for, and what Oppr already does about it."
      />
    </div>
  )
}
