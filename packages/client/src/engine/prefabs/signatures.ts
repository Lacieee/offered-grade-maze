/**
 * Signature landmarks (CP06 T4): one per room, meant to be spotted from the doorway.
 *
 * Colours: `sig_painting` [primary, secondary]; `sig_grandfather_clock` [wood, face];
 * `sig_aquarium` [cabinet, fish]; `sig_giant_plant` [pot, leaves];
 * `sig_large_globe` [land, sea]. (`sig_red_armchair` is in seating.ts.)
 */
import type { PartsBuilder } from './kit.js';
import { leafColor, shade } from './kit.js';
import { framedPicture, paintingParams } from './decor.js';
import type { RecipeTable } from './recipe.js';

/** Gold frame of the signature painting. */
const GOLD = '#b8902e';

/** Aquarium water (emissive teal, CP06 T4). */
const WATER = '#2ec4b6';

/** Fish shape: a squashed body and a tail fin, facing ±X. */
function fish(b: PartsBuilder, color: string, x: number, y: number, z: number, dir: 1 | -1): void {
  b.sphere('solid', color, 0.05, x, y, z, [1.4, 0.8, 0.45], [6, 4]);
  b.box('solid', shade(color, 0.8), 0.04, 0.06, 0.01, x - dir * 0.08, y - 0.03, z);
}

export const SIGNATURES: RecipeTable<
  'sig_painting' | 'sig_grandfather_clock' | 'sig_aquarium' | 'sig_giant_plant' | 'sig_large_globe'
> = {
  // 1.25 × 1.0 m framed canvas with a bold two-colour pattern, centred at 1.5 m.
  sig_painting: ({ b, w, d, h, meta, item, color }) => {
    framedPicture(
      b,
      GOLD,
      color(0, '#c0262d'),
      color(1, '#f2f2f2'),
      paintingParams(item.params),
      w,
      h,
      d,
      meta.mountY ?? 1.5,
      0.08,
    );
  },
  // Plinth, long case with a glass door and pendulum, hood with a glowing face.
  sig_grandfather_clock: ({ b, w, d, h, color }) => {
    const wood = color(0, '#6e4220');
    const face = color(1, '#f2f2f2');
    const cw = w - 0.06;
    const cd = d - 0.1;
    const zc = -d / 2 + cd / 2;
    b.box('solid', shade(wood, 0.85), w, 0.35, d - 0.04, 0, 0, -0.02);
    b.box('solid', wood, cw - 0.06, 1.05, cd - 0.06, 0, 0.35, zc);
    b.box('solid', wood, cw, h - 1.4 - 0.08, cd, 0, 1.4, zc);
    b.box('solid', shade(wood, 1.15), w, 0.08, d, 0, h - 0.08, 0);
    // Glass door with a brass pendulum behind it.
    b.box('solid', shade(wood, 0.55), cw - 0.16, 0.8, 0.01, 0, 0.45, zc + (cd - 0.06) / 2 + 0.005);
    b.box('solid', '#c9a227', 0.012, 0.55, 0.01, 0, 0.62, zc + (cd - 0.06) / 2 + 0.012);
    b.disc('solid', '#c9a227', 0.06, 0.02, 0, 0.6, zc + (cd - 0.06) / 2 + 0.015, 12);
    // Face and hands.
    const fy = 1.4 + (h - 1.48) / 2;
    b.disc(
      'emissive',
      face,
      Math.min(cw, h - 1.48) / 2 - 0.03,
      0.01,
      0,
      fy,
      zc + cd / 2 + 0.005,
      16,
    );
    b.box('solid', '#1b1b1f', 0.012, 0.11, 0.006, 0, fy + 0.04, zc + cd / 2 + 0.012);
    b.box('solid', '#1b1b1f', 0.08, 0.012, 0.006, 0.03, fy, zc + cd / 2 + 0.012);
  },
  // Cabinet with a glowing teal tank and a few fish.
  sig_aquarium: ({ b, w, d, h, color }) => {
    const cabinet = color(0, '#1b1b1f');
    const fishColor = color(1, '#e8a317');
    const ch = 0.7;
    b.box('solid', cabinet, w, ch, d, 0, 0, 0);
    b.box('solid', shade(cabinet, 1.3), w - 0.06, ch - 0.1, 0.01, 0, 0.05, d / 2 - 0.005);
    const th = h - ch - 0.04;
    b.box('emissive', WATER, w - 0.06, th - 0.06, d - 0.06, 0, ch + 0.02, 0);
    // Frame edges.
    for (const sx of [-1, 1]) b.box('solid', '#2a2a2e', 0.03, th, d, sx * (w / 2 - 0.015), ch, 0);
    b.box('solid', '#2a2a2e', w, 0.04, d, 0, h - 0.04, 0);
    b.box('solid', '#d8cbb0', w - 0.06, 0.03, d - 0.06, 0, ch, 0);
    // Fish swim just behind the glass, in front of the (opaque) water volume.
    const fz = d / 2 - 0.025;
    fish(b, fishColor, -0.3, ch + 0.25, fz, 1);
    fish(b, fishColor, 0.15, ch + 0.38, fz, -1);
    fish(b, shade(fishColor, 1.3), 0.35, ch + 0.18, fz, -1);
    fish(b, shade(fishColor, 0.7), -0.05, ch + 0.45, fz, 1);
    b.blob('solid', '#2f6b3a', 0.08, -w / 2 + 0.15, ch + 0.1, -0.05, [0.6, 1.4, 0.6]);
  },
  // 2.1 m plant in a large pot: layered leaf clusters.
  sig_giant_plant: ({ b, w, h, color }) => {
    const pot = color(0, '#b5562f');
    const leaves = leafColor(color(1, '#2f6b3a'));
    const r = w / 2;
    b.lathe(
      'solid',
      pot,
      [
        [0, 0],
        [r * 0.65, 0],
        [r * 0.92, 0.45],
        [r, 0.5],
        [0, 0.5],
      ],
      0,
      0,
      0,
      12,
    );
    b.cylinder('solid', '#5a4a2a', 0.04, 0.06, h - 0.8, 0, 0.5, 0, 8);
    // Seven layers of two broad leaf clusters, turning as they rise; every cluster stays
    // inside the footprint (spread + radius ≤ r).
    const layers = 7;
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);
      const y = 0.9 + t * (h - 1.15);
      const spread = r * (0.42 - 0.22 * t);
      const cr = (r - spread) * (1 - 0.25 * t);
      for (const k of [0, 1]) {
        const a = i * 1.3 + k * Math.PI;
        b.blob(
          'solid',
          shade(leaves, 0.75 + 0.45 * t + k * 0.08),
          cr,
          Math.cos(a) * spread,
          y,
          Math.sin(a) * spread,
          [1, 0.45, 1],
        );
      }
    }
    b.blob('solid', shade(leaves, 1.25), r * 0.3, 0, h - 0.15, 0, [1, 1, 1]);
  },
  // 1.4 m floor globe: ring stand, meridian and a two-colour sphere.
  sig_large_globe: ({ b, w, h, color }) => {
    const land = color(0, '#1f7a4a');
    const sea = color(1, '#2456b8');
    const r = w / 2 - 0.01;
    const cy = h - r;
    const stand = '#6e4220';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.box(
        'solid',
        stand,
        0.04,
        cy - r * 0.6,
        0.04,
        Math.cos(a) * r * 0.75,
        0,
        Math.sin(a) * r * 0.75,
      );
    }
    b.cylinder('solid', stand, r * 0.9, r * 0.9, 0.04, 0, cy - r * 0.6, 0, 16);
    b.sphere('solid', sea, r * 0.92, 0, cy, 0, [1, 1, 1], [12, 8]);
    // Continents: blobs that rise just out of the sea sphere, never past the footprint.
    const spots: [number, number, number][] = [
      [0.6, 0.35, 0.45],
      [-0.55, 0.1, 0.55],
      [0.1, -0.45, 0.75],
      [-0.2, 0.6, -0.6],
      [0.7, -0.2, -0.5],
    ];
    for (const [x, y, z] of spots) {
      const len = Math.hypot(x, y, z);
      b.blob(
        'solid',
        land,
        r * 0.3,
        (x / len) * r * 0.7,
        cy + (y / len) * r * 0.7,
        (z / len) * r * 0.7,
      );
    }
    // Horizon ring around the equator (classic floor globe), as wide as the footprint.
    b.lathe(
      'solid',
      '#c9a227',
      [
        [r - 0.035, 0],
        [r, 0],
        [r, 0.035],
        [r - 0.035, 0.035],
        [r - 0.035, 0],
      ],
      0,
      cy - 0.0175,
      0,
      16,
    );
    // Meridian stand-in: a brass axis through the poles.
    b.cylinder('solid', '#c9a227', 0.012, 0.012, 2 * r, 0, cy - r, 0, 8);
  },
};
