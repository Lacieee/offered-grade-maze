import { RoomDTOSchema, type RoomDTO } from '@ogm/shared';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import generated from './__fixtures__/generated-rooms.json';
import { buildRoom } from './buildRoom.js';

/**
 * CP06 T2 budget on generated rooms: the most furnished room of each type from five Hard seeds
 * (written with the generator, `pnpm gen`; see the fixture's `seed` fields).
 */
const ROOMS: { seed: string; room: RoomDTO }[] = (
  generated as { seed: string; room: unknown }[]
).map((r) => ({ seed: r.seed, room: RoomDTOSchema.parse(r.room) }));

function cost(room: RoomDTO): { drawCalls: number; triangles: number } {
  const view = buildRoom(room);
  let drawCalls = 0;
  let triangles = 0;
  view.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    drawCalls++;
    const g = o.geometry as THREE.BufferGeometry;
    triangles += (g.index?.count ?? g.getAttribute('position').count) / 3;
  });
  view.dispose();
  return { drawCalls, triangles };
}

describe('room budget (CP06 T2)', () => {
  it('covers at least 20 generated rooms of every type', () => {
    expect(ROOMS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(ROOMS.map((r) => r.room.type)).size).toBe(6);
  });

  it.each(ROOMS.map((r) => [`${r.seed} ${r.room.id} ${r.room.type}`, r.room] as const))(
    '%s: ≤ 60 draw calls and ≤ 60 000 triangles',
    (_name, room) => {
      const { drawCalls, triangles } = cost(room);
      expect(drawCalls).toBeLessThanOrEqual(60);
      expect(triangles).toBeLessThanOrEqual(60_000);
    },
  );
});
