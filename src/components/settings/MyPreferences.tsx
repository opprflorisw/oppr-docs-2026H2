import { useReducer } from "react"
import { useQuery } from "convex/react"
import { useAuthActions } from "@convex-dev/auth/react"
import { toast } from "sonner"
import { LogOut } from "lucide-react"
import { Link } from "wouter"
import { api } from "../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { CheckInDevice, PHONE_CHECK_IN_KEY, useCheckIn } from "@/lib/checkIn"
import { KIND_LABEL } from "@/lib/roles"

// Settings, My preferences: what this browser remembers, in one place. All of
// it is per device (localStorage); nothing here changes anything for others.

type Remembered = {
  keys: string[]
  label: string
  hint: string
  action: string
}

// The keys are owned by the features that write them; this list only reads
// and clears them.
const REMEMBERED: Remembered[] = [
  {
    keys: ["oppr-docs:last-filing"],
    label: "Filing for new documents",
    hint: "New document starts with the area, discipline and type you used last.",
    action: "Forget",
  },
  {
    keys: ["oppr-docs:recently-linked-assets"],
    label: "Recently linked Assets",
    hint: "Offered first when you link an Asset in the editor.",
    action: "Forget",
  },
  {
    keys: ["oppr.ask.anonThread", "oppr.ask.lastWho"],
    label: "Anonymous Ask conversation",
    hint: "Questions asked without checking in share one conversation on this device.",
    action: "Start fresh",
  },
  {
    keys: ["oppr-docs:m:recent", "oppr-docs:m:pinned"],
    label: "Phone: recent and pinned",
    hint: "What the phone app shows under Recent and Pinned.",
    action: "Forget",
  },
  {
    keys: [`${PHONE_CHECK_IN_KEY}.recent`, "oppr.checkIn.personId.recent"],
    label: "People recently checked in",
    hint: "Offered first in the check-in list on this phone.",
    action: "Forget",
  },
  {
    keys: ["oppr.capture.noticeSeen", "oppr-docs:mobile-hint-seen", "oppr.floor.hintDismissed"],
    label: "Hints already seen",
    hint: "The Captures notice, the phone tip and the Floor simulator tip.",
    action: "Show again",
  },
]

const META_VISIBLE_KEY = "oppr-docs:edit-metadata-visible"

function has(key: string): boolean {
  try {
    return window.localStorage.getItem(key) != null
  } catch {
    return false
  }
}

function clear(keys: string[]) {
  try {
    for (const k of keys) window.localStorage.removeItem(k)
  } catch {
    // Storage blocked: nothing was remembered either.
  }
}

export function MyPreferences() {
  // localStorage is not reactive: re-render after a change to re-read it.
  const [, refresh] = useReducer((n: number) => n + 1, 0)

  const metaVisible = (() => {
    try {
      return window.localStorage.getItem(META_VISIBLE_KEY) !== "0"
    } catch {
      return true
    }
  })()

  return (
    <div className="space-y-4">
      <AccountCard />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Checked in on this device</CardTitle>
          <CardDescription className="text-sm">
            Who reads, trains or signs is the person checked in, not the account. The phone preview keeps its own
            check-in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CheckInRow label="This browser" />
          <CheckInDevice value={PHONE_CHECK_IN_KEY}>
            <CheckInRow label="Phone preview" />
          </CheckInDevice>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Editor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <label htmlFor="pref-meta" className="text-sm font-medium">
                Show the details panel while editing
              </label>
              <p className="text-xs text-muted-foreground">Code, Assets and review dates next to the document text.</p>
            </div>
            <Switch
              id="pref-meta"
              checked={metaVisible}
              onCheckedChange={(c) => {
                try {
                  window.localStorage.setItem(META_VISIBLE_KEY, c ? "1" : "0")
                } catch {
                  // ignore
                }
                refresh()
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Remembered on this device</CardTitle>
          <CardDescription className="text-sm">Small things that save you a click. Forgetting them is safe.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y" data-testid="settings-remembered">
            {REMEMBERED.map((r) => {
              const saved = r.keys.some(has)
              return (
                <li key={r.label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium">{r.label}</p>
                    <p className="text-xs text-muted-foreground">{r.hint}</p>
                  </div>
                  {saved ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        clear(r.keys)
                        refresh()
                        toast.success(`${r.label}: done.`)
                      }}
                    >
                      {r.action}
                    </Button>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">Nothing saved</span>
                  )}
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Oppr Knowledge, internal showcase. Build notes (team only) live under{" "}
        <Link href="/analysis" className="underline underline-offset-2">
          analysis pages
        </Link>
        .
      </p>
    </div>
  )
}

function CheckInRow({ label }: { label: string }) {
  const { person, checkOut } = useCheckIn()
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">
          {person ? `${person.name}, ${KIND_LABEL[person.kind]}` : "Anonymous"}
        </p>
      </div>
      {person && (
        <Button size="sm" variant="ghost" onClick={checkOut}>
          Check out
        </Button>
      )}
    </div>
  )
}

function AccountCard() {
  const { signOut } = useAuthActions()
  const me = useQuery(api.users.me)
  const email = me?.email ?? ""
  const name = me?.name ?? null
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Signed-in account</CardTitle>
        <CardDescription className="text-sm">This login only opens Oppr on this device.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
            {(email.slice(0, 1) || "?").toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {me === undefined ? "Loading" : (name ?? (email || "Signed in"))}
            </div>
            {name && email && <div className="truncate text-xs text-muted-foreground">{email}</div>}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => void signOut()}>
          <LogOut aria-hidden />
          Sign out of this device
        </Button>
      </CardContent>
    </Card>
  )
}
