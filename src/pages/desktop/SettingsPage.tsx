import type { ComponentType } from "react"
import { Link, Redirect, useSearch } from "wouter"
import type { LucideProps } from "lucide-react"
import {
  Building2,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  FileDown,
  GraduationCap,
  Hash,
  LayoutTemplate,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react"
import { TemplatesList } from "./TemplatesPage"
import { NamingSettings } from "./NamingSettingsPage"
import { CoverSettingsEditor } from "@/components/docs/CoverSettingsEditor"
import { PpeConfigurator } from "@/components/docs/PpeConfigurator"
import { PeopleSettings } from "@/components/people/PeopleSettings"
import { ShiftsSettings } from "@/components/people/ShiftsSettings"
import { CompanySettings } from "@/components/settings/CompanySettings"
import { DocumentRulesSettings } from "@/components/settings/DocumentRulesSettings"
import { TrainingDefaultsSettings } from "@/components/settings/TrainingDefaultsSettings"
import { FloorSettings } from "@/components/settings/FloorSettings"
import { ConnectionsSettings } from "@/components/settings/ConnectionsSettings"
import { MyPreferences } from "@/components/settings/MyPreferences"
import { EditorOnly } from "@/components/settings/SettingsBits"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { cn } from "@/lib/utils"

// Settings holds setup only: six groups, each holding one kind of option, and
// My preferences for this device below them. The section lives in ?tab= so
// other pages can link straight to it (?tab=templates). Places with their own
// page (Images under Documents, Assets under Plant, MCP, ISO 9001) are not
// listed; their old ?tab= links still open them.

type Section = {
  value: string
  label: string
  icon: ComponentType<LucideProps>
  /** One line under the section heading. */
  lead: string
  /** Lives on its own page: the nav entry links there. */
  href?: string
}

const GROUPS: { label: string; sections: Section[] }[] = [
  {
    label: "Company",
    sections: [
      {
        value: "company",
        label: "Company",
        icon: Building2,
        lead: "Name, logo and languages, used everywhere the company is named.",
      },
    ],
  },
  {
    label: "People and roles",
    sections: [
      {
        value: "people",
        label: "People",
        icon: Users,
        lead: "Everyone who can check in: Operator, Engineer or Admin, with area, shift and team.",
      },
      {
        value: "skills",
        label: "Skills workspace",
        icon: GraduationCap,
        lead: "Skills, Skill profiles, levels and coverage questions, in Learn.",
        href: "/learn/skills",
      },
      {
        value: "shifts",
        label: "Shifts",
        icon: CalendarClock,
        lead: "The plant's shifts, their times and whether they count for shift cover.",
      },
    ],
  },
  {
    label: "Documents",
    sections: [
      {
        value: "naming",
        label: "Naming and types",
        icon: Hash,
        lead: "How document codes like EXT-OPS-SOP-0001 are built, and the document types.",
      },
      {
        value: "templates",
        label: "Templates",
        icon: LayoutTemplate,
        lead: "The starting structure for each document type.",
      },
      {
        value: "title-page",
        label: "Title page and PDF",
        icon: FileDown,
        lead: "What the first page and the header and footer of an exported PDF show.",
      },
      {
        value: "safety",
        label: "Safety icons",
        icon: ShieldCheck,
        lead: "The PPE and safety pictograms authors can place in a document.",
      },
      {
        value: "review",
        label: "Review and approval",
        icon: ClipboardCheck,
        lead: "Periodic review defaults and the rules for approving a version.",
      },
    ],
  },
  {
    label: "Training",
    sections: [
      {
        value: "training",
        label: "Training defaults",
        icon: SlidersHorizontal,
        lead: "What a new Training starts with, and when a walk-through is asked for.",
      },
    ],
  },
  {
    label: "Floor",
    sections: [
      {
        value: "floor",
        label: "Phones and Captures",
        icon: Smartphone,
        lead: "Check-in on shared phones, and what Operators are told before a Capture.",
      },
    ],
  },
  {
    label: "AI and connections",
    sections: [
      {
        value: "ai",
        label: "AI and schedules",
        icon: Sparkles,
        lead: "Which models do what, the search index, what runs by itself, and notifications.",
      },
    ],
  },
]

const PREFERENCES: Section = {
  value: "preferences",
  label: "My preferences",
  icon: SettingsIcon,
  lead: "Your account, who is checked in, and what this browser remembers. Only for this device.",
}

const SECTIONS = [...GROUPS.flatMap((g) => g.sections), PREFERENCES]

// Places with their own page: old or guessed ?tab= values open them.
const LINK_OUT: Record<string, string> = {
  images: "/library/images",
  image: "/library/images",
  photos: "/library/images",
  "iso-9001": "/iso-9001",
  iso: "/iso-9001",
  assets: "/plant/assets",
  plant: "/plant",
  mcp: "/mcp",
  // Skills, profiles and level names live in the Skills workspace in Learn.
  skills: "/learn/skills",
  "skill-profiles": "/learn/skills/profiles",
  profiles: "/learn/skills/profiles",
  coverage: "/learn/skills/coverage",
  "skill-levels": "/learn/skills/levels",
  levels: "/learn/skills/levels",
  iluo: "/learn/skills/levels",
}

// Other words for a section, so a typed or old link lands on the right page.
const ALIASES: Record<string, string> = {
  account: "preferences",
  device: "preferences",
  "this-device": "preferences",
  "my-preferences": "preferences",
  logo: "company",
  languages: "company",
  roles: "people",
  "people-and-roles": "people",
  types: "naming",
  vocabulary: "naming",
  codes: "naming",
  titlepage: "title-page",
  cover: "title-page",
  pdf: "title-page",
  ppe: "safety",
  icons: "safety",
  approval: "review",
  "periodic-review": "review",
  phones: "floor",
  phone: "floor",
  captures: "floor",
  "check-in": "floor",
  connections: "ai",
  embeddings: "ai",
  schedules: "ai",
  notifications: "ai",
  models: "ai",
}

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

/** Where a ?tab= value lands: a section here, another page, or nothing known. */
function resolveTab(raw: string): { section?: Section; href?: string } {
  const key = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  if (!key) return { section: SECTIONS[0] }
  if (LINK_OUT[key]) return { href: LINK_OUT[key] }
  const exact = SECTIONS.find((s) => s.value === key)
  if (exact) return { section: exact }
  if (ALIASES[key]) return { section: SECTIONS.find((s) => s.value === ALIASES[key]) }
  // Closest match: the typed word starts, contains or is part of a section's name.
  const c = compact(key)
  if (c.length >= 3) {
    const near =
      SECTIONS.find((s) => compact(s.value).startsWith(c) || compact(s.label).startsWith(c)) ??
      SECTIONS.find((s) => c.startsWith(compact(s.value))) ??
      SECTIONS.find((s) => compact(s.label).includes(c))
    if (near) return near.href ? { href: near.href } : { section: near }
  }
  return {}
}

export function SettingsPage() {
  const search = useSearch()
  const raw = new URLSearchParams(search).get("tab") ?? ""
  const resolved = resolveTab(raw)

  if (resolved.href) return <Redirect to={resolved.href} replace />
  if (resolved.section && raw && raw !== resolved.section.value) {
    return <Redirect to={`/settings?tab=${resolved.section.value}`} replace />
  }
  const unknown = !resolved.section
  const section = resolved.section ?? SECTIONS[0]

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
              {g.sections.map((s) => (
                <SectionLink key={s.value} s={s} active={s.value === section.value} />
              ))}
            </div>
          ))}
          <div className="border-t pt-4">
            <SectionLink s={PREFERENCES} active={PREFERENCES.value === section.value} />
          </div>
        </nav>

        <section aria-labelledby="settings-section-title" className="min-w-0 space-y-4">
          {unknown && (
            <p
              role="status"
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            >
              There is no Settings page called &ldquo;{raw}&rdquo;. This is Company; pick the page you need on the left.
            </p>
          )}
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

function SectionLink({ s, active }: { s: Section; active: boolean }) {
  const Icon = s.icon
  return (
    <Link
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
      {s.href && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
    </Link>
  )
}

function SectionBody({ value }: { value: string }) {
  switch (value) {
    case "people":
      return (
        <>
          <Link
            href="/learn/skills"
            className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
          >
            <GraduationCap className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Skills workspace</span>
              <span className="block text-xs text-muted-foreground">
                Skills, Skill profiles, who is measured, level names and coverage questions live in Learn.
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
          <PeopleSettings />
        </>
      )
    case "shifts":
      return <ShiftsSettings />
    case "naming":
      return (
        <EditorOnly>
          <NamingSettings />
        </EditorOnly>
      )
    case "templates":
      return (
        <EditorOnly>
          <TemplatesList />
        </EditorOnly>
      )
    case "title-page":
      return (
        <EditorOnly>
          <CoverSettingsEditor />
        </EditorOnly>
      )
    case "safety":
      // Shows its own edit notice: searching and viewing stay usable for everyone.
      return <PpeConfigurator />
    case "review":
      return <DocumentRulesSettings />
    case "training":
      return <TrainingDefaultsSettings />
    case "floor":
      return <FloorSettings />
    case "ai":
      return <ConnectionsSettings />
    case "preferences":
      return <MyPreferences />
    default:
      return <CompanySettings />
  }
}
