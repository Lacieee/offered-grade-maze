/**
 * Autopilot path planning (CP10 A3): A* over a room's 0.25 m grid of free cells. Pure (no
 * Three.js, no DOM), so it is unit-tested directly.
 *
 * A cell is free when the player's circle at its centre touches no collider. Walls, jambs
 * and sealed doors (segments) block at the player's radius; furniture (boxes) is inflated by
 * one more cell, so the path keeps a margin and does not scrape along furniture.
 */
import { PLAYER_RADIUS } from '@ogm/shared';
import { circleContact, type Collider } from '../player/physics.js';

/** Grid cell size (m). */
export const CELL = 0.25;

export interface Point {
  x: number;
  z: number;
}

/** Free cells of a room footprint (centred on the room origin, like every room). */
export interface Grid {
  /** Centre of cell (0, 0). */
  x0: number;
  z0: number;
  cols: number;
  rows: number;
  /** 1 = free, row-major (`row * cols + col`). */
  free: Uint8Array;
}

/** The free-cell grid of a `width` × `depth` room with `colliders`. */
export function buildGrid(
  room: { width: number; depth: number; colliders: readonly Collider[] },
  radius = PLAYER_RADIUS,
  /** Extra clearance around furniture (m): one cell by default. */
  furnitureMargin = CELL,
): Grid {
  const cols = Math.max(1, Math.floor(room.width / CELL));
  const rows = Math.max(1, Math.floor(room.depth / CELL));
  const x0 = -((cols - 1) * CELL) / 2;
  const z0 = -((rows - 1) * CELL) / 2;
  const free = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * CELL;
      const z = z0 + r * CELL;
      const blocked = room.colliders.some(
        (col) =>
          circleContact(
            x,
            z,
            col.kind === 'box' ? radius + furnitureMargin : radius + 0.02,
            col,
          ) !== null,
      );
      free[r * cols + c] = blocked ? 0 : 1;
    }
  }
  return { x0, z0, cols, rows, free };
}

const centre = (g: Grid, c: number, r: number): Point => ({
  x: g.x0 + c * CELL,
  z: g.z0 + r * CELL,
});

const isFree = (g: Grid, c: number, r: number): boolean =>
  c >= 0 && r >= 0 && c < g.cols && r < g.rows && g.free[r * g.cols + c] === 1;

/** The free cell nearest to `p` (breadth-first from p's cell), or null if none is free. */
export function nearestFree(g: Grid, p: Point): [number, number] | null {
  const c0 = Math.min(g.cols - 1, Math.max(0, Math.round((p.x - g.x0) / CELL)));
  const r0 = Math.min(g.rows - 1, Math.max(0, Math.round((p.z - g.z0) / CELL)));
  if (isFree(g, c0, r0)) return [c0, r0];
  const seen = new Uint8Array(g.cols * g.rows);
  const queue: [number, number][] = [[c0, r0]];
  seen[r0 * g.cols + c0] = 1;
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    if (!cell) break;
    const [c, r] = cell;
    for (const [dc, dr] of NEIGHBOURS) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows || seen[nr * g.cols + nc] === 1) {
        continue;
      }
      if (isFree(g, nc, nr)) return [nc, nr];
      seen[nr * g.cols + nc] = 1;
      queue.push([nc, nr]);
    }
  }
  return null;
}

/** 8-connected moves: [dc, dr]. */
const NEIGHBOURS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** A small binary min-heap of cell indices by priority. */
class Heap {
  private readonly items: { i: number; f: number }[] = [];
  get size(): number {
    return this.items.length;
  }
  push(i: number, f: number): void {
    const a = this.items;
    a.push({ i, f });
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      const ap = a[p];
      const ak = a[k];
      if (!ap || !ak || ap.f <= ak.f) break;
      a[p] = ak;
      a[k] = ap;
      k = p;
    }
  }
  pop(): number | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0 && last) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        const am = (): number => a[m]?.f ?? Infinity;
        if ((a[l]?.f ?? Infinity) < am()) m = l;
        if ((a[r]?.f ?? Infinity) < am()) m = r;
        if (m === k) break;
        const ak = a[k];
        const amm = a[m];
        if (!ak || !amm) break;
        a[k] = amm;
        a[m] = ak;
        k = m;
      }
    }
    return top?.i;
  }
}

/** Whether the straight line a → b crosses only free cells (sampled every quarter cell). */
export function lineFree(g: Grid, a: Point, b: Point): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL / 4)));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const c = Math.round((a.x + (b.x - a.x) * t - g.x0) / CELL);
    const r = Math.round((a.z + (b.z - a.z) * t - g.z0) / CELL);
    if (!isFree(g, c, r)) return false;
  }
  return true;
}

/**
 * Waypoints from `from` to `to` (A*, 8-connected without cutting blocked corners, then
 * shortened to the corners that are needed). Ends exactly at `to` when its cell is free,
 * else at the nearest free cell. Null when no route exists.
 */
export function findPath(g: Grid, from: Point, to: Point): Point[] | null {
  const start = nearestFree(g, from);
  const goal = nearestFree(g, to);
  if (!start || !goal) return null;
  const n = g.cols * g.rows;
  const si = start[1] * g.cols + start[0];
  const gi = goal[1] * g.cols + goal[0];
  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const h = (i: number): number => {
    const dc = Math.abs((i % g.cols) - goal[0]);
    const dr = Math.abs(Math.floor(i / g.cols) - goal[1]);
    return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
  };
  const open = new Heap();
  cost[si] = 0;
  open.push(si, h(si));
  while (open.size > 0) {
    const i = open.pop();
    if (i === undefined) break;
    if (closed[i] === 1) continue;
    closed[i] = 1;
    if (i === gi) break;
    const c = i % g.cols;
    const r = Math.floor(i / g.cols);
    for (const [dc, dr] of NEIGHBOURS) {
      const nc = c + dc;
      const nr = r + dr;
      if (!isFree(g, nc, nr)) continue;
      // No diagonal squeeze between two blocked cells.
      if (dc !== 0 && dr !== 0 && (!isFree(g, c + dc, r) || !isFree(g, c, r + dr))) continue;
      const j = nr * g.cols + nc;
      const step = dc !== 0 && dr !== 0 ? Math.SQRT2 : 1;
      const next = (cost[i] ?? Infinity) + step;
      if (next < (cost[j] ?? Infinity)) {
        cost[j] = next;
        prev[j] = i;
        open.push(j, next + h(j));
      }
    }
  }
  if (closed[gi] !== 1) return null;

  const cells: Point[] = [];
  for (let i = gi; i !== -1; i = prev[i] ?? -1) {
    cells.push(centre(g, i % g.cols, Math.floor(i / g.cols)));
    if (i === si) break;
  }
  cells.reverse();
  const goalFree = isFree(g, Math.round((to.x - g.x0) / CELL), Math.round((to.z - g.z0) / CELL));
  if (goalFree) cells[cells.length - 1] = { x: to.x, z: to.z };

  // String pulling: keep only the corners the straight lines need.
  const out: Point[] = [];
  let anchor: Point = from;
  let k = 0;
  while (k < cells.length) {
    let far = k;
    for (let m = cells.length - 1; m > k; m--) {
      const target = cells[m];
      if (target && lineFree(g, anchor, target)) {
        far = m;
        break;
      }
    }
    const p = cells[far];
    if (!p) break;
    out.push(p);
    anchor = p;
    k = far + 1;
  }
  return out;
}
