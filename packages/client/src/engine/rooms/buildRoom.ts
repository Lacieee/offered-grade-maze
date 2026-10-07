/**
 * Builds a Three.js scene for one room from its `RoomDTO`, in the room's own coordinates.
 *
 * Static geometry is merged per material, so a room costs one draw call per material
 * (typically 10–15, budget 60).
 */
import {
  DOOR_HEIGHT,
  WALL_HALF,
  type DoorFrame,
  type DoorId,
  type LinkDTO,
  type RoomDTO,
  type RoomId,
} from '@ogm/shared';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Collider, SegmentCollider } from '../player/physics.js';
import { createPortalView, type PortalView } from '../portals/PortalMesh.js';
import { HANDLE_COLOR, layoutRoom, type MaterialKey, type WallLayout } from './layout.js';
import { createLightRig, type LightRig } from './lightRig.js';

/** A door as the engine sees it. */
export interface RoomDoor {
  frame: DoorFrame;
  link: LinkDTO | null;
  /** Object at the door frame origin, rotated by the frame yaw (CP03 hangs portals here). */
  anchor: THREE.Object3D;
}

/** A built room, cached by ID and reused wherever the room is shown. */
export interface RoomView {
  id: RoomId;
  dto: RoomDTO;
  /** The room in its own local coordinates. */
  scene: THREE.Scene;
  /** Collision geometry in room coordinates. */
  colliders: Collider[];
  /** Colliders closing linked doorways whose target room is not loaded. */
  portalBlocks: Map<DoorId, SegmentCollider>;
  doors: Map<DoorId, RoomDoor>;
  /** Portal meshes of the linked doors. */
  portals: Map<DoorId, PortalView>;
  lights: LightRig;
  /** Frees GPU resources (geometries and materials). */
  dispose(): void;
}

/**
 * The visible surfaces of one wall: its interior face as a single polygon with a notch per
 * door (no hidden faces, no T-junctions), plus each opening's two jambs and head, which run
 * from the face to the portal plane.
 */
export function wallGeometries(w: WallLayout, height: number): THREE.BufferGeometry[] {
  const half = w.length / 2;
  const outline: THREE.Vector2[] = [new THREE.Vector2(-half, 0)];
  for (const [l, r] of w.openings) {
    outline.push(
      new THREE.Vector2(l, 0),
      new THREE.Vector2(l, DOOR_HEIGHT),
      new THREE.Vector2(r, DOOR_HEIGHT),
      new THREE.Vector2(r, 0),
    );
  }
  outline.push(new THREE.Vector2(half, 0), new THREE.Vector2(half, height));
  outline.push(new THREE.Vector2(-half, height));
  const parts: THREE.BufferGeometry[] = [new THREE.ShapeGeometry(new THREE.Shape(outline))];

  for (const [l, r] of w.openings) {
    const left = new THREE.PlaneGeometry(WALL_HALF, DOOR_HEIGHT);
    left.rotateY(Math.PI / 2); // faces +u, into the opening
    left.translate(l, DOOR_HEIGHT / 2, -WALL_HALF / 2);
    const right = new THREE.PlaneGeometry(WALL_HALF, DOOR_HEIGHT);
    right.rotateY(-Math.PI / 2); // faces −u
    right.translate(r, DOOR_HEIGHT / 2, -WALL_HALF / 2);
    const head = new THREE.PlaneGeometry(r - l, WALL_HALF);
    head.rotateX(Math.PI / 2); // faces down
    head.translate((l + r) / 2, DOOR_HEIGHT, -WALL_HALF / 2);
    parts.push(left, right, head);
  }

  // Wall frame → room: x → right, y → up, z → inward (a proper rotation, never a mirror).
  const toRoom = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(w.right.x, 0, w.right.z),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(w.inward.x, 0, w.inward.z),
  );
  toRoom.setPosition(w.centre.x, 0, w.centre.z);
  for (const g of parts) g.applyMatrix4(toRoom);
  return parts;
}

/** Max floor/ceiling tile size (m). */
const PLANE_TILE = 0.5;

function footprintPlane(dto: RoomDTO): THREE.PlaneGeometry {
  return new THREE.PlaneGeometry(
    dto.width,
    dto.depth,
    Math.ceil(dto.width / PLANE_TILE),
    Math.ceil(dto.depth / PLANE_TILE),
  );
}

function materialFor(key: MaterialKey, dto: RoomDTO): THREE.Material {
  const color = (hex: string) => new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) });
  switch (key) {
    case 'wall':
      return color(dto.palette.wall);
    case 'floor':
      return color(dto.palette.floor);
    case 'trim':
    case 'panel':
      return color(dto.palette.trim);
    case 'handle':
      return color(HANDLE_COLOR);
    default:
      return color(key.slice('furniture:'.length));
  }
}

/** Builds the scene, colliders, doors and light rig of a room. */
export function buildRoom(dto: RoomDTO): RoomView {
  const scene = new THREE.Scene();
  scene.name = `room:${dto.id}`;
  const layout = layoutRoom(dto);

  // Group boxes by material key ('panel' shares the trim colour but stays separate so CP03
  // can tell door panels apart).
  const groups = new Map<MaterialKey, THREE.BufferGeometry[]>();
  const add = (key: MaterialKey, g: THREE.BufferGeometry): void => {
    const list = groups.get(key) ?? [];
    list.push(g);
    groups.set(key, list);
  };
  for (const b of layout.boxes) {
    const [x0, y0, z0] = b.min;
    const [x1, y1, z1] = b.max;
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    add(b.mat, g);
  }
  for (const w of layout.walls) {
    for (const g of wallGeometries(w, dto.height)) add('wall', g);
  }
  // Floor and ceiling planes covering the footprint, tessellated into ≤ 0.5 m tiles: big
  // triangles with a vertex on the camera plane (the camera passes the footprint edge at
  // every door) interpolate lighting badly on some GPUs (seen in SwiftShader).
  const floor = footprintPlane(dto);
  floor.rotateX(-Math.PI / 2);
  add('floor', floor);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const addMesh = (name: string, g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    scene.add(mesh);
    geometries.push(g);
    materials.push(m);
    return mesh;
  };

  const keys = [...groups.keys()].sort();
  for (const key of keys) {
    const parts = groups.get(key) ?? [];
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    addMesh(key, merged, materialFor(key, dto));
  }

  const ceiling = footprintPlane(dto);
  ceiling.rotateX(Math.PI / 2);
  ceiling.translate(0, dto.height, 0);
  addMesh('ceiling', ceiling, new THREE.MeshLambertMaterial({ color: dto.palette.ceiling }));

  // Doors: an anchor for every door and a portal box behind every linked doorway.
  const doors = new Map<DoorId, RoomDoor>();
  const portals = new Map<DoorId, PortalView>();
  for (const { dto: door, frame } of layout.doors) {
    const anchor = new THREE.Object3D();
    anchor.name = `door:${door.id}`;
    anchor.position.set(frame.origin.x, frame.origin.y, frame.origin.z);
    anchor.rotation.y = frame.yaw;
    anchor.updateMatrix();
    scene.add(anchor);
    doors.set(door.id, { frame, link: door.link, anchor });
    if (door.link !== null) {
      const portal = createPortalView(anchor.matrix, `portal:${door.id}`);
      scene.add(portal.mesh);
      geometries.push(portal.mesh.geometry);
      materials.push(portal.mesh.material);
      portals.set(door.id, portal);
    }
  }

  const lights = createLightRig(dto);
  scene.add(lights.hemi, ...lights.points);

  // Room meshes never move; CP03 renders them with oblique projections, where Three.js
  // frustum culling would be wrong.
  scene.traverse((o) => {
    o.frustumCulled = false;
  });

  return {
    id: dto.id,
    dto,
    scene,
    colliders: layout.colliders,
    portalBlocks: layout.portalBlocks,
    doors,
    portals,
    lights,
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      scene.clear();
    },
  };
}
