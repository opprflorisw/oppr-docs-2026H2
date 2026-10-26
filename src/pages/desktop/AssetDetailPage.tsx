import { errorText } from "@/lib/errorText"
import { useMemo, useState } from "react"
import { Link, useLocation, useRoute } from "wouter"
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpenText, Factory, MapPin, Pencil, QrCode, Users } from "lucide-react"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { toLegacyAsset, toLegacyAssetLog, toLegacyDoc } from "@/lib/convex-adapters"
import { type AssetPreview } from "@/components/docs/DocumentLibraryTable"
import { useDocumentRowActions } from "@/components/docs/DocumentActions"
import { AssetDetailBody } from "@/components/docs/AssetDetailBody"
import { AssetTrainingsCard } from "@/components/learn/AssetTrainingsCard"
import type { Asset, AssetLog } from "@/types"
import { AssetPreviewModal } from "@/components/docs/AssetPreviewModal"
import { LogReferenceModal } from "@/components/docs/LogReferenceModal"
import { useCheckIn } from "@/lib/checkIn"
import { toast } from "sonner"
import { isEngineerOrAdmin } from "@/lib/roles"
import { useShifts } from "@/components/learn/skills/skillUi"

type AssetPatch = Omit<Parameters<ReturnType<typeof useMutation<typeof api.assets.update>>>[0], "id">

export function AssetDetailPage() {
  const [, params] = useRoute<{ id: string }>("/assets/:id")
  const id = params?.id
  const [, navigate] = useLocation()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeLog, setActiveLog] = useState<AssetLog | null>(null)
  const [editing, setEditing] = useState(false)
  const { person } = useCheckIn()
  const engineer = isEngineerOrAdmin(person)

  // A typed or stale link may not be an Asset id at all; check it first so the
  // id-validated queries below never throw into the page.
  const resolved = useQuery(api.assets.resolveMany, id ? { ids: [id] } : "skip")
  const validId = resolved?.[0]?.exists ? (id as Id<"assets">) : null
  const result = useQuery(api.assets.getWithDocs, validId ? { id: validId } : "skip")
  const previewBundle = useQuery(api.documents.listWithAssetPreviews, {})
  const photoUrl = useQuery(api.assets.imageUrlFor, validId ? { id: validId } : "skip")
  const updateAssetMut = useMutation(api.assets.update)
  const { handleAction, dialogs } = useDocumentRowActions()
  const ready = resolved !== undefined && (!validId || result !== undefined)

  const asset = useMemo(() => (result ? toLegacyAsset(result.asset) : null), [result])
  const docs = useMemo(() => (result ? result.documents.map(toLegacyDoc) : []), [result])
  const logs = useMemo(() => (result ? result.logs.map(toLegacyAssetLog) : []), [result])
  const assetsByDoc = useMemo<Record<string, AssetPreview[]>>(
    () => previewBundle?.assetsByDoc ?? {},
    [previewBundle],
  )

  async function save(patch: AssetPatch): Promise<boolean> {
    if (!asset) return false
    try {
      await updateAssetMut({ id: asset.id as Id<"assets">, ...patch, personId: person?._id })
      toast.success("Asset updated")
      return true
    } catch (err) {
      toast.error(errorText(err, "The Asset could not be updated."))
      return false
    }
  }

  if (!ready) {
    return (
      <div className="flex flex-col">
        <TopBar breadcrumb={[{ label: "Plant", href: "/plant" }, { label: "Assets", href: "/plant/assets" }]} />
        <div className="space-y-4 p-6">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="flex flex-col">
        <TopBar breadcrumb={[{ label: "Plant", href: "/plant" }, { label: "Assets", href: "/plant/assets" }]} />
        <PageHeader icon={Factory} title="Asset not found" />
        <div className="space-y-3 p-6">
          <p className="text-sm text-muted-foreground">There is no Asset with this link. It may have been removed.</p>
          <Link href="/plant/assets" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Assets
          </Link>
        </div>
      </div>
    )
  }

  const where = [asset.site, asset.location].filter(Boolean).join(" · ") || "Location not set"

  return (
    <div className="flex flex-col">
      <TopBar
        breadcrumb={[
          { label: "Plant", href: "/plant" },
          { label: "Assets", href: "/plant/assets" },
          { label: `${asset.code} · ${asset.name}` },
        ]}
      />
      <PageHeader
        icon={Factory}
        title={`${asset.code} · ${asset.name}`}
        statusLine={
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {where}
            {asset.pin_number != null && ` · Floor plan pin ${String(asset.pin_number).padStart(2, "0")}`}
          </span>
        }
        secondary={[{ label: "QR code", icon: QrCode, onClick: () => setPreviewOpen(true), tour: "asset-qr" }]}
        primary={
          engineer
            ? { label: editing ? "Close editing" : "Edit", icon: Pencil, onClick: () => setEditing((e) => !e) }
            : undefined
        }
      />

      <div className="mx-auto grid w-full max-w-7xl gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <OpenFindingsBanner assetId={asset.id as Id<"assets">} />
          <AssetSummary asset={asset} photoUrl={photoUrl ?? null} docCount={docs.length} />
          {editing && (
            <AssetDetailBody
              part="form"
              asset={asset}
              docs={docs}
              logs={logs}
              assetsByDoc={assetsByDoc}
              onShowQr={() => setPreviewOpen(true)}
              onSave={async (patch) => {
                if (await save(patch)) setEditing(false)
              }}
              onCancel={() => setEditing(false)}
              onOpenDoc={(docId) => navigate(`/docs/${docId}`)}
              onOpenAsset={(aid) => navigate(`/assets/${aid}`)}
              onOpenLog={(log) => setActiveLog(log)}
              onDocAction={handleAction}
            />
          )}
          <AssetDetailBody
            part="documents"
            asset={asset}
            docs={docs}
            logs={logs}
            assetsByDoc={assetsByDoc}
            onShowQr={() => setPreviewOpen(true)}
            onSave={async (patch) => {
              await save(patch)
            }}
            onOpenDoc={(docId) => navigate(`/docs/${docId}`)}
            onOpenAsset={(aid) => navigate(`/assets/${aid}`)}
            onOpenLog={(log) => setActiveLog(log)}
            onDocAction={handleAction}
          />
          <AssetTrainingsCard assetId={asset.id as Id<"assets">} />
        </div>
        <aside className="space-y-5">
          <WhoCanWorkHere assetId={asset.id as Id<"assets">} />
          <OverviewsCard assetId={asset.id as Id<"assets">} />
        </aside>
      </div>

      <AssetPreviewModal asset={asset} open={previewOpen} onOpenChange={setPreviewOpen} />
      <LogReferenceModal log={activeLog} open={!!activeLog} onOpenChange={(o) => !o && setActiveLog(null)} />
      {dialogs}
    </div>
  )
}

/** Photo, description and counts. The record title is in the PageHeader. */
function AssetSummary({ asset, photoUrl, docCount }: { asset: Asset; photoUrl: string | null; docCount: number }) {
  return (
    <div className="flex flex-col gap-5 rounded-md border bg-card p-5 sm:flex-row" data-tour="asset-summary">
      <div className="flex h-40 w-full shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted sm:w-56">
        {photoUrl ? (
          <img src={photoUrl} alt={asset.name} className="h-full w-full object-cover" />
        ) : (
          <Factory className="h-10 w-10 text-muted-foreground/40" aria-label="No photo" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <h2 className="text-base font-semibold">About this Asset</h2>
        <p className="text-sm text-muted-foreground">
          {docCount} linked document{docCount === 1 ? "" : "s"}
        </p>
        {asset.description ? (
          <p className="max-w-2xl text-sm leading-relaxed">{asset.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No description yet.</p>
        )}
      </div>
    </div>
  )
}

function OpenFindingsBanner({ assetId }: { assetId: Id<"assets"> }) {
  const ctx = useQuery(api.assets.workContext, { id: assetId })
  const findings = ctx?.findings ?? []
  if (findings.length === 0) return null
  const first = findings[0]
  return (
    <div
      role="status"
      className="flex flex-wrap items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">
          {findings.length === 1
            ? "1 open Finding on this Asset's documents"
            : `${findings.length} open Findings on this Asset's documents`}
        </p>
        <p className="mt-0.5">
          {first.summary} <span className="font-mono text-xs">({first.codes.join(" and ")})</span>
        </p>
      </div>
      <Link
        href={`/library/findings?f=${first._id}`}
        className="inline-flex shrink-0 items-center gap-1 text-sm font-medium underline-offset-2 hover:underline"
      >
        {findings.length === 1 ? "Open the Finding" : "Open Findings"}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}

/** People qualified on every Skill needed here, by shift (skills.coverage). */
function WhoCanWorkHere({ assetId }: { assetId: Id<"assets"> }) {
  const ctx = useQuery(api.assets.workContext, { id: assetId })
  const skillIds = ctx?.skills.map((s) => s._id) ?? []
  const coverage = useQuery(api.skills.coverage, skillIds.length > 0 ? { skillIds } : "skip")
  const shifts = useShifts()
  return (
    <Card data-tour="asset-who-can-work">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Who can work here</h2>
        </div>
        {ctx === undefined || (skillIds.length > 0 && coverage === undefined) ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        ) : skillIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No Skill is linked to this Asset's documents or Rounds yet.{" "}
            <Link href="/learn" className="text-primary hover:underline">
              Link one in Learn
            </Link>
            .
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {ctx.skills.length === 1
                ? `Level 2 (Can do it) or higher on ${ctx.skills[0].name}.`
                : `Qualified on all ${ctx.skills.length} Skills needed here, level 2 (Can do it) or higher.`}
            </p>
            <ul className="divide-y rounded-md border">
              {(coverage?.byShift ?? []).map((g) => (
                <li key={g.shift ?? "none"} className="flex items-start gap-3 px-3 py-2 text-sm" data-testid="shift-row">
                  <span className="w-24 shrink-0 font-medium">{shifts.label(g.shift)}</span>
                  <span className={g.people.length === 0 ? "text-muted-foreground" : ""}>
                    {g.people.length === 0 ? "Nobody yet" : g.people.map((p) => p.name).join(", ")}
                  </span>
                </li>
              ))}
            </ul>
            {ctx.skills.length > 1 && (
              <div className="space-y-1.5 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">Per Skill, level 2 or higher</p>
                <ul className="space-y-1.5">
                  {ctx.skills.map((sk) => (
                    <SkillHolders key={sk._id} skillId={sk._id} name={sk.name} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** One Skill needed here and who holds it at level 2 or higher. */
function SkillHolders({ skillId, name }: { skillId: Id<"skills">; name: string }) {
  const cov = useQuery(api.skills.coverage, { skillIds: [skillId] })
  const names = cov?.qualified.map((p) => p.name) ?? []
  return (
    <li className="text-sm">
      <span className="font-medium">{name}</span>
      <span className="block text-xs text-muted-foreground">
        {cov === undefined ? "Loading..." : names.length === 0 ? "Nobody yet" : names.join(", ")}
      </span>
    </li>
  )
}

/** Wikis (Overviews) that cover this Asset or its documents. */
function OverviewsCard({ assetId }: { assetId: Id<"assets"> }) {
  const ctx = useQuery(api.assets.workContext, { id: assetId })
  if (ctx === undefined) return null
  return (
    <Card data-tour="asset-overviews">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <BookOpenText className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Overviews</h2>
          {ctx.wikis.length > 0 && <span className="text-xs text-muted-foreground">{ctx.wikis.length}</span>}
        </div>
        {ctx.wikis.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No Wiki covers this Asset yet.{" "}
            <Link href="/wiki" className="text-primary hover:underline">
              Open the Wiki
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-1">
            {ctx.wikis.map((w) => (
              <li key={w._id}>
                <Link href={`/wiki/${w._id}`} className="group -mx-1 block rounded-md p-1 hover:bg-muted/50">
                  <span className="block text-sm font-medium group-hover:text-primary">{w.title}</span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{w.purpose}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
