// The Asset hub: what you see after a Scan. Safety first (LMRA, lockout),
// then the Wiki overview, the tasks (SOPs and work instructions), your
// Trainings and Rounds here, manuals, and an inline Ask about this Asset.

import { useEffect, useMemo, useState } from "react"
import { useLocation, useRoute } from "wouter"
import { useQuery } from "convex/react"
import {
  AlertTriangle,
  BookOpen,
  BookText,
  ChevronRight,
  ClipboardList,
  FileText,
  Footprints,
  GraduationCap,
  Home,
  Map,
  MessageSquare,
  ShieldAlert,
  Star,
} from "lucide-react"
import { useRecordUsage } from "@/lib/usage"
import { api } from "../../../convex/_generated/api"
import type { Doc as ConvexDoc, Id } from "../../../convex/_generated/dataModel"
import { Skeleton } from "@/components/ui/skeleton"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { MobileDocCard } from "@/components/mobile/MobileDocCard"
import { spotLabel } from "@/components/mobile/MobileAssetCard"
import { FloorPrimaryButton, MobileSheet } from "@/components/mobile/MobileSheet"
import { useStartTraining } from "@/components/mobile/MobileTodo"
import { WikiRowButton } from "@/components/mobile/MobileFind"
import { looksLikeConvexId, usePinned, useRecentlyViewed } from "@/components/mobile/use-mobile-prefs"
import { cn } from "@/lib/utils"

type Group = "safety" | "task" | "manual" | "other"

function groupOf(d: ConvexDoc<"documents">): Group {
  const t = d.type.toLowerCase()
  if (d.origin === "wrapped" || t === "manual") return "manual"
  if (t === "lmra" || t === "loto" || /\b(loto|lockout|lock-out|tagout)\b/i.test(d.title)) return "safety"
  if (t === "sop" || t === "work_instruction" || t === "wi") return "task"
  return "other"
}

export function MobileAssetPage() {
  const [, params] = useRoute<{ id: string }>("/m/assets/:id")
  const id = params?.id ?? ""
  const [, navigate] = useLocation()
  const { isPinned, togglePin, removePin } = usePinned()
  const { pushRecent, removeRecent } = useRecentlyViewed()
  const [activeLog, setActiveLog] = useState<ConvexDoc<"assetLogs"> | null>(null)
  const [allTasks, setAllTasks] = useState(false)

  const idIsConvexShaped = looksLikeConvexId(id)
  useEffect(() => {
    if (!idIsConvexShaped && id) {
      removePin("asset", id)
      removeRecent("asset", id)
    }
  }, [idIsConvexShaped, id, removePin, removeRecent])

  // Opening an Asset on the floor is a Scan (CONTEXT.md: Scan).
  useRecordUsage({
    kind: "scan",
    assetId: id && idIsConvexShaped ? (id as Id<"assets">) : undefined,
  })
  const assetId = id && idIsConvexShaped ? (id as Id<"assets">) : null
  const result = useQuery(api.assets.getWithDocs, assetId ? { id: assetId, publishedOnly: true } : "skip")
  const wikis = useQuery(api.wikis.listForAsset, assetId ? { assetId } : "skip")
  const learning = useQuery(api.trainings.forAsset, assetId ? { assetId } : "skip")
  const ready = idIsConvexShaped ? result !== undefined : true
  const asset = result?.asset ?? null

  const groups = useMemo(() => {
    const g: Record<Group, ConvexDoc<"documents">[]> = { safety: [], task: [], manual: [], other: [] }
    for (const d of result?.documents ?? []) g[groupOf(d)].push(d)
    return g
  }, [result])

  useEffect(() => {
    if (!asset) return
    pushRecent({ kind: "asset", id: asset._id, label: asset.name, sublabel: asset.code })
  }, [asset, pushRecent])

  if (!idIsConvexShaped || (ready && !asset)) {
    return (
      <div className="flex h-full flex-col">
        <MobileHeader backTo="/m/find" title="Asset not found" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <div className="text-lg font-semibold">This Asset is no longer available</div>
          <div className="text-base text-muted-foreground">It may have been removed since you last opened it.</div>
          <FloorPrimaryButton
            className="mt-2"
            onClick={() => {
              if (id) {
                removePin("asset", id)
                removeRecent("asset", id)
              }
              navigate("/m")
            }}
          >
            <Home className="h-5 w-5" />
            Back to Home
          </FloorPrimaryButton>
        </div>
      </div>
    )
  }

  if (!ready || !asset) {
    return (
      <div className="flex flex-col">
        <MobileHeader backTo="/m/find" title="Loading" />
        <div className="space-y-3 p-4">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  const saved = isPinned("asset", asset._id)
  const spot = spotLabel(asset.pinNumber)
  const docRow = (d: ConvexDoc<"documents">) => (
    <MobileDocCard
      key={d._id}
      doc={{
        id: d._id,
        title: d.title,
        naming_code: d.namingCode,
        type: d.type,
        live_version: d.liveVersion ?? null,
        current_version: d.currentVersion,
      }}
      onClick={() => navigate(`/m/docs/${d._id}`)}
      saved={isPinned("doc", d._id)}
      onToggleSave={() => togglePin({ kind: "doc", id: d._id, label: d.title, sublabel: d.namingCode })}
    />
  )
  const readyWikis = (wikis ?? []).filter((w) => w.status === "ready")
  const nothing =
    result!.documents.length === 0 && readyWikis.length === 0 && !learning?.rounds.length && !learning?.trainings.length

  return (
    <div className="flex flex-col">
      <MobileHeader
        backTo="/m/find"
        title={asset.name}
        subtitle={
          <span className="flex items-center gap-2">
            <span className="font-mono">{asset.code}</span>
            {spot && (
              <span className="inline-flex items-center gap-1">
                <Map className="h-3.5 w-3.5" />
                {spot}
              </span>
            )}
          </span>
        }
        right={
          <button
            type="button"
            aria-pressed={saved}
            aria-label={saved ? "Saved. Remove from Saved" : "Save this Asset"}
            className="flex h-11 w-11 items-center justify-center rounded-full"
            onClick={() => togglePin({ kind: "asset", id: asset._id, label: asset.name, sublabel: asset.code })}
          >
            <Star className={cn("h-6 w-6", saved ? "fill-amber-500 text-amber-500" : "text-muted-foreground")} />
          </button>
        }
      />

      <div className="flex flex-col gap-5 p-4 pb-8">
        {/* Ask about this Asset, inline: no floating button over the content. */}
        <button
          type="button"
          onClick={() => navigate(`/m/ask?scope=asset:${asset._id}`)}
          className="flex min-h-14 items-center gap-3 rounded-2xl border bg-muted/40 px-4 text-left transition active:scale-[0.99]"
        >
          <MessageSquare className="h-5 w-5 shrink-0 text-[#6E59A5]" />
          <span className="min-w-0 flex-1 truncate text-base text-muted-foreground">
            Ask about <span className="font-mono">{asset.code}</span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>

        {asset.description && <p className="px-1 text-base leading-relaxed text-muted-foreground">{asset.description}</p>}

        {groups.safety.length > 0 && (
          <Section icon={ShieldAlert} title="Safety here" tone="danger">
            {groups.safety.map(docRow)}
          </Section>
        )}

        {readyWikis.length > 0 && (
          <Section icon={BookOpen} title="Overview">
            {readyWikis.slice(0, 3).map((w) => (
              <WikiRowButton key={w._id} wiki={w} />
            ))}
          </Section>
        )}

        {groups.task.length > 0 && (
          <Section icon={ClipboardList} title={groups.task.length > TASKS_FIRST ? "Do a task: saved and latest first" : "Do a task"}>
            {/* Saved ones first, then the most recently changed: the task in
                use now is rarely the 9th row of an alphabetical list. */}
            {(() => {
              const sorted = [...groups.task].sort(
                (a, b) => Number(isPinned("doc", b._id)) - Number(isPinned("doc", a._id)) || b.updatedAt - a.updatedAt,
              )
              const shown = allTasks ? sorted : sorted.slice(0, TASKS_FIRST)
              return (
                <>
                  {shown.map(docRow)}
                  {sorted.length > TASKS_FIRST && (
                    <button
                      type="button"
                      onClick={() => setAllTasks(!allTasks)}
                      className="min-h-12 rounded-2xl border border-dashed px-4 text-base font-medium text-[#6E59A5]"
                    >
                      {allTasks ? "Show fewer" : `Show all ${sorted.length} tasks`}
                    </button>
                  )}
                </>
              )
            })()}
          </Section>
        )}

        {learning && (learning.rounds.length > 0 || learning.trainings.length > 0) && (
          <Section icon={GraduationCap} title="Your training here">
            {learning.rounds.map((r) => (
              <TrainingRow
                key={r._id}
                onHold={r.needsReview}
                training={{ _id: r._id, code: r.code, title: r.title, kind: "round" }}
                note={`Round · stop ${r.stopIndex + 1} of ${r.stops} is here`}
              />
            ))}
            {learning.trainings.map((t) => (
              <TrainingRow
                key={t._id}
                onHold={t.needsReview}
                training={{ _id: t._id, code: t.code, title: t.title, kind: t.kind }}
                note={`Training on ${t.documentCodes.join(", ")}`}
              />
            ))}
          </Section>
        )}

        {groups.manual.length > 0 && (
          <Section icon={BookText} title="Manuals">
            {groups.manual.map(docRow)}
          </Section>
        )}

        {groups.other.length > 0 && (
          <Section icon={FileText} title="Other documents">
            {groups.other.map(docRow)}
          </Section>
        )}

        {result!.logs.length > 0 && (
          <Section icon={FileText} title="Logs for this Asset">
            {result!.logs.map((log) => (
              <button
                key={log.code}
                type="button"
                onClick={() => setActiveLog(log)}
                className="flex min-h-16 w-full items-center gap-3 rounded-2xl border bg-card px-3 py-3 text-left shadow-sm transition active:scale-[0.99]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
                  <FileText className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-base font-semibold leading-snug">{log.name}</span>
                  <span className="block truncate font-mono text-[13px] text-muted-foreground">{log.code}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </Section>
        )}

        {nothing && (
          <div className="rounded-2xl border bg-card p-6 text-center text-base text-muted-foreground">
            Nothing is Published for this Asset yet. Ask an Engineer, or Ask about it above.
          </div>
        )}
      </div>

      {activeLog && (
        <MobileSheet title={activeLog.name} description={<span className="font-mono">{activeLog.code}</span>} onClose={() => setActiveLog(null)}>
          <div className="space-y-3 px-2 pb-2">
            {activeLog.description && <p className="text-base text-muted-foreground">{activeLog.description}</p>}
            <p className="rounded-xl border bg-muted/40 px-4 py-3 text-sm">
              You fill in this log in <span className="font-semibold">Oppr LOGS</span>, the checklist app on this phone.
            </p>
          </div>
        </MobileSheet>
      )}
    </div>
  )
}

const TASKS_FIRST = 3

function Section({
  icon: Icon,
  title,
  tone,
  children,
}: {
  icon: typeof Star
  title: string
  tone?: "danger"
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2
        className={cn(
          "flex items-center gap-1.5 px-1 text-[13px] font-semibold uppercase tracking-wide",
          tone === "danger" ? "text-red-700 dark:text-red-400" : "text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
        {title}
      </h2>
      {children}
    </section>
  )
}

function TrainingRow({
  training,
  note,
  onHold = false,
}: {
  training: { _id: Id<"trainings">; code: string; title: string; kind: "course" | "round" }
  note: string
  /** Being checked after a change: it cannot start, so it is not a button. */
  onHold?: boolean
}) {
  const { go, busy } = useStartTraining()
  const Icon = training.kind === "round" ? Footprints : GraduationCap
  if (onHold) {
    return (
      <div className="flex min-h-16 items-center gap-3 rounded-2xl border bg-muted/40 px-3 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-base font-semibold leading-snug">{training.title}</span>
          <span className="block text-[13px] text-muted-foreground">
            <span className="font-mono">{training.code}</span> · On hold until an Engineer has checked it after a change
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-sm font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Waiting
        </span>
      </div>
    )
  }
  return (
    <button
      type="button"
      disabled={busy !== null}
      onClick={() => go(training)}
      className="flex min-h-16 items-center gap-3 rounded-2xl border bg-card px-3 py-3 text-left shadow-sm transition active:scale-[0.99] disabled:opacity-70"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6E59A5]/10 text-[#6E59A5]">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-base font-semibold leading-snug">{training.title}</span>
        <span className="block truncate text-[13px] text-muted-foreground">
          <span className="font-mono">{training.code}</span> · {note}
        </span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-[#6E59A5]">{training.kind === "round" ? "Walk" : "Start"}</span>
    </button>
  )
}
