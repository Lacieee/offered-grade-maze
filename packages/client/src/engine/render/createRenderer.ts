/**
 * Renderer and camera setup (CP02 T1.6).
 */
import * as THREE from 'three';
import { UnsupportedError } from '../util/errors.js';

/** Vertical field of view (degrees). Settings may change it in CP09 (60–90°). */
export const DEFAULT_FOV = 75;
/** Near plane (m). Small enough to stand in a doorway. */
export const CAMERA_NEAR = 0.05;
/** Far plane (m). */
export const CAMERA_FAR = 50;
/** Upper bound on the device pixel ratio, for frame rate. */
export const MAX_PIXEL_RATIO = 1.5;

/** True if the browser can create a WebGL2 context. Probes a throwaway canvas. */
export function supportsWebGL2(doc: Document = document): boolean {
  try {
    const probe = doc.createElement('canvas');
    return probe.getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

/**
 * Creates the WebGL2 renderer on `canvas`.
 *
 * @throws UnsupportedError when WebGL2 is unavailable.
 */
export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  if (!supportsWebGL2(canvas.ownerDocument)) throw new UnsupportedError('webgl2');
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
  } catch {
    throw new UnsupportedError('webgl2');
  }
  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    throw new UnsupportedError('webgl2');
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  return renderer;
}

/** Creates the player camera (rotation order YXZ: yaw, then pitch). */
export function createCamera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, aspect, CAMERA_NEAR, CAMERA_FAR);
  camera.rotation.order = 'YXZ';
  return camera;
}
