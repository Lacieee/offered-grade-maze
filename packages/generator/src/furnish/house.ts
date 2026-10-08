/**
 * Furnishes every room of a house (CP05 T2, T4, T5, T6): palette, furniture, signature and
 * lights. Rooms are addressed by their pre-shuffle temporary id (`t03`), so furnishing never
 * depends on the final id permutation.
 */
import {
  PREFABS,
  type FurnitureDTO,
  type LightDTO,
  type PaletteDTO,
  type PrefabId,
  type RoomType,
} from '@ogm/shared';
import { rngFor, type Sfc32 } from '../prng/index.js';
import { GOAL_LIGHT, PALETTES } from '../identity/palettes.js';
import { SignatureSource } from '../identity/signature.js';
import { AttemptFailed } from '../topology/model.js';
import {
  RoomPlacer,
  chooseItems,
  itemColors,
  paintingParams,
  toDTO,
  type FurnishInput,
  type ItemSpec,
  type Placed,
} from './furnish.js';

/** The single ceiling light (CP04, kept first in CP05 T6). */
export const CEILING_LIGHT = {
  kind: 'ceiling',
  x: 0,
  y: 2.6,
  z: 0,
  color: '#fff2dd',
  intensity: 1,
} as const;

/** Maximum lamp lights per room (CP05 T6). */
export const MAX_LAMPS = 2;

/** One room of the house as the furnisher needs it. */
export interface HouseRoom extends FurnishInput {
  /** Temporary id, e.g. `t03` (PRNG labels). */
  tempId: string;
  /** Temporary id of the room this twin copies, or null. */
  twinOf: string | null;
}

/** Output for one room. */
export interface FurnishedRoom {
  palette: PaletteDTO;
  furniture: FurnitureDTO[];
  lights: LightDTO[];
}

/** Temporary id of a room index. */
export function tempId(idx: number): string {
  return `t${String(idx).padStart(2, '0')}`;
}

/** PRNG label of a room's furnishing stream. */
export function furnishLabel(id: string): string {
  return `room:${id}:furnish`;
}

/** PRNG label of a room's palette stream. */
export function paletteLabel(id: string): string {
  return `room:${id}:palette`;
}

/** Lights of a room: ceiling, then one per lamp (max 2), then the goal light. */
export function roomLights(furniture: readonly FurnitureDTO[], isGoal: boolean): LightDTO[] {
  const lights: LightDTO[] = [{ ...CEILING_LIGHT }];
  for (const f of furniture) {
    const light = PREFABS[f.prefab].light;
    if (light === undefined || lights.length > MAX_LAMPS) continue;
    lights.push({
      kind: 'lamp',
      x: f.x,
      y: light.y,
      z: f.z,
      color: light.color,
      intensity: light.intensity,
    });
  }
  if (isGoal) lights.push({ ...GOAL_LIGHT });
  return lights;
}

/**
 * Furnishes one non-twin room. Placement order: required → signature → optional → decor;
 * each group largest first (CP05 T4 step 3).
 */
function furnishRoom(
  seed: string,
  room: HouseRoom,
  palette: PaletteDTO,
  signatures: SignatureSource,
): Placed[] {
  const rng = rngFor(seed, furnishLabel(room.tempId));
  const placer = new RoomPlacer(room);
  const choice = chooseItems(rng, room.type);
  const spec = (prefab: PrefabId): ItemSpec => {
    const colors = itemColors(rng, room.type, palette, PREFABS[prefab].colorSlots);
    return prefab === 'painting'
      ? { prefab, colors, params: paintingParams(rng), signature: false }
      : { prefab, colors, signature: false };
  };
  // A required item that cannot be placed is skipped (counted by metrics.missingRequired).
  for (const options of choice.required) {
    options.some((prefab) => placer.place(rng, spec(prefab)) !== null);
  }
  placeSignature(rng, placer, signatures);
  for (const prefab of [...choice.optional, ...choice.decor]) placer.place(rng, spec(prefab));
  return placer.placed;
}

/** Places a unique signature, trying another prefab when one does not fit. */
function placeSignature(
  rng: Sfc32,
  placer: RoomPlacer,
  signatures: SignatureSource,
  avoid: PrefabId | null = null,
): Placed {
  // A twin avoids its original's signature prefab while another one fits.
  const tried = new Set<PrefabId>(avoid === null ? [] : [avoid]);
  for (;;) {
    const item = signatures.next(tried);
    if (item === null) {
      if (avoid !== null) return placeSignature(rng, placer, signatures);
      throw new AttemptFailed('no signature fits a room');
    }
    const placed = placer.place(rng, item);
    if (placed !== null) return placed;
    tried.add(item.prefab);
  }
}

/**
 * Palettes: each room draws from its type's palettes not yet used by an earlier room of the
 * same type (rooms in temporary-id order), or from all of them once they are used up. Twins
 * take their original's palette.
 */
function choosePalettes(seed: string, rooms: readonly HouseRoom[]): Map<string, PaletteDTO> {
  const out = new Map<string, PaletteDTO>();
  const used = new Map<RoomType, Set<number>>();
  for (const room of rooms) {
    if (room.twinOf !== null) continue;
    const all = PALETTES[room.type];
    const taken = used.get(room.type) ?? new Set<number>();
    const fresh = all.map((_, i) => i).filter((i) => !taken.has(i));
    const pool = fresh.length > 0 ? fresh : all.map((_, i) => i);
    const index = rngFor(seed, paletteLabel(room.tempId)).pick(pool);
    taken.add(index);
    used.set(room.type, taken);
    // `index` comes from the palette list's own indices.
    out.set(room.tempId, all[index] as PaletteDTO);
  }
  return out;
}

/**
 * Furnishes the house. Non-twin rooms first (temporary-id order), then twins: a twin copies
 * its original's palette and every non-signature item exactly, then gets its own signature
 * with the normal algorithm. Its signature takes the original signature's furniture id.
 */
export function furnishHouse(
  seed: string,
  rooms: readonly HouseRoom[],
): Map<string, FurnishedRoom> {
  const palettes = choosePalettes(seed, rooms);
  const signatures = new SignatureSource(rngFor(seed, 'identity'));
  const out = new Map<string, FurnishedRoom>();
  const placedOf = new Map<string, Placed[]>();

  const finish = (room: HouseRoom, palette: PaletteDTO, furniture: FurnitureDTO[]): void => {
    furniture.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    out.set(room.tempId, {
      palette: { ...palette },
      furniture,
      lights: roomLights(furniture, room.isGoal),
    });
  };

  for (const room of rooms) {
    if (room.twinOf !== null) continue;
    const palette = palettes.get(room.tempId);
    if (palette === undefined) throw new AttemptFailed(`no palette for ${room.tempId}`);
    const placed = furnishRoom(seed, room, palette, signatures);
    placedOf.set(room.tempId, placed);
    const furniture = placed.map((p, i) =>
      toDTO(p, `f${String(i).padStart(2, '0')}`, room.widthU, room.depthU),
    );
    finish(room, palette, furniture);
  }

  for (const twin of rooms) {
    if (twin.twinOf === null) continue;
    const original = out.get(twin.twinOf);
    const originalPlaced = placedOf.get(twin.twinOf);
    if (original === undefined || originalPlaced === undefined) {
      throw new AttemptFailed(`twin ${twin.tempId} has no furnished original`);
    }
    const placer = new RoomPlacer(twin);
    const furniture: FurnitureDTO[] = [];
    let signatureId = `f${String(originalPlaced.length).padStart(2, '0')}`;
    originalPlaced.forEach((p, i) => {
      const id = `f${String(i).padStart(2, '0')}`;
      if (p.signature) {
        signatureId = id;
        return;
      }
      placer.replay(p);
      furniture.push(toDTO(p, id, twin.widthU, twin.depthU));
    });
    const rng = rngFor(seed, furnishLabel(twin.tempId));
    const originalSig = originalPlaced.find((p) => p.signature)?.prefab ?? null;
    const sig = placeSignature(rng, placer, signatures, originalSig);
    furniture.push(toDTO(sig, signatureId, twin.widthU, twin.depthU));
    finish(twin, original.palette, furniture);
  }
  return out;
}
