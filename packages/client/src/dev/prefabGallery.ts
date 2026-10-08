/**
 * Dev prefab gallery (CP06 T5): `/?dev=prefabs`.
 *
 * Every catalogue prefab and variant on a grid, each in two colour sets, with DOM labels.
 * F toggles footprint outlines (the collider size) to compare with the visual base.
 * Free-fly camera: click to capture the mouse, WASD to move, Q/E down/up, Shift to go faster.
 *
 * URL options: `only=<prefab id>[,<id>…]` limits the grid; `camera=x,y,z,yaw,pitch` fixes the
 * view (screenshots); `outlines=1` starts with outlines on.
 */
import { GRID, PREFABS, PREFAB_IDS, type FurnitureDTO } from '@ogm/shared';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRenderer } from '../engine/render/createRenderer.js';
import { buildPrefab } from '../engine/prefabs/index.js';

/** Second colour set (the first uses each recipe's defaults). */
const ALT_COLORS = ['#2456b8', '#e8a317', '#1f7a4a'];
/** Grid spacing (m). */
const CELL = 3.2;

declare global {
  interface Window {
    /** Set when the gallery has rendered its first frame. */
    __gallery?: { ready: boolean; items: number };
  }
}

interface Entry {
  label: HTMLDivElement;
  anchor: THREE.Vector3;
}

/** Starts the gallery on `canvas`; returns a function that stops it. */
export function startPrefabGallery(canvas: HTMLCanvasElement, host: HTMLElement): () => void {
  const params = new URLSearchParams(window.location.search);
  const only = params.get('only')?.split(',') ?? null;
  const ids = PREFAB_IDS.filter((id) => only === null || only.includes(id));

  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2b2d31');
  scene.add(new THREE.HemisphereLight('#ffffff', '#5a5040', 1.2));
  const sun = new THREE.DirectionalLight('#fff4e0', 1.6);
  sun.position.set(4, 8, 6);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 200);
  camera.rotation.order = 'YXZ';

  const disposables: { dispose(): void }[] = [];
  const outlines = new THREE.Group();
  const entries: Entry[] = [];
  const labels = document.createElement('div');
  labels.className = 'gallery-labels';
  host.appendChild(labels);

  let count = 0;
  ids.forEach((id, row) => {
    const meta = PREFABS[id];
    const hung = meta.mountY !== undefined;
    let col = 0;
    meta.footprint.forEach((fp, variant) => {
      for (const colors of [[], ALT_COLORS.slice(0, meta.colorSlots)]) {
        const x = col * CELL;
        const z = row * CELL;
        // Wall-hung items get a wall behind them (their back is at z − d/2).
        const d = fp[1] * GRID;
        const item: FurnitureDTO = {
          id: 'f00',
          prefab: id,
          x,
          z,
          rot: 0,
          variant,
          colors,
          ...(id === 'painting' || id === 'sig_painting'
            ? {
                params: {
                  pattern:
                    ['waves', 'circles', 'grid', 'checks', 'stripes'][(row + col) % 5] ?? 'waves',
                  seed: 17 + col,
                },
              }
            : {}),
        };
        addItem(scene, item, disposables);
        if (hung) {
          const wall = new THREE.Mesh(
            new THREE.BoxGeometry(fp[0] * GRID + 0.6, 2.8, 0.05),
            new THREE.MeshLambertMaterial({ color: '#d9cbb3' }),
          );
          wall.position.set(x, 1.4, z - d / 2 - 0.025);
          scene.add(wall);
          disposables.push(wall.geometry, wall.material);
        }
        outlines.add(outline(x, z, fp[0] * GRID, d, disposables));
        col++;
        count++;
      }
    });
    const label = document.createElement('div');
    label.textContent = id;
    labels.appendChild(label);
    entries.push({ label, anchor: new THREE.Vector3(-1.6, 0.05, row * CELL) });
  });
  outlines.visible = params.get('outlines') === '1';
  scene.add(outlines);

  // Floor grid for scale (1 m squares).
  const floor = new THREE.GridHelper(200, 200, '#45474d', '#38393e');
  floor.position.set(40, 0, 40);
  scene.add(floor);

  const fixed = params.get('camera')?.split(',').map(Number);
  const pose = { x: -4, y: 2.4, z: -4, yaw: Math.PI * 1.25, pitch: -0.25 };
  if (fixed?.length === 5 && fixed.every(Number.isFinite)) {
    [pose.x, pose.y, pose.z, pose.yaw, pose.pitch] = fixed as [
      number,
      number,
      number,
      number,
      number,
    ];
  }

  const keys = new Set<string>();
  const onKey = (e: KeyboardEvent): void => {
    if (e.type === 'keydown') {
      keys.add(e.code);
      if (e.code === 'KeyF' && !e.repeat) outlines.visible = !outlines.visible;
    } else keys.delete(e.code);
  };
  const onMouse = (e: MouseEvent): void => {
    if (document.pointerLockElement !== canvas) return;
    pose.yaw -= e.movementX * 0.0025;
    pose.pitch = Math.max(-1.5, Math.min(1.5, pose.pitch - e.movementY * 0.0025));
  };
  const onClick = (): void => {
    void canvas.requestPointerLock();
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('mousemove', onMouse);
  canvas.addEventListener('click', onClick);

  const resize = (): void => {
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now();
  let frame = 0;
  const v = new THREE.Vector3();
  const tick = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 12 : 4) * dt;
    const fx = -Math.sin(pose.yaw);
    const fz = -Math.cos(pose.yaw);
    if (keys.has('KeyW')) [pose.x, pose.z] = [pose.x + fx * speed, pose.z + fz * speed];
    if (keys.has('KeyS')) [pose.x, pose.z] = [pose.x - fx * speed, pose.z - fz * speed];
    if (keys.has('KeyA')) [pose.x, pose.z] = [pose.x + fz * speed, pose.z - fx * speed];
    if (keys.has('KeyD')) [pose.x, pose.z] = [pose.x - fz * speed, pose.z + fx * speed];
    if (keys.has('KeyE')) pose.y += speed;
    if (keys.has('KeyQ')) pose.y = Math.max(0.2, pose.y - speed);
    camera.position.set(pose.x, pose.y, pose.z);
    camera.rotation.set(pose.pitch, pose.yaw, 0);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    for (const e of entries) {
      v.copy(e.anchor).project(camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      e.label.style.display = visible ? 'block' : 'none';
      e.label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-100%, -50%)`;
    }
    if (++frame === 2) window.__gallery = { ready: true, items: count };
    raf = requestAnimationFrame(tick);
  };
  let raf = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKey);
    window.removeEventListener('mousemove', onMouse);
    window.removeEventListener('resize', resize);
    canvas.removeEventListener('click', onClick);
    labels.remove();
    for (const d of disposables) d.dispose();
    renderer.dispose();
    delete window.__gallery;
  };
}

/** Adds one item: merged solid and emissive meshes, one mesh per painting texture. */
function addItem(scene: THREE.Scene, item: FurnitureDTO, disposables: { dispose(): void }[]): void {
  const parts = buildPrefab(item);
  const add = (g: THREE.BufferGeometry, m: THREE.Material): void => {
    scene.add(new THREE.Mesh(g, m));
    disposables.push(g, m);
  };
  if (parts.solid.length > 0) {
    add(mergeGeometries(parts.solid, false), new THREE.MeshLambertMaterial({ vertexColors: true }));
  }
  if (parts.emissive.length > 0) {
    add(
      mergeGeometries(parts.emissive, false),
      new THREE.MeshBasicMaterial({ vertexColors: true }),
    );
  }
  for (const t of parts.textured) {
    const texture = t.makeTexture();
    disposables.push(texture);
    add(t.geometry, new THREE.MeshLambertMaterial({ map: texture, vertexColors: true }));
  }
}

/** A footprint rectangle on the floor (the collider's size). */
function outline(
  x: number,
  z: number,
  w: number,
  d: number,
  disposables: { dispose(): void }[],
): THREE.LineLoop {
  const g = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x - w / 2, 0.01, z - d / 2),
    new THREE.Vector3(x + w / 2, 0.01, z - d / 2),
    new THREE.Vector3(x + w / 2, 0.01, z + d / 2),
    new THREE.Vector3(x - w / 2, 0.01, z + d / 2),
  ]);
  const m = new THREE.LineBasicMaterial({ color: '#ff3b6b' });
  disposables.push(g, m);
  return new THREE.LineLoop(g, m);
}
