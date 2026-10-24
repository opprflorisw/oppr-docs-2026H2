// The plant floor of Pijpwerk Noord, drawn in code (viewBox 1000 x 600).
// Machines are placed by Asset code; an Asset the plan does not know gets a
// free spot in Hall 2. A person walks along the aisles: a small graph of
// waypoints, with every Asset's standing spot hanging off it.

export const VIEW_W = 1000
export const VIEW_H = 600

export interface Pt {
  x: number
  y: number
}

export type MachineShape = "dryer" | "mixer" | "extruder" | "tank" | "saw" | "coiler" | "bench" | "generic"

export interface Spot {
  /** Centre of the machine's footprint. */
  at: Pt
  /** Where a person stands to Scan it (on an aisle). */
  stand: Pt
  shape: MachineShape
}

export const ENTRANCE: Pt = { x: 365, y: 572 }

// Aisle centre lines.
const CORRIDOR_X = 365
const HALL1_AISLE_Y = 262
const HALL2_AISLE_Y = 330
const LAB_AISLE_Y = 505

export const KNOWN: Record<string, Spot> = {
  "DRY-102": { at: { x: 110, y: 160 }, stand: { x: 110, y: HALL1_AISLE_Y }, shape: "dryer" },
  "MXR-101": { at: { x: 245, y: 160 }, stand: { x: 245, y: HALL1_AISLE_Y }, shape: "mixer" },
  "EXL-201": { at: { x: 505, y: 200 }, stand: { x: 505, y: HALL2_AISLE_Y }, shape: "extruder" },
  "VAC-203": { at: { x: 655, y: 200 }, stand: { x: 655, y: HALL2_AISLE_Y }, shape: "tank" },
  "SAW-202": { at: { x: 785, y: 200 }, stand: { x: 785, y: HALL2_AISLE_Y }, shape: "saw" },
  "CLR-204": { at: { x: 900, y: 196 }, stand: { x: 900, y: HALL2_AISLE_Y }, shape: "coiler" },
  "QCL-301": { at: { x: 175, y: 430 }, stand: { x: 175, y: LAB_AISLE_Y }, shape: "bench" },
}

// Free spots for Assets the plan does not know (Hall 2, below the aisle).
const SPARE_X = [480, 590, 700, 810, 920]
const SPARE_Y = 430

export interface Placed {
  id: string
  code: string
  spot: Spot
  known: boolean
}

export function placeAssets<T extends { _id: string; code: string }>(assets: T[]): Placed[] {
  let spare = 0
  return assets.map((a) => {
    const k = KNOWN[a.code]
    if (k) return { id: a._id, code: a.code, spot: k, known: true }
    const i = spare++
    const x = SPARE_X[i % SPARE_X.length]
    const y = SPARE_Y + Math.floor(i / SPARE_X.length) * 70
    return {
      id: a._id,
      code: a.code,
      spot: { at: { x, y }, stand: { x, y: HALL2_AISLE_Y }, shape: "generic" },
      known: false,
    }
  })
}

// ---- Walking ----------------------------------------------------------------------

interface Graph {
  nodes: Pt[]
  edges: number[][]
}

/** The aisle graph, with every placed Asset's standing spot joined to its aisle. */
function buildGraph(placed: Placed[]): { graph: Graph; standNode: Map<string, number>; entrance: number } {
  const nodes: Pt[] = []
  const edges: number[][] = []
  const add = (p: Pt) => {
    const found = nodes.findIndex((n) => n.x === p.x && n.y === p.y)
    if (found >= 0) return found
    nodes.push(p)
    edges.push([])
    return nodes.length - 1
  }
  const link = (a: number, b: number) => {
    if (a === b || edges[a].includes(b)) return
    edges[a].push(b)
    edges[b].push(a)
  }
  const chain = (pts: Pt[]) => {
    const ids = pts.map(add)
    for (let i = 1; i < ids.length; i++) link(ids[i - 1], ids[i])
  }

  const entrance = add(ENTRANCE)
  const c1 = add({ x: CORRIDOR_X, y: HALL1_AISLE_Y })
  const c2 = add({ x: CORRIDOR_X, y: HALL2_AISLE_Y })
  const c3 = add({ x: CORRIDOR_X, y: LAB_AISLE_Y })
  chain([ENTRANCE, nodes[c3], nodes[c2], nodes[c1]])

  // Each aisle runs from its door; standing spots sit on it, ordered by distance.
  const aisles: { door: Pt; from: number; y: number; dir: 1 | -1; region: (p: Pt) => boolean }[] = [
    { door: { x: 330, y: HALL1_AISLE_Y }, from: c1, y: HALL1_AISLE_Y, dir: -1, region: (p) => p.x < 340 && p.y < 320 },
    { door: { x: 400, y: HALL2_AISLE_Y }, from: c2, y: HALL2_AISLE_Y, dir: 1, region: (p) => p.x > 390 },
    { door: { x: 330, y: LAB_AISLE_Y }, from: c3, y: LAB_AISLE_Y, dir: -1, region: (p) => p.x < 340 && p.y >= 320 },
  ]
  const standNode = new Map<string, number>()
  for (const aisle of aisles) {
    const door = add(aisle.door)
    link(aisle.from, door)
    const here = placed.filter((p) => aisle.region(p.spot.stand))
    const xs = Array.from(new Set(here.map((p) => p.spot.stand.x))).sort((a, b) => (a - b) * aisle.dir)
    let prev = door
    for (const x of xs) {
      const n = add({ x, y: aisle.y })
      link(prev, n)
      prev = n
    }
    for (const p of here) {
      const onAisle = add({ x: p.spot.stand.x, y: aisle.y })
      const stand = add(p.spot.stand)
      link(onAisle, stand)
      standNode.set(p.id, stand)
    }
  }
  return { graph: { nodes, edges }, standNode, entrance }
}

function shortest(graph: Graph, from: number, to: number): number[] {
  const n = graph.nodes.length
  const dist = new Array<number>(n).fill(Infinity)
  const prev = new Array<number>(n).fill(-1)
  const done = new Array<boolean>(n).fill(false)
  dist[from] = 0
  for (;;) {
    let u = -1
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i
    if (u < 0 || dist[u] === Infinity) break
    if (u === to) break
    done[u] = true
    for (const v of graph.edges[u]) {
      const d = dist[u] + len(graph.nodes[u], graph.nodes[v])
      if (d < dist[v]) {
        dist[v] = d
        prev[v] = u
      }
    }
  }
  if (from !== to && prev[to] < 0) return [from, to]
  const path = [to]
  while (path[0] !== from) path.unshift(prev[path[0]])
  return path
}

export function len(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export interface Walker {
  /** The path along the aisles from where you are (an Asset id, or null for the entrance) to an Asset. */
  route: (fromAssetId: string | null, toAssetId: string) => Pt[]
  standOf: (assetId: string | null) => Pt
}

export function makeWalker(placed: Placed[]): Walker {
  const { graph, standNode, entrance } = buildGraph(placed)
  const nodeOf = (id: string | null) => (id && standNode.has(id) ? standNode.get(id)! : entrance)
  return {
    route: (fromId, toId) => shortest(graph, nodeOf(fromId), nodeOf(toId)).map((i) => graph.nodes[i]),
    standOf: (id) => graph.nodes[nodeOf(id)],
  }
}

/** The point at distance d along a polyline. */
export function pointAt(path: Pt[], d: number): Pt {
  let left = d
  for (let i = 1; i < path.length; i++) {
    const seg = len(path[i - 1], path[i])
    if (left <= seg) {
      const t = seg === 0 ? 0 : left / seg
      return { x: path[i - 1].x + (path[i].x - path[i - 1].x) * t, y: path[i - 1].y + (path[i].y - path[i - 1].y) * t }
    }
    left -= seg
  }
  return path[path.length - 1]
}

export function pathLength(path: Pt[]) {
  let total = 0
  for (let i = 1; i < path.length; i++) total += len(path[i - 1], path[i])
  return total
}
