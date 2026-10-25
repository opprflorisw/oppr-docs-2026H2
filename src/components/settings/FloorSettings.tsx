import { Boxes, Map as MapIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ORG_LIMITS } from "../../../convex/settings/limits"
import { EditNotice, Field, LinkCard, NumberInput, SaveBar, useOrgGroup, useSettingsEditor } from "./SettingsBits"
import { CAPTURE_NOTICE_POINTS } from "./captureNotice"

const RETENTION_CHOICES = [30, 90, 180, 365]

// Settings, Floor: shared phones and Captures privacy (docs/adr/0005).
export function FloorSettings() {
  const f = useOrgGroup("floor", "Floor settings saved.")
  const { editorId } = useSettingsEditor()
  const v = f.value
  const off = !editorId
  const retentionChoices =
    v?.captureRetentionDays != null && !RETENTION_CHOICES.includes(v.captureRetentionDays)
      ? [...RETENTION_CHOICES, v.captureRetentionDays].sort((a, b) => a - b)
      : RETENTION_CHOICES

  return (
    <div className="space-y-4">
      <EditNotice />
      <div className="grid gap-3 sm:grid-cols-2">
        <LinkCard
          href="/plant/assets"
          icon={Boxes}
          title="Assets"
          text="Every Asset with its QR code, under Plant."
        />
        <LinkCard
          href="/floor"
          icon={MapIcon}
          title="Floor simulator"
          text="Walk the plant with the phone app, for demos."
        />
      </div>

      <Card data-tour="settings-floor-phones">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Shared phones</CardTitle>
          <CardDescription className="text-sm">
            A checked-in person who walks away should not leave their name on a shared phone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!v ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Field
              label="Check-in timeout"
              htmlFor="floor-idle"
              hint="Without a touch for this long, the phone asks if the person is still there and then checks out."
            >
              <NumberInput
                id="floor-idle"
                value={v.checkInIdleMinutes}
                onChange={(n) => f.set("checkInIdleMinutes", n)}
                min={ORG_LIMITS.checkInIdleMinutes[0]}
                max={ORG_LIMITS.checkInIdleMinutes[1]}
                suffix="minutes"
                disabled={off}
              />
            </Field>
          )}
        </CardContent>
      </Card>

      <Card data-tour="settings-floor-captures">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Captures privacy</CardTitle>
          <CardDescription className="text-sm">
            Before their first Capture, every Operator sees a short notice on the phone. These points are always shown:
          </CardDescription>
          <ul className="list-disc space-y-1 pl-5 pt-1 text-sm text-muted-foreground">
            {CAPTURE_NOTICE_POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </CardHeader>
        <CardContent className="space-y-5">
          {!v ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <>
              <div className="space-y-2">
                <Field
                  label="Your own notice"
                  htmlFor="floor-notice"
                  hint="Shown under the standard points, for example what your works council agreed."
                  className="sm:grid-cols-1"
                >
                  <Textarea
                    id="floor-notice"
                    value={v.captureNotice ?? ""}
                    onChange={(e) => f.set("captureNotice", e.target.value || null)}
                    rows={3}
                    maxLength={ORG_LIMITS.captureNoticeChars[1]}
                    placeholder="e.g. Recordings are only used to improve our work instructions."
                    disabled={off}
                  />
                </Field>
                <p className="text-right text-xs text-muted-foreground">
                  {(v.captureNotice ?? "").length} of {ORG_LIMITS.captureNoticeChars[1]} characters
                </p>
              </div>
              <Field
                label="Keep media"
                htmlFor="floor-retention"
                hint="Photos, video and voice notes of handed-in Captures are removed after this period, every night. Notes, transcripts and descriptions stay. A photo a Draft uses stays with the Draft."
              >
                <Select
                  value={v.captureRetentionDays == null ? "forever" : String(v.captureRetentionDays)}
                  onValueChange={(s) => f.set("captureRetentionDays", s === "forever" ? null : Number(s))}
                  disabled={off}
                >
                  <SelectTrigger id="floor-retention" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="forever">Until deleted by hand</SelectItem>
                    {retentionChoices.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} days after hand-in
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </>
          )}
        </CardContent>
      </Card>
      <SaveBar dirty={f.dirty} saving={f.saving} onSave={() => void f.save()} onReset={f.reset} error={f.error} />
    </div>
  )
}
