/**
 * Animated furniture parts (CP06 review): swimming aquarium fish and TV static.
 *
 * Both run entirely on the GPU from one shared time uniform, so the room meshes stay merged
 * and static (no per-frame geometry updates, one draw call each). The engine advances the
 * time every frame; tests freeze it, so screenshots stay deterministic.
 */
import * as THREE from 'three';

/** Shared animation time in seconds (the engine and the prefab gallery advance it). */
export const ambientTime: THREE.IUniform<number> = { value: 0 };

/** Brightness of a fish's own glow (the tank lights it), as a fraction of its colour. */
const FISH_GLOW = 0.35;

/** How sharply a fish turns at each end of its swim (higher = quicker turn). */
const TURN = 5;

/** Static: cells across and down the screen, and new frames per second. */
const STATIC_CELLS = [120, 68] as const;
const STATIC_FPS = 20;

/**
 * Where a swimming vertex is at time `t` along its swim direction, relative to where it was
 * built: the swimmer travels `amplitude · sin(speed · t + phase)` and faces where it goes,
 * squashing to nothing and growing back the other way round as it turns. Matches the vertex
 * shader (tests).
 */
export function swimOffset(
  offset: number,
  amplitude: number,
  phase: number,
  speed: number,
  t: number,
): number {
  const a = speed * t + phase;
  const facing = Math.min(1, Math.max(-1, Math.cos(a) * TURN));
  return amplitude * Math.sin(a) + (facing - 1) * offset;
}

/** Lambert material for swimming parts (vertex colours, a little self-light). */
export function swimMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.name = 'swim';
  m.onBeforeCompile = (shader) => {
    shader.uniforms.ogmTime = ambientTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float ogmTime;
attribute vec3 swimDir;
attribute vec4 swim;
attribute float swimSide;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
float ogmTurn = cos(ogmTime * swim.w + swim.z) < 0.0 ? -1.0 : 1.0;
// Facing back: the swimmer is turned half round, and so are its normals.
vec3 ogmUp = vec3(0.0, 1.0, 0.0);
objectNormal = mix(objectNormal, objectNormal * vec3(-1.0, 1.0, -1.0), step(ogmTurn, 0.0));`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
float ogmArg = ogmTime * swim.w + swim.z;
float ogmFacing = clamp(cos(ogmArg) * ${TURN.toFixed(1)}, -1.0, 1.0);
// Squash along the swim to nothing and grow back the other way round; flipping the side
// offset too keeps it a half turn (a mirror image would turn the faces inside out).
vec3 ogmSide = cross(swimDir, ogmUp);
transformed += swimDir * (swim.y * sin(ogmArg) + (ogmFacing - 1.0) * swim.x);
transformed += ogmSide * (sign(ogmFacing) - 1.0) * swimSide;
transformed.y += 0.012 * sin(ogmArg * 2.7 + swim.z * 1.3);`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * ${FISH_GLOW.toFixed(2)};`,
    );
  };
  m.customProgramCacheKey = () => 'ogm-swim';
  return m;
}

/** Unlit material for TV screens: grey static with a slow rolling band. */
export function screenMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.name = 'screen';
  m.onBeforeCompile = (shader) => {
    shader.uniforms.ogmTime = ambientTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vOgmUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvOgmUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float ogmTime;
varying vec2 vOgmUv;
// Small-input hash (no large sin arguments: stable on mobile GPUs).
float ogmHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec2 ogmCell = floor(vOgmUv * vec2(${STATIC_CELLS[0].toFixed(1)}, ${STATIC_CELLS[1].toFixed(1)}));
float ogmFrame = mod(floor(ogmTime * ${STATIC_FPS.toFixed(1)}), 97.0);
float ogmNoise = ogmHash(ogmCell + vec2(ogmFrame * 13.0, ogmFrame * 7.0));
float ogmBand = 0.8 + 0.2 * smoothstep(0.0, 0.15, abs(fract(vOgmUv.y * 0.8 - ogmTime * 0.3) - 0.5));
diffuseColor.rgb *= vec3(0.12 + 0.78 * ogmNoise) * ogmBand;`,
      );
  };
  m.customProgramCacheKey = () => 'ogm-static';
  return m;
}
