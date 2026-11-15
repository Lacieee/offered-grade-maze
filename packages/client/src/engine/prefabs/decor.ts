/**
 * Decor, lamps and rugs: painting, wall clock, plants, floor lamp, globe and the three rugs.
 *
 * Colours: `painting` [frame, primary, secondary]; `wall_clock` [frame, face];
 * `plant_small`, `plant_large` [pot, leaves]; `floor_lamp` [stand, shade]; `globe` [stand, sea];
 * `rug_large`, `rug_medium`, `runner_rug` [field, border].
 */
import type { PartsBuilder } from './kit.js';
import { leafColor, shade } from './kit.js';
import type { RecipeTable } from './recipe.js';
import { paintingKey, paintingTexture } from './textures/textures.js';

/** Painting parameters, with safe defaults. */
export function paintingParams(params: Readonly<Record<string, number | string>> | undefined): {
  pattern: string;
  seed: number;
} {
  const pattern = typeof params?.pattern === 'string' ? params.pattern : 'stripes';
  const seed = typeof params?.seed === 'number' ? params.seed : 0;
  return { pattern, seed };
}

/**
 * A framed canvas hung flush against the wall (z = −d/2), centred at height `cy`. The frame is
 * `frameW` wide; the picture is a textured quad just in front of the frame's back board.
 */
export function framedPicture(
  b: PartsBuilder,
  frame: string,
  primary: string,
  secondary: string,
  params: { pattern: string; seed: number },
  w: number,
  h: number,
  d: number,
  cy: number,
  frameW: number,
): void {
  const zBack = -d / 2;
  const depth = 0.04;
  b.box(
    'solid',
    shade(frame, 0.7),
    w - frameW,
    h - frameW,
    0.01,
    0,
    cy - (h - frameW) / 2,
    zBack + 0.005,
  );
  for (const sy of [-1, 1])
    b.box(
      'solid',
      frame,
      w,
      frameW,
      depth,
      0,
      cy + sy * (h / 2 - frameW / 2) - frameW / 2,
      zBack + depth / 2,
    );
  for (const sx of [-1, 1])
    b.box(
      'solid',
      frame,
      frameW,
      h - 2 * frameW,
      depth,
      sx * (w / 2 - frameW / 2),
      cy - h / 2 + frameW,
      zBack + depth / 2,
    );
  const key = paintingKey(params.pattern, params.seed, primary, secondary);
  b.picture(
    key,
    () => paintingTexture(params.pattern, params.seed, primary, secondary),
    w - 2 * frameW,
    h - 2 * frameW,
    0,
    cy,
    zBack + 0.015,
  );
}

/** A potted plant: lathe pot, then faceted leaf clusters up to `top`. */
function plant(
  b: PartsBuilder,
  pot: string,
  leaves: string,
  w: number,
  top: number,
  potH: number,
  clusters: number,
): void {
  const r = w / 2;
  b.lathe(
    'solid',
    pot,
    [
      [0, 0],
      [r * 0.7, 0],
      [r * 0.95, potH * 0.9],
      [r, potH],
      [0, potH],
    ],
    0,
    0,
    0,
    10,
  );
  b.cylinder('solid', '#4a3524', r * 0.85, r * 0.85, 0.02, 0, potH - 0.03, 0, 10);
  const stem = top - potH;
  b.cylinder('solid', '#5a4a2a', 0.015, 0.02, stem * 0.7, 0, potH, 0, 6);
  for (let i = 0; i < clusters; i++) {
    const t = clusters === 1 ? 1 : i / (clusters - 1);
    const y = potH + stem * (0.45 + 0.4 * t);
    const a = i * 2.4;
    const off = r * 0.3 * (1 - t);
    const cr = Math.min(r - off, stem * 0.35) * (1 - 0.3 * t);
    b.blob(
      'solid',
      shade(leaves, 0.85 + 0.3 * t),
      cr,
      Math.cos(a) * off,
      y,
      Math.sin(a) * off,
      [1, 0.8, 1],
    );
  }
}

/** A flat rug with a contrasting border. */
function rug(
  b: PartsBuilder,
  field: string,
  border: string,
  w: number,
  d: number,
  h: number,
): void {
  b.box('solid', border, w, h, d, 0, 0, 0);
  const inset = Math.min(0.12, Math.min(w, d) * 0.12);
  b.box('solid', field, w - 2 * inset, h + 0.002, d - 2 * inset, 0, 0, 0);
}

export const DECOR: RecipeTable<
  | 'painting'
  | 'wall_clock'
  | 'plant_small'
  | 'plant_large'
  | 'floor_lamp'
  | 'globe'
  | 'rug_large'
  | 'rug_medium'
  | 'runner_rug'
> = {
  // Centred at 1.5 m (mount height), flush against the wall.
  painting: ({ b, w, d, h, meta, item, color }) => {
    framedPicture(
      b,
      color(0, '#6e4f35'),
      color(1, '#2456b8'),
      color(2, '#e8a317'),
      paintingParams(item.params),
      w,
      h,
      d,
      meta.mountY ?? 1.5,
      0.05,
    );
  },
  // Round clock facing the room, centred at its mount height.
  wall_clock: ({ b, d, h, meta, color }) => {
    const frame = color(0, '#3a3a3a');
    const face = color(1, '#f2efe8');
    const cy = meta.mountY ?? 1.95;
    const r = h / 2;
    b.disc('solid', frame, r, 0.05, 0, cy, -d / 2 + 0.025, 16);
    b.disc('solid', face, r - 0.03, 0.01, 0, cy, -d / 2 + 0.055, 16);
    b.box('solid', '#1b1b1f', 0.012, r * 0.55, 0.006, 0, cy, -d / 2 + 0.062);
    b.box('solid', '#1b1b1f', r * 0.45, 0.012, 0.006, r * 0.2, cy, -d / 2 + 0.062);
  },
  plant_small: ({ b, w, h, color }) => {
    plant(b, color(0, '#b5562f'), leafColor(color(1, '#3f7a3a')), w, h, h * 0.4, 2);
  },
  plant_large: ({ b, w, h, color }) => {
    plant(b, color(0, '#d8cbb0'), leafColor(color(1, '#2f6b3a')), w, h, h * 0.3, 4);
  },
  // Base, pole and a glowing shade around the bulb at the light's height.
  floor_lamp: ({ b, w, h, meta, color }) => {
    const stand = color(0, '#2f2f33');
    const shadeColor = color(1, '#f2e2c0');
    const ly = meta.light?.y ?? 1.5;
    b.cylinder('solid', stand, w * 0.4, w * 0.45, 0.04, 0, 0, 0, 12);
    b.cylinder('solid', stand, 0.015, 0.015, ly - 0.04, 0, 0.04, 0, 8);
    b.cylinder('emissive', shadeColor, w * 0.3, w * 0.48, h - ly + 0.1, 0, ly - 0.1, 0, 12);
    b.sphere('emissive', '#fff6dc', 0.05, 0, ly, 0, [1, 1, 1], [6, 4]);
  },
  // Tripod stand and a globe in the sea colour with paler land masses.
  globe: ({ b, w, h, color }) => {
    const stand = color(0, '#6a4a30');
    const sea = color(1, '#2f6f8f');
    const r = w / 2 - 0.01;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.box('solid', stand, 0.03, h - 2 * r, 0.03, Math.cos(a) * r * 0.7, 0, Math.sin(a) * r * 0.7);
    }
    b.cylinder('solid', stand, r * 0.8, r * 0.8, 0.03, 0, h - 2 * r - 0.02, 0, 12);
    b.sphere('solid', sea, r, 0, h - r, 0, [1, 1, 1], [12, 8]);
    b.blob('solid', '#c9b77a', r * 0.45, r * 0.55, h - r + r * 0.3, r * 0.45, [1, 0.6, 0.4]);
    b.blob('solid', '#c9b77a', r * 0.4, -r * 0.6, h - r - r * 0.2, r * 0.4, [0.8, 1, 0.4]);
  },
  rug_large: ({ b, w, d, h, color }) => {
    rug(b, color(0, '#7a3f35'), color(1, '#d8cbb0'), w, d, h);
  },
  rug_medium: ({ b, w, d, h, color }) => {
    rug(b, color(0, '#4f5a6a'), color(1, '#c4a99a'), w, d, h);
  },
  runner_rug: ({ b, w, d, h, color }) => {
    rug(b, color(0, '#8f2f2f'), color(1, '#c0b098'), w, d, h);
  },
};
