import { useState } from "react"
import { useAuthActions } from "@convex-dev/auth/react"
import { KeyRound, Mail, ShieldCheck } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Mode = "password" | "magic"

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "sent"; email: string }
  | { kind: "error"; title: string; message: string }

export function SignInForm() {
  const { signIn } = useAuthActions()
  const [mode, setMode] = useState<Mode>("password")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState<Status>({ kind: "idle" })

  const busy = status.kind === "submitting"

  function switchMode(next: Mode) {
    setMode(next)
    setPassword("")
    setStatus({ kind: "idle" })
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    setStatus({ kind: "submitting" })

    if (mode === "password") {
      try {
        await signIn("password", { email: trimmed, password, flow: "signIn" })
      } catch {
        setStatus({
          kind: "error",
          title: "Couldn't sign in",
          message: "Wrong email or password. Ask your Oppr contact if you need access.",
        })
      }
      return
    }

    try {
      await signIn("resend", { email: trimmed })
      setStatus({ kind: "sent", email: trimmed })
    } catch {
      setStatus({
        kind: "error",
        title: "Couldn't send the link",
        message: "Magic links only work for @oppr.ai addresses.",
      })
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-base font-semibold">Sign in to Oppr Knowledge</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            {mode === "password"
              ? "Sign in with the email and password you received from Oppr."
              : "Oppr team: we'll send a magic link to your @oppr.ai email."}
          </p>

          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={mode === "password" ? "you@company.com" : "you@oppr.ai"}
                required
                autoComplete={mode === "password" ? "username" : "email"}
                disabled={busy || status.kind === "sent"}
                className="h-9 text-sm"
              />
            </div>

            {mode === "password" && (
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={busy}
                  className="h-9 text-sm"
                />
              </div>
            )}

            <Button
              type="submit"
              size="sm"
              className="w-full gap-1.5"
              disabled={busy || status.kind === "sent"}
            >
              {mode === "password" ? (
                <>
                  <KeyRound className="h-3.5 w-3.5" />
                  {busy ? "Signing in..." : "Sign in"}
                </>
              ) : (
                <>
                  <Mail className="h-3.5 w-3.5" />
                  {busy ? "Sending..." : "Send magic link"}
                </>
              )}
            </Button>
          </form>

          {status.kind === "sent" && (
            <Alert className="border-emerald-500/30 bg-emerald-500/5">
              <AlertTitle className="text-emerald-700 dark:text-emerald-300">
                Magic link sent
              </AlertTitle>
              <AlertDescription className="text-xs">
                Check <code>{status.email}</code>. Click the link to finish
                signing in.
              </AlertDescription>
            </Alert>
          )}

          {status.kind === "error" && (
            <Alert variant="destructive">
              <AlertTitle>{status.title}</AlertTitle>
              <AlertDescription className="text-xs">
                {status.message}
              </AlertDescription>
            </Alert>
          )}

          <button
            type="button"
            onClick={() => switchMode(mode === "password" ? "magic" : "password")}
            className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {mode === "password"
              ? "Oppr team? Sign in with a magic link"
              : "Back to email and password"}
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
