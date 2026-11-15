import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  CORE_SIZE,
  GOAL_BOB,
  GOAL_TILT,
  GOAL_YAW_SPEED,
  GoalObject,
  HALO_SIZE,
  LIGHT_PULSE,
  SPARKLES,
  SPARKLE_RADIUS,
  radialTexture,
} from './GoalObject.js';

describe('GoalObject (CP09 T1)', () => {
  const base = { x: 1, y: 1.2, z: -2 };

  it('bobs 8 cm with a 3 s period, turns 0.6 rad/s and is tilted 10° about X', () => {
    const g = new GoalObject(base);
    for (const t of [0, 0.75, 1.5, 2.25, 7.1]) {
      g.update(t);
      expect(g.worldPosition().y).toBeCloseTo(1.2 + GOAL_BOB * Math.sin((2 * Math.PI * t) / 3), 6);
      expect(g.model.rotation.y).toBeCloseTo(GOAL_YAW_SPEED * t, 6);
      expect(g.model.rotation.x).toBeCloseTo(GOAL_TILT, 6);
    }
    expect(g.worldPosition().x).toBe(1);
    expect(g.worldPosition().z).toBe(-2);
    g.dispose();
  });

  it('has a 1.4 m additive halo and 20 sparkles orbiting within 0.6 m', () => {
    const g = new GoalObject(base);
    expect(g.halo.scale.x).toBe(HALO_SIZE);
    expect(g.halo.material.blending).toBe(THREE.AdditiveBlending);
    const pos = g.sparkles.geometry.getAttribute('position');
    expect(pos.count).toBe(SPARKLES);
    for (const t of [0, 3.3, 10]) {
      g.update(t);
      for (let i = 0; i < pos.count; i++) {
        expect(Math.hypot(pos.getX(i), pos.getZ(i))).toBeLessThanOrEqual(SPARKLE_RADIUS + 1e-6);
      }
    }
    g.dispose();
  });

  it('has a hot additive core at the halo centre that follows the bob', () => {
    const g = new GoalObject(base);
    expect(g.core.scale.x).toBe(CORE_SIZE);
    expect(g.core.material.blending).toBe(THREE.AdditiveBlending);
    g.update(0.75);
    expect(g.core.position.y).toBeCloseTo(GOAL_BOB, 6);
    expect(g.halo.position.y).toBeCloseTo(GOAL_BOB, 6);
    g.dispose();
  });

  it('radial textures are opaque inside the plateau and fade to the edge', () => {
    const size = 33;
    const t = radialTexture(size, 1.5, 0.35);
    const data = t.image.data as Uint8Array;
    const alpha = (x: number, y: number) => data[(y * size + x) * 4 + 3];
    expect(alpha(16, 16)).toBe(255);
    expect(alpha(16 + 5, 16)).toBe(255); // 5 / 16 = 0.31 of the radius
    expect(alpha(16 + 10, 16)).toBeLessThan(255);
    expect(alpha(32, 16)).toBe(0);
    expect(alpha(0, 0)).toBe(0);
    t.dispose();
  });

  it('the goal light pulses ±15 % with the bob', () => {
    const light = new THREE.PointLight('#ffcf6b', 10);
    const g = new GoalObject(base, light);
    g.update(0.75); // bob at its top
    expect(light.intensity).toBeCloseTo(10 * (1 + LIGHT_PULSE), 6);
    g.update(2.25); // bottom
    expect(light.intensity).toBeCloseTo(10 * (1 - LIGHT_PULSE), 6);
    g.dispose();
  });

  it('pickup flies toward the eye, grows, fades and finally hides', () => {
    const g = new GoalObject(base);
    g.update(0);
    const eye = new THREE.Vector3(1, 1.65, 0);
    const start = g.worldPosition().distanceTo(eye);
    g.pickup(0.5, eye);
    expect(g.worldPosition().distanceTo(eye)).toBeLessThan(start);
    expect(g.group.scale.x).toBeGreaterThan(1);
    expect(g.group.visible).toBe(true);
    // Time no longer moves it during the pickup.
    const mid = g.worldPosition().clone();
    g.update(5);
    expect(g.worldPosition().equals(mid)).toBe(true);
    g.pickup(1, eye);
    expect(g.group.visible).toBe(false);
    g.dispose();
  });
});
