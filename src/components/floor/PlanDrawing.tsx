import { memo } from "react"
import { ENTRANCE, VIEW_H, VIEW_W, type MachineShape, type Pt } from "./layout"

// The static drawing: walls, halls, aisles, doors, line 2 as a flow, the
// legend. Machines are drawn per Asset (MachineGlyph) by the plan on top.

const WALL = "hsl(var(--foreground) / 0.55)"
const ROOM = "hsl(var(--muted) / 0.55)"
const AISLE = "hsl(48 96% 53% / 0.9)"
const LABEL = "hsl(var(--muted-foreground))"

export const PlanDrawing = memo(function PlanDrawing({
  plantName,
  siteCode,
  codes,
}: {
  plantName: string
  siteCode: string | null
  codes: Set<string>
}) {
  const has = (c: string) => codes.has(c)
  return (
    <g>
      <defs>
        <pattern id="floor-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="hsl(var(--foreground) / 0.04)" strokeWidth="1" />
        </pattern>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--primary))" />
        </marker>
        <marker id="feed-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" />
        </marker>
      </defs>

      {/* Site */}
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="hsl(var(--background))" />
      <rect x="20" y="40" width="960" height="540" rx="6" fill="url(#floor-grid)" />

      {/* Rooms */}
      <rect x="20" y="40" width="310" height="285" fill={ROOM} />
      <rect x="20" y="325" width="310" height="255" fill={ROOM} />
      <rect x="400" y="40" width="580" height="540" fill={ROOM} />

      {/* Aisles: yellow floor markings */}
      <g stroke={AISLE} strokeWidth="2" strokeDasharray="10 7" fill="none">
        {/* main corridor */}
        <path d="M 342 40 L 342 580 M 388 40 L 388 580" />
        {/* hall 1 */}
        <path d="M 20 247 L 330 247 M 20 277 L 330 277" />
        {/* hall 2 */}
        <path d="M 400 312 L 980 312 M 400 348 L 980 348" />
        {/* lab */}
        <path d="M 20 490 L 330 490 M 20 520 L 330 520" />
      </g>

      {/* Outer and inner walls, with gaps for the doors */}
      <g stroke={WALL} strokeWidth="5" fill="none" strokeLinecap="square">
        {/* outer wall, entrance gap at the bottom of the corridor */}
        <path d="M 345 580 L 20 580 L 20 40 L 980 40 L 980 580 L 385 580" />
        {/* hall 1 right wall, door at the aisle */}
        <path d="M 330 40 L 330 240 M 330 284 L 330 325" />
        {/* hall 1 / lab wall */}
        <path d="M 20 325 L 330 325" />
        {/* lab right wall, door at the aisle */}
        <path d="M 330 325 L 330 482 M 330 528 L 330 580" />
        {/* hall 2 left wall, door at the aisle */}
        <path d="M 400 40 L 400 305 M 400 355 L 400 580" />
      </g>

      {/* Door swings */}
      <g stroke={WALL} strokeWidth="1.2" fill="none" opacity="0.6">
        <path d="M 330 240 A 44 44 0 0 1 374 284" />
        <path d="M 330 482 A 46 46 0 0 1 376 528" />
        <path d="M 400 305 A 50 50 0 0 0 350 355" />
      </g>

      {/* Room labels */}
      <g fontFamily="ui-sans-serif, system-ui" fill={LABEL}>
        <text x="34" y="64" fontSize="15" fontWeight="600" fill="hsl(var(--foreground) / 0.75)">Hall 1 · Mixing</text>
        <text x="34" y="349" fontSize="15" fontWeight="600" fill="hsl(var(--foreground) / 0.75)">Quality lab</text>
        <text x="414" y="64" fontSize="15" fontWeight="600" fill="hsl(var(--foreground) / 0.75)">Hall 2 · Extrusion</text>
        <text x="365" y="200" fontSize="10" textAnchor="middle" letterSpacing="2" transform="rotate(-90 365 200)">MAIN AISLE</text>
        <text x={ENTRANCE.x} y="597" fontSize="11" textAnchor="middle" fontWeight="600">Entrance</text>
      </g>

      {/* Line 2 as a flow: extruder, vacuum tank, haul-off and saw, coiler */}
      {has("EXL-201") && (
        <g>
          <path
            d={`M 565 200 L ${has("CLR-204") ? 862 : 820} 200`}
            stroke="hsl(var(--primary))"
            strokeWidth="5"
            strokeLinecap="round"
            markerEnd="url(#flow-arrow)"
            opacity="0.55"
          />
          <text x="414" y="82" fontSize="11" fill={LABEL} fontFamily="ui-sans-serif, system-ui">
            Line 2: pipe runs left to right
          </text>
        </g>
      )}
      {/* Granulate feed: dryer to mixer to extruder hopper (overhead) */}
      {has("DRY-102") && has("MXR-101") && (
        <path d="M 144 168 L 212 168" stroke={LABEL} strokeWidth="1.5" strokeDasharray="4 4" fill="none" markerEnd="url(#feed-arrow)" />
      )}
      {has("MXR-101") && has("EXL-201") && (
        <path
          d="M 292 176 L 452 176"
          stroke={LABEL}
          strokeWidth="1.5"
          strokeDasharray="4 4"
          fill="none"
          markerEnd="url(#feed-arrow)"
        />
      )}

      {/* Plant name and legend */}
      <g fontFamily="ui-sans-serif, system-ui">
        <text x="20" y="27" fontSize="17" fontWeight="700" fill="hsl(var(--foreground))">
          {plantName}
        </text>
        <text x="980" y="27" fontSize="11" textAnchor="end" fill={LABEL}>
          {siteCode ? `Site ${siteCode} · ` : ""}ground floor · not to scale
        </text>
      </g>
      <Legend />
    </g>
  )
})

function Legend() {
  const x = 772
  const y = 476
  return (
    <g fontFamily="ui-sans-serif, system-ui" fontSize="10" fill={LABEL}>
      <rect x={x} y={y} width="176" height="74" rx="6" fill="hsl(var(--background) / 0.9)" stroke="hsl(var(--border))" />
      <g transform={`translate(${x + 12} ${y + 16})`}>
        <rect x="-5" y="-5" width="10" height="10" rx="2" fill="#fff" stroke="hsl(var(--foreground) / 0.6)" />
        <text x="12" y="3.5">Asset with its QR code</text>
      </g>
      <g transform={`translate(${x + 12} ${y + 33})`}>
        <circle r="5" fill="hsl(var(--primary))" stroke="#fff" strokeWidth="1.5" />
        <text x="12" y="3.5">You</text>
        <line x1="54" x2="80" y1="0" y2="0" stroke={AISLE} strokeWidth="2" strokeDasharray="6 4" />
        <text x="86" y="3.5">Aisle</text>
      </g>
      <g transform={`translate(${x + 12} ${y + 52})`}>
        <line x1="-6" x2="6" y1="0" y2="0" stroke="hsl(var(--primary))" strokeWidth="4" opacity="0.55" strokeLinecap="round" />
        <text x="12" y="3.5">Pipe flow</text>
        <line x1="54" x2="80" y1="0" y2="0" stroke={LABEL} strokeWidth="1.5" strokeDasharray="3 3" />
        <text x="86" y="3.5">Granulate feed</text>
      </g>
    </g>
  )
}

/** A top view of one machine, so the plan reads as a plant. */
export function MachineGlyph({
  shape,
  at,
  tone,
}: {
  shape: MachineShape
  at: Pt
  tone: "idle" | "here" | "done" | "wrong"
}) {
  const fill =
    tone === "done"
      ? "hsl(152 60% 92%)"
      : tone === "wrong"
        ? "hsl(0 85% 94%)"
        : tone === "here"
          ? "hsl(var(--primary) / 0.12)"
          : "hsl(var(--card))"
  const stroke =
    tone === "done"
      ? "hsl(152 60% 38%)"
      : tone === "wrong"
        ? "hsl(0 72% 51%)"
        : tone === "here"
          ? "hsl(var(--primary))"
          : "hsl(var(--foreground) / 0.55)"
  const p = { fill, stroke, strokeWidth: 2 }
  const detail = { fill: "none", stroke, strokeWidth: 1.2, opacity: 0.7 }
  const { x, y } = at
  switch (shape) {
    case "dryer":
      return (
        <g>
          <circle cx={x - 6} cy={y} r="24" {...p} />
          <circle cx={x - 6} cy={y} r="11" {...detail} />
          <rect x={x + 20} y={y - 14} width="18" height="28" rx="2" {...p} />
        </g>
      )
    case "mixer":
      return (
        <g>
          <circle cx={x} cy={y} r="30" {...p} />
          <path d={`M ${x - 16} ${y} L ${x + 16} ${y} M ${x} ${y - 16} L ${x} ${y + 16}`} {...detail} />
          <rect x={x + 30} y={y + 6} width="16" height="20" rx="2" {...p} />
        </g>
      )
    case "extruder":
      return (
        <g>
          <rect x={x - 62} y={y - 15} width="124" height="30" rx="4" {...p} />
          {[-40, -24, -8, 8, 24].map((dx) => (
            <line key={dx} x1={x + dx} x2={x + dx} y1={y - 15} y2={y + 15} {...detail} />
          ))}
          <rect x={x - 46} y={y - 32} width="22" height="17" rx="2" {...p} />
          <circle cx={x + 62} cy={y} r="9" {...p} />
        </g>
      )
    case "tank":
      return (
        <g>
          <rect x={x - 52} y={y - 17} width="104" height="34" rx="10" {...p} />
          <line x1={x - 44} x2={x + 44} y1={y} y2={y} {...detail} />
        </g>
      )
    case "saw":
      return (
        <g>
          <rect x={x - 46} y={y - 18} width="56" height="36" rx="3" {...p} />
          <path d={`M ${x - 40} ${y - 8} L ${x + 4} ${y - 8} M ${x - 40} ${y + 8} L ${x + 4} ${y + 8}`} {...detail} />
          <rect x={x + 14} y={y - 20} width="32" height="40" rx="4" {...p} />
          <circle cx={x + 30} cy={y} r="10" {...detail} />
        </g>
      )
    case "coiler":
      return (
        <g>
          <circle cx={x} cy={y} r="36" {...p} />
          <circle cx={x} cy={y} r="24" {...detail} />
          <circle cx={x} cy={y} r="12" {...detail} />
        </g>
      )
    case "bench":
      return (
        <g>
          <rect x={x - 80} y={y - 18} width="160" height="36" rx="3" {...p} />
          <rect x={x - 12} y={y - 9} width="24" height="18" rx="3" {...detail} />
          <circle cx={x - 50} cy={y} r="5" {...detail} />
          <circle cx={x + 50} cy={y} r="5" {...detail} />
        </g>
      )
    default:
      return <rect x={x - 26} y={y - 22} width="52" height="44" rx="4" {...p} />
  }
}
