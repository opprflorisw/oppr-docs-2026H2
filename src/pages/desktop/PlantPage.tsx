// Plant (docs/adr/0006): the plant ontology and the background of the
// organization, for Knowledge only. One page with a flat row of tabs; the tab
// is in the path (/plant/glossary) so other pages can link straight to it.
// Assets is a tab here and reuses the Assets list; /assets redirects to it.
import { useEffect, useState } from "react"
import { useLocation, useRoute, useSearch } from "wouter"
import { useQuery } from "convex/react"
import { Factory, Pencil, Plus, Sparkles } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader, type HeaderAction } from "@/components/layout/PageHeader"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { useCheckIn } from "@/lib/checkIn"
import { AssetsPage } from "@/pages/desktop/AssetsPage"
import { KIND, TABS, isEditor, type PlantArea, type PlantItem, type PlantKind, type PlantTab } from "@/components/plant/plantModel"
import { PlantOverview, PlantProfileDialog } from "@/components/plant/PlantOverview"
import { PlantAreaDialog, PlantStructure } from "@/components/plant/PlantStructure"
import { PlantGlossary, PlantItemList } from "@/components/plant/PlantItemList"
import { PlantItemSheet } from "@/components/plant/PlantItemSheet"
import { PlantItemDialog } from "@/components/plant/PlantItemDialog"
import { PlantProposalsSheet, usePropose } from "@/components/plant/PlantProposals"

const SEARCHABLE: PlantTab[] = ["processes", "materials", "roles", "glossary"]

export function PlantPage() {
  const [, params] = useRoute<{ tab: string }>("/plant/:tab")
  const [, navigate] = useLocation()
  const tab: PlantTab = TABS.some((t) => t.value === params?.tab) ? (params!.tab as PlantTab) : "overview"
  const meta = TABS.find((t) => t.value === tab)!

  const { person } = useCheckIn()
  const editor = isEditor(person)
  const data = useQuery(api.plant.plant.get)

  const [search, setSearch] = useState("")
  const [openId, setOpenId] = useState<Id<"plantItems"> | null>(null)
  const [editing, setEditing] = useState<{ kind: PlantKind; item: PlantItem | null } | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [area, setArea] = useState<PlantArea | null>(null)
  const [proposalsOpen, setProposalsOpen] = useState(false)
  const propose = usePropose()

  // ?item=<id> (from Ctrl+K) opens that item once the data is there.
  const itemParam = new URLSearchParams(useSearch()).get("item")
  useEffect(() => {
    if (itemParam && data?.items.some((i) => i._id === itemParam)) setOpenId(itemParam as Id<"plantItems">)
  }, [itemParam, data])

  const go = (t: PlantTab) => {
    setSearch("")
    navigate(t === "overview" ? "/plant" : `/plant/${t}`)
  }

  // One primary action per tab; the second kind of a tab sits in the menu.
  let primary: HeaderAction | undefined
  const menu: HeaderAction[] = []
  if (editor) {
    if (tab === "overview") primary = { label: "Edit background", icon: Pencil, onClick: () => setProfileOpen(true) }
    else if (tab !== "assets") {
      const [first, second] = tab === "structure" ? (["line", "site"] as PlantKind[]) : meta.kinds
      primary = {
        label: `Add ${first === "term" ? "term" : KIND[first].label.toLowerCase()}`,
        icon: Plus,
        onClick: () => setEditing({ kind: first, item: null }),
      }
      if (second)
        menu.push({
          label: `Add ${KIND[second].label.toLowerCase()}`,
          icon: Plus,
          onClick: () => setEditing({ kind: second, item: null }),
        })
    }
  }
  // Proposing is occasional work, so it sits in the menu, never next to the primary.
  if (editor && tab !== "assets")
    menu.push({
      label: propose.busy ? "Reading documents..." : "Propose from documents",
      icon: Sparkles,
      disabled: propose.busy,
      onClick: () => void propose.run(() => setProposalsOpen(true), data?.pendingProposals ?? 0),
    })

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={tab === "overview" ? [{ label: "Plant" }] : [{ label: "Plant", href: "/plant" }, { label: meta.label }]} />
      <PageHeader
        icon={Factory}
        title="Plant"
        statusLine={meta.subtitle}
        documentTitle={tab === "overview" ? "Plant" : `${meta.label} · Plant`}
        primary={primary}
        menu={menu}
      />
      <Tabs value={tab} onValueChange={(v) => go(v as PlantTab)} className="mx-auto w-full max-w-6xl space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <TabsList className="h-auto flex-wrap" data-tour="plant-tabs">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {SEARCHABLE.includes(tab) && (
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === "glossary" ? "Search a word, also in Dutch" : "Search"}
              aria-label="Search the Plant"
              data-tour="plant-search"
              className="h-9 max-w-xs"
            />
          )}
        </div>

        {data && data.pendingProposals > 0 && tab !== "assets" && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            <span className="flex-1">
              {data.pendingProposals} proposal{data.pendingProposals === 1 ? "" : "s"} from documents{" "}
              {data.pendingProposals === 1 ? "is" : "are"} waiting for an Engineer.
            </span>
            <Button size="sm" variant="outline" onClick={() => setProposalsOpen(true)}>
              Review {data.pendingProposals}
            </Button>
          </div>
        )}
        {editor && data && data.pendingProposals === 0 && tab !== "assets" && tab !== "overview" && (
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            Oppr can read your Published documents and propose Areas, lines, processes and terms for you to accept.
            <button
              type="button"
              className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-60"
              disabled={propose.busy}
              onClick={() => void propose.run(() => setProposalsOpen(true), 0)}
            >
              {propose.busy ? "Reading documents..." : "Propose from documents"}
            </button>
          </p>
        )}

        {tab === "assets" ? (
          <TabsContent value="assets" className="mt-0">
            <AssetsPage embedded />
          </TabsContent>
        ) : !data ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <>
            <TabsContent value="overview" className="mt-0">
              <PlantOverview data={data} editor={editor} onEdit={() => setProfileOpen(true)} onGo={go} />
            </TabsContent>
            <TabsContent value="structure" className="mt-0">
              <PlantStructure data={data} editor={editor} onOpenItem={setOpenId} onEditArea={setArea} />
            </TabsContent>
            {(["processes", "materials", "roles"] as const).map((t) => (
              <TabsContent key={t} value={t} className="mt-0">
                <PlantItemList
                  data={data}
                  kinds={TABS.find((x) => x.value === t)!.kinds}
                  search={search}
                  editor={editor}
                  onOpenItem={setOpenId}
                />
              </TabsContent>
            ))}
            <TabsContent value="glossary" className="mt-0">
              <PlantGlossary data={data} search={search} editor={editor} onOpenItem={setOpenId} />
            </TabsContent>
          </>
        )}
      </Tabs>

      {data && (
        <>
          <PlantItemSheet
            data={data}
            itemId={openId}
            onOpenItem={setOpenId}
            onClose={() => setOpenId(null)}
            onEdit={(item) => setEditing({ kind: item.kind, item })}
          />
          <PlantItemDialog
            open={!!editing}
            onOpenChange={(o) => !o && setEditing(null)}
            kind={editing?.kind ?? "term"}
            item={editing?.item ?? null}
            areas={data.areas}
            onSaved={(id) => setOpenId(id)}
          />
          <PlantProfileDialog open={profileOpen} onOpenChange={setProfileOpen} data={data} />
          <PlantAreaDialog area={area} data={data} onClose={() => setArea(null)} />
        </>
      )}
      <PlantProposalsSheet open={proposalsOpen} onOpenChange={setProposalsOpen} editor={editor} />
    </div>
  )
}
