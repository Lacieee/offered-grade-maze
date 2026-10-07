/**
 * Dev/test-only portal correctness check (CP03 acceptance): the image inside a level-1
 * portal must match a direct render of the target room from T · camera with the same
 * oblique projection. Only reachable through the test hook.
 *
 * Both images are rendered with recursion depth 1 (the target room's own portals show
 * fallbacks), compared in 8-bit sRGB over the portal's pixels, excluding a 2-pixel border.
 */
import type { DoorId } from '@ogm/shared';
import * as THREE from 'three';
import type { Engine } from '../engine/Engine.js';

export interface PortalCheckResult {
  /** Mean absolute per-channel difference (0–255 scale). */
  meanDiff: number;
  /** Largest per-channel difference (0–255 scale). */
  maxDiff: number;
  /** Pixels compared (inside the portal, border excluded). */
  pixels: number;
}

const BORDER = 2;

const isMesh = (o: THREE.Object3D): o is THREE.Mesh => o instanceof THREE.Mesh;

function readLinear(
  renderer: THREE.WebGLRenderer,
  target: THREE.WebGLRenderTarget,
  w: number,
  h: number,
): Float32Array {
  const raw = new Uint16Array(w * h * 4);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, raw);
  const out = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = THREE.DataUtils.fromHalfFloat(raw[i] ?? 0);
  return out;
}

/** Linear → 8-bit sRGB, as the final screen pass would output. */
function toSrgb8(v: number): number {
  const c = Math.min(1, Math.max(0, v));
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

export function portalCheck(engine: Engine, door: DoorId): PortalCheckResult {
  const { renderer, camera, portals, room, getRoom } = engine.debugInternals();
  if (!renderer || !camera || !portals || !room) throw new Error('Engine not running');
  const link = room.doors.get(door)?.link;
  const portalView = room.portals.get(door);
  const target = link ? getRoom(link.room) : undefined;
  if (!link || !portalView || !target) throw new Error(`Door ${door} has no loaded portal`);

  const saved = portals.settings;
  portals.settings = { ...saved, maxDepth: 1, debugTint: false };
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const w = Math.round(size.x * saved.level1Scale);
  const h = Math.round(size.y * saved.level1Scale);
  if (w !== size.x || h !== size.y) throw new Error('Run the check at level-1 scale 1.0');
  const spec = { type: THREE.HalfFloatType, samples: saved.msaa ? 4 : 0 };
  const screen = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
  const direct = new THREE.WebGLRenderTarget(w, h, spec);
  const mask = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });

  try {
    // A: the normal frame (portal shows the level-1 pass).
    portals.render(room, camera, screen);
    const childCamera = portals.childCameraFor(door);
    if (!childCamera) throw new Error(`Portal ${door} is not visible from this pose`);

    // B: the target room rendered directly from T · camera with the same oblique projection.
    portals.renderSingle(target, childCamera, link.door, direct);

    // Mask: the portal mesh's visible pixels (white) in the current room (black elsewhere).
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    room.scene.traverse((o) => {
      if (isMesh(o)) {
        swapped.push([o, o.material]);
        o.material = o === portalView.mesh ? white : black;
      }
    });
    renderer.setRenderTarget(mask);
    renderer.render(room.scene, camera);
    renderer.setRenderTarget(null);
    for (const [mesh, material] of swapped) mesh.material = material;
    black.dispose();
    white.dispose();

    const a = readLinear(renderer, screen, w, h);
    const b = readLinear(renderer, direct, w, h);
    const m = readLinear(renderer, mask, w, h);
    const inside = (x: number, y: number): boolean => (m[(y * w + x) * 4] ?? 0) > 0.5;

    let sum = 0;
    let max = 0;
    let pixels = 0;
    for (let y = BORDER; y < h - BORDER; y++) {
      for (let x = BORDER; x < w - BORDER; x++) {
        let ok = true;
        for (let dy = -BORDER; dy <= BORDER && ok; dy++) {
          for (let dx = -BORDER; dx <= BORDER && ok; dx++) ok = inside(x + dx, y + dy);
        }
        if (!ok) continue;
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(toSrgb8(a[i + c] ?? 0) - toSrgb8(b[i + c] ?? 0));
          sum += d;
          max = Math.max(max, d);
        }
        pixels++;
      }
    }
    return { meanDiff: pixels > 0 ? sum / (pixels * 3) : Number.NaN, maxDiff: max, pixels };
  } finally {
    portals.settings = saved;
    screen.dispose();
    direct.dispose();
    mask.dispose();
  }
}
