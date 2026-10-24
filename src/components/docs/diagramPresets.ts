// Curated SVG presets used by DiagramBlock.
//
// Each preset is a self-contained SVG string with `viewBox` set so it scales
// inside the diagram container. Fills use Tailwind-friendly named colors via
// `currentColor` where possible so dark mode looks reasonable. Where we want
// a fixed color, we use named hex values.
//
// Adding a new preset: add an entry, give it a unique key, write the SVG.
// The DiagramPicker will surface it automatically.

export interface DiagramPreset {
  label: string
  defaultCaption: string
  svg: string
}

const PROCESS_FLOW = `
<svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto">
  <defs>
    <marker id="pf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#475569"/>
    </marker>
  </defs>
  <g font-family="ui-sans-serif, system-ui" font-size="13" text-anchor="middle">
    <rect x="20" y="70" width="100" height="60" rx="6" fill="#dbeafe" stroke="#1d4ed8" stroke-width="1.5"/>
    <text x="70" y="95" fill="#1e3a8a" font-weight="600">Reception</text>
    <text x="70" y="112" fill="#1e3a8a" font-size="11">RMR-101</text>

    <rect x="160" y="70" width="100" height="60" rx="6" fill="#fef3c7" stroke="#b45309" stroke-width="1.5"/>
    <text x="210" y="95" fill="#78350f" font-weight="600">Mixer</text>
    <text x="210" y="112" fill="#78350f" font-size="11">FCK-102</text>

    <rect x="300" y="70" width="100" height="60" rx="6" fill="#dcfce7" stroke="#15803d" stroke-width="1.5"/>
    <text x="350" y="95" fill="#14532d" font-weight="600">Mill</text>
    <text x="350" y="112" fill="#14532d" font-size="11">FCK-103</text>

    <rect x="440" y="70" width="100" height="60" rx="6" fill="#ede9fe" stroke="#6d28d9" stroke-width="1.5"/>
    <text x="490" y="95" fill="#4c1d95" font-weight="600">Press</text>
    <text x="490" y="112" fill="#4c1d95" font-size="11">FRT-201</text>

    <line x1="120" y1="100" x2="160" y2="100" stroke="#475569" stroke-width="2" marker-end="url(#pf-arrow)"/>
    <line x1="260" y1="100" x2="300" y2="100" stroke="#475569" stroke-width="2" marker-end="url(#pf-arrow)"/>
    <line x1="400" y1="100" x2="440" y2="100" stroke="#475569" stroke-width="2" marker-end="url(#pf-arrow)"/>
  </g>
</svg>
`

const JAM_DECISION_TREE = `
<svg viewBox="0 0 520 360" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto">
  <defs>
    <marker id="dt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#475569"/>
    </marker>
  </defs>
  <g font-family="ui-sans-serif, system-ui" font-size="12" text-anchor="middle">
    <rect x="190" y="10" width="140" height="44" rx="6" fill="#fee2e2" stroke="#b91c1c" stroke-width="1.5"/>
    <text x="260" y="36" fill="#7f1d1d" font-weight="600">Mill current &gt; 110%?</text>

    <rect x="40" y="100" width="160" height="44" rx="6" fill="#fef3c7" stroke="#b45309"/>
    <text x="120" y="126" fill="#78350f">Continue normal operation</text>

    <rect x="320" y="100" width="160" height="44" rx="6" fill="#dbeafe" stroke="#1d4ed8"/>
    <text x="400" y="126" fill="#1e3a8a">Stop feed conveyor</text>

    <rect x="320" y="180" width="160" height="44" rx="6" fill="#dbeafe" stroke="#1d4ed8"/>
    <text x="400" y="206" fill="#1e3a8a">Reverse 5s + fwd 50% 10s</text>

    <rect x="320" y="260" width="160" height="44" rx="6" fill="#fee2e2" stroke="#b91c1c" stroke-width="1.5"/>
    <text x="400" y="280" fill="#7f1d1d" font-weight="600">Jam cleared?</text>
    <text x="400" y="295" fill="#7f1d1d" font-size="10">Yes → resume · No → LOTO</text>

    <line x1="220" y1="54" x2="120" y2="100" stroke="#475569" stroke-width="2" marker-end="url(#dt-arrow)"/>
    <text x="160" y="78" fill="#475569">No</text>

    <line x1="300" y1="54" x2="400" y2="100" stroke="#475569" stroke-width="2" marker-end="url(#dt-arrow)"/>
    <text x="370" y="78" fill="#475569">Yes</text>

    <line x1="400" y1="144" x2="400" y2="180" stroke="#475569" stroke-width="2" marker-end="url(#dt-arrow)"/>
    <line x1="400" y1="224" x2="400" y2="260" stroke="#475569" stroke-width="2" marker-end="url(#dt-arrow)"/>
  </g>
</svg>
`

const PRESS_CROSS_SECTION = `
<svg viewBox="0 0 540 260" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto">
  <g font-family="ui-sans-serif, system-ui" font-size="12">
    <rect x="40" y="40" width="460" height="160" rx="10" fill="#f1f5f9" stroke="#334155" stroke-width="1.5"/>
    <text x="270" y="30" text-anchor="middle" fill="#334155" font-weight="600">Briquette Press FRT-201: cross-section</text>

    <rect x="80" y="80" width="120" height="80" rx="4" fill="#cbd5e1" stroke="#475569"/>
    <text x="140" y="125" text-anchor="middle" fill="#1e293b">Hopper</text>

    <rect x="220" y="100" width="100" height="40" rx="20" fill="#a78bfa" stroke="#6d28d9"/>
    <text x="270" y="125" text-anchor="middle" fill="#3b0764" font-weight="600">Ring die</text>

    <rect x="340" y="80" width="120" height="80" rx="4" fill="#fde68a" stroke="#b45309"/>
    <text x="400" y="125" text-anchor="middle" fill="#78350f">Briquette outlet</text>

    <line x1="200" y1="120" x2="220" y2="120" stroke="#334155" stroke-width="2"/>
    <line x1="320" y1="120" x2="340" y2="120" stroke="#334155" stroke-width="2"/>

    <circle cx="270" cy="200" r="8" fill="#ef4444"/>
    <text x="285" y="205" fill="#7f1d1d" font-weight="600">Hot zone: do not touch</text>
  </g>
</svg>
`

const SITE_MAP = `
<svg viewBox="0 0 600 360" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto">
  <g font-family="ui-sans-serif, system-ui" font-size="11">
    <rect x="20" y="40" width="560" height="280" rx="6" fill="#f8fafc" stroke="#334155"/>
    <text x="300" y="30" text-anchor="middle" fill="#334155" font-weight="600">Pigment Calcination Site Map</text>

    <rect x="40" y="60" width="180" height="100" fill="#e0f2fe" stroke="#0369a1"/>
    <text x="130" y="100" text-anchor="middle" fill="#075985" font-weight="600">Hall A</text>
    <text x="130" y="120" text-anchor="middle" fill="#075985">FCK-102 Mixer</text>

    <rect x="240" y="60" width="180" height="100" fill="#dcfce7" stroke="#15803d"/>
    <text x="330" y="100" text-anchor="middle" fill="#14532d" font-weight="600">Hall B</text>
    <text x="330" y="120" text-anchor="middle" fill="#14532d">FCK-103 · FRT-201</text>

    <rect x="440" y="60" width="120" height="100" fill="#fef3c7" stroke="#b45309"/>
    <text x="500" y="100" text-anchor="middle" fill="#78350f" font-weight="600">Hall C</text>
    <text x="500" y="120" text-anchor="middle" fill="#78350f">FRT-202 · STR-301</text>

    <rect x="40" y="200" width="180" height="100" fill="#fce7f3" stroke="#9d174d"/>
    <text x="130" y="240" text-anchor="middle" fill="#831843" font-weight="600">Yard, North</text>
    <text x="130" y="260" text-anchor="middle" fill="#831843">RMR-101 Reception</text>

    <circle cx="500" cy="240" r="20" fill="#22c55e" stroke="#15803d" stroke-width="2"/>
    <text x="500" y="245" text-anchor="middle" fill="white" font-weight="700">M</text>
    <text x="500" y="280" text-anchor="middle" fill="#14532d" font-size="10">Muster Point</text>

    <path d="M 130 160 L 130 200" stroke="#dc2626" stroke-width="3" fill="none" stroke-dasharray="6 3"/>
    <path d="M 330 160 L 330 220 L 480 240" stroke="#dc2626" stroke-width="3" fill="none" stroke-dasharray="6 3"/>
    <path d="M 500 160 L 500 220" stroke="#dc2626" stroke-width="3" fill="none" stroke-dasharray="6 3"/>
    <text x="220" y="190" fill="#7f1d1d" font-weight="600">Evacuation route</text>
  </g>
</svg>
`

const HAZARD_PICTOGRAM = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto">
  <g font-family="ui-sans-serif, system-ui">
    <polygon points="100,20 180,170 20,170" fill="#fde047" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
    <text x="100" y="120" text-anchor="middle" font-size="80" font-weight="900" fill="#000">!</text>
    <text x="100" y="195" text-anchor="middle" font-size="14" fill="#1e293b" font-weight="600">General Hazard</text>
  </g>
</svg>
`

const KILN_STACKING = `
<svg viewBox="0 0 540 240" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto">
  <g font-family="ui-sans-serif, system-ui" font-size="11">
    <text x="270" y="22" text-anchor="middle" fill="#334155" font-weight="600">
      Setter stacking pattern: 5 layers, offset
    </text>
    <g stroke="#334155" stroke-width="1" fill="#fde68a">
      <rect x="60" y="40" width="60" height="20"/><rect x="130" y="40" width="60" height="20"/><rect x="200" y="40" width="60" height="20"/><rect x="270" y="40" width="60" height="20"/><rect x="340" y="40" width="60" height="20"/><rect x="410" y="40" width="60" height="20"/>
      <rect x="90" y="65" width="60" height="20"/><rect x="160" y="65" width="60" height="20"/><rect x="230" y="65" width="60" height="20"/><rect x="300" y="65" width="60" height="20"/><rect x="370" y="65" width="60" height="20"/>
      <rect x="60" y="90" width="60" height="20"/><rect x="130" y="90" width="60" height="20"/><rect x="200" y="90" width="60" height="20"/><rect x="270" y="90" width="60" height="20"/><rect x="340" y="90" width="60" height="20"/><rect x="410" y="90" width="60" height="20"/>
      <rect x="90" y="115" width="60" height="20"/><rect x="160" y="115" width="60" height="20"/><rect x="230" y="115" width="60" height="20"/><rect x="300" y="115" width="60" height="20"/><rect x="370" y="115" width="60" height="20"/>
      <rect x="60" y="140" width="60" height="20"/><rect x="130" y="140" width="60" height="20"/><rect x="200" y="140" width="60" height="20"/><rect x="270" y="140" width="60" height="20"/><rect x="340" y="140" width="60" height="20"/><rect x="410" y="140" width="60" height="20"/>
    </g>
    <line x1="40" y1="180" x2="500" y2="180" stroke="#1e293b" stroke-width="2"/>
    <text x="270" y="200" text-anchor="middle" fill="#475569">Charge weight target: 1,200 kg ± 25 kg per setter</text>
  </g>
</svg>
`

export const DIAGRAM_PRESETS = {
  "process-flow": {
    label: "Process flow: line overview",
    defaultCaption: "Pigment line flow: Reception → Mixer → Mill → Press.",
    svg: PROCESS_FLOW,
  },
  "jam-decision": {
    label: "Jam recovery decision tree",
    defaultCaption: "Decision flow when mill current exceeds 110%.",
    svg: JAM_DECISION_TREE,
  },
  "press-cross-section": {
    label: "Press cross-section",
    defaultCaption: "Briquette press FRT-201 cross-section.",
    svg: PRESS_CROSS_SECTION,
  },
  "site-map": {
    label: "Site map with evacuation routes",
    defaultCaption: "Site map with evacuation routes and muster point.",
    svg: SITE_MAP,
  },
  "hazard-pictogram": {
    label: "Hazard pictogram",
    defaultCaption: "General hazard warning.",
    svg: HAZARD_PICTOGRAM,
  },
  "kiln-stacking": {
    label: "Kiln setter stacking",
    defaultCaption: "Setter stacking pattern: 5 layers, offset.",
    svg: KILN_STACKING,
  },
} as const

export type DiagramPresetKey = keyof typeof DIAGRAM_PRESETS
