/**
 * Signature landmarks (CP05 T5): one per room, unique in the house by the triple
 * (prefab, colours, painting pattern + seed). Drawn from the house's `identity` stream.
 */
import { PREFABS, SIGNATURE_PREFABS, type PrefabId } from '@ogm/shared';
import type { Sfc32 } from '../prng/index.js';
import type { ItemSpec } from '../furnish/furnish.js';
import { paintingParams } from '../furnish/furnish.js';
import { RED_SHADES, SIGNATURE_COLORS } from './palettes.js';

/** Uniqueness key of a signature item. */
export function signatureKey(item: {
  prefab: string;
  colors: readonly string[];
  params?: Readonly<Record<string, number | string>>;
}): string {
  const p = item.params;
  return `${item.prefab}|${item.colors.join(',')}|${String(p?.pattern ?? '')}|${String(p?.seed ?? '')}`;
}

/** Draws unique signatures for the rooms of one house, in furnishing order. */
export class SignatureSource {
  private readonly used = new Set<string>();

  constructor(private readonly rng: Sfc32) {}

  /**
   * A new signature whose prefab is not in `exclude` (prefabs that did not fit the room).
   * Returns null once every signature prefab is excluded.
   */
  next(exclude: ReadonlySet<PrefabId>): ItemSpec | null {
    const options = SIGNATURE_PREFABS.filter((id) => !exclude.has(id));
    if (options.length === 0) return null;
    for (;;) {
      const prefab = this.rng.pick(options);
      const colors = Array.from({ length: PREFABS[prefab].colorSlots }, (_, i) =>
        // The red armchair is always red (CP06 T4); its legs take any signature colour.
        this.rng.pick(prefab === 'sig_red_armchair' && i === 0 ? RED_SHADES : SIGNATURE_COLORS),
      );
      const item: ItemSpec =
        prefab === 'sig_painting'
          ? { prefab, colors, params: paintingParams(this.rng), signature: true }
          : { prefab, colors, signature: true };
      const key = signatureKey(item);
      // 6 prefabs × at least 60 colour pairs (and 50 000 painting params): a free key is
      // always found for a 24-room house.
      if (this.used.has(key)) continue;
      this.used.add(key);
      return item;
    }
  }
}
