import { DOOR_HEIGHT, DOOR_WIDTH, WALL_HALF, type RoomDTO } from '@ogm/shared';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIXTURE_ROOMS, fixtureRoom } from '../../dev/fixtures/index.js';
import type { SegmentCollider } from '../player/physics.js';
import { buildRoom } from './buildRoom.js';
import {
  CASING_DEPTH,
  CASING_WIDTH,
  DEFAULT_FURNITURE,
  furnitureFootprint,
  layoutRoom,
  solidIntervals,
} from './layout.js';
import { HEMI_INTENSITY, POINT_LIGHT_SCALE } from './lightRig.js';

const room = (id: string): RoomDTO => {
  const r = fixtureRoom(id);
  if (!r) throw new Error(`missing fixture ${id}`);
  return r;
};

const segments = (r: RoomDTO, tag: SegmentCollider['tag']) =>
  layoutRoom(r).colliders.filter(
    (c): c is SegmentCollider => c.kind === 'segment' && c.tag === tag,
  );

describe('solidIntervals', () => {
  it('cuts openings out of a range', () => {
    expect(solidIntervals(-3, 3, [[-0.5, 0.5]])).toEqual([
      [-3, -0.5],
      [0.5, 3],
    ]);
    expect(
      solidIntervals(0, 10, [
        [6, 7],
        [1, 2],
      ]),
    ).toEqual([
      [0, 1],
      [2, 6],
      [7, 10],
    ]);
    expect(solidIntervals(0, 1, [[-1, 2]])).toEqual([]);
    expect(solidIntervals(0, 1, [])).toEqual([[0, 1]]);
  });
});

describe('furnitureFootprint', () => {
  const base = { id: 'f00', prefab: 'desk', x: 1, z: 2, variant: 0, colors: [] };
  it('uses params and swaps width and depth on odd quarter turns', () => {
    const params = { w: 2, h: 0.7, d: 1 };
    expect(furnitureFootprint({ ...base, rot: 0, params })).toEqual({
      minX: 0,
      maxX: 2,
      minZ: 1.5,
      maxZ: 2.5,
      h: 0.7,
    });
    expect(furnitureFootprint({ ...base, rot: 1, params })).toMatchObject({
      minX: 0.5,
      maxX: 1.5,
      minZ: 1,
      maxZ: 3,
    });
  });

  it('falls back to 0.6 × 0.8 × 0.6 m', () => {
    const fp = furnitureFootprint({ ...base, rot: 2 });
    expect(fp.maxX - fp.minX).toBeCloseTo(DEFAULT_FURNITURE.w);
    expect(fp.h).toBe(DEFAULT_FURNITURE.h);
  });
});

describe('layoutRoom', () => {
  it('leaves a gap in the wall colliders at every door', () => {
    // r03: 3.5 × 3.5, d1 on the N wall at offset 0.5 → opening x ∈ [0, 1].
    const north = segments(room('r03'), 'wall').filter((s) => s.az === -1.75 && s.bz === -1.75);
    expect(north.map((s) => [s.ax, s.bx])).toEqual([
      [-1.75, 0],
      [1, 1.75],
    ]);
  });

  it('adds two jamb segments per door, from the footprint edge to the portal plane', () => {
    const r = room('r00');
    const jambs = segments(r, 'jamb');
    expect(jambs).toHaveLength(r.doors.length * 2);
    for (const j of jambs) {
      expect(Math.hypot(j.bx - j.ax, j.bz - j.az)).toBeCloseTo(WALL_HALF);
    }
  });

  it('closes sealed doors at the panel; linked openings get a conditional portal block', () => {
    const r = room('r01'); // d3 (E) is sealed, the rest are linked
    expect(segments(r, 'portal-block')).toHaveLength(0);
    const blocks = layoutRoom(r).portalBlocks;
    expect([...blocks.keys()].sort()).toEqual(['d0', 'd1', 'd2']);
    for (const b of blocks.values()) {
      expect(Math.hypot(b.bx - b.ax, b.bz - b.az)).toBeCloseTo(DOOR_WIDTH);
    }
    const sealed = segments(r, 'sealed-door');
    expect(sealed).toHaveLength(1);
    const [s] = sealed;
    // E wall at x = 2.5: panel inner face at 2.5 + 0.15 − 0.04.
    expect(s?.ax).toBeCloseTo(2.5 + WALL_HALF - 0.04);
    expect(Math.abs((s?.bz ?? 0) - (s?.az ?? 0))).toBeCloseTo(DOOR_WIDTH);
  });

  it('builds casings of the specified size and a door panel only for sealed doors', () => {
    const { boxes } = layoutRoom(room('r01'));
    const trim = boxes.filter((b) => b.mat === 'doorframe');
    expect(trim).toHaveLength(4 * 3);
    const depths = trim.map((b) => Math.min(b.max[0] - b.min[0], b.max[2] - b.min[2]));
    for (const d of depths) expect(d).toBeCloseTo(CASING_DEPTH);
    const head = trim.find((b) => b.min[1] === DOOR_HEIGHT);
    expect(head && Math.max(head.max[0] - head.min[0], head.max[2] - head.min[2])).toBeCloseTo(
      DOOR_WIDTH + 2 * CASING_WIDTH,
    );
    expect(boxes.filter((b) => b.mat === 'panel')).toHaveLength(1);
    expect(boxes.filter((b) => b.mat === 'handle')).toHaveLength(1);
  });

  it('makes one furniture collider per item', () => {
    const r = room('r05');
    expect(layoutRoom(r).colliders.filter((c) => c.kind === 'box')).toHaveLength(
      r.furniture.length,
    );
  });
});

describe('buildRoom', () => {
  it.each(FIXTURE_ROOMS.map((r) => [r.id, r] as const))(
    '%s: exactly 1 hemisphere light and 4 point lights',
    (_id, dto) => {
      const view = buildRoom(dto);
      const hemis: THREE.HemisphereLight[] = [];
      const points: THREE.PointLight[] = [];
      view.scene.traverse((o) => {
        if (o instanceof THREE.HemisphereLight) hemis.push(o);
        if (o instanceof THREE.PointLight) points.push(o);
      });
      expect(hemis).toHaveLength(1);
      expect(points).toHaveLength(4);
      expect(view.lights.points).toHaveLength(4);
      expect(hemis[0]?.intensity).toBe(HEMI_INTENSITY);
      expect(points.map((p) => p.intensity)).toEqual([POINT_LIGHT_SCALE, 0, 0, 0]);
      view.dispose();
    },
  );

  it.each(FIXTURE_ROOMS.map((r) => [r.id, r] as const))(
    '%s: at most 60 meshes (one draw call each)',
    (_id, dto) => {
      const view = buildRoom(dto);
      let meshes = 0;
      view.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          meshes++;
          expect(Array.isArray(o.material)).toBe(false);
        }
      });
      expect(meshes).toBeGreaterThan(0);
      expect(meshes).toBeLessThanOrEqual(60);
      view.dispose();
    },
  );

  it('exposes every door with its frame, link and anchor', () => {
    const view = buildRoom(room('r01'));
    expect([...view.doors.keys()]).toEqual(['d0', 'd1', 'd2', 'd3']);
    const d3 = view.doors.get('d3');
    expect(d3?.link).toBeNull();
    expect(d3?.anchor.position.x).toBeCloseTo(2.5 + WALL_HALF);
    expect(view.doors.get('d0')?.link).toEqual({ room: 'r00', door: 'd0' });
    view.dispose();
  });

  it('adds a portal box for linked doors only and a panel for sealed ones', () => {
    const names = (id: string) => {
      const out: string[] = [];
      buildRoom(room(id)).scene.traverse((o) => {
        if (o instanceof THREE.Mesh) out.push(o.name);
      });
      return out;
    };
    expect(names('r01')).toEqual(
      expect.arrayContaining(['portal:d0', 'portal:d1', 'portal:d2', 'panel', 'handle']),
    );
    expect(names('r01')).not.toContain('portal:d3');
    expect(names('r00')).not.toContain('panel');
  });

  it('places each portal box behind the portal plane, 1.0 × 2.1 × 0.25 m, double-sided', () => {
    const view = buildRoom(room('r00'));
    const portal = view.portals.get('d0');
    const door = view.doors.get('d0');
    if (!portal || !door) throw new Error('missing portal');
    const box = new THREE.Box3().setFromBufferAttribute(
      portal.mesh.geometry.getAttribute('position') as THREE.BufferAttribute,
    );
    // r00.d0 is on the N wall (portal plane z = −3.75 − 0.15): box spans z ∈ [−4.15, −3.9].
    expect(box.min.z).toBeCloseTo(-3.9 - 0.25);
    expect(box.max.z).toBeCloseTo(-3.9);
    expect(box.max.x - box.min.x).toBeCloseTo(DOOR_WIDTH);
    expect(box.max.y - box.min.y).toBeCloseTo(DOOR_HEIGHT);
    expect(portal.mesh.material.side).toBe(THREE.DoubleSide);
    expect(view.portals.size).toBe(3);
    view.dispose();
  });

  it('builds a valid scene for a room without furniture or lights', () => {
    const base = room('r03');
    const view = buildRoom({ ...base, furniture: [], lights: [] });
    expect(view.lights.points.every((p) => p.intensity === 0)).toBe(true);
    expect(view.colliders.some((c) => c.kind === 'box')).toBe(false);
    view.dispose();
    expect(view.scene.children).toHaveLength(0);
  });
});

describe('doorways (PD10: identical in every room, so a crossing is invisible)', () => {
  /** Doorway vertices (frame + doorstep) near a door, in door-local coordinates, with colours. */
  function doorwaySignature(roomId: string, doorId: string, tunnelOnly: boolean): string[] {
    const view = buildRoom(room(roomId));
    const door = view.doors.get(doorId);
    if (!door) throw new Error('missing door');
    const toLocal = door.anchor.matrix.clone().invert();
    const out: string[] = [];
    view.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !['doorframe', 'doorstep'].includes(o.name)) return;
      const geometry = o.geometry as THREE.BufferGeometry;
      const pos = geometry.getAttribute('position');
      const col = geometry.getAttribute('color');
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(toLocal);
        if (Math.abs(v.x) > 0.7 || v.z < -1e-6 || v.z > (tunnelOnly ? WALL_HALF + 1e-6 : 0.3)) {
          continue;
        }
        // Rounded, with −0 folded into 0.
        const f = (n: number) => (Math.round(n * 1e4) / 1e4 + 0).toFixed(4);
        const c = [col.getX(i), col.getY(i), col.getZ(i)].map(f).join(',');
        out.push(`${f(Math.abs(v.x))},${f(v.y)},${f(v.z)}|${o.name}|${c}`);
      }
    });
    view.dispose();
    return out.sort();
  }

  it('the tunnel half of every doorway is identical in shape and colour in every room', () => {
    const reference = doorwaySignature('r00', 'd0', true);
    expect(reference.length).toBeGreaterThan(0);
    for (const [r, d] of [
      ['r01', 'd0'],
      ['r02', 'd1'],
      ['r03', 'd1'],
      ['r04', 'd2'],
      ['r05', 'd1'],
    ] as const) {
      expect(doorwaySignature(r, d, true), `${r}.${d}`).toEqual(reference);
    }
  });

  it('doorway materials are unlit, so room lighting cannot make the two halves differ', () => {
    const view = buildRoom(room('r04'));
    const names: string[] = [];
    view.scene.traverse((o) => {
      if (o instanceof THREE.Mesh && ['doorframe', 'doorstep'].includes(o.name)) {
        names.push(o.name);
        expect(o.material).toBeInstanceOf(THREE.MeshBasicMaterial);
      }
    });
    expect(names.sort()).toEqual(['doorframe', 'doorstep']);
    view.dispose();
  });

  it('every doorway has a doorstep spanning the tunnel and a lip into the room', () => {
    const steps = layoutRoom(room('r00')).boxes.filter((b) => b.mat === 'doorstep');
    expect(steps).toHaveLength(3);
    for (const b of steps) expect(b.max[1]).toBeGreaterThan(0);
  });
});
