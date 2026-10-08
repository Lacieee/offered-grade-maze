/**
 * The recipe contract (CP06 T1). A recipe builds one prefab in its local space: footprint
 * centred on the origin (`w` along X, `d` along Z, from `meta.footprint[variant]`), front
 * toward +Z, floor at y = 0, height `h` (`meta.height`). Wall-hung recipes place themselves
 * at their mount height, flush against the wall at z = −d/2.
 */
import type { FurnitureDTO, PrefabId, PrefabMeta } from '@ogm/shared';
import type { PartsBuilder } from './kit.js';

/** What a recipe gets. */
export interface RecipeInput {
  item: FurnitureDTO;
  meta: PrefabMeta;
  /** Footprint width (X) and depth (Z) in metres, unrotated. */
  w: number;
  d: number;
  /** Height in metres. */
  h: number;
  variant: number;
  b: PartsBuilder;
  /** `item.colors[i]`, or `fallback` when missing. */
  color: (i: number, fallback: string) => string;
}

/** Builds one prefab. */
export type Recipe = (r: RecipeInput) => void;

/** One recipe per prefab id. */
export type RecipeTable<K extends PrefabId = PrefabId> = Readonly<Record<K, Recipe>>;
