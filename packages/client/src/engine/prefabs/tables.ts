/**
 * Tables: coffee table, side table, nightstand, dining set, desk set, console table.
 *
 * Colours: `coffee_table`, `side_table`, `nightstand` [wood]; `dining_set` [table, chairs];
 * `desk_set` [desk, chair, accent]; `console_table` [wood, accent].
 */
import type { PartsBuilder } from './kit.js';
import { shade } from './kit.js';
import type { RecipeTable } from './recipe.js';

/** A table: top of thickness `t` at height h, four square legs. */
function table(
  b: PartsBuilder,
  color: string,
  w: number,
  d: number,
  h: number,
  t = 0.04,
  leg = 0.05,
): void {
  b.box('solid', color, w, t, d, 0, h - t, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box(
        'solid',
        shade(color, 0.85),
        leg,
        h - t,
        leg,
        sx * (w / 2 - leg),
        0,
        sz * (d / 2 - leg),
      );
    }
  }
}

/** A dining chair facing +Z (rot applied by the caller through position only). */
function chair(
  b: PartsBuilder,
  color: string,
  x: number,
  z: number,
  facing: 'n' | 's' | 'e' | 'w',
): void {
  const s = 0.42;
  const seat = 0.45;
  b.box('solid', color, s, 0.04, s, x, seat - 0.04, z);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box(
        'solid',
        shade(color, 0.8),
        0.04,
        seat - 0.04,
        0.04,
        x + sx * (s / 2 - 0.03),
        0,
        z + sz * (s / 2 - 0.03),
      );
    }
  }
  // Back rest on the side away from the table.
  const off = s / 2 - 0.02;
  const back = { n: [0, -off], s: [0, off], e: [off, 0], w: [-off, 0] }[facing];
  const along = facing === 'n' || facing === 's';
  b.box(
    'solid',
    color,
    along ? s : 0.04,
    0.45,
    along ? 0.04 : s,
    x + (back[0] ?? 0),
    seat,
    z + (back[1] ?? 0),
  );
}

export const TABLES: RecipeTable<
  'coffee_table' | 'side_table' | 'nightstand' | 'dining_set' | 'desk_set' | 'console_table'
> = {
  // Variant 0: rectangular with a lower shelf; variant 1: round top on a pedestal.
  coffee_table: ({ b, w, d, h, variant, color }) => {
    const wood = color(0, '#6b4a2e');
    if (variant === 0) {
      table(b, wood, w, d, h, 0.05);
      b.box('solid', shade(wood, 0.9), w - 0.12, 0.03, d - 0.12, 0, 0.1, 0);
    } else {
      b.cylinder('solid', wood, w / 2, w / 2, 0.05, 0, h - 0.05, 0, 16);
      b.cylinder('solid', shade(wood, 0.85), 0.07, 0.09, h - 0.05, 0, 0, 0, 8);
      b.cylinder('solid', shade(wood, 0.8), w / 2.6, w / 2.4, 0.04, 0, 0, 0, 12);
    }
  },
  side_table: ({ b, w, d, h, color }) => {
    const wood = color(0, '#8c6b4a');
    table(b, wood, w, d, h, 0.04, 0.04);
    b.box('solid', shade(wood, 0.9), w - 0.08, 0.02, d - 0.08, 0, 0.18, 0);
  },
  nightstand: ({ b, w, d, h, color }) => {
    const wood = color(0, '#7a5c40');
    b.box('solid', wood, w, h - 0.05, d - 0.035, 0, 0.05, -0.0175);
    b.box('solid', shade(wood, 0.6), w - 0.06, 0.05, d - 0.06, 0, 0, 0);
    // Two drawer fronts and knobs.
    for (const y of [0.12, 0.32]) {
      b.box('solid', shade(wood, 1.1), w - 0.06, 0.16, 0.015, 0, y, d / 2 - 0.0275);
      b.box('solid', '#c9a227', 0.05, 0.02, 0.02, 0, y + 0.07, d / 2 - 0.01);
    }
  },
  // Table with chairs: variant 0 (2 × 1.5 m) seats six, variant 1 (1.5 × 1.5 m) seats four.
  dining_set: ({ b, w, d, h, variant, color }) => {
    const top = color(0, '#a0754d');
    const chairs = color(1, '#6e4f35');
    const tw = variant === 0 ? w - 0.84 : w - 0.84;
    const td = d - 0.84;
    table(b, top, tw, td, Math.min(h, 0.76), 0.04, 0.06);
    const zEdge = td / 2 + 0.21;
    const xEdge = tw / 2 + 0.21;
    if (variant === 0) {
      for (const x of [-tw / 4, tw / 4]) {
        chair(b, chairs, x, zEdge, 'n');
        chair(b, chairs, x, -zEdge, 's');
      }
    } else {
      chair(b, chairs, 0, zEdge, 'n');
      chair(b, chairs, 0, -zEdge, 's');
    }
    chair(b, chairs, xEdge, 0, 'w');
    chair(b, chairs, -xEdge, 0, 'e');
  },
  // Desk against the wall (back), office chair in front, a lamp in the accent colour.
  desk_set: ({ b, w, d, color }) => {
    const desk = color(0, '#6a4a30');
    const chairColor = color(1, '#222428');
    const accent = color(2, '#2f6f8f');
    const dd = 0.62;
    const dz = -d / 2 + dd / 2;
    b.box('solid', desk, w, 0.04, dd, 0, 0.71, dz);
    for (const sx of [-1, 1])
      b.box('solid', shade(desk, 0.85), 0.04, 0.71, dd, sx * (w / 2 - 0.02), 0, dz);
    // Modesty panel; its right end hides inside the drawer block, its top under the desk.
    b.box('solid', shade(desk, 0.85), w - 0.1, 0.39, 0.02, -0.01, 0.31, -d / 2 + 0.02);
    // Drawer block on the right.
    b.box('solid', shade(desk, 0.92), 0.36, 0.5, dd - 0.04, w / 2 - 0.22, 0.21, dz);
    // A laptop with a glowing screen edge and a notebook in the accent colour.
    b.box('solid', '#3a3d42', 0.34, 0.012, 0.24, 0.05, 0.75, dz);
    b.box('emissive', '#cfe3ff', 0.3, 0.004, 0.2, 0.05, 0.762, dz);
    b.box('solid', accent, 0.2, 0.012, 0.28, -w / 2 + 0.18, 0.75, dz);
    // Office chair: star base, column, seat, back.
    const cz = d / 2 - 0.28;
    for (const axis of [0, 1]) {
      b.box(
        'solid',
        '#2a2a2e',
        axis === 0 ? 0.52 : 0.05,
        0.05,
        axis === 0 ? 0.05 : 0.52,
        0,
        0.03,
        cz,
      );
    }
    b.cylinder('solid', '#6d6d72', 0.025, 0.025, 0.4, 0, 0.06, cz, 8);
    b.box('solid', chairColor, 0.46, 0.08, 0.44, 0, 0.44, cz);
    b.box('solid', chairColor, 0.42, 0.4, 0.06, 0, 0.55, cz + 0.22);
  },
  console_table: ({ b, w, d, h, color }) => {
    const wood = color(0, '#6e4f35');
    table(b, wood, w, d, h, 0.04, 0.04);
    b.box('solid', shade(wood, 0.9), w - 0.08, 0.02, d - 0.08, 0, 0.2, 0);
    // A vase and a bowl on the lower shelf, a tray on top.
    const accent = color(1, '#2f6f8f');
    b.lathe(
      'solid',
      accent,
      [
        [0, 0],
        [0.07, 0.02],
        [0.09, 0.12],
        [0.05, 0.24],
        [0.06, 0.28],
      ],
      w / 2 - 0.2,
      0.22,
      0,
      10,
    );
    b.cylinder('solid', shade(accent, 1.3), 0.1, 0.06, 0.05, -w / 4, 0.22, 0, 12);
    b.box('solid', shade(accent, 0.7), 0.3, 0.015, 0.2, 0, h, 0);
  },
};
