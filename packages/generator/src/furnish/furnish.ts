/**
 * Furniture placement for one room (CP05 T4). Deterministic: integer cells, quarter turns,
 * randomness only from the room's `room:<tempId>:furnish` stream (and the house's `identity`
 * stream through the signature source).
 */
import {
  DECOR_PREFABS,
  PAINTING_PATTERNS,
  PAINTING_SEED_MAX,
  PREFABS,
  REQUIRED_BY_TYPE,
  optionalPrefabs,
  type FurnitureDTO,
  type PaletteDTO,
  type PrefabId,
  type RoomType,
  type Wall,
} from '@ogm/shared';
import type { Sfc32 } from '../prng/index.js';
import { ACCENTS } from '../identity/palettes.js';
import {
  BLOCK,
  CLEAR,
  FLAT,
  RESERVED,
  RoomGrid,
  doorCentre,
  reservedZones,
  zoneList,
  type Rect,
  type UnitDoor,
} from './grid.js';

/** A room to furnish, in grid units. */
export interface FurnishInput {
  type: RoomType;
  widthU: number;
  depthU: number;
  doors: readonly UnitDoor[];
  isStart: boolean;
  isGoal: boolean;
}

/** One placed item, in cells. */
export interface Placed {
  prefab: PrefabId;
  variant: number;
  rot: number;
  rect: Rect;
  colors: string[];
  params?: Record<string, number | string>;
  signature: boolean;
}

/** An item to place. */
export interface ItemSpec {
  prefab: PrefabId;
  colors: string[];
  params?: Record<string, number | string>;
  signature: boolean;
}

/** Probability of each optional item (CP05 T4 step 2). */
export const OPTIONAL_PER_MILLE = 600;
/** Maximum optional items per room. */
export const MAX_OPTIONAL = 4;
/** Candidates tried per item before giving up. */
export const MAX_CANDIDATES = 200;
/** Centre items stay ≥ 1.0 m (4 cells) from every wall. */
export const CENTER_MARGIN = 4;
/** Door opening ± 0.1 m along the wall, in cells: [c − 3, c + 3) (see `doorCentre`). */
const DOOR_SPAN_HALF = 3;
/** Door height in cm (wall-hung items stay clear of door openings). */
const DOOR_TOP_CM = 210;

/** Height in whole centimetres (integer comparisons). */
function cm(m: number): number {
  return Math.round(m * 100);
}

/** A vertical band on one wall: cells [a, b) along the wall, heights [y0, y1) in cm. */
interface WallBand {
  wall: Wall;
  a: number;
  b: number;
  y0: number;
  y1: number;
}

/** Walls a rectangle touches, with its span along each. */
function wallSpans(W: number, D: number, r: Rect): { wall: Wall; a: number; b: number }[] {
  const out: { wall: Wall; a: number; b: number }[] = [];
  if (r.z0 === 0) out.push({ wall: 'N', a: r.x0, b: r.x0 + r.w });
  if (r.z0 + r.d === D) out.push({ wall: 'S', a: r.x0, b: r.x0 + r.w });
  if (r.x0 === 0) out.push({ wall: 'W', a: r.z0, b: r.z0 + r.d });
  if (r.x0 + r.w === W) out.push({ wall: 'E', a: r.z0, b: r.z0 + r.d });
  return out;
}

/** Height band of a prefab in cm: wall-hung items around their mount height. */
function bandOf(prefab: PrefabId): { y0: number; y1: number } {
  const m = PREFABS[prefab];
  if (m.mountY === undefined) return { y0: 0, y1: cm(m.height) };
  return { y0: cm(m.mountY - m.height / 2), y1: cm(m.mountY + m.height / 2) };
}

/** Front-clearance rectangle in front of an item. */
function clearanceRect(r: Rect, rot: number, depth: number): Rect | null {
  if (depth === 0) return null;
  switch (rot) {
    case 0:
      return { x0: r.x0, z0: r.z0 + r.d, w: r.w, d: depth };
    case 1:
      return { x0: r.x0 + r.w, z0: r.z0, w: depth, d: r.d };
    case 2:
      return { x0: r.x0, z0: r.z0 - depth, w: r.w, d: depth };
    default:
      return { x0: r.x0 - depth, z0: r.z0, w: depth, d: r.d };
  }
}

/** A placement candidate. */
interface Candidate {
  variant: number;
  rot: number;
  rect: Rect;
}

/** Every candidate for a prefab in a W × D room (CP05 T4 step 4), in a fixed order. */
export function candidates(prefab: PrefabId, W: number, D: number): Candidate[] {
  const meta = PREFABS[prefab];
  const out: Candidate[] = [];
  meta.footprint.forEach(([fw, fd], variant) => {
    const push = (rot: number, x0: number, z0: number, w: number, d: number): void => {
      if (x0 >= 0 && z0 >= 0 && x0 + w <= W && z0 + d <= D)
        out.push({ variant, rot, rect: { x0, z0, w, d } });
    };
    for (const anchor of meta.anchors) {
      switch (anchor) {
        case 'wall':
        case 'wallHung':
          for (let x = 0; x + fw <= W; x++) {
            push(0, x, 0, fw, fd);
            push(2, x, D - fd, fw, fd);
          }
          for (let z = 0; z + fw <= D; z++) {
            push(1, 0, z, fd, fw);
            push(3, W - fd, z, fd, fw);
          }
          break;
        case 'corner':
          // Back to one wall, side to the other, facing into the room.
          push(0, 0, 0, fw, fd);
          push(1, 0, 0, fd, fw);
          push(0, W - fw, 0, fw, fd);
          push(3, W - fd, 0, fd, fw);
          push(2, 0, D - fd, fw, fd);
          push(1, 0, D - fw, fd, fw);
          push(2, W - fw, D - fd, fw, fd);
          push(3, W - fd, D - fw, fd, fw);
          break;
        case 'center':
          for (let rot = 0; rot < 4; rot++) {
            const w = rot % 2 === 0 ? fw : fd;
            const d = rot % 2 === 0 ? fd : fw;
            for (let z = CENTER_MARGIN; z + d <= D - CENTER_MARGIN; z++) {
              for (let x = CENTER_MARGIN; x + w <= W - CENTER_MARGIN; x++) push(rot, x, z, w, d);
            }
          }
          break;
        case 'floorFlat':
          for (let rot = 0; rot < 4; rot++) {
            const w = rot % 2 === 0 ? fw : fd;
            const d = rot % 2 === 0 ? fd : fw;
            for (let z = 0; z + d <= D; z++) {
              for (let x = 0; x + w <= W; x++) push(rot, x, z, w, d);
            }
          }
          break;
      }
    }
  });
  return out;
}

/**
 * Items that belong next to another (plausibility, ADR-0006): they first try positions within
 * `gap` cells of a placed partner — nightstands and side tables beside the bed or sofa, the
 * stove and fridge beside the counter, the coffee table within 1 m of the sofa.
 */
export const NEAR: Partial<Record<PrefabId, { partners: readonly PrefabId[]; gap: number }>> = {
  nightstand: { partners: ['bed_double'], gap: 0 },
  side_table: { partners: ['sofa_3seat', 'bed_double', 'armchair'], gap: 0 },
  stove: { partners: ['counter_run'], gap: 0 },
  fridge: { partners: ['counter_run', 'stove'], gap: 0 },
  coffee_table: { partners: ['sofa_3seat'], gap: 4 },
  filing_cabinet: { partners: ['desk_set'], gap: 0 },
};

/** Cells between two rectangles (0 when they touch or overlap). */
export function gap(a: Rect, b: Rect): number {
  const dx = Math.max(b.x0 - (a.x0 + a.w), a.x0 - (b.x0 + b.w), 0);
  const dz = Math.max(b.z0 - (a.z0 + a.d), a.z0 - (b.z0 + b.d), 0);
  return Math.max(dx, dz);
}

/** Placement state of one room. */
export class RoomPlacer {
  readonly grid: RoomGrid;
  readonly zones: Rect[];
  readonly placed: Placed[] = [];
  private readonly bands: WallBand[] = [];
  private readonly hung: WallBand[] = [];

  constructor(readonly input: FurnishInput) {
    const W = input.widthU;
    const D = input.depthU;
    this.grid = new RoomGrid(W, D);
    const z = reservedZones(W, D, input.doors, input.isStart, input.isGoal);
    this.zones = zoneList(z);
    for (const r of this.zones) this.grid.mark(r, RESERVED);
    for (const door of input.doors) {
      const c = doorCentre(W, D, door);
      this.hung.push({
        wall: door.wall,
        a: c - DOOR_SPAN_HALF,
        b: c + DOOR_SPAN_HALF,
        y0: 0,
        y1: DOOR_TOP_CM,
      });
    }
  }

  /** True when the band overlaps any of `list` on the same wall. */
  private static clash(list: readonly WallBand[], band: WallBand): boolean {
    return list.some(
      (o) =>
        o.wall === band.wall && o.a < band.b && band.a < o.b && o.y0 < band.y1 && band.y0 < o.y1,
    );
  }

  /** Checks a candidate for an item (CP05 T4 step 5, 6). */
  fits(prefab: PrefabId, c: Candidate): boolean {
    const meta = PREFABS[prefab];
    const { W, D } = this.grid;
    const band = bandOf(prefab);
    const spans = wallSpans(W, D, c.rect).map((s) => ({ ...s, ...band }));
    if (meta.anchors.includes('wallHung')) {
      // Wall length must be free of doors, other hung items and tall furniture.
      return spans.every(
        (s) => !RoomPlacer.clash(this.hung, s) && !RoomPlacer.clash(this.bands, s),
      );
    }
    if (!meta.blocks) {
      // Rugs: anywhere not under a blocking item or another rug.
      return this.grid.free(c.rect, BLOCK | FLAT);
    }
    if (!this.grid.free(c.rect, BLOCK | RESERVED | CLEAR)) return false;
    const clear = clearanceRect(c.rect, c.rot, meta.frontClearance);
    if (clear !== null && (!this.grid.inside(clear) || !this.grid.free(clear, BLOCK))) return false;
    if (spans.some((s) => RoomPlacer.clash(this.hung, s))) return false;
    return this.grid.walkable(this.zones, c.rect);
  }

  /** Records an item. */
  commit(item: ItemSpec, c: Candidate): Placed {
    const meta = PREFABS[item.prefab];
    const { W, D } = this.grid;
    const band = bandOf(item.prefab);
    const spans = wallSpans(W, D, c.rect).map((s) => ({ ...s, ...band }));
    if (meta.anchors.includes('wallHung')) this.hung.push(...spans);
    else if (!meta.blocks) this.grid.mark(c.rect, FLAT);
    else {
      this.grid.mark(c.rect, BLOCK);
      const clear = clearanceRect(c.rect, c.rot, meta.frontClearance);
      if (clear !== null) this.grid.mark(clear, CLEAR);
      this.bands.push(...spans);
    }
    const placed: Placed = { ...item, variant: c.variant, rot: c.rot, rect: c.rect };
    this.placed.push(placed);
    return placed;
  }

  /**
   * Tries up to {@link MAX_CANDIDATES} candidates in a lazily shuffled order (a partial
   * Fisher–Yates: the same distribution as shuffling the whole list). Items with a partner
   * (see {@link NEAR}) first try the candidates close to an already placed partner.
   */
  place(rng: Sfc32, item: ItemSpec): Placed | null {
    const all = candidates(item.prefab, this.grid.W, this.grid.D);
    const near = NEAR[item.prefab];
    if (near !== undefined) {
      const partners = this.placed
        .filter((p) => near.partners.includes(p.prefab))
        .map((p) => p.rect);
      const close = all.filter((c) => partners.some((r) => gap(c.rect, r) <= near.gap));
      const hit = this.tryList(rng, item, close);
      if (hit !== null) return hit;
    }
    return this.tryList(rng, item, all);
  }

  private tryList(rng: Sfc32, item: ItemSpec, list: Candidate[]): Placed | null {
    const n = list.length;
    for (let k = 0; k < Math.min(n, MAX_CANDIDATES); k++) {
      const j = rng.int(k, n - 1);
      // Both indices are within the list.
      const pick = list[j] as Candidate;
      list[j] = list[k] as Candidate;
      list[k] = pick;
      if (this.fits(item.prefab, pick)) return this.commit(item, pick);
    }
    return null;
  }

  /** Re-applies an already placed item (twins copy their original's furniture). */
  replay(p: Placed): void {
    this.commit(p, { variant: p.variant, rot: p.rot, rect: p.rect });
  }
}

/** Draws `n` colours for an item from the room type's accents and the palette's trim. */
export function itemColors(rng: Sfc32, type: RoomType, palette: PaletteDTO, n: number): string[] {
  const pool = [...ACCENTS[type], palette.trim];
  return Array.from({ length: n }, () => rng.pick(pool));
}

/** Larger maximum footprint first; catalogue order breaks ties (stable sort). */
function bySize(a: PrefabId, b: PrefabId): number {
  const area = (id: PrefabId): number => Math.max(...PREFABS[id].footprint.map(([w, d]) => w * d));
  return area(b) - area(a);
}

/** Items chosen for a room, in placement groups. */
export interface ItemChoice {
  /**
   * Required items; each entry lists alternatives in the order to try. A `oneOf` group
   * (bathroom: bathtub or shower) starts with its drawn choice and falls back to the others.
   */
  required: PrefabId[][];
  optional: PrefabId[];
  decor: PrefabId[];
}

/** CP05 T4 step 2: required (one of each `oneOf` group), optional (600 ‰, max 4), decor (1–3). */
export function chooseItems(rng: Sfc32, type: RoomType): ItemChoice {
  const required: PrefabId[][] = [];
  const groups = new Map<string, PrefabId[]>();
  for (const id of REQUIRED_BY_TYPE[type]) {
    const group = PREFABS[id].oneOf;
    if (group === undefined) required.push([id]);
    else groups.set(group, [...(groups.get(group) ?? []), id]);
  }
  for (const group of [...groups.keys()].sort()) {
    const options = groups.get(group) ?? [];
    const first = rng.pick(options);
    required.push([first, ...options.filter((o) => o !== first)]);
  }
  const optional = rng
    .shuffle(optionalPrefabs(type))
    .filter(() => rng.chance(OPTIONAL_PER_MILLE))
    .slice(0, MAX_OPTIONAL);
  const decor = rng.shuffle(DECOR_PREFABS).slice(0, rng.int(1, 3));
  return {
    required: [...required].sort((a, b) => bySize(a[0] as PrefabId, b[0] as PrefabId)),
    optional: [...optional].sort(bySize),
    decor: [...decor].sort(bySize),
  };
}

/** Painting parameters (`params.pattern`, `params.seed`). */
export function paintingParams(rng: Sfc32): { pattern: string; seed: number } {
  return { pattern: rng.pick(PAINTING_PATTERNS), seed: rng.int(0, PAINTING_SEED_MAX) };
}

/** Converts placed items to DTOs (ids `f00…` in placement order unless given). */
export function toDTO(p: Placed, id: string, W: number, D: number): FurnitureDTO {
  const dto: FurnitureDTO = {
    id,
    prefab: p.prefab,
    // Footprint centre in metres: ((2·x0 + w − W) / 8), exact in binary.
    x: (2 * p.rect.x0 + p.rect.w - W) / 8 + 0,
    z: (2 * p.rect.z0 + p.rect.d - D) / 8 + 0,
    rot: p.rot as 0 | 1 | 2 | 3,
    variant: p.variant,
    colors: [...p.colors],
  };
  if (p.signature) dto.signature = true;
  if (p.params !== undefined) dto.params = { ...p.params };
  return dto;
}
