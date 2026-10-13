import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { goalSource } from './goalSource.js';

/** A portal transform: rotate by `yaw` about Y, then translate. */
const T = (yaw: number, x: number, z: number) =>
  new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);

describe('goalSource (CP09 T5)', () => {
  const goal = new THREE.Vector3(0, 1.2, 0);

  it('in the goal room: the diploma itself, no attenuation', () => {
    expect(goalSource('r05', 'r05', goal, [])).toEqual({
      position: goal,
      level: 0,
      attenuationDb: 0,
    });
  });

  it('through a doorway: the goal mapped back into the current room, −6 dB per level', () => {
    // The goal room lies "north" of a door at z = −3 of the current room: its centre is 4 m
    // further, so goal-room = current-room + (0, 0, 4) after a half turn.
    const cameraFromRoot = T(Math.PI, 0, -7); // current → goal room coordinates
    const s = goalSource('r00', 'r05', goal, [
      { room: 'r00', level: 0, cameraFromRoot: new THREE.Matrix4() },
      { room: 'r05', level: 1, cameraFromRoot },
    ]);
    expect(s?.level).toBe(1);
    expect(s?.attenuationDb).toBe(-6);
    // Mapping the source forward again gives the goal back.
    expect(s?.position.clone().applyMatrix4(cameraFromRoot).distanceTo(goal)).toBeCloseTo(0, 6);
    expect(s?.position.z).toBeCloseTo(-7, 6);
  });

  it('uses the shallowest node showing the goal room', () => {
    const deep = { room: 'r05', level: 3, cameraFromRoot: T(0, 0, 30) };
    const shallow = { room: 'r05', level: 2, cameraFromRoot: T(0, 0, 10) };
    const s = goalSource('r00', 'r05', goal, [deep, shallow]);
    expect(s?.level).toBe(2);
    expect(s?.attenuationDb).toBe(-12);
    expect(s?.position.z).toBeCloseTo(-10, 6);
  });

  it('silent when no portal shows the goal room', () => {
    expect(
      goalSource('r00', 'r05', goal, [{ room: 'r02', level: 1, cameraFromRoot: T(0, 1, 1) }]),
    ).toBeNull();
  });
});
