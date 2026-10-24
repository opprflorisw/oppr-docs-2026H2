// Hero block at the top of the read view — promotes everything an operator
// or engineer needs at-a-glance: title, naming code, type/status badges,
// version, owner, last update, asset chips, tags. PPE chips are pulled from
// the document body's first PPE node so the operator can see required PPE
// without scrolling.

import { format } from "date-fns"
import { useLocation } from "wouter"
import { Factory, User as UserIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "./StatusBadge"
import { TypeBadge } from "./TypeBadge"
import type { Asset, Doc, User } from "@/types"
import { cn } from "@/lib/utils"
import { usePpeCatalog, ppeImageSrc } from "@/lib/ppeCatalog"

export interface Signer {
  role: "author" | "reviewer" | "approver"
  name: string | null
  title: string | null
  at: number
}

interface DocumentHeroProps {
  doc: Doc
  assets: Asset[]
  owner: User | null
  versionNumber: number
  ppeItems?: string[]
  /** Lifecycle role display names, resolved server-side. */
  roles?: {
    author: string | null
    reviewer: string | null
    approver: string | null
  }
  /** Sign-offs of the version shown, resolved to the named Engineers. */
  signers?: Signer[]
  /** Which roles are assigned but not signed yet (shown as awaiting). */
  assigned?: { reviewer: boolean; approver: boolean }
  /** When the version in use was published; null before a first publish. */
  effectiveAt?: number | null
  /** When the first version was started (ms). */
  createdAt?: number
  /** Override the status badge — the reader shows the live edition's status. */
  statusOverride?: Doc["status"]
  className?: string
}

export function DocumentHero({
  doc,
  assets,
  owner,
  versionNumber,
  ppeItems = [],
  roles,
  signers,
  assigned,
  effectiveAt,
  createdAt,
  statusOverride,
  className,
}: DocumentHeroProps) {
  const [, navigate] = useLocation()
  const signer = (role: Signer["role"]) =>
    [...(signers ?? [])].reverse().find((x) => x.role === role && x.name) ?? null
  const author = signer("author")
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-5 shadow-sm",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-bold text-foreground">
              {doc.naming_code || "Pre-draft"}
            </code>
            <TypeBadge type={doc.type} />
            <StatusBadge status={statusOverride ?? doc.status} />
            <Badge variant="outline" className="text-xs">
              v{versionNumber}
            </Badge>
          </div>
          <h1 className="text-xl font-semibold leading-tight">{doc.title}</h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <UserIcon className="h-3.5 w-3.5" />
              <span>
                {author
                  ? `${author.name}${author.title ? `, ${author.title}` : ""}`
                  : (roles?.author ?? owner?.name ?? "Unknown author")}
              </span>
            </div>
            <span>
              {effectiveAt != null
                ? `Effective ${formatDate(new Date(effectiveAt).toISOString())}`
                : "Not published yet"}
            </span>
            <span>
              Created{" "}
              {formatDate(
                createdAt != null ? new Date(createdAt).toISOString() : doc.created_at,
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-3">
          <Section label="Linked assets">
            {assets.length === 0 ? (
              <span className="text-xs text-muted-foreground">None</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {assets.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => navigate(`/assets/${a.id}`)}
                    className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 font-mono text-[11px] hover:border-primary/50 hover:bg-muted/70"
                  >
                    <Factory className="h-3 w-3" />
                    {a.code}
                  </button>
                ))}
              </div>
            )}
          </Section>
          <Section label="Review & approval">
            <div className="space-y-1.5 text-[11px]">
              <SignoffRow
                label="Reviewer"
                signer={signers ? signer("reviewer") : null}
                fallback={signers ? null : (roles?.reviewer ?? null)}
                awaiting={assigned?.reviewer ?? false}
              />
              <SignoffRow
                label="Approver"
                signer={signers ? signer("approver") : null}
                fallback={signers ? null : (roles?.approver ?? null)}
                awaiting={assigned?.approver ?? false}
              />
            </div>
          </Section>
          <HeroPpeSection ppeItems={ppeItems} />
        </div>
    </div>
  )
}

function SignoffRow({
  label,
  signer,
  fallback,
  awaiting,
}: {
  label: string
  signer: Signer | null
  fallback: string | null
  awaiting: boolean
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      {signer ? (
        <span className="min-w-0 text-right">
          <span className="block truncate font-medium">{signer.name}</span>
          <span className="block truncate text-muted-foreground">
            {[signer.title, formatDate(new Date(signer.at).toISOString())]
              .filter(Boolean)
              .join(", ")}
          </span>
        </span>
      ) : fallback ? (
        <span className="truncate">{fallback}</span>
      ) : (
        <span className="text-muted-foreground">
          {awaiting ? "Awaiting sign-off" : "Not assigned"}
        </span>
      )}
    </div>
  )
}

function HeroPpeSection({ ppeItems }: { ppeItems: string[] }) {
  const { resolve } = usePpeCatalog()
  return (
    <Section label="Required PPE">
      {ppeItems.length === 0 ? (
        <span className="text-xs text-muted-foreground">N/A</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {ppeItems.map((slug) => {
            const meta = resolve(slug)
            return (
              <span
                key={slug}
                title={meta.description ?? undefined}
                className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-900 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100"
              >
                <img
                  src={ppeImageSrc(meta)}
                  alt=""
                  width={14}
                  height={14}
                  className="object-contain"
                  draggable={false}
                />
                {meta.label}
              </span>
            )
          })}
        </div>
      )}
    </Section>
  )
}

function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return format(new Date(iso), "MMM d, yyyy")
  } catch {
    return iso
  }
}

/**
 * Walk the TipTap body looking for the first `ppe` node and return its items
 * array, parsed from the comma-separated `data-items` attr. Returns []
 * for non-TipTap bodies or when no PPE node is present.
 */
export function extractPpeItems(body: unknown): string[] {
  if (!body || typeof body !== "object") return []
  const root = body as { type?: string; content?: unknown[]; attrs?: Record<string, unknown> }
  if (root.type !== "doc") return []
  const stack: unknown[] = [...(root.content ?? [])]
  while (stack.length) {
    const node = stack.shift() as
      | { type?: string; content?: unknown[]; attrs?: Record<string, unknown> }
      | undefined
    if (!node) continue
    if (node.type === "ppe") {
      const items = (node.attrs?.items as string | undefined) ?? ""
      // Return every stored slug — the catalog resolves labels/pictograms,
      // including custom items added on the Safety tab.
      return items
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    }
    if (node.content) stack.push(...node.content)
  }
  return []
}
