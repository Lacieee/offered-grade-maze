/**
 * The fixed light rig: every room has exactly one hemisphere light and four point lights.
 *
 * Three.js compiles shader programs per light count, so a constant rig means switching
 * rooms (and, from CP03, rendering several rooms per frame) never recompiles shaders.
 * Unused point lights stay in the scene with intensity 0.
 */
import type { RoomDTO } from '@ogm/shared';
import * as THREE from 'three';

/** Number of point lights in every room. */
export const POINT_LIGHT_COUNT = 4;

/** Hemisphere light intensity (sky = ceiling colour, ground = floor colour). */
export const HEMI_INTENSITY = 0.6;

/**
 * Point-light distance falloff exponent. Linear falloff (1) keeps small rooms from blowing
 * out near the lamp while large rooms stay lit to the corners (physical is 2).
 */
export const POINT_LIGHT_DECAY = 1;

/**
 * Converts `LightDTO.intensity` to Three.js point-light intensity. A DTO intensity of 1
 * lights rooms from a 2.5 m hallway to a 7 × 7.5 m living room comfortably.
 */
export const POINT_LIGHT_SCALE = 8;

/** The four point lights of a room. */
export type PointLights = [THREE.PointLight, THREE.PointLight, THREE.PointLight, THREE.PointLight];

export interface LightRig {
  hemi: THREE.HemisphereLight;
  points: PointLights;
}

function pointLight(): THREE.PointLight {
  const light = new THREE.PointLight(0xffffff, 0, 0, POINT_LIGHT_DECAY);
  light.castShadow = false;
  return light;
}

/** Creates the fixed rig and maps the room's `LightDTO`s onto the point lights in order. */
export function createLightRig(dto: RoomDTO): LightRig {
  const hemi = new THREE.HemisphereLight(
    new THREE.Color(dto.palette.ceiling),
    new THREE.Color(dto.palette.floor),
    HEMI_INTENSITY,
  );
  const points: PointLights = [pointLight(), pointLight(), pointLight(), pointLight()];
  points.forEach((light, i) => {
    const spec = dto.lights[i];
    light.name = `light:${i}`;
    if (spec) {
      light.color.set(spec.color);
      light.intensity = spec.intensity * POINT_LIGHT_SCALE;
      light.position.set(spec.x, spec.y, spec.z);
    } else {
      light.position.set(0, dto.height - 0.2, 0);
    }
  });
  return { hemi, points };
}
