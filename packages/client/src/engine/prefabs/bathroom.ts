/**
 * Bathroom and hallway: bathtub, shower, toilet, washbasin, towel rack, laundry basket, wall
 * mirror, coat rack, umbrella stand.
 *
 * Colours: `bathtub` [tub, tap]; `shower` [tray, glass]; `toilet` [ceramic];
 * `washbasin` [ceramic, tap]; `towel_rack` [rail, towel]; `laundry_basket` [wicker];
 * `mirror_wall` [frame]; `coat_rack` [wood]; `umbrella_stand` [body].
 */
import { shade } from './kit.js';
import type { RecipeTable } from './recipe.js';

const CHROME = '#b8bcc0';

export const BATHROOM_HALLWAY: RecipeTable<
  | 'bathtub'
  | 'shower'
  | 'toilet'
  | 'washbasin'
  | 'towel_rack'
  | 'laundry_basket'
  | 'mirror_wall'
  | 'coat_rack'
  | 'umbrella_stand'
> = {
  // Tub walls around a water-blue basin; the tap at the back, against the wall.
  bathtub: ({ b, w, d, h, color }) => {
    const tub = color(0, '#f5f7f8');
    const tap = color(1, CHROME);
    const t = 0.08;
    b.box('solid', shade(tub, 0.92), w, 0.12, d, 0, 0, 0);
    b.box('solid', tub, w, h - 0.12, t, 0, 0.12, -d / 2 + t / 2);
    b.box('solid', tub, w, h - 0.12, t, 0, 0.12, d / 2 - t / 2);
    for (const sx of [-1, 1])
      b.box('solid', tub, t, h - 0.12, d - 2 * t, sx * (w / 2 - t / 2), 0.12, 0);
    b.box('solid', '#9fc7d6', w - 2 * t, 0.02, d - 2 * t, 0, h - 0.18, 0);
    b.cylinder('solid', tap, 0.02, 0.02, 0.18, -w / 2 + 0.25, h, -d / 2 + 0.04, 8);
    b.box('solid', tap, 0.03, 0.03, 0.12, -w / 2 + 0.25, h + 0.15, -d / 2 + 0.09);
  },
  // Corner shower: tray, two glass panels, a riser and a rain head.
  shower: ({ b, w, d, h, color }) => {
    const tray = color(0, '#f5f7f8');
    const glass = color(1, '#cfe3ea');
    b.box('solid', tray, w, 0.08, d, 0, 0, 0);
    b.box('emissive', shade(glass, 1.05), 0.02, h - 0.1, d - 0.02, w / 2 - 0.01, 0.08, 0.01);
    b.box('emissive', glass, w * 0.55, h - 0.1, 0.02, w * 0.2, 0.08, d / 2 - 0.01);
    b.cylinder('solid', CHROME, 0.015, 0.015, h - 0.25, -w / 2 + 0.06, 0.08, -d / 2 + 0.06, 8);
    b.box('solid', CHROME, 0.03, 0.03, 0.3, -w / 2 + 0.06, h - 0.2, -d / 2 + 0.2);
    b.cylinder('solid', CHROME, 0.12, 0.12, 0.02, -w / 2 + 0.2, h - 0.22, -d / 2 + 0.35, 12);
  },
  // Cistern against the wall, bowl in front, seat and lid.
  toilet: ({ b, w, d, h, color }) => {
    const ceramic = color(0, '#ffffff');
    b.box('solid', ceramic, w, h - 0.38, 0.18, 0, 0.38, -d / 2 + 0.09);
    // Flush button stands 1 cm proud of the cistern lid.
    b.box('solid', shade(ceramic, 0.92), w * 0.4, 0.02, 0.06, 0, h - 0.01, -d / 2 + 0.09);
    const bz = d / 2 - 0.2;
    b.lathe(
      'solid',
      ceramic,
      [
        [0.0, 0],
        [0.12, 0],
        [0.13, 0.15],
        [0.19, 0.38],
        [0.0, 0.38],
      ],
      0,
      0,
      bz,
      12,
    );
    b.cylinder('solid', shade(ceramic, 0.95), 0.2, 0.2, 0.03, 0, 0.38, bz, 12);
    b.box('solid', ceramic, w * 0.7, 0.04, 0.2, 0, 0.38, -d / 2 + 0.25);
  },
  washbasin: ({ b, w, d, h, color }) => {
    const ceramic = color(0, '#dfe9ec');
    const tap = color(1, CHROME);
    b.lathe(
      'solid',
      ceramic,
      [
        [0, 0],
        [0.12, 0],
        [0.09, 0.1],
        [0.08, h - 0.2],
        [0.12, h - 0.15],
        [0, h - 0.15],
      ],
      0,
      0,
      -0.05,
      10,
    );
    b.box('solid', ceramic, w, 0.15, d, 0, h - 0.15, 0);
    b.box('solid', '#9fc7d6', w - 0.14, 0.01, d - 0.16, 0, h, 0.03);
    b.cylinder('solid', tap, 0.015, 0.015, 0.12, 0, h, -d / 2 + 0.05, 8);
    b.box('solid', tap, 0.025, 0.025, 0.1, 0, h + 0.1, -d / 2 + 0.09);
  },
  // Wall-hung at its mount height: two rails with a towel over the front one.
  towel_rack: ({ b, w, d, h, meta, color }) => {
    const rail = color(0, CHROME);
    const towel = color(1, '#d8cbb0');
    const y0 = (meta.mountY ?? 1.0) - h / 2;
    for (const sx of [-1, 1])
      b.box('solid', rail, 0.03, h, 0.05, sx * (w / 2 - 0.015), y0, -d / 2 + 0.025);
    for (const y of [y0 + 0.25, y0 + h - 0.15])
      b.rod('solid', rail, 0.015, w, 0, y, -d / 2 + 0.1, 8);
    b.box('solid', towel, w * 0.7, h * 0.55, 0.03, 0, y0 + h - 0.15 - h * 0.55, -d / 2 + 0.12);
  },
  laundry_basket: ({ b, w, h, color }) => {
    const wicker = color(0, '#c4a46b');
    b.cylinder('solid', wicker, w / 2 - 0.01, w / 2 - 0.04, h - 0.03, 0, 0, 0, 10);
    b.cylinder('solid', shade(wicker, 0.8), w / 2, w / 2, 0.03, 0, h - 0.03, 0, 10);
  },
  // Wall-hung mirror: frame and a pale glass face.
  mirror_wall: ({ b, w, d, h, meta, color }) => {
    const frame = color(0, '#6e4f35');
    const y0 = (meta.mountY ?? 1.5) - h / 2;
    b.box('solid', frame, w, h, 0.04, 0, y0, -d / 2 + 0.02);
    b.box('emissive', '#c9d6dc', w - 0.08, h - 0.08, 0.01, 0, y0 + 0.04, -d / 2 + 0.045);
  },
  // Pole with a cross base and hooks, one coat hanging.
  coat_rack: ({ b, w, h, color }) => {
    const wood = color(0, '#3d2b1f');
    for (const axis of [0, 1])
      b.box('solid', wood, axis === 0 ? w : 0.05, 0.04, axis === 0 ? 0.05 : w, 0, 0, 0);
    b.cylinder('solid', wood, 0.025, 0.03, h - 0.04, 0, 0.04, 0, 8);
    b.sphere('solid', wood, 0.04, 0, h - 0.02, 0, [1, 1, 1], [6, 4]);
    for (const [x, z] of [
      [0.12, 0],
      [-0.12, 0],
      [0, 0.12],
      [0, -0.12],
    ] as const) {
      b.box('solid', wood, Math.abs(x) + 0.02, 0.02, Math.abs(z) + 0.02, x / 2, h - 0.2, z / 2);
    }
    b.box('solid', '#4a5b6e', 0.36, 0.7, 0.12, 0, h - 0.95, 0.12);
  },
  umbrella_stand: ({ b, w, h, color }) => {
    const body = color(0, '#2f3a40');
    b.cylinder('solid', body, w / 2 - 0.01, w / 2 - 0.03, h - 0.15, 0, 0, 0, 10);
    b.rod('solid', '#1b1b1f', 0.012, 0.25, 0.02, h - 0.12, 0.0, 6, 'z');
    b.cylinder('solid', '#8f2f2f', 0.015, 0.015, 0.15, -0.03, h - 0.15, 0.02, 6);
  },
};
