/**
 * Kitchen appliances and bedroom furniture: stove, fridge, bin, double bed, standing mirror.
 *
 * Colours: `stove` [body, cooktop]; `fridge` [body]; `bin` [body];
 * `bed_double` [frame, sheets, pillows]; `mirror_standing` [frame].
 */
import { shade } from './kit.js';
import type { RecipeTable } from './recipe.js';

export const KITCHEN_BEDROOM: RecipeTable<
  'stove' | 'fridge' | 'bin' | 'bed_double' | 'mirror_standing'
> = {
  stove: ({ b, w, d, h, color }) => {
    const body = color(0, '#e9e4da');
    const top = color(1, '#404448');
    b.box('solid', shade(body, 0.5), w - 0.02, 0.08, d - 0.08, 0, 0, -0.03);
    b.box('solid', body, w, h - 0.12, d - 0.04, 0, 0.08, -0.02);
    b.box('solid', top, w, 0.04, d, 0, h - 0.04, 0);
    // Four burners, an oven window and a row of knobs.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        b.cylinder('solid', '#1b1b1f', 0.09, 0.09, 0.012, sx * w * 0.22, h, sz * d * 0.2, 10);
      }
    }
    b.box('solid', '#1f2326', w * 0.7, (h - 0.12) * 0.42, 0.01, 0, 0.22, d / 2 - 0.035);
    b.box('solid', '#b8bcc0', w * 0.6, 0.02, 0.03, 0, 0.62, d / 2 - 0.025);
    for (let i = 0; i < 4; i++) {
      b.box('solid', '#2a2a2e', 0.04, 0.04, 0.03, -w * 0.3 + i * w * 0.2, h - 0.12, d / 2 - 0.025);
    }
  },
  // Tall fridge-freezer: freezer door at the bottom, long handles.
  fridge: ({ b, w, d, h, color }) => {
    const body = color(0, '#dfe6ea');
    b.box('solid', shade(body, 0.6), w - 0.04, 0.05, d - 0.06, 0, 0, -0.02);
    b.box('solid', body, w, h - 0.05, d - 0.04, 0, 0.05, -0.02);
    b.box('solid', shade(body, 0.8), w - 0.02, 0.012, 0.01, 0, 0.75, d / 2 - 0.01);
    b.box('solid', '#9aa0a6', 0.03, 0.5, 0.04, w / 2 - 0.1, 1.05, d / 2 - 0.02);
    b.box('solid', '#9aa0a6', 0.03, 0.3, 0.04, w / 2 - 0.1, 0.35, d / 2 - 0.02);
  },
  bin: ({ b, w, h, color }) => {
    const body = color(0, '#b0b4b8');
    b.cylinder('solid', body, w / 2 - 0.01, w / 2 - 0.03, h - 0.04, 0, 0, 0, 10);
    b.cylinder('solid', shade(body, 0.7), w / 2, w / 2, 0.04, 0, h - 0.04, 0, 10);
  },
  // Headboard at the back (−Z) against the wall.
  bed_double: ({ b, w, d, h, color }) => {
    const frame = color(0, '#8a6f5a');
    const sheets = color(1, '#e8e2d4');
    const pillows = color(2, '#f5f2ea');
    const head = 0.08;
    b.box('solid', frame, w, h, head, 0, 0, -d / 2 + head / 2);
    b.box('solid', frame, w, 0.28, d - head, 0, 0.0, head / 2);
    b.box('solid', '#f0ede6', w - 0.08, 0.16, d - head - 0.06, 0, 0.28, head / 2);
    // Duvet over the lower two thirds, folded edge at the top.
    const dz = d - head - 0.55;
    b.box('solid', sheets, w - 0.02, 0.06, dz, 0, 0.4, d / 2 - dz / 2);
    b.box('solid', shade(sheets, 0.9), w - 0.02, 0.07, 0.12, 0, 0.4, d / 2 - dz + 0.06);
    // Two pillows side by side.
    const n = 2;
    const pw = (w - 0.2) / n;
    for (let i = 0; i < n; i++) {
      b.box(
        'solid',
        pillows,
        pw - 0.06,
        0.1,
        0.36,
        -w / 2 + 0.1 + pw * (i + 0.5),
        0.44,
        -d / 2 + head + 0.24,
      );
    }
    for (const sx of [-1, 1]) {
      b.box('solid', shade(frame, 0.8), 0.06, 0.06, 0.06, sx * (w / 2 - 0.03), 0, d / 2 - 0.03);
    }
  },
  // Cheval mirror on two feet; the glass is a pale, slightly blue panel.
  mirror_standing: ({ b, w, d, h, color }) => {
    const frame = color(0, '#5e4630');
    b.box('solid', frame, w, 0.04, d, 0, 0, 0);
    for (const sx of [-1, 1])
      b.box('solid', frame, 0.04, h - 0.04, 0.05, sx * (w / 2 - 0.02), 0.04, 0);
    b.box('solid', frame, w - 0.08, 0.04, 0.04, 0, h - 0.06, 0);
    b.box('solid', frame, w - 0.08, 0.04, 0.04, 0, 0.3, 0);
    b.box('emissive', '#c9d6dc', w - 0.12, h - 0.42, 0.01, 0, 0.36, 0.01);
  },
};
