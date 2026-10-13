/**
 * Builds a Three.js scene for one room from its `RoomDTO`, in the room's own coordinates.
 *
 * Static geometry is merged per material, so a room costs one draw call per material
 * (typically 10–15, budget 60). Furniture comes from the prefab recipes (CP06): one mesh for
 * all solid parts, one for glowing parts and one per painting texture.
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
import {
  DOORSTEP_COLOR,
  DOORWAY_FRAME_COLOR,
  DOOR_PANEL_COLOR,
  HANDLE_COLOR,
  layoutRoom,
  type MaterialKey,
  type WallLayout,
} from './layout.js';
import { createLightRig, type LightRig } from './lightRig.js';
import { screenMaterial, swimMaterial } from '../prefabs/animated.js';
import { buildPrefab } from '../prefabs/index.js';
import { PartsBuilder } from '../prefabs/kit.js';
import { acquireFloorTexture, releaseFloorTexture } from '../prefabs/textures/textures.js';

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

/** Wall frame → room: x → right, y → up, z → inward (a proper rotation, never a mirror). */
function wallToRoom(w: WallLayout): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(w.right.x, 0, w.right.z),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(w.inward.x, 0, w.inward.z),
  );
  return m.setPosition(w.centre.x, 0, w.centre.z);
}

/**
 * The interior face of one wall: a single polygon with a notch per door (no hidden faces,
 * no T-junctions).
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
  const face = new THREE.ShapeGeometry(new THREE.Shape(outline));
  face.applyMatrix4(wallToRoom(w));
  return [face];
}

/**
 * Door-relative flat shading for doorway parts (PD10). Doorways are unlit, so both halves of
 * a doorway (each drawn by its own room, under its own lights) look exactly alike. The shade
 * depends only on the face's direction relative to the door: top, along the wall (jamb
 * faces), into/out of the room, or bottom.
 */
export function doorwayShade(along: number, up: number, inward: number): number {
  if (up > 0.5) return 1;
  if (up < -0.5) return 0.62;
  if (Math.abs(along) > Math.abs(inward)) return 0.8;
  return 0.92;
}

/** Adds a per-vertex colour attribute: `color` × the door-relative shade of each face. */
function paintDoorway(
  g: THREE.BufferGeometry,
  color: THREE.Color,
  axes: (n: THREE.Vector3) => [number, number, number],
): void {
  const normal = g.getAttribute('normal');
  const colors = new Float32Array(normal.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < normal.count; i++) {
    n.fromBufferAttribute(normal, i);
    const k = doorwayShade(...axes(n));
    colors[i * 3] = color.r * k;
    colors[i * 3 + 1] = color.g * k;
    colors[i * 3 + 2] = color.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** The tunnel of each opening: two jambs and a head, from the wall face to the portal plane. */
export function doorwayGeometries(w: WallLayout): THREE.BufferGeometry[] {
  const frame = new THREE.Color(DOORWAY_FRAME_COLOR);
  const parts: THREE.BufferGeometry[] = [];
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
  const toRoom = wallToRoom(w);
  for (const g of parts) {
    // Shade in the wall frame (x along the wall, z inward), then place in the room.
    paintDoorway(g, frame, (n) => [n.x, n.y, n.z]);
    g.applyMatrix4(toRoom);
  }
  return parts;
}

/** Colour of the placeholder goal box (CP08). */
export const GOAL_PLACEHOLDER_COLOR = '#ffcf6b';

/** Self-light of the ceiling, as a fraction of its palette colour. */
export const CEILING_GLOW = 0.35;

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

function materialFor(key: MaterialKey, dto: RoomDTO, floorMap: THREE.Texture): THREE.Material {
  const color = (hex: string) => new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) });
  switch (key) {
    case 'wall':
      return color(dto.palette.wall);
    case 'floor':
      // The procedural floor texture is tinted with the palette colour already (CP06 T3).
      return new THREE.MeshLambertMaterial({ map: floorMap });
    case 'doorframe':
    case 'doorstep':
      // Unlit, with door-relative shading baked into vertex colours (PD10).
      return new THREE.MeshBasicMaterial({ vertexColors: true });
    case 'panel':
      return color(DOOR_PANEL_COLOR);
    case 'handle':
      return color(HANDLE_COLOR);
  }
}

/** Floor UVs in metres, so a texture with one repeat per metre tiles at the right scale. */
function metreUvs(g: THREE.BufferGeometry, width: number, depth: number): void {
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width, uv.getY(i) * depth);
  uv.needsUpdate = true;
}

/** Furniture of a room merged by material kind (CP06 T2). */
interface FurnitureMeshes {
  solid: THREE.BufferGeometry | null;
  emissive: THREE.BufferGeometry | null;
  /** One merged geometry per painting texture. */
  textured: { key: string; geometry: THREE.BufferGeometry; texture: THREE.Texture }[];
  /** Swimming fish and TV screens (animated on the GPU). */
  swim: THREE.BufferGeometry | null;
  screen: THREE.BufferGeometry | null;
}

function furnitureMeshes(dto: RoomDTO): FurnitureMeshes {
  const solid: THREE.BufferGeometry[] = [];
  const emissive: THREE.BufferGeometry[] = [];
  const swim: THREE.BufferGeometry[] = [];
  const screen: THREE.BufferGeometry[] = [];
  const textured = new Map<string, { parts: THREE.BufferGeometry[]; make: () => THREE.Texture }>();
  // Ceiling lights get a glowing fixture, so the bright patch on the ceiling reads as a lamp.
  const fixtures = new PartsBuilder();
  for (const light of dto.lights) {
    if (light.kind !== 'ceiling') continue;
    fixtures.cylinder(
      'solid',
      '#d8d4cc',
      0.05,
      0.05,
      dto.height - light.y - 0.08,
      light.x,
      light.y + 0.08,
      light.z,
      8,
    );
    fixtures.cylinder('emissive', '#fff6e0', 0.3, 0.22, 0.1, light.x, light.y, light.z, 16);
  }
  // Placeholder goal (CP08 T5; the diploma arrives in CP09): a glowing box at `goal`.
  if (dto.goal) {
    const g = dto.goal;
    fixtures.box('emissive', GOAL_PLACEHOLDER_COLOR, 0.32, 0.32, 0.32, g.x, g.y - 0.16, g.z);
  }
  solid.push(...fixtures.parts.solid);
  emissive.push(...fixtures.parts.emissive);
  for (const item of dto.furniture) {
    const parts = buildPrefab(item);
    solid.push(...parts.solid);
    emissive.push(...parts.emissive);
    swim.push(...parts.swim);
    screen.push(...parts.screen);
    for (const t of parts.textured) {
      const entry = textured.get(t.key) ?? { parts: [], make: t.makeTexture };
      entry.parts.push(t.geometry);
      textured.set(t.key, entry);
    }
  }
  const merge = (list: THREE.BufferGeometry[]): THREE.BufferGeometry | null => {
    if (list.length === 0) return null;
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    return merged;
  };
  return {
    solid: merge(solid),
    emissive: merge(emissive),
    swim: merge(swim),
    screen: merge(screen),
    textured: [...textured.entries()]
      .sort((x, y) => (x[0] < y[0] ? -1 : 1))
      .flatMap(([key, entry]) => {
        const geometry = merge(entry.parts);
        return geometry === null ? [] : [{ key, geometry, texture: entry.make() }];
      }),
  };
}

/** Builds the scene, colliders, doors and light rig of a room. */
export function buildRoom(dto: RoomDTO): RoomView {
  const scene = new THREE.Scene();
  scene.name = `room:${dto.id}`;
  const layout = layoutRoom(dto);

  // Group geometry by material key; each group becomes one merged mesh (one draw call).
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
    if (b.mat === 'doorframe' || b.mat === 'doorstep') {
      const base = new THREE.Color(b.mat === 'doorstep' ? DOORSTEP_COLOR : DOORWAY_FRAME_COLOR);
      // Box normals are axis-aligned; map them to (along the wall, up, inward).
      paintDoorway(g, base, (n) => (b.along === 'z' ? [n.z, n.y, n.x] : [n.x, n.y, n.z]));
    }
    add(b.mat, g);
  }
  for (const w of layout.walls) {
    for (const g of wallGeometries(w, dto.height)) add('wall', g);
    for (const g of doorwayGeometries(w)) add('doorframe', g);
  }
  // Floor and ceiling planes covering the footprint, tessellated into ≤ 0.5 m tiles: big
  // triangles with a vertex on the camera plane (the camera passes the footprint edge at
  // every door) interpolate lighting badly on some GPUs (seen in SwiftShader).
  const floor = footprintPlane(dto);
  metreUvs(floor, dto.width, dto.depth);
  floor.rotateX(-Math.PI / 2);
  add('floor', floor);
  const floorMap = acquireFloorTexture(dto.floor, dto.palette.floor);

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
    addMesh(key, merged, materialFor(key, dto, floorMap));
  }

  // Furniture: all solid parts in one mesh, all glowing parts in one, one mesh per painting,
  // one for swimming fish and one for TV screens.
  const textures: THREE.Texture[] = [];
  const furniture = furnitureMeshes(dto);
  if (furniture.solid) {
    addMesh('furniture', furniture.solid, new THREE.MeshLambertMaterial({ vertexColors: true }));
  }
  if (furniture.emissive) {
    addMesh(
      'furniture:emissive',
      furniture.emissive,
      new THREE.MeshBasicMaterial({ vertexColors: true }),
    );
  }
  if (furniture.swim) addMesh('furniture:swim', furniture.swim, swimMaterial());
  if (furniture.screen) addMesh('furniture:screen', furniture.screen, screenMaterial());
  for (const t of furniture.textured) {
    textures.push(t.texture);
    addMesh(
      `furniture:${t.key}`,
      t.geometry,
      new THREE.MeshLambertMaterial({ map: t.texture, vertexColors: true }),
    );
  }

  const ceiling = footprintPlane(dto);
  ceiling.rotateX(Math.PI / 2);
  ceiling.translate(0, dto.height, 0);
  // The ceiling faces down, so the hemisphere light gives it the floor's (dark) colour; a
  // little self-light keeps it reading as a pale ceiling (CP06 visual pass).
  addMesh(
    'ceiling',
    ceiling,
    new THREE.MeshLambertMaterial({
      color: dto.palette.ceiling,
      emissive: new THREE.Color(dto.palette.ceiling).multiplyScalar(CEILING_GLOW),
    }),
  );

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
      for (const t of textures) t.dispose();
      releaseFloorTexture(floorMap);
      scene.clear();
    },
  };
}
