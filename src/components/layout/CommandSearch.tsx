import { useEffect, useMemo, useState } from "react"
import { useQuery } from "convex/react"
import { useLocation } from "wouter"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  BadgeCheck,
  BookOpenText,
  Boxes,
  Factory,
  FileText,
  GraduationCap,
  MessageSquareText,
  UserRound,
} from "lucide-react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { openAsk } from "@/components/ai/AskDock"
import { STATUS_LABELS } from "@/components/docs/StatusBadge"
import { api } from "../../../convex/_generated/api"

// Plant items open on the tab that holds their kind (docs/adr/0006).
const PLANT_TAB: Record<string, string> = {
  site: "structure",
  line: "structure",
  process: "processes",
  product: "processes",
  material: "materials",
  hazard: "materials",
  role: "roles",
  team: "roles",
  term: "glossary",
}
const PLANT_KIND_LABEL: Record<string, string> = {
  site: "Site",
  line: "Line",
  process: "Process",
  product: "Product",
  material: "Material",
  hazard: "Hazard",
  role: "Role",
  team: "Team",
  term: "Glossary",
}

// Global search (Ctrl+K). One field finds Documents, Assets, Trainings, Wikis
// and People, grouped by place; the last row always asks the question.

const OPEN_EVENT = "oppr-open-search"
const PER_GROUP = 6

/** Opens the search dialog from anywhere (the sidebar trigger uses this). */
export function openCommandSearch() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

function matches(q: string, ...fields: (string | undefined | null)[]) {
  return fields.some((f) => !!f && f.toLowerCase().includes(q))
}

export function CommandSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [, navigate] = useLocation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener("keydown", onKey)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener(OPEN_EVENT, onOpen)
    }
  }, [])

  const change = (o: boolean) => {
    setOpen(o)
    if (!o) setQuery("")
  }

  const go = (path: string) => {
    change(false)
    navigate(path)
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="top-[12vh] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 data-[state=closed]:slide-out-to-top-[2%] data-[state=open]:slide-in-from-top-[2%]">
        <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
        <DialogDescription className="sr-only">
          Search Documents, Assets, Trainings, Wikis and People, or ask a question.
        </DialogDescription>
        <Command
          shouldFilter={false}
          loop
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-item]]:py-2"
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search documents, Assets, Trainings, Wikis, people"
            className="h-12 pr-8 text-base"
          />
          {open && <Results query={query} go={go} close={() => change(false)} />}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function Results({
  query,
  go,
  close,
}: {
  query: string
  go: (path: string) => void
  close: () => void
}) {
  const docs = useQuery(api.documents.list, {})
  const assets = useQuery(api.assets.list, {})
  const trainings = useQuery(api.trainings.list, {})
  const wikis = useQuery(api.wikis.list, {})
  const people = useQuery(api.people.list, {})
  const plant = useQuery(api.plant.plant.searchIndex, {})
  const loading =
    docs === undefined ||
    assets === undefined ||
    trainings === undefined ||
    wikis === undefined ||
    people === undefined

  const q = query.trim().toLowerCase()

  const found = useMemo(() => {
    if (!q) return null
    return {
      docs: (docs ?? [])
        .filter((d) => matches(q, d.namingCode, d.title, ...((d as { tags?: string[] }).tags ?? [])))
        .slice(0, PER_GROUP),
      assets: (assets ?? [])
        .filter((a) => matches(q, a.code, a.name, a.location))
        .slice(0, PER_GROUP),
      trainings: (trainings ?? [])
        .filter((t) => matches(q, t.code, t.title, t.area))
        .slice(0, PER_GROUP),
      wikis: (wikis ?? []).filter((w) => matches(q, w.title, w.purpose)).slice(0, PER_GROUP),
      people: (people ?? []).filter((p) => matches(q, p.name, p.role)).slice(0, PER_GROUP),
      plant: (plant ?? []).filter((i) => matches(q, i.name, i.code, ...i.synonyms)).slice(0, PER_GROUP),
    }
  }, [q, docs, assets, trainings, wikis, people, plant])

  if (!q) {
    return (
      <CommandList className="max-h-[60vh]">
        <CommandGroup heading="Go to">
          <PlaceItem label="Documents" icon={FileText} onSelect={() => go("/library")} />
          <PlaceItem label="Learn" icon={GraduationCap} onSelect={() => go("/learn")} />
          <PlaceItem label="Skills workspace" icon={GraduationCap} onSelect={() => go("/learn/skills")} />
          <PlaceItem label="Wiki" icon={BookOpenText} onSelect={() => go("/wiki")} />
          <PlaceItem label="Plant" icon={Factory} onSelect={() => go("/plant")} />
          <PlaceItem label="Glossary" icon={Factory} onSelect={() => go("/plant/glossary")} />
          <PlaceItem label="ISO 9001" icon={BadgeCheck} onSelect={() => go("/iso-9001")} />
        </CommandGroup>
        <p className="px-4 pb-3 pt-1 text-xs text-muted-foreground">
          Type a code like EXL-201 or EXT-OPS-SOP-0001, a title or a name.
        </p>
      </CommandList>
    )
  }

  const isoMatch = q.length >= 3 && matches(q, "iso 9001", "iso9001", "audit", "certification", "quality management")
  const skillsMatch =
    q.length >= 3 && matches(q, "skills workspace", "skill profiles", "skill levels", "coverage questions", "iluo")

  const total = found
    ? (isoMatch ? 1 : 0) +
      (skillsMatch ? 1 : 0) +
      found.docs.length +
      found.assets.length +
      found.trainings.length +
      found.wikis.length +
      found.people.length +
      found.plant.length
    : 0

  return (
    <CommandList className="max-h-[60vh]">
      {loading && total === 0 && (
        <div className="space-y-2 p-3" aria-label="Searching">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      )}
      {!loading && total === 0 && (
        <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
          Nothing matches "{query.trim()}". Ask it instead.
        </CommandEmpty>
      )}
      {skillsMatch && (
        <CommandGroup heading="Pages">
          <CommandItem value="page-skills-workspace" onSelect={() => go("/learn/skills")}>
            <GraduationCap className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">Skills workspace</span>
            <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">
              Skills, Skill profiles, levels and coverage questions
            </span>
          </CommandItem>
        </CommandGroup>
      )}
      {isoMatch && (
        <CommandGroup heading="Pages">
          <CommandItem value="page-iso-9001" onSelect={() => go("/iso-9001")}>
            <BadgeCheck className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">ISO 9001</span>
            <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">
              What the standard asks, what Oppr does
            </span>
          </CommandItem>
        </CommandGroup>
      )}
      {found && found.docs.length > 0 && (
        <CommandGroup heading="Documents">
          {found.docs.map((d) => (
            <CommandItem key={d._id} value={`doc-${d._id}`} onSelect={() => go(`/docs/${d._id}`)}>
              <FileText className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="mr-2 shrink-0 font-mono text-xs text-muted-foreground">
                {d.namingCode}
              </span>
              <span className="truncate">{d.title}</span>
              <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">
                {STATUS_LABELS[d.status as keyof typeof STATUS_LABELS] ?? ""}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {found && found.assets.length > 0 && (
        <CommandGroup heading="Assets">
          {found.assets.map((a) => (
            <CommandItem key={a._id} value={`asset-${a._id}`} onSelect={() => go(`/assets/${a._id}`)}>
              <Boxes className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="mr-2 shrink-0 font-mono text-xs font-medium">{a.code}</span>
              <span className="truncate">{a.name}</span>
              {a.location && (
                <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">
                  {a.location}
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {found && found.trainings.length > 0 && (
        <CommandGroup heading="Trainings">
          {found.trainings.map((t) => (
            <CommandItem
              key={t._id}
              value={`training-${t._id}`}
              onSelect={() => go(`/learn/trainings/${t._id}`)}
            >
              <GraduationCap className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="mr-2 shrink-0 font-mono text-xs text-muted-foreground">{t.code}</span>
              <span className="truncate">{t.title}</span>
              <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">
                {t.kind === "round" ? "Round" : "Training"}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {found && found.wikis.length > 0 && (
        <CommandGroup heading="Wikis">
          {found.wikis.map((w) => (
            <CommandItem key={w._id} value={`wiki-${w._id}`} onSelect={() => go(`/wiki/${w._id}`)}>
              <BookOpenText className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{w.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {found && found.people.length > 0 && (
        <CommandGroup heading="People">
          {found.people.map((p) => (
            <CommandItem
              key={p._id}
              value={`person-${p._id}`}
              onSelect={() => go(`/learn/people/${p._id}`)}
            >
              <UserRound className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{p.name}</span>
              <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">{p.role}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {found && found.plant.length > 0 && (
        <CommandGroup heading="Plant">
          {found.plant.map((i) => (
            <CommandItem
              key={i._id}
              value={`plant-${i._id}`}
              onSelect={() => go(`/plant/${PLANT_TAB[i.kind]}?item=${i._id}`)}
            >
              <Factory className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{i.name}</span>
              {i.synonyms.length > 0 && (
                <span className="ml-2 truncate text-xs text-muted-foreground">{i.synonyms.slice(0, 3).join(", ")}</span>
              )}
              <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">{PLANT_KIND_LABEL[i.kind]}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      <CommandSeparator />
      <CommandGroup>
        <CommandItem
          value="ask"
          onSelect={() => {
            close()
            openAsk(query.trim())
          }}
        >
          <MessageSquareText className="mr-2 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate">
            Ask: "<span className="font-medium">{query.trim()}</span>"
          </span>
          <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">
            Answers from Published documents
          </span>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  )
}

function PlaceItem({
  label,
  icon: Icon,
  onSelect,
}: {
  label: string
  icon: typeof FileText
  onSelect: () => void
}) {
  return (
    <CommandItem value={`place-${label}`} onSelect={onSelect}>
      <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      {label}
    </CommandItem>
  )
}
