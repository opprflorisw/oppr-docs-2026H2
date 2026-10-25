import type { ReactNode } from "react"
import { AlertTriangle, Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { mb, type EngineState } from "./engine"

/** A numbered step of a lab tab. */
export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {n}. {title}
      </h2>
      {children}
    </section>
  )
}

export function Bar({ value, tone = "violet" }: { value: number; tone?: "violet" | "sky" }) {
  return (
    <div className="h-2 overflow-hidden rounded bg-muted">
      <div
        className={cn("h-full transition-all", tone === "violet" ? "bg-violet-500" : "bg-sky-500")}
        style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
      />
    </div>
  )
}

/** Load button, download progress and the ready line of one engine. */
export function LoadRow({
  state,
  onLoad,
  label,
  disabled,
}: {
  state: EngineState
  onLoad: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" onClick={onLoad} disabled={disabled || state.kind === "loading"}>
        {state.kind === "loading" ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
        {label}
      </Button>
      {state.kind === "loading" && (
        <div className="min-w-[260px] flex-1 space-y-1">
          <Bar value={state.total ? state.loaded / state.total : 0.02} />
          <div className="text-xs text-muted-foreground">
            {state.step}
            {state.total > 0 && ` · ${mb(state.loaded)} of ${mb(state.total)} (${state.files} files)`}
          </div>
        </div>
      )}
      {state.kind === "ready" && (
        <span className="text-xs text-emerald-700 dark:text-emerald-400">
          Ready: {state.spec.label}, {state.spec.dtype} on {state.spec.device === "webgpu" ? "GPU" : "CPU"}, loaded in{" "}
          {(state.loadMs / 1000).toFixed(1)} s. A second load comes from the browser cache.
        </span>
      )}
    </div>
  )
}

export function ErrorLine({ text }: { text: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-rose-500/40 bg-rose-500/5 p-2 text-xs">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" aria-hidden />
      <span className="break-all">{text}</span>
    </div>
  )
}

export function LoadFailure({
  message,
  gated,
  action,
}: {
  message: string
  gated: boolean
  /** A way on, for example "Switch to CPU". */
  action?: ReactNode
}) {
  return (
    <div role="alert" className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden />
        {gated
          ? "The model repository refused the download (it may be gated behind a licence click-through)."
          : "The model could not be loaded in this browser."}
      </div>
      {action}
      <div className="break-all font-mono text-[11px] text-muted-foreground">{message}</div>
      <div>
        Things to try: use desktop Chrome or Edge with WebGPU; check that jsDelivr and huggingface.co are not
        blocked by a proxy. If the browser route is not workable, see the Models tab for the server routes.
      </div>
    </div>
  )
}

export interface ListHit {
  key: string
  code?: string
  title: string
  detail?: string | null
  text?: string
  score: number
  thumb?: string | null
  note?: string
}

/** A ranked list with scores. Keys in `both` are highlighted. */
export function HitList({
  title,
  subtitle,
  hits,
  both,
  empty = "No results.",
}: {
  title: string
  subtitle: ReactNode
  hits: ListHit[]
  both?: Set<string>
  empty?: string
}) {
  return (
    <div className="min-w-0 rounded-md border">
      <div className="border-b bg-muted/40 px-3 py-2">
        <div className="text-xs font-semibold">{title}</div>
        <div className="text-[11px] text-muted-foreground">{subtitle}</div>
      </div>
      {hits.length === 0 ? (
        <div className="p-3 text-xs text-muted-foreground">{empty}</div>
      ) : (
        <ol className="divide-y">
          {hits.map((h, i) => (
            <li key={h.key} className={cn("flex gap-2 px-3 py-2 text-xs", both?.has(h.key) && "bg-emerald-500/10")}>
              <span className="w-4 shrink-0 text-muted-foreground">{i + 1}</span>
              {h.thumb !== undefined && (
                <div className="h-12 w-16 shrink-0 overflow-hidden rounded border bg-muted">
                  {h.thumb && <img src={h.thumb} alt="" className="h-full w-full object-cover" loading="lazy" />}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  {h.code && <span className="shrink-0 font-mono text-[11px]">{h.code}</span>}
                  <span className="truncate">{h.title}</span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{h.score.toFixed(3)}</span>
                </div>
                {h.detail && <div className="truncate text-muted-foreground">{h.detail}</div>}
                {h.text && <div className="line-clamp-2">{h.text}</div>}
                {h.note && <div className="text-[11px] text-muted-foreground">{h.note}</div>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** Small row of toggle buttons (device, model size). */
export function Choice<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string
  options: { value: NoInfer<T>; label: string; disabled?: boolean }[]
  value: T
  onChange: (v: NoInfer<T>) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label={label}>
      <span className="text-muted-foreground">{label}:</span>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          disabled={disabled || o.disabled}
          className={cn(
            "rounded border px-2 py-0.5 disabled:opacity-50",
            value === o.value ? "border-violet-500 bg-violet-500/10" : "hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
