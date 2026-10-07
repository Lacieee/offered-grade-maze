/**
 * Portal meshes (CP03 T2): a box 1.0 × 2.1 × PORTAL_BOX_DEPTH behind the portal plane of
 * every linked door, drawn on both sides with a screen-space shader that shows the child
 * pass's render target.
 *
 * Why a box: when the camera's near plane cuts through the doorway it still sees box faces
 * carrying the same screen-space image, so no gap or flash appears.
 */
import { DOOR_HEIGHT, DOOR_WIDTH, PORTAL_BOX_DEPTH } from '@ogm/shared';
import * as THREE from 'three';

/** Uniforms of a portal material, set per render pass. */
export interface PortalUniforms {
  [uniform: string]: THREE.IUniform;
  portalTex: THREE.IUniform<THREE.Texture>;
  viewportSize: THREE.IUniform<THREE.Vector2>;
  fallbackColor: THREE.IUniform<THREE.Color>;
  useFallback: THREE.IUniform<boolean>;
  /** Debug tint: rgb colour and mix amount in `w` (0 = off). */
  tint: THREE.IUniform<THREE.Vector4>;
}

/** A portal mesh and its material. */
export interface PortalView {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  uniforms: PortalUniforms;
}

const VERTEX = /* glsl */ `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D portalTex;
uniform vec2 viewportSize;
uniform vec3 fallbackColor;
uniform bool useFallback;
uniform vec4 tint;

void main() {
  vec4 color = useFallback
    ? vec4(fallbackColor, 1.0)
    : vec4(texture2D(portalTex, gl_FragCoord.xy / viewportSize).rgb, 1.0);
  color.rgb = mix(color.rgb, tint.rgb, tint.w);
  gl_FragColor = color;
  // Render targets stay linear; only the final screen pass converts to sRGB.
  #include <colorspace_fragment>
}
`;

/** 1 × 1 black texture bound while a portal shows its fallback colour. */
const EMPTY_TEXTURE = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
EMPTY_TEXTURE.needsUpdate = true;

/** The portal box in door-local coordinates: x ∈ ±0.5, y ∈ [0, 2.1], z ∈ [−0.25, 0]. */
export function portalBoxGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(DOOR_WIDTH, DOOR_HEIGHT, PORTAL_BOX_DEPTH);
  g.translate(0, DOOR_HEIGHT / 2, -PORTAL_BOX_DEPTH / 2);
  return g;
}

/** Creates the portal shader material (shared program for every portal). */
export function createPortalMaterial(): THREE.ShaderMaterial & { uniforms: PortalUniforms } {
  const uniforms: PortalUniforms = {
    portalTex: { value: EMPTY_TEXTURE },
    viewportSize: { value: new THREE.Vector2(1, 1) },
    fallbackColor: { value: new THREE.Color(0x111111) },
    useFallback: { value: true },
    tint: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  const material = new THREE.ShaderMaterial({
    name: 'portal',
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.DoubleSide,
  });
  return material as THREE.ShaderMaterial & { uniforms: PortalUniforms };
}

/** Creates the portal mesh for a door, placed with the door's anchor matrix. */
export function createPortalView(anchorMatrix: THREE.Matrix4, name: string): PortalView {
  const geometry = portalBoxGeometry();
  geometry.applyMatrix4(anchorMatrix);
  const material = createPortalMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  return { mesh, uniforms: material.uniforms };
}

/** Points a portal at a child pass's texture. */
export function showTexture(p: PortalView, texture: THREE.Texture, viewport: THREE.Vector2): void {
  p.uniforms.portalTex.value = texture;
  p.uniforms.viewportSize.value.copy(viewport);
  p.uniforms.useFallback.value = false;
}

/** Makes a portal show its flat fallback colour. */
export function showFallback(p: PortalView, color: THREE.Color): void {
  p.uniforms.portalTex.value = EMPTY_TEXTURE;
  p.uniforms.fallbackColor.value.copy(color);
  p.uniforms.useFallback.value = true;
}
