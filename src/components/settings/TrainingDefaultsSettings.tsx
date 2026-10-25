import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { ORG_LIMITS } from "../../../convex/settings/limits"
import { EditNotice, Field, NumberInput, SaveBar, useOrgGroup, useSettingsEditor } from "./SettingsBits"

const REFRESH_CHOICES = [6, 12, 24, 36]

// Settings, Training: what a new Training starts with in the builder, and the
// rules the server applies to Attempts and assignments. A Training that
// exists keeps its own pass mark, refresher and questions.
export function TrainingDefaultsSettings() {
  const f = useOrgGroup("training", "Training defaults saved. New Trainings start with them.")
  const { editorId } = useSettingsEditor()
  const v = f.value
  const off = !editorId
  const refreshChoices =
    v?.refreshMonths != null && !REFRESH_CHOICES.includes(v.refreshMonths)
      ? [...REFRESH_CHOICES, v.refreshMonths].sort((a, b) => a - b)
      : REFRESH_CHOICES

  return (
    <div className="space-y-4">
      <EditNotice />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">New Trainings start with</CardTitle>
          <CardDescription className="text-sm">
            The author can change each value in the Training builder. Published Trainings keep what they were approved
            with.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!v ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <Field label="Pass mark" htmlFor="tr-pass" hint="The share of questions a person must get right.">
                <NumberInput
                  id="tr-pass"
                  value={v.passMark}
                  onChange={(n) => f.set("passMark", n)}
                  min={ORG_LIMITS.passMark[0]}
                  max={ORG_LIMITS.passMark[1]}
                  suffix="%"
                  disabled={off}
                />
              </Field>
              <Field
                label="Questions per objective"
                htmlFor="tr-questions"
                hint="How many questions each Learning objective gets in an Attempt. Must-be-right objectives get at least two."
              >
                <NumberInput
                  id="tr-questions"
                  value={v.questionsPerObjective}
                  onChange={(n) => f.set("questionsPerObjective", n)}
                  min={ORG_LIMITS.questionsPerObjective[0]}
                  max={ORG_LIMITS.questionsPerObjective[1]}
                  disabled={off}
                />
              </Field>
              <Field
                label="Refresher"
                htmlFor="tr-refresh"
                hint="After this period people get a short refresher Attempt before their record expires."
              >
                <Select
                  value={v.refreshMonths == null ? "none" : String(v.refreshMonths)}
                  onValueChange={(s) => f.set("refreshMonths", s === "none" ? null : Number(s))}
                  disabled={off}
                >
                  <SelectTrigger id="tr-refresh" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No refresher</SelectItem>
                    {refreshChoices.map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        Every {m} months
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Due date"
                htmlFor="tr-due"
                hint="People who are assigned a Training have this many days to pass it."
              >
                <NumberInput
                  id="tr-due"
                  value={v.dueDays}
                  onChange={(n) => f.set("dueDays", n)}
                  min={ORG_LIMITS.dueDays[0]}
                  max={ORG_LIMITS.dueDays[1]}
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
          <CardTitle className="text-sm">Safety and coaching</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {!v ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <>
              <Field
                label="Try-out for safety content"
                htmlFor="tr-tryout"
                hint="The builder asks for a try-out at the line when a Training covers a safety key point."
              >
                <Switch
                  id="tr-tryout"
                  checked={v.tryOutForSafety}
                  onCheckedChange={(c) => f.set("tryOutForSafety", c)}
                  disabled={off}
                />
              </Field>
              <Field
                label="Walk-through after"
                htmlFor="tr-fails"
                hint="When a person does not pass the same Training this many times in a row, an Engineer is asked to show them at the line."
              >
                <NumberInput
                  id="tr-fails"
                  value={v.failsBeforeWalkthrough}
                  onChange={(n) => f.set("failsBeforeWalkthrough", n)}
                  min={ORG_LIMITS.failsBeforeWalkthrough[0]}
                  max={ORG_LIMITS.failsBeforeWalkthrough[1]}
                  suffix="not passed"
                  disabled={off}
                />
              </Field>
            </>
          )}
        </CardContent>
      </Card>
      <SaveBar dirty={f.dirty} saving={f.saving} onSave={() => void f.save()} onReset={f.reset} error={f.error} />
    </div>
  )
}
