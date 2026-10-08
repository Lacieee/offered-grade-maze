/**
 * Seating: sofa, armchair and the red wing-back signature armchair.
 *
 * Colours: `sofa_3seat` and `armchair` [upholstery, legs]; `sig_red_armchair` [red, legs].
 */
import type { PartsBuilder } from './kit.js';
import { shade } from './kit.js';
import type { RecipeTable } from './recipe.js';

/** Four short legs under a w × d base, inset by `inset`. */
function legs(
  b: PartsBuilder,
  color: string,
  w: number,
  d: number,
  h: number,
  inset = 0.08,
  size = 0.06,
): void {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box('solid', color, size, h, size, sx * (w / 2 - inset), 0, sz * (d / 2 - inset));
    }
  }
}

/** An upholstered chair or sofa: base, back, arms, seat cushions. */
function upholstered(
  b: PartsBuilder,
  fabric: string,
  legColor: string,
  w: number,
  d: number,
  h: number,
  cushions: number,
): void {
  const legH = 0.12;
  const arm = Math.min(0.18, w * 0.18);
  const back = Math.min(0.22, d * 0.24);
  const seatTop = 0.44;
  legs(b, legColor, w, d, legH);
  // Base frame under the cushions, inset so its faces never share a plane with the back and
  // arms (coplanar faces of different colours flicker).
  b.box('solid', shade(fabric, 0.85), w - 0.03, seatTop - 0.12 - legH, d - 0.03, 0, legH, 0);
  // Back rest and arms.
  b.box('solid', fabric, w, h - legH, back, 0, legH, -d / 2 + back / 2);
  for (const sx of [-1, 1])
    b.box('solid', fabric, arm, 0.62 - legH, d, sx * (w / 2 - arm / 2), legH, 0);
  // Seat cushions with small gaps, slightly lighter.
  const inner = w - 2 * arm;
  const cw = inner / cushions;
  for (let i = 0; i < cushions; i++) {
    const x = -inner / 2 + cw * (i + 0.5);
    b.box(
      'solid',
      shade(fabric, 1.08),
      cw - 0.02,
      0.12,
      d - back - 0.02,
      x,
      seatTop - 0.12,
      back / 2,
    );
  }
  // Back cushions.
  for (let i = 0; i < cushions; i++) {
    const x = -inner / 2 + cw * (i + 0.5);
    b.box(
      'solid',
      shade(fabric, 1.04),
      cw - 0.03,
      h - seatTop - 0.05,
      0.1,
      x,
      seatTop,
      -d / 2 + back + 0.05,
    );
  }
}

export const SEATING: RecipeTable<'sofa_3seat' | 'armchair' | 'sig_red_armchair'> = {
  // Variant 0: 2 m with three cushions; variant 1: 1.75 m with two.
  sofa_3seat: ({ b, w, d, h, variant, color }) => {
    upholstered(b, color(0, '#5b6f8a'), color(1, '#3a2a1e'), w, d, h, variant === 0 ? 3 : 2);
  },
  armchair: ({ b, w, d, h, color }) => {
    upholstered(b, color(0, '#9a4b3d'), color(1, '#3a2a1e'), w, d, h, 1);
  },
  // Wing-back: tall back with forward wings, turned legs in the contrasting colour.
  sig_red_armchair: ({ b, w, d, h, color }) => {
    const red = color(0, '#c0262d');
    const leg = color(1, '#1b1b1f');
    const cw = w;
    const cd = d;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        b.cylinder(
          'solid',
          leg,
          0.035,
          0.025,
          0.14,
          sx * (cw / 2 - 0.08),
          0,
          sz * (cd / 2 - 0.08),
          8,
        );
      }
    }
    // Seat base inset 1.5 cm, so it shares no face with the back and arms.
    b.box('solid', shade(red, 0.8), cw - 0.03, 0.2, cd - 0.03, 0, 0.14, 0);
    b.box('solid', shade(red, 1.1), cw - 0.24, 0.12, cd - 0.2, 0, 0.34, 0.08);
    b.box('solid', red, cw, h - 0.14, 0.18, 0, 0.14, -cd / 2 + 0.09);
    for (const sx of [-1, 1]) {
      // Arms with rolled tops, and wings at head height.
      b.box('solid', red, 0.14, 0.5, cd, sx * (cw / 2 - 0.07), 0.14, 0);
      b.rod('solid', shade(red, 1.1), 0.08, cd - 0.02, sx * (cw / 2 - 0.08), 0.64, 0, 8, 'z');
      b.box('solid', red, 0.1, h - 0.6, cd * 0.45, sx * (cw / 2 - 0.05), 0.6, -cd / 2 + cd * 0.225);
    }
    // A pale scatter cushion makes it unmistakable.
    b.box('solid', '#f2f2f2', 0.34, 0.26, 0.1, 0, 0.46, -cd / 2 + 0.25);
  },
};
