/**
 * Prefab geometry (CP06 T1): one recipe per catalogue prefab, built in local space and
 * placed into the room by `x`, `z` and `rot` quarter turns.
 */
import { GRID, PREFABS, type FurnitureDTO } from '@ogm/shared';
import * as THREE from 'three';
import { BATHROOM_HALLWAY } from './bathroom.js';
import { DECOR } from './decor.js';
import { KITCHEN_BEDROOM } from './kitchen.js';
import { PartsBuilder, type PrefabParts } from './kit.js';
import type { RecipeTable } from './recipe.js';
import { SEATING } from './seating.js';
import { SIGNATURES } from './signatures.js';
import { STORAGE } from './storage.js';
import { TABLES } from './tables.js';

export type { PrefabParts, SwimMotion, TexturedPart } from './kit.js';

/** Every prefab's recipe (the type makes a missing prefab a compile error). */
export const RECIPES: RecipeTable = {
  ...SEATING,
  ...TABLES,
  ...STORAGE,
  ...KITCHEN_BEDROOM,
  ...BATHROOM_HALLWAY,
  ...DECOR,
  ...SIGNATURES,
};

/** Builds an item in its local space (footprint centred, front +Z, floor at y = 0). */
export function buildPrefabLocal(item: FurnitureDTO): PrefabParts {
  const meta = PREFABS[item.prefab];
  const variant = item.variant < meta.footprint.length ? item.variant : 0;
  // `variant` indexes the footprint list (checked above).
  const [fw, fd] = meta.footprint[variant] as readonly [number, number];
  const b = new PartsBuilder();
  RECIPES[item.prefab]({
    item,
    meta,
    w: fw * GRID,
    d: fd * GRID,
    h: meta.height,
    variant,
    b,
    color: (i, fallback) => item.colors[i] ?? fallback,
  });
  return b.parts;
}

/** The transform from an item's local space to room coordinates. */
export function prefabMatrix(item: FurnitureDTO): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY((item.rot * Math.PI) / 2).setPosition(item.x, 0, item.z);
}

/** Builds an item in room coordinates. */
export function buildPrefab(item: FurnitureDTO): PrefabParts {
  const parts = buildPrefabLocal(item);
  const m = prefabMatrix(item);
  for (const g of parts.solid) g.applyMatrix4(m);
  for (const g of parts.emissive) g.applyMatrix4(m);
  for (const t of parts.textured) t.geometry.applyMatrix4(m);
  for (const g of parts.screen) g.applyMatrix4(m);
  // Swim directions turn with the item (applyMatrix4 only knows position and normal).
  const turn = new THREE.Matrix3().getNormalMatrix(m);
  for (const g of parts.swim) {
    g.applyMatrix4(m);
    g.getAttribute('swimDir').applyNormalMatrix(turn);
  }
  return parts;
}

/** Triangle count of a set of parts. */
export function triangleCount(parts: PrefabParts): number {
  const count = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
  return (
    parts.solid.reduce((n, g) => n + count(g), 0) +
    parts.emissive.reduce((n, g) => n + count(g), 0) +
    parts.textured.reduce((n, t) => n + count(t.geometry), 0) +
    parts.swim.reduce((n, g) => n + count(g), 0) +
    parts.screen.reduce((n, g) => n + count(g), 0)
  );
}
