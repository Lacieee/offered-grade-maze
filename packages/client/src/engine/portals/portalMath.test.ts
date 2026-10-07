import { WALLS, doorFrame, type DoorFrame, type Wall } from '@ogm/shared';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIXTURE_ROOMS } from '../../dev/fixtures/index.js';
import { forwardVector } from '../player/physics.js';
import {
  arrivalClipPlane,
  doorMatrix,
  fromDoorLocal,
  normalizeAngle,
  obliqueProjection,
  portalTransform,
  rotateXZ,
  toDoorLocal,
  transformPointXZ,
  yawDelta,
} from './portalMath.js';

const roomA = { width: 6, depth: 7 };
const roomB = { width: 4.5, depth: 5 };
const EPS = 1e-3;
const TOL = 1e-9;

const pairs: [Wall, Wall][] = WALLS.flatMap((a) => WALLS.map((b) => [a, b] as [Wall, Wall]));
const frameA = (wall: Wall): DoorFrame => doorFrame(roomA, { wall, offset: 0.7 });
const frameB = (wall: Wall): DoorFrame => doorFrame(roomB, { wall, offset: -0.4 });

/** Door-local point → room point, via the frame matrix. */
const local = (f: DoorFrame, x: number, y: number, z: number) =>
  new THREE.Vector3(x, y, z).applyMatrix4(doorMatrix(f));
/** Room point → door-local point. */
const toLocal = (f: DoorFrame, p: THREE.Vector3) => p.clone().applyMatrix4(doorMatrix(f).invert());

describe('doorMatrix', () => {
  it('maps door-local axes to the frame vectors and origin', () => {
    for (const wall of WALLS) {
      const f = frameA(wall);
      const o = local(f, 0, 0, 0);
      const x = local(f, 1, 0, 0).sub(o);
      const z = local(f, 0, 0, 1).sub(o);
      expect(o.distanceTo(new THREE.Vector3(f.origin.x, f.origin.y, f.origin.z))).toBeLessThan(TOL);
      expect(x.x).toBeCloseTo(f.right.x, 12);
      expect(x.z).toBeCloseTo(f.right.z, 12);
      expect(z.x).toBeCloseTo(f.inward.x, 12);
      expect(z.z).toBeCloseTo(f.inward.z, 12);
    }
  });
});

describe('portalTransform', () => {
  it.each(pairs)('%s → %s: door-local (x, y, −ε) of D lands at (−x, y, +ε) of E', (wa, wb) => {
    const d = frameA(wa);
    const e = frameB(wb);
    const t = portalTransform(d, e);
    for (const [x, y] of [
      [0.3, 1.65],
      [-0.45, 0.2],
      [0, 2.0],
    ] as const) {
      const p = local(d, x, y, -EPS).applyMatrix4(t);
      const q = toLocal(e, p);
      expect(q.x).toBeCloseTo(-x, 9);
      expect(q.y).toBeCloseTo(y, 9);
      expect(q.z).toBeCloseTo(EPS, 9);
    }
    // A proper rotation, never a mirror.
    expect(t.determinant()).toBeCloseTo(1, 12);
  });

  it.each(pairs)(
    '%s → %s: a camera rotated by yawDelta keeps its heading relative to the doors',
    (wa, wb) => {
      const d = frameA(wa);
      const e = frameB(wb);
      const t = portalTransform(d, e);
      const dy = yawDelta(d, e);
      for (const yaw of [0, 0.4, -2.2, Math.PI]) {
        const f = forwardVector(yaw);
        const dir = new THREE.Vector3(f.x, 0, f.z).transformDirection(t);
        const g = forwardVector(yaw + dy);
        expect(dir.x).toBeCloseTo(g.x, 9);
        expect(dir.z).toBeCloseTo(g.z, 9);
        // Heading relative to the door normal is preserved (inward of D ↔ outward of E).
        const relD = f.x * d.inward.x + f.z * d.inward.z;
        const relE = g.x * -e.inward.x + g.z * -e.inward.z;
        expect(relE).toBeCloseTo(relD, 9);
      }
      expect(dy).toBeGreaterThan(-Math.PI);
      expect(dy).toBeLessThanOrEqual(Math.PI);
    },
  );

  it.each(pairs)('%s ↔ %s reciprocal pair: T(E→D) · T(D→E) = identity', (wa, wb) => {
    const d = frameA(wa);
    const e = frameB(wb);
    const round = portalTransform(e, d).multiply(portalTransform(d, e));
    const id = new THREE.Matrix4();
    round.elements.forEach((v, i) => {
      expect(Math.abs(v - (id.elements[i] ?? 0))).toBeLessThan(TOL);
    });
  });

  it('is the identity round trip for every reciprocal pair in the fixture house', () => {
    let checked = 0;
    for (const room of FIXTURE_ROOMS) {
      for (const door of room.doors) {
        if (!door.link) continue;
        const target = FIXTURE_ROOMS.find((r) => r.id === door.link?.room);
        const back = target?.doors.find((x) => x.id === door.link?.door);
        if (!target || !back || back.link?.room !== room.id || back.link.door !== door.id) continue;
        const d = doorFrame(room, door);
        const e = doorFrame(target, back);
        const round = portalTransform(e, d).multiply(portalTransform(d, e));
        expect(round.equals(new THREE.Matrix4()) || maxAbsDiff(round) < TOL).toBe(true);
        checked++;
      }
    }
    expect(checked).toBe(6); // r00.d0↔r01.d0, r03.d1↔r05.d0, r04.d1↔r05.d1, both directions
  });
});

function maxAbsDiff(m: THREE.Matrix4): number {
  const id = new THREE.Matrix4().elements;
  return Math.max(...m.elements.map((v, i) => Math.abs(v - (id[i] ?? 0))));
}

describe('2D helpers', () => {
  it.each(pairs)('%s → %s: transformPointXZ agrees with the matrix', (wa, wb) => {
    const d = frameA(wa);
    const e = frameB(wb);
    const t = portalTransform(d, e);
    const p = new THREE.Vector3(0.8, 1.65, -1.2).applyMatrix4(t);
    const q = transformPointXZ(d, e, 0.8, -1.2);
    expect(q.x).toBeCloseTo(p.x, 9);
    expect(q.z).toBeCloseTo(p.z, 9);
  });

  it('toDoorLocal and fromDoorLocal are inverses', () => {
    const f = frameA('E');
    const l = toDoorLocal(f, 1.2, -0.7);
    const back = fromDoorLocal(f, l.x, l.z);
    expect(back.x).toBeCloseTo(1.2, 12);
    expect(back.z).toBeCloseTo(-0.7, 12);
  });

  it('rotateXZ matches THREE.Matrix4.makeRotationY', () => {
    const v = new THREE.Vector3(0.3, 0, -0.8).applyMatrix4(new THREE.Matrix4().makeRotationY(1.1));
    const r = rotateXZ(0.3, -0.8, 1.1);
    expect(r.x).toBeCloseTo(v.x, 12);
    expect(r.z).toBeCloseTo(v.z, 12);
  });

  it('normalizeAngle maps to (−π, π]', () => {
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(3 * Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1);
    expect(normalizeAngle(-0.5)).toBe(-0.5);
  });
});

describe('obliqueProjection', () => {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 50);
  camera.position.set(0.2, 1.65, 3);
  camera.updateMatrixWorld();

  it('keeps x, y and w of projected points (screen positions unchanged)', () => {
    const plane = new THREE.Vector4(0, 0, -1, -1); // view-space plane z = −1
    const oblique = obliqueProjection(camera.projectionMatrix, plane);
    const p = new THREE.Vector4(0.3, -0.2, -4, 1);
    const a = p.clone().applyMatrix4(camera.projectionMatrix);
    const b = p.clone().applyMatrix4(oblique);
    expect(b.x).toBeCloseTo(a.x, 12);
    expect(b.y).toBeCloseTo(a.y, 12);
    expect(b.w).toBeCloseTo(a.w, 12);
  });

  it('puts the near plane on the clip plane: points on it map to NDC z = −1', () => {
    const f = doorFrame(roomB, { wall: 'S', offset: 0.3 });
    // Camera outside room B, behind the S door, looking in (toward −Z).
    const cam = camera.clone();
    cam.position.set(0, 1.65, 4.5);
    cam.updateMatrixWorld();
    const clip = arrivalClipPlane(f, cam.matrixWorldInverse);
    const oblique = obliqueProjection(cam.projectionMatrix, clip);
    // A point on the clip plane (door-local z = −0.001) and one just inside the room.
    const onPlane = local(f, 0.2, 1.0, -0.001);
    const inside = local(f, 0.2, 1.0, 0.5);
    const behind = local(f, 0.2, 1.0, -0.2);
    const ndcZ = (p: THREE.Vector3) => {
      const v = new THREE.Vector4(p.x, p.y, p.z, 1)
        .applyMatrix4(cam.matrixWorldInverse)
        .applyMatrix4(oblique);
      return v.z / v.w;
    };
    expect(ndcZ(onPlane)).toBeCloseTo(-1, 6);
    expect(ndcZ(inside)).toBeGreaterThan(-1);
    expect(ndcZ(inside)).toBeLessThan(1);
    expect(ndcZ(behind)).toBeLessThan(-1); // clipped
  });
});
