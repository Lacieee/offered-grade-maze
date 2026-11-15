/**
 * Room palettes (CP05 T2) and furniture colour lists. Soft, slightly desaturated domestic
 * colours, each palette with one uncanny touch (usually a trim that is a little too
 * saturated). Data only.
 *
 * Two palettes of one room type differ visibly: their wall colours differ by at least 40 in
 * at least one RGB channel (unit test).
 */
import type { PaletteDTO, RoomType } from '@ogm/shared';

/** Palettes per room type (6 each, so a 24-room house rarely repeats one within a type). */
export const PALETTES: Readonly<Record<RoomType, readonly PaletteDTO[]>> = {
  living: [
    { wall: '#e8d9b5', floor: '#8a6a4a', trim: '#2f7f6f', ceiling: '#f2ece0' },
    { wall: '#a9c4a0', floor: '#6f5338', trim: '#c2452e', ceiling: '#eef0e8' },
    { wall: '#d9a9a8', floor: '#9b7752', trim: '#3d5fa8', ceiling: '#f6f0ec' },
    { wall: '#9fb3d1', floor: '#5c4633', trim: '#d6a21f', ceiling: '#eceff2' },
    { wall: '#d6b46a', floor: '#7d5b3c', trim: '#8a2f6e', ceiling: '#f0e8dc' },
    { wall: '#c8a0d8', floor: '#a08060', trim: '#1f6fa0', ceiling: '#f4f6f0' },
  ],
  kitchen: [
    { wall: '#eedfb1', floor: '#b8b2a6', trim: '#2e8b57', ceiling: '#f7f5ec' },
    { wall: '#a5b9cd', floor: '#9fa7a8', trim: '#d9542b', ceiling: '#f2f7f6' },
    { wall: '#afca9c', floor: '#a59a8a', trim: '#2b5fd9', ceiling: '#faf3e6' },
    { wall: '#dcba66', floor: '#8f8f95', trim: '#c9a400', ceiling: '#f5f0f6' },
    { wall: '#dfafa4', floor: '#c4bcae', trim: '#b8336a', ceiling: '#f0f4ec' },
    { wall: '#cea6d4', floor: '#9a9284', trim: '#178a8a', ceiling: '#f8eee8' },
  ],
  bedroom: [
    { wall: '#99b1d7', floor: '#8b7d73', trim: '#e0b030', ceiling: '#f1f2f8' },
    { wall: '#d3a7ae', floor: '#7a6a62', trim: '#2f8f7a', ceiling: '#f8eff0' },
    { wall: '#a3c2a6', floor: '#6e6258', trim: '#c0392b', ceiling: '#eef5ef' },
    { wall: '#e2d7bb', floor: '#86735f', trim: '#5a3fb0', ceiling: '#f6f2ea' },
    { wall: '#c29ede', floor: '#5f5650', trim: '#e07a2e', ceiling: '#eef1f5' },
    { wall: '#d0b270', floor: '#94806e', trim: '#2a7ab8', ceiling: '#f5eee6' },
  ],
  bathroom: [
    { wall: '#9bb9d9', floor: '#c9cfd2', trim: '#1fa39a', ceiling: '#f4fafa' },
    { wall: '#e4dfbd', floor: '#b4b8b9', trim: '#c23b6b', ceiling: '#faf8f0' },
    { wall: '#a5caa8', floor: '#d6d4cc', trim: '#e0a020', ceiling: '#f0f7f2' },
    { wall: '#d5afb0', floor: '#a9aeb2', trim: '#2f6fd0', ceiling: '#faf2f4' },
    { wall: '#c4a6e0', floor: '#bfc3c4', trim: '#d2552a', ceiling: '#f2f3fa' },
    { wall: '#d2ba72', floor: '#9fa5a8', trim: '#3a9a3a', ceiling: '#fbf8ea' },
  ],
  hallway: [
    { wall: '#ecd5ad', floor: '#6b5440', trim: '#8f2f2f', ceiling: '#f2eee2' },
    { wall: '#dab062', floor: '#5a4a3a', trim: '#d4a017', ceiling: '#eef1ec' },
    { wall: '#dda5a0', floor: '#7a6048', trim: '#24808a', ceiling: '#f3eef2' },
    { wall: '#adc098', floor: '#4f4238', trim: '#3b5ec6', ceiling: '#f7f4ec' },
    { wall: '#a3afc9', floor: '#66503c', trim: '#c4562a', ceiling: '#edf0f2' },
    { wall: '#cc9cd0', floor: '#73604c', trim: '#6a3fa0', ceiling: '#f1ece0' },
  ],
  study: [
    { wall: '#caa85e', floor: '#5e4836', trim: '#9e2a2a', ceiling: '#eeece2' },
    { wall: '#9db894', floor: '#4f4034', trim: '#c79a1a', ceiling: '#eaefea' },
    { wall: '#dccda9', floor: '#6a5240', trim: '#2a6f9e', ceiling: '#f2eee6' },
    { wall: '#93a7c5', floor: '#584a42', trim: '#d0662a', ceiling: '#ececf2' },
    { wall: '#cd9d9c', floor: '#7a6450', trim: '#28806a', ceiling: '#f4f0e2' },
    { wall: '#bc94cc', floor: '#4a3c32', trim: '#3d6fd0', ceiling: '#f0eaea' },
  ],
};

/** Furniture material colours per room type (woods, fabrics, enamel…). */
export const ACCENTS: Readonly<Record<RoomType, readonly string[]>> = {
  living: ['#6b4a2e', '#8c6b4a', '#4a5b6e', '#7a3f35', '#c9b79c', '#3f4a3c', '#a0754d', '#2f2f33'],
  kitchen: ['#e9e4da', '#dfe6ea', '#a0754d', '#404448', '#c8c2b4', '#6d8a7a', '#b5a58a', '#f2efe8'],
  bedroom: ['#e8e2d4', '#5e4630', '#7a5c40', '#9a8fb0', '#c4a99a', '#4f5a6a', '#d8cbb0', '#8a6f5a'],
  bathroom: [
    '#f5f7f8',
    '#ffffff',
    '#dfe9ec',
    '#c9d8dc',
    '#b0c4c8',
    '#e8e2d8',
    '#9fb8bc',
    '#d0d6d8',
  ],
  hallway: ['#3d2b1f', '#8f6a48', '#6e4f35', '#4a4440', '#a08a70', '#2f3a40', '#7a6a5a', '#c0b098'],
  study: ['#6a4a30', '#5a3f2a', '#7d8389', '#2f6f8f', '#222428', '#8a7050', '#4a5a4a', '#b09a7a'],
};

/** Strong colours for signature items, so landmarks stand out. */
export const SIGNATURE_COLORS: readonly string[] = [
  '#c0262d',
  '#e8a317',
  '#1f7a4a',
  '#2456b8',
  '#7a2fa0',
  '#d4572a',
  '#138a8a',
  '#b8336a',
  '#e0d020',
  '#1b1b1f',
  '#f2f2f2',
  '#6e4220',
];

/** Strong reds for the red armchair signature (its first colour). */
export const RED_SHADES: readonly string[] = [
  '#c0262d',
  '#a3161f',
  '#d8343a',
  '#b8336a',
  '#e04a2a',
];

/** Colour of the goal light (CP05 T6). */
export const GOAL_LIGHT = {
  kind: 'goal',
  x: 0,
  y: 1.2,
  z: 0,
  color: '#ffcf6b',
  intensity: 1.2,
} as const;
