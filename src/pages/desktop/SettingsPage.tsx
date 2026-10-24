import { useState, type ComponentType, type ReactNode } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { useAction, useQuery } from "convex/react"
import { useAuthActions } from "@convex-dev/auth/react"
import { api } from "../../../convex/_generated/api"
import {
  CHAT_MODEL,
  EMBEDDING_DIM,
  EMBEDDING_MODEL,
} from "../../../convex/ai/constants"
import { toast } from "sonner"
import { Link, useSearch } from "wouter"
import type { LucideProps } from "lucide-react"
import {
  ArrowUpRight,
  Cable,
  FileDown,
  GraduationCap,
  Hash,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  LogOut,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  Users,
} from "lucide-react"
import { TemplatesList } from "./TemplatesPage"
import { NamingSettings } from "./NamingSettingsPage"
import { ImageLibraryPage } from "./ImageLibraryPage"
import { CoverSettingsEditor } from "@/components/docs/CoverSettingsEditor"
import { PpeConfigurator } from "@/components/docs/PpeConfigurator"
import { PeopleSettings } from "@/components/people/PeopleSettings"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/lib/time"
import { SkillsSettings } from "@/components/learn/SkillsSettings"

// Settings holds setup only, in four groups with a left sub-nav. The section
// lives in ?tab= so other pages can link straight to it (?tab=templates).
// MCP has one home, its own page (/mcp); the Settings entry goes there.

type Section = {
  value: string
  label: string
  icon: ComponentType<LucideProps>
  /** One line under the section heading. */
  lead: string
  /** Opens another page instead of a section here. */
  href?: string
}

const GROUPS: { label: string; sections: Section[] }[] = [
  {
    label: "Account",
    sections: [
      {
        value: "account",
        label: "Signed-in account",
        icon: UserIcon,
        lead: "Who is logged in on this device, and how to sign out.",
      },
    ],
  },
  {
    label: "People",
    sections: [
      {
        value: "people",
        label: "People",
        icon: Users,
        lead: "Everyone who can check in, and whether they are an Operator or an Engineer.",
      },
      {
        value: "skills",
        label: "Skills",
        icon: GraduationCap,
        lead: "Skills, Skill profiles and coverage questions for the Skill matrix and Home.",
      },
    ],
  },
  {
    label: "Document setup",
    sections: [
      {
        value: "templates",
        label: "Templates",
        icon: LayoutTemplate,
        lead: "The starting structure for each document type.",
      },
      {
        value: "title-page",
        label: "Title page",
        icon: FileDown,
        lead: "What the first page of an exported PDF shows.",
      },
      {
        value: "safety",
        label: "Safety icons",
        icon: ShieldCheck,
        lead: "The PPE and safety pictograms authors can place in a document.",
      },
      {
        value: "naming",
        label: "Naming",
        icon: Hash,
        lead: "How document codes like EXT-OPS-SOP-0001 are built.",
      },
      {
        value: "images",
        label: "Images",
        icon: ImageIcon,
        lead: "Shared images for documents, Assets and Trainings.",
      },
    ],
  },
  {
    label: "Integrations",
    sections: [
      {
        value: "ai",
        label: "AI",
        icon: Sparkles,
        lead: "How Ask finds the passages it answers from.",
      },
      {
        value: "mcp",
        label: "MCP",
        icon: Cable,
        lead: "Connect the AI your company already uses.",
        href: "/mcp",
      },
    ],
  },
]

const SECTIONS = GROUPS.flatMap((g) => g.sections)

export function SettingsPage() {
  const search = useSearch()
  const requested = new URLSearchParams(search).get("tab")
  const section =
    SECTIONS.find((s) => s.value === requested && !s.href) ?? SECTIONS[0]

  return (
    <div className="flex flex-col">
      <TopBar
        breadcrumb={[
          { label: "Settings", href: "/settings" },
          { label: section.label },
        ]}
      />
      <PageHeader
        icon={SettingsIcon}
        title="Settings"
        statusLine="Setup for Oppr Knowledge. Daily work lives in the other places."
        documentTitle={`${section.label} · Settings`}
      />
      <div className="mx-auto grid w-full max-w-6xl gap-6 p-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="space-y-5 md:sticky md:top-32 md:self-start">
          {GROUPS.map((g) => (
            <div key={g.label} className="space-y-1">
              <p className="px-3 text-xs font-medium text-muted-foreground">{g.label}</p>
              {g.sections.map((s) => {
                const active = s.value === section.value
                const Icon = s.icon
                return (
                  <Link
                    key={s.value}
                    href={s.href ?? `/settings?tab=${s.value}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-foreground/80 hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="flex-1">{s.label}</span>
                    {s.href && (
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" aria-label="Opens its own page" />
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <section aria-labelledby="settings-section-title" className="min-w-0 space-y-4">
          <div className="space-y-1">
            <h2 id="settings-section-title" className="text-base font-semibold">
              {section.label}
            </h2>
            <p className="text-sm text-muted-foreground">{section.lead}</p>
          </div>
          <SectionBody value={section.value} />
        </section>
      </div>
    </div>
  )
}

function SectionBody({ value }: { value: string }) {
  switch (value) {
    case "people":
      return <PeopleSettings />
    case "skills":
      return (
        <>
          <p className="text-sm text-muted-foreground">
            Engineers also find this in Learn, next to the Skill matrix:{" "}
            <Link href="/learn?tab=setup" className="font-medium text-primary underline-offset-2 hover:underline">
              Learn, Skills setup
            </Link>
            .
          </p>
          <SkillsSettings />
        </>
      )
    case "templates":
      return <TemplatesList />
    case "title-page":
      return <CoverSettingsEditor />
    case "safety":
      return <PpeConfigurator />
    case "naming":
      return <NamingSettings />
    case "images":
      return <ImageLibraryPage embedded />
    case "ai":
      return <AiSection />
    default:
      return <AccountSection />
  }
}

function AccountSection() {
  const { signOut } = useAuthActions()
  const me = useQuery(api.users.me)
  const email = me?.email ?? ""
  const name = me?.name ?? null

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Signed-in account (device)</CardTitle>
          <CardDescription className="text-sm">
            People act through check-in. This login only opens Oppr on this
            device; who reads, trains or signs is the person checked in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {(email.slice(0, 1) || "?").toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {me === undefined ? "Loading" : (name ?? (email || "Signed in"))}
              </div>
              {name && email && (
                <div className="truncate text-xs text-muted-foreground">{email}</div>
              )}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => void signOut()}>
            <LogOut aria-hidden />
            Sign out of this device
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1 rounded-md bg-muted/40 p-3 text-xs">
            <Row label="Product" value="Oppr Knowledge" />
            <Row label="Release" value="Internal showcase" />
          </div>
          <p className="text-xs text-muted-foreground">
            Build notes (team only) live under{" "}
            <Link href="/analysis" className="underline underline-offset-2">
              analysis pages
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </>
  )
}

function AiSection() {
  const embedStatus = useQuery(api.ai.embed.embedStatus)
  const embedMissingAction = useAction(api.ai.embed.embedMissing)
  const reembedAllAction = useAction(api.ai.embed.reembedAll)
  const [embedding, setEmbedding] = useState(false)
  const [reembedDialogOpen, setReembedDialogOpen] = useState(false)

  async function handleEmbed(reembed: boolean) {
    setEmbedding(true)
    const toastId = toast.loading(
      reembed ? "Clearing and re-embedding…" : "Embedding chunks…",
    )
    try {
      const result = reembed
        ? await reembedAllAction({})
        : await embedMissingAction({})
      if ("cleared" in result) {
        toast.success(
          `Cleared ${result.cleared}, re-embedded ${result.embedded} of ${result.total}`,
          { id: toastId },
        )
      } else if (result.total === 0) {
        toast.success("All chunks already embedded.", { id: toastId })
      } else {
        toast.success(`Embedded ${result.embedded} of ${result.total} chunks`, {
          id: toastId,
        })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), {
        id: toastId,
      })
    } finally {
      setEmbedding(false)
    }
  }

  const outstanding = embedStatus?.outstanding ?? 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">AI retrieval (Ask)</CardTitle>
        <CardDescription className="text-sm">
          Ask answers questions from the most relevant passages of Published
          documents only. Each saved document is split into text chunks and
          turned into embedding vectors, and a question is matched against
          those vectors to find supporting passages. Keep every chunk indexed
          so answers stay grounded.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1 rounded-md bg-muted/40 p-3 font-mono text-xs">
          <Row label="Embedding model" value={`${EMBEDDING_MODEL} · ${EMBEDDING_DIM}d`} />
          <Row label="Chat model" value={CHAT_MODEL} />
          <Row
            label="Last embedding"
            value={
              embedStatus === undefined
                ? "…"
                : embedStatus.lastEmbeddedAt
                  ? formatDateTime(embedStatus.lastEmbeddedAt)
                  : "Never"
            }
          />
          <Row
            label="Indexed chunks"
            value={
              embedStatus === undefined
                ? "…"
                : `${embedStatus.embedded} of ${embedStatus.total}`
            }
          />
          <Row
            label="Outstanding"
            value={
              embedStatus === undefined
                ? "…"
                : outstanding === 0
                  ? "0, all indexed"
                  : `${outstanding} to embed`
            }
            highlight={outstanding > 0}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleEmbed(false)}
            disabled={embedding || outstanding === 0}
          >
            {embedding ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Working…
              </>
            ) : (
              "Embed missing chunks"
            )}
          </Button>
          {outstanding === 0 && embedStatus !== undefined && !embedding && (
            <span className="text-xs text-muted-foreground">Nothing to embed: every chunk is indexed.</span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReembedDialogOpen(true)}
            disabled={embedding}
          >
            <RefreshCw aria-hidden />
            Re-embed all
          </Button>
          <AlertDialog open={reembedDialogOpen} onOpenChange={setReembedDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Re-embed all chunks?</AlertDialogTitle>
                <AlertDialogDescription>
                  Every chunk embedding is cleared and rebuilt. Ask answers may
                  be weaker until it finishes, in about 30 seconds.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void handleEmbed(true)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Clear and re-embed
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string
  value: ReactNode
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "font-semibold text-status-review" : undefined}>
        {value}
      </span>
    </div>
  )
}
