/**
 * Recursive render-target portal renderer (CP03 T3).
 *
 * Per frame:
 * 1. Build a portal tree from the current room, largest screen area first, within the depth
 *    and pass budgets. Doors beyond the budget become flat-colour fallbacks.
 * 2. Render children before parents (post-order) into pooled MSAA render targets, each with
 *    an oblique near plane on its arrival door and a scissor on its screen rectangle.
 * 3. Render the current room to the screen, its portals showing the level-1 targets.
 *
 * Room scenes are cached by ID and reused for every node that shows them (self-links,
 * loops); only per-pass uniforms change.
 */
import { DOOR_HEIGHT, DOOR_WIDTH, type DoorId, type RoomId } from '@ogm/shared';
import * as THREE from 'three';
import type { RoomView } from '../rooms/buildRoom.js';
import { showFallback, showTexture } from './PortalMesh.js';
import { RenderTargetPool } from './renderTargetPool.js';
import { arrivalClipPlane, doorMatrix, obliqueProjection, portalTransform } from './portalMath.js';

/** Normalised screen rectangle; (0, 0) is the bottom-left corner (GL convention). */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Portal budget and quality settings. */
export interface PortalSettings {
  /** Deepest recursion level rendered (3; Low quality: 2). */
  maxDepth: number;
  /** Render passes per frame including the main pass (12 → at most 11 portal passes). */
  maxPasses: number;
  /** 4× MSAA on portal targets. */
  msaa: boolean;
  /** Resolution scale of level-1 targets (1.0; lower quality: 0.75). */
  level1Scale: number;
  /** `?portalDebug=1`: tint each recursion level. */
  debugTint: boolean;
}

export const DEFAULT_PORTAL_SETTINGS: PortalSettings = {
  maxDepth: 3,
  maxPasses: 12,
  msaa: true,
  level1Scale: 1,
  debugTint: false,
};

/** Resolution scale per recursion level (index = level). */
const LEVEL_SCALE = [1, 1, 0.75, 0.5, 0.5];

/** Debug tints per level: level 1 red, 2 green, 3 blue, 10 %. */
const LEVEL_TINT = [
  new THREE.Vector4(0, 0, 0, 0),
  new THREE.Vector4(1, 0, 0, 0.1),
  new THREE.Vector4(0, 1, 0, 0.1),
  new THREE.Vector4(0, 0, 1, 0.1),
];
const NO_TINT = new THREE.Vector4(0, 0, 0, 0);

/** Fallback colour factor: the target room's wall colour × 0.35. */
const FALLBACK_FACTOR = 0.35;
const MISSING_ROOM_COLOR = new THREE.Color(0x0c0c0c);

/** One node of the portal tree, as exposed to other systems (goal audio, debug view). */
export interface PortalTreeEntry {
  room: RoomId;
  level: number;
  /** Transform from the root room's coordinates to this node's room coordinates. */
  cameraFromRoot: THREE.Matrix4;
  rect: Rect;
}

interface PortalNode {
  room: RoomView;
  level: number;
  camera: THREE.PerspectiveCamera;
  cameraFromRoot: THREE.Matrix4;
  rect: Rect;
  arrival: DoorId | null;
  children: Map<DoorId, PortalNode>;
  target: THREE.WebGLRenderTarget | null;
}

interface Candidate {
  parent: PortalNode;
  door: DoorId;
  target: RoomView;
  arrival: DoorId;
  transform: THREE.Matrix4;
  rect: Rect;
  area: number;
  order: number;
}

const FULL: Rect = { x0: 0, y0: 0, x1: 1, y1: 1 };

/** Intersection of two rectangles, or null if empty. */
export function intersectRect(a: Rect, b: Rect): Rect | null {
  const r = {
    x0: Math.max(a.x0, b.x0),
    y0: Math.max(a.y0, b.y0),
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
  };
  return r.x1 > r.x0 && r.y1 > r.y0 ? r : null;
}

/** Clip-space w below which a vertex counts as behind the camera. */
const MIN_W = 1e-4;

/**
 * Screen rectangle of a door opening, clipped to `parent`; null if not visible.
 *
 * The opening quad is clipped against the plane w = MIN_W in clip space before projecting,
 * so a doorway beside or partly behind the camera gets its true (smaller) rectangle rather
 * than the whole parent rectangle. This is tighter than, and never smaller than the visible
 * part of, CP03's "any corner with w ≤ 0 → parent rectangle" rule.
 */
export function openingRect(
  doorToRoom: THREE.Matrix4,
  viewProjection: THREE.Matrix4,
  parent: Rect,
): Rect | null {
  const half = DOOR_WIDTH / 2;
  const corners = [
    [-half, 0],
    [half, 0],
    [half, DOOR_HEIGHT],
    [-half, DOOR_HEIGHT],
  ] as const;
  const clip = corners.map(([x, y]) =>
    new THREE.Vector4(x, y, 0, 1).applyMatrix4(doorToRoom).applyMatrix4(viewProjection),
  );
  // Sutherland–Hodgman against w ≥ MIN_W.
  const poly: THREE.Vector4[] = [];
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    if (!a || !b) continue;
    const aIn = a.w >= MIN_W;
    const bIn = b.w >= MIN_W;
    if (aIn) poly.push(a);
    if (aIn !== bIn) {
      const t = (MIN_W - a.w) / (b.w - a.w);
      poly.push(a.clone().lerp(b, t));
    }
  }
  if (poly.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const v of poly) {
    const sx = (v.x / v.w + 1) / 2;
    const sy = (v.y / v.w + 1) / 2;
    x0 = Math.min(x0, sx);
    y0 = Math.min(y0, sy);
    x1 = Math.max(x1, sx);
    y1 = Math.max(y1, sy);
  }
  return intersectRect({ x0, y0, x1, y1 }, parent);
}

export class PortalRenderer {
  settings: PortalSettings = { ...DEFAULT_PORTAL_SETTINGS };
  private pool: RenderTargetPool;
  private readonly cameras: THREE.PerspectiveCamera[] = [];
  private tree: PortalNode[] = [];
  private lastPasses = 1;
  private readonly bufferSize = new THREE.Vector2();
  private readonly tmpColor = new THREE.Color();
  private output: THREE.WebGLRenderTarget | null = null;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly getRoom: (id: RoomId) => RoomView | undefined,
  ) {
    this.pool = new RenderTargetPool(PortalRenderer.targetType(renderer));
  }

  /** HalfFloat targets keep linear colour precise; fall back to 8-bit if not renderable. */
  private static targetType(renderer: THREE.WebGLRenderer): THREE.TextureDataType {
    const ext = renderer.extensions;
    return ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float')
      ? THREE.HalfFloatType
      : THREE.UnsignedByteType;
  }

  /** Render passes in the last frame, including the main pass. */
  get passes(): number {
    return this.lastPasses;
  }

  /** The last frame's portal tree (root first). */
  getPortalTree(): readonly PortalTreeEntry[] {
    return this.tree.map((n) => ({
      room: n.room.id,
      level: n.level,
      cameraFromRoot: n.cameraFromRoot.clone(),
      rect: { ...n.rect },
    }));
  }

  /** Frees render targets (resize, quality change, context loss). */
  resetTargets(): void {
    this.pool.dispose();
    this.pool = new RenderTargetPool(PortalRenderer.targetType(this.renderer));
  }

  /**
   * Forgets every render target without GPU disposal (after a WebGL context loss, where the
   * old objects no longer belong to the new context).
   */
  abandonTargets(): void {
    this.pool = new RenderTargetPool(PortalRenderer.targetType(this.renderer));
  }

  dispose(): void {
    this.pool.dispose();
  }

  /**
   * Renders the current room and every visible portal to the screen (or to `output`, used
   * by the dev-only portal correctness check).
   */
  render(
    room: RoomView,
    camera: THREE.PerspectiveCamera,
    output: THREE.WebGLRenderTarget | null = null,
  ): void {
    this.output = output;
    camera.updateMatrixWorld();
    this.pool.releaseAll();
    this.renderer.getDrawingBufferSize(this.bufferSize);
    const root = this.buildTree(room, camera);
    let passes = 0;
    const renderNode = (node: PortalNode): void => {
      for (const child of node.children.values()) renderNode(child);
      this.renderPass(node);
      passes++;
    };
    renderNode(root);
    this.lastPasses = passes;
    this.output = null;
  }

  /**
   * Renders one room from `camera` into `target` exactly like a level-1 portal pass with no
   * children (all its portals show fallbacks, the arrival door's portal is hidden). Used by
   * the dev-only correctness check to compare against what a portal shows.
   */
  renderSingle(
    room: RoomView,
    camera: THREE.PerspectiveCamera,
    arrival: DoorId,
    target: THREE.WebGLRenderTarget,
  ): void {
    this.renderer.getDrawingBufferSize(this.bufferSize);
    const node: PortalNode = {
      room,
      level: 1,
      camera,
      cameraFromRoot: new THREE.Matrix4(),
      rect: FULL,
      arrival,
      children: new Map(),
      target: null,
    };
    this.renderPass(node, target);
  }

  /** The level-1 node's virtual camera for a door of the root room, from the last frame. */
  childCameraFor(door: DoorId): THREE.PerspectiveCamera | null {
    const root = this.tree[0];
    return root?.children.get(door)?.camera ?? null;
  }

  /** Builds the tree: expands the largest visible portals first within the budgets. */
  private buildTree(room: RoomView, camera: THREE.PerspectiveCamera): PortalNode {
    const root: PortalNode = {
      room,
      level: 0,
      camera,
      cameraFromRoot: new THREE.Matrix4(),
      rect: FULL,
      arrival: null,
      children: new Map(),
      target: null,
    };
    this.tree = [root];
    const heap: Candidate[] = [];
    let order = 0;
    const push = (node: PortalNode): void => {
      for (const c of this.candidates(node)) heap.push({ ...c, order: order++ });
    };
    push(root);
    let cameraIndex = 0;
    while (heap.length > 0) {
      // Largest rectangle first; ties by discovery order (stable, deterministic).
      heap.sort((a, b) => b.area - a.area || a.order - b.order);
      const c = heap.shift();
      if (!c) break;
      const level = c.parent.level + 1;
      if (level > this.settings.maxDepth || this.tree.length >= this.settings.maxPasses) continue;
      const cam = this.childCamera(
        cameraIndex++,
        c.parent.camera,
        c.transform,
        c.target,
        c.arrival,
      );
      const node: PortalNode = {
        room: c.target,
        level,
        camera: cam,
        cameraFromRoot: c.transform.clone().multiply(c.parent.cameraFromRoot),
        rect: c.rect,
        arrival: c.arrival,
        children: new Map(),
        target: null,
      };
      c.parent.children.set(c.door, node);
      this.tree.push(node);
      push(node);
    }
    return root;
  }

  /** Visible linked doors of a node, as candidate children. */
  private candidates(node: PortalNode): Omit<Candidate, 'order'>[] {
    const out: Omit<Candidate, 'order'>[] = [];
    const camPos = new THREE.Vector3().setFromMatrixPosition(node.camera.matrixWorld);
    const viewProjection = new THREE.Matrix4().multiplyMatrices(
      node.camera.projectionMatrix,
      node.camera.matrixWorldInverse,
    );
    for (const [id, door] of [...node.room.doors.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      if (!door.link || id === node.arrival) continue;
      const target = this.getRoom(door.link.room);
      const arrival = target?.doors.get(door.link.door);
      if (!target || !arrival) continue;
      const toDoor = doorMatrix(door.frame);
      // Behind the portal plane: the opening faces away from the camera.
      const local = camPos.clone().applyMatrix4(toDoor.clone().invert());
      if (local.z <= 0) continue;
      const rect = openingRect(toDoor, viewProjection, node.rect);
      if (!rect) continue;
      out.push({
        parent: node,
        door: id,
        target,
        arrival: door.link.door,
        transform: portalTransform(door.frame, arrival.frame),
        rect,
        area: (rect.x1 - rect.x0) * (rect.y1 - rect.y0),
      });
    }
    return out;
  }

  /** Virtual camera = T · parent camera, with an oblique near plane on the arrival door. */
  private childCamera(
    index: number,
    parent: THREE.PerspectiveCamera,
    transform: THREE.Matrix4,
    target: RoomView,
    arrival: DoorId,
  ): THREE.PerspectiveCamera {
    let cam = this.cameras[index];
    if (!cam) {
      cam = new THREE.PerspectiveCamera();
      cam.matrixAutoUpdate = false;
      cam.matrixWorldAutoUpdate = false;
      this.cameras[index] = cam;
    }
    cam.matrixWorld.multiplyMatrices(transform, parent.matrixWorld);
    cam.matrix.copy(cam.matrixWorld);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const frame = target.doors.get(arrival)?.frame;
    const base = this.rootProjection(parent);
    cam.projectionMatrix.copy(
      frame ? obliqueProjection(base, arrivalClipPlane(frame, cam.matrixWorldInverse)) : base,
    );
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    return cam;
  }

  /** The main camera's (non-oblique) projection, shared by every node. */
  private rootProjection(cam: THREE.PerspectiveCamera): THREE.Matrix4 {
    const root = this.tree[0]?.camera ?? cam;
    return root.projectionMatrix;
  }

  /** Renders one node: points its portals at its children, then draws the room. */
  private renderPass(node: PortalNode, into: THREE.WebGLRenderTarget | null = null): void {
    const scale = node.level === 1 ? this.settings.level1Scale : (LEVEL_SCALE[node.level] ?? 0.5);
    const width = Math.max(1, Math.round(this.bufferSize.x * scale));
    const height = Math.max(1, Math.round(this.bufferSize.y * scale));
    const viewport = node.level === 0 ? this.bufferSize : new THREE.Vector2(width, height);

    let hidden: THREE.Object3D | null = null;
    for (const [id, portal] of node.room.portals) {
      if (id === node.arrival) {
        portal.mesh.visible = false;
        hidden = portal.mesh;
        continue;
      }
      portal.mesh.visible = true;
      const child = node.children.get(id);
      if (child?.target) {
        showTexture(portal, child.target.texture, viewport);
        portal.uniforms.tint.value.copy(
          this.settings.debugTint ? (LEVEL_TINT[child.level] ?? NO_TINT) : NO_TINT,
        );
      } else {
        showFallback(portal, this.fallbackColor(node.room, id));
        portal.uniforms.tint.value.copy(NO_TINT);
      }
    }

    if (node.level === 0) {
      this.renderer.setRenderTarget(this.output);
      this.renderer.render(node.room.scene, node.camera);
      this.renderer.setRenderTarget(null);
    } else {
      const target =
        into ??
        this.pool.acquire({
          width,
          height,
          samples: this.settings.msaa ? 4 : 0,
        });
      const pad = 1;
      const sx = Math.max(0, Math.floor(node.rect.x0 * width) - pad);
      const sy = Math.max(0, Math.floor(node.rect.y0 * height) - pad);
      const ex = Math.min(width, Math.ceil(node.rect.x1 * width) + pad);
      const ey = Math.min(height, Math.ceil(node.rect.y1 * height) + pad);
      target.scissor.set(sx, sy, ex - sx, ey - sy);
      target.scissorTest = true;
      this.renderer.setRenderTarget(target);
      this.renderer.render(node.room.scene, node.camera);
      this.renderer.setRenderTarget(null);
      node.target = target;
    }
    if (hidden) hidden.visible = true;
  }

  private fallbackColor(room: RoomView, door: DoorId): THREE.Color {
    const link = room.doors.get(door)?.link;
    const target = link ? this.getRoom(link.room) : undefined;
    if (!target) return MISSING_ROOM_COLOR;
    return this.tmpColor.set(target.dto.palette.wall).multiplyScalar(FALLBACK_FACTOR);
  }
}
