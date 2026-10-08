/**
 * Cabinets and shelves: TV unit, bookshelf, wardrobe, dresser, shoe cabinet, filing cabinet,
 * wall cabinet and the kitchen counter run.
 *
 * Colours: `tv_unit` [cabinet, TV body]; `bookshelf` [wood, books]; `wardrobe`, `dresser`,
 * `shoe_cabinet`, `wall_cabinet` [body, handles]; `filing_cabinet` [metal];
 * `counter_run` [cabinets, worktop, sink].
 */
import type { PartsBuilder } from './kit.js';
import { shade } from './kit.js';
import type { RecipeTable } from './recipe.js';

/** Depth taken by door panels and handles in front of a cabinet body (m). */
const FRONT = 0.035;

/**
 * Front panels: `cols` × `rows` doors or drawers whose handles reach `zFront` (the front of
 * the footprint). The body behind them should end at `zFront − FRONT`.
 */
function fronts(
  b: PartsBuilder,
  body: string,
  handle: string,
  w: number,
  zFront: number,
  y0: number,
  h: number,
  cols: number,
  rows: number,
  handles: 'bar' | 'knob' | 'vertical',
): void {
  const gap = 0.012;
  const cw = w / cols;
  const rh = h / rows;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = -w / 2 + cw * (c + 0.5);
      const y = y0 + rh * r;
      b.box('solid', shade(body, 1.06), cw - gap, rh - gap, 0.015, x, y + gap / 2, zFront - 0.025);
      const hy = y + rh / 2;
      if (handles === 'knob') b.box('solid', handle, 0.04, 0.03, 0.025, x, hy, zFront - 0.0125);
      else if (handles === 'bar')
        b.box('solid', handle, Math.min(0.2, cw * 0.4), 0.02, 0.025, x, hy - 0.01, zFront - 0.0125);
      else {
        // Vertical handles meet in the middle of a pair of doors.
        const side = c % 2 === 0 ? 1 : -1;
        b.box(
          'solid',
          handle,
          0.02,
          Math.min(0.4, rh * 0.3),
          0.025,
          x + side * (cw / 2 - 0.06),
          hy - 0.1,
          zFront - 0.0125,
        );
      }
    }
  }
}

export const STORAGE: RecipeTable<
  | 'tv_unit'
  | 'bookshelf'
  | 'wardrobe'
  | 'dresser'
  | 'shoe_cabinet'
  | 'filing_cabinet'
  | 'wall_cabinet'
  | 'counter_run'
> = {
  // Low cabinet with a flat screen on a stand.
  tv_unit: ({ b, w, d, h, color }) => {
    const body = color(0, '#4a4440');
    const screen = color(1, '#1b1b1f');
    const ch = 0.45;
    b.box('solid', body, w, ch - 0.06, d - FRONT, 0, 0.06, -FRONT / 2);
    b.box('solid', shade(body, 0.6), w - 0.1, 0.06, d - 0.06, 0, 0, 0);
    fronts(b, body, shade(body, 0.5), w, d / 2, 0.08, ch - 0.12, 3, 1, 'bar');
    const sw = w * 0.85;
    b.box('solid', '#2a2a2e', 0.24, 0.02, 0.18, 0, ch, -0.02);
    b.box('solid', '#2a2a2e', 0.05, 0.08, 0.04, 0, ch + 0.02, -0.04);
    b.box('solid', screen, sw, h - ch - 0.1, 0.05, 0, ch + 0.1, -0.04);
    // The picture: animated static (CP06 review), 3 mm in front of the bezel.
    const sh = h - ch - 0.14;
    b.screen(sw - 0.04, sh, 0, ch + 0.12 + sh / 2, -0.012);
  },
  // Open shelving with rows of books (each book a slightly different tone).
  bookshelf: ({ b, w, d, h, color }) => {
    const wood = color(0, '#7a5534');
    const books = color(1, '#9a2f2f');
    const t = 0.03;
    for (const sx of [-1, 1]) b.box('solid', wood, t, h, d, sx * (w / 2 - t / 2), 0, 0);
    b.box('solid', wood, w, t, d, 0, h - t, 0);
    b.box('solid', shade(wood, 0.75), w - 2 * t, h - t, 0.015, 0, 0, -d / 2 + 0.0075);
    const shelves = 5;
    const step = (h - t) / shelves;
    const tones = [1, 0.75, 1.25, 0.9, 1.15, 0.65, 1.35];
    for (let s = 0; s < shelves; s++) {
      const y = s * step;
      // Shelves stop at the back panel (no shared face with it).
      b.box('solid', wood, w - 2 * t, t, d - 0.015, 0, y, 0.0075);
      if (s === shelves - 1) {
        // Top shelf: a storage box instead of books.
        b.box(
          'solid',
          shade(books, 0.55),
          Math.min(0.35, w * 0.3),
          step * 0.5,
          d * 0.7,
          w / 4,
          y + t,
          0,
        );
        continue;
      }
      // Books fill about half of each shelf, alternating sides (fixed widths, so the same
      // shelf always looks the same).
      const fill = (w - 2 * t) * (0.45 + (s % 2) * 0.1);
      let x = s % 2 === 0 ? -w / 2 + t + 0.01 : w / 2 - t - 0.01 - fill;
      const end = x + fill;
      let k = s * 3;
      for (;;) {
        const bw = 0.05 + ((k * 7) % 4) * 0.02;
        if (x + bw > end) break;
        const bh = step * (0.62 + ((k * 5) % 4) * 0.07);
        b.box(
          'solid',
          shade(books, tones[k % tones.length] ?? 1),
          bw - 0.006,
          bh,
          d * 0.75,
          x + bw / 2,
          y + t,
          0.02,
        );
        x += bw;
        k++;
      }
    }
  },
  // Variant 0 (2 m): three doors; variant 1 (1.5 m): two doors.
  wardrobe: ({ b, w, d, h, variant, color }) => {
    const body = color(0, '#5e4630');
    const handle = color(1, '#c9a227');
    // Body up to the cornice (no shared top face).
    b.box('solid', body, w, h - 0.12, d - FRONT, 0, 0.08, -FRONT / 2);
    b.box('solid', shade(body, 0.6), w - 0.04, 0.08, d - 0.06, 0, 0, -0.02);
    b.box('solid', shade(body, 1.1), w, 0.04, d, 0, h - 0.04, 0);
    fronts(b, body, handle, w - 0.02, d / 2, 0.1, h - 0.16, variant === 0 ? 3 : 2, 1, 'vertical');
  },
  dresser: ({ b, w, d, h, color }) => {
    const body = color(0, '#8a6f5a');
    const handle = color(1, '#c9a227');
    b.box('solid', body, w, h - 0.11, d - FRONT, 0, 0.08, -FRONT / 2);
    b.box('solid', shade(body, 1.1), w, 0.03, d, 0, h - 0.03, 0);
    for (const sx of [-1, 1])
      b.box('solid', shade(body, 0.7), 0.05, 0.08, d - 0.06, sx * (w / 2 - 0.05), 0, -0.02);
    fronts(b, body, handle, w - 0.04, d / 2, 0.1, h - 0.16, 2, 3, 'bar');
  },
  shoe_cabinet: ({ b, w, d, h, color }) => {
    const body = color(0, '#8f6a48');
    const handle = color(1, '#3a3a3a');
    b.box('solid', body, w, h - 0.05, d - FRONT, 0, 0.05, -FRONT / 2);
    b.box('solid', shade(body, 0.6), w - 0.04, 0.05, d - 0.06, 0, 0, -0.02);
    fronts(b, body, handle, w - 0.02, d / 2, 0.07, h - 0.1, 2, 2, 'bar');
  },
  filing_cabinet: ({ b, w, d, h, color }) => {
    const metal = color(0, '#7d8389');
    b.box('solid', metal, w, h, d - FRONT, 0, 0, -FRONT / 2);
    fronts(b, metal, '#cfd3d6', w - 0.04, d / 2, 0.04, h - 0.08, 1, 4, 'bar');
  },
  // Hung cabinet, bottom at 1.5 m (mount height 1.85 m), flush against the wall.
  wall_cabinet: ({ b, w, d, h, meta, color }) => {
    const body = color(0, '#e9e4da');
    const handle = color(1, '#3a3a3a');
    const y0 = (meta.mountY ?? 1.85) - h / 2;
    b.box('solid', body, w, h, d - FRONT, 0, y0, -FRONT / 2);
    fronts(b, body, handle, w - 0.02, d / 2, y0 + 0.02, h - 0.04, 3, 1, 'vertical');
  },
  // Base cabinets with a worktop, a sink and a toe kick. Variants are 2, 2.5 and 3 m long.
  counter_run: ({ b, w, d, h, color }) => {
    const cab = color(0, '#e9e4da');
    const top = color(1, '#b5a58a');
    const sink = color(2, '#c8c2b4');
    const doors = Math.round(w / 0.5);
    b.box('solid', shade(cab, 0.5), w - 0.02, 0.1, d - 0.1, 0, 0, -0.04);
    b.box('solid', cab, w, h - 0.14, d - FRONT - 0.03, 0, 0.1, -FRONT / 2 - 0.015);
    fronts(b, cab, '#3a3a3a', w - 0.02, d / 2 - 0.03, 0.12, h - 0.18, doors, 1, 'bar');
    b.box('solid', top, w, 0.04, d, 0, h - 0.04, 0);
    // Sink basin (a darker inset) and a tap.
    const sx = -w / 2 + 0.55;
    b.box('solid', shade(sink, 0.7), 0.5, 0.012, 0.4, sx, h, 0.02);
    b.box('solid', sink, 0.54, 0.01, 0.44, sx, h - 0.004, 0.02);
    b.cylinder('solid', '#b8bcc0', 0.015, 0.015, 0.2, sx, h, -d / 2 + 0.1, 8);
    b.box('solid', '#b8bcc0', 0.025, 0.025, 0.14, sx, h + 0.18, -d / 2 + 0.16);
  },
};
