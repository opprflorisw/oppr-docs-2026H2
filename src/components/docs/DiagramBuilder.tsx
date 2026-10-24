// DiagramBuilder — the hand-rolled, model-first SVG canvas (rebuild).
//
// Controlled component: parent owns `model`, gets every change via `onChange`.
//
// Rebuild (see /analysis/diagram-builder-rebuild): the canvas is a fixed-pixel
// SVG viewport with a single <g transform="translate(panX,panY) scale(zoom)">.
// The frame never moves; pan slides the world under it, zoom is free in and out
// (Fit is a button, not a floor). Pointer math is `(clientX − svgLeft − panX) /
// zoom` — no scrollbars, no rect-width race. New shapes land at the viewport
// centre so they're always visible, and the palette doubles as drag-and-drop
// sources. The background is a placed, resizable, lockable element in world
// space (Decision 2), not the thing that sizes the canvas. Everything else from
// v2/v3 (4-sided connectors, free arrows, per-node resize, asset picker, tints,
// templates) is the same capability re-expressed on this foundation.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import {
  Boxes,
  ChevronDown,
  Diamond,
  GitBranch,
  Image as ImageIcon,
  LayoutTemplate,
  Lock,
  LockOpen,
  Maximize2,
  Minus,
  MoveUpRight,
  Plus,
  Square,
  Trash2,
  Type,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  ARROW_COLORS,
  ARROW_WIDTHS,
  BG_MIN,
  DEFAULT_NODE_SIZE,
  DIAGRAM_GRID,
  DIAGRAM_SIDES,
  DIAGRAM_TINTS,
  clampNodeSize,
  contentBounds,
  createArrow,
  createEdge,
  createNode,
  decisionBranchTemplate,
  edgePath,
  nearestSide,
  nodeCenter,
  nodeTextRows,
  processLineTemplate,
  sideAnchor,
  type ArrowColorKey,
  type ArrowWidthKey,
  type DiagramArrow,
  type DiagramModel,
  type DiagramModelEdge,
  type DiagramModelNode,
  type DiagramNodeKind,
  type DiagramSide,
  type DiagramTintKey,
  type UploadedBackground,
} from "./diagramModel"

export interface AssetOption {
  code: string
  name: string
}

type Selection =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "arrow"; id: string }
  | { type: "bg" }

type BgCorner = "nw" | "ne" | "sw" | "se"

type Drag =
  | { type: "node"; id: string; dx: number; dy: number }
  | { type: "arrow-move"; id: string; startX: number; startY: number; orig: DiagramArrow }
  | { type: "arrow-end"; id: string; end: 1 | 2 }
  | { type: "bg-move"; dx: number; dy: number }
  | { type: "bg-resize"; corner: BgCorner; ratio: number; anchor: { x: number; y: number } }
  | { type: "pan"; sx: number; sy: number; ox: number; oy: number; moved: boolean }

const PALETTE: { kind: DiagramNodeKind; label: string; Icon: typeof Square }[] = [
  { kind: "process", label: "Process", Icon: Square },
  { kind: "decision", label: "Decision", Icon: Diamond },
  { kind: "terminator", label: "Terminator", Icon: GitBranch },
  { kind: "asset", label: "Asset", Icon: Boxes },
  { kind: "text", label: "Text", Icon: Type },
]

const ZOOM_MIN = 0.1
const ZOOM_MAX = 4
const FRAME_H = 460
const DND_MIME = "application/x-diagram-kind"
const PAN_THRESHOLD = 3

function snap(v: number): number {
  return Math.round(v / DIAGRAM_GRID) * DIAGRAM_GRID
}
function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))
}

export function DiagramBuilder({
  model,
  onChange,
  caption,
  assetOptions = [],
  onUploadBackground,
}: {
  model: DiagramModel
  onChange: (next: DiagramModel) => void
  caption: string
  assetOptions?: AssetOption[]
  onUploadBackground?: (file: File) => Promise<UploadedBackground | null>
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [selected, setSelected] = useState<Selection | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(0.5)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [panning, setPanning] = useState(false)
  const dragRef = useRef<Drag | null>(null)
  const edgeDragRef = useRef<{ fromId: string; fromSide: DiagramSide } | null>(null)
  const [edgeDragging, setEdgeDragging] = useState(false)
  // Auto-fit stays active until the user's first navigation, so the diagram
  // stays framed while the dialog finishes its open animation / on resize.
  const interactedRef = useRef(false)

  const byId = new Map(model.nodes.map((n) => [n.id, n]))
  // Handles are kept ~constant on screen regardless of zoom.
  const hs = 1 / zoom

  // Latest pan/zoom for the non-passive wheel listener.
  const panRef = useRef(pan)
  panRef.current = pan
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  // --- coordinate helpers ---------------------------------------------------
  function clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: (clientX - rect.left - panRef.current.x) / zoomRef.current,
      y: (clientY - rect.top - panRef.current.y) / zoomRef.current,
    }
  }
  function viewportCenterWorld(): { x: number; y: number } {
    const svg = svgRef.current
    if (!svg) return { x: model.width / 2, y: model.height / 2 }
    const rect = svg.getBoundingClientRect()
    return clientToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)
  }
  function fitView(target: DiagramModel = model) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const b = contentBounds(target)
    const z = clampZoom(Math.min(rect.width / b.w, rect.height / b.h) * 0.92)
    setZoom(z)
    setPan({ x: rect.width / 2 - (b.x + b.w / 2) * z, y: rect.height / 2 - (b.y + b.h / 2) * z })
  }
  // Latest fitView for the ResizeObserver (reads current model/refs).
  const fitRef = useRef(fitView)
  fitRef.current = fitView

  // Keep the content framed until the first user navigation. The observer fires
  // through the dialog's open animation and on any resize, so the initial fit
  // settles on the final svg size instead of a mid-animation measurement.
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    fitView() // synchronous before paint, so there's no mis-fit flash on open
    const ro = new ResizeObserver(() => {
      if (!interactedRef.current) fitRef.current()
    })
    ro.observe(svg)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cursor-anchored wheel zoom (manual non-passive listener so preventDefault works).
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      interactedRef.current = true
      const rect = svg.getBoundingClientRect()
      const z = zoomRef.current
      const p = panRef.current
      const wx = (e.clientX - rect.left - p.x) / z
      const wy = (e.clientY - rect.top - p.y) / z
      const next = clampZoom(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))
      setPan({ x: e.clientX - rect.left - wx * next, y: e.clientY - rect.top - wy * next })
      setZoom(+next.toFixed(4))
    }
    svg.addEventListener("wheel", onWheel, { passive: false })
    return () => svg.removeEventListener("wheel", onWheel)
  }, [])

  function zoomByButton(factor: number) {
    interactedRef.current = true
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const z = zoomRef.current
    const p = panRef.current
    const cx = rect.width / 2
    const cy = rect.height / 2
    const wx = (cx - p.x) / z
    const wy = (cy - p.y) / z
    const next = clampZoom(z * factor)
    setPan({ x: cx - wx * next, y: cy - wy * next })
    setZoom(+next.toFixed(4))
  }

  // --- model mutators -------------------------------------------------------
  function patchNode(id: string, patch: Partial<DiagramModelNode>) {
    onChange({ ...model, nodes: model.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })
  }
  function patchEdge(id: string, patch: Partial<DiagramModelEdge>) {
    onChange({ ...model, edges: model.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
  }
  function patchArrow(id: string, patch: Partial<DiagramArrow>) {
    onChange({ ...model, arrows: model.arrows.map((a) => (a.id === id ? { ...a, ...patch } : a)) })
  }
  function patchBg(patch: Partial<NonNullable<DiagramModel["background"]>>) {
    if (!model.background) return
    onChange({ ...model, background: { ...model.background, ...patch } })
  }
  function removeSelected() {
    if (!selected) return
    if (selected.type === "node") {
      onChange({
        ...model,
        nodes: model.nodes.filter((n) => n.id !== selected.id),
        edges: model.edges.filter((e) => e.from !== selected.id && e.to !== selected.id),
      })
    } else if (selected.type === "edge") {
      onChange({ ...model, edges: model.edges.filter((e) => e.id !== selected.id) })
    } else if (selected.type === "arrow") {
      onChange({ ...model, arrows: model.arrows.filter((a) => a.id !== selected.id) })
    } else {
      onChange({ ...model, background: null })
    }
    setSelected(null)
  }
  function addNodeAt(kind: DiagramNodeKind, wx: number, wy: number) {
    interactedRef.current = true
    const size = DEFAULT_NODE_SIZE[kind]
    const n = createNode(kind, snap(wx - size.w / 2), snap(wy - size.h / 2))
    onChange({ ...model, nodes: [...model.nodes, n] })
    setSelected({ type: "node", id: n.id })
  }
  function addNode(kind: DiagramNodeKind) {
    const c = viewportCenterWorld()
    addNodeAt(kind, c.x, c.y)
  }
  function addArrow() {
    interactedRef.current = true
    const c = viewportCenterWorld()
    const a = createArrow(snap(c.x - 80), snap(c.y), snap(c.x + 80), snap(c.y))
    onChange({ ...model, arrows: [...model.arrows, a] })
    setSelected({ type: "arrow", id: a.id })
  }
  function resizeSelected(factor: number) {
    if (selected?.type !== "node") return
    const n = byId.get(selected.id)
    if (!n) return
    patchNode(n.id, clampNodeSize(snap(n.w * factor), snap(n.h * factor)))
  }
  function loadTemplate(next: DiagramModel) {
    const merged = { ...next, background: model.background ?? null }
    onChange(merged)
    setSelected(null)
    requestAnimationFrame(() => fitView(merged))
  }

  function placeBackground(up: UploadedBackground) {
    const ratio = up.naturalWidth / up.naturalHeight || 1
    const targetLong = 1000
    let w: number
    let h: number
    if (up.naturalWidth >= up.naturalHeight) {
      w = Math.min(targetLong, up.naturalWidth)
      h = w / ratio
    } else {
      h = Math.min(targetLong, up.naturalHeight)
      w = h * ratio
    }
    const c = viewportCenterWorld()
    onChange({
      ...model,
      background: { url: up.url, x: snap(c.x - w / 2), y: snap(c.y - h / 2), w, h, locked: false },
    })
    setSelected({ type: "bg" })
  }
  async function handleBackgroundFile(file: File | null) {
    if (!file || !onUploadBackground) return
    setUploading(true)
    try {
      const up = await onUploadBackground(file)
      if (up) placeBackground(up)
    } finally {
      setUploading(false)
    }
  }

  // --- pointer interactions -------------------------------------------------
  function startDrag(e: ReactPointerEvent, drag: Drag) {
    interactedRef.current = true
    dragRef.current = drag
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  function onNodePointerDown(e: ReactPointerEvent, node: DiagramModelNode) {
    e.stopPropagation()
    setSelected({ type: "node", id: node.id })
    const p = clientToWorld(e.clientX, e.clientY)
    startDrag(e, { type: "node", id: node.id, dx: p.x - node.x, dy: p.y - node.y })
  }
  function onArrowPointerDown(e: ReactPointerEvent, a: DiagramArrow) {
    e.stopPropagation()
    setSelected({ type: "arrow", id: a.id })
    const p = clientToWorld(e.clientX, e.clientY)
    startDrag(e, { type: "arrow-move", id: a.id, startX: p.x, startY: p.y, orig: a })
  }
  function onArrowEndPointerDown(e: ReactPointerEvent, a: DiagramArrow, end: 1 | 2) {
    e.stopPropagation()
    setSelected({ type: "arrow", id: a.id })
    startDrag(e, { type: "arrow-end", id: a.id, end })
  }
  function onHandlePointerDown(e: ReactPointerEvent, node: DiagramModelNode, side: DiagramSide) {
    e.stopPropagation()
    edgeDragRef.current = { fromId: node.id, fromSide: side }
    setEdgeDragging(true)
    setPointer(sideAnchor(node, side))
  }
  function onBgPointerDown(e: ReactPointerEvent) {
    if (!model.background || model.background.locked) return
    e.stopPropagation()
    setSelected({ type: "bg" })
    const p = clientToWorld(e.clientX, e.clientY)
    startDrag(e, { type: "bg-move", dx: p.x - model.background.x, dy: p.y - model.background.y })
  }
  function onBgHandlePointerDown(e: ReactPointerEvent, corner: BgCorner) {
    if (!model.background) return
    e.stopPropagation()
    const bg = model.background
    const anchor = {
      nw: { x: bg.x + bg.w, y: bg.y + bg.h },
      ne: { x: bg.x, y: bg.y + bg.h },
      sw: { x: bg.x + bg.w, y: bg.y },
      se: { x: bg.x, y: bg.y },
    }[corner]
    startDrag(e, { type: "bg-resize", corner, ratio: bg.w / bg.h || 1, anchor })
  }

  // Canvas pointerdown reaches here only when no shape consumed it → pan/deselect.
  function onCanvasPointerDown(e: ReactPointerEvent) {
    startDrag(e, { type: "pan", sx: e.clientX, sy: e.clientY, ox: panRef.current.x, oy: panRef.current.y, moved: false })
  }

  function onCanvasPointerMove(e: ReactPointerEvent) {
    const d = dragRef.current
    if (d) {
      if (d.type === "pan") {
        const ddx = e.clientX - d.sx
        const ddy = e.clientY - d.sy
        if (!d.moved && Math.abs(ddx) + Math.abs(ddy) > PAN_THRESHOLD) {
          d.moved = true
          setPanning(true)
        }
        if (d.moved) setPan({ x: d.ox + ddx, y: d.oy + ddy })
        return
      }
      const p = clientToWorld(e.clientX, e.clientY)
      if (d.type === "node") {
        const n = byId.get(d.id)
        if (!n) return
        patchNode(n.id, { x: snap(p.x - d.dx), y: snap(p.y - d.dy) })
      } else if (d.type === "arrow-move") {
        const ddx = snap(p.x - d.startX)
        const ddy = snap(p.y - d.startY)
        patchArrow(d.id, {
          x1: d.orig.x1 + ddx,
          y1: d.orig.y1 + ddy,
          x2: d.orig.x2 + ddx,
          y2: d.orig.y2 + ddy,
        })
      } else if (d.type === "arrow-end") {
        patchArrow(d.id, d.end === 1 ? { x1: snap(p.x), y1: snap(p.y) } : { x2: snap(p.x), y2: snap(p.y) })
      } else if (d.type === "bg-move") {
        patchBg({ x: snap(p.x - d.dx), y: snap(p.y - d.dy) })
      } else if (d.type === "bg-resize") {
        const newW = Math.max(BG_MIN, Math.abs(p.x - d.anchor.x))
        const newH = newW / d.ratio
        const rightSide = d.corner === "se" || d.corner === "ne"
        const bottomSide = d.corner === "se" || d.corner === "sw"
        patchBg({
          x: snap(rightSide ? d.anchor.x : d.anchor.x - newW),
          y: snap(bottomSide ? d.anchor.y : d.anchor.y - newH),
          w: newW,
          h: newH,
        })
      }
    } else if (edgeDragRef.current) {
      setPointer(clientToWorld(e.clientX, e.clientY))
    }
  }

  function finishEdgeDrag() {
    const drag = edgeDragRef.current
    edgeDragRef.current = null
    setEdgeDragging(false)
    const p = pointer
    setPointer(null)
    if (!drag || !hovered || hovered === drag.fromId) return
    const target = byId.get(hovered)
    if (!target || !p) return
    const toSide = nearestSide(target, p.x, p.y)
    onChange({ ...model, edges: [...model.edges, createEdge(drag.fromId, hovered, drag.fromSide, toSide)] })
  }

  function onCanvasPointerUp(e: ReactPointerEvent) {
    const d = dragRef.current
    if (d) {
      svgRef.current?.releasePointerCapture(e.pointerId)
      dragRef.current = null
      if (d.type === "pan") {
        setPanning(false)
        if (!d.moved) setSelected(null)
      }
    }
    if (edgeDragRef.current) finishEdgeDrag()
  }

  // --- drag-and-drop palette ------------------------------------------------
  function onPaletteDragStart(e: ReactDragEvent, kind: DiagramNodeKind) {
    e.dataTransfer.setData(DND_MIME, kind)
    e.dataTransfer.effectAllowed = "copy"
  }
  function onCanvasDrop(e: ReactDragEvent) {
    const kind = e.dataTransfer.getData(DND_MIME) as DiagramNodeKind
    if (!kind) return
    e.preventDefault()
    const p = clientToWorld(e.clientX, e.clientY)
    addNodeAt(kind, p.x, p.y)
  }

  const selectedNode = selected?.type === "node" ? byId.get(selected.id) ?? null : null
  const selectedEdge = selected?.type === "edge" ? model.edges.find((ed) => ed.id === selected.id) ?? null : null
  const selectedArrow = selected?.type === "arrow" ? model.arrows.find((a) => a.id === selected.id) ?? null : null
  const fromNode = edgeDragRef.current ? byId.get(edgeDragRef.current.fromId) : null
  const bg = model.background
  const bgSelected = selected?.type === "bg" && !!bg && !bg.locked

  return (
    <div
      className="space-y-2"
      tabIndex={0}
      onKeyDown={(e) => {
        const tag = (e.target as HTMLElement).tagName
        if (e.key === "Delete" && tag !== "INPUT" && tag !== "TEXTAREA") removeSelected()
      }}
    >
      {/* import-template + zoom toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
              <LayoutTemplate className="h-3.5 w-3.5 text-primary" />
              Import template
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onClick={() => loadTemplate(processLineTemplate())}>
              <GitBranch className="mr-2 h-4 w-4" />
              Process line (5 steps)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => loadTemplate(decisionBranchTemplate())}>
              <Diamond className="mr-2 h-4 w-4" />
              Decision branch
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {onUploadBackground && (
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void handleBackgroundFile(e.target.files?.[0] ?? null)
              e.target.value = ""
            }}
          />
        )}

        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => zoomByButton(1 / 1.15)} aria-label="Zoom out">
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-10 text-center text-[11px] tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => zoomByButton(1.15)} aria-label="Zoom in">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="icon" variant="outline" className="h-7 w-7" aria-label="Fit" onClick={() => fitView()}>
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex gap-3">
        {/* left rail: shapes (drag sources) + background controls */}
        <div className="w-28 shrink-0 space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Shapes</div>
          {PALETTE.map(({ kind, label, Icon }) => (
            <button
              key={kind}
              type="button"
              draggable
              onDragStart={(e) => onPaletteDragStart(e, kind)}
              onClick={() => addNode(kind)}
              className="flex w-full cursor-grab items-center gap-1.5 rounded-md border bg-card px-2 py-1.5 text-[11px] transition-colors hover:bg-muted active:cursor-grabbing"
            >
              <Icon className="h-3.5 w-3.5 text-primary" />
              {label}
            </button>
          ))}
          <button type="button" onClick={addArrow} className="flex w-full items-center gap-1.5 rounded-md border bg-card px-2 py-1.5 text-[11px] transition-colors hover:bg-muted">
            <MoveUpRight className="h-3.5 w-3.5 text-primary" />
            Arrow
          </button>
          {onUploadBackground && (
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center gap-1.5 rounded-md border bg-card px-2 py-1.5 text-[11px] transition-colors hover:bg-muted disabled:opacity-50"
            >
              <ImageIcon className="h-3.5 w-3.5 text-primary" />
              {uploading ? "Uploading…" : "Background"}
            </button>
          )}

          {bg && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Background</div>
              <button
                type="button"
                onClick={() => patchBg({ locked: !bg.locked })}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition-colors",
                  bg.locked ? "border-primary bg-primary/10" : "bg-card hover:bg-muted",
                )}
              >
                {bg.locked ? <Lock className="h-3.5 w-3.5 text-primary" /> : <LockOpen className="h-3.5 w-3.5 text-primary" />}
                {bg.locked ? "Locked" : "Lock"}
              </button>
              <button
                type="button"
                onClick={() => { onChange({ ...model, background: null }); setSelected((s) => (s?.type === "bg" ? null : s)) }}
                className="flex w-full items-center gap-1.5 rounded-md border bg-card px-2 py-1.5 text-[11px] text-destructive transition-colors hover:bg-muted"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            </div>
          )}

          <p className="pt-1 text-[10px] leading-tight text-muted-foreground">
            Drag a shape onto the canvas, or click to drop it at the centre. Hover a node and drag a side dot to connect. Wheel to zoom, drag the canvas to pan.
          </p>
        </div>

        {/* canvas + caption preview */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div
            className="relative overflow-hidden rounded-md border bg-background"
            style={{ height: FRAME_H }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onCanvasDrop}
          >
            <svg
              ref={svgRef}
              width="100%"
              height={FRAME_H}
              className={cn(
                "touch-none select-none",
                edgeDragging ? "cursor-crosshair" : panning ? "cursor-grabbing" : "cursor-grab",
              )}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
            >
              <defs>
                <marker id="dgb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="#475569" />
                </marker>
                <marker id="dgb-arrow-cs" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
                </marker>
                <pattern id="dgb-grid" width={DIAGRAM_GRID * 2} height={DIAGRAM_GRID * 2} patternUnits="userSpaceOnUse">
                  <circle cx={1} cy={1} r={1} fill="rgba(100,116,139,0.25)" />
                </pattern>
              </defs>

              <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                {/* working-area guide + grid (also the pan/deselect surface) */}
                <rect x={0} y={0} width={model.width} height={model.height} fill="#fff" stroke="rgba(100,116,139,0.35)" strokeWidth={hs} />
                <rect x={0} y={0} width={model.width} height={model.height} fill="url(#dgb-grid)" pointerEvents="none" />

                {/* background image */}
                {bg && (
                  <image
                    href={bg.url}
                    x={bg.x}
                    y={bg.y}
                    width={bg.w}
                    height={bg.h}
                    preserveAspectRatio="xMidYMid meet"
                    className={bg.locked ? undefined : "cursor-move"}
                    pointerEvents={bg.locked ? "none" : "auto"}
                    onPointerDown={onBgPointerDown}
                  />
                )}
                {bgSelected && bg && (
                  <>
                    <rect x={bg.x} y={bg.y} width={bg.w} height={bg.h} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5 * hs} strokeDasharray={`${4 * hs} ${3 * hs}`} pointerEvents="none" />
                    {(["nw", "ne", "sw", "se"] as BgCorner[]).map((corner) => {
                      const cx = corner === "ne" || corner === "se" ? bg.x + bg.w : bg.x
                      const cy = corner === "sw" || corner === "se" ? bg.y + bg.h : bg.y
                      const sq = 6 * hs
                      return (
                        <rect
                          key={corner}
                          x={cx - sq}
                          y={cy - sq}
                          width={sq * 2}
                          height={sq * 2}
                          fill="#fff"
                          stroke="hsl(var(--primary))"
                          strokeWidth={1.5 * hs}
                          className="cursor-nwse-resize"
                          onPointerDown={(e) => onBgHandlePointerDown(e, corner)}
                        />
                      )
                    })}
                  </>
                )}

                {/* edges */}
                {model.edges.map((ed) => {
                  const from = byId.get(ed.from)
                  const to = byId.get(ed.to)
                  if (!from || !to) return null
                  const { d, mid } = edgePath(from, to, ed)
                  const isSel = selected?.type === "edge" && selected.id === ed.id
                  return (
                    <g key={ed.id}>
                      <path d={d} fill="none" stroke="transparent" strokeWidth={14 * hs} className="cursor-pointer" onPointerDown={(e) => { e.stopPropagation(); setSelected({ type: "edge", id: ed.id }) }} />
                      <path d={d} fill="none" stroke={isSel ? "hsl(var(--primary))" : "#475569"} strokeWidth={2} markerEnd="url(#dgb-arrow)" pointerEvents="none" />
                      {ed.label && (
                        <text x={mid.x} y={mid.y - 4} fill="#475569" fontSize={11} textAnchor="middle" pointerEvents="none">{ed.label}</text>
                      )}
                    </g>
                  )
                })}

                {/* free arrows */}
                {model.arrows.map((a) => {
                  const isSel = selected?.type === "arrow" && selected.id === a.id
                  const color = ARROW_COLORS[a.color]
                  const w = ARROW_WIDTHS[a.width]
                  const sq = 6 * hs
                  return (
                    <g key={a.id}>
                      <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="transparent" strokeWidth={16 * hs} className="cursor-move" onPointerDown={(e) => onArrowPointerDown(e, a)} />
                      <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={color} strokeWidth={w} strokeLinecap="round" markerEnd="url(#dgb-arrow-cs)" pointerEvents="none" />
                      {isSel &&
                        ([[a.x1, a.y1, 1], [a.x2, a.y2, 2]] as const).map(([hx, hy, end]) => (
                          <rect key={end} x={hx - sq} y={hy - sq} width={sq * 2} height={sq * 2} fill="#fff" stroke="hsl(var(--primary))" strokeWidth={1.5 * hs} className="cursor-pointer" onPointerDown={(e) => onArrowEndPointerDown(e, a, end as 1 | 2)} />
                        ))}
                    </g>
                  )
                })}

                {/* ghost connect line */}
                {edgeDragging && fromNode && pointer && (
                  <line x1={sideAnchor(fromNode, edgeDragRef.current!.fromSide).x} y1={sideAnchor(fromNode, edgeDragRef.current!.fromSide).y} x2={pointer.x} y2={pointer.y} stroke="hsl(var(--primary))" strokeWidth={1.5 * hs} strokeDasharray={`${4 * hs} ${3 * hs}`} pointerEvents="none" />
                )}

                {/* nodes */}
                {model.nodes.map((n) => {
                  const isTarget = edgeDragging && hovered === n.id && n.id !== edgeDragRef.current?.fromId
                  return (
                    <NodeShape
                      key={n.id}
                      node={n}
                      hs={hs}
                      selected={selected?.type === "node" && selected.id === n.id}
                      targeted={!!isTarget}
                      // During an edge-drag, surface the connectors on the node you're
                      // hovering so the connection target is visible (not guesswork).
                      showHandles={!dragRef.current && (edgeDragging ? !!isTarget : hovered === n.id || (selected?.type === "node" && selected.id === n.id))}
                      onPointerDown={(e) => onNodePointerDown(e, n)}
                      onPointerEnter={() => setHovered(n.id)}
                      onPointerLeave={() => setHovered((h) => (h === n.id ? null : h))}
                      onHandleDown={(e, side) => onHandlePointerDown(e, n, side)}
                    />
                  )
                })}
              </g>
            </svg>

            {/* resize control, anchored next to the selected node */}
            {selectedNode && (() => {
              const rightX = pan.x + (selectedNode.x + selectedNode.w) * zoom
              const topY = pan.y + selectedNode.y * zoom
              const below = topY < 40
              const top = below ? pan.y + (selectedNode.y + selectedNode.h) * zoom + 6 : topY - 6
              return (
                <div
                  className="absolute z-20 flex items-center gap-0.5 rounded-md border bg-card p-0.5 shadow-sm"
                  style={{ left: rightX, top, transform: `translate(-100%, ${below ? "0" : "-100%"})` }}
                >
                  <button type="button" aria-label="Smaller" onClick={() => resizeSelected(1 / 1.2)} className="flex h-6 w-6 items-center justify-center rounded text-foreground hover:bg-muted">
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" aria-label="Larger" onClick={() => resizeSelected(1.2)} className="flex h-6 w-6 items-center justify-center rounded text-foreground hover:bg-muted">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })()}
          </div>
          {caption.trim() && <div className="text-center text-xs italic text-muted-foreground">{caption}</div>}
        </div>

        {/* inspector */}
        <div className="w-44 shrink-0 space-y-3 text-[11px]">
          {!selected && (
            <p className="text-muted-foreground">
              Add a shape or arrow, then select it to edit. Hover a node and drag a side dot to another node to connect. Wheel zooms; drag the canvas to pan.
            </p>
          )}

          {selectedNode && (
            <>
              <div className="space-y-1">
                <div className="text-muted-foreground">Label</div>
                <Input value={selectedNode.label} onChange={(e) => patchNode(selectedNode.id, { label: e.target.value })} className="h-7 text-xs" />
              </div>
              {selectedNode.kind === "asset" && (
                <div className="space-y-1.5">
                  <div className="text-muted-foreground">Asset</div>
                  <select
                    value={assetOptions.some((a) => a.code === selectedNode.assetCode) ? selectedNode.assetCode : ""}
                    onChange={(e) => {
                      const code = e.target.value
                      const opt = assetOptions.find((a) => a.code === code)
                      patchNode(selectedNode.id, { assetCode: code, ...(opt ? { label: opt.name } : {}) })
                    }}
                    className="h-7 w-full rounded-md border bg-background px-2 text-xs"
                  >
                    <option value="">Existing asset…</option>
                    {assetOptions.map((a) => (
                      <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
                    ))}
                  </select>
                  <Input value={selectedNode.assetCode ?? ""} onChange={(e) => patchNode(selectedNode.id, { assetCode: e.target.value })} placeholder="Or hypothetical code" className="h-7 font-mono text-xs" />
                </div>
              )}
              {selectedNode.kind !== "text" && (
                <div className="space-y-1">
                  <div className="text-muted-foreground">Tint</div>
                  <Swatches values={Object.keys(DIAGRAM_TINTS) as DiagramTintKey[]} colorOf={(k) => DIAGRAM_TINTS[k as DiagramTintKey].fill} value={selectedNode.tint} onChange={(t) => patchNode(selectedNode.id, { tint: t as DiagramTintKey })} />
                </div>
              )}
              <Button type="button" size="sm" variant="outline" className="w-full gap-1.5 text-destructive hover:text-destructive" onClick={removeSelected}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
            </>
          )}

          {selectedEdge && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Connector</div>
              <div className="space-y-1">
                <div className="text-muted-foreground">Label</div>
                <Input value={selectedEdge.label ?? ""} onChange={(e) => patchEdge(selectedEdge.id, { label: e.target.value })} placeholder="Yes / No" className="h-7 text-xs" />
              </div>
              <Button type="button" size="sm" variant="outline" className="w-full gap-1.5 text-destructive hover:text-destructive" onClick={removeSelected}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
            </>
          )}

          {selectedArrow && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Arrow</div>
              <div className="space-y-1">
                <div className="text-muted-foreground">Color</div>
                <Swatches values={Object.keys(ARROW_COLORS) as ArrowColorKey[]} colorOf={(k) => ARROW_COLORS[k as ArrowColorKey]} value={selectedArrow.color} onChange={(c) => patchArrow(selectedArrow.id, { color: c as ArrowColorKey })} />
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">Thickness</div>
                <div className="flex gap-1">
                  {(Object.keys(ARROW_WIDTHS) as ArrowWidthKey[]).map((k) => (
                    <button key={k} type="button" onClick={() => patchArrow(selectedArrow.id, { width: k })} className={cn("flex-1 rounded-md border px-1 py-1 text-[10px] capitalize", selectedArrow.width === k ? "border-primary bg-primary/10" : "hover:bg-muted")}>{k}</button>
                  ))}
                </div>
              </div>
              <Button type="button" size="sm" variant="outline" className="w-full gap-1.5 text-destructive hover:text-destructive" onClick={removeSelected}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
            </>
          )}

          {selected?.type === "bg" && bg && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Background</div>
              <p className="text-muted-foreground">
                {bg.locked
                  ? "Locked: clicks pass through to the shapes on top. Unlock from the left rail to move or resize."
                  : "Drag to move; drag a corner to resize (keeps aspect ratio). Lock it from the left rail when placed."}
              </p>
              <Button type="button" size="sm" variant="outline" className="w-full gap-1.5" onClick={() => patchBg({ locked: !bg.locked })}>
                {bg.locked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {bg.locked ? "Unlock" : "Lock"}
              </Button>
              <Button type="button" size="sm" variant="outline" className="w-full gap-1.5 text-destructive hover:text-destructive" onClick={removeSelected}><Trash2 className="h-3.5 w-3.5" />Remove</Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function NodeShape({
  node,
  hs,
  selected,
  targeted,
  showHandles,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onHandleDown,
}: {
  node: DiagramModelNode
  hs: number
  selected: boolean
  targeted: boolean
  showHandles: boolean
  onPointerDown: (e: ReactPointerEvent) => void
  onPointerEnter: () => void
  onPointerLeave: () => void
  onHandleDown: (e: ReactPointerEvent, side: DiagramSide) => void
}) {
  const t = DIAGRAM_TINTS[node.tint] ?? DIAGRAM_TINTS.slate
  const { cx, cy } = nodeCenter(node)
  const rows = nodeTextRows(node)

  return (
    <g className="cursor-pointer" onPointerDown={onPointerDown} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      {node.kind === "text" ? (
        <rect x={node.x} y={node.y} width={node.w} height={node.h} fill="transparent" />
      ) : node.kind === "decision" ? (
        <polygon points={`${cx},${node.y} ${node.x + node.w},${cy} ${cx},${node.y + node.h} ${node.x},${cy}`} fill={t.fill} stroke={t.stroke} strokeWidth={1.5} />
      ) : (
        <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={node.kind === "terminator" ? node.h / 2 : 6} fill={t.fill} stroke={t.stroke} strokeWidth={1.5} />
      )}

      {node.kind === "asset" && <AssetGlyph x={node.x + 8} y={node.y + 8} color={t.text} />}

      {rows.lines.map((ln, i) => (
        <text key={i} x={cx} y={rows.firstY + i * rows.lh} fill={t.text} fontSize={13} fontWeight={600} textAnchor="middle" pointerEvents="none">{ln}</text>
      ))}
      {rows.code && rows.codeY !== null && (
        <text x={cx} y={rows.codeY} fill={t.text} fontSize={11} fontFamily="ui-monospace, monospace" textAnchor="middle" pointerEvents="none">{rows.code}</text>
      )}

      {(selected || targeted) && (
        <rect x={node.x - 4 * hs} y={node.y - 4 * hs} width={node.w + 8 * hs} height={node.h + 8 * hs} rx={8} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5 * hs} strokeDasharray={`${4 * hs} ${3 * hs}`} pointerEvents="none" />
      )}

      {showHandles &&
        DIAGRAM_SIDES.map((side) => {
          const a = sideAnchor(node, side)
          return (
            <circle key={side} cx={a.x} cy={a.y} r={5 * hs} fill="hsl(var(--primary) / 0.6)" stroke="#fff" strokeWidth={1.25 * hs} className="cursor-crosshair" onPointerDown={(e) => onHandleDown(e, side)} />
          )
        })}
    </g>
  )
}

function AssetGlyph({ x, y, color }: { x: number; y: number; color: string }) {
  const cells = [
    [0, 0], [1, 0], [2, 0],
    [0, 1], [2, 1],
    [0, 2], [1, 2], [2, 2],
  ]
  const s = 3
  return (
    <g pointerEvents="none">
      {cells.map(([cx, cy], i) => (
        <rect key={i} x={x + cx * (s + 1)} y={y + cy * (s + 1)} width={s} height={s} fill={color} />
      ))}
    </g>
  )
}

function Swatches({
  values,
  colorOf,
  value,
  onChange,
}: {
  values: string[]
  colorOf: (k: string) => string
  value: string
  onChange: (k: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((k) => (
        <button key={k} type="button" aria-label={k} onClick={() => onChange(k)} className={cn("h-5 w-5 rounded-full border-2", value === k ? "border-foreground" : "border-transparent")} style={{ background: colorOf(k) }} />
      ))}
    </div>
  )
}
